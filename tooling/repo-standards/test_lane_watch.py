"""lane_watch.py: each of the five findings fires on a fixture and stays quiet on its healthy twin."""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lane_watch  # noqa: E402
from lane_resume import Agent  # noqa: E402

NOW = time.time()


def _iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")


def _agent(tmp_path, aid, typ, label, events, status="live"):
    """events: (minutes ago, context tokens, bash command or None)."""
    lines = [{"type": "user", "timestamp": _iso(NOW - 3600), "message": {"content": "brief"}}]
    for n, (ago, ctx, cmd) in enumerate(events):
        content = [{"type": "tool_use", "id": f"t{n}", "name": "Bash", "input": {"command": cmd}}] if cmd else []
        lines.append({"type": "assistant", "timestamp": _iso(NOW - ago * 60),
                      "message": {"id": f"m{n}", "content": content, "usage": {"input_tokens": 0,
                                  "cache_read_input_tokens": ctx, "cache_creation_input_tokens": 0}}})
    p = tmp_path / f"agent-{aid}.jsonl"
    p.write_text("\n".join(json.dumps(x) for x in lines))
    a = Agent(aid, "s", p, label=label, agent_type=typ, status=status)
    a.load()
    return lane_watch.Watched(a)


def test_stale_wait(tmp_path):
    out = tmp_path / "gpu-lane" / "run1"
    out.mkdir(parents=True)
    old = out / "view-1.png"
    old.write_text("x")
    import os
    os.utime(old, (NOW - 1800, NOW - 1800))
    wait = f"python3 tooling/repo-standards/lane_wait.py --files gpu-lane/run1/done.json --timeout 540"
    w = _agent(tmp_path, "aaa", "run", "capture", [(40, 1000, wait), (31, 1000, wait), (22, 1000, wait)])
    got = lane_watch.stale([w], NOW, repo=tmp_path)
    assert len(got) == 1 and got[0].startswith("STALE aaa capture waiting 40 min on") and "last output 30 min ago" in got[0]
    old.touch()   # fresh output: the job is still producing
    assert lane_watch.stale([w], NOW, repo=tmp_path) == []
    (out / "done.json").write_text("{}")
    assert lane_watch.stale([w], NOW, repo=tmp_path) == []


def test_over_context(tmp_path):
    lead = _agent(tmp_path, "bbb", "lead", "walk10 lead", [(30, 100_000, None), (20, 160_000, None), (1, 170_000, None)])
    assert lane_watch.overctx([lead], NOW) == ["OVERCTX bbb walk10 lead 170k for 20 min"]
    fresh = _agent(tmp_path, "ccc", "lead", "x", [(30, 100_000, None), (5, 160_000, None)])
    find = _agent(tmp_path, "ddd", "find", "x", [(30, 200_000, None)])
    assert lane_watch.overctx([fresh, find], NOW) == []


def test_pod_ledger(tmp_path):
    rep = tmp_path / "tooling/.reports/16k/walk10"
    rep.mkdir(parents=True)
    (rep / "gpu-lead.md").write_text("Pod: abcdefgh123456 (RTX 4090), deleted on return\n")
    idle = _agent(tmp_path, "eee", "lead", "other lane", [(1, 1000, None)])
    assert lane_watch.pods([idle], repo=tmp_path) == [
        "POD abcdefgh123456 named by tooling/.reports/16k/walk10/gpu-lead.md with no live lane: delete or hand over"]
    owner = _agent(tmp_path, "fff", "lead", "gpu lane", [(1, 1000, None)])
    assert lane_watch.pods([owner], repo=tmp_path) == []


def _p(pid, args, ppid=1, rss=1000, etimes=3000):
    return {"pid": pid, "ppid": ppid, "etimes": etimes, "rss": rss, "args": args}


def test_orphan_job(tmp_path):
    procs = [_p(10, "bash tooling/repo-standards/job_guard.sh gpu10 -- node pod-capture.mjs"),
             _p(11, "node pod-capture.mjs --out /tmp/gpu10/x", ppid=10),
             _p(12, "node vite build", etimes=60)]
    ended = _agent(tmp_path, "ggg", "run", "x", [(50, 1000, "job_guard.sh gpu10 -- node pod-capture.mjs")], status="completed")
    got = lane_watch.orphans(procs, [ended])
    assert got[0].startswith("ORPHAN pid 10 bash tooling/repo-standards/job_guard.sh gpu10") and "lane gpu10" in got[0]
    assert len(got) == 2   # the child is not repeated; the lane-less vite build with nobody live is listed
    live = _agent(tmp_path, "hhh", "run", "x", [(1, 1000, "job_guard.sh gpu10 -- node pod-capture.mjs")])
    assert lane_watch.orphans(procs, [live]) == []


def test_orphan_exempts_cron_backup():
    procs = [_p(5, "/usr/sbin/CRON -f", ppid=1),
             _p(6, "/bin/sh -c backup_changed.sh", ppid=5),
             _p(7, "bash tooling/repo-standards/job_guard.sh backup -- snapshot-vault.sh", ppid=6),
             _p(8, "bash tooling/repo-standards/job_guard.sh gpu10 -- node pod-capture.mjs", ppid=1)]
    got = lane_watch.orphans(procs, [])
    assert len(got) == 1 and "pid 8" in got[0]


def test_unguarded_heavy():
    procs = [_p(20, "/usr/bin/python3 big.py", rss=3 * 1048576), _p(21, "python3 guarded.py", rss=3 * 1048576),
             _p(22, "python3 small.py", rss=1048576), _p(23, "/usr/bin/java big", rss=5 * 1048576)]
    cg = {21: "0::/user.slice/user@1001.service/app.slice/run-u42.scope\n"}.get
    got = lane_watch.unguarded(procs, cg=lambda pid: cg(pid, "0::/user.slice/x.service\n"))
    assert got == ["UNGUARDED pid 20 3.0 GiB /usr/bin/python3 big.py"]
