#!/usr/bin/env python3
"""Weekly workflow drift check (decision 0106; cost-review § Workflow drift).

Prints the drift measures over the last N days (default 7), each with its red
threshold, and exits 1 when any is red. Reads only local logs (< 1 s):
  preflight runs      tooling/.reports/preflight/runs.jsonl (preflight.mjs)
  commits             git log --since
  review fires        tooling/.reports/review/reviews.jsonl (review_gate.py, append-only)
  miner full runs     tooling/repo-standards/output/tool-timings.jsonl (memwatch)
  lanes over budget   tooling/.reports/budget/*.checkpoint (job_guard.sh --budget)

    python3 tooling/repo-standards/workflow_drift.py [--days 7]
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / "tooling/.reports/preflight/runs.jsonl"
REVIEWS = ROOT / "tooling/.reports/review/reviews.jsonl"  # append-only (review_gate.py, decision 0118)
TIMINGS = ROOT / "tooling/repo-standards/output/tool-timings.jsonl"
BUDGET = ROOT / "tooling/.reports/budget"
CODE = re.compile(r"^(packages|apps|tooling)/.+\.(py|ts|tsx|mjs|js)$|^(packages|apps|tooling)/?$")
SCOPED = ("--assets", "--only", "--set", "--sample", "--rederive", "--refresh-derived",
          "--complete-only", "--dump-meshes", "--help")

RED = {"preflightPerCommit": 1.5, "scopedWallP50S": 30, "scopedOver60S": 0,
       "reviewFiresOnNonCode": 0, "reviewFiresPerBatchMax": 1, "minerFullRuns": 1, "lanesOverBudget": 2}


def _jsonl(path: Path) -> list[dict]:
    """The log's rows; a torn or foreign line (parallel appenders) is skipped."""
    try:
        lines = path.read_text().splitlines()
    except OSError:
        return []
    rows = []
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def _epoch(iso) -> float:
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def measure(days: float) -> dict:
    since = time.time() - days * 86400
    runs = [r for r in _jsonl(RUNS) if _epoch(r.get("at")) >= since and "wallS" in r]
    scoped = sorted(r["wallS"] for r in runs if not r.get("runner"))
    commits = int(subprocess.run(["git", "rev-list", "--count", f"--since={int(since)}", "HEAD"],
                                 cwd=ROOT, capture_output=True, text=True).stdout.strip() or 0)
    fires = [s for s in _jsonl(REVIEWS) if s.get("time", 0) >= since]
    non_code = [s for s in fires if s.get("paths") and not any(CODE.match(p) for p in s["paths"])]
    per_batch = Counter(s.get("batchId") or s.get("head") for s in fires)
    miners = [t for t in _jsonl(TIMINGS) if _epoch(t.get("date")) >= since
              and re.search(r"mine_(abuts|mounts|designed_sink)", t.get("tool", "") + " ".join(t.get("args", [])))
              and not any(a.startswith(SCOPED) for a in t.get("args", []))]
    over = 0
    for f in BUDGET.glob("*.checkpoint") if BUDGET.is_dir() else []:
        over += sum(1 for line in f.read_text().splitlines() if line and _epoch(line.split()[0]) >= since)
    return {"days": days, "commits": commits, "preflightRuns": len(runs),
            "preflightPerCommit": round(len(runs) / commits, 2) if commits else float(len(runs)),
            "scopedWallP50S": scoped[len(scoped) // 2] if scoped else 0,
            "scopedOver60S": sum(1 for w in scoped if w > 60),
            "reviewFires": len(fires), "reviewFiresOnNonCode": len(non_code),
            "reviewFiresPerBatchMax": max(per_batch.values(), default=0),
            "minerFullRuns": len(miners), "lanesOverBudget": over}


def main() -> int:
    days = float(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 7.0
    m = measure(days)
    red = [k for k, limit in RED.items() if m[k] > limit]
    for k, v in m.items():
        flag = f"  RED (> {RED[k]})" if k in red else (f"  (red > {RED[k]})" if k in RED else "")
        print(f"{k:22} {v}{flag}")
    print("workflow drift: " + (f"RED on {', '.join(red)}" if red else "green"))
    return 1 if red else 0


if __name__ == "__main__":
    sys.exit(main())
