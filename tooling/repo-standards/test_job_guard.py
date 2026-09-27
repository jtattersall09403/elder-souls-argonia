"""job_guard.sh admission and slot sizing (method review C1, 2026-09-27).

Admission is by slot, never by the 1-min load average (unless ES_JOB_MAX_LOAD
is set), and every admitted job gets its slot's core share in ES_JOB_CORES,
which pytest-xdist's `-n auto` follows through PYTEST_XDIST_AUTO_NUM_WORKERS.
"""
import os
import subprocess
from pathlib import Path

HERE = Path(__file__).parent


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
