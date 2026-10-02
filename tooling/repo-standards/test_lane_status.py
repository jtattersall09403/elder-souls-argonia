"""lane_status.py over a real subagent transcript (fixtures/lane_resume/done.jsonl,
a find agent from 2026-09-25): turns are de-duplicated API calls, context is the
last call's input side, units the session_tokens weights per M tokens, and a
running agent past 200k is flagged for a split (method review r7 P2)."""
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lane_status  # noqa: E402

FIX = HERE / "fixtures" / "lane_resume" / "done.jsonl"


def _project(tmp_path):
    sub = tmp_path / "sess" / "subagents"
    sub.mkdir(parents=True)
    shutil.copy(FIX, sub / "agent-a395a3b5733e2eb0f.jsonl")
    (sub / "agent-a395a3b5733e2eb0f.meta.json").write_text(json.dumps({"agentType": "find", "description": "studio up"}))
    (tmp_path / "sess.jsonl").write_text("")
    other = tmp_path / "other" / "subagents"
    other.mkdir(parents=True)
    shutil.copy(FIX, other / "agent-b.jsonl")
    return tmp_path


def test_row_numbers_from_the_transcript(tmp_path):
    rs = lane_status.rows(_project(tmp_path), "sess", hours=1e6, live={})
    assert len(rs) == 1                       # the other session's agent is not listed
    r = rs[0]
    assert (r["id"], r["type"], r["label"]) == ("a395a3b5733e2eb0f", "find", "studio up")
    assert r["turns"] == 4
    assert r["context"] == 8055 + 22 + 10
    assert r["units"] == round((26426 * 0.1 + 3477 * 2 + 36 + 169 * 5) / 1e6, 2)
    assert r["state"] == "completed"          # it ended with SubagentHandback
    assert lane_status.over_big(rs) == []


def test_running_agent_over_150k_is_flagged(tmp_path):
    rs = lane_status.rows(_project(tmp_path), "sess", hours=1e6, live={})
    rs[0].update(state="live", context=200_000)
    assert lane_status.over_big(rs) == rs
    assert "over 150k context: 1" in lane_status.render(rs, brief=False)
    assert lane_status.render(rs, brief=True).startswith("a395a3b573 find live")


def test_agent_prefix_prints_one_row(tmp_path, capsys):
    pdir = _project(tmp_path)
    base = ["--dir", str(pdir), "--session", "sess", "--hours", "1000000", "--brief"]
    assert lane_status.main(base + ["--agent", "a395a3"]) == 0
    assert capsys.readouterr().out.count("\n") == 1
    lane_status.main(base + ["--agent", "zzz"])
    assert capsys.readouterr().out.strip() == ""
