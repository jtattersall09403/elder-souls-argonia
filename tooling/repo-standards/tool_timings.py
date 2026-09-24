"""Which tools cost the most time and memory? Ranks memwatch.sh's run log.

    python3 tooling/repo-standards/tool_timings.py [--days N] [--top K] [--log PATH]

Every `memwatch.sh` run appends one JSON line to `output/tool-timings.jsonl`
(gitignored; `MEMWATCH_TIMINGS_LOG` overrides the path). This prints two
tables over the last N days: tools by total wall time (tools whose name
starts with an `--exclude` prefix left out; default `npm.`, preflight's own
gate wrappers) and by worst single run (always complete). Memory is
`deltaGiB`, the cgroup's peak minus its level when the run started, because
the cgroup also holds every other session on the VM; the raw peak stays in
the line. `TARGET` marks a tool whose worst run passed 60 s or whose delta
passed 2 GiB: a candidate for a step-C profile (16h ledger §6 steps C and D).
`--record` is memwatch's writer and `record()` the in-process one
(site_fields' ES_TIMINGS=1 import timing), so the naming lives here only.
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DEFAULT_LOG = HERE / "output" / "tool-timings.jsonl"
SLOW_S = 60.0
HEAVY_GIB = 2.0
SEPARATORS = {"&&", "||", ";", "|"}


def log_path() -> Path:
    return Path(os.environ.get("MEMWATCH_TIMINGS_LOG") or DEFAULT_LOG)


def _dotted(path: str) -> str:
    """pipeline/render_assembly.py -> pipeline.render_assembly (last folder + stem)."""
    p = Path(path)
    return f"{p.parent.name}.{p.stem}" if p.parent.name else p.stem


def _name(seg: list[str]) -> tuple[str, list[str]] | None:
    while seg and "=" in seg[0] and not seg[0].startswith("-"):
        seg = seg[1:]  # leading VAR=value assignments
    if not seg:
        return None
    cmd = Path(seg[0]).name
    rest = seg[1:]
    if cmd.startswith("python"):
        while rest and rest[0].startswith("-") and rest[0] not in ("-m", "-c"):
            rest = rest[1:]  # interpreter flags such as -u
        if rest[:1] == ["-c"]:
            return "python-c", []
        if rest[:1] == ["-m"] and len(rest) > 1:
            return rest[1], rest[2:]
        if rest:
            return _dotted(rest[0]), rest[1:]
    if cmd == "node" and rest:
        return _dotted(rest[0]), rest[1:]
    if cmd == "npm" and rest[:1] == ["run"] and len(rest) > 1:
        return f"npm.{rest[1]}", rest[2:]
    if cmd == "npm" and rest:
        return f"npm.{rest[0]}", rest[1:]
    if seg[0].endswith((".sh", ".py", ".mjs")):
        return _dotted(seg[0]), rest
    return cmd, rest


def tool_of(argv: list[str]) -> tuple[str, list[str]]:
    """Name the tool a memwatch command line runs, and the args it was given.

    The command runs as `bash -c "$*"`, so it is re-split the same way; in a
    compound line (`cd x && python3 -m y`) the first python/node/npm segment
    names the tool, else the first segment.
    """
    try:
        tokens = shlex.split(" ".join(argv))
    except ValueError:
        tokens = list(argv)
    segs, cur = [], []
    for t in tokens:
        if t in SEPARATORS:
            segs.append(cur)
            cur = []
        else:
            cur.append(t)
    segs.append(cur)
    named = [n for n in (_name(s) for s in segs) if n]
    for s in segs:
        head = [t for t in s if not ("=" in t and not t.startswith("-"))]
        if head and Path(head[0]).name.startswith(("python", "node", "npm")):
            return _name(s)
    return named[0] if named else ("?", [])


def record(wall_s: float, start_mib: int, peak_mib: int, code: int, cwd: str, argv: list[str]) -> None:
    tool, args = tool_of(argv)
    try:
        rel = os.path.relpath(cwd, REPO)
    except ValueError:
        rel = cwd
    row = {"date": datetime.now(timezone.utc).isoformat(timespec="seconds"), "tool": tool,
           "args": args, "wallS": round(wall_s, 3), "startGiB": round(start_mib / 1024, 3),
           "peakAnonGiB": round(peak_mib / 1024, 3),
           "exit": code, "cwd": rel}
    path = log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps(row) + "\n")


def load(path: Path) -> list[dict]:
    rows = []
    if not path.exists():
        return rows
    for raw in path.read_text().splitlines():
        try:
            r = json.loads(raw)
            r["_date"] = datetime.fromisoformat(r["date"])
            rows.append(r)
        except (ValueError, KeyError, TypeError):
            continue  # a torn or foreign line never breaks the report
    return rows


def delta_of(r: dict) -> float:
    """Peak minus the cgroup level at the start; clamped at 0 (others may free memory)."""
    return max(0.0, float(r.get("peakAnonGiB", 0)) - float(r.get("startGiB", 0)))


def rank(rows: list[dict], now: datetime, days: float,
         exclude: tuple[str, ...] = ()) -> tuple[list[dict], list[dict]]:
    since = now - timedelta(days=days)
    tools: dict[str, dict] = {}
    for r in rows:
        if r["_date"] < since:
            continue
        t = tools.setdefault(r["tool"], {"tool": r["tool"], "runs": 0, "total": 0.0, "worst": -1.0,
                                         "maxDelta": 0.0, "worstArgs": ""})
        wall, delta = float(r.get("wallS", 0)), delta_of(r)
        t["runs"] += 1
        t["total"] += wall
        t["maxDelta"] = max(t["maxDelta"], delta)
        if wall >= t["worst"]:
            t["worst"], t["worstArgs"] = wall, " ".join(map(str, r.get("args", [])))
    for t in tools.values():
        t["mean"] = t["total"] / t["runs"]
        t["mark"] = "TARGET" if t["worst"] > SLOW_S or t["maxDelta"] > HEAVY_GIB else ""
    kept = [t for t in tools.values() if not t["tool"].startswith(tuple(exclude))]
    by_total = sorted(kept, key=lambda t: (-t["total"], t["tool"]))
    by_worst = sorted(tools.values(), key=lambda t: (-t["worst"], t["tool"]))
    return by_total, by_worst


def table(title: str, rows: list[dict]) -> str:
    out = [title, f"{'tool':<40} {'runs':>5} {'total s':>9} {'mean s':>8} {'worst s':>8} "
                  f"{'Δ GiB':>8}  {'mark':<6}  worst run args"]
    for t in rows:
        args = t["worstArgs"] if len(t["worstArgs"]) <= 60 else t["worstArgs"][:57] + "..."
        out.append(f"{t['tool']:<40} {t['runs']:>5} {t['total']:>9.1f} {t['mean']:>8.1f} "
                   f"{t['worst']:>8.1f} {t['maxDelta']:>8.2f}  {t['mark']:<6}  {args}")
    return "\n".join(out)


def main() -> int:
    if sys.argv[1:2] == ["--record"]:
        wall, start, peak, code, cwd, *argv = sys.argv[2:]
        record(float(wall), int(start), int(peak), int(code), cwd, argv)
        return 0
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--days", type=float, default=7)
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--log", type=Path, default=None)
    ap.add_argument("--exclude", action="append", default=None, metavar="PREFIX",
                    help="leave tools with this name prefix out of the by-total table "
                         "(repeatable; default npm.; --exclude '' keeps all)")
    a = ap.parse_args()
    path = a.log or log_path()
    rows = load(path)
    if not rows:
        print(f"no runs logged in {path}")
        return 0
    exclude = tuple(p for p in (a.exclude if a.exclude is not None else ["npm."]) if p)
    by_total, by_worst = rank(rows, datetime.now(timezone.utc), a.days, exclude)
    print(f"{len(rows)} runs in {path}; window {a.days:g} days; "
          f"TARGET = worst run > {SLOW_S:g} s or peak-minus-start > {HEAVY_GIB:g} GiB\n")
    note = f" (excluding {', '.join(exclude)})" if exclude else ""
    print(table("By total wall time" + note, by_total[:a.top]))
    print()
    print(table("By worst single run", by_worst[:a.top]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
