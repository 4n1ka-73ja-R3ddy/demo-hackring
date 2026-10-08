"""Video validation, frame sampling and scene detection (OpenCV only, no system FFmpeg needed)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

SUPPORTED_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"}


class InvalidVideo(Exception):
    """The file is not a video we can decode."""


@dataclass
class VideoInfo:
    duration: float
    fps: float
    frame_count: int
    width: int
    height: int


@dataclass
class Scene:
    index: int
    start: float
    end: float
    brightness: float
    contrast: float  # std of luminance; near 0 for blank frames
    keyframe: np.ndarray | None = None  # RGB, filled in by extract_keyframes


@dataclass
class SampledVideo:
    info: VideoInfo
    frames: list[tuple[float, np.ndarray]]  # (time, RGB frame) for classification
    scenes: list[Scene] = field(default_factory=list)


def sniff_container(path: Path) -> str | None:
    """Look at the file's first bytes, so a renamed .txt or .jpg is rejected."""
    with open(path, "rb") as f:
        head = f.read(64)
    if len(head) < 12:
        return None
    if head[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip"):
        return "mp4/mov"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "mkv/webm"
    if head[:4] == b"RIFF" and head[8:11] == b"AVI":
        return "avi"
    return None


def probe(path: Path) -> VideoInfo:
    """Validate that the file really is a decodable video and read its basic properties."""
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise InvalidVideo(f"Unsupported file type {path.suffix or '(none)'}. Use {', '.join(sorted(SUPPORTED_EXTENSIONS))}.")
    container = sniff_container(path)
    if container is None:
        raise InvalidVideo("The file content is not a recognised video container (MP4, MOV, MKV, WebM or AVI).")

    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise InvalidVideo("The video could not be opened. It may be corrupt or use an unsupported codec.")
        ok, frame = cap.read()
        if not ok or frame is None:
            raise InvalidVideo("No video frames could be decoded. The file may be audio-only, corrupt or use an unsupported codec.")
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        height, width = frame.shape[:2]
    finally:
        cap.release()

    if fps <= 0 or fps > 1000:
        fps = 25.0
    if count <= 0:
        count = _count_frames(path)
    duration = count / fps
    if duration <= 0.2:
        raise InvalidVideo("The video is too short to analyse.")
    return VideoInfo(duration=duration, fps=fps, frame_count=count, width=width, height=height)


def _count_frames(path: Path) -> int:
    cap = cv2.VideoCapture(str(path))
    n = 0
    while cap.grab():
        n += 1
    cap.release()
    return n


def _small_hist(frame_bgr: np.ndarray) -> np.ndarray:
    small = cv2.resize(frame_bgr, (64, 36), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [8, 4, 4], [0, 180, 0, 256, 0, 256])
    return cv2.normalize(hist, hist).flatten()


def _to_rgb(frame_bgr: np.ndarray, short_side: int = 256) -> np.ndarray:
    h, w = frame_bgr.shape[:2]
    scale = short_side / min(h, w)
    if scale < 1:
        frame_bgr = cv2.resize(frame_bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)


def sample(
    path: Path,
    info: VideoInfo,
    n_classify: int,
    progress: Callable[[float], None] = lambda p: None,
    cut_threshold: float = 0.35,
    min_scene: float = 2.0,
    max_scenes: int = 40,
) -> SampledVideo:
    """One sequential pass: evenly spaced frames for classification, plus a dense
    colour-histogram track used to find scene cuts."""
    dense_step = max(0.5, info.duration / 1500)  # at most ~1500 histogram samples
    margin = min(1.0, info.duration * 0.02)
    span = max(info.duration - 2 * margin, 0.1)
    classify_times = [margin + span * (i + 0.5) / n_classify for i in range(n_classify)]

    cap = cv2.VideoCapture(str(path))
    frames: list[tuple[float, np.ndarray]] = []
    hists: list[tuple[float, np.ndarray, tuple[float, float]]] = []
    next_dense = 0.0
    ci = 0
    idx = 0
    try:
        while True:
            if not cap.grab():
                break
            t = idx / info.fps
            idx += 1
            need_dense = t >= next_dense
            need_classify = ci < len(classify_times) and t >= classify_times[ci]
            if not (need_dense or need_classify):
                continue
            ok, frame = cap.retrieve()
            if not ok or frame is None:
                continue
            if need_dense:
                gray = cv2.cvtColor(cv2.resize(frame, (64, 36)), cv2.COLOR_BGR2GRAY)
                hists.append((t, _small_hist(frame), (float(gray.mean()), float(gray.std()))))
                next_dense += dense_step
            while ci < len(classify_times) and t >= classify_times[ci]:
                frames.append((t, _to_rgb(frame)))
                ci += 1
            if idx % 200 == 0:
                progress(min(1.0, t / info.duration))
    finally:
        cap.release()

    if not frames:
        raise InvalidVideo("Frames could not be read from the video.")
    progress(1.0)
    return SampledVideo(info=info, frames=frames, scenes=_scenes(hists, info.duration, cut_threshold, min_scene, max_scenes))


def _scenes(hists: list[tuple[float, np.ndarray, tuple[float, float]]], duration: float, threshold: float, min_scene: float, max_scenes: int) -> list[Scene]:
    if not hists:
        return [Scene(0, 0.0, duration, 128.0, 50.0)]
    cuts = [0.0]
    for (t0, h0, _), (t1, h1, _) in zip(hists, hists[1:]):
        dist = cv2.compareHist(h0, h1, cv2.HISTCMP_BHATTACHARYYA)
        if dist > threshold and t1 - cuts[-1] >= min_scene:
            cuts.append(t1)
    bounds = [[a, b] for a, b in zip(cuts, cuts[1:] + [duration])]
    # Merge very short tails and cap the number of scenes by merging the shortest.
    if len(bounds) > 1 and bounds[-1][1] - bounds[-1][0] < min_scene:
        bounds[-2][1] = bounds[-1][1]
        bounds.pop()
    while len(bounds) > max_scenes:
        length = lambda k: bounds[k][1] - bounds[k][0]  # noqa: E731
        i = min(range(len(bounds)), key=length)
        if i == 0:
            j = 1
        elif i == len(bounds) - 1:
            j = i - 1
        else:
            j = i - 1 if length(i - 1) < length(i + 1) else i + 1
        a, b = sorted((i, j))
        bounds[a] = [bounds[a][0], bounds[b][1]]
        bounds.pop(b)
    scenes = []
    for k, (a, b) in enumerate(bounds):
        vals = [g for t, _, g in hists if a <= t < b] or [(128.0, 50.0)]
        scenes.append(Scene(index=k, start=round(a, 2), end=round(b, 2), brightness=float(np.mean([v[0] for v in vals])), contrast=float(np.mean([v[1] for v in vals]))))
    return scenes


def extract_keyframes(path: Path, scenes: list[Scene]) -> None:
    """Seek to the middle of each scene and keep that frame."""
    cap = cv2.VideoCapture(str(path))
    try:
        for s in scenes:
            cap.set(cv2.CAP_PROP_POS_MSEC, (s.start + s.end) / 2 * 1000)
            ok, frame = cap.read()
            if ok and frame is not None:
                s.keyframe = _to_rgb(frame)
    finally:
        cap.release()


def save_jpeg(rgb: np.ndarray, path: Path, width: int = 320) -> None:
    h, w = rgb.shape[:2]
    scale = width / w
    img = cv2.resize(rgb, (width, max(1, round(h * scale))), interpolation=cv2.INTER_AREA) if scale < 1 else rgb
    cv2.imwrite(str(path), cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])
