"""Which tools cost the most time and memory? Ranks memwatch.sh's run log.

    python3 tooling/repo-standards/tool_timings.py [--days N] [--top K] [--log PATH]

Every `memwatch.sh` run appends one JSON line to `output/tool-timings.jsonl`
(gitignored; `MEMWATCH_TIMINGS_LOG` overrides the path). This prints two
tables over the last N days: tools by total wall time (tools whose name
starts with an `--exclude` prefix left out; default `npm.`, preflight's own
gate wrappers) and by worst single run (always complete). Memory has two
columns: `ownPeakGiB`, the job's own process tree (Pss_Anon + Pss_Shmem
since 2026-09-30, RssAnon + RssShmem before; own_memory.py), which is the per-job figure every target reads; and
`machineDeltaGiB`, the machine's unreclaimable peak minus its level when the
run started, which also holds every lane that ran beside it (on the EC2 box
the cgroup memwatch reads is the root one: 2026-09-26, the placement suite's
"12.7 GiB" was the machine, its own peak 3.8 GiB). Rows logged before the own
figure existed show `-` there. `TARGET` marks a tool whose worst run passed
60 s or whose own peak passed 2 GiB: a candidate for a step-C profile (16h
ledger §6 steps C and D).
`tool_targets.json` gives heavy tools a wall and an own-peak target;
`--record` prints OVER TARGET for a run past them, `--check` exits 1 when a
tool's latest run is (test_tool_timings runs it over the local log).
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
TARGETS = HERE / "tool_targets.json"
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


def record(wall_s: float, start_mib: int, peak_mib: int, code: int, cwd: str, argv: list[str],
           own_mib: int | None = None) -> None:
    tool, args = tool_of(argv)
    try:
        rel = os.path.relpath(cwd, REPO)
    except ValueError:
        rel = cwd
    row = {"date": datetime.now(timezone.utc).isoformat(timespec="seconds"), "tool": tool,
           "args": args, "wallS": round(wall_s, 3), "startGiB": round(start_mib / 1024, 3),
           "peakAnonGiB": round(peak_mib / 1024, 3),
           "exit": code, "cwd": rel}
    if own_mib is not None:
        row["ownPeakGiB"] = round(own_mib / 1024, 3)
        row["ownMeasure"] = "pss"   # own_memory.py since 2026-09-30; older rows are RssAnon
    for why in over_target(row):
        print(f"tool_timings: OVER TARGET {tool}: {why} (tooling/repo-standards/tool_targets.json)")
    path = log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps(row) + "\n")


def targets(path: Path = TARGETS) -> dict:
    return json.loads(path.read_text())


def over_target(row: dict, tg: dict | None = None) -> list[str]:
    """Why this run is over its tool's target ([] when within it, or not
    judged: a tool outside the judged prefixes and the table, or a row whose
    own peak is not PSS)."""
    tg = tg if tg is not None else targets()
    tool = row.get("tool", "")
    t = tg["tools"].get(tool)
    if t is None and not tool.startswith(tuple(tg["judgedPrefixes"])):
        return []
    t = t or {}
    out = []
    wall, cap = float(row.get("wallS", 0)), t.get("maxWallS")
    if cap is not None and wall > cap:
        out.append(f"wall {wall:.0f} s > {cap} s")
    own, gib = row.get("ownPeakGiB"), t.get("maxOwnGiB", tg["defaultMaxOwnGiB"])
    if row.get("ownMeasure") == "pss" and own is not None and float(own) > gib:
        out.append(f"own peak {float(own):.2f} GiB > {gib} GiB")
    return out


def check(rows: list[dict], now: datetime, days: float, tg: dict | None = None) -> list[str]:
    """The latest run of each judged tool in the window, over its target:
    one line per tool (a failed run is not judged)."""
    since, latest = now - timedelta(days=days), {}
    for r in rows:
        if r["_date"] >= since and r.get("exit") == 0 and \
                (r["tool"] not in latest or r["_date"] >= latest[r["tool"]]["_date"]):
            latest[r["tool"]] = r
    return [f"{tool}: {'; '.join(why)} ({r['date']} {' '.join(map(str, r.get('args', [])))[:80]})"
            for tool, r in sorted(latest.items()) if (why := over_target(r, tg))]


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


def machine_delta_of(r: dict) -> float:
    """Machine peak minus the machine level at the start; clamped at 0 (others may
    free memory). Includes every concurrent job: never a per-job target."""
    return max(0.0, float(r.get("peakAnonGiB", 0)) - float(r.get("startGiB", 0)))


def own_of(r: dict) -> float | None:
    """The job's own process-tree peak, or None on a row logged before it existed."""
    v = r.get("ownPeakGiB")
    return None if v is None else float(v)


def rank(rows: list[dict], now: datetime, days: float,
         exclude: tuple[str, ...] = ()) -> tuple[list[dict], list[dict]]:
    since = now - timedelta(days=days)
    tools: dict[str, dict] = {}
    for r in rows:
        if r["_date"] < since:
            continue
        t = tools.setdefault(r["tool"], {"tool": r["tool"], "runs": 0, "total": 0.0, "worst": -1.0,
                                         "maxOwn": None, "machineDeltaGiB": 0.0, "worstArgs": ""})
        wall, own = float(r.get("wallS", 0)), own_of(r)
        t["runs"] += 1
        t["total"] += wall
        t["machineDeltaGiB"] = max(t["machineDeltaGiB"], machine_delta_of(r))
        if own is not None:
            t["maxOwn"] = own if t["maxOwn"] is None else max(t["maxOwn"], own)
        if wall >= t["worst"]:
            t["worst"], t["worstArgs"] = wall, " ".join(map(str, r.get("args", [])))
    for t in tools.values():
        t["mean"] = t["total"] / t["runs"]
        t["mark"] = "TARGET" if t["worst"] > SLOW_S or (t["maxOwn"] or 0.0) > HEAVY_GIB else ""
    kept = [t for t in tools.values() if not t["tool"].startswith(tuple(exclude))]
    by_total = sorted(kept, key=lambda t: (-t["total"], t["tool"]))
    by_worst = sorted(tools.values(), key=lambda t: (-t["worst"], t["tool"]))
    return by_total, by_worst


def table(title: str, rows: list[dict]) -> str:
    out = [title, f"{'tool':<40} {'runs':>5} {'total s':>9} {'mean s':>8} {'worst s':>8} "
                  f"{'own GiB':>8} {'mach Δ':>8}  {'mark':<6}  worst run args"]
    for t in rows:
        args = t["worstArgs"] if len(t["worstArgs"]) <= 60 else t["worstArgs"][:57] + "..."
        own = "-" if t["maxOwn"] is None else f"{t['maxOwn']:.2f}"
        out.append(f"{t['tool']:<40} {t['runs']:>5} {t['total']:>9.1f} {t['mean']:>8.1f} "
                   f"{t['worst']:>8.1f} {own:>8} {t['machineDeltaGiB']:>8.2f}  {t['mark']:<6}  {args}")
    return "\n".join(out)


def main() -> int:
    if sys.argv[1:2] == ["--record"]:
        wall, start, peak, code, cwd, *argv = sys.argv[2:]
        own = None
        if argv[:1] == ["--own-mib"]:
            own, argv = int(argv[1]), argv[2:]
        record(float(wall), int(start), int(peak), int(code), cwd, argv, own_mib=own)
        return 0
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--days", type=float, default=7)
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--log", type=Path, default=None)
    ap.add_argument("--check", action="store_true",
                    help="exit 1 when the latest run of a tool in the window is over its "
                         "tool_targets.json target (wall or own peak)")
    ap.add_argument("--exclude", action="append", default=None, metavar="PREFIX",
                    help="leave tools with this name prefix out of the by-total table "
                         "(repeatable; default npm.; --exclude '' keeps all)")
    a = ap.parse_args()
    path = a.log or log_path()
    rows = load(path)
    if not rows:
        print(f"no runs logged in {path}")
        return 0
    if a.check:
        over = check(rows, datetime.now(timezone.utc), a.days)
        print("\n".join(over) if over else f"all tools within target (last {a.days:g} days)")
        return 1 if over else 0
    exclude = tuple(p for p in (a.exclude if a.exclude is not None else ["npm."]) if p)
    by_total, by_worst = rank(rows, datetime.now(timezone.utc), a.days, exclude)
    print(f"{len(rows)} runs in {path}; window {a.days:g} days; "
          f"TARGET = worst run > {SLOW_S:g} s or own peak > {HEAVY_GIB:g} GiB "
          f"(own = the job's process tree; mach Δ = the machine, every lane beside it)\n")
    note = f" (excluding {', '.join(exclude)})" if exclude else ""
    print(table("By total wall time" + note, by_total[:a.top]))
    print()
    print(table("By worst single run", by_worst[:a.top]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
