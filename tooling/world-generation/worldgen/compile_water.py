"""Compile the province water surface and semantic character.

Turns the Phase 3 hydrology solve + the Phase 6/6b refined terrain into the
data the water renderer and the gameplay `WorldWaterQuery` both sample:

- a province-wide water-surface-height field W(x,z): the real surface height
  over water (sea 0, lakes at their fill level, rivers at a monotone-downstream
  surface), extrapolated as a local "water table" across floodable fringes
  (so tide/wet-season level changes flood the right land). A separate support
  raster ends the water domain: dry elevations never distort the shoreline;
- a flow field (direction + speed) along rivers, plus a shore-distance field;
- per-pixel water character (class, turbidity, salinity, season response).

Usage:
  python3 -m worldgen.compile_water --out-dir <destination> [--cache <npz>]

Writes:
- optional full arrays -> explicitly requested --cache path
- browser data -> apps/world-studio/public/province/water/v2/
    water-surface.png  native terrain grid RGB: R,G = W quantised 16-bit,
                       B = depth proxy clamp(W - ground, 0, 25.5) / 0.1
    water-flow.png     1345^2 RGB: R,G = flow dir*speed, B = speed / FLOW_MAX
    water-class.png    1345^2 RGB: R = class idx, G = turbidity, B = salinity
    water-shore.png    native RGB: shore distance, season response, tannin
    water-support.png  native RGB: supported domain, body index high/low byte
    water-character.png 1345^2 RGB: river band, region, wave exposure
    water-meta.json    encodings + stats
"""

from __future__ import annotations

import json
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .compile_chunks import DEFAULT_HEIGHTS
from .export_web_chunks import encode_rg16
from .hydrology import fill_depressions
from .scale import RAW_METRES_PER_SAMPLE as RAW_M
from .water_geometry import (body_records, channel_surface, condition_channel_profiles,
                            downhill_graph, extend_surface, refine_channel_stations)
from .water_features import compile_features
from .water_geometry import repair_channel_beds, repair_channel_films

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water" / "v2"

STEP = 3                      # hydrology grid: 4033 -> 1345, 5.48352 m/px
WEB_STEP = 2                  # export only; native solve is shared by both quality levels

# Water surface authoring
FREEBOARD = {1: 0.5, 2: 0.9, 3: 1.5}   # river surface = ambient bank - freeboard
CARVE_DEPTH = {1: 1.4, 2: 2.6, 3: 4.2}  # refine_province.CHANNELS bed depths
LAKE_DROP_M = 0.10            # lake surface sits just under the fill level
LAKE_MIN_PX = 4               # ignore pit-noise "lakes" smaller than this
# Refined-grid placement (owner round 2 — "water finds its level")
MIN_POOL_DEPTH_M = 0.30       # a depression must hold this somewhere to count
MIN_POOL_PX = 24              # ~320 m^2 at 3.66 m/px — no pixel puddle noise
BURY_M = 3.0                  # legacy coarse-grid diagnostic only
TABLE_MAX_PX = 24             # how far the water table extends over floodable land
FLOODABLE_HAND_M = 4.0        # hand < this counts as floodable fringe

# Flow field
FLOW_SPEED = {1: 0.4, 2: 0.7, 3: 1.1}  # m/s by river band
FLOW_MAX = 3.0                # encoding ceiling, m/s
SHORE_MAX_M = 160.0           # shore-distance encoding ceiling
DEPTH_MIN_M = -6.3            # signed bank clearance, preserves seasonal inundation
DEPTH_MAX_M = DEPTH_MIN_M + 25.5

# Water classes (R channel of water-class.png; 0 = dry)
CLASSES = ["none", "coast", "estuary", "river", "lake", "marsh"]

# Water character by region class (research: tropical-fluvial-geomorphology
# — Sioli typology: blackwater from peat/organic catchments, whitewater silt
# from erosive uplands, clear from rock/sand). Indexed by regionsLegend 0-13.
REGION_SILT = np.array(
    [0.12, 0.05, 0.45, 0.65, 0.30, 0.55, 0.15, 0.20, 0.25, 0.50, 0.30, 0.40, 0.20, 0.30],
    dtype=np.float32)
REGION_TANNIN = np.array(
    [0.00, 0.00, 0.05, 0.15, 0.35, 0.20, 0.85, 0.70, 0.50, 0.30, 0.20, 0.15, 0.45, 0.60],
    dtype=np.float32)


def river_surface(z: np.ndarray, npz) -> np.ndarray:
    """Raw per-river-cell surface height (bank level minus freeboard)."""
    rivers = npz["rivers"].copy()
    w = np.full(z.shape, np.nan, dtype=np.float32)
    for band, drop in FREEBOARD.items():
        m = rivers == band
        w[m] = z[m] - drop
    return np.maximum(w, 0.0, where=~np.isnan(w), out=w)


def backwater(w: np.ndarray, npz, filled: np.ndarray) -> np.ndarray:
    """Make the composite surface monotone non-increasing downstream by
    raising river cells to at least their downstream successor's level
    (physical backwater: rivers pond up behind lakes, bumps and the sea).
    Processes cells lowest-first so each reads a finalised successor."""
    flow_to = npz["flow_to"].reshape(-1)
    riv = (npz["rivers"] > 0).reshape(-1)
    wf = w.reshape(-1)
    cells = np.flatnonzero(riv)
    cells = cells[np.argsort(filled.reshape(-1)[cells], kind="stable")]
    # flats resolve by epsilon drainage not visible in `filled`, so ordered
    # passes can propagate as little as one link per pass on tied chains —
    # iterate to a true fixpoint (cells is small: only river cells).
    for _ in range(len(cells) + 1):
        changed = False
        for i in cells:
            if np.isnan(wf[i]):
                continue
            j = flow_to[i]
            if j >= 0 and not np.isnan(wf[j]) and wf[j] > wf[i]:
                wf[i] = wf[j]
                changed = True
        if not changed:
            break
    return w


def compute(z: np.ndarray, refined: np.ndarray, npz, web_step: int = 1, profiles_only=False,
            bank_ground=None) -> dict:
    """Water fields on the hydrology grid and native terrain surface grid."""
    mpp1 = RAW_M * STEP
    ocean = npz["ocean"]
    filled = npz["filled"]
    rivers = npz["rivers"].copy()
    lakes = npz["lakes"]
    wetlands = npz["wetlands"]
    tidal = npz["tidal"]
    salinity = npz["salinity"].astype(np.float32)
    hand = npz["hand"]
    flood = npz["flood"]
    flow_to = npz["flow_to"].reshape(-1)
    # Same minor drainage channels that fluvial._rivulets carves. They are
    # real terrain, but the old surface ignored all sub-river drainage.
    rivulets = wetlands & (rivers == 0) & (npz["accum_km2"] > 0.02) & (npz["accum_km2"] <= 0.12)
    rivers[rivulets] = 1
    hydro = dict(npz)
    hydro["rivers"] = rivers

    # --- 1. water surface W on the hydrology grid -------------------------
    w = np.full(z.shape, np.nan, dtype=np.float32)
    sea = ocean | (z < 0.0)
    w[sea] = 0.0

    lbl, _n = ndimage.label(lakes)
    if _n:
        areas = np.bincount(lbl.ravel())
        keep = np.zeros(_n + 1, dtype=bool)
        keep[1:] = areas[1:] >= LAKE_MIN_PX
        big_lakes = keep[lbl]
        lake_w = filled.astype(np.float32) - LAKE_DROP_M
        w = np.where(big_lakes & ~sea, np.fmax(np.nan_to_num(w, nan=-1e9), lake_w), w)
        w[w < -1e8] = np.nan
    else:
        big_lakes = np.zeros(z.shape, dtype=bool)

    wr = river_surface(z, hydro)
    riv = ~np.isnan(wr)
    w = np.where(riv, np.fmax(np.nan_to_num(w, nan=-1e9), wr), w)
    w[w < -1e8] = np.nan
    w = backwater(w, hydro, filled)

    wet = ~np.isnan(w)

    # (flow is computed AFTER the refined surface below — round 7: speed
    # comes from the conditioned long profile, not the raw terrain slope)
    h_, w_ = z.shape
    shore_d = (ndimage.distance_transform_edt(wet) * mpp1).astype(np.float32)

    nodata = np.isnan(w)
    w_filled = np.where(nodata, z - BURY_M, w).astype(np.float32)

    # Surface samples coincide with terrain vertices. Coarse semantic cells
    # coincide with the three-vertex blocks used by the terrain carver.
    g2 = refined[::web_step, ::web_step].astype(np.float32)
    n2 = g2.shape[0]
    mpp2 = RAW_M * web_step
    g2s = ndimage.gaussian_filter(g2, 2.0 / web_step)
    grid_scale = (n2 - 1) / (z.shape[0] - 1)
    station_offset = (STEP // 2) / web_step

    def resample_semantics(a, order):
        return ndimage.affine_transform(a.astype(np.float32), np.eye(2) / grid_scale,
            offset=-station_offset / grid_scale, output_shape=g2.shape, order=order, mode="nearest")

    def up_lin(a):
        return resample_semantics(a, 1)

    def up_near(a):
        return resample_semantics(a, 0) > 0.5

    def down(a, order):
        return ndimage.affine_transform(a.astype(np.float32), np.eye(2) * grid_scale,
            offset=station_offset, output_shape=z.shape, order=order, mode="nearest")

    w2 = np.full(g2.shape, np.nan, dtype=np.float32)

    def comp(mask, values):
        nonlocal w2
        w2 = np.where(mask, np.fmax(np.nan_to_num(w2, nan=-1e9), values), w2)
        w2[w2 < -1e8] = np.nan

    # sea plane (y = 0, decision 0003/0005)
    comp(g2 < 0.0, np.float32(0.0))

    # Priority-flood uses the actual ground, without blurring away banks.
    # It supplies standing pools only; river surfaces are segment profiles.
    riv2f = ndimage.gaussian_filter(
        up_lin(ndimage.binary_dilation(riv, iterations=1).astype(np.float32)), 1.6)
    riv2 = riv2f > 0.35

    ocean2 = g2 < 0.0
    filled2 = fill_depressions(g2, ocean2)
    depth_fill = filled2 - g2
    wet_heart = up_near(np.isin(npz["regions"], (6, 7, 8, 13)))
    allow2 = up_near(wetlands | (flood >= 1) | lakes) | riv2 | wet_heart
    # pools are kept or dropped WHOLE (no blocky cell-wise mask clipping)
    cand = (depth_fill > 0.02) & ~ocean2
    gy2s, gx2s = np.gradient(g2s, mpp2)
    slope2 = np.hypot(gy2s, gx2s)
    # Priority-flood and body connectivity are D8. Using D4 labels here
    # split diagonal parts of one basin into different wet-season/river
    # outlet heads, creating false pinned-pool conflicts at confluences.
    lbl2, n_l = ndimage.label(cand, structure=np.ones((3, 3)))
    pool_lvl = np.full(g2.shape, -np.inf, dtype=np.float32)
    standing_pool_count = 0
    standing_pool_range = 0.0
    if n_l:
        idx_l = np.arange(1, n_l + 1)
        max_depth = ndimage.maximum(depth_fill, lbl2, idx_l)
        areas2 = np.bincount(lbl2.ravel())[1:]
        allow_frac = ndimage.mean(allow2.astype(np.float32), lbl2, idx_l)
        hearty = ndimage.mean(wet_heart.astype(np.float32), lbl2, idx_l) > 0.4
        rivery = ndimage.mean(riv2.astype(np.float32), lbl2, idx_l) > 0.25
        # water only STANDS on gentle ground — except in carved channels,
        # where step-pool chains are exactly what mountain streams look like
        mean_slope = ndimage.mean(slope2, lbl2, idx_l)
        keep2 = np.zeros(n_l + 1, dtype=bool)
        keep2[1:] = (allow_frac > 0.25) & (rivery | (mean_slope < 0.07)) & np.where(
            hearty,
            (max_depth >= 0.10) & (areas2 >= 6 * (2 / web_step) ** 2),
            (max_depth >= MIN_POOL_DEPTH_M) & (areas2 >= MIN_POOL_PX * (2 / web_step) ** 2))
        # A flowing pool needs head over its sill. The old -5 cm offset
        # guaranteed a dry barrier at every river-pool outlet. Raise the
        # entire connected pool uniformly; closed ponds retain their level.
        river_touch = ndimage.maximum(riv2.astype(np.uint8), lbl2, idx_l) > 0
        pool_offset = np.full(n_l + 1, -0.05, np.float32)
        pool_offset[1:][river_touch] = 0.08
        pool_lvl = np.where(keep2[lbl2], filled2 + pool_offset[lbl2], -np.inf).astype(np.float32)
        comp(keep2[lbl2], pool_lvl)
        kept_ids = np.flatnonzero(keep2)
        standing_pool_count = len(kept_ids)
        if standing_pool_count:
            ranges = (ndimage.maximum(filled2, lbl2, kept_ids) -
                      ndimage.minimum(filled2, lbl2, kept_ids))
            standing_pool_range = float(np.max(ranges))

    # Channel profiles use the carved bed and connected pools as constraints.
    # Linear projection along each segment keeps every cross-section level.
    FILM_DEPTH = {1: 0.30, 2: 0.55, 3: 0.85}
    rflat = rivers.reshape(-1)
    idx_st = np.flatnonzero(rflat > 0)
    n_st = len(idx_st)
    # Match the terrain carver's coarse-cell centre exactly. n2/n1 drifts
    # across a province because these grids share endpoints, not cell edges.
    station_scale = (n2 - 1) / (z.shape[0] - 1)
    py = np.clip((idx_st // w_) * station_scale + (STEP // 2) / web_step, 0, n2 - 1)
    px = np.clip((idx_st % w_) * station_scale + (STEP // 2) / web_step, 0, n2 - 1)
    # The terrain carver conditions a local bed minimum, not necessarily
    # the coarse block's centre. Follow that thalweg laterally within the
    # same native block; never shift stations longitudinally to hide a dam.
    coarse_next = flow_to[idx_st]
    direction_y = coarse_next // w_ - idx_st // w_
    direction_x = coarse_next % w_ - idx_st % w_
    direction_length = np.maximum(np.hypot(direction_y, direction_x), 1)
    offsets = np.array([(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1),
                        (-1, -1), (-1, 1), (1, -1), (1, 1)]) / web_step
    candidate_y = np.clip(py[None, :] + offsets[:, 0, None], 0, n2 - 1)
    candidate_x = np.clip(px[None, :] + offsets[:, 1, None], 0, n2 - 1)
    # Repairs alter the bed, not which original carved corridor it belongs
    # to. Re-selecting thalwegs after each breach can chase a neighbouring
    # branch and needlessly spend the remaining excavation budget.
    routing_ground = g2 if bank_ground is None else bank_ground
    candidate_bed = ndimage.map_coordinates(routing_ground, [candidate_y, candidate_x], order=1, mode="nearest")
    longitudinal = (offsets[:, 0, None] * direction_y + offsets[:, 1, None] * direction_x) / direction_length
    candidate_bed[np.abs(longitudinal) > 0.75 / web_step] = np.inf
    nearest_bed = np.argmin(candidate_bed + np.linalg.norm(offsets, axis=1)[:, None] * 1e-6, axis=0)
    py = candidate_y[nearest_bed, np.arange(n_st)]
    px = candidate_x[nearest_bed, np.arange(n_st)]
    sy, sx = np.rint(py).astype(int), np.rint(px).astype(int)
    bed_st = ndimage.map_coordinates(g2, [py, px], order=1, mode="nearest")
    film_st = np.select([rflat[idx_st] == b for b in (1, 2, 3)],
                        [np.float32(FILM_DEPTH[b]) for b in (1, 2, 3)]).astype(np.float32)
    w_st = bed_st + film_st
    pool_at = pool_lvl[sy, sx]
    w_st = np.where(np.isfinite(pool_at) & (pool_at > bed_st + 0.01), pool_at, w_st).astype(np.float32)
    # Receiving sea/fresh basins retain their shared datum at river mouths.
    # A band-depth offset here would mound the river above the sea plane.
    w_st[bed_st < 0] = 0
    # downstream station row for each station (coarse flow graph)
    pos = np.full(z.size, -1, dtype=np.int64)
    pos[idx_st] = np.arange(n_st)
    ds_flat = flow_to[idx_st]
    dsk = np.where((ds_flat >= 0) & (pos[np.maximum(ds_flat, 0)] >= 0),
                   pos[np.maximum(ds_flat, 0)], -1)
    old_link = dsk >= 0
    stale_rise = bed_st[np.maximum(dsk, 0)] - bed_st
    topology_stats = {
        "channelStationCount": int(n_st),
        "staleUphillLinkCount": int(np.sum(old_link & (stale_rise > 0.2))),
        "maxStaleUphillM": round(float(np.max(stale_rise[old_link], initial=0)), 3),
        "standingPoolCount": int(standing_pool_count),
        "standingPoolMaxLevelRangeM": round(standing_pool_range, 6),
    }
    seg_dist = np.full(n_st, mpp1, dtype=np.float32)
    hasd = dsk >= 0
    seg_dist[hasd] = np.hypot(
        (ds_flat[hasd] // w_) - (idx_st[hasd] // w_),
        (ds_flat[hasd] % w_) - (idx_st[hasd] % w_)) * mpp1
    # Terrain refinement has changed some grades since the coarse drainage
    # solve. Keep the authored corridors and derive current from their real
    # level; backwatering against the obsolete graph can raise water 100 m.

    # Hydraulic widths are the same ones used by the terrain carver.
    a_st = np.maximum(npz["accum_km2"].reshape(-1)[idx_st], 0.02)
    w_geom = 14.0 * a_st ** 0.40
    d_geom = (1.8 * a_st ** 0.29).astype(np.float32)
    r_st = np.clip(w_geom * 0.5 / mpp2, 2.0 / web_step, 9.0 / web_step).astype(np.float32)
    geometry_points, geometry_ds, geometry_levels, geometry_radius, geometry_owners = refine_channel_stations(
        g2, np.column_stack([py, px]), dsk, w_st, r_st, pool_levels=pool_lvl,
        routing_ground=routing_ground)
    geometry_levels, geometry_active, accepted_links, conflicts = condition_channel_profiles(
        g2, geometry_points, geometry_ds, geometry_levels, geometry_radius, n_st, dsk, pool_lvl,
        bank_ground=bank_ground)
    if profiles_only:
        return {"points": geometry_points, "conflicts": conflicts, "cell_indices": idx_st,
                "links": geometry_ds, "levels": geometry_levels, "active": geometry_active}
    w_st = geometry_levels[:n_st].copy()
    current_downstream = downhill_graph(w_st, accepted_links)
    terrain_mismatches = []
    sea_components, _ = ndimage.label(g2 < 0, structure=np.ones((3, 3)))
    for source, conflict in sorted(conflicts.items()):
        cell = int(idx_st[source])
        point = geometry_points[conflict["node"]]
        record = {"id": f"water-mismatch.province.cell-{cell // w_}-{cell % w_}",
            "x": round(float(point[1] * mpp2), 4), "z": round(float(point[0] * mpp2), 4),
            "riverBand": int(rflat[idx_st[source]]), "status": "excluded",
            "reason": "monotone-channel-head-exceeds-bank-or-standing-pool",
            "excessHeadM": round(conflict["requiredLevelM"] - conflict["bankCapM"], 4),
            **{key: round(value, 4) for key, value in conflict.items()
               if key not in ("node", "obstructionNode", "pathNodes", "drainageNodes")}}
        target = dsk[source]
        if target >= 0:
            start_cell = tuple(np.rint(geometry_points[source]).astype(int))
            end_cell = tuple(np.rint(geometry_points[target]).astype(int))
            if sea_components[start_cell] and sea_components[start_cell] == sea_components[end_cell]:
                record.update(status="retired-coarse-link",
                    reason="same-sea-body-routes-around-dry-headland",
                    route={"kind": "existing-connected-sea", "start": {
                        "x": round(float(geometry_points[source, 1] * mpp2), 4),
                        "z": round(float(geometry_points[source, 0] * mpp2), 4)},
                        "end": {"x": round(float(geometry_points[target, 1] * mpp2), 4),
                                "z": round(float(geometry_points[target, 0] * mpp2), 4)}})
        terrain_mismatches.append(record)
    del sea_components
    topology_stats["terrainMismatchReachCount"] = len(terrain_mismatches)
    active_bed = ndimage.map_coordinates(g2, geometry_points[geometry_active].T, order=1, mode="nearest")
    topology_stats["nativeDepthUnderRiverMinimumM"] = round(
        float(np.min(geometry_levels[geometry_active] - active_bed)) if len(active_bed) else 0., 6)
    topology_stats["nativeAscendingSegmentCount"] = 0
    channel, ribbon, segment_owner = channel_surface(
        g2, geometry_points, geometry_ds, geometry_levels, geometry_radius, active=geometry_active)
    # A channel on a hillside must not pour an elevated sheet across the
    # outside slope. Its water remains within the carved cross-section.
    if n_st:
        ribbon &= g2 > channel - (film_st + d_geom + 1.2)[geometry_owners[np.maximum(segment_owner, 0)]]
    comp(ribbon, channel)
    standing_pool = np.isfinite(pool_lvl) & (pool_lvl > g2 + 0.01)
    w2[standing_pool] = pool_lvl[standing_pool]
    riv2 = riv2 | ribbon
    wet2 = np.isfinite(w2) & (w2 > g2 + 0.01)
    w2, support2, bodies2 = extend_surface(w2, g2, TABLE_MAX_PX * 2 / web_step)
    # Only banks above the nearest body can be potential flooding. Extending
    # a river's level over unrelated lower terrain would create hanging water.
    support2 &= wet2 | (g2 >= w2 - 0.01)
    bodies2[~support2] = 0
    fringe = support2 & ~wet2
    nod2 = ~support2
    depth2 = np.where(support2, np.clip(w2 - g2, 0.0, 25.5), 0).astype(np.float32)
    if n_st:
        station_depth = ndimage.map_coordinates(depth2, [py, px], order=1, mode="nearest")
        refined_depth = ndimage.map_coordinates(depth2, geometry_points.T, order=1, mode="nearest")
        topology_stats["channelStationsWetFraction"] = round(float(np.mean(station_depth > 0.05)), 6)
        topology_stats["nativeChannelSamplesWetFraction"] = round(float(np.mean(refined_depth > 0.05)), 6)
    shore2 = np.clip(ndimage.distance_transform_edt(wet2) * mpp2, 0.0, SHORE_MAX_M).astype(np.float32)
    ribbons, cascades = compile_features(
        g2, w2, support2, bodies2, geometry_points, geometry_ds, geometry_levels,
        geometry_radius, n_st, accepted_links, idx_st, w_, rflat[idx_st], mpp2)
    feature_inputs = {
        "points": geometry_points, "links": geometry_ds, "levels": geometry_levels,
        "radius": geometry_radius, "original_count": n_st, "original_links": accepted_links,
        "cell_indices": idx_st, "coarse_width": w_, "bands": rflat[idx_st],
    }
    topology_stats["supplementalRibbonCount"] = len(ribbons)
    topology_stats["cascadeCount"] = len(cascades)

    # Current follows the actual descending profile. Continuous speeds avoid
    # abrupt material-advection jumps at arbitrary speed-band thresholds.
    vx = np.zeros(z.shape, dtype=np.float32)
    vz = np.zeros(z.shape, dtype=np.float32)
    dsk = current_downstream
    ds_flat = np.where(dsk >= 0, idx_st[np.maximum(dsk, 0)], -1)
    drop_win = np.zeros(n_st, dtype=np.float32)
    dist_win = np.zeros(n_st, dtype=np.float32)
    frontier = np.arange(n_st)
    for _hop in range(6):
        nx = np.where(frontier >= 0, dsk[np.maximum(frontier, 0)], -1)
        step_ok = (frontier >= 0) & (nx >= 0)
        drop_win[step_ok] += (w_st[frontier[step_ok]] - w_st[nx[step_ok]])
        dist_win[step_ok] += seg_dist[frontier[step_ok]]
        frontier = np.where(step_ok, nx, -1)
    slope_win = np.maximum(drop_win, 0.0) / np.maximum(dist_win, mpp1)
    size = np.maximum(npz["accum_km2"].reshape(-1)[idx_st], 0.05) ** 0.1
    v_raw = np.clip((0.35 + 9.0 * np.sqrt(slope_win)) * size, 0.35, 3.0)
    v_st = v_raw.astype(np.float32)
    okd = ds_flat >= 0
    dyv = (ds_flat[okd] // w_) - (idx_st[okd] // w_)
    dxv = (ds_flat[okd] % w_) - (idx_st[okd] % w_)
    invv = 1.0 / np.hypot(dxv, dyv).clip(1e-6, None)
    vx.ravel()[idx_st[okd]] = dxv * invv * v_st[okd]
    vz.ravel()[idx_st[okd]] = dyv * invv * v_st[okd]
    # NORMALISED smoothing: plain gaussian diluted 1-px channels to ~30 % of
    # their speed (owner round 5: "everything flows the same slow speed") —
    # divide by the smoothed support so magnitude survives on thin lines
    support = np.zeros(z.shape, dtype=np.float32)
    support.ravel()[idx_st[okd]] = 1.0
    support_s = ndimage.gaussian_filter(support, 1.0)
    vx = ndimage.gaussian_filter(vx, 1.0) / np.maximum(support_s, 1e-6)
    vz = ndimage.gaussian_filter(vz, 1.0) / np.maximum(support_s, 1e-6)
    velocity_scale = np.minimum(1.0, (FLOW_MAX - 1e-6) / np.maximum(np.hypot(vx, vz), 1e-6))
    vx *= velocity_scale
    vz *= velocity_scale
    near_channel = ndimage.distance_transform_edt(~riv) <= 4
    vx[~near_channel] = 0
    vz[~near_channel] = 0

    # --- 6. classes, from the RENDERED wetness (owner round 2: patchy
    # marsh/ocean splits came from classifying the coarse grid). Wetland
    # water is marsh no matter how saline — a salt marsh is still a marsh.
    # A semantic cell owns a3x3 native block, not just its centre vertex.
    # Thin native pools/channels must never remain class0/marine fallback.
    wetr = wet | (down(ndimage.maximum_filter(wet2, size=STEP), 0) > 0.5)
    cls = np.zeros(z.shape, dtype=np.uint8)
    cls[wetr & sea & (salinity >= 0.3)] = CLASSES.index("coast")
    cls[wetr & sea & (salinity < 0.3) & (salinity >= 0.05)] = CLASSES.index("estuary")
    cls[wetr & sea & (salinity < 0.05)] = CLASSES.index("lake")  # Blackrose-style fresh basin
    cls[wetr & riv & ~sea] = CLASSES.index("river")
    cls[wetr & big_lakes & ~sea] = CLASSES.index("lake")
    cls[wetr & wetlands & ~riv] = CLASSES.index("marsh")
    cls[wetr & (cls == 0)] = CLASSES.index("marsh")
    # A water ribbon keeps its river material to both banks. Classifying
    # only coarse centreline cells made each river a river/marsh mosaic.
    rendered_river = down(ribbon, 0) > 0.5
    cls[wetr & rendered_river & ~sea & ~big_lakes] = CLASSES.index("river")

    # silt (whitewater murk) and tannin (blackwater tea) from the region the
    # water sits in, gently smoothed; estuaries/deltas carry extra sediment
    regions = np.clip(npz["regions"], 0, len(REGION_SILT) - 1)
    turb = REGION_SILT[regions].copy()
    tannin = REGION_TANNIN[regions].copy()
    turb[cls == CLASSES.index("estuary")] += 0.15
    tannin = np.clip(ndimage.gaussian_filter(tannin, 1.5), 0.0, 1.0)
    # whitewater guarantee (owner round 4: "couldn't find any tan rivers"):
    # medium+ fresh rivers carry mountain silt unless they are blackwater
    ww = ndimage.binary_dilation(rivers >= 2, iterations=2) & (tannin < 0.5)
    turb[ww] = np.maximum(turb[ww], 0.58)
    turb = np.clip(ndimage.gaussian_filter(turb, 1.5), 0.0, 1.0)

    season = ((salinity < 0.4) & (wetr | (flood >= 2))).astype(np.float32)

    # extend the per-pixel character a short way past the shoreline so the
    # GPU's linear samples (and wet-season flooding) read sensible values
    dist_px, (iy, ix) = ndimage.distance_transform_edt(~wetr, return_indices=True)
    ext = (~wetr) & (dist_px <= TABLE_MAX_PX) & ((hand < FLOODABLE_HAND_M) | tidal | wetlands)
    cls_ext = cls.copy()
    cls_ext[ext] = cls[iy[ext], ix[ext]]
    for arr in (turb, tannin, season, salinity):
        arr[ext] = arr[iy[ext], ix[ext]]

    season2 = up_lin(season)
    if standing_pool_count:
        pool_season = np.zeros(n_l + 1, np.float32)
        # Preserve the existing full wet/dry range wherever a standing
        # freshwater pool already receives it, uniformly across that pool.
        pool_season[kept_ids] = ndimage.maximum(season2, lbl2, kept_ids)
        season2[standing_pool] = pool_season[lbl2[standing_pool]]
    # A dry flood margin carries its own nearest water's level response,
    # not an interpolated fade toward zero that domes seasonal shorelines.
    if np.any(wet2):
        _, nearest_wet = ndimage.distance_transform_edt(~wet2, return_indices=True)
        season2[fringe] = season2[tuple(nearest_wet[:, fringe])]
        del nearest_wet

    # Purely semantic exposure: surrounding land shelters inland waters;
    # ocean fetch supplies large waves. Runtime weather scales these values.
    ocean_distance = ndimage.distance_transform_edt(sea) * mpp1
    exposure = np.where(sea, np.clip(ocean_distance / 400.0, 0.12, 1.0), 0.08)
    exposure[cls == CLASSES.index("lake")] = 0.25
    exposure[np.isin(regions, (6, 7, 8, 13)) & ~sea] = 0.03

    return {
        "w1": w_filled, "wet": wet, "wetr": wetr, "ext": ext, "cls": cls_ext,
        "turb": turb, "tannin": tannin, "season": season, "salinity": salinity, "vx": vx,
        "vz": vz, "shore_d": shore_d, "w2": w2, "depth2": depth2,
        "ground2": g2, "nodata2": nod2, "shore2": shore2, "fringe": fringe,
        "riv2": riv2,
        "support2": support2, "bodies2": bodies2,
        "river_band": rivers, "regions": regions, "exposure": exposure,
        "season2": season2,
        "station_levels": w_st, "station_downstream": dsk,
        "topology_stats": topology_stats,
        "ribbons": ribbons, "cascades": cascades,
        "feature_inputs": feature_inputs,
        "body_records": body_records(bodies2),
        "terrain_mismatches": terrain_mismatches,
    }


def reduce_surface_resolution(native: dict, factor: int) -> dict:
    """Lower texture cost without changing the physical channel solution.

The same native points/levels produce both quality exports. Explicit ribbons
cover any extra gaps introduced by the reduced raster, using native banks.
"""
    if factor == 1:
        return native
    result = native.copy()
    for key in ("w2", "ground2", "depth2", "shore2", "fringe", "riv2", "support2", "bodies2", "nodata2", "season2"):
        if key not in native:
            continue
        result[key] = native[key][::factor, ::factor]
    geometry = native["feature_inputs"].copy()
    geometry["points"] = geometry["points"] / factor
    geometry["radius"] = geometry["radius"] / factor
    ribbons, cascades = compile_features(
        result["ground2"], result["w2"], result["support2"], result["bodies2"],
        **geometry, metres_per_pixel=RAW_M * factor,
        ground_detail=native["ground2"], detail_scale=factor, body_detail=native["bodies2"])
    result["ribbons"], result["cascades"] = ribbons, cascades
    result["topology_stats"] = {**native["topology_stats"],
        "supplementalRibbonCount": len(ribbons), "cascadeCount": len(cascades),
        "geometrySourceMetresPerPixel": RAW_M}
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    parser.add_argument("--web-step", type=int, choices=(1, 2), default=WEB_STEP,
                        help="1: native 4033 surface; 2: lower-memory 2017 surface")
    parser.add_argument("--cache", type=Path,
                        help="Optional NPZ cache path; no vault files are overwritten by default")
    parser.add_argument("--bed-overlay", type=Path,
                        help="Reuse a validated native correction overlay for another quality tier")
    parser.add_argument("--continue-repairs", action="store_true",
                        help="Continue bounded repairs from the supplied overlay")
    parser.add_argument("--max-bed-lowering", type=float, default=1.0,
                        help="Maximum cumulative lowering in metres, limited to native channel centres")
    parser.add_argument("--bed-exception-cell", action="append", default=[],
                        help="Explicit coarse row,col channel-sill exception permitting at most 5m lowering")
    args = parser.parse_args()
    if not 0 <= args.max_bed_lowering <= 3:
        parser.error("--max-bed-lowering must be between 0 and 3 metres")
    vault = DEFAULT_HEIGHTS.parent.parent
    npz = np.load(vault / "hydrology-pass1.npz")
    refined = np.load(DEFAULT_HEIGHTS)
    z = npz["conditioned"].astype(np.float32)
    original = refined.copy()
    exception_cells = [tuple(map(int, cell.split(","))) for cell in args.bed_exception_cell]
    allowed_exceptions = {(124, 348), (125, 349), (126, 350), (128, 1092)}
    if any(cell not in allowed_exceptions for cell in exception_cells):
        parser.error("Only the four audited existing-channel sill cells permit the5m exception")
    if args.bed_overlay:
        overlay_input = json.loads(args.bed_overlay.read_text())
        if (overlay_input.get("schemaVersion") != 1 or overlay_input.get("gridSize") != refined.shape[0]
                or abs(overlay_input.get("metresPerPixel", 0) - RAW_M) > 1e-8):
            raise ValueError("Incompatible water bed overlay grid")
        declared_cap = overlay_input.get("maxLoweringM", 1)
        if not isinstance(declared_cap, (int, float)) or not 0 <= declared_cap <= 5:
            raise ValueError("Invalid declared water bed repair limit")
        last = -1
        for index, height, previous in overlay_input["changes"]:
            if (not isinstance(index, int) or index <= last or index >= refined.size
                    or not np.isfinite(height) or not np.isfinite(previous)
                    or height > previous + 1e-5
                    or previous - height > min(5 if exception_cells and index in overlay_input.get("exceptionIndices", [])
                                               else args.max_bed_lowering, declared_cap) + 1e-5
                    or abs(float(original.flat[index]) - previous) > 1e-5):
                raise ValueError("Water bed overlay does not match immutable source terrain")
            refined.flat[index] = height
            last = index
    iteration = 0
    while not args.bed_overlay or args.continue_repairs:
        iteration += 1
        profiles = compute(z, refined, npz, profiles_only=True, bank_ground=original)
        exceptional_sources = {source for source, cell in enumerate(profiles["cell_indices"])
                               if (int(cell // z.shape[1]), int(cell % z.shape[1])) in exception_cells}
        changes = repair_channel_beds(original, refined, profiles["points"], profiles["conflicts"],
                                      max_lowering=args.max_bed_lowering, exceptional_sources=exceptional_sources)
        changes += repair_channel_films(original, refined, profiles["points"], profiles["links"],
                                        profiles["levels"], profiles["active"], args.max_bed_lowering)
        print(f"Bounded channel repair {iteration}: {changes} native samples; "
              f'{len(profiles["conflicts"])} constrained reaches', flush=True)
        if args.cache:
            progress_indices = np.flatnonzero(refined.ravel() < original.ravel() - 1e-6)
            progress = {"schemaVersion": 1, "gridSize": int(refined.shape[0]), "metresPerPixel": RAW_M,
                        "maxLoweringM": 5 if exception_cells else args.max_bed_lowering,
                        "routineMaxLoweringM": args.max_bed_lowering, "exceptionCells": exception_cells,
                        "exceptionIndices": np.flatnonzero((original - refined).ravel() > args.max_bed_lowering + 1e-5).tolist(),
                        "changes": [[int(index), round(float(refined.flat[index]), 6),
                                     round(float(original.flat[index]), 6)] for index in progress_indices]}
            args.cache.with_suffix(".bed-progress.json").write_text(json.dumps(progress, separators=(",", ":")))
        if not changes:
            break
    r = reduce_surface_resolution(compute(z, refined, npz, bank_ground=original), args.web_step)

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    changed = np.flatnonzero(refined.ravel() < original.ravel() - 1e-6)
    overlay = {"schemaVersion": 1, "gridSize": int(refined.shape[0]), "metresPerPixel": RAW_M,
               "maxLoweringM": 5 if exception_cells else args.max_bed_lowering,
               "routineMaxLoweringM": args.max_bed_lowering, "exceptionCells": exception_cells,
               "exceptionIndices": np.flatnonzero((original - refined).ravel() > args.max_bed_lowering + 1e-5).tolist(),
               "changes": [[int(index), round(float(refined.flat[index]), 6),
                            round(float(original.flat[index]), 6)] for index in changed]}
    (out_dir / "water-bed-overlay.json").write_text(json.dumps(overlay, separators=(",", ":")))
    r["topology_stats"]["repairedNativeBedSampleCount"] = len(changed)
    r["topology_stats"]["maximumBedLoweringM"] = round(float(np.max(original - refined)), 6)
    if args.cache:
        np.savez_compressed(
            args.cache,
            w1=r["w1"], wet=r["wet"], ext=r["ext"], cls=r["cls"], turb=r["turb"],
            season=r["season"], tannin=r["tannin"], vx=r["vx"], vz=r["vz"], shore_d=r["shore_d"],
            w2=r["w2"].astype(np.float32), depth2=r["depth2"].astype(np.float32),
            shore2=r["shore2"].astype(np.float32), fringe=r["fringe"], riv2=r["riv2"],
            support2=r["support2"], bodies2=r["bodies2"],
        )

    w2 = r["w2"]
    min_w, max_w = float(w2.min()), float(w2.max())
    surf = np.asarray(encode_rg16(w2, min_w, max_w))
    signed_depth = np.where(r["support2"],
        np.clip(w2 - r["ground2"], DEPTH_MIN_M, DEPTH_MAX_M), DEPTH_MIN_M)
    surf = np.dstack([surf[..., 0], surf[..., 1],
                      np.round((signed_depth - DEPTH_MIN_M) / 0.1).astype(np.uint8)])
    Image.fromarray(surf, mode="RGB").save(out_dir / "water-surface.png")
    bodies = r["bodies2"]
    Image.fromarray(np.dstack([r["support2"].astype(np.uint8) * 255,
        (bodies >> 8).astype(np.uint8), (bodies & 255).astype(np.uint8)]),
        mode="RGB").save(out_dir / "water-support.png")

    # NO data ever rides a PNG alpha channel: browser canvas decoding
    # premultiplies alpha, destroying the RGB wherever alpha is low — this
    # exactly killed tide response (salty cells have season=0) and river flow
    # vectors near banks in rounds 0-2. Everything ships as RGB.
    enc = lambda a: np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    shore8 = np.clip(np.round(r["shore2"] / SHORE_MAX_M * 255.0), 0, 255).astype(np.uint8)
    n2 = r["shore2"].shape[0]
    up2 = lambda a: ndimage.affine_transform(a, np.eye(2) * (args.web_step / STEP),
        offset=-(STEP // 2) / STEP, output_shape=(n2, n2), order=1, mode="nearest")
    Image.fromarray(
        np.dstack([shore8, enc(r["season2"]), enc(up2(r["tannin"]))]), mode="RGB",
    ).save(out_dir / "water-shore.png")

    flow = np.dstack([
        enc(r["vx"] / FLOW_MAX * 0.5 + 0.5),
        enc(r["vz"] / FLOW_MAX * 0.5 + 0.5),
        enc(np.hypot(r["vx"], r["vz"]) / FLOW_MAX),
    ])
    Image.fromarray(flow, mode="RGB").save(out_dir / "water-flow.png")

    klass = np.dstack([r["cls"], enc(r["turb"]), enc(r["salinity"])])
    Image.fromarray(klass, mode="RGB").save(out_dir / "water-class.png")
    Image.fromarray(np.dstack([r["river_band"], r["regions"], enc(r["exposure"])]).astype(np.uint8),
                   mode="RGB").save(out_dir / "water-character.png")

    wet, ext, cls = r["wet"], r["ext"], r["cls"]
    stats = {
        **r["topology_stats"],
        "wetFrac": round(float(wet.mean()), 4),
        "tableExtFrac": round(float(ext.mean()), 4),
        "classFrac": {name: round(float((cls == i).mean()), 5)
                      for i, name in enumerate(CLASSES) if i},
        "visibleWaterFrac": round(float((r["depth2"] > 0.05).mean()), 4),
        "maxDepthM": round(float(r["depth2"].max()), 2),
        # rivers are carved CARVE_DEPTH below the ambient bank (refine_province
        # CHANNELS); the water surface must sit above that bed line
        "riverCellsAboveBed": round(float(np.mean(np.concatenate([
            ((r["w1"] > z - d + 0.05)[npz["rivers"] == b]).ravel()
            for b, d in CARVE_DEPTH.items() if (npz["rivers"] == b).any()
        ]))), 4),
    }
    stats["ribbonMinimumDepthM"] = round(min(
        (point["y"] - point["groundM"] for ribbon in r["ribbons"] for point in ribbon["points"]),
        default=0.), 6)
    meta = {
        "schemaVersion": 2,
        "surface": {
            "file": "water-surface.png", "size": int(w2.shape[0]),
            "metresPerPixel": RAW_M * args.web_step,
            "gridOriginM": 0,
            "minM": min_w, "maxM": max_w,
            "encoding": "R,G = 16-bit W; B = signed bed gap in 0.1 m steps, offset depthMinM",
            "depthMinM": DEPTH_MIN_M, "depthMaxM": DEPTH_MAX_M,
            "buryM": BURY_M,
            "shoreFile": "water-shore.png",
            "shoreMaxM": SHORE_MAX_M,
            "supportFile": "water-support.png",
            "bedOverlayFile": "water-bed-overlay.json",
            "supportEncoding": "R = supported water domain; G,B = 16-bit connected body index (nearest sampling)",
        },
        "flow": {"file": "water-flow.png", "size": int(z.shape[0]),
                 "metresPerPixel": RAW_M * STEP, "flowMax": FLOW_MAX,
                 "gridOriginM": RAW_M,
                 "shoreMaxM": SHORE_MAX_M},
        "klass": {"file": "water-class.png", "size": int(z.shape[0]),
                  "metresPerPixel": RAW_M * STEP, "classes": CLASSES,
                  "gridOriginM": RAW_M,
                  "characterFile": "water-character.png",
                  "characterEncoding": "R = river band 0..3; G = ecological region 0..13; B = wave exposure 0..255"},
        "stats": stats,
        "ribbons": r["ribbons"], "cascades": r["cascades"],
        "terrainMismatches": r["terrain_mismatches"],
    }
    # Raster indices are compact; public identities use a geographic seed so
    # unrelated earlier components do not renumber them in future compiles.
    meta["bodies"] = r["body_records"]
    (out_dir / "water-meta.json").write_text(json.dumps(meta, indent=1))
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
