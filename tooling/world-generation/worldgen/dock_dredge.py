"""Dredge a dock's approach so the water carries the hull the berth promises.

THE RULE (write it down once, here):

A dock in a Phase 11 blueprint declares a `hullClass`, and
``blueprint._validate_docks`` (97 B5/G9) holds the province to it: over the
first ``DOCK_DEPTH_SAMPLE_M`` of the route that serves the berth, the published
water must carry ``HULL_CLASS_DEPTH_M[hullClass]`` CONTINUOUSLY. Where it does
not, the fix is to **dredge the approach**, not to demote the hull or shift the
berth:

* a working port keeps its channel dug — a lighter quay on a silting delta
  coast is a dredged channel in the real world, and a poled landing is a lane
  its village keeps open with poles and mattocks. Cutting the bed is the
  physical truth of a port, not a fudge of a check;
* the berth is fixed by what stands on it (quay, pads, buildings). Moving it
  moves the settlement; and
* the hull class is a claim the catalogue and the quests make about what can
  tie up there. Lowering it silently rewrites the world.

WHAT THIS READS. The promises come from the blueprints themselves — every
`docks[]` entry with a `hullClass`, paired with the `networkTerminals[]` entry
of water kind that names its serving route, and that route's geometry from the
published network. Nothing is hard-coded per dock: a dock that starts failing
tomorrow is dredged by this same code with no edit.

WHAT THIS CUTS. Along the serving route, from the berth outward for the length
of the promise (plus a lead-out that runs on until it meets water already deep
enough, so the dredged reach is CONTINUOUS with the open water and fills to the
right level instead of standing as a pond or a dam):

* a channel of a width suited to the hull (``HULL_CHANNEL_HALF_WIDTH_M``),
  following the route rather than a straight line;
* a bed at the LOCAL water level minus the promised depth minus a rounding
  margin. The level is read from the water that actually stands there (the
  solved bodies and the channel stations), never a constant, and it is read
  per sample: a 100 m approach down a marsh or a tidal reach crosses a
  gradient, so one number would cut metres too deep at the low end and leave a
  sill at the high one. The series is then made non-increasing outward from
  the berth, because a bed that rises again on the way out is a sill;
* sloped sides (``SIDE_SLOPE_RUN`` metres out per metre up) rather than a slot,
  so the cut reads as a dredged channel and its banks are stable.

WHAT THIS NEVER DOES. It never raises ground (only cuts), and it never touches
a cell standing at or above its local water level — the quay, the pads and the
buildings behind the berth are bit-identical afterwards. Where a point of the
approach ITSELF stands above the water (a bar, a spit, a berth drawn on dry
ground) the promise cannot be kept by dredging, so the reach is reported
``blocked`` and nothing at all is cut there: half a trench would hide the
fault. That is a berth or route placement call, not a terrain one.

Runs in :func:`worldgen.refine_province.carve_to_profile`, after
``authored_waterways.carve_authored``, on the same full-res sample grid.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy import ndimage

from .authored_waterways import _inside, connected_depth  # noqa: F401 — connected_depth is re-exported for tests
from .dock_spec import (
    BLUEPRINT_DIR,
    DOCK_DEPTH_SAMPLE_M,
    HULL_CLASS_DEPTH_M,
)
from .scale import RAW_M

SCHEMA_NOTE = "dock-approach-dredge"

# Navigable half-width of the dredged channel, by hull class. A poling lane is
# a pole's reach wide; a lighter channel has to let two lighters pass.
HULL_CHANNEL_HALF_WIDTH_M = {"canoe": 6.0, "small-draft": 9.0, "keeled": 15.0}
SIDE_SLOPE_RUN = 3.0            # metres outward per metre of rise: a bank, not a wall
DEPTH_MARGIN_M = 0.25           # cut below the promise so rounding cannot eat it
LEAD_OUT_M = 250.0              # how far past the promise the channel may run to meet deep water
LEVEL_SCAN_M = 80.0             # how far off the reach a station may still govern it
RESAMPLE_M = 2.0


# --------------------------------------------------------------------------
# what the blueprints promise


def load_dock_promises(blueprint_dir: Path = BLUEPRINT_DIR, network=None) -> list[dict]:
    """Every (dock, serving route) pair a blueprint promises, with its depth.

    Read from the authored blueprints and the published route network — the
    same two sources ``blueprint._validate_docks`` checks against, so the
    dredge can never be dredging something other than what is checked.
    """
    if network is None:
        from . import province_network as pn
        network = {rid: r for rid, r in pn.load_network().items() if r.is_water}
    from . import blueprint_footprints as fp
    extent = float(fp.PROVINCE_EXTENT_M)

    rows: list[dict] = []
    for path in sorted(Path(blueprint_dir).glob("*.json")):
        doc = json.loads(path.read_text())
        bp = doc.get("blueprint") if isinstance(doc, dict) and "blueprint" in doc else doc
        if not isinstance(bp, dict):
            continue
        docks = {d.get("id"): d for d in (bp.get("docks") or []) if d.get("id")}
        if not docks:
            continue
        for term in bp.get("networkTerminals") or []:
            did = term.get("dockId")
            if did not in docks or term.get("kind") not in ("lane", "channel"):
                continue
            dock = docks[did]
            need = HULL_CLASS_DEPTH_M.get(dock.get("hullClass"))
            pos = dock.get("position")
            route = network.get(term.get("routeId"))
            if need is None or route is None or not route.points_m:
                continue
            if not (isinstance(pos, list) and len(pos) == 2):
                continue
            rows.append({
                "placeId": bp.get("id") or path.stem,
                "dockId": did,
                "hullClass": dock.get("hullClass"),
                "needM": float(need),
                "routeId": term.get("routeId"),
                "berthM": (float(pos[0]) * extent, float(pos[1]) * extent),
                "pointsM": [tuple(map(float, p)) for p in route.points_m],
            })
    return rows


def approach_points_m(points_m, berth_m, reach_m: float = DOCK_DEPTH_SAMPLE_M,
                      lead_out_m: float = LEAD_OUT_M) -> np.ndarray:
    """The reach to dredge: from the route end nearest the berth, outward.

    `reach_m` is the length the promise covers; the walk continues for up to
    `lead_out_m` further so the caller can run the channel on until it meets
    water that is already deep enough.
    """
    pts = list(points_m)
    if math.dist(berth_m, pts[0]) > math.dist(berth_m, pts[-1]):
        pts.reverse()
    walked, out = 0.0, [pts[0]]
    limit = reach_m + lead_out_m
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if seg <= 0:
            continue
        take = min(seg, limit - walked)
        n = max(1, int(math.ceil(take / RESAMPLE_M)))
        for i in range(1, n + 1):
            t = (take * i / n) / seg
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        walked += take
        if walked >= limit:
            break
    return np.asarray(out, dtype=np.float64)


# --------------------------------------------------------------------------
# the level the water actually stands at


def _sample_levels(level: np.ndarray, samples_yx: np.ndarray) -> np.ndarray:
    """`level` read at the sample cells; NaN where nothing stands there."""
    iy = np.clip(np.round(samples_yx[:, 0]).astype(int), 0, level.shape[0] - 1)
    ix = np.clip(np.round(samples_yx[:, 1]).astype(int), 0, level.shape[1] - 1)
    return level[iy, ix]


def reach_levels(level: np.ndarray, samples_yx: np.ndarray, mpp: float,
                 stations=None, scan_m: float = LEVEL_SCAN_M) -> np.ndarray:
    """The level of the water that actually stands at EACH sample of the reach.

    A 100 m approach across a marsh or down a tidal reach crosses a gradient:
    one governing number would cut metres too deep at the low end and leave a
    sill at the high one. So each sample takes the nearest solved level — a
    standing body cell, or a channel station, whichever is closer — and the
    series is then made non-increasing outward from the berth, because a bed
    that rises again on the way to the open water is a sill the channel would
    strand a hull on. NaN where no water governs a sample at all.
    """
    ys, xs = samples_yx[:, 0], samples_yx[:, 1]
    out = np.full(len(samples_yx), np.nan, dtype=np.float64)
    pad = int(np.ceil(scan_m / mpp)) + 2
    y0 = max(int(np.floor(ys.min())) - pad, 0)
    y1 = min(int(np.ceil(ys.max())) + pad + 1, level.shape[0])
    x0 = max(int(np.floor(xs.min())) - pad, 0)
    x1 = min(int(np.ceil(xs.max())) + pad + 1, level.shape[1])
    sub = level[y0:y1, x0:x1]
    finite = np.isfinite(sub)
    if finite.any():
        # nearest wet cell to every sample at once
        dist, (iy, ix) = ndimage.distance_transform_edt(
            ~finite, sampling=(mpp, mpp), return_indices=True)
        ry = np.clip(np.round(ys).astype(int) - y0, 0, sub.shape[0] - 1)
        rx = np.clip(np.round(xs).astype(int) - x0, 0, sub.shape[1] - 1)
        near = dist[ry, rx] <= scan_m
        out[near] = sub[iy[ry, rx], ix[ry, rx]][near]
    if stations is not None:
        sy, sx, sl = stations
        keep = np.isfinite(sl)
        if keep.any():
            sy, sx, sl = sy[keep], sx[keep], sl[keep]
            d = np.hypot(sy[:, None] - ys[None, :], sx[:, None] - xs[None, :]) * mpp
            j = np.argmin(d, axis=0)
            dmin = d[j, np.arange(len(ys))]
            take = (dmin <= scan_m) & (~np.isfinite(out) | (dmin < scan_m))
            cand = np.where(take, sl[j], np.nan)
            out = np.where(np.isfinite(cand) & (~np.isfinite(out) | (cand < out)), cand, out)
    if np.isfinite(out).any():
        # carry the last level that governed across any gap (forwards, then
        # backwards for a gap at the berth), then flatten sills
        ok = np.isfinite(out)
        idx = np.where(ok, np.arange(len(out)), 0)
        np.maximum.accumulate(idx, out=idx)
        out = out[idx]
        first = int(np.argmax(ok))
        out[:first] = out[first]
        out = np.minimum.accumulate(out)
    return out


# --------------------------------------------------------------------------
# the cut


def dredge_channel(h: np.ndarray, samples_yx: np.ndarray, bed_m, water_level_m,
                   mpp: float = RAW_M, half_width_m: float = 6.0,
                   slope_run: float = SIDE_SLOPE_RUN) -> tuple[np.ndarray, dict]:
    """Cut a sloped-sided channel along sample-space points.

    `bed_m` and `water_level_m` are per-sample (or scalar): every window cell
    takes the bed and the waterline of the centreline sample NEAREST to it, so
    the channel follows the water surface down its reach. Inside
    `half_width_m` the bed is flat; outside it the target rises one metre per
    `slope_run` metres until it meets the ground. Nothing at or above the
    waterline is touched, and nothing is ever raised.

    Returns (heights, stats) with the cut's extent and the protected
    (above-water) cells that fell inside the channel core.
    """
    bed = np.broadcast_to(np.asarray(bed_m, dtype=np.float64), (len(samples_yx),))
    lvl = np.broadcast_to(np.asarray(water_level_m, dtype=np.float64), (len(samples_yx),))
    rise = float(np.nanmax(lvl - bed))
    reach = half_width_m + max(rise, 0.0) * slope_run
    pad = int(np.ceil(reach / mpp)) + 2
    ys, xs = samples_yx[:, 0], samples_yx[:, 1]
    y0 = max(int(np.floor(ys.min())) - pad, 0)
    y1 = min(int(np.ceil(ys.max())) + pad + 1, h.shape[0])
    x0 = max(int(np.floor(xs.min())) - pad, 0)
    x1 = min(int(np.ceil(xs.max())) + pad + 1, h.shape[1])
    win = h[y0:y1, x0:x1]
    line = np.zeros(win.shape, dtype=bool)
    sample_id = np.zeros(win.shape, dtype=np.int32)
    iy = np.clip(np.round(ys).astype(int) - y0, 0, win.shape[0] - 1)
    ix = np.clip(np.round(xs).astype(int) - x0, 0, win.shape[1] - 1)
    line[iy, ix] = True
    sample_id[iy, ix] = np.arange(len(samples_yx))
    d, (ny, nx) = ndimage.distance_transform_edt(~line, sampling=(mpp, mpp), return_indices=True)
    owner = sample_id[ny, nx]
    bed_field = bed[owner]
    water_level_field = lvl[owner]
    target = (bed_field + np.maximum(d - half_width_m, 0.0) / max(slope_run, 1e-6)).astype(np.float32)
    # never touch ground standing at or above the water: the quay and what is
    # built on it are not terrain this rule may re-grade
    dry = win >= water_level_field
    cut = (target < win) & ~dry
    blocked = int((dry & (d <= half_width_m)).sum())
    depth_cut = (win - target)[cut]
    win[cut] = target[cut]
    h[y0:y1, x0:x1] = win
    cell_area = mpp * mpp
    return h, {
        "cellsCut": int(cut.sum()),
        "areaM2": round(float(cut.sum()) * cell_area, 1),
        "volumeM3": round(float(depth_cut.sum()) * cell_area, 1) if cut.any() else 0.0,
        "maxCutM": round(float(depth_cut.max()), 3) if cut.any() else 0.0,
        "protectedCoreCells": blocked,
        "window": (y0, y1, x0, x1),
    }


def _min_depth(h, samples_yx, levels) -> float:
    """The shallowest water over a reach: min(level - ground), in metres."""
    return float(np.min(levels - _sample_levels(h, samples_yx)))


def dredge_docks(h: np.ndarray, level_with_sea: np.ndarray,
                 mpp: float = RAW_M, stations=None, promises=None,
                 log=None) -> tuple[np.ndarray, list[dict]]:
    """Dredge every dock approach that does not already carry its hull class.

    Returns (heights, per-approach stats). An approach is cut only if the cut
    can actually keep the promise: where a point of the reach stands at or
    above the waterline (a bar, a spit, a berth drawn on dry ground) the reach
    is reported ``blocked`` and left EXACTLY as it was, rather than half-dug.
    That is a berth or route placement error, not something terrain should
    quietly hide.
    """
    if promises is None:
        promises = load_dock_promises()
    level = np.where(np.isfinite(level_with_sea), level_with_sea, np.nan)
    n_promise = max(int(round(DOCK_DEPTH_SAMPLE_M / RESAMPLE_M)) + 1, 2)
    out: list[dict] = []
    for row in promises:
        need = row["needM"]
        pts = approach_points_m(row["pointsM"], row["berthM"])
        samples = np.stack([pts[:, 1] / mpp, pts[:, 0] / mpp], axis=1)   # (row=z, col=x)
        promise_n = min(n_promise, len(samples))
        rec = {"dockId": row["dockId"], "routeId": row["routeId"],
               "hullClass": row["hullClass"], "promisedDepthM": need}
        # a berth that is not on THIS grid is not this grid's berth: clamping
        # its samples to the edge would dig a trench in the wrong place
        if not _inside(samples, h.shape).all():
            rec["status"] = "off-grid"
            out.append(rec)
            continue
        levels = reach_levels(level, samples, mpp, stations)
        if not np.isfinite(levels).all():
            rec["status"] = "no-water"
            out.append(rec)
            if log:
                log(f"dock dredge {row['dockId']} / {row['routeId']}: no water governs the approach")
            continue
        ground = _sample_levels(h, samples)
        depths = levels - ground
        have = float(np.min(depths[:promise_n]))
        rec["waterLevelAtBerthM"] = round(float(levels[0]), 3)
        rec["waterLevelAtReachEndM"] = round(float(levels[promise_n - 1]), 3)
        rec["existingMinDepthM"] = round(have, 3)
        if have + 1e-6 >= need:
            rec["status"] = "already-deep"
            out.append(rec)
            continue
        # run the cut past the promise until it meets water already deep
        # enough, so the dredged reach is CONTINUOUS with the open water it
        # leads to and fills from it rather than standing as a pond
        end = promise_n
        while end < len(samples) and depths[end - 1] < need:
            end += 1
        cut_samples, cut_levels = samples[:end], levels[:end]
        bed = cut_levels - need - DEPTH_MARGIN_M
        # a point standing at or above the waterline cannot be cut by this
        # rule, so the promise cannot be kept here: report, do not dig
        above = ground[:promise_n] >= levels[:promise_n]
        rec["bedAtBerthM"] = round(float(bed[0]), 3)
        rec["halfWidthM"] = HULL_CHANNEL_HALF_WIDTH_M.get(row["hullClass"], 6.0)
        rec["lengthM"] = round(float(end - 1) * RESAMPLE_M, 1)
        if above.any():
            first = float(np.argmax(above)) * RESAMPLE_M
            rec["status"] = "blocked"
            rec["blockedSamples"] = int(above.sum())
            rec["blockedFirstAtM"] = round(first, 1)
            rec["blockedHighestAboveWaterM"] = round(
                float(np.max((ground[:promise_n] - levels[:promise_n])[above])), 3)
            out.append(rec)
            if log:
                log(f"dock dredge {row['dockId']} / {row['routeId']}: BLOCKED — "
                    f"{int(above.sum())} of {promise_n} points of the approach stand up to "
                    f"{rec['blockedHighestAboveWaterM']:.2f} m ABOVE the water (first at "
                    f"{first:.0f} m from the berth). Nothing cut: the berth or the route is "
                    f"wrong, and that is a placement call")
            continue
        h, stats = dredge_channel(h, cut_samples, bed, cut_levels, mpp, rec["halfWidthM"])
        # The window is kept, not dropped: it is this cut's FOOTPRINT, and the
        # incremental chain (`worldgen.footprint`, `worldgen.recarve_local`)
        # needs to know where on the province the edit landed to rebuild only
        # the tiles that intersect it.
        stats["window"] = list(stats["window"])
        rec.update(stats)
        after = _min_depth(h, samples[:promise_n], levels[:promise_n])
        rec["dredgedMinDepthM"] = round(after, 3)
        rec["status"] = "dredged" if after + 1e-6 >= need else "blocked"
        if log:
            log(f"dock dredge {row['dockId']} / {row['routeId']}: {rec['status']}, "
                f"{rec['lengthM']:.0f} m x {2 * rec['halfWidthM']:.0f} m, bed "
                f"{bed[0]:.2f}..{bed[-1]:.2f} m under water {cut_levels[0]:.2f}.."
                f"{cut_levels[-1]:.2f} m, {stats['cellsCut']} cells, "
                f"{stats['volumeM3']:.0f} m3, depth {have:.2f} -> {after:.2f} m")
        out.append(rec)
    return h, out
