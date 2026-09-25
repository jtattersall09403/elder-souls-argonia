"""Terrain pads under a modular run the ground drops away from (16k carried
item 13, lane F; decision 0059 typed patches, 0081 addendum).

A run (a wall, a fence, a boardwalk) seats as ONE rigid chain
(`anchoring.ts anchorRun`, commit 259b200a): the datum is the member with the
highest mean ground under its own footprint, at that mean less its sink, and
every other member sits at datum + riseM_i - riseM_datum. Where the ground
falls away under the chain a member floats. The fix is ground, not a bent
chain: the export emits one typed terrain patch per run,
``patch.pad.settlement.<placeId>.<runId>`` (kind ``settlement-pad``), that
grades the ground under every member whose contact gap (its designed ground
line, pivot + sink, over the lowest ground under its footprint) exceeds
``SEAT_BAR_M`` up to that line.

Authoring is CUMULATIVE (`merge_pad_patches`): measured on ground a pad has
already raised, the gap is gone, so a re-derived set would drop the pad that
fixed it. A member's entry is replaced only by a new measurement that still
finds a gap; nothing is dropped by a re-measure.

`apply_settlement_pad` is the one realisation, used by `terrain_patches`
(frozen base, samples at i * mpp) and in memory by the yard float gate on the
published survey raster (nearest pixel, cell i covers [i, i + 1) * px).
"""

from __future__ import annotations

import math

import numpy as np

SEAT_BAR_M = 0.05          # a run member whose ground line stands this far over the ground gets a pad
PAD_BLEND_M = 3.0          # the pad tapers back to the natural ground over this
PAD_HARD_RADIUS_PX = 1.5   # every sample within this many samples of the footprint takes the target,
                           # so any sampler (nearest pixel or bilinear) at a footprint point reads it
MAX_PAD_DELTA_M = 2.0      # = grade_settlement_pads.MAX_PAD_DELTA_M: a pad is a small engineered base


def run_seats(rows: list[dict], height_at) -> dict[str, float]:
    """placement id -> pivot y of every run member, seated as one rigid chain
    (`anchoring.ts anchorRun`). ``rows`` are one place's bundle placements."""
    runs: dict[str, list] = {}
    for p in rows:
        if p.get("run") and p.get("footprintM"):
            runs.setdefault(p["run"]["id"], []).append(p)
    out: dict[str, float] = {}
    for members in runs.values():
        means = [sum(height_at(float(x), float(z)) for x, z in p["footprintM"])
                 / len(p["footprintM"]) for p in members]
        d = max(range(len(members)), key=lambda i: means[i])
        datum = means[d] - float(members[d]["anchor"]["designedSinkM"]["p50"]) * float(
            members[d].get("scale", 1.0))
        for p in members:
            out[p["id"]] = datum + float(p["run"]["riseM"]) - float(members[d]["run"]["riseM"])
    return out


def run_pad_patches(rows: list[dict], place_id: str, height_at, is_wet=None) -> list[dict]:
    """One `settlement-pad` patch per run with a member over the seat bar. A
    member with any footprint point in water (``is_wet(x, z)``) is left out:
    a pad never fills water (0059 invariant 4)."""
    seats = run_seats(rows, height_at)
    by_run: dict[str, list[dict]] = {}
    for p in rows:
        if p["id"] not in seats:
            continue
        if is_wet is not None and any(is_wet(float(x), float(z)) for x, z in p["footprintM"]):
            continue
        line = seats[p["id"]] + float(p["anchor"]["designedSinkM"]["p50"]) * float(p.get("scale", 1.0))
        low = min(height_at(float(x), float(z)) for x, z in p["footprintM"])
        gap = line - low
        if gap > SEAT_BAR_M:
            by_run.setdefault(p["run"]["id"], []).append({
                "placementId": p["id"], "targetM": round(line, 3), "gapM": round(gap, 3),
                "footprintM": [[round(float(x), 3), round(float(z), 3)] for x, z in p["footprintM"]]})
    return [pad_patch(place_id, run_id, pieces) for run_id, pieces in sorted(by_run.items())]


def pad_patch(place_id: str, run_id: str, pieces: list[dict]) -> dict:
    pieces = sorted(pieces, key=lambda r: r["placementId"])
    xs = [x for r in pieces for x, _ in r["footprintM"]]
    zs = [z for r in pieces for _, z in r["footprintM"]]
    # a run id already starts with its place id: the patch id names it once
    short = run_id.removeprefix(f"{place_id}.")
    return {
        "id": f"patch.pad.settlement.{place_id}.{short}", "kind": "settlement-pad",
        "order": 3, "after": [], "crosses": [], "makesWater": False,
        "bboxM": [round(min(xs), 3), round(min(zs), 3), round(max(xs), 3), round(max(zs), 3)],
        "blendM": PAD_BLEND_M, "maxDeltaM": MAX_PAD_DELTA_M,
        "source": {"placeId": place_id, "runId": run_id,
                   "by": "worldgen.export_settlement_bundle (settlement_run_pads)"},
        "params": {"pieces": pieces},
        "why": (f"run {run_id} seats as one rigid chain and the ground falls away under "
                f"{len(pieces)} member(s) by more than {SEAT_BAR_M} m: the pad grades it up to "
                f"each member's designed ground line"),
    }


def merge_pad_patches(existing: list[dict], new: list[dict]) -> list[dict]:
    """The cumulative merge: every patch in ``existing`` survives; a pad in
    ``new`` adds its members, a member measured again with a gap replaces its
    old entry. Other kinds are untouched. Returns the merged list (unordered)."""
    out = {p["id"]: p for p in existing}
    for patch in new:
        old = out.get(patch["id"])
        if old is None:
            out[patch["id"]] = patch
            continue
        pieces = {r["placementId"]: r for r in old["params"]["pieces"]}
        pieces.update({r["placementId"]: r for r in patch["params"]["pieces"]})
        out[patch["id"]] = pad_patch(patch["source"]["placeId"], patch["source"]["runId"],
                                     list(pieces.values()))
    return list(out.values())


def declare_order(patches: list[dict], shape=(4033, 4033)) -> None:
    """Fill each settlement pad's `after` (invariant 5) with every patch
    earlier in (order, id) whose region meets it; pads come last (order 3,
    above every other kind), so no other patch's `after` changes."""
    from . import terrain_patches as tp
    ranked = tp.ordered(patches)
    boxes = {p["id"]: tp.region_box(p, shape) for p in ranked}
    for i, p in enumerate(ranked):
        if p["kind"] != "settlement-pad":
            continue
        p["after"] = sorted(q["id"] for q in ranked[:i] if tp._intersects(boxes[q["id"]], boxes[p["id"]]))


def _distance_to_polygon(x: np.ndarray, z: np.ndarray, polygon: list) -> np.ndarray:
    """Metres from each point to the footprint; 0 inside (the pad module's own
    polygon helpers, reused)."""
    from .grade_settlement_pads import _distance_to_polygon as edge_distance, _points_in_polygon
    return np.where(_points_in_polygon(x, z, polygon), 0.0, edge_distance(x, z, polygon))


def apply_settlement_pad(h: np.ndarray, patch: dict, mpp: float,
                         cell_offset: float = 0.0) -> tuple[np.ndarray, dict]:
    """Grade a COPY of ``h``: every sample within PAD_HARD_RADIUS_PX samples of
    a member's footprint takes that member's target; beyond, a smoothstep
    back to the ground over ``blendM``. Sample (r, c) stands at
    ((c + cell_offset) * mpp, (r + cell_offset) * mpp). Where two members
    reach one sample, the larger pull wins and a hard zone outranks a blend,
    so the order of the members never matters."""
    blend = float(patch.get("blendM", PAD_BLEND_M))
    hard = PAD_HARD_RADIUS_PX * mpp
    reach = hard + blend
    x0, z0, x1, z1 = (float(v) for v in patch["bboxM"])
    c0 = max(int(math.floor((x0 - reach) / mpp - cell_offset)) - 1, 0)
    c1 = min(int(math.ceil((x1 + reach) / mpp - cell_offset)) + 2, h.shape[1])
    r0 = max(int(math.floor((z0 - reach) / mpp - cell_offset)) - 1, 0)
    r1 = min(int(math.ceil((z1 + reach) / mpp - cell_offset)) + 2, h.shape[0])
    out = h.astype(np.float32, copy=True)
    if c0 >= c1 or r0 >= r1:
        return out, {"samplesChanged": 0, "maxRaiseM": 0.0, "maxCutM": 0.0}
    win = out[r0:r1, c0:c1].astype(np.float64)
    xs = (np.arange(c0, c1) + cell_offset) * mpp
    zs = (np.arange(r0, r1) + cell_offset) * mpp
    hard_target = np.full(win.shape, -np.inf)
    pull = np.zeros(win.shape)
    for piece in patch["params"]["pieces"]:
        poly = [(float(x), float(z)) for x, z in piece["footprintM"]]
        target = float(piece["targetM"])
        dist = _distance_to_polygon(xs[None, :], zs[:, None], poly)
        hard_target = np.where(dist <= hard, np.maximum(hard_target, target), hard_target)
        t = np.clip((dist - hard) / max(blend, 1e-6), 0.0, 1.0)
        w = 1.0 - t * t * (3.0 - 2.0 * t)
        step = (target - win) * w
        pull = np.where(np.abs(step) > np.abs(pull), step, pull)
    new = np.where(np.isfinite(hard_target), hard_target, win + pull)
    delta = new - win
    out[r0:r1, c0:c1] = new.astype(np.float32)
    return out, {"samplesChanged": int((np.abs(delta) > 1e-6).sum()),
                 "maxRaiseM": round(float(max(delta.max(), 0.0)), 3),
                 "maxCutM": round(float(max(-delta.min(), 0.0)), 3)}


def patched_height_at(survey, patches: list[dict]):
    """The survey's `height_at` over its published raster with ``patches``
    applied in memory (the yard float gate; `ProvinceSurvey.height_at` is the
    nearest pixel, cell i covering [i, i + 1) * px, hence cell_offset 0.5)."""
    if not patches:
        return survey.height_at
    base = survey.fields.height_m
    px = float(survey.height_px_m)
    heights = base
    for patch in sorted(patches, key=lambda p: (int(p.get("order", 0)), p["id"])):
        heights, _ = apply_settlement_pad(heights, patch, px, cell_offset=0.5)
    n = heights.shape[0]

    def height_at(x: float, z: float) -> float:
        row = min(max(int(z / px), 0), n - 1)
        col = min(max(int(x / px), 0), heights.shape[1] - 1)
        return float(heights[row, col])
    return height_at
