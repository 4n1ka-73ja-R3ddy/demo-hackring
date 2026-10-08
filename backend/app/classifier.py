"""Zero-shot frame classification with CLIP, run through ONNX Runtime (CPU, no PyTorch).

Default model: Xenova/clip-vit-base-patch32 (quantized ONNX export of OpenAI's
CLIP ViT-B/32, about 150 MB), downloaded once from Hugging Face and cached.

Environment:
  CUTWISE_MODEL_DIR      use a local folder instead of downloading
  CUTWISE_MODEL_REPO     Hugging Face repo id (default Xenova/clip-vit-base-patch32)
  CUTWISE_MODEL_VARIANT  "quantized" (default) or "fp32"
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

import numpy as np
from PIL import Image

DEFAULT_REPO = "Xenova/clip-vit-base-patch32"
CLIP_LOGIT_SCALE = 100.0  # CLIP's learned temperature


class ModelUnavailable(Exception):
    pass


class ZeroShotClassifier:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self._text_cache: dict[str, np.ndarray] = {}
        self.name = ""

    # ---------- loading ----------
    def _resolve_dir(self) -> Path:
        local = os.environ.get("CUTWISE_MODEL_DIR")
        if local:
            p = Path(local)
            if not p.is_dir():
                raise ModelUnavailable(f"CUTWISE_MODEL_DIR={local} is not a folder.")
            return p
        repo = os.environ.get("CUTWISE_MODEL_REPO", DEFAULT_REPO)
        try:
            from huggingface_hub import snapshot_download

            return Path(
                snapshot_download(
                    repo_id=repo,
                    allow_patterns=[f"onnx/{self._file('vision_model')}", f"onnx/{self._file('text_model')}", "tokenizer.json", "preprocessor_config.json"],
                )
            )
        except Exception as e:  # network, auth, missing repo
            raise ModelUnavailable(f"Could not download the model {repo}: {e}") from e

    @staticmethod
    def _file(stem: str) -> str:
        variant = os.environ.get("CUTWISE_MODEL_VARIANT", "quantized")
        return f"{stem}_quantized.onnx" if variant == "quantized" else f"{stem}.onnx"

    def load(self) -> None:
        with self._lock:
            if self._loaded:
                return
            import onnxruntime as ort
            from tokenizers import Tokenizer

            d = self._resolve_dir()
            vision, text = d / "onnx" / self._file("vision_model"), d / "onnx" / self._file("text_model")
            for f in (vision, text, d / "tokenizer.json"):
                if not f.exists():
                    raise ModelUnavailable(f"Model file missing: {f}")
            opts = ort.SessionOptions()
            opts.log_severity_level = 3
            try:
                self.vision = ort.InferenceSession(str(vision), opts, providers=["CPUExecutionProvider"])
                self.text = ort.InferenceSession(str(text), opts, providers=["CPUExecutionProvider"])
                self.tokenizer = Tokenizer.from_file(str(d / "tokenizer.json"))
            except Exception as e:
                raise ModelUnavailable(f"Could not load the model from {d}: {e}") from e

            cfg = {}
            if (d / "preprocessor_config.json").exists():
                cfg = json.loads((d / "preprocessor_config.json").read_text())
            self.mean = np.array(cfg.get("image_mean", [0.48145466, 0.4578275, 0.40821073]), dtype=np.float32)
            self.std = np.array(cfg.get("image_std", [0.26862954, 0.26130258, 0.27577711]), dtype=np.float32)
            crop = cfg.get("crop_size", 224)
            self.crop = crop.get("height", 224) if isinstance(crop, dict) else int(crop)
            self.name = os.environ.get("CUTWISE_MODEL_DIR") or os.environ.get("CUTWISE_MODEL_REPO", DEFAULT_REPO)
            self._loaded = True

    # ---------- inference ----------
    @staticmethod
    def _pick_output(session, outputs, preferred: str) -> np.ndarray:
        names = [o.name for o in session.get_outputs()]
        if preferred in names:
            return outputs[names.index(preferred)]
        for arr in outputs:  # first 2-D output is the projected embedding
            if arr.ndim == 2:
                return arr
        raise ModelUnavailable(f"Model has no {preferred} output (outputs: {names}).")

    def _preprocess(self, rgb: np.ndarray) -> np.ndarray:
        img = Image.fromarray(rgb)
        w, h = img.size
        s = self.crop / min(w, h)
        img = img.resize((max(self.crop, round(w * s)), max(self.crop, round(h * s))), Image.BICUBIC)
        w, h = img.size
        left, top = (w - self.crop) // 2, (h - self.crop) // 2
        img = img.crop((left, top, left + self.crop, top + self.crop))
        arr = (np.asarray(img, dtype=np.float32) / 255.0 - self.mean) / self.std
        return arr.transpose(2, 0, 1)

    def embed_images(self, frames: list[np.ndarray], batch: int = 16) -> np.ndarray:
        self.load()
        input_name = self.vision.get_inputs()[0].name
        out = []
        for i in range(0, len(frames), batch):
            x = np.stack([self._preprocess(f) for f in frames[i : i + batch]]).astype(np.float32)
            res = self.vision.run(None, {input_name: x})
            out.append(self._pick_output(self.vision, res, "image_embeds"))
        emb = np.concatenate(out).astype(np.float32)
        return emb / np.linalg.norm(emb, axis=1, keepdims=True).clip(1e-8)

    def embed_texts(self, prompts: list[str]) -> np.ndarray:
        self.load()
        missing = [p for p in prompts if p not in self._text_cache]
        inputs = {i.name for i in self.text.get_inputs()}
        for p in missing:
            ids = self.tokenizer.encode(p).ids[:77]
            feed = {"input_ids": np.array([ids], dtype=np.int64)}
            if "attention_mask" in inputs:
                feed["attention_mask"] = np.ones((1, len(ids)), dtype=np.int64)
            res = self.text.run(None, feed)
            e = self._pick_output(self.text, res, "text_embeds")[0]
            self._text_cache[p] = e / max(np.linalg.norm(e), 1e-8)
        return np.stack([self._text_cache[p] for p in prompts]).astype(np.float32)

    def similarity(self, image_emb: np.ndarray, prompts: list[str]) -> np.ndarray:
        """(n_images, n_prompts) logits, CLIP-scaled."""
        return CLIP_LOGIT_SCALE * image_emb @ self.embed_texts(prompts).T


classifier = ZeroShotClassifier()
