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


def _env(tmp_path, **extra):
    load = tmp_path / "loadavg"
    load.write_text("0.10 0.10 0.10 1/1 1\n")
    return {**os.environ, "ES_JOB_LOCK_DIR": str(tmp_path / "locks"), "ES_JOB_LOADAVG_FILE": str(load),
            "ES_JOB_WAIT_S": "0", "ES_JOB_POLL_S": "0", "ES_JOB_MIN_FREE_GB": "0",
            "ES_JOB_MEM_CEILING_MIB": "100000000", "ES_JOB_CPUS": "0",
            "ES_JOB_LOG_DIR": str(tmp_path / "logs"), **extra}


def test_a_job_past_its_cap_dies_alone_and_is_logged(tmp_path):
    """2026-09-30: two OOM kills of a 30 GB python3 took the whole session down
    and left no trace. A job past its --mem cap dies alone in its own scope
    (prlimit fallback: MemoryError), the shell that launched it survives, and
    the log and the job's stderr say what died and why."""
    line = f"bash {HERE / 'job_guard.sh'} hog --mem 0.25 -- python3 -c \"b = b'x' * (600 << 20)\"; echo survived $?"
    r = subprocess.run(["bash", "-c", line], env=_env(tmp_path), capture_output=True, text=True, timeout=60)
    assert "survived" in r.stdout and not r.stdout.strip().endswith(" 0"), r.stderr
    text = next((tmp_path / "logs").glob("hog-*.log")).read_text()
    assert "cap 0.25 GiB" in text and "cmd: python3 -c" in text and "child pid" in text
    assert "\nend " in text and "guard exit" in text
    if "via systemd" in text:
        assert r.stdout.strip().endswith("survived 137") and "oomKills 1 (KILLED AT THE CAP)" in text, text
        assert "killed: memory cap 0.25 GiB exceeded, peak 0.25 GiB, cmd python3 -c" in text
        assert "killed: memory cap 0.25 GiB exceeded" in r.stderr
    assert not (tmp_path / "locks" / "light-0.lock").read_text()   # the (light, --mem <= 2) slot is freed


def test_admission_counts_the_live_slots_measured_memory(tmp_path):
    import fcntl
    import time
    (tmp_path / "locks").mkdir()
    hog = subprocess.Popen(["python3", "-c", "import sys, time; b = b'x' * (300 << 20); print(1, flush=True); time.sleep(60)"],
                           stdout=subprocess.PIPE, text=True)
    try:
        hog.stdout.readline()                              # 300 MiB resident
        held = tmp_path / "locks" / "light-0.lock"
        held.write_text(f"2026-09-30T00:00:00Z other pid {hog.pid} mem 24576: python3 big.py\n")
        with open(held, "a") as f:
            fcntl.flock(f, fcntl.LOCK_EX)                  # slot 0 is live
            env = _env(tmp_path, ES_JOB_LIGHT_SLOTS="2", ES_JOB_MEM_TOTAL_GIB="0.3")
            r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--mem", "0.1", "--", "echo ran"],
                               env=env, capture_output=True, text=True, timeout=60)
            assert r.returncode == 75 and "memory: live slots hold 0.3 GiB measured" in r.stderr, r.stderr
            env["ES_JOB_MEM_TOTAL_GIB"] = "1"
            r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--mem", "0.1", "--", "echo ran"],
                               env=env, capture_output=True, text=True, timeout=60)
            assert r.returncode == 0 and "ran" in r.stdout, r.stderr   # declared caps never block
    finally:
        hog.kill()
    r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--mem", "30", "--", "echo ran"],
                       env=_env(tmp_path), capture_output=True, text=True, timeout=60)
    assert r.returncode == 2 and "REFUSED" in r.stderr
    r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--mem", "x", "--", "echo ran"],
                       env=_env(tmp_path), capture_output=True, text=True, timeout=60)
    assert r.returncode == 2


def test_a_light_job_never_waits_for_the_heavy_slots(tmp_path):
    """A pod-driving job (--mem <= 2) takes a light slot even when every heavy slot is held;
    a heavy job (default cap) still waits for a heavy slot."""
    import fcntl
    (tmp_path / "locks").mkdir()
    held = tmp_path / "locks" / "slot-0.lock"
    held.write_text("x")
    with open(held, "a") as f:
        fcntl.flock(f, fcntl.LOCK_EX)                      # the one heavy slot is busy
        env = _env(tmp_path, ES_JOB_SLOTS="1")
        r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--mem", "2", "--", "echo ran"],
                           env=env, capture_output=True, text=True, timeout=60)
        assert r.returncode == 0 and "ran" in r.stdout and "light 1/4" in r.stderr, r.stderr
        r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--", "echo ran"],
                           env=env, capture_output=True, text=True, timeout=60)
        assert r.returncode == 75 and "all 1 heavy slot(s) busy" in r.stderr, r.stderr
        r = subprocess.run(["bash", str(HERE / "job_guard.sh"), "t", "--mem", "3", "--", "echo ran"],
                           env=env, capture_output=True, text=True, timeout=60)
        assert r.returncode == 75, r.stderr                # over 2 GiB is heavy


def test_the_job_log_samples_the_load_average(tmp_path):
    """walk-6 audit: job logs could not show CPU saturation; memwatch logs load1."""
    line = f"bash {HERE / 'job_guard.sh'} ld -- python3 -c \"import time; time.sleep(1.5)\""
    env = {**_env(tmp_path), "MEMWATCH_LOAD_S": "1"}
    subprocess.run(["bash", "-c", line], env=env, capture_output=True, text=True, timeout=60)
    text = next((tmp_path / "logs").glob("ld-*.log")).read_text()
    assert "started" in text and text.count("load1 ") >= 2, text


def test_memwatch_survives_an_edit_of_itself_mid_run(tmp_path):
    """d6ecbe55: a running memwatch re-read its edited file and died 'next_load: unbound'."""
    import shutil, time
    copy = tmp_path / "memwatch.sh"
    shutil.copy(HERE / "memwatch.sh", copy)
    shutil.copy(HERE / "own_memory.py", tmp_path / "own_memory.py")
    rep = tmp_path / "rep.log"
    env = {**_env(tmp_path), "MEMWATCH_LOAD_S": "1", "MEMWATCH_REPORT": str(rep)}
    p = subprocess.Popen(["bash", str(copy), "sleep 2"], env=env, stderr=subprocess.PIPE, text=True)
    time.sleep(0.7)
    copy.write_text("# pad\n" * 40 + (HERE / "memwatch.sh").read_text())  # in-place, longer
    err = p.communicate(timeout=60)[1]
    assert p.returncode == 0 and "unbound" not in err, err
    assert "end " in rep.read_text()
