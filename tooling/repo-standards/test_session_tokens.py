"""One model call is one turn, however many records the transcript writes for it."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from session_tokens import Calls, usage_of  # noqa: E402
from session_switch import turns_of  # noqa: E402


def rec(mid, out, ts="2026-09-22T18:00:00Z", **usage):
    u = {"input_tokens": 10, "cache_read_input_tokens": 1000, "cache_creation_input_tokens": 50,
         "output_tokens": out}
    u.update(usage)
    return {"type": "assistant", "entrypoint": "cli", "timestamp": ts,
            "message": {"id": mid, "model": "claude-fable-5-1", "usage": u, "content": []}}


def test_records_of_one_call_fold_to_one_turn(tmp_path):
    # a text block then a tool_use block: two records, one call; the later record
    # carries the fuller output count
    lines = [rec("m1", 20), rec("m1", 120), rec("m2", 30), rec("m2", 30)]
    p = tmp_path / "s.jsonl"
    p.write_text("\n".join(json.dumps(x) for x in lines) + "\n")
    calls, entry = turns_of(str(p))
    assert entry == "cli"
    assert len(calls) == 2
    assert calls[0]["output"] == 120 and calls[0]["cache_read"] == 1000
    total, models = usage_of(str(p))
    assert total["cache_read"] == 2000 and total["output"] == 150
    assert models == {"fable": 2}


def test_records_without_an_id_still_count():
    c = Calls()
    r = rec("x", 1)
    del r["message"]["id"]
    assert c.add(r) and c.add(r)
    assert len(c.calls) == 2
