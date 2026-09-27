"""A landing stage laid from a dry bank to a berth as a chain of abutting kit
pieces (16k walk 2, place-diag P3; owner rule 2026-09-25 "Landing stage
reaches dry ground", 16k-place-loop.md; modular-runs skill section F).

`compile_settlement.anchor_quay_run` slides ONE composite along its axis.
This module lays a CHAIN: the culture's step piece at the bank, then N deck
pieces, each snapped to the one before by the mined abuts run pair
(`blueprint_footprints.run_steps`, relative scale 1.0), along the bearing
from a dry-ground start point to the berth point. It picks the fewest deck
pieces for which the run, shifted along its own axis (rule step 2), ends
within `reach_m` of the berth with the step piece's whole foot on dry ground.

The gate (rule step 4, read here as):
  * the landward tip stands on ground >= water surface + DRY_MARGIN_M;
  * every sample of the step piece's measured ground-band footprint
    (`<kit>.footprints.json` `footprintM`) stands on ground
    >= water + DRY_MARGIN_M - FOOT_TOLERANCE_M;
  * no open end: the step piece's landward face and the last deck piece's
    seaward face carry `terminates` evidence (piece or family) in the record;
  * the seaward end is within `reach_m` of the berth.
Deck pieces standing over water are allowed (their legs or underside are
the design). The deck height is reported, never gated: the step piece is
seated on the highest ground under its foot (pivot = ground + its
`pivotAboveBaseM`), each piece adds the pair's mined rise, and a deck
piece's walking floor is its manifest `groundLineTell.valueM` (the mesh
floor-plane tell; no per-piece `walkSurface` field exists: that name is the
route-structure record's).

Coordinates: x east, z south, metres. A piece's mesh +y is the run's
forward direction; yaws are the `blueprint_footprints.lay_pieces` / runtime
convention (world offset = `rotate_m((x, -y), yaw)`).

Pure: `ground(x, z)` gives the ground height, `water_m` the local water
surface; `survey_ground(survey)` adapts a `site_fields.ProvinceSurvey`.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from .blueprint_footprints import REPO_ROOT, abuts_record, family_key, rotate_m, run_steps

DRY_MARGIN_M = 0.2        # owner rule 2026-09-25 (1)
FOOT_TOLERANCE_M = 0.05   # owner rule 2026-09-25 (4)
REACH_M = 1.0             # 16k walk 2 brief T3: the run ends within 1 m of the berth
SHIFT_STEP_M = 0.05
MAX_DECK_PIECES = 12
FOOT_GRID_M = 0.5
PUBLIC_KITS = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"


def kit_rows(kits: list[str], kits_dir: Path = PUBLIC_KITS) -> tuple[dict, dict]:
    """(asset -> manifest row, asset -> footprint row) from published kits."""
    rows, feet = {}, {}
    for kit in kits:
        for row in json.loads((kits_dir / f"{kit}.kit.json").read_text())["assets"]:
            rows[row["id"]] = row
        feet.update(json.loads((kits_dir / f"{kit}.footprints.json").read_text())["assets"])
    return rows, feet


def survey_ground(survey):
    """`ground(x, z)` over a ProvinceSurvey's frozen ground."""
    return survey.height_at


def chain_local(assets: list[str], abuts: dict) -> tuple[list[dict], list[str]]:
    """Each piece's pivot in the run's frame (x right, y forward), with its
    cumulative rise and the pair that placed it; errors name a missing pair."""
    out = [{"asset": assets[0], "x": 0.0, "y": 0.0, "rise": 0.0, "pair": None}]
    for i, asset in enumerate(assets[1:], start=1):
        prev = out[-1]
        steps = [s for s in run_steps(prev["asset"], asset, abuts)
                 if s["offset"][1] > 0 and abs((s["yaw"] + 180.0) % 360.0 - 180.0) < 1.0]
        if not steps:
            return out, [f"pieces[{i}] {asset} has no mined forward run pair from "
                         f"pieces[{i - 1}] {prev['asset']}"]
        s = max(steps, key=lambda s: (s["count"], s["kind"] == "piece"))
        out.append({"asset": asset, "x": prev["x"] + s["offset"][0],
                    "y": prev["y"] + s["offset"][1], "rise": prev["rise"] + s["rise"],
                    "pair": f"{s['kind']}:{s['pair']} n{s['count']}"})
    return out, []


def _terminates(asset: str, face: str, abuts: dict) -> int:
    own = (abuts.get("terminates") or {}).get(asset, {}).get(face, 0)
    fam = (abuts.get("familyTerminates") or {}).get(family_key(asset), {}).get(face, 0)
    return int(own) + int(fam)


def _foot_samples(outline: list[list[float]]) -> list[tuple[float, float]]:
    """The outline's vertices plus a FOOT_GRID_M grid inside it (plan x, z)."""
    xs = [p[0] for p in outline]
    zs = [p[1] for p in outline]
    pts = [(float(x), float(z)) for x, z in outline]
    n = len(outline)
    x = min(xs)
    while x <= max(xs):
        z = min(zs)
        while z <= max(zs):
            inside = False
            for k in range(n):
                (x1, z1), (x2, z2) = outline[k], outline[(k + 1) % n]
                if (z1 > z) != (z2 > z) and x < x1 + (z - z1) * (x2 - x1) / (z2 - z1):
                    inside = not inside
            if inside:
                pts.append((x, z))
            z += FOOT_GRID_M
        x += FOOT_GRID_M
    return pts


def lay_landing_run(start_xz, berth_xz, step_asset: str, deck_asset: str, ground,
                    water_m: float, rows: dict, feet: dict, abuts: dict | None = None,
                    *, deck_counts=None, reach_m: float = REACH_M) -> dict:
    """The fewest-piece landing run from `start_xz` toward `berth_xz` that
    passes the gate, or the nearest failure when none does. Result:
    ``{ok, deckPieces, shiftM, yawDeg, pieces[{asset, xM, zM, yawDeg, pair,
    deckM?}], tipXZ, endXZ, endToBerthM, footMinGroundM, needGroundM,
    openEnds, why}``; `shiftM` < 0 moves the run landward of the start point."""
    abuts = abuts_record() if abuts is None else abuts
    sx, sz = map(float, start_xz)
    bx, bz = map(float, berth_xz)
    span = math.hypot(bx - sx, bz - sz)
    dx, dz = (bx - sx) / span, (bz - sz) / span
    need = water_m + DRY_MARGIN_M
    step_row, deck_row = rows[step_asset], rows[deck_asset]
    tip_y = -float(step_row["originOffsetM"][1])
    deck_far = float(deck_row["sizeM"][1]) - float(deck_row["originOffsetM"][1])
    deck_floor = float((deck_row.get("groundLineTell") or {}).get("valueM", 0.0))
    foot = _foot_samples(feet[step_asset]["footprintM"])

    def world(px: float, pz: float, lx: float, ly: float, yaw: float) -> tuple[float, float]:
        ox, oz = rotate_m([(lx, -ly)], yaw)[0]
        return px + ox, pz + oz

    best = None
    for n in (deck_counts or range(0, MAX_DECK_PIECES + 1)):
        chain, errors = chain_local([step_asset] + [deck_asset] * n, abuts)
        if errors:
            return {"ok": False, "deckPieces": n, "why": errors[0]}
        last = chain[-1]
        far_y = last["y"] + (deck_far if n else float(step_row["sizeM"][1]) + tip_y)
        length = math.hypot(last["x"], far_y - tip_y)
        ideal = span - length
        # turn the run so the line from its tip to its far end (the pairs'
        # sideways offsets included) lies on the start-to-berth bearing
        yaw = math.degrees(math.atan2(dz, dx) - math.atan2(-(far_y - tip_y), last["x"])) % 360.0
        tip_off = rotate_m([(0.0, -tip_y)], yaw)[0]
        k_max = int(round(reach_m / SHIFT_STEP_M))
        for k in sorted(range(-k_max, k_max + 1), key=abs):
            shift = ideal + k * SHIFT_STEP_M
            px, pz = sx + dx * shift - tip_off[0], sz + dz * shift - tip_off[1]
            tip = world(px, pz, 0.0, tip_y, yaw)
            end = world(px, pz, last["x"], far_y, yaw)
            reach = math.hypot(end[0] - bx, end[1] - bz)
            if reach > reach_m:
                continue
            fg = [ground(*world(px, pz, fx, -fz, yaw)) for fx, fz in foot]
            tip_g = ground(*tip)
            dry = tip_g >= need and min(fg) >= need - FOOT_TOLERANCE_M
            cand = {"deckPieces": n, "shiftM": round(shift, 3), "yawDeg": round(yaw, 3),
                    "tipXZ": [round(tip[0], 3), round(tip[1], 3)],
                    "endXZ": [round(end[0], 3), round(end[1], 3)],
                    "endToBerthM": round(reach, 3), "tipGroundM": round(tip_g, 3),
                    "footMinGroundM": round(min(fg), 3), "needGroundM": round(need, 3),
                    "_px": px, "_pz": pz, "_yaw": yaw, "_chain": chain, "_foot_top": max(fg + [tip_g])}
            if dry:
                return _finish(cand, step_row, deck_floor, abuts, world, water_m)
            if best is None or cand["footMinGroundM"] > best["footMinGroundM"]:
                best = cand
    if best is None:
        return {"ok": False, "deckPieces": None, "why": f"no piece count ends within "
                f"{reach_m} m of the berth ({span:.2f} m from the start)"}
    out = _finish(best, step_row, deck_floor, abuts, world, water_m)
    out["ok"] = False
    out["why"] = (f"the step piece's foot stands on ground {best['footMinGroundM']} m "
                  f"(tip {best['tipGroundM']} m); the gate needs {best['needGroundM']} m "
                  f"(water {water_m} + {DRY_MARGIN_M})")
    return out


def _finish(cand: dict, step_row: dict, deck_floor: float, abuts: dict, world,
            water_m: float) -> dict:
    chain = cand.pop("_chain")
    px, pz, yaw = cand.pop("_px"), cand.pop("_pz"), cand.pop("_yaw")
    pivot0 = cand.pop("_foot_top") + float(step_row.get("pivotAboveBaseM") or 0.0)
    pieces = []
    for i, c in enumerate(chain):
        x, z = world(px, pz, c["x"], c["y"], yaw)
        row = {"asset": c["asset"], "xM": round(x, 3), "zM": round(z, 3),
               "yawDeg": cand["yawDeg"], "pivotYM": round(pivot0 + c["rise"], 3),
               "pair": c["pair"]}
        if i:
            row["deckM"] = round(pivot0 + c["rise"] + deck_floor, 3)
            row["deckOverWaterM"] = round(row["deckM"] - water_m, 3)
        pieces.append(row)
    open_ends = []
    if not _terminates(chain[0]["asset"], "-y", abuts):
        open_ends.append(f"{chain[0]['asset']} -y")
    if not _terminates(chain[-1]["asset"], "+y", abuts):
        open_ends.append(f"{chain[-1]['asset']} +y")
    cand.update(pieces=pieces, openEnds=open_ends, ok=not open_ends, why=None)
    if open_ends:
        cand["why"] = f"open run end without terminates evidence: {open_ends}"
    return cand
