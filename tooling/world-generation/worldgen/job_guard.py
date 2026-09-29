"""Run a worldgen job inside ``tooling/repo-standards/job_guard.sh``.

The CPU watchdog (``cpu_watchdog.py``) SIGSTOPs the heaviest unguarded
process one at a time while the machine sits above 95 %; a job_guard
descendant (``ES_JOB_CORES`` is its export) is never throttled, takes a
heavy slot, runs under memwatch and on the heavy-job core pool at low
priority. Greenspring 2026-09-29: an unguarded ``wb.py apply`` idled 847 s
wall on its own stopped workers (55 s guarded).

- ``guarded(cmd, lane)``: a subprocess command wrapped in job_guard.
- ``reexec_guarded(lane, module)``: a CLI entry point re-executes itself
  under job_guard (``os.execv``, same argv and cwd) unless it already runs
  under one.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
JOB_GUARD = REPO_ROOT / "tooling" / "repo-standards" / "job_guard.sh"


def under_guard() -> bool:
    return bool(os.environ.get("ES_JOB_CORES"))


def guarded(cmd: list[str], lane: str) -> list[str]:
    """``cmd`` inside ``job_guard.sh`` unless this process already runs under
    one or the script is absent (a checkout without tooling/repo-standards)."""
    if under_guard() or not JOB_GUARD.exists():
        return cmd
    return ["bash", str(JOB_GUARD), lane, "--", *cmd]


def reexec_guarded(lane: str, module: str, argv: list[str] | None = None) -> None:
    """Replace this process with ``python3 -m <module> <argv>`` under job_guard;
    returns (runs inline) when already guarded or job_guard is absent."""
    cmd = [sys.executable, "-m", module, *(sys.argv[1:] if argv is None else argv)]
    wrapped = guarded(cmd, lane)
    if wrapped is cmd:
        return
    sys.stdout.flush()
    sys.stderr.flush()
    os.execvp(wrapped[0], wrapped)
