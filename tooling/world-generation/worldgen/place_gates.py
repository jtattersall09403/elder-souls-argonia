"""Every per-place gate in one process (16k S14, method review C).

    python3 -m worldgen.place_gates --id <place-id> [--scene NAME]

Runs, for one place and without the yard regression gates:

* ``wb.rules`` - the decision 0102 check rules: ``wb.py apply <layout>`` (a
  fresh scene from the layout, then ``check``; the workbench CLI, never
  imported), with ``WB_OUTPUT`` set to ``output/gates/<place-id>/``, so its
  scene, apply summary, derived blueprint and compiled settlement never
  touch a builder's round under ``output/apply`` and ``output/scenes``;
* ``compile.<gate>`` - the compile's reader-checklist gates (spacing,
  litEntrance, cultureKit, firstSeen, openModularEnds, modularRuns,
  clearance), read from the compiled settlement's ``gateFailures``; ``compile``
  holds the compile's remaining errors;
* ``sockets`` - the 0103 socket gates (compile errors led by ``sockets.``);
* ``promises`` - ``promise_gate.promise_gate_errors`` in-process;
* ``interiors`` - ``export_interior_bundle.check`` on every tier-A door's
  published cell;
* ``0098.place`` - the per-settlement variety rows the signature measures
  (dwelling signature ratio, distinct shells, top shell share) against
  ``breadth-bars.json`` for the column the place is built under;
* ``0098.province`` - ``claim_signature.province_errors``: other places'
  claims count toward the province cap and the 2 km rule.

Writes ``tooling/.reports/16k/<place-id>/place-gates.json`` (contract 3:
schemaVersion, placeId, startedAt, wallS, ok, gates[{id, ok, seconds,
failures}]; a gate may add ``warnings``; ``notMeasured`` names the breadth
bars no gate measures yet), prints one summary line, then appends to the
build ledger when ``tooling/repo-standards/build_ledger.py`` exists.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .atomic_write import atomic_write_bytes

REPO_ROOT = Path(__file__).resolve().parents[3]
WB = REPO_ROOT / "tooling" / "placement-workbench" / "wb.py"
WB_SHARED = REPO_ROOT / "tooling" / "placement-workbench" / "output"


def gates_output(place_id: str) -> Path:
    """The workbench's per-run output for this place's gates (wb paths.WB_OUTPUT)."""
    return WB_SHARED / "gates" / place_id


def wb_env(place_id: str) -> dict:
    import os
    return {**os.environ, "WB_OUTPUT": str(gates_output(place_id))}
BLUEPRINTS = REPO_ROOT / "world" / "sources" / "blueprints"
REPORTS = REPO_ROOT / "tooling" / ".reports" / "16k"
INTERIORS = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "interiors"
LEDGER_TOOL = REPO_ROOT / "tooling" / "repo-standards" / "build_ledger.py"
SCHEMA_VERSION = 1
#: breadth-bars.json fields no gate measures yet (reported, never passed)
NOT_MEASURED = ("dressingPiecesPerDwellingWithin12mMin", "clutterPiecesMin",
                "dressingAssetKindsMin", "dressingAssetShareMax", "groundKindsMin",
                "lightKindsMin", "enclosureKindsMin")


class Gates:
    def __init__(self):
        self.rows: list[dict] = []

    def add(self, gate_id: str, seconds: float, failures, warnings=None, **extra) -> dict:
        row = {"id": gate_id, "ok": not failures, "seconds": round(seconds, 2),
               "failures": list(failures)}
        if warnings:
            row["warnings"] = list(warnings)
        row.update(extra)
        self.rows.append(row)
        return row


def _layout_path(place_id: str) -> Path:
    stem = place_id.rsplit(".", 1)[-1]
    return BLUEPRINTS / f"{stem}.layout.json"


def run_apply(layout: Path, scene: str, compile_: bool, t_start: float) -> tuple[dict | None, str]:
    """``wb.py apply``; (its summary when this run wrote it, the tail of its output)."""
    cmd = [sys.executable, str(WB), "apply", str(layout), "--scene", scene]
    if not compile_:
        cmd.append("--no-compile")
    place_id = json.loads(layout.read_text(encoding="utf-8"))["placeId"]
    got = subprocess.run(cmd, cwd=WB.parent, capture_output=True, text=True, env=wb_env(place_id))
    summary_path = gates_output(place_id) / "apply" / f"{place_id}.json"
    tail = (got.stdout + got.stderr).strip().splitlines()[-1:] or [f"exit {got.returncode}"]
    if summary_path.exists() and summary_path.stat().st_mtime >= t_start:
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        if summary.get("layoutSha256") == hashlib.sha256(layout.read_bytes()).hexdigest():
            return summary, tail[0]
    return None, tail[0]


def compile_gates(g: Gates, settlement: dict | None, why_missing: str, seconds: float) -> list[str]:
    from .compile_settlement import COMPILE_GATE_IDS
    if settlement is None:
        for gid in COMPILE_GATE_IDS + ("compile", "sockets"):
            g.add(gid, 0.0, [f"the compile did not run: {why_missing}"])
        return []
    rows = settlement.get("gateFailures") or []
    tagged = {r["message"] for r in rows}
    for gid in COMPILE_GATE_IDS:
        mine = [r for r in rows if r["gate"] == gid]
        g.add(gid, 0.0, [r["message"] for r in mine if r["grade"] == "error"],
              [r["message"] for r in mine if r["grade"] != "error"])
    errors = [str(e) for e in settlement.get("errors") or []]
    sockets = [e for e in errors if e.startswith("sockets.")]
    g.add("sockets", 0.0, sockets)
    rest = [e for e in errors if e not in tagged and e not in sockets]
    g.add("compile", seconds, rest)
    return rest


def interior_gate(g: Gates, bp: dict) -> None:
    from .export_interior_bundle import check
    t = time.time()
    failures, cells = [], []
    for door in bp.get("doors") or []:
        claim = door.get("interiorClaim") or {}
        if claim.get("tier") != "A" or not claim.get("cellId"):
            continue
        cell = claim["cellId"]
        cells.append(cell)
        path = INTERIORS / f"{cell}.json"
        if not path.exists():
            failures.append(f"{door['id']}: tier A cell {cell} has no published bundle {path.name}")
            continue
        failures += check(json.loads(path.read_text(encoding="utf-8")))
    g.add("interiors", time.time() - t, failures, cells=sorted(set(cells)))


def variety_gates(g: Gates, place_id: str, bp: dict, record: dict | None, scene: Path,
                  bp_source: str) -> None:
    from . import breadth_bars as bb
    from . import claim_signature as cl
    t = time.time()
    try:
        sigs = cl.place_signatures(place_id, scene, env=wb_env(place_id), blueprint=bp)
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        g.add("0098.place", time.time() - t, [f"no signature: {exc}"])
        g.add("0098.province", 0.0, [f"no signature: {exc}"])
        return
    from . import parcel_kinds as pk
    use = {p["id"]: p.get("use") for p in bp.get("parcels") or []}
    # the parcels the compile's density column counts (blueprint.density_column)
    counted = {p["id"] for p in pk.counted_parcels(bp, pk.kinds_of(bp), include=("building",))}
    buildings = [(s, pid) for s, pids in sigs.items() for pid in pids if pid in counted]
    dwellings = [(s, pid) for s, pid in buildings if use.get(pid) == "dwelling"]
    record_bars = bb.load()
    column = bb.built_column(len(counted), record_bars)
    failures = []
    if column is None:
        g.add("0098.place", time.time() - t, [],
              [f"{len(buildings)} counted buildings: below every breadth-bars column"])
    else:
        from .site_packet import type_sheet
        type_no = type_sheet(((record or {}).get("classification") or {}).get("type"))["number"]
        if type_no is None:        # no type sheet names the record's type: tier bars only
            row = {f: record_bars["tiers"][column][f]["value"] for f in bb.TIER_FIELDS}
        else:
            # bars_for resolves the type's overrides; its culture only picks the
            # enclosure bar, which this gate does not read
            enclosure = record_bars["enclosureKindsMin"]
            culture = (record or {}).get("culture")
            row = bb.bars_for(column, culture if culture in enclosure else sorted(enclosure)[0],
                              type_no, record_bars)
        shells = Counter(s.split(" | ", 1)[0] for s, _ in buildings)
        dwell_shells = Counter(s.split(" | ", 1)[0] for s, _ in dwellings)
        ratio = len({s for s, _ in dwellings}) / len(dwellings) if dwellings else 1.0
        top = max(dwell_shells.values()) / len(dwellings) if dwellings else 0.0
        if ratio < row["signatureRatioMin"]:
            failures.append(f"0098: dwelling signatures / dwellings {ratio:.2f} < "
                            f"{row['signatureRatioMin']} ({column})")
        if len(shells) < row["shellsMin"]:
            failures.append(f"0098: distinct shells {len(shells)} < {row['shellsMin']} ({column})")
        if top > row["topShellShareMax"]:
            failures.append(f"0098: top shell share {top:.2f} > {row['topShellShareMax']} ({column})")
        g.add("0098.place", time.time() - t, failures, column=column, typeNumber=type_no,
              blueprint=bp_source,
              measured={"buildings": len(buildings), "dwellings": len(dwellings),
                        "signatureRatio": round(ratio, 3), "shells": len(shells),
                        "topShellShare": round(top, 3)})
    t = time.time()
    cap, repeat_m = cl.province_bars()
    copies = [s for s, parcels in sigs.items() for _ in parcels]
    claims = cl.load()["claims"]
    errors = cl.province_errors(place_id, copies, claims, cap, repeat_m, cl.place_positions())
    held = Counter(c["signature"] for c in claims if c["placeId"] == place_id)
    unclaimed = sorted(s for s in sigs if held[s] != len(sigs[s]))
    g.add("0098.province", time.time() - t, errors,
          [f"{len(unclaimed)} signature(s) whose claimed copies differ from the scene "
           f"(claim_signature --from-scene)"] if unclaimed else None)


def run(place_id: str, scene_name: str | None = None) -> dict:
    t0 = time.time()
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    g = Gates()
    layout = _layout_path(place_id)
    scene = scene_name or place_id.removeprefix("place.").replace(".", "-") + "-gates"

    t = time.time()
    summary, tail = run_apply(layout, scene, True, t0)
    compiled_ok = summary is not None
    if summary is None:                       # the compile stage crashed: rules alone
        summary, tail2 = run_apply(layout, scene, False, t)
        tail = f"{tail} (rules re-run without the compile: {tail2})"
    apply_s = time.time() - t
    if summary is None:
        g.add("wb.rules", apply_s, [f"wb.py apply failed: {tail}"])
    elif summary.get("failed"):
        f = summary["failed"]
        g.add("wb.rules", apply_s, [f"op {f.get('index')} failed: {f.get('error')}"])
    else:
        g.add("wb.rules", apply_s, (summary.get("check") or {}).get("failures") or [])

    settlement, why = None, tail
    comp = (summary or {}).get("compile") or {}
    if compiled_ok and comp.get("settlement"):
        path = Path(comp["settlement"])
        if path.exists() and path.stat().st_mtime >= t0:
            settlement = json.loads(path.read_text(encoding="utf-8"))
    elif compiled_ok:
        why = comp.get("skipped") or comp.get("stage") or "no settlement written"
    compile_gates(g, settlement, why, comp.get("s") or 0.0)

    # every gate grades one place: the blueprint this run derived from the
    # layout (what the rules and the compile graded, parcels, doors and uses
    # the layout binds included); the committed export only when the compile
    # stage wrote none, and the gate rows say which
    derived = gates_output(place_id) / "apply" / f"{place_id}.blueprint.json"
    if compiled_ok and derived.exists() and derived.stat().st_mtime >= t0:
        bp_file = derived
    else:
        bp_file = BLUEPRINTS / f"{place_id}.json"
    bp = json.loads(bp_file.read_text(encoding="utf-8"))["blueprint"]
    bp_source = str(bp_file.relative_to(REPO_ROOT))

    from . import promise_gate as pg
    t = time.time()
    sockets = (settlement or {}).get("sockets")
    if sockets is None:
        sockets = pg.layout_sockets(json.loads(layout.read_text(encoding="utf-8")))
    g.add("promises", time.time() - t, pg.promise_gate_errors(bp, pg.load_ledger(place_id), sockets))

    g.rows[-1]["blueprint"] = bp_source
    interior_gate(g, bp)
    g.rows[-1]["blueprint"] = bp_source
    from .blueprint_promises import load_record
    variety_gates(g, place_id, bp, load_record(place_id),
                  gates_output(place_id) / "scenes" / f"{scene}.json", bp_source)

    doc = {"schemaVersion": SCHEMA_VERSION, "placeId": place_id, "startedAt": started,
           "wallS": round(time.time() - t0, 2), "ok": all(r["ok"] for r in g.rows),
           "gates": g.rows, "notMeasured": list(NOT_MEASURED)}
    return doc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m worldgen.place_gates")
    ap.add_argument("--id", required=True)
    ap.add_argument("--scene", default=None, help="workbench scene name (default <place>-gates)")
    ap.add_argument("--no-ledger", action="store_true", help="a trial run: no build-ledger row")
    a = ap.parse_args(argv)
    doc = run(a.id, a.scene)
    out = REPORTS / a.id / "place-gates.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(out, (json.dumps(doc, indent=1, sort_keys=True) + "\n").encode("utf-8"), 0o644)
    red = [r["id"] for r in doc["gates"] if not r["ok"]]
    print(f"place_gates {a.id}: {'OK' if doc['ok'] else 'RED'} "
          f"{len(doc['gates']) - len(red)}/{len(doc['gates'])} gates pass in {doc['wallS']} s"
          + (f"; red: {', '.join(red)}" if red else "") + f" -> {out.relative_to(REPO_ROOT)}",
          flush=True)
    if LEDGER_TOOL.exists() and not a.no_ledger:
        subprocess.run([sys.executable, str(LEDGER_TOOL), "append", "--from-gates", str(out)],
                       cwd=REPO_ROOT, check=False)
    return 0 if doc["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
