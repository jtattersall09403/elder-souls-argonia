"""One fork pool for the workbench's independent measurements (speed lane,
owner 2026-09-27): `check`'s per-piece rows, near pairs and scene rules,
and `scan`'s candidate poses. Workers are forked AFTER the catalogue, the
ground and the scene are loaded, so they inherit them (copy on write) and
only an index crosses the pipe; results come back in task order, so a
parallel run returns exactly what the serial loop returns.

Cores: under `job_guard.sh` the pool cores idle at fork time (sampled from
/proc/stat over `IDLE_SAMPLE_S`), at most `MAX_WORKERS`, never fewer than
the slot's share `ES_JOB_CORES` (2 on the 8-vCPU box; walk 3 L8 rec 1: the
share alone cost an idle-machine apply 5 s and bought no throughput); else
every core the process may run on except core 0 (the shell and the owner's
studio), at most `MAX_WORKERS`. `WB_WORKERS` overrides both; `WB_WORKERS=1`
(or a single task) runs serially in-process."""
from __future__ import annotations

import os

MAX_WORKERS = 7
#: the /proc/stat sample that decides which pool cores are idle, and the idle
#: share of that sample a core needs to count as free
IDLE_SAMPLE_S = 0.1
IDLE_MIN_SHARE = 0.5
_TASKS: list = []          # set just before the fork; the workers read their copy


def cores() -> list[int]:
    try:
        allowed = sorted(os.sched_getaffinity(0))
    except AttributeError:                      # not Linux
        allowed = list(range(os.cpu_count() or 1))
    rest = [c for c in allowed if c != 0]
    return rest or allowed


def _cpu_times() -> dict[int, tuple[int, int]]:
    """{core: (idle + iowait jiffies, total jiffies)} from /proc/stat."""
    out = {}
    with open("/proc/stat") as fh:
        for line in fh:
            head, _, rest = line.partition(" ")
            if head.startswith("cpu") and head[3:].isdigit():
                v = [int(x) for x in rest.split()]
                out[int(head[3:])] = (v[3] + (v[4] if len(v) > 4 else 0), sum(v))
    return out


def idle_cores(sample_s: float = IDLE_SAMPLE_S) -> int:
    """How many of `cores()` spent at least IDLE_MIN_SHARE of a
    `sample_s` window idle; len(cores()) where /proc/stat is unreadable."""
    import time
    pool = cores()
    try:
        a = _cpu_times()
        time.sleep(sample_s)
        b = _cpu_times()
    except OSError:
        return len(pool)
    free = 0
    for c in pool:
        if c in a and c in b:
            total = b[c][1] - a[c][1]
            if total > 0 and (b[c][0] - a[c][0]) / total >= IDLE_MIN_SHARE:
                free += 1
    return free


def workers() -> int:
    env = os.environ.get("WB_WORKERS")
    if env:
        return max(1, int(env))
    share = os.environ.get("ES_JOB_CORES")
    if share:
        # inside a pytest-xdist worker the slot's share is already split
        # across the xdist workers (job_guard sets their count to it)
        per = int(os.environ.get("PYTEST_XDIST_WORKER_COUNT") or 1) \
            if os.environ.get("PYTEST_XDIST_WORKER") else 1
        if os.environ.get("PYTEST_XDIST_WORKER"):
            return max(1, int(share) // max(1, per))
        return max(1, int(share), min(MAX_WORKERS, idle_cores()))
    return max(1, min(MAX_WORKERS, len(cores())))


def _pin() -> None:
    try:
        os.sched_setaffinity(0, cores())
    except (AttributeError, OSError):
        pass


def _run(i: int):
    fn, args = _TASKS[i]
    return fn(*args)


def run(tasks: list[tuple], n: int | None = None) -> list:
    """[fn(*args) for fn, args in tasks], across a fork pool when it pays.
    `fn` must be a module-level function (forked workers call it by name)."""
    global _TASKS
    n = workers() if n is None else n
    if n <= 1 or len(tasks) <= 1:
        return [fn(*args) for fn, args in tasks]
    import multiprocessing as mp
    _TASKS = tasks
    try:
        with mp.get_context("fork").Pool(min(n, len(tasks)), initializer=_pin) as pool:
            return pool.map(_run, range(len(tasks)), chunksize=1)
    finally:
        _TASKS = []


def chunks(items: list, parts: int) -> list[list]:
    """`items` in at most `parts` contiguous runs of near-equal length (order kept)."""
    parts = max(1, min(parts, len(items)))
    size, extra = divmod(len(items), parts)
    out, i = [], 0
    for k in range(parts):
        j = i + size + (1 if k < extra else 0)
        out.append(items[i:j])
        i = j
    return [c for c in out if c]
