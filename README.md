# Cutwise: agentic video editor (POC)

Upload a video. Cutwise analyses **that file**, predicts its content category with a real model, and asks you to accept the suggestion or pick a category yourself. The editing workspace then plans cuts over the scenes it actually found in your footage.

There are no sample videos, hardcoded categories or canned results. Every number on the analysis screen is computed from the uploaded file.

## Run it locally

You need **Node 18+** and **Python 3.10+**. Use two terminals.

```bash
# 1. Analysis server  (http://127.0.0.1:8000)
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# 2. Web app  (http://localhost:5173)
npm install
npm run dev
```

On the first analysis the server downloads the model (`Xenova/clip-vit-base-patch32`, quantized ONNX, about 150 MB) from Hugging Face and caches it. Later runs work offline.

## Processing flow

```
Upload (browser)  ──►  POST /api/videos
                         • extension, MIME type and file signature checked
                         • OpenCV must decode at least one frame, else 415 and nothing is queued
                         • saved to a temp folder under a new job id (uuid4)
                         • job queued, returns { video_id, status }
Poll  ──────────────►  GET /api/videos/{id}       status, stage, progress, result or error
                         analysis (background worker):
                         1. one sequential pass over the file:
                            - 12–32 evenly spaced frames for classification
                            - a dense colour-histogram track for scene cuts
                         2. CLIP zero-shot: each frame scored against 4 text descriptions per category
                         3. per-frame softmax over categories, averaged across frames
                            → predicted category, confidence, runner-ups
                         4. evidence: the 3 frames that most support the prediction
                         5. scenes: a keyframe each, per-category scores, dark/blank and near-duplicate flags
Confirm  ───────────►  POST /api/videos/{id}/category  { category, source: "ai" | "manual" }
Continue  ──────────►  Brief → agent plan → review → re-edit (in the browser)
```

Response shape. These values come from a test run with the offline stand-in model, so the category itself means nothing:

```json
{
  "video_id": "4ab5a6c3…",
  "predicted_category": "education",
  "confidence": 0.68,
  "reason": "8 of 12 sampled frames look most like Education. Strongest match at 00:11: \"a teacher giving a lecture in a classroom\". Runner-up: Business at 32%.",
  "alternatives": [ … ], "evidence": [ … ], "scenes": [ … ], "metadata": { … }
}
```

If no category reaches 22% (`CUTWISE_OTHER_THRESHOLD`), the prediction is **Other** and the reason names the closest matches.

### Errors

- A file that isn't a decodable video (wrong extension or signature, an image renamed `.mp4`, audio only, truncated) is rejected at upload with a 415 and a plain message.
- A failure during analysis (bad codec part-way through, model not available) marks **that job** `error` with the reason. The server keeps running, and the next upload is unaffected.
- Uploads are deleted after 6 hours. `DELETE /api/videos/{id}` removes one immediately.

### Settings

| Variable | Default | |
|---|---|---|
| `CUTWISE_MODEL_REPO` | `Xenova/clip-vit-base-patch32` | Any repo with `onnx/vision_model*.onnx` + `onnx/text_model*.onnx` |
| `CUTWISE_MODEL_VARIANT` | `quantized` | `fp32` for the full-precision export |
| `CUTWISE_MODEL_DIR` | (none) | Use a local model folder, no download |
| `CUTWISE_UPLOAD_DIR` | system temp `/cutwise_uploads` | |
| `CUTWISE_MAX_UPLOAD_MB` | `2048` | |
| `CUTWISE_OTHER_THRESHOLD` | `0.22` | |

## What is real and what isn't yet

| Real, from your file | Not built yet |
|---|---|
| File validation, job ids, temp storage | Speech-to-text, speakers, languages |
| Frame sampling, category prediction, confidence, reason, evidence frames | Transcript-based intent, repetition and Q&A detection |
| Scene detection, keyframes, dark/blank and repeated scenes | ContextGuard sentence checks (no sentences without a transcript) |
| Edit plan over real scenes, ranked by match to the chosen category | Rendering with FFmpeg (**Download edit list** gives the EDL JSON) |
| Preview plays your actual footage clip by clip | |

The planner, ContextGuard and chat re-editing in `src/engine` are the same code as before. They now run on the scenes the backend found. Once a transcript exists, segments will gain text, tags and links, and the sentence-level checks start working with no UI changes.

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
python tests/make_test_model.py        # tiny random stand-in model, for offline tests only
CUTWISE_MODEL_DIR=tests/fake_model python tests/test_api.py <folder with test videos>
```

`test_api.py` checks the following:
- invalid files are rejected
- two different videos get independent results
- accept and manual override both work
- a crashing job is isolated and the service carries on

The stand-in model only tests the plumbing. Its predictions mean nothing. Use the real model to judge accuracy.

## Layout

```
backend/app/
  main.py         API routes, upload validation
  jobs.py         job store + background worker, per-job errors, cleanup
  video.py        container sniffing, OpenCV probing, frame sampling, scene cuts
  classifier.py   CLIP via ONNX Runtime (no PyTorch)
  analysis.py     prediction, confidence, reason, evidence, scenes
  categories.py   category ids and the text prompts each is matched against
src/
  services/api.ts        backend client (Vite proxies /api to port 8000)
  lib/fromAnalysis.ts    analysis result → pipeline input (scenes become segments)
  screens/               Upload, Understand (suggestion + accept/override), Brief, Workspace
  engine/                planner, ContextGuard, instruction parsing
```
