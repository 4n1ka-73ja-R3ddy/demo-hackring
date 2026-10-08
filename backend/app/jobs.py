"""In-memory job store with one background worker. A failing job records its error; the service keeps running."""

from __future__ import annotations

import json
import logging
import shutil
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .analysis import analyze
from .classifier import ModelUnavailable
from .video import InvalidVideo

log = logging.getLogger("cutwise.jobs")


@dataclass
class Job:
    video_id: str
    file_name: str
    path: str
    dir: str
    status: str = "queued"  # queued | processing | done | error
    stage: str = "Queued"
    progress: float = 0.0
    error: str | None = None
    result: dict | None = None
    confirmed_category: str | None = None
    category_source: str | None = None  # "ai" | "manual"
    created_at: float = field(default_factory=time.time)

    def public(self) -> dict:
        d = asdict(self)
        d.pop("path")
        d.pop("dir")
        return d


class JobStore:
    def __init__(self, root: Path, ttl_hours: float = 6) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl_hours * 3600
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="analysis")

    def create(self, video_id: str, file_name: str, path: Path) -> Job:
        job = Job(video_id=video_id, file_name=file_name, path=str(path), dir=str(path.parent))
        with self._lock:
            self._jobs[video_id] = job
        self._save(job)
        self._pool.submit(self._run, video_id)
        return job

    def get(self, video_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(video_id)

    def update(self, video_id: str, **kw) -> None:
        with self._lock:
            job = self._jobs[video_id]
            for k, v in kw.items():
                setattr(job, k, v)
        self._save(job)

    def delete(self, video_id: str) -> bool:
        with self._lock:
            job = self._jobs.pop(video_id, None)
        if job:
            shutil.rmtree(job.dir, ignore_errors=True)
        return job is not None

    def _save(self, job: Job) -> None:
        try:
            (Path(job.dir) / "job.json").write_text(json.dumps(job.public(), indent=2))
        except OSError:
            pass

    def _run(self, video_id: str) -> None:
        job = self.get(video_id)
        if not job:
            return
        self.update(video_id, status="processing", stage="Starting", progress=0.01)
        try:
            result = analyze(
                video_id,
                Path(job.path),
                Path(job.dir),
                job.file_name,
                progress=lambda stage, p: self.update(video_id, stage=stage, progress=round(p, 3)),
            )
            self.update(video_id, status="done", stage="Done", progress=1.0, result=result)
        except (InvalidVideo, ModelUnavailable) as e:
            self.update(video_id, status="error", stage="Failed", error=str(e))
        except Exception as e:  # never let one bad file take the service down
            log.error("Analysis failed for %s\n%s", video_id, traceback.format_exc())
            self.update(video_id, status="error", stage="Failed", error=f"Analysis failed: {type(e).__name__}: {e}")

    def cleanup(self) -> None:
        """Remove temporary uploads older than the TTL."""
        now = time.time()
        for d in self.root.iterdir():
            if d.is_dir() and now - d.stat().st_mtime > self.ttl:
                shutil.rmtree(d, ignore_errors=True)
                with self._lock:
                    self._jobs.pop(d.name, None)
