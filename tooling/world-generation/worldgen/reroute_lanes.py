"""Re-route the overland stretches of the published MAJOR BOAT LANES.

    cd tooling/world-generation
    python3 -m worldgen.reroute_lanes            # rewrites waterways.json in place
    python3 -m worldgen.reroute_lanes --dry-run  # report only

WHY THIS EXISTS
---------------
A published lane is a promise the catalogue's travel edges and the quests both
make: a hull of its class can sail it end to end. Three stretches did not keep
it — 576 m and 178 m of `route.boat.soulrest-lilmoth` and 124 m of
`route.boat.blackrose-lilmoth` crossed dry ground, up to 4.26 m above the sea
they were supposed to be floating on. The province's own declared portages run
11-89 m (`world/sources/routes/refined/portages.json`), so a 576 m carry is not
a carry anybody makes.

THE ROOT CAUSE is the one that has been found five times over: a solver decided
a physical water fact from a CLASS raster. `compile_society` builds its boat
cost from the Phase 3 hydrology pass — `ocean`, `lakes`, `rivers`, `tidal`,
`wetlands` — and every one of those is a *type label*, not a depth. `tidal` and
`wetlands` are cheap to cross in `routes.boat_cost_surface`, so the solver
happily cut the corner of a headland whose cells are labelled `tidal` while
standing metres above mean sea level. Measured on the shipped water at the
first defect (3120 E / 6860 S): `hydrology-pass1.npz` says `tidal=True`; the
compiled signed depth says **-5.28 m**.

The fix is NOT to dredge (a 576 m trench cut across a beach for a sailed
coaster is a fake), and NOT to demote the hull or move a berth (that hides the
defect in the promise). It is that the LINE is wrong, and the line is repaired
against the only thing that knows where water is: the compiled signed depth,
read through the one accessor, `water_report.ShippedWater`.

WHY A REPAIR PASS AND NOT A FIX IN `compile_society`
----------------------------------------------------
Exactly the reasoning `reroute_majors` records for the roads, plus one more.
`compile_society` is a Phase 4 step that derives danger, cultures and
territories from the same run, and it runs BEFORE the water compiler exists in
the chain — there is no signed depth for it to read. And `waterways-natural.json`,
the anchor-to-anchor solve it also publishes, is the SITING SEAM: `site_fields`
scores a place on how near a lane it is, so re-solving the natural lanes would
re-plot committed records. This pass therefore touches `waterways.json` only —
the published geometry the world carries — and leaves the natural solve alone.
`compile_society.publish_waterways` already protects a post-hoc repair of
exactly this kind: it keeps the published bytes while its natural solve and
berth-fit inputs are unchanged.

WHAT IT WILL AND WILL NOT DO
----------------------------
* It re-solves only the stretches that are overland for longer than
  `dock_dredge.LANE_PORTAGE_MAX_M`, between two points of the lane's own
  polyline, inside a local box. The lane keeps its id, its class, its declared
  berths and every point outside the repaired stretch.
* The re-solve may only stand on cells that are WET in the BASE (dry) season,
  measured as the MINIMUM signed depth over the water texels the cell covers —
  a cell is passable only if all of it is under water. So the repair can never
  invent a portage. Water shallower than the lane's promise is passable but
  dearer, because a shallow IS dredged (`dock_dredge.dredge_lanes`) and dry
  ground is not; the preference means the line uses a real channel wherever the
  province has one.
* If no wet line exists inside the box the stretch is left exactly as it was
  and reported as `unsolved`. That is a world-shape question (the lane's named
  endpoints may be on the wrong side of a headland), not something a compiler
  may decide.

Deterministic: no randomness, heap ties break on (cost, row, col).

WHERE IT SITS
-------------
    compile_society -> **reroute_lanes** -> (terrain chain: shape_province ->
    compile_water -> ...)

It is the water counterpart of `reroute_majors`, and runs in the same place:
after the Phase 4 solve, before the terrain chain, so the carve and
`dock_dredge.dredge_lanes` see the repaired line.
"""

from __future__ import annotations

import argparse
import heapq
import json
from pathlib import Path

import numpy as np

from . import dock_dredge as dd
from .routes import NEIGHBOR_OFFSETS
from .scale import HYDRO_PX_M
from .water_report import ShippedWater

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"

# The season the promise is measured in. A lane must carry its hull when the
# province is at its DRIEST; the wet season only ever adds water.
PROMISE_SEASON = "base"
# Polyline points of good lane kept either side of a bad run, so the re-solve
# may move the whole approach rather than kinking at the first wet cell.
PAD_PX = 3
# Room the re-solve is given to go round a headland, in water-surface texels
# (3.66 m each, so 329 m), doubled on each further pass.
BOX_PAD_PX = 90
MAX_PASSES = 3
# Deeper water is preferred so a repaired lane uses a real channel rather than
# hugging a flat the dredger would then have to cut. At or above the promised
# depth the multiplier is 1.0; at a waterline-thin 0 m it is 1.5. Half a cell's
# cost is enough to bend the line into a channel without making it wander:
# going round costs distance, and distance is the other half of the weight.
SHALLOW_PENALTY = 0.5
# A cell is passable to the re-solve when its whole area is under water. Zero,
# not the promised depth: see `solve_box`.
WET_FLOOR_M = 0.0


def _land_flag(nav: np.ndarray, mpp: float, x: float, y: float) -> int:
    """1 where a metre point stands out of the water, 0 where it is afloat."""
    c, r = int(x / mpp), int(y / mpp)
    if not (0 <= r < nav.shape[0] and 0 <= c < nav.shape[1]):
        return 1
    return 0 if nav[r, c] > WET_FLOOR_M else 1


def _cumulative_m(points_m) -> np.ndarray:
    """Distance along a metre polyline at each of its points."""
    p = np.asarray(points_m, dtype=np.float64)
    step = np.hypot(*np.diff(p, axis=0).T)
    return np.concatenate(([0.0], np.cumsum(step)))


def overland_runs(points_m, water: ShippedWater) -> list[dict]:
    """The stretches of one lane that stand on dry ground, measured exactly as
    `test_every_published_boat_lane_carries_a_hull_or_declares_a_portage` and
    `dock_dredge.dredge_lanes` measure them — the gate and the fix must not be
    two different measurements. Returns metre offsets along the line."""
    if water.ground2 is None:
        raise RuntimeError("reroute_lanes needs the refined heightfield "
                           "(the asset vault); it cannot run on a clean checkout")
    level = np.where(water.wet2, water.w2, np.nan).astype(np.float64)
    pts = dd._resample_line([tuple(map(float, p)) for p in points_m])
    samples = np.stack([pts[:, 1] / water.mpp2, pts[:, 0] / water.mpp2], axis=1)
    if not dd._inside(samples, water.w2.shape).all():
        return []
    levels = dd._lane_levels(level, samples, water.mpp2)
    ground = dd._sample_levels(water.ground2.astype(np.float64), samples)
    above = ~np.isfinite(levels) | (ground >= levels)
    for a, b in dd._runs(above):
        if b - a < 2:                       # a single sample is raster noise
            above[a:b] = True
    out = []
    for a, b in dd._runs(above):
        length = float(b - a) * dd.RESAMPLE_M
        if length > dd.LANE_PORTAGE_MAX_M:
            out.append({"lengthM": length,
                        "fromM": float(a) * dd.RESAMPLE_M,
                        "toM": float(b) * dd.RESAMPLE_M,
                        "atM": [round(float(pts[a, 0]), 1), round(float(pts[a, 1]), 1)]})
    return out


def solve_box(nav: np.ndarray, need: float, px_m: float,
              start: tuple[int, int], goal: tuple[int, int],
              box: tuple[int, int, int, int]) -> list[tuple[int, int]] | None:
    """Shortest waterborne line from `start` to `goal` (both (col, row)) inside
    `box` = (row0, row1, col0, col1). Returns px, ends included, or None.

    PASSABLE is *wet*, not *deep enough*: a cell whose whole area stands under
    water. That is the line between the two honest fixes and the dishonest one.
    Shallow water a lighter would ground in IS dredged — `dock_dredge` carries
    every published lane, and cutting a channel through a tidal flat is what a
    port does. Dry ground metres above the sea is not dredged, because a trench
    across a beach for a sailed coaster is a fake, so it is simply impassable
    here and the line goes round it. Depth below the promise is therefore a
    COST, not a wall: deeper water is preferred so the re-route uses a real
    channel wherever the province has one, and hands the dredger as little work
    as it can.
    """
    r0, r1, c0, c1 = box
    sub = nav[r0:r1, c0:c1]
    hh, ww = sub.shape
    sy, sx = start[1] - r0, start[0] - c0
    gy, gx = goal[1] - r0, goal[0] - c0
    if not (0 <= sy < hh and 0 <= sx < ww and 0 <= gy < hh and 0 <= gx < ww):
        return None
    ok = sub > WET_FLOOR_M
    if not (ok[sy, sx] and ok[gy, gx]):
        return None
    weight = np.where(ok, 1.0 + SHALLOW_PENALTY * np.clip(
        (need - sub) / need, 0.0, 1.0), np.inf)
    dist = np.full((hh, ww), np.inf)
    prev = np.full((hh, ww), -1, dtype=np.int64)
    dist[sy, sx] = 0.0
    heap = [(0.0, sy, sx)]
    while heap:
        d, y, x = heapq.heappop(heap)
        if d > dist[y, x]:
            continue
        if (y, x) == (gy, gx):
            break
        wyx = weight[y, x]
        for dy, dx in NEIGHBOR_OFFSETS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < hh and 0 <= nx < ww and np.isfinite(weight[ny, nx]):
                run = (1.4142135623730951 if dy and dx else 1.0) * px_m
                nd = d + run * 0.5 * (wyx + weight[ny, nx])
                if nd < dist[ny, nx]:
                    dist[ny, nx] = nd
                    prev[ny, nx] = y * ww + x
                    heapq.heappush(heap, (nd, ny, nx))
    if not np.isfinite(dist[gy, gx]):
        return None
    out: list[tuple[int, int]] = []
    cur = gy * ww + gx
    while cur >= 0:
        out.append((cur % ww + c0, cur // ww + r0))
        cur = int(prev[cur // ww, cur % ww])
    out.reverse()
    return out


def _anchor_indices(cum: np.ndarray, run: dict, pad: int, n: int) -> tuple[int, int]:
    """Padded polyline indices bracketing a bad run, whose extent is measured in
    metres along the line.

    Never index 0 or n-1: those two points are the lane's DECLARED BERTHS, a
    placed thing a geometry repair may not move (`test_reroute_lanes`). The
    first and last segments are preserved even when the bad run reaches them.
    """
    a = int(np.searchsorted(cum, run["fromM"], side="right")) - 1 - pad
    b = int(np.searchsorted(cum, run["toM"], side="left")) + pad
    return min(max(a, 1), n - 2), max(min(b, n - 2), 1)


def _walk_to_water(pts, idx: int, step: int, nav: np.ndarray, mpp: float) -> int | None:
    """The nearest polyline index from `idx` in direction `step` that stands in
    the water — the re-solve has to start and end afloat. Stops short of the
    declared berths at either end, which the repair may not move."""
    while 1 <= idx <= len(pts) - 2:
        c, r = _cell(pts[idx], mpp)
        if 0 <= r < nav.shape[0] and 0 <= c < nav.shape[1] and nav[r, c] > WET_FLOOR_M:
            return idx
        idx += step
    return None


def _cell(pt, mpp: float) -> tuple[int, int]:
    """(col, row) of the water-grid texel a metre point falls in."""
    return int(pt[0] / mpp), int(pt[1] / mpp)


def repair(points_m, nav: np.ndarray, mpp: float, need: float, runs: list[dict],
           attempt: int = 0) -> tuple[list, list[dict]]:
    """Re-solve the given overland stretches of one lane, right to left so the
    polyline indices stay valid. Returns (points in metres, edits). One pass —
    the caller re-measures between passes, because fixing one stretch can move
    the next.
    """
    cur = [(float(x), float(y)) for x, y in points_m]
    edits: list[dict] = []
    cum = _cumulative_m(cur)
    pad = PAD_PX * (attempt + 1)
    box_pad = BOX_PAD_PX * (attempt + 1)
    for run in reversed(runs):
        a, b = _anchor_indices(cum, run, pad, len(cur))
        a2 = _walk_to_water(cur, a, -1, nav, mpp)
        b2 = _walk_to_water(cur, b, +1, nav, mpp)
        if a2 is None or b2 is None or b2 <= a2:
            edits.append({"atM": run["atM"], "lengthM": run["lengthM"],
                          "status": "unsolved", "why": "no wet anchor on the lane"})
            continue
        cells = [_cell(p, mpp) for p in cur[a2:b2 + 1]]
        rows = [q[1] for q in cells]
        cols = [q[0] for q in cells]
        box = (max(0, min(rows) - box_pad), min(nav.shape[0], max(rows) + box_pad + 1),
               max(0, min(cols) - box_pad), min(nav.shape[1], max(cols) + box_pad + 1))
        new = solve_box(nav, need, mpp, cells[0], cells[-1], box)
        if new is None or len(new) < 2:
            edits.append({"atM": run["atM"], "lengthM": run["lengthM"],
                          "status": "unsolved",
                          "why": f"no wet line inside a {box_pad} px box"})
            continue
        edits.append({"atM": run["atM"], "lengthM": run["lengthM"],
                      "status": "rerouted", "points": len(new) - (b2 - a2 + 1)})
        cur = cur[:a2] + [((c + 0.5) * mpp, (r + 0.5) * mpp) for c, r in new] + cur[b2 + 1:]
    return cur, edits


def _lane_points_m(lane: dict, px_m: float = HYDRO_PX_M):
    """The lane's geometry in metres — the exact line if it carries one, else
    its raster cell centres, with the declared berths substituted at the ends.
    This is `province_network.load_network`'s rule, and must stay it."""
    exact = lane.get("pointsM")
    if isinstance(exact, list) and len(exact) >= 2:
        pts = [(float(x), float(y)) for x, y in exact]
    else:
        pts = [((float(c) + 0.5) * px_m, (float(r) + 0.5) * px_m) for c, r in lane["px"]]
    for key, index in (("startsAtM", 0), ("endsAtM", -1)):
        end = lane.get(key)
        if isinstance(end, list) and len(end) == 2 and pts:
            pts[index] = (float(end[0]), float(end[1]))
    return pts


def _to_px(points_m, px_m: float = HYDRO_PX_M) -> list[list[int]]:
    """The hydrology-grid cell trail of a metre polyline, consecutive
    duplicates dropped. `px` stays the studio's overlay and the coarse trail;
    `pointsM` is the geometry the world is built from."""
    out: list[list[int]] = []
    for x, y in points_m:
        cell = [int(x / px_m), int(y / px_m)]
        if not out or out[-1] != cell:
            out.append(cell)
    return out


def run(write: bool = True, province: Path = PROVINCE,
        water: ShippedWater | None = None) -> list[dict]:
    path = province / "waterways.json"
    doc = json.loads(path.read_text())
    water = water or ShippedWater()
    nav = water.signed_depth_m(PROMISE_SEASON).astype(np.float64)
    mpp = water.mpp2
    need = dd.LANE_MIN_DEPTH_M
    report: list[dict] = []
    for lane in doc.get("lanes", []):
        before = overland_runs(_lane_points_m(lane), water)
        if not before:
            continue
        pts_before = _lane_points_m(lane)
        pts, edits, left = pts_before, [], before
        for attempt in range(MAX_PASSES):
            pts, more = repair(pts, nav, mpp, need, left, attempt=attempt)
            edits += more
            left = overland_runs(pts, water)
            if not left or not any(e["status"] == "rerouted" for e in more):
                break
        # The repaired line is EXACT metres. Publishing it as raster cells would
        # re-quantise a channel four metres wide onto a 5.48 m lattice and put
        # the lane back on the bank, so `pointsM` carries the geometry and `px`
        # becomes the coarse trail the studio overlay draws.
        lane["pointsM"] = [[round(x, 3), round(y, 3)] for x, y in pts]
        lane["px"] = _to_px(pts)
        # `land` is the per-px "this hop is a carry" flag downstream refinement
        # reads. Re-derive it from the same measured depth the repair used, so
        # it can never disagree with the geometry beside it.
        lane["land"] = [_land_flag(nav, mpp, (cx + 0.5) * HYDRO_PX_M, (cy + 0.5) * HYDRO_PX_M)
                        for cx, cy in lane["px"]]
        report.append({
            "id": lane.get("id") or f"{lane.get('from')}->{lane.get('to')}",
            "beforeOverlandM": [round(r["lengthM"], 1) for r in before],
            "afterOverlandM": [round(r["lengthM"], 1) for r in left],
            "pointsBefore": len(pts_before),
            "pointsAfter": len(pts),
            "edits": edits,
        })
    if write and report:
        path.write_bytes((json.dumps(doc, ensure_ascii=False,
                                     separators=(",", ":")) + "\n").encode("utf-8"))
        (province / "waterways-repaired-lanes.json").write_text(json.dumps(
            {"schemaVersion": 1, "kind": "major-lane-overland-repair",
             "season": PROMISE_SEASON, "needM": need,
             "portageMaxM": dd.LANE_PORTAGE_MAX_M, "lanes": report},
            ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return report


def digest(report: list[dict]) -> str:
    if not report:
        return "no published lane runs overland for longer than a portage."
    lines = ["| lane | overland before (m) | after (m) | points | stretches |",
             "| --- | --- | --- | --- | --- |"]
    for r in sorted(report, key=lambda r: r["id"]):
        lines.append("| `{}` | {} | {} | {} → {} | {} |".format(
            r["id"], ", ".join(f"{v:.0f}" for v in r["beforeOverlandM"]) or "-",
            ", ".join(f"{v:.0f}" for v in r["afterOverlandM"]) or "none",
            r["pointsBefore"], r["pointsAfter"],
            ", ".join(f"{e['status']}" for e in r["edits"])))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    print(digest(run(write=not a.dry_run)))


if __name__ == "__main__":
    main()
