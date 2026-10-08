"""Cutwise analysis API.

Run:  uvicorn app.main:app --reload --port 8000   (from the backend folder)
"""


import logging
import os
import re
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .categories import ALL_CATEGORY_IDS, label
from .jobs import JobStore
from .video import SUPPORTED_EXTENSIONS, InvalidVideo, probe

# Load API keys and settings from backend/.env (never committed).
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # python-dotenv not installed; fall back to real env vars
    pass

logging.basicConfig(level=logging.INFO)

UPLOAD_ROOT = Path(os.environ.get("CUTWISE_UPLOAD_DIR", Path(tempfile.gettempdir()) / "cutwise_uploads"))
MAX_UPLOAD_MB = int(os.environ.get("CUTWISE_MAX_UPLOAD_MB", "2048"))

app = FastAPI(title="Cutwise analysis API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CUTWISE_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
jobs = JobStore(UPLOAD_ROOT)
jobs.cleanup()

ID_RE = re.compile(r"^[a-f0-9]{32}$")
FRAME_RE = re.compile(r"^[a-z0-9_]+\.jpg$")


def _job_or_404(video_id: str):
    job = jobs.get(video_id) if ID_RE.match(video_id) else None
    if not job:
        raise HTTPException(404, "No analysis job with that id.")
    return job


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/categories")
def categories():
    return [{"id": c, "label": label(c)} for c in ALL_CATEGORY_IDS]


@app.post("/api/videos", status_code=202)
async def upload(file: UploadFile = File(...)):
    name = Path(file.filename or "upload").name
    ext = Path(name).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(415, f"Unsupported file type {ext or '(none)'}. Upload {', '.join(sorted(SUPPORTED_EXTENSIONS))}.")
    if file.content_type and not (file.content_type.startswith("video/") or file.content_type == "application/octet-stream"):
        raise HTTPException(415, f"Expected a video, got {file.content_type}.")

    jobs.cleanup()
    video_id = uuid.uuid4().hex
    job_dir = UPLOAD_ROOT / video_id
    job_dir.mkdir(parents=True)
    dest = job_dir / f"source{ext}"
    size = 0
    try:
        with open(dest, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_MB * 1024 * 1024:
                    raise HTTPException(413, f"File is larger than {MAX_UPLOAD_MB} MB.")
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "The uploaded file is empty.")
        probe(dest)  # reject non-videos before queueing any work
    except InvalidVideo as e:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(415, str(e))
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    finally:
        await file.close()

    job = jobs.create(video_id, name, dest)
    return {"video_id": job.video_id, "status": job.status}


@app.get("/api/videos/{video_id}")
def status(video_id: str):
    return _job_or_404(video_id).public()


@app.get("/api/videos/{video_id}/frames/{frame}")
def frame(video_id: str, frame: str):
    job = _job_or_404(video_id)
    if not FRAME_RE.match(frame):
        raise HTTPException(400, "Bad frame name.")
    p = Path(job.dir) / frame
    if not p.exists():
        raise HTTPException(404, "Frame not found.")
    return FileResponse(p, media_type="image/jpeg")


class CategoryChoice(BaseModel):
    category: str
    source: str  # "ai" when the creator accepted the suggestion, "manual" when they chose


@app.post("/api/videos/{video_id}/category")
def confirm_category(video_id: str, choice: CategoryChoice):
    job = _job_or_404(video_id)
    if job.status != "done":
        raise HTTPException(409, "Analysis has not finished for this video.")
    if choice.category not in ALL_CATEGORY_IDS:
        raise HTTPException(422, f"Unknown category {choice.category}.")
    if choice.source not in ("ai", "manual"):
        raise HTTPException(422, "source must be 'ai' or 'manual'.")
    if choice.source == "ai" and choice.category != job.result["predicted_category"]:
        raise HTTPException(422, "An accepted AI suggestion must match the predicted category.")
    jobs.update(video_id, confirmed_category=choice.category, category_source=choice.source)
    return jobs.get(video_id).public()


@app.delete("/api/videos/{video_id}")
def delete(video_id: str):
    _job_or_404(video_id)
    jobs.delete(video_id)
    return {"deleted": video_id}

