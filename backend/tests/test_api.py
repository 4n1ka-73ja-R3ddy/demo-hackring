"""API tests against real video files. Uses the offline stand-in model, so they
check plumbing (validation, jobs, errors, per-video results), not accuracy.

Run:  python tests/make_test_model.py && CUTWISE_MODEL_DIR=tests/fake_model python tests/test_api.py <videos dir>
"""

import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app  # noqa: E402

V = Path(sys.argv[1])
c = TestClient(app)


def upload(name, ctype="video/mp4"):
    with open(V / name, "rb") as f:
        return c.post("/api/videos", files={"file": (name, f, ctype)})


def wait(vid, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = c.get(f"/api/videos/{vid}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.2)
    raise TimeoutError(vid)


# Invalid files are rejected before any job is created
for name, ctype in [("d_text.mp4", "video/mp4"), ("e_image_renamed.mp4", "video/mp4"), ("c_audio_only.mp4", "video/mp4"), ("f_truncated.mp4", "video/mp4"), ("e_image.jpg", "image/jpeg")]:
    r = upload(name, ctype)
    print(f"{name:22} -> {r.status_code} {r.json()['detail'][:90]}")
    assert r.status_code == 415, r.text

# Valid videos are analysed independently
results = {}
for name, ctype in [("a_scenes.mp4", "video/mp4"), ("b_life.webm", "video/webm")]:
    r = upload(name, ctype)
    assert r.status_code == 202, r.text
    vid = r.json()["video_id"]
    j = wait(vid)
    assert j["status"] == "done", j
    res = j["result"]
    results[name] = res
    print(f"\n{name}: id={vid[:8]} predicted={res['predicted_category']} conf={res['confidence']} frames={res['metadata']['frames_analyzed']} dur={res['metadata']['duration']}")
    print("  reason:", res["reason"])
    print("  scenes:", [(s["start"], s["end"], s["dark"], s["duplicate_of"]) for s in res["scenes"]])
    assert c.get(res["evidence"][0]["frame_url"]).status_code == 200
    # confirm: accept and manual override
    assert c.post(f"/api/videos/{vid}/category", json={"category": res["predicted_category"], "source": "ai"}).status_code == 200
    assert c.post(f"/api/videos/{vid}/category", json={"category": "travel", "source": "manual"}).json()["category_source"] == "manual"
    assert c.post(f"/api/videos/{vid}/category", json={"category": "nonsense", "source": "manual"}).status_code == 422

a, b = results["a_scenes.mp4"], results["b_life.webm"]
assert a["alternatives"] != b["alternatives"], "different videos should give different scores"

# A job that fails does not take the service down
import app.jobs as jobs_mod  # noqa: E402
orig = jobs_mod.analyze
jobs_mod.analyze = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("simulated crash"))
r = upload("a_scenes.mp4")
j = wait(r.json()["video_id"])
print("\nsimulated failure ->", j["status"], j["error"])
assert j["status"] == "error"
jobs_mod.analyze = orig
r = upload("b_life.webm", "video/webm")
assert wait(r.json()["video_id"])["status"] == "done"
assert c.get("/api/health").json()["ok"]
assert c.get("/api/videos/" + "0" * 32).status_code == 404
print("\nALL CHECKS PASSED")
