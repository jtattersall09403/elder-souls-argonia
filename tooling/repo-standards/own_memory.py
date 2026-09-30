"""The memory a job's own process tree holds: memwatch.sh's per-job figure.

    python3 own_memory.py --watch ROOT_PID OUT_FILE [INTERVAL_S]
    python3 own_memory.py --tree PID...     (MiB now over the trees; job_guard admission)

Sums RssAnon + RssShmem (private and shared-anonymous resident memory; file
pages, which the kernel reclaims, are left out) over ROOT_PID and every
process descended from it, every INTERVAL_S (0.5), and rewrites OUT_FILE with
the peak in MiB each time it rises; it stops when ROOT_PID is gone or a
zombie. The walk follows parent links, so a descendant that calls setsid (a
nested memwatch, a preflight gate) is still counted; a process re-parented
away from the tree (a daemon that double-forks) is not.

Why (2026-09-26, tooling/.reports/orient-2026-09-26/placement-test-memory.md):
memwatch.sh's cgroup figure is the ROOT cgroup on the EC2 box, i.e. the whole
machine, so a job's logged peak included every concurrent lane (the placement
suite's "12.7 GiB" was 3.8 GiB of its own).
"""
from __future__ import annotations

import os
import sys
import time


def _status(pid: int) -> dict[str, int] | None:
    out: dict[str, int] = {}
    try:
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                key, _, val = line.partition(":")
                if key in ("PPid", "RssAnon", "RssShmem"):
                    out[key] = int(val.split()[0])
                elif key == "State" and val.split()[0] == "Z":
                    out["zombie"] = 1
    except (OSError, ValueError, IndexError):
        return None
    return out


def tree_kib(root: int) -> tuple[int, bool]:
    """(RssAnon + RssShmem KiB over root's tree, root still running)."""
    info: dict[int, dict[str, int]] = {}
    for name in os.listdir("/proc"):
        if name.isdigit():
            s = _status(int(name))
            if s is not None:
                info[int(name)] = s
    kids: dict[int, list[int]] = {}
    for pid, s in info.items():
        kids.setdefault(s.get("PPid", 0), []).append(pid)
    alive = root in info and "zombie" not in info[root]
    total, todo = 0, [root]
    while todo:
        pid = todo.pop()
        s = info.get(pid)
        if s is not None:
            total += s.get("RssAnon", 0) + s.get("RssShmem", 0)
        todo.extend(kids.get(pid, ()))
    return total, alive


def watch(root: int, out: str, interval: float = 0.5) -> int:
    peak = -1
    while True:
        kib, alive = tree_kib(root)
        if kib // 1024 > peak:
            peak = kib // 1024
            tmp = f"{out}.tmp"
            with open(tmp, "w") as f:
                f.write(f"{peak}\n")
            os.replace(tmp, out)
        if not alive:
            return 0
        time.sleep(interval)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--tree"] and len(sys.argv) > 2:   # job_guard admission: MiB now over the trees
        print(sum(tree_kib(int(p))[0] for p in sys.argv[2:]) // 1024)
        sys.exit(0)
    if sys.argv[1:2] != ["--watch"] or len(sys.argv) not in (4, 5):
        print(__doc__.splitlines()[2].strip(), file=sys.stderr)
        sys.exit(2)
    sys.exit(watch(int(sys.argv[2]), sys.argv[3], float(sys.argv[4]) if len(sys.argv) == 5 else 0.5))
