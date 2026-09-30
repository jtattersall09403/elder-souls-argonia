"""tool_timings ranks memwatch's run log; memwatch writes one line per run (16h ledger §6 step D)."""
import json
import os
import subprocess
import sys
import textwrap
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tool_timings import check, load, over_target, rank, table, targets, tool_of  # noqa: E402

NOW = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)


def line(tool, wall, own, days_ago=0, args=("--x",), code=0, start=2.0, machine_delta=None):
    d = (NOW - timedelta(days=days_ago)).isoformat()
    row = {"date": d, "tool": tool, "args": list(args), "wallS": wall, "startGiB": start,
           "peakAnonGiB": start + (own if machine_delta is None else machine_delta), "exit": code, "cwd": "."}
    if own is not None:
        row["ownPeakGiB"] = own
    return row


FIXTURE = [
    line("worldgen.compile_settlement", 30.0, 1.0, args=("--place", "a")),
    line("worldgen.compile_settlement", 90.0, 1.5, args=("--place", "b")),
    line("worldgen.compile_settlement", 20.0, 1.2, args=("--place", "c")),
    line("pipeline.render_assembly", 50.0, 3.0, args=("--kit", "k")),
    line("npm.test", 45.0, 0.5),
    line("worldgen.busy_vm", 10.0, 0.5, start=9.0, machine_delta=8.0),  # the machine grew 8 GiB beside it, own 0.5: no mark
    line("worldgen.pre_own", 5.0, None, machine_delta=6.0),  # logged before the own figure: no memory mark
    line("worldgen.old_tool", 500.0, 9.0, days_ago=30),  # outside a 7-day window
]


def write_log(tmp_path, rows):
    p = tmp_path / "tool-timings.jsonl"
    p.write_text("".join(json.dumps(r) + "\n" for r in rows) + "not json\n")
    return p


def test_rankings_and_markers(tmp_path):
    rows = load(write_log(tmp_path, FIXTURE))
    by_total, by_worst = rank(rows, now=NOW, days=7)
    assert [r["tool"] for r in by_total] == [
        "worldgen.compile_settlement", "pipeline.render_assembly", "npm.test", "worldgen.busy_vm",
        "worldgen.pre_own"]
    assert [r["tool"] for r in by_worst] == [
        "worldgen.compile_settlement", "pipeline.render_assembly", "npm.test", "worldgen.busy_vm",
        "worldgen.pre_own"]
    cs = by_total[0]
    assert (cs["runs"], cs["total"], cs["mean"], cs["worst"], cs["maxOwn"]) == (3, 140.0, 140.0 / 3, 90.0, 1.5)
    assert cs["worstArgs"] == "--place b"
    busy = next(r for r in by_total if r["tool"] == "worldgen.busy_vm")
    assert (busy["maxOwn"], busy["machineDeltaGiB"]) == (0.5, 8.0)
    marks = {r["tool"]: r["mark"] for r in by_total}
    assert marks == {"worldgen.compile_settlement": "TARGET", "pipeline.render_assembly": "TARGET",
                     "npm.test": "", "worldgen.busy_vm": "", "worldgen.pre_own": ""}
    pre = table("t", [r for r in by_total if r["tool"] == "worldgen.pre_own"]).splitlines()[-1].split()
    assert pre[5:7] == ["-", "6.00"]


def test_exclude_trims_only_the_total_table(tmp_path):
    rows = load(write_log(tmp_path, FIXTURE))
    by_total, by_worst = rank(rows, now=NOW, days=7, exclude=("npm.",))
    assert "npm.test" not in [r["tool"] for r in by_total]
    assert "npm.test" in [r["tool"] for r in by_worst]


def test_window_admits_old_runs(tmp_path):
    rows = load(write_log(tmp_path, FIXTURE))
    by_total, by_worst = rank(rows, now=NOW, days=60)
    assert by_total[0]["tool"] == "worldgen.old_tool" and by_worst[0]["tool"] == "worldgen.old_tool"


def test_tool_names():
    assert tool_of(["python3", "-m", "worldgen.compile_settlement", "--all"]) == (
        "worldgen.compile_settlement", ["--all"])
    assert tool_of(["cd", "tooling/world-generation", "&&", "python3", "-m", "worldgen.x", "-j", "4"]) == (
        "worldgen.x", ["-j", "4"])
    assert tool_of(["FOO=1", "python3", "pipeline/render_assembly.py", "--kit", "k"]) == (
        "pipeline.render_assembly", ["--kit", "k"])
    assert tool_of(["npm", "run", "preflight", "--", "--runner"]) == ("npm.preflight", ["--", "--runner"])
    assert tool_of(["node", "tooling/repo-standards/check.mjs"]) == ("repo-standards.check", [])
    assert tool_of(["python3", "-u", "-c", "import time"]) == ("python-c", [])
    assert tool_of(["sleep", "1"]) == ("sleep", ["1"])


def test_memwatch_writes_one_line(tmp_path):
    log = tmp_path / "t.jsonl"
    env = dict(os.environ, MEMWATCH_TIMINGS_LOG=str(log))
    r = subprocess.run(["bash", os.path.join(HERE, "memwatch.sh"), "sleep", "1"], env=env,
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    rows = [json.loads(x) for x in log.read_text().splitlines()]
    assert len(rows) == 1
    row = rows[0]
    assert set(row) == {"date", "tool", "args", "wallS", "startGiB", "peakAnonGiB", "ownPeakGiB", "ownMeasure", "exit", "cwd"}
    assert row["peakAnonGiB"] >= row["startGiB"] > 0
    assert row["tool"] == "sleep" and row["args"] == ["1"] and row["exit"] == 0
    assert 0.9 <= row["wallS"] <= 2.5
    assert isinstance(row["peakAnonGiB"], float)


def test_memwatch_passes_the_exit_code_through(tmp_path):
    env = dict(os.environ, MEMWATCH_TIMINGS_LOG=str(tmp_path / "t.jsonl"))
    r = subprocess.run(["bash", os.path.join(HERE, "memwatch.sh"), "exit", "3"], env=env,
                       capture_output=True, text=True)
    assert r.returncode == 3
    assert json.loads((tmp_path / "t.jsonl").read_text())["exit"] == 3


HOLD = textwrap.dedent("""
    import sys, time
    time.sleep(0.6)
    n = int(sys.argv[1]) * 2**20
    b = bytearray(n)
    b[::4096] = b"\\x01" * len(range(0, n, 4096))   # touch every page: resident, anonymous
    time.sleep(2.5)
""")


BUSY_MIB = 256  # another process that frees or takes this much in the window moves the machine figure


def other_process_mib(own=None):
    """pid -> MiB of RssAnon + RssShmem (own_memory's measure) for every
    process outside this test's own tree."""
    import own_memory
    mine = own or {os.getpid()}
    out = {}
    for name in os.listdir("/proc"):
        if name.isdigit() and int(name) not in mine:
            st = own_memory._status(int(name))
            if st is not None:
                out[int(name)] = (st.get("RssAnon", 0) + st.get("RssShmem", 0)) / 1024
    return out


def machine_is_busy(before, after):
    """Why the machine-wide delta is not asserted, or None: a runner-mode
    preflight, or another process whose memory moved by >= BUSY_MIB between
    the two snapshots (a process that started or ended counts from 0)."""
    if os.environ.get("GITHUB_ACTIONS") == "true" or \
            os.path.basename(os.environ.get("ES_ASSET_PIPELINE_ROOT", "")).startswith("no-vault-"):
        return "preflight --runner"
    moved = sorted(((pid, round(after.get(pid, 0) - before.get(pid, 0)))
                    for pid in set(before) | set(after)
                    if abs(after.get(pid, 0) - before.get(pid, 0)) >= 1), key=lambda m: -abs(m[1]))
    # summed, not per process: a scoped preflight's xdist workers each move
    # under BUSY_MIB and together free 500+ MiB (2026-09-29, 515 vs 602 MiB)
    total = sum(abs(d) for _pid, d in moved)
    return (f"{len(moved)} other process(es) moved >= {BUSY_MIB} MiB in total ({total} MiB): "
            f"{moved[:3]}") if total >= BUSY_MIB else None


def test_machine_is_busy_names_the_runner_and_moving_processes(monkeypatch):
    monkeypatch.setenv("ES_ASSET_PIPELINE_ROOT", "/tmp/no-vault-abc123")
    assert machine_is_busy({}, {}) == "preflight --runner"
    monkeypatch.delenv("ES_ASSET_PIPELINE_ROOT")
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    assert machine_is_busy({1: 2048, 2: 4000}, {1: 2050, 2: 4000}) is None   # big but steady
    assert "1 other process(es)" in machine_is_busy({1: 2048}, {1: 1500})    # freed 548 MiB
    assert "1 other process(es)" in machine_is_busy({}, {9: 900})             # started


def test_memwatch_own_peak_is_the_job_not_the_machine(tmp_path):
    """A job allocating 300 MiB beside a sibling (outside the job) allocating
    600 MiB: the own peak is the job's ~300, the machine delta holds both."""
    log = tmp_path / "t.jsonl"
    prog = tmp_path / "hold.py"
    prog.write_text(HOLD)
    env = dict(os.environ, MEMWATCH_TIMINGS_LOG=str(log))
    env.pop("MEMWATCH_LANE", None)  # set when the suite itself runs under job_guard
    before = other_process_mib()
    job = subprocess.Popen(["bash", os.path.join(HERE, "memwatch.sh"), f"{sys.executable} {prog} 300"],
                           env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    sibling = subprocess.Popen([sys.executable, str(prog), "600"])
    out, err = job.communicate(timeout=30)
    sibling.wait(timeout=30)
    assert job.returncode == 0, err
    row = json.loads(log.read_text())
    own_mib = row["ownPeakGiB"] * 1024
    machine_delta_mib = (row["peakAnonGiB"] - row["startGiB"]) * 1024
    assert 290 <= own_mib <= 400, row
    # The machine figure holds the sibling too (measured 927 MiB on 2026-09-26),
    # but it is the whole machine's: under `preflight --runner` (a parallel
    # gate run) or beside another heavy process, memory freed elsewhere in the
    # window can hide the sibling, so there it is a printed note, never a red.
    # The own-peak bar above is the assert that matters.
    note = machine_is_busy(before, other_process_mib({os.getpid(), job.pid, sibling.pid}))
    if note:
        print(f"note: machine delta {machine_delta_mib:.0f} MiB vs own {own_mib:.0f} MiB "
              f"not asserted ({note})")
    else:
        assert machine_delta_mib >= own_mib + 300, row
    last = out.strip().splitlines()[-1]
    assert last.startswith("memwatch: own peak ") and " GiB · machine peak " in last and last.endswith("exit 0")


TG = {"judgedPrefixes": ["worldgen."], "defaultMaxOwnGiB": 4.0,
      "tools": {"worldgen.place_gates": {"maxWallS": 60, "maxOwnGiB": 2.0}}}


def test_over_target_reads_the_table_then_the_default():
    pss = lambda tool, wall, own: {**line(tool, wall, own), "ownMeasure": "pss"}  # noqa: E731
    assert over_target(pss("worldgen.place_gates", 30, 1.3), TG) == []
    assert over_target(pss("worldgen.place_gates", 30, 9.4), TG) == ["own peak 9.40 GiB > 2.0 GiB"]
    assert over_target(pss("worldgen.place_gates", 75, 1.0), TG) == ["wall 75 s > 60 s"]
    assert over_target(pss("worldgen.other", 900, 4.5), TG) == ["own peak 4.50 GiB > 4.0 GiB"]
    assert over_target(pss("npm.test", 900, 12.0), TG) == []              # not judged
    assert over_target(line("worldgen.place_gates", 30, 9.4), TG) == []   # RssAnon-era row


def test_check_judges_the_latest_successful_run_per_tool():
    rows = [{**line("worldgen.place_gates", 30, 9.4, days_ago=0.5), "ownMeasure": "pss"},
            {**line("worldgen.place_gates", 30, 1.3, days_ago=0.1), "ownMeasure": "pss"},
            {**line("worldgen.x", 30, 6.0, days_ago=0.1), "ownMeasure": "pss"},
            {**line("worldgen.y", 30, 6.0, days_ago=0.1, code=1), "ownMeasure": "pss"}]
    for r in rows:
        r["_date"] = datetime.fromisoformat(r["date"])
    over = check(rows, NOW, 1, TG)
    assert len(over) == 1 and over[0].startswith("worldgen.x: own peak 6.00 GiB")


def test_the_targets_file_parses_and_every_row_names_a_measurement():
    tg = targets()
    assert tg["defaultMaxOwnGiB"] <= 4.0
    for tool, t in tg["tools"].items():
        assert t.get("measured") and (t.get("maxWallS") or t.get("maxOwnGiB")), tool


def test_the_local_log_has_no_tool_over_its_target():
    """A heavy tool's latest guarded run past its wall or peak target fails
    here, the way a slow run fails a lane (memory discipline, 2026-09-30).
    The log is this machine's (gitignored): absent on a runner."""
    import pytest
    from tool_timings import log_path
    if not log_path().exists() or os.environ.get("GITHUB_ACTIONS") == "true":
        pytest.skip("no local tool-timings log")
    over = check(load(log_path()), datetime.now(timezone.utc), 1)
    assert not over, "tool over its tool_targets.json target:\n" + "\n".join(over)


def test_own_memory_counts_a_fork_pools_shared_pages_once():
    """A parent holding 400 MiB forks three idle children: PSS reads ~400
    MiB over the tree where RssAnon read ~1.6 GiB."""
    import own_memory
    code = textwrap.dedent("""
        import os, sys, time
        import numpy as np
        a = np.ones(400 * 2**20 // 8)
        kids = [os.fork() for _ in range(3)]
        if 0 in kids:
            time.sleep(4); os._exit(0)
        print("ready", flush=True); time.sleep(4)
    """)
    p = subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE, text=True)
    try:
        assert p.stdout.readline().strip() == "ready"
        kib, alive = own_memory.tree_kib(p.pid)
        assert alive and 380 <= kib / 1024 <= 700, kib / 1024
    finally:
        p.kill(); p.wait()
