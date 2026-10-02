"""workflow_drift.py: review fires are counted from review_gate's append-only
log, so a closed batch (stamps emptied by --close) still shows its fires
(method review r6: drift read reviewFires 0 while three reviews fired)."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import workflow_drift  # noqa: E402


def test_double_fire_in_one_batch_counts_and_goes_red(tmp_path, monkeypatch):
    review = tmp_path / "review"
    review.mkdir()
    (review / "stamp.json").write_text(json.dumps({"stamps": {}, "reviewedHead": "abc", "open": False}))
    now = time.time()
    rows = [{"time": now - 600, "batchId": "b1", "head": "abc", "status": "ok", "findings": 2,
             "paths": ["tooling/x.py"]},
            {"time": now - 60, "batchId": "b1", "head": "abd", "status": "ok", "findings": 0,
             "paths": ["tooling/x.py"]},
            {"time": now - 30 * 86400, "batchId": "b0", "head": "aaa", "status": "ok", "findings": 0, "paths": []}]
    (review / "reviews.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows) + "torn{\n")
    monkeypatch.setattr(workflow_drift, "REVIEWS", review / "reviews.jsonl", raising=False)
    monkeypatch.setattr(workflow_drift, "STAMPS", review / "stamp.json", raising=False)
    m = workflow_drift.measure(7)
    assert m["reviewFires"] == 2
    assert m["reviewFiresPerBatchMax"] == 2
    assert m["reviewFiresPerBatchMax"] > workflow_drift.RED["reviewFiresPerBatchMax"]
