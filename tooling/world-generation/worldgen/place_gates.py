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
  claims count toward the province cap and the 2 km rule;
* ``breadth.<bar>`` - the within-place breadth bars measured on the compiled
  settlement's placements (see ``breadth_measure``): dressing pieces within
  12 m per dwelling (p50), dressing asset kinds, one dressing asset's share,
  light fixture kinds. The per-dwelling count is decision 0105 R6: every
  placement within 12 m of the dwelling's footprint except shells, pads,
  ground treatments and modular-run pieces;
* ``lights.density`` - 0105 R3: no point within the place sees more than
  ``LIGHTS_CAP`` light fixtures within ``LIGHTS_ACTIVE_M`` (both read from the
  runtime's ``lighting.ts``, one number in one home);
* ``interiors.variety`` - 0105 R4: an interior cell used twice in one region
  fails unless the shell's linked set is exhausted (the claim's ``why`` says
  so), and a cell is used at most ``INTERIOR_CELL_MAX_PER_PROVINCE`` times;
  other places' cells are read from ``interiorCellClaims`` in
  ``signature-claims.json`` (``--claim-cells`` writes this place's);
* ``setting.class`` - 0105 R1: a piece stands only in the setting its own
  plugin places it in (the kit manifest row's ``settingClass``); rows that
  carry none are counted NOT_MEASURED and pass with a warning.

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
import math
import re
import subprocess
import sys
import time
from collections import Counter
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
#: breadth-bars.json fields no gate measures yet (reported, never passed):
#: clutterPiecesMin (the compile's `clutter` layer does not tell personal
#: clutter at the door from town clutter, building-depth-and-variety.md §2
#: layers 9/10), groundKindsMin (no surface-material record in the compiled
#: settlement or scene), enclosureKindsMin (no record says which parcels or
#: pieces are an enclosure kind)
NOT_MEASURED = ("clutterPiecesMin", "groundKindsMin", "enclosureKindsMin")
#: the breadth bars ``breadth_gates`` measures, in gate order
BREADTH_BARS = ("dressingPiecesPerDwellingWithin12mMin", "dressingAssetKindsMin",
                "dressingAssetShareMax", "lightKindsMin")
#: dressing = the assembly layers building-depth-and-variety.md §2 calls
#: dressing (layer 8 lantern or light, layers 9-10 clutter); the compile
#: carries them as each assembly member's `layer`
DRESSING_LAYERS = ("clutter", "light")
#: a light fixture: the layer the compile's lit-entrance gate reads
#: (compile_settlement.ENTRANCE_LIGHT_LAYERS); an `effect` (smoke) is no fixture
LIGHT_LAYERS = ("light",)
#: the vanilla house-surroundings method (building-depth-and-variety.md §2):
#: every piece within 12 m horizontal and 15 m vertical of the house anchor
DWELLING_REACH_M = 12.0
DWELLING_REACH_UP_M = 15.0
#: 0105 R6: what the per-dwelling dressing count leaves out. Shells are the
#: parcels' ``.building`` placements; modular-run pieces carry ``run`` (or are
#: fence pieces); pads and ground treatments are patches in the compiled
#: settlement (a shell's ``pad`` field, the clearance and grade layers), never
#: placements, so nothing further is dropped for them.
R6_RUN_KINDS = ("fence",)
KITS_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
LIGHTING_TS = REPO_ROOT / "packages" / "game-core" / "src" / "settlement" / "lighting.ts"
#: 0105 R3 sampling: the density is counted at every placement of the place
#: and on this grid over the placements' plan bounds
LIGHT_GRID_M = 5.0
#: the compile's fire socket rule (lighting.ts FIRE_SOCKET_RULE): a fire emits
FIRE_SOCKET_RULE = "effect-socket/fire"
#: 0105 R4: an interior cell appears at most this many times in the province
#: (like a signature, 0098 assemblyMaxPerProvince)
INTERIOR_CELL_MAX_PER_PROVINCE = 3


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


def default_scene(place_id: str) -> str:
    return place_id.removeprefix("place.").replace(".", "-") + "-gates"


def derived_blueprint_path(place_id: str) -> Path:
    """Where ``wb.py apply`` (compile stage) writes the blueprint it derived from the layout."""
    return gates_output(place_id) / "apply" / f"{place_id}.blueprint.json"


def run_apply(layout: Path, scene: str, compile_: bool) -> tuple[dict | None, str]:
    """``wb.py apply``; (its summary when this run wrote it, the tail of its
    output). The summary and the derived blueprint a previous run left are
    removed first, so either file existing afterwards is this run's."""
    cmd = [sys.executable, str(WB), "apply", str(layout), "--scene", scene]
    if not compile_:
        cmd.append("--no-compile")
    place_id = json.loads(layout.read_text(encoding="utf-8"))["placeId"]
    summary_path = gates_output(place_id) / "apply" / f"{place_id}.json"
    for stale in (summary_path, derived_blueprint_path(place_id)):
        stale.unlink(missing_ok=True)
    got = subprocess.run(cmd, cwd=WB.parent, capture_output=True, text=True, env=wb_env(place_id))
    tail = (got.stdout + got.stderr).strip().splitlines()[-1:] or [f"exit {got.returncode}"]
    if summary_path.exists():
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
    t = time.perf_counter()
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
    g.add("interiors", time.perf_counter() - t, failures, cells=sorted(set(cells)))


VARIETY_BARS = ("signatureRatioMin", "shellsMin", "topShellShareMax")
EXCEPTION_FIELDS = ("bar", "reason", "on", "planner")


def variety_exceptions(bp: dict, bars: list[tuple[str, str]]) -> tuple[list[str], list[str]]:
    """(failures, warnings) of the 0098 place bars after the blueprint's
    `variety.exceptions[]` (Claywater residual ruling 2, 2026-09-27): each
    {bar, reason, on (YYYY-MM-DD), planner} excuses that one bar's failure,
    which is then reported as a warning naming the reason; the slot is copied
    to the acceptance receipt at close. A malformed exception, one naming no
    0098 bar, or one excusing a bar that passes (stale) is a failure, so an
    exception can never outlive its cause silently."""
    got = ((bp.get("variety") or {}).get("exceptions")) or []
    failures, warnings, excused = [], [], {}
    for i, ex in enumerate(got):
        missing = [f for f in EXCEPTION_FIELDS if not isinstance(ex.get(f), str) or not ex[f].strip()]
        if missing:
            failures.append(f"0098: variety.exceptions[{i}] lacks {missing}")
        elif ex["bar"] not in VARIETY_BARS:
            failures.append(f"0098: variety.exceptions[{i}] names {ex['bar']!r}, not a 0098 bar "
                            f"{list(VARIETY_BARS)}")
        elif not re.fullmatch(r"\d{4}-\d{2}-\d{2}", ex["on"]):
            failures.append(f"0098: variety.exceptions[{i}] date {ex['on']!r} is not YYYY-MM-DD")
        else:
            excused[ex["bar"]] = ex
    failing = {bar for bar, _ in bars}
    for bar, msg in bars:
        if bar in excused:
            ex = excused[bar]
            warnings.append(f"{msg} — excepted ({ex['planner']}, {ex['on']}): {ex['reason']}")
        else:
            failures.append(msg)
    for bar in sorted(set(excused) - failing):
        failures.append(f"0098: variety.exceptions excuses {bar}, which passes: remove the stale exception")
    return failures, warnings


def is_r6_counted(p: dict) -> bool:
    """0105 R6: a placement the per-dwelling dressing count includes: every
    placement except shells (a parcel's ``.building``), modular-run pieces
    (``run``, fence pieces); pads and ground treatments are no placements."""
    if p.get("objectKind") == "parcel" and str(p.get("id", "")).endswith(".building"):
        return False
    return not (p.get("run") or p.get("objectKind") in R6_RUN_KINDS)


def _grid(items, key, cell_m: float) -> dict[tuple[int, int], list]:
    """Bucket ``items`` by the uniform plan cell (``cell_m``) of ``key(item)``
    -> (x, z), so a query within ``cell_m`` of a point reads only the 3 x 3
    cells around it."""
    out: dict[tuple[int, int], list] = {}
    for item in items:
        x, z = key(item)
        out.setdefault((math.floor(x / cell_m), math.floor(z / cell_m)), []).append(item)
    return out


def _grid_near(grid: dict, cell_m: float, minx: float, minz: float, maxx: float, maxz: float,
               reach_m: float):
    """The bucketed items whose cells meet the box (minx, minz)-(maxx, maxz)
    grown by ``reach_m``: a superset of everything within ``reach_m`` of it."""
    i0, i1 = math.floor((minx - reach_m) / cell_m), math.floor((maxx + reach_m) / cell_m)
    j0, j1 = math.floor((minz - reach_m) / cell_m), math.floor((maxz + reach_m) / cell_m)
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            yield from grid.get((i, j), ())


def _footprint_shape(footprint):
    """The footprint as a query shape, built once per dwelling: a shapely
    polygon, or the anchor (x, z) when the footprint is a single point."""
    if len(footprint) < 3:
        return tuple(footprint[0])
    from shapely.geometry import Polygon
    return Polygon(footprint)


def _plan_distance(point, shape) -> float:
    """Plan distance (m) from (x, z) to a ``_footprint_shape`` (0 inside a
    polygon)."""
    if isinstance(shape, tuple):
        return ((point[0] - shape[0]) ** 2 + (point[1] - shape[1]) ** 2) ** 0.5
    from shapely.geometry import Point
    return shape.distance(Point(point))


def dwelling_footprints_m(bp: dict, dwelling_parcels: set[str]) -> dict[str, list[tuple[float, float]]]:
    """{parcel id: footprint polygon in world metres} from the blueprint's
    derived ``footprint`` (province UV times the authored extent)."""
    from .scale import PROVINCE_EXTENT_M
    out = {}
    for parcel in bp.get("parcels") or []:
        fp = parcel.get("footprint") or []
        if parcel.get("id") in dwelling_parcels and len(fp) >= 3:
            out[parcel["id"]] = [(float(u) * PROVINCE_EXTENT_M, float(v) * PROVINCE_EXTENT_M) for u, v in fp]
    return out


def breadth_measure(placements: list[dict], dwelling_parcels: set[str],
                    footprints: dict[str, list] | None = None) -> dict:
    """The within-place breadth numbers of one compiled settlement.

    Dressing (for the kinds and share bars) is every `assembly` placement
    whose `layer` is in DRESSING_LAYERS; a light fixture kind every
    `assembly` placement whose layer is in LIGHT_LAYERS. The per-dwelling
    count is 0105 R6: every placement ``is_r6_counted`` admits within
    DWELLING_REACH_M in plan of the dwelling's footprint (``footprints``;
    the parcel's `.building` anchor where none is given) and within
    DWELLING_REACH_UP_M in height of the anchor (0098 row "pieces within
    12 m per dwelling", p50).
    """
    from statistics import median
    footprints = footprints or {}
    dressing = [p for p in placements
                if p.get("objectKind") == "assembly" and p.get("layer") in DRESSING_LAYERS]
    lights = {p["assetId"] for p in placements
              if p.get("objectKind") == "assembly" and p.get("layer") in LIGHT_LAYERS}
    anchors = {p["parcelId"]: p["positionM"] for p in placements
               if p.get("objectKind") == "parcel" and p.get("parcelId") in dwelling_parcels
               and str(p.get("id", "")).endswith(".building")}
    counted = _grid((p for p in placements if is_r6_counted(p) and p.get("positionM")),
                    lambda p: (p["positionM"][0], p["positionM"][2]), DWELLING_REACH_M)
    per_dwelling = {}
    for pid in sorted(anchors):
        ax, ay, az = anchors[pid]
        fp = footprints.get(pid) or [(ax, az)]
        shape = _footprint_shape(fp)
        xs, zs = [x for x, _ in fp], [z for _, z in fp]
        per_dwelling[pid] = sum(
            1 for d in _grid_near(counted, DWELLING_REACH_M, min(xs), min(zs), max(xs), max(zs),
                                  DWELLING_REACH_M)
            if abs(d["positionM"][1] - ay) <= DWELLING_REACH_UP_M
            and _plan_distance((d["positionM"][0], d["positionM"][2]), shape) <= DWELLING_REACH_M)
    kinds = Counter(d["assetId"] for d in dressing)
    top_asset, top_n = min(kinds.items(), key=lambda kv: (-kv[1], kv[0])) if kinds else (None, 0)
    return {
        "dressingPieces": len(dressing),
        "dressingPerDwelling": per_dwelling,
        "dwellingsWithoutAnchor": sorted(dwelling_parcels - set(anchors)),
        "dressingPerDwellingP50": median(per_dwelling.values()) if per_dwelling else None,
        "dressingAssetKinds": len(kinds),
        "topDressingAsset": top_asset,
        "topDressingAssetShare": round(top_n / len(dressing), 3) if dressing else 0.0,
        "lightKinds": sorted(lights),
    }


def breadth_failures(m: dict, row: dict, column: str) -> dict[str, list[str]]:
    """{bar: failures} for BREADTH_BARS against one bars row."""
    out = {bar: [] for bar in BREADTH_BARS}
    bar = row["dressingPiecesPerDwellingWithin12mMin"]
    if m["dwellingsWithoutAnchor"]:
        out["dressingPiecesPerDwellingWithin12mMin"].append(
            f"breadth: dwelling(s) with no .building placement to measure from: {m['dwellingsWithoutAnchor']}")
    if m["dressingPerDwellingP50"] is not None and m["dressingPerDwellingP50"] < bar:
        out["dressingPiecesPerDwellingWithin12mMin"].append(
            f"breadth: placements within {DWELLING_REACH_M:g} m of each dwelling's footprint (R6) p50 "
            f"{m['dressingPerDwellingP50']:g} < {bar} ({column})")
    if m["dressingAssetKinds"] < row["dressingAssetKindsMin"]:
        out["dressingAssetKindsMin"].append(
            f"breadth: dressing asset kinds {m['dressingAssetKinds']} < {row['dressingAssetKindsMin']} ({column})")
    if m["topDressingAssetShare"] > row["dressingAssetShareMax"]:
        out["dressingAssetShareMax"].append(
            f"breadth: {m['topDressingAsset']} is {m['topDressingAssetShare']:.2f} of the dressing "
            f"> {row['dressingAssetShareMax']} ({column})")
    if len(m["lightKinds"]) < row["lightKindsMin"]:
        out["lightKindsMin"].append(
            f"breadth: light fixture kinds {len(m['lightKinds'])} < {row['lightKindsMin']} ({column})")
    return out


def breadth_gates(g: Gates, settlement: dict | None, dwelling_parcels: set[str],
                  column: str | None, row: dict | None, footprints: dict | None = None) -> None:
    t = time.perf_counter()
    if settlement is None:
        for bar in BREADTH_BARS:
            g.add(f"breadth.{bar}", 0.0, ["the compile did not run: no placements to measure"])
        return
    m = breadth_measure(settlement.get("placements") or [], dwelling_parcels, footprints)
    if column is None:
        for bar in BREADTH_BARS:
            g.add(f"breadth.{bar}", 0.0, [], ["below every breadth-bars column"], measured=m)
        return
    fails = breadth_failures(m, row, column)
    seconds = time.perf_counter() - t
    for bar in BREADTH_BARS:
        g.add(f"breadth.{bar}", seconds, fails[bar], column=column, bar=row[bar], measured=m)


def place_bars(record: dict | None, n_counted: int) -> tuple[str | None, int | None, dict | None]:
    """(column, type number, flat bars row) for the column the place is built under."""
    from . import breadth_bars as bb
    record_bars = bb.load()
    column = bb.built_column(n_counted, record_bars)
    if column is None:
        return None, None, None
    from .site_packet import type_sheet
    type_no = type_sheet(((record or {}).get("classification") or {}).get("type"))["number"]
    if type_no is None:        # no type sheet names the record's type: tier bars only
        return column, None, {f: record_bars["tiers"][column][f]["value"] for f in bb.TIER_FIELDS}
    # bars_for resolves the type's overrides; its culture only picks the
    # enclosure bar, which no gate reads yet (NOT_MEASURED)
    enclosure = record_bars["enclosureKindsMin"]
    culture = (record or {}).get("culture")
    return column, type_no, bb.bars_for(column, culture if culture in enclosure else sorted(enclosure)[0],
                                        type_no, record_bars)


def variety_gates(g: Gates, place_id: str, bp: dict, record: dict | None, scene: Path,
                  bp_source: str, settlement: dict | None = None) -> None:
    from . import claim_signature as cl
    from . import parcel_kinds as pk
    use = {p["id"]: p.get("use") for p in bp.get("parcels") or []}
    # the parcels the compile's density column counts (blueprint.density_column)
    counted = {p["id"] for p in pk.counted_parcels(bp, pk.kinds_of(bp), include=("building",))}
    column, type_no, row = place_bars(record, len(counted))
    dwellings_here = {pid for pid in counted if use.get(pid) == "dwelling"}
    breadth_gates(g, settlement, dwellings_here, column, row, dwelling_footprints_m(bp, dwellings_here))
    t = time.perf_counter()
    try:
        sigs = cl.place_signatures(place_id, scene, env=wb_env(place_id), blueprint=bp)
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        g.add("0098.place", time.perf_counter() - t, [f"no signature: {exc}"])
        g.add("0098.province", 0.0, [f"no signature: {exc}"])
        return
    buildings = [(s, pid) for s, pids in sigs.items() for pid in pids if pid in counted]
    dwellings = [(s, pid) for s, pid in buildings if use.get(pid) == "dwelling"]
    failures = []
    if column is None:
        g.add("0098.place", time.perf_counter() - t, [],
              [f"{len(buildings)} counted buildings: below every breadth-bars column"])
    else:
        shells = Counter(s.split(" | ", 1)[0] for s, _ in buildings)
        dwell_shells = Counter(s.split(" | ", 1)[0] for s, _ in dwellings)
        ratio = len({s for s, _ in dwellings}) / len(dwellings) if dwellings else 1.0
        top = max(dwell_shells.values()) / len(dwellings) if dwellings else 0.0
        bars = []
        if ratio < row["signatureRatioMin"]:
            bars.append(("signatureRatioMin", f"0098: dwelling signatures / dwellings {ratio:.2f} < "
                                              f"{row['signatureRatioMin']} ({column})"))
        if len(shells) < row["shellsMin"]:
            bars.append(("shellsMin", f"0098: distinct shells {len(shells)} < {row['shellsMin']} ({column})"))
        if top > row["topShellShareMax"]:
            bars.append(("topShellShareMax",
                         f"0098: top shell share {top:.2f} > {row['topShellShareMax']} ({column})"))
        failures, excepted = variety_exceptions(bp, bars)
        g.add("0098.place", time.perf_counter() - t, failures, excepted, column=column,
              typeNumber=type_no, blueprint=bp_source,
              measured={"buildings": len(buildings), "dwellings": len(dwellings),
                        "signatureRatio": round(ratio, 3), "shells": len(shells),
                        "topShellShare": round(top, 3)})
    t = time.perf_counter()
    cap, repeat_m = cl.province_bars()
    copies = [s for s, parcels in sigs.items() for _ in parcels]
    claims = cl.load()["claims"]
    errors = cl.province_errors(place_id, copies, claims, cap, repeat_m, cl.place_positions())
    held = Counter(c["signature"] for c in claims if c["placeId"] == place_id)
    unclaimed = sorted(s for s in sigs if held[s] != len(sigs[s]))
    g.add("0098.province", time.perf_counter() - t, errors,
          [f"{len(unclaimed)} signature(s) whose claimed copies differ from the scene "
           f"(claim_signature --from-scene)"] if unclaimed else None)


# --- 0105 R3: the lights band's fixture density -----------------------------

def lighting_constants(path: Path = LIGHTING_TS) -> tuple[int, float]:
    """(LIGHTS_CAP, LIGHTS_ACTIVE_M) as the runtime exports them: the cap and
    the band live once, in ``lighting.ts``; the gate reads them there."""
    text = path.read_text(encoding="utf-8")
    got = {}
    for name in ("LIGHTS_CAP", "LIGHTS_ACTIVE_M"):
        m = re.search(rf"export const {name}\s*=\s*([0-9.]+)\s*;", text)
        if not m:
            raise ValueError(f"{path.relative_to(REPO_ROOT)}: no `export const {name} = <number>;`")
        got[name] = float(m.group(1))
    return int(got["LIGHTS_CAP"]), got["LIGHTS_ACTIVE_M"]


def kit_rows(kits: set[str], kits_dir: Path = KITS_DIR) -> dict[tuple[str, str], dict]:
    """{(kit, asset id): manifest row} for the published kits named."""
    out = {}
    for kit in sorted(k for k in kits if k):
        path = kits_dir / f"{kit}.kit.json"
        if path.exists():
            for row in json.loads(path.read_text(encoding="utf-8")).get("assets") or []:
                out[(kit, row["id"])] = row
    return out


def light_fixtures(placements: list[dict], rows: dict) -> list[dict]:
    """The fixtures the runtime lights (SettlementLayer + lighting.ts): a fire
    socket; a non-effect piece on the compile's light layer or with a mined
    LIGH record. A lit window is no fixture (walk 3 ruling R11: its glow is
    the kit's emissive mask, never a point light), so it never counts."""
    out = []
    for p in placements:
        pos = p.get("positionM")
        if not pos:
            continue
        row = rows.get((p.get("kit"), p.get("assetId"))) or {}
        at = (pos[0], pos[2])
        if p.get("objectKind") == "effect":
            if (p.get("provenance") or {}).get("ruleId") == FIRE_SOCKET_RULE:
                out.append({"id": p["id"], "kind": "fire", "at": at})
            continue
        if p.get("layer") in LIGHT_LAYERS or row.get("light"):
            out.append({"id": p["id"], "kind": "fixture", "at": at})
    return out


#: samples per block of the fixture-density distance matrix (block x fixtures
#: float64 pairs: 4096 x 400 is 13 MB)
FIXTURE_DENSITY_BLOCK = 4096


def fixture_density(placements: list[dict], fixtures: list[dict], band_m: float,
                    grid_m: float = LIGHT_GRID_M) -> dict:
    """The most fixtures any point of the place sees within ``band_m`` in plan
    (plan distance never exceeds the runtime's 3D one, so this never
    undercounts): sampled at every placement and on a ``grid_m`` grid over the
    placements' plan bounds. Counted as one samples x fixtures distance
    matrix (numpy, in blocks of ``FIXTURE_DENSITY_BLOCK`` samples); the first
    sample with the most wins, as the all-pairs loop chose it."""
    import numpy as np
    pts = [(p["positionM"][0], p["positionM"][2]) for p in placements if p.get("positionM")]
    if not pts or not fixtures:
        return {"fixtures": len(fixtures), "maxSeen": len(fixtures) if pts else 0, "at": None}
    xs, zs = [x for x, _ in pts], [z for _, z in pts]
    x0, z0 = min(xs), min(zs)             # once: per sample it was the whole cost
    nx = int((max(xs) - x0) // grid_m) + 1
    nz = int((max(zs) - z0) // grid_m) + 1
    samples = pts + [(x0 + i * grid_m, z0 + j * grid_m) for i in range(nx + 1) for j in range(nz + 1)]
    at = np.array([f["at"] for f in fixtures], dtype=np.float64)
    fx, fz = at[:, 0][None, :], at[:, 1][None, :]
    band2 = band_m * band_m
    best, where = -1, None
    for start in range(0, len(samples), FIXTURE_DENSITY_BLOCK):
        block = np.array(samples[start:start + FIXTURE_DENSITY_BLOCK], dtype=np.float64)
        dx, dz = fx - block[:, 0][:, None], fz - block[:, 1][:, None]
        counts = np.count_nonzero(dx * dx + dz * dz <= band2, axis=1)
        k = int(np.argmax(counts))
        if int(counts[k]) > best:
            best = int(counts[k])
            sx, sz = samples[start + k]
            where = (round(sx, 1), round(sz, 1))
    return {"fixtures": len(fixtures), "maxSeen": best, "at": list(where)}


def lights_gate(g: Gates, settlement: dict | None, rows: dict | None = None,
                constants: tuple[int, float] | None = None) -> None:
    t = time.perf_counter()
    if settlement is None:
        g.add("lights.density", 0.0, ["the compile did not run: no fixtures to count"])
        return
    cap, band = constants or lighting_constants()
    placements = settlement.get("placements") or []
    if rows is None:
        rows = kit_rows({p.get("kit") for p in placements})
    fixtures = light_fixtures(placements, rows)
    m = fixture_density(placements, fixtures, band)
    failures = []
    if m["maxSeen"] > cap:
        failures.append(f"0105 R3: a point at {m['at']} sees {m['maxSeen']} light fixtures within "
                        f"{band:g} m > the cap {cap}; the runtime lights only the {cap} nearest")
    g.add("lights.density", time.perf_counter() - t, failures, cap=cap, bandM=band,
          measured={**m, "byKind": dict(Counter(f["kind"] for f in fixtures))})


# --- 0105 R4: planned interior variety --------------------------------------

def region_of(place_id: str) -> str:
    """The catalogue region: ``place.<region>.<name>``."""
    parts = place_id.split(".")
    return parts[1] if len(parts) >= 3 else place_id


def door_cells(bp: dict) -> list[dict]:
    """[{doorId, parcelId, cellId, why}] for every door that claims an interior cell."""
    out = []
    for door in bp.get("doors") or []:
        claim = door.get("interiorClaim") or {}
        if claim.get("cellId"):
            out.append({"doorId": door["id"], "parcelId": door.get("parcelId"),
                        "cellId": claim["cellId"], "why": str(claim.get("why") or "")})
    return out


def _shell_links(parcel: dict | None) -> list[str]:
    """The interior cells the parcel's shell (a composite's base shell) is linked to."""
    from . import blueprint_interiors as bi
    ref = (parcel or {}).get("assetRef") or ""
    links = bi.linked_shells()
    rows = links.get(ref) or links.get(bi.composite_base(ref) or "") or []
    return sorted({r.get("interiorCell") for r in rows if r.get("interiorCell")})


def interior_variety_failures(place_id: str, bp: dict, claims: list[dict],
                              links_of=_shell_links,
                              cap: int = INTERIOR_CELL_MAX_PER_PROVINCE) -> tuple[list[str], list[str]]:
    """(failures, warnings) of 0105 R4 for ``place_id`` holding ``bp``'s door
    cells. ``claims`` are ``interiorCellClaims`` rows ({placeId, doorId,
    cellId}); this place's own rows there are ignored (its blueprint is the
    truth). A cell used twice within the region (this place included) fails
    unless every cell the door's shell is linked to is already used in the
    region AND the claim's ``why`` says the set is exhausted (then a
    warning); a cell used more than ``cap`` times in the province fails."""
    region = region_of(place_id)
    parcels = {p["id"]: p for p in bp.get("parcels") or []}
    mine = door_cells(bp)
    others = [c for c in claims if c.get("placeId") != place_id]
    failures, warnings = [], []
    for i, d in enumerate(mine):
        before_here = [m["doorId"] for m in mine[:i] if m["cellId"] == d["cellId"]]
        in_region = sorted({c["placeId"] for c in others
                            if c["cellId"] == d["cellId"] and region_of(c["placeId"]) == region})
        if before_here or in_region:
            where = ", ".join([f"{place_id} {x}" for x in before_here] + in_region)
            used = ({m["cellId"] for m in mine if m["doorId"] != d["doorId"]}
                    | {c["cellId"] for c in others if region_of(c["placeId"]) == region})
            linked = links_of(parcels.get(d["parcelId"]))
            exhausted = bool(linked) and set(linked) <= used
            msg = (f"0105 R4: {d['doorId']} uses interior cell {d['cellId']} already used in region "
                   f"{region} ({where})")
            if exhausted and "exhausted" in d["why"].lower():
                warnings.append(f"{msg}; excused: the shell's linked set {linked} is exhausted")
            elif exhausted:
                failures.append(f"{msg}; the shell's linked set {linked} is exhausted but the claim's "
                                f"`why` does not say so")
            else:
                unused = sorted(set(linked) - used)
                failures.append(f"{msg}; unused cells linked to the shell: {unused or 'none'}")
    copies = Counter(c["cellId"] for c in others) + Counter(d["cellId"] for d in mine)
    for cell in sorted({d["cellId"] for d in mine}):
        if copies[cell] > cap:
            failures.append(f"0105 R4: interior cell {cell} would be used {copies[cell]} times in the "
                            f"province (cap {cap})")
    return failures, warnings


def interior_variety_gate(g: Gates, place_id: str, bp: dict, claims_doc: dict | None = None) -> None:
    from . import claim_signature as cl
    t = time.perf_counter()
    doc = claims_doc if claims_doc is not None else cl.load()
    failures, warnings = interior_variety_failures(place_id, bp, doc.get("interiorCellClaims") or [])
    g.add("interiors.variety", time.perf_counter() - t, failures, warnings,
          cells=[d["cellId"] for d in door_cells(bp)])


def claim_interior_cells(place_id: str, bp: dict, now: str, path: Path | None = None) -> list[dict]:
    """Replace ``place_id``'s ``interiorCellClaims`` rows in the claims file
    with its blueprint's door cells, under the claims lock; returns its rows."""
    from . import claim_signature as cl
    path = Path(path or cl.CLAIMS_PATH)
    with cl.claims_lock(path):
        doc = cl.load(path)
        rows = [c for c in doc.get("interiorCellClaims") or [] if c["placeId"] != place_id]
        held = {(c["doorId"], c["cellId"]): c for c in doc.get("interiorCellClaims") or []
                if c["placeId"] == place_id}
        mine = [held.get((d["doorId"], d["cellId"])) or
                {"placeId": place_id, "doorId": d["doorId"], "cellId": d["cellId"], "claimedAt": now}
                for d in door_cells(bp)]
        doc["interiorCellClaims"] = sorted(rows + mine, key=lambda c: (c["cellId"], c["placeId"], c["doorId"]))
        atomic_write_bytes(path, (json.dumps(doc, indent=1, sort_keys=True) + "\n").encode("utf-8"), 0o644)
    return mine


# --- 0105 R1: setting class --------------------------------------------------

#: the R1 place classes, and how a catalogue recipe (class, family, type) maps
#: onto them; everything a settlement-scale recipe does not name is a village
SETTING_CLASSES = ("keep", "town", "village", "camp", "ruin")
_TOWN_FAMILIES = ("major-city", "free-port")


def place_setting_class(recipe: dict | None) -> str | None:
    """keep / town / village / camp / ruin for a type-recipes.json row."""
    if not recipe:
        return None
    cls, family, rtype = recipe.get("class"), recipe.get("family"), recipe.get("type") or ""
    if cls == "camp":
        return "camp"
    if cls == "ruin":
        return "ruin"
    if cls == "martial":
        return "keep"
    if family in _TOWN_FAMILIES or rtype.endswith("-town") or rtype.endswith("-city"):
        return "town"
    return "village"


def recipe_of(record: dict | None) -> dict | None:
    rtype = ((record or {}).get("classification") or {}).get("type")
    path = REPO_ROOT / "world" / "sources" / "catalogue" / "type-recipes.json"
    for row in json.loads(path.read_text(encoding="utf-8")).get("types") or []:
        if row.get("type") == rtype:
            return row
    return None


def setting_failures(placements: list[dict], rows: dict, place_class: str | None,
                     interior: bool = False) -> tuple[list[str], list[str], list[str]]:
    """(failures, warnings, not measured asset ids) of 0105 R1.

    A manifest row's ``settingClass`` is ``mine_setting_class``'s record
    (lane L4): ``n``, ``interior`` and ``exterior`` ({class: n}),
    ``settings`` ({setting: [licensed classes]}, a setting present only when
    the piece's own plugin licenses it; ``wild`` licenses the setting and no
    class), ``sourceCells``, ``evidence`` (``plugin`` | ``unplaced``). A
    piece fails where its setting is not licensed (an ``unplaced`` piece has
    no licence anywhere), and where its licensed classes name some social
    class but not this place's. Rows without ``settingClass`` are
    NOT_MEASURED."""
    setting = "interior" if interior else "exterior"
    failures, warnings, unmeasured = [], [], set()
    seen = set()
    for p in placements:
        if p.get("objectKind") == "effect":
            continue
        key = (p.get("kit"), p.get("assetId"))
        if key in seen:
            continue
        seen.add(key)
        sc = (rows.get(key) or {}).get("settingClass")
        if not isinstance(sc, dict):
            unmeasured.add(p.get("assetId"))
            continue
        n = sc.get("n")
        settings = sc.get("settings") or {}
        cells = ", ".join((sc.get("sourceCells") or [])[:3]) or "-"
        if setting not in settings:
            where = sorted(settings) or ["nowhere (unplaced by its own plugin)"]
            failures.append(f"0105 R1: {p['assetId']} is placed {setting} here; its plugin licenses it "
                            f"{' and '.join(where)} (n {n}; cells {cells})")
            continue
        classes = [c for c in settings[setting] if c in SETTING_CLASSES]
        if place_class and classes and place_class not in classes:
            failures.append(f"0105 R1: {p['assetId']} stands in a {place_class}; its plugin places it "
                            f"{setting} in {classes} only (n {n}; cells {cells})")
    return failures, warnings, sorted(unmeasured)


def setting_gate(g: Gates, settlement: dict | None, record: dict | None, rows: dict | None = None) -> None:
    t = time.perf_counter()
    if settlement is None:
        g.add("setting.class", 0.0, ["the compile did not run: no placements to read"])
        return
    placements = settlement.get("placements") or []
    if rows is None:
        rows = kit_rows({p.get("kit") for p in placements})
    place_class = place_setting_class(recipe_of(record))
    failures, warnings, unmeasured = setting_failures(placements, rows, place_class)
    if unmeasured:
        warnings.append(f"NOT_MEASURED: {len(unmeasured)} asset(s) carry no settingClass in their kit "
                        f"manifest (walk 3 lane L4 writes it)")
    g.add("setting.class", time.perf_counter() - t, failures, warnings, placeClass=place_class,
          notMeasured=unmeasured)


def layout_blueprint(place_id: str, compiled_ok: bool) -> Path | None:
    """The blueprint the gates grade and the cell claims read: the one this
    run's ``wb.py apply`` derived from the layout (``run_apply`` clears the
    previous one first), or None when the compile stage wrote none."""
    derived = derived_blueprint_path(place_id)
    return derived if compiled_ok and derived.exists() else None


def claim_cells(place_id: str, now: str, scene_name: str | None = None,
                path: Path | None = None) -> list[dict]:
    """0105 R4 ``--claim-cells``: apply the layout, then hold the door cells of
    the blueprint derived from it (``layout_blueprint``, the one the gate
    grades); never the committed blueprint, which lags the layout until
    export. Raises when the layout derives no blueprint."""
    summary, tail = run_apply(_layout_path(place_id), scene_name or default_scene(place_id), True)
    bp_file = layout_blueprint(place_id, summary is not None)
    if bp_file is None:
        raise RuntimeError(f"wb.py apply derived no blueprint from the layout ({tail}); "
                           "no cells claimed")
    bp = json.loads(bp_file.read_text(encoding="utf-8"))["blueprint"]
    return claim_interior_cells(place_id, bp, now, path)


def run(place_id: str, scene_name: str | None = None, *, now: str) -> dict:
    """All gates for one place. ``now`` is the report's ``startedAt`` stamp,
    injected by the CLI (standard 6: no wall clock below the boundary)."""
    t0 = time.perf_counter()
    started = now
    g = Gates()
    layout = _layout_path(place_id)
    scene = scene_name or default_scene(place_id)

    t = time.perf_counter()
    summary, tail = run_apply(layout, scene, True)
    compiled_ok = summary is not None
    # read before a rules-only re-run, which clears it
    derived = layout_blueprint(place_id, compiled_ok)
    if summary is None:                       # the compile stage crashed: rules alone
        summary, tail2 = run_apply(layout, scene, False)
        tail = f"{tail} (rules re-run without the compile: {tail2})"
    apply_s = time.perf_counter() - t
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
        if path.exists():                     # named by this run's summary
            settlement = json.loads(path.read_text(encoding="utf-8"))
    elif compiled_ok:
        why = comp.get("skipped") or comp.get("stage") or "no settlement written"
    compile_gates(g, settlement, why, comp.get("s") or 0.0)

    # every gate grades one place: the blueprint this run derived from the
    # layout (what the rules and the compile graded, parcels, doors and uses
    # the layout binds included); the committed export only when the compile
    # stage wrote none, and the gate rows say which
    bp_file = derived or BLUEPRINTS / f"{place_id}.json"
    bp = json.loads(bp_file.read_text(encoding="utf-8"))["blueprint"]
    bp_source = str(bp_file.relative_to(REPO_ROOT))

    from . import promise_gate as pg
    t = time.perf_counter()
    sockets = (settlement or {}).get("sockets")
    if sockets is None:
        sockets = pg.layout_sockets(json.loads(layout.read_text(encoding="utf-8")))
    g.add("promises", time.perf_counter() - t, pg.promise_gate_errors(bp, pg.load_ledger(place_id), sockets))

    g.rows[-1]["blueprint"] = bp_source
    interior_gate(g, bp)
    g.rows[-1]["blueprint"] = bp_source
    from .blueprint_promises import load_record
    record = load_record(place_id)
    variety_gates(g, place_id, bp, record,
                  gates_output(place_id) / "scenes" / f"{scene}.json", bp_source, settlement)
    interior_variety_gate(g, place_id, bp)
    rows = kit_rows({p.get("kit") for p in (settlement or {}).get("placements") or []})
    lights_gate(g, settlement, rows)
    setting_gate(g, settlement, record, rows)

    doc = {"schemaVersion": SCHEMA_VERSION, "placeId": place_id, "startedAt": started,
           "wallS": round(time.perf_counter() - t0, 2), "ok": all(r["ok"] for r in g.rows),
           "gates": g.rows, "notMeasured": list(NOT_MEASURED)}
    return doc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m worldgen.place_gates")
    ap.add_argument("--id", required=True)
    ap.add_argument("--scene", default=None, help="workbench scene name (default <place>-gates)")
    ap.add_argument("--no-ledger", action="store_true", help="a trial run: no build-ledger row")
    ap.add_argument("--claim-cells", action="store_true",
                    help="0105 R4: apply the layout and record the door cells of the blueprint derived "
                         "from it (the one the gates grade) in signature-claims.json "
                         "(interiorCellClaims), then exit; run at the design brief step")
    a = ap.parse_args(argv)
    if a.claim_cells:
        try:
            rows = claim_cells(a.id, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), a.scene)
        except RuntimeError as exc:
            print(f"place_gates {a.id}: {exc}", file=sys.stderr)
            return 1
        print(f"place_gates {a.id}: {len(rows)} interior cell claim(s) held: "
              f"{', '.join(r['cellId'] for r in rows) or '-'}")
        return 0
    # the one wall-clock read: the report's startedAt stamp, at the CLI boundary
    doc = run(a.id, a.scene, now=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
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
