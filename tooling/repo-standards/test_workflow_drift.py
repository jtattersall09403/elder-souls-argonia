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


def test_miner_matcher_counts_the_tool_never_its_args(tmp_path, monkeypatch):
    """r7 P9: a pytest naming test_mine_mounts.py was counted as a full miner run."""
    now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    rows = [{"date": now, "tool": "worldgen.mine_abuts", "args": ["--write"]},
            {"date": now, "tool": "worldgen.mine_mounts", "args": ["--assets", "x", "--merge"]},
            {"date": now, "tool": "worldgen.mine_mounts", "args": ["--assets", "y"]},
            {"date": now, "tool": "worldgen.mine_mounts", "args": ["--merge"]},
            {"date": now, "tool": "pytest", "args": ["-q", "worldgen/test_mine_mounts.py"]},
            {"date": now, "tool": "bash", "args": ["-c", "python3 -m worldgen.mine_designed_sink"]}]
    t = tmp_path / "timings.jsonl"
    t.write_text("".join(json.dumps(r) + "\n" for r in rows))
    monkeypatch.setattr(workflow_drift, "TIMINGS", t)
    monkeypatch.setattr(workflow_drift, "REVIEWS", tmp_path / "none.jsonl")
    assert workflow_drift.measure(7)["minerFullRuns"] == 2  # --write and --merge alone; --assets, with or without --merge, is scoped
