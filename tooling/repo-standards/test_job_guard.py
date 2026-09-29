"""job_guard.sh admission and slot sizing (method review C1, 2026-09-27).

Admission is by slot, never by the 1-min load average (unless ES_JOB_MAX_LOAD
is set), and every admitted job gets its slot's core share in ES_JOB_CORES,
which pytest-xdist's `-n auto` follows through PYTEST_XDIST_AUTO_NUM_WORKERS.
"""
import json
import os
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
# This suite may itself run inside a job_guard slot (test.sh guards itself);
# the guard under test must see an unguarded caller unless a test says so.
os.environ.pop("ES_JOB_GUARD", None)


def guard(tmp_path, cmd, **env):
    load = tmp_path / "loadavg"
    load.write_text("99.00 99.00 99.00 1/1 1\n")          # a machine far past nproc - 1
    full = {**os.environ, "ES_JOB_LOCK_DIR": str(tmp_path / "locks"), "ES_JOB_LOADAVG_FILE": str(load),
            "ES_JOB_WAIT_S": "0", "ES_JOB_POLL_S": "0", "ES_JOB_MIN_FREE_GB": "0",
            "ES_JOB_MEM_CEILING_MIB": "100000000", "ES_JOB_CPUS": "0", **env}
    for k in ("ES_JOB_CORES", "PYTEST_XDIST_AUTO_NUM_WORKERS", "ES_JOB_MAX_LOAD"):
        if k not in env:
            full.pop(k, None)
    return subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--", cmd], env=full,
                          capture_output=True, text=True, timeout=60)


def test_a_nested_guard_runs_inline_without_a_slot(tmp_path):
    r = guard(tmp_path, "echo ran", ES_JOB_GUARD="outer")
    assert r.returncode == 0 and r.stdout == "ran\n", r.stderr
    assert "inside job_guard[outer]" in r.stderr
    assert not (tmp_path / "locks").exists()           # never took (or waited for) a slot


def test_a_high_load_average_does_not_block_admission(tmp_path):
    r = guard(tmp_path, "echo ran")
    assert r.returncode == 0, r.stderr
    assert "ran" in r.stdout


def test_the_load_gate_returns_only_when_asked_for(tmp_path):
    r = guard(tmp_path, "echo ran", ES_JOB_MAX_LOAD="7")
    assert r.returncode == 75 and "load 99.00 >= 7" in r.stderr
    assert "ran" not in r.stdout


def test_each_slot_gets_its_core_share_and_xdist_follows_it(tmp_path):
    # a 7-core pool in 3 slots: 2 cores each; ES_JOB_CPUS picks the pool
    r = guard(tmp_path, "echo cores=$ES_JOB_CORES xdist=$PYTEST_XDIST_AUTO_NUM_WORKERS",
              ES_JOB_CPUS="0-6", ES_JOB_SLOTS="3")
    if int(subprocess.run(["taskset", "-c", "0-6", "nproc"], capture_output=True, text=True).stdout or 0) < 7:
        return                                             # a smaller machine: the share is smaller
    assert "cores=2 xdist=2" in r.stdout, r.stderr
    r = guard(tmp_path, "echo cores=$ES_JOB_CORES xdist=$PYTEST_XDIST_AUTO_NUM_WORKERS",
              ES_JOB_CPUS="0-6", ES_JOB_SLOTS="3", PYTEST_XDIST_AUTO_NUM_WORKERS="5")
    assert "cores=2 xdist=5" in r.stdout                  # an explicit worker count is kept


def test_one_core_pool_gives_one_core(tmp_path):
    r = guard(tmp_path, "echo cores=$ES_JOB_CORES", ES_JOB_CPUS="0", ES_JOB_SLOTS="3")
    assert "cores=1" in r.stdout, r.stderr


def test_arguments_reach_the_command_unchanged(tmp_path):
    """Walk 3 L3 rec 2: `-k "a or b"` once reached pytest as three words.
    Several arguments keep their boundaries (spaces, quotes, `$`, `;`); one
    argument stays a shell line (pipes and `$VAR` expand)."""
    load = tmp_path / "loadavg"
    load.write_text("0.00 0.00 0.00 1/1 1\n")
    env = {**os.environ, "ES_JOB_LOCK_DIR": str(tmp_path / "locks"), "ES_JOB_LOADAVG_FILE": str(load),
           "ES_JOB_WAIT_S": "0", "ES_JOB_POLL_S": "0", "ES_JOB_MIN_FREE_GB": "0",
           "ES_JOB_MEM_CEILING_MIB": "100000000", "ES_JOB_CPUS": "0"}
    args = ["python3", "-c", "import sys, json; print(json.dumps(sys.argv[1:]))",
            "-k", "render or round", "it's", "$HOME", "a;b"]
    r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--", *args], env=env,
                       capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    line = next(x for x in r.stdout.splitlines() if x.startswith("["))
    assert json.loads(line) == ["-k", "render or round", "it's", "$HOME", "a;b"]
    r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--", "echo one two | tr o 0"],
                       env=env, capture_output=True, text=True, timeout=60)
    assert "0ne tw0" in r.stdout, r.stderr


def test_a_budget_kills_the_job_and_writes_a_checkpoint(tmp_path):
    """Decision 0106: `--budget <min>` is a hard stop with a checkpoint line."""
    load = tmp_path / "loadavg"
    load.write_text("0.10 0.10 0.10 1/1 1\n")
    env = {**os.environ, "ES_JOB_LOCK_DIR": str(tmp_path / "locks"), "ES_JOB_LOADAVG_FILE": str(load),
           "ES_JOB_WAIT_S": "0", "ES_JOB_POLL_S": "0", "ES_JOB_MIN_FREE_GB": "0",
           "ES_JOB_MEM_CEILING_MIB": "100000000", "ES_JOB_CPUS": "0",
           "ES_BUDGET_DIR": str(tmp_path / "budget")}
    r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "lane9", "--budget", "0.02", "--", "sleep 3; echo ran"],
                       env=env, capture_output=True, text=True, timeout=60)
    # a 1.2 s budget stops a 3 s job: the timeout exit, the checkpoint line
    assert r.returncode == 124, r.stderr
    assert "BUDGET 0.02 min" in (tmp_path / "budget" / "lane9.checkpoint").read_text()
    for bad in ("x", "0", "0.0"):
        r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "lane9", "--budget", bad, "--", "echo"],
                           env=env, capture_output=True, text=True, timeout=60)
        assert r.returncode == 2, bad
    # a job's own exit 124 inside its budget is not a budget stop
    r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "lane8", "--budget", "5", "--", "exit 124"],
                       env=env, capture_output=True, text=True, timeout=60)
    assert r.returncode == 124 and not (tmp_path / "budget" / "lane8.checkpoint").exists()
