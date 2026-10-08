"""Category prediction for one uploaded video. Every number here comes from the video's own frames."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

import numpy as np

from .categories import CATEGORIES, OTHER, label
from .classifier import classifier
from .video import extract_keyframes, probe, sample, save_jpeg

# Below this average probability no category is a clear match, so we say "Other".
OTHER_THRESHOLD = float(os.environ.get("CUTWISE_OTHER_THRESHOLD", "0.22"))
DUPLICATE_SIMILARITY = 0.95
# A scene is "dark or blank" when it is both dark and nearly featureless (a fade, a lens cap).
DARK_BRIGHTNESS = 20.0
BLANK_CONTRAST = 10.0

CAT_IDS = list(CATEGORIES)
PROMPTS = [(c, p) for c in CAT_IDS for p in CATEGORIES[c]["prompts"]]


def _tc(sec: float) -> str:
    s = int(round(sec))
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


def _category_probs(logits: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-image probabilities over categories, and the best-matching prompt index per category.

    A category's score for an image is its best prompt's logit; softmax over categories.
    """
    n = len(CAT_IDS)
    per_cat = np.full((logits.shape[0], n), -np.inf, dtype=np.float32)
    best_prompt = np.zeros((logits.shape[0], n), dtype=np.int64)
    for j, (cat, _) in enumerate(PROMPTS):
        k = CAT_IDS.index(cat)
        better = logits[:, j] > per_cat[:, k]
        per_cat[better, k] = logits[better, j]
        best_prompt[better, k] = j
    z = per_cat - per_cat.max(axis=1, keepdims=True)
    p = np.exp(z)
    return p / p.sum(axis=1, keepdims=True), best_prompt


def analyze(video_id: str, path: Path, out_dir: Path, file_name: str, progress: Callable[[str, float], None]) -> dict:
    progress("Reading video", 0.02)
    info = probe(path)

    n_classify = int(np.clip(info.duration / 8, 12, 32))
    sampled = sample(path, info, n_classify, progress=lambda f: progress("Extracting frames", 0.05 + 0.55 * f))

    progress("Loading model", 0.62)
    classifier.load()

    progress("Classifying frames", 0.7)
    times = [t for t, _ in sampled.frames]
    emb = classifier.embed_images([f for _, f in sampled.frames])
    probs, best_prompt = _category_probs(classifier.similarity(emb, [p for _, p in PROMPTS]))
    dist = probs.mean(axis=0)
    order = np.argsort(-dist)
    top = int(order[0])

    # Evidence: the frames that most strongly support the top category.
    votes = probs.argmax(axis=1)
    agree = int((votes == top).sum())
    ev_idx = np.argsort(-probs[:, top])[:3]
    evidence = []
    for rank, i in enumerate(ev_idx):
        name = f"evidence_{rank}.jpg"
        save_jpeg(sampled.frames[i][1], out_dir / name)
        evidence.append({
            "time": round(times[i], 2),
            "frame_url": f"/api/videos/{video_id}/frames/{name}",
            "category": CAT_IDS[top],
            "score": round(float(probs[i, top]), 3),
            "matched": PROMPTS[int(best_prompt[i, top])][1],
        })

    runner = int(order[1])
    if dist[top] < OTHER_THRESHOLD:
        predicted, confidence = OTHER["id"], float(1 - dist[top])
        reason = (
            f"No category clearly matched the {len(times)} sampled frames. The closest was "
            f"{label(CAT_IDS[top])} at {dist[top]:.0%}, then {label(CAT_IDS[runner])} at {dist[runner]:.0%}."
        )
    else:
        predicted, confidence = CAT_IDS[top], float(dist[top])
        strongest = evidence[0]
        reason = (
            f"{agree} of {len(times)} sampled frames look most like {label(predicted)}. "
            f"Strongest match at {_tc(strongest['time'])}: \"{strongest['matched']}\". "
            f"Runner-up: {label(CAT_IDS[runner])} at {dist[runner]:.0%}."
        )

    # Scenes: keyframe per scene, its own category scores, dark and near-duplicate flags.
    progress("Analysing scenes", 0.85)
    scenes = sampled.scenes
    extract_keyframes(path, scenes)
    with_frames = [s for s in scenes if s.keyframe is not None]
    scene_out = []
    if with_frames:
        s_emb = classifier.embed_images([s.keyframe for s in with_frames])
        s_probs, _ = _category_probs(classifier.similarity(s_emb, [p for _, p in PROMPTS]))
        kept: list[int] = []
        for k, s in enumerate(with_frames):
            name = f"scene_{s.index:03d}.jpg"
            save_jpeg(s.keyframe, out_dir / name)
            dup_of = None
            for j in kept:
                if float(s_emb[k] @ s_emb[j]) >= DUPLICATE_SIMILARITY:
                    dup_of = with_frames[j].index
                    break
            if dup_of is None:
                kept.append(k)
            scene_out.append({
                "index": s.index,
                "start": s.start,
                "end": s.end,
                "keyframe_url": f"/api/videos/{video_id}/frames/{name}",
                "scores": {c: round(float(s_probs[k, i]), 4) for i, c in enumerate(CAT_IDS)},
                "dark": s.brightness < DARK_BRIGHTNESS and s.contrast < BLANK_CONTRAST,
                "duplicate_of": dup_of,
            })

    progress("Done", 1.0)
    return {
        "video_id": video_id,
        "predicted_category": predicted,
        "predicted_label": label(predicted),
        "confidence": round(confidence, 3),
        "reason": reason,
        "alternatives": [{"category": CAT_IDS[i], "label": label(CAT_IDS[i]), "confidence": round(float(dist[i]), 3)} for i in order[:4]],
        "evidence": evidence,
        "scenes": scene_out,
        "metadata": {
            "file_name": file_name,
            "duration": round(info.duration, 2),
            "fps": round(info.fps, 2),
            "width": info.width,
            "height": info.height,
            "frames_analyzed": len(times),
            "model": classifier.name,
        },
    }
