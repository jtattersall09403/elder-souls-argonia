#!/usr/bin/env python3
"""The build ledger: what each place build cost, as data (16k § Build cost is
measured as data, owner 2026-09-27).

One JSON row per line in docs/phases/16-foundation-and-places/build-ledger.jsonl,
written by the tools, never by hand:

    build_ledger.py append --from-rounds <rounds.jsonl> --place <id> [--path P] [--type T] [--start-run]
    build_ledger.py append --from-gates <place-gates.json>      # place_gates calls this
    build_ledger.py append --from-close <close.json>            # close_place calls this
    build_ledger.py --report                                    # trend + runs over target

Row: schemaVersion, source (rounds|gates|close), placeId, type, path
(new-type|template|fix-round), skillSha and workbenchSha (the last commit of
.claude/skills/place-build/SKILL.md and of tooling/placement-workbench),
recordedAt, wallMin (minutes per stage; a rounds row counts only the rounds
not yet recorded for the place, keyed by roundKeys = at|layoutSha256), turns and cpuMin (null until a tool
measures them), rounds, defects (null until the owner's walk), sourceSha256
(the input file's hash: the same input is never appended twice).

A run is one build pass of one place on one path, judged alone against its
path's target. Every row carries its runId (`<place>#<n>`): it joins the
place's open run, or starts a new one when there is none, when it passes
`--start-run`, or when its `--path` differs from the open run's. The path is
fixed when the run starts (given, else fix-round for a place that already
closed, template when another place of the type has closed, else new-type);
a close row ends the run. A walk's fix round starts its own run
(`--start-run --path fix-round`). Appends hold an exclusive flock on
worldgen.atomic_write.write_lock_path(ledger).
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import statistics
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEDGER = os.path.join(ROOT, "docs", "phases", "16-foundation-and-places", "build-ledger.jsonl")
SKILL_PATH = ".claude/skills/place-build/SKILL.md"
WORKBENCH_PATH = "tooling/placement-workbench"
SCHEMA_VERSION = 1
PATHS = ("new-type", "template", "fix-round")
# Wall-minute targets per build path, 16k-place-loop.md § Build cost is
# measured as data (owner 2026-09-27): new type ~40, template ~17, fix round ~10.
TARGET_MIN = {"new-type": 40.0, "template": 17.0, "fix-round": 10.0}
# rounds.jsonl stage fields (wb.py run_round) -> ledger stage names
ROUND_STAGES = (("loadS", "load"), ("applyOpsS", "apply"), ("checkS", "check"),
                ("compileS", "compile"), ("planS", "plan"), ("shotsS", "shots"),
                ("totalS", "total"))


def git_sha(path: str, root: str = ROOT) -> str | None:
    out = subprocess.run(["git", "log", "-1", "--format=%H", "--", path], cwd=root,
                         capture_output=True, text=True).stdout.strip()
    return out or None


def place_type(place_id: str) -> str | None:
    """The catalogue record's `classification.type` (worldgen.place_type, the one reader)."""
    return _place_type_mod().place_type(place_id)


def _place_type_mod():
    sys.path.insert(0, os.path.join(ROOT, "tooling", "world-generation"))
    from worldgen import place_type as mod
    return mod


def read_rows(ledger: str = LEDGER) -> list[dict]:
    if not os.path.exists(ledger):
        return []
    with open(ledger) as f:
        return [json.loads(line) for line in f if line.strip()]


def infer_path(rows: list[dict], ptype: str | None, place_id: str) -> str:
    """The path of a run starting now: fix-round when the place already has a
    close row (a reopened place), template when another place of its type
    has one, else new-type. A walk's fix round is started explicitly
    (`--start-run --path fix-round`)."""
    closed = {r["placeId"] for r in rows if r.get("source") == "close" and r.get("type") == ptype
              and ptype is not None}
    if any(r.get("source") == "close" and r.get("placeId") == place_id for r in rows):
        return "fix-round"
    return "template" if closed - {place_id} else "new-type"


def open_run(rows: list[dict], place_id: str) -> dict | None:
    """The place's latest run if no close row ended it: {"runId", "path"}."""
    mine = [r for r in rows if r.get("placeId") == place_id and r.get("runId")]
    if not mine or mine[-1].get("source") == "close":
        return None
    last = mine[-1]["runId"]
    return {"runId": last, "path": next(r["path"] for r in mine if r["runId"] == last)}


def lock_path(ledger: str) -> str:
    """The ledger's write lock: worldgen.atomic_write.write_lock_path, the one convention."""
    sys.path.insert(0, os.path.join(ROOT, "tooling", "world-generation"))
    from worldgen.atomic_write import write_lock_path
    path = write_lock_path(ledger)
    path.parent.mkdir(parents=True, exist_ok=True)
    return str(path)


def file_sha(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def base_row(source: str, place_id: str, src_path: str) -> dict:
    return {"schemaVersion": SCHEMA_VERSION, "source": source, "placeId": place_id,
            "type": None, "path": None,
            "skillSha": git_sha(SKILL_PATH), "workbenchSha": git_sha(WORKBENCH_PATH),
            "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "wallMin": None, "turns": None, "cpuMin": None, "rounds": None, "defects": None,
            "sourceSha256": file_sha(src_path)}


def round_key(r: dict) -> str:
    """A round's identity in rounds.jsonl: its time and layout hash (wb.py run_round)."""
    return f"{r.get('at')}|{r.get('layoutSha256')}"


def row_from_rounds(src: str, place_id: str) -> dict:
    """A rounds row over every round in `src`; `append` keeps only the rounds
    the ledger has not yet recorded for the place (wb.py appends to one
    rounds.jsonl for a scene's whole life, so a later append would otherwise
    count the earlier rounds again)."""
    with open(src) as f:
        rounds = [json.loads(line) for line in f if line.strip()]
    row = base_row("rounds", place_id, src)
    row["_rounds"] = rounds
    return row


def finish_rounds(row: dict, seen: set[str]) -> bool:
    """Fill wallMin, rounds and roundKeys from the rounds not in `seen`; False if none are new."""
    rounds = [r for r in row.pop("_rounds") if round_key(r) not in seen]
    if not rounds:
        return False
    wall = {}
    for key, name in ROUND_STAGES:
        vals = [r[key] for r in rounds if isinstance(r.get(key), (int, float))]
        if vals:
            wall[name] = round(sum(vals) / 60.0, 3)
    row["wallMin"] = wall
    row["rounds"] = len(rounds)
    row["roundKeys"] = sorted(round_key(r) for r in rounds)
    return True


def row_from_gates(src: str) -> dict:
    with open(src) as f:
        doc = json.load(f)
    row = base_row("gates", doc["placeId"], src)
    wall = {"gates": round(float(doc.get("wallS") or 0.0) / 60.0, 3)}
    for g in doc.get("gates", []):
        if isinstance(g.get("seconds"), (int, float)):
            wall[f"gate:{g['id']}"] = round(g["seconds"] / 60.0, 3)
    row["wallMin"] = wall
    row["gatesOk"] = bool(doc.get("ok"))
    if doc.get("path") in PATHS:
        row["path"] = doc["path"]
    return row


def row_from_close(src: str) -> dict:
    with open(src) as f:
        doc = json.load(f)
    row = base_row("close", doc["placeId"], src)
    row["type"] = doc.get("type")
    if doc.get("path") in PATHS:
        row["path"] = doc["path"]
    for k in ("acceptedOn", "turns", "cpuMin", "defects"):
        if k in doc:
            row[k] = doc[k]
    return row


def append(row: dict, ledger: str = LEDGER, place_type_of=place_type, start_run: bool = False) -> bool:
    """Append `row` under the lock; False (nothing written) when a row with the
    same source and input hash is already there."""
    os.makedirs(os.path.dirname(ledger), exist_ok=True)
    with open(lock_path(ledger), "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        rows = read_rows(ledger)
        if any(r.get("source") == row["source"] and r.get("sourceSha256") == row["sourceSha256"]
               and r.get("placeId") == row["placeId"] for r in rows):
            return False
        if "_rounds" in row:
            seen = {k for r in rows if r.get("placeId") == row["placeId"] for k in r.get("roundKeys", [])}
            if not finish_rounds(row, seen):
                return False
        if row.get("type") is None:
            row["type"] = place_type_of(row["placeId"])
        # A row belongs to ONE run whose path was fixed when the run started:
        # it joins the place's open run unless it asks for a new one
        # (start_run, or a --path other than the open run's).
        cur = open_run(rows, row["placeId"])
        asked = row.get("path")
        if cur and not start_run and asked in (None, cur["path"]):
            row["runId"], row["path"] = cur["runId"], cur["path"]
        else:
            n = len({r["runId"] for r in rows if r.get("placeId") == row["placeId"] and r.get("runId")})
            row["runId"] = f"{row['placeId']}#{n + 1}"
            row["path"] = asked or infer_path(rows, row["type"], row["placeId"])
        with open(ledger, "a") as f:
            f.write(json.dumps(row, sort_keys=True) + "\n")
            f.flush()
            os.fsync(f.fileno())
    return True


def run_minutes(row: dict) -> float | None:
    """A row's tool wall minutes: the rounds' total, or the gates' wall."""
    wall = row.get("wallMin") or {}
    if row.get("source") == "rounds":
        return wall.get("total")
    if row.get("source") == "gates":
        return wall.get("gates")
    return None


def runs(rows: list[dict]) -> list[dict]:
    """One entry per run (runId): its rounds and gates minutes summed, judged
    alone against its own path's target; the run's last skill sha."""
    by = {}
    for r in rows:
        m = run_minutes(r)
        if m is None or not r.get("runId"):
            continue
        run = by.setdefault(r["runId"], {"runId": r["runId"], "placeId": r["placeId"],
                                         "path": r.get("path") or "unknown", "minutes": 0.0,
                                         "rounds": 0, "skillSha": None})
        run["minutes"] += m
        run["rounds"] += r.get("rounds") or 0
        run["skillSha"] = r.get("skillSha") or run["skillSha"]
    return [by[k] for k in sorted(by)]


def over_target(run: dict) -> bool:
    t = TARGET_MIN.get(run["path"])
    return t is not None and run["minutes"] > t


def report(rows: list[dict]) -> str:
    rs = runs(rows)
    lines = [f"build ledger: {len(rows)} row(s), {len(rs)} run(s); tool wall minutes "
             f"(targets: {', '.join(f'{k} {v:g}' for k, v in TARGET_MIN.items())})"]

    def trend(label, key):
        groups = {}
        for r in rs:
            groups.setdefault(r[key] or "unknown", []).append(r)
        lines.append(f"by {label}:")
        for k in sorted(groups):
            mins = [r["minutes"] for r in groups[k]]
            over = sum(over_target(r) for r in groups[k])
            lines.append(f"  {k[:12] if key == 'skillSha' else k}: n={len(mins)} "
                         f"median {statistics.median(mins):.1f} min {min(mins):.1f} "
                         f"max {max(mins):.1f} over target {over}")
    trend("path", "path")
    trend("skill sha", "skillSha")
    over = [r for r in rs if over_target(r)]
    lines.append(f"over target: {len(over)}")
    for r in over:
        lines.append(f"  {r['runId']} {r['path']} {r['minutes']:.1f} min > "
                     f"{TARGET_MIN[r['path']]:g} (skill {str(r['skillSha'])[:12]}); file a tooling task")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("cmd", nargs="?", choices=["append"])
    ap.add_argument("--from-rounds")
    ap.add_argument("--from-gates")
    ap.add_argument("--from-close")
    ap.add_argument("--place")
    ap.add_argument("--path", choices=PATHS)
    ap.add_argument("--type")
    ap.add_argument("--start-run", action="store_true",
                    help="this row starts a new run (a walk's fix round: --start-run --path fix-round)")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--ledger", default=LEDGER)
    a = ap.parse_args(argv)
    if a.report:
        print(report(read_rows(a.ledger)))
        return 0
    if a.cmd != "append":
        ap.error("append --from-rounds|--from-gates|--from-close, or --report")
    sources = [s for s in (a.from_rounds, a.from_gates, a.from_close) if s]
    if len(sources) != 1:
        ap.error("append takes exactly one of --from-rounds, --from-gates, --from-close")
    if a.from_rounds:
        if not a.place:
            ap.error("--from-rounds needs --place (rounds.jsonl rows carry no place id)")
        row = row_from_rounds(a.from_rounds, a.place)
    elif a.from_gates:
        row = row_from_gates(a.from_gates)
    else:
        row = row_from_close(a.from_close)
    if a.path:
        row["path"] = a.path
    if a.type:
        row["type"] = a.type
    wrote = append(row, a.ledger, start_run=a.start_run)
    print(f"build_ledger: {'appended' if wrote else 'already recorded'} {row['source']} row "
          f"for {row['placeId']} ({row.get('path') or 'path inferred'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
