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
                            downhill_graph, extend_surface, refine_channel_stations, contain_pool_freeboards,
                            channel_depth_targets, connected_marine_terrain, sample_marine_mask)
from .water_features import compile_features
from .water_geometry import repair_channel_beds, repair_channel_films
from .water_regimes import authored_rivulet_mask, channel_depth_expectations
from .terrain_triangles import (sample_terrain, fill_terrain_depressions, label_terrain_components,
                               derive_channel_diagonal_flips)
from .water_boundaries import spill_connected_access, hydraulic_plane_owners

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
            bank_ground=None, terrain_flips=None, orientation_levels=None, routing_overrides=None,
            immutable_potential=None, close_reference_domains=False, reference_pool_levels=None,
            retaining_lower_bounds=None, stage=None, station_overrides=None, pool_response_reference=None,
            seasonal_profile=None, capture_profile=False, authored_pool_hollows=None,
            retained_pool_reference=None) -> dict:
    """Water fields on the hydrology grid and native terrain surface grid."""
    from .water_stage import stage_range
    stage = stage_range(stage)
    if pool_response_reference is not None:
        low = pool_response_reference.get('lowAmplitudes')
        if low != {'seasonM': stage['drySeasonAmplitudeM'], 'tideM': stage['lowTideAmplitudeM']}:
            raise ValueError('Pool response reference requires its reviewed low-water amplitudes')
    maximum_offset = stage["tidalAmplitudeM"] + stage["seasonalAmplitudeM"]
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
    rivulets = authored_rivulet_mask(rivers,npz['accum_km2'],wetlands,npz['regions'])
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
    ocean2 = connected_marine_terrain(g2, up_near(ocean), terrain_flips)
    comp(ocean2, np.float32(0.0))

    # Priority-flood uses the actual ground, without blurring away banks.
    # It supplies standing pools only; river surfaces are segment profiles.
    riv2f = ndimage.gaussian_filter(
        up_lin(ndimage.binary_dilation(riv, iterations=1).astype(np.float32)), 1.6)
    riv2 = riv2f > 0.35

    filled2 = fill_terrain_depressions(g2, ocean2, terrain_flips)
    depth_fill = filled2 - g2
    wet_heart = up_near(np.isin(npz["regions"], (6, 7, 8, 13)))
    allow2 = up_near(wetlands | (flood >= 1) | lakes) | riv2 | wet_heart
    # pools are kept or dropped WHOLE (no blocky cell-wise mask clipping)
    cand = (depth_fill > 0.02) & ~ocean2
    gy2s, gx2s = np.gradient(g2s, mpp2)
    slope2 = np.hypot(gy2s, gx2s)
    # Match actual terrain/Rapier triangle edges. Neither D4 (which splits
    # real diagonal outlets) nor D8 (which invents a second diagonal) is the
    # physical adjacency of the native anti-diagonal terrain mesh.
    lbl2, n_l = label_terrain_components(cand, terrain_flips)
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
        if authored_pool_hollows is not None:
            from .water_authored_pools import retain_authored_pool_basins
            keep2 = retain_authored_pool_basins(keep2, lbl2, authored_pool_hollows,
                                                max_depth, areas2, web_step)
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

    # Set retained source heads BEFORE growing their shoreline domains.
    # Growing a temporary80mm head first can claim a neighbour's fringe,
    # creating an artificial merged owner even though original pools agree.
    immutable_pool_labels=frozenset()
    reference_pool_changes=[]
    if reference_pool_levels is not None:
        from .water_pool_domains import preserve_reference_pool_heads
        pool_lvl,immutable_pool_labels,reference_pool_changes=preserve_reference_pool_heads(
            pool_lvl,lbl2,filled2,reference_pool_levels,immutable_potential,g2)
        w2[np.isfinite(pool_lvl)]=pool_lvl[np.isfinite(pool_lvl)]
    if retained_pool_reference is not None:
        # Adding authored ponds must also retain accepted repaired ponds,
        # whose spill potential can differ from the original terrain's.
        from .water_pool_domains import preserve_reference_pool_heads
        pool_lvl, retained_labels, retained_changes = preserve_reference_pool_heads(
            pool_lvl, lbl2, filled2, retained_pool_reference['levels'],
            retained_pool_reference['potential'], g2)
        immutable_pool_labels |= retained_labels
        reference_pool_changes.extend(retained_changes)
        w2[np.isfinite(pool_lvl)] = pool_lvl[np.isfinite(pool_lvl)]
    pool_fringe_count = 0
    if close_reference_domains:
        immutable_potential = filled2
    if immutable_potential is not None:
        from .water_pool_domains import close_pool_domains
        pool_lvl, lbl2, pool_fringe_count = close_pool_domains(
            g2, pool_lvl, lbl2, filled2, immutable_potential, terrain_flips,
            maximum_head=(g2 if bank_ground is None else bank_ground) +
                up_lin(np.where(rivulets,.08,np.select([rivers == b for b in (1,2,3)], [.30,.55,.85], default=.30))))
        comp(np.isfinite(pool_lvl), pool_lvl)

    # Fractional ownership obeys the same retained spill as native domains.
    pool_spill_values = np.r_[np.inf, ndimage.minimum(filled2,lbl2,np.arange(1,int(lbl2.max())+1))]
    pool_spills = pool_spill_values[lbl2].astype(np.float32)
    pool_potential = filled2 if immutable_potential is None else np.minimum(filled2,immutable_potential)
    pool_domain = (pool_spills,pool_potential)
    if reference_pool_levels is not None and retaining_lower_bounds is None:
        from .water_spill_preservation import immutable_retaining_lower_bounds
        retaining_lower_bounds=immutable_retaining_lower_bounds(
            g2 if bank_ground is None else bank_ground,reference_pool_levels,immutable_potential,terrain_flips)

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
    original_centres = np.column_stack([py, px])
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
    candidate_bed = sample_terrain(routing_ground, [candidate_y, candidate_x], terrain_flips)
    longitudinal = (offsets[:, 0, None] * direction_y + offsets[:, 1, None] * direction_x) / direction_length
    candidate_bed[np.abs(longitudinal) > 0.75 / web_step] = np.inf
    nearest_bed = np.argmin(candidate_bed + np.linalg.norm(offsets, axis=1)[:, None] * 1e-6, axis=0)
    py = candidate_y[nearest_bed, np.arange(n_st)]
    px = candidate_x[nearest_bed, np.arange(n_st)]
    if station_overrides:
        if web_step != 1:
            raise ValueError('Reviewed station anchors require a native compile before raster reduction')
        from .water_station_anchors import apply_station_overrides
        # Only explicitly reviewed channel relocations use the wider
        # existing thalweg. Pool anchors retain their separate immutable-wet
        # evidence and two-interval limit. Coarse IDs and longitudinal station
        # positions remain tied to the authored drainage.
        channel_context = {}
        requested_minor = any(record.get('kind') == 'channel-thalweg' and rivulets.ravel()[cell]
                              for cell, record in station_overrides.items())
        if requested_minor:
            from .water_regimes import native_rivulet_core
            core = native_rivulet_core(rivulets, g2.shape, STEP, web_step)
            interior = ndimage.distance_transform_edt(core)
            # Exact Gaussian authoring cutoff, including naturally low ground
            # where the carver's min() did not need to lower the terrain.
            rivulet_footprint = ndimage.distance_transform_edt(~core) * mpp2 < 2.4 * np.sqrt(np.log(.7 / .05))
        for index, cell in enumerate(idx_st):
            if station_overrides.get(int(cell), {}).get('kind') != 'channel-thalweg':
                continue
            area = max(float(npz['accum_km2'].ravel()[cell]), .02)
            channel_context[int(cell)] = dict(centre=original_centres[index],
                direction=[direction_y[index], direction_x[index]],
                radius=float(np.clip(14. * area ** .40 * .5 / mpp2, 2., 9.)),
                depth=FILM_DEPTH[int(rflat[cell])])
            if rivulets.ravel()[cell]:
                old_y, old_x = np.rint([py[index], px[index]]).astype(int)
                channel_context[int(cell)].update(
                    radius=float(np.clip(interior[old_y, old_x] + 2.4 / mpp2, 2., 9.)),
                    depth=.08, rivulet=True, footprint=rivulet_footprint)
        anchors = apply_station_overrides(np.column_stack([py, px]), idx_st, station_overrides,
            routing_ground, reference_pool_levels, terrain_flips, channel_context=channel_context)
        py, px = anchors.T
    sy, sx = np.rint(py).astype(int), np.rint(px).astype(int)
    bed_st = sample_terrain(g2, [py, px], terrain_flips)
    rivulet_st = rivulets.ravel()[idx_st]
    # The fluvial carver calls these splash-through swamp plumbing, not
    # full-depth band1 streams. Preserve their shallow connected-water
    # regime; seasonal responses still use the original authored fields.
    film_st = channel_depth_expectations(rflat[idx_st],rivulet_st)
    w_st = bed_st + film_st
    pool_at = pool_lvl[sy, sx]
    w_st = np.where(np.isfinite(pool_at) & (pool_at > bed_st + 0.01), pool_at, w_st).astype(np.float32)
    # Receiving sea/fresh basins retain their shared datum at river mouths.
    # A band-depth offset here would mound the river above the sea plane.
    w_st[sample_marine_mask(g2, ocean2, np.column_stack([py, px]), terrain_flips)] = 0
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
        "reviewedStationAnchorCount": len(station_overrides or {}),
        "marineNativeSampleCount": int(ocean2.sum()),
        "isolatedBelowSeaNativeSampleCount": int(np.count_nonzero((g2 < 0) & ~ocean2)),
        "staleUphillLinkCount": int(np.sum(old_link & (stale_rise > 0.2))),
        "maxStaleUphillM": round(float(np.max(stale_rise[old_link], initial=0)), 3),
        "standingPoolCount": int(standing_pool_count),
        "standingPoolMaxLevelRangeM": round(standing_pool_range, 6),
        "connectedPoolFringeNativeSampleCount": pool_fringe_count,
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
    if np.any(rivulet_st):
        # Match the actual Gaussian-smoothed wetland web from _rivulets.
        # A narrow area-derived radius can stop inside its broad flat floor
        # and mistake that submerged floor for the far retaining bank.
        # refine_province repeats these categorical predicate inputs; linear
        # area interpolation can move values across the(.02,.12] regime
        # bounds, erase a genuinely carved core, and mistake its interior
        # shoulder for a retaining bank.
        from .water_regimes import native_rivulet_core
        soft = native_rivulet_core(rivulets,g2.shape,STEP,web_step)
        interior = ndimage.distance_transform_edt(soft)
        footprint_radius = interior[sy,sx] + 2.4/mpp2
        r_st[rivulet_st] = np.clip(footprint_radius[rivulet_st], 2./web_step, 9./web_step)
        topology_stats['shallowWetlandRivuletStationCount'] = int(rivulet_st.sum())
    geometry_points, geometry_ds, geometry_levels, geometry_radius, geometry_owners = refine_channel_stations(
        g2, np.column_stack([py, px]), dsk, w_st, r_st, pool_levels=pool_lvl,
        routing_ground=routing_ground, minimum_depth=film_st, terrain_flips=terrain_flips, marine_ground=ocean2,
        pool_domain=pool_domain,
        routing_overrides=({source: routing_overrides[int(cell)] for source, cell in enumerate(idx_st)
                            if int(cell) in routing_overrides} if routing_overrides else None))
    desired_geometry_levels = geometry_levels.copy()
    geometry_depths = channel_depth_targets(geometry_points, geometry_ds, dsk, film_st)
    profile_diagnostics = {} if profiles_only or capture_profile else None
    geometry_levels, geometry_active, accepted_links, conflicts = condition_channel_profiles(
        g2, geometry_points, geometry_ds, geometry_levels, geometry_radius, n_st, dsk, pool_lvl,
        bank_ground=g2, terrain_flips=terrain_flips, orientation_levels=orientation_levels,
        diagnostics=profile_diagnostics, minimum_depth=geometry_depths, strict_banks=True,
        metres_per_pixel=mpp2, allow_freefall=True, marine_ground=ocean2, pool_domain=pool_domain)
    pool_head_changes = []
    while conflicts:
        changes = contain_pool_freeboards(pool_lvl, lbl2, filled2, geometry_points, conflicts,
                                          immutable_labels=immutable_pool_labels)
        if not changes:
            break
        pool_head_changes.extend(changes)
        geometry_levels, geometry_active, accepted_links, conflicts = condition_channel_profiles(
            g2, geometry_points, geometry_ds, desired_geometry_levels, geometry_radius, n_st, dsk, pool_lvl,
            bank_ground=g2, terrain_flips=terrain_flips, orientation_levels=orientation_levels,
            diagnostics=profile_diagnostics, minimum_depth=geometry_depths, strict_banks=True,
            metres_per_pixel=mpp2, allow_freefall=True, marine_ground=ocean2, pool_domain=pool_domain)
    if pool_head_changes:
        # Replace the entire original plane, not just the constrained node.
        w2[keep2[lbl2]] = pool_lvl[keep2[lbl2]]
    topology_stats['bankContainedFlowPoolCount'] = len({change['poolLabel'] for change in pool_head_changes})
    topology_stats['preservedOriginalPoolPlaneCount'] = len(immutable_pool_labels)
    topology_stats['preventedRepairDrivenPoolHeadChanges'] = reference_pool_changes
    maximum_pool_reduction = {}
    for change in pool_head_changes:
        label = change['poolLabel']
        maximum_pool_reduction[label] = maximum_pool_reduction.get(label, 0.) + change['fromM'] - change['toM']
    topology_stats['maximumFlowPoolFreeboardReductionM'] = round(max(maximum_pool_reduction.values(), default=0.), 6)
    seasonal_sources = frozenset()
    seasonal_recovered = frozenset()
    seasonal_supporters = frozenset()
    if seasonal_profile is not None:
        from .water_channel_response import validate_seasonal_profile
        baseline_conflicts = frozenset(conflicts)
        seasonal_candidates, peak_budget = validate_seasonal_profile(
            seasonal_profile, geometry_points, geometry_ds, dsk, baseline_conflicts, rivulet_st)
        # Later raster work rebinds dsk to the accepted, oriented flow graph.
        # A profile reconciliation must keep the original authored topology.
        def solve_seasonal_profile(budget, diagnostics, original_links=dsk):
            return condition_channel_profiles(
                g2, geometry_points, geometry_ds, desired_geometry_levels, geometry_radius, n_st, original_links, pool_lvl,
                bank_ground=g2, terrain_flips=terrain_flips, orientation_levels=orientation_levels,
                diagnostics=diagnostics, minimum_depth=geometry_depths, strict_banks=True,
                metres_per_pixel=mpp2, allow_freefall=True, marine_ground=ocean2, pool_domain=pool_domain,
                peak_depth_budget=budget)
        geometry_levels, geometry_active, accepted_links, conflicts = solve_seasonal_profile(
            peak_budget, profile_diagnostics)
        if not set(conflicts).issubset(baseline_conflicts):
            raise ValueError('Seasonal profile introduces new channel failures')
        seasonal_recovered = baseline_conflicts - set(conflicts)
        if not seasonal_recovered.issubset(seasonal_candidates):
            raise ValueError('Seasonal profile unexpectedly changes another rejected reach')
        seasonal_supporters = frozenset(map(int, seasonal_profile.get('supporting_sources', ())))
        seasonal_sources = seasonal_recovered | seasonal_supporters
        topology_stats['seasonalRecoveredReachCount'] = len(seasonal_recovered)
        topology_stats['seasonalSupportingReachCount'] = len(seasonal_supporters)
    profile_state = None
    if profiles_only or capture_profile:
        profile_state = {"points": geometry_points, "conflicts": conflicts, "cell_indices": idx_st,
                "links": geometry_ds, "levels": geometry_levels, "active": geometry_active,
                "desired_levels": desired_geometry_levels, "original_links": dsk,
                "accepted_links": accepted_links, "failed_sources": np.array(sorted(conflicts), dtype=int),
                "radius": geometry_radius, "diagnostics": profile_diagnostics,
                "pool_levels": pool_lvl, "marine_ground": ocean2, "filled_levels": filled2,
                "pool_spills": pool_spills, "pool_potential": pool_potential,
                "retaining_lower_bounds": retaining_lower_bounds,
                "semantic_depth_targets": geometry_depths,
                "seasonal_sources": np.array(sorted(seasonal_sources), dtype=int),
                "seasonal_recovered_sources": np.array(sorted(seasonal_recovered), dtype=int),
                "seasonal_supporting_sources": np.array(sorted(seasonal_supporters), dtype=int),
                "seasonal_response_verified": False}
        if profiles_only:
            return profile_state
    w_st = geometry_levels[:n_st].copy()
    current_downstream = downhill_graph(w_st, accepted_links, orientation_levels)
    if orientation_levels is not None:
        sources = np.flatnonzero(dsk >= 0)
        targets = dsk[sources]
        topology_stats['preventedRepairDrivenFlowReversals'] = int(np.count_nonzero(
            (desired_geometry_levels[sources] < desired_geometry_levels[targets]) !=
            (orientation_levels[sources] < orientation_levels[targets])))
        topology_stats['postRepairFlowOrientationChanges'] = 0
    terrain_mismatches = []
    sea_components, _ = label_terrain_components(ocean2, terrain_flips)
    for source, conflict in sorted(conflicts.items()):
        cell = int(idx_st[source])
        point = geometry_points[conflict["node"]]
        record = {"id": f"water-mismatch.province.cell-{cell // w_}-{cell % w_}",
            "x": round(float(point[1] * mpp2), 4), "z": round(float(point[0] * mpp2), 4),
            "riverBand": int(rflat[idx_st[source]]), "status": "excluded",
            "reason": "monotone-channel-head-exceeds-bank-or-standing-pool",
            "excessHeadM": round(conflict["requiredLevelM"] - conflict["bankCapM"], 4),
            **{key: (value if isinstance(value, bool) else round(value, 4))
               for key, value in conflict.items()
               if key not in ("node", "obstructionNode", "pathNodes", "drainageNodes", "nodeBankCaps")}}
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
    active_bed = sample_terrain(g2, geometry_points[geometry_active].T, terrain_flips)
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
    # Channel endpoints retain their original all-water response domain.
    # Standing raster margins have a separate owner because native ribbons
    # render the flowing banks. Changing that owner must not retune channels.
    channel_response_sources = np.array([sy, sx])
    if np.any(wet2) and np.any(~wet2[sy, sx]):
        channel_nearest = ndimage.distance_transform_edt(
            ~wet2, return_distances=False, return_indices=True)
        channel_response_sources = channel_nearest[:, sy, sx].copy()
        del channel_nearest
    w2, support2, bodies2, nearest_wet = extend_surface(
        w2, g2, TABLE_MAX_PX * 2 / web_step, preserve_owner_domain=True, return_nearest=True,
        terrain_flips=terrain_flips, margin_sources=standing_pool | ocean2)
    bodies2, owner_records = hydraulic_plane_owners(bodies2, wet2, lbl2, standing_pool, nearest_wet)
    flat_owner = (standing_pool | ocean2)[tuple(nearest_wet)]
    # Native cross-sections now own ALL flowing reaches. Only a standing
    # pool/sea head can inundate raster margins: extrapolating a high river
    # profile onto a lower outer slope is not a valid standing water table.
    access2, support2 = spill_connected_access(g2, w2, wet2, bodies2, can_flood=flat_owner, terrain_flips=terrain_flips, maximum_offset=maximum_offset)
    support_kind2 = np.where(support2, np.where(flat_owner, 255, 128), 0).astype(np.uint8)
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
    # Classification follows actual native sea connectivity as geometry
    # does. The obsolete coarse negative-height proxy must not turn an
    # isolated below-datum inland body into a marine material/exposure.
    sea = down(ocean2, 0) > .5
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
    tidal2 = np.clip((up_lin(salinity) - .02) / (.15 - .02), 0, 1)
    tidal2 = tidal2 * tidal2 * (3 - 2 * tidal2)
    from .water_pool_domains import standing_pool_response, connected_standing_pool_labels
    # Retain each seed component's complete climate response domain, then
    # unify components that are physically one connected standing plane.
    # Reducing only currently wet vertices would shrink existing ranges.
    season2 = standing_pool_response(season2, lbl2, standing_pool)
    tidal2 = standing_pool_response(tidal2, lbl2, standing_pool)
    response_owners = connected_standing_pool_labels(w2, standing_pool, terrain_flips)
    season2 = standing_pool_response(season2, response_owners, standing_pool)
    tidal2 = standing_pool_response(tidal2, response_owners, standing_pool)
    if pool_response_reference is not None:
        from .water_pool_domains import preserve_pool_response_ranges
        season2, tidal2 = preserve_pool_response_ranges(
            season2, tidal2, response_owners, w2, pool_response_reference)
    del response_owners
    channel_season = season2[tuple(channel_response_sources)].copy()
    channel_tide = tidal2[tuple(channel_response_sources)].copy()
    from .water_geometry import sample_standing_levels
    # Only actual standing-water donors have a unified, reviewed response.
    # A shallower discarded seed may carry a raw climate interpolation even
    # when its nominal plane matches the neighbouring physical pool.
    standing_detail = np.where(standing_pool, pool_lvl, -np.inf)
    contact_levels, contact_owners = sample_standing_levels(
        g2, standing_detail, geometry_points, terrain_flips, pool_domain, return_owners=True)
    contacts = (contact_owners >= 0) & (np.abs(contact_levels - geometry_levels) < .001)
    season_anchors = np.full(len(geometry_points), np.nan, np.float32)
    tide_anchors = season_anchors.copy()
    season_anchors[contacts] = season2.ravel()[contact_owners[contacts]]
    tide_anchors[contacts] = tidal2.ravel()[contact_owners[contacts]]
    if seasonal_profile is not None:
        from .water_channel_response import exclusive_peak_budgets, reconcile_peak_budgets
        actual_budget = exclusive_peak_budgets(
            geometry_points, geometry_ds, seasonal_profile['original_links'], seasonal_candidates,
            channel_season, channel_tide, stage, season_anchors, tide_anchors)
        reconciled_diagnostics = {}
        peak_budget, reconciled_count = reconcile_peak_budgets(
            peak_budget, actual_budget, geometry_active,
            (geometry_levels, geometry_active, accepted_links, conflicts),
            lambda budget: solve_seasonal_profile(budget, reconciled_diagnostics))
        if reconciled_count:
            topology_stats['seasonalUnusedBudgetReconciliationCount'] = reconciled_count
            if profile_state is not None:
                profile_state['diagnostics'] = reconciled_diagnostics
        topology_stats['seasonalResponseBudgetsVerified'] = True
        if profile_state is not None:
            profile_state['seasonal_response_verified'] = True
    # A dry flood margin carries its own nearest water's level response,
    # not an interpolated fade toward zero that domes seasonal shorelines.
    if np.any(wet2):
        margin = ~wet2
        # Cross-sections can extend beyond the raster proxy's guard rows.
        # Their entire owner domain must keep its source level response.
        season2[margin] = season2[tuple(nearest_wet[:, margin])]
        tidal2[margin] = tidal2[tuple(nearest_wet[:, margin])]
        del nearest_wet

    # Purely semantic exposure: surrounding land shelters inland waters;
    # ocean fetch supplies large waves. Runtime weather scales these values.
    ocean_distance = ndimage.distance_transform_edt(sea) * mpp1
    exposure = np.where(sea, np.clip(ocean_distance / 400.0, 0.12, 1.0), 0.08)
    exposure[cls == CLASSES.index("lake")] = 0.25
    exposure[np.isin(regions, (6, 7, 8, 13)) & ~sea] = 0.03

    feature_inputs = {
        "points": geometry_points, "links": geometry_ds, "levels": geometry_levels,
        "radius": geometry_radius, "original_count": n_st, "original_links": accepted_links,
        "cell_indices": idx_st, "coarse_width": w_, "bands": rflat[idx_st],
        "wetland_rivulets": rivulet_st,
        "standing_detail": standing_detail, "all_channels": True,
        "marine_ground": ocean2,
        "pool_domain": pool_domain,
        "terrain_flips": terrain_flips, "orientation_levels": orientation_levels,
        # Original station owners supply level response; interpolation is
        # longitudinal only and never samples another bank/reach at an edge.
        "season_response": channel_season, "tide_response": channel_tide,
        "season_response_anchors": season_anchors, "tide_response_anchors": tide_anchors,
        "seasonal_sources": seasonal_sources, "stage": stage,
        "maximum_offset": maximum_offset,
    }
    ribbons, cascades = compile_features(g2, w2, support2, bodies2,
                                         **feature_inputs, metres_per_pixel=mpp2)
    topology_stats["supplementalRibbonCount"] = len(ribbons)
    topology_stats["cascadeCount"] = len(cascades)

    return {
        "w1": w_filled, "wet": wet, "wetr": wetr, "ext": ext, "cls": cls_ext,
        "turb": turb, "tannin": tannin, "season": season, "salinity": salinity, "vx": vx,
        "vz": vz, "shore_d": shore_d, "w2": w2, "depth2": depth2,
        "ground2": g2, "nodata2": nod2, "shore2": shore2, "fringe": fringe,
        "riv2": riv2,
        "support2": support2, "bodies2": bodies2,
        "support_kind2": support_kind2, "access2": access2, "tidal2": tidal2,
        "river_band": rivers, "regions": regions, "exposure": exposure,
        "season2": season2,
        "station_levels": w_st, "station_downstream": dsk,
        "topology_stats": topology_stats,
        "ribbons": ribbons, "cascades": cascades,
        "feature_inputs": feature_inputs,
        "body_records": owner_records,
        "terrain_mismatches": terrain_mismatches,
        **({"profile_state": profile_state} if capture_profile else {}),
    }


def reduce_surface_resolution(native: dict, factor: int) -> dict:
    """Lower texture cost without changing the physical channel solution.

The same native points/levels produce both quality exports. Explicit ribbons
cover any extra gaps introduced by the reduced raster, using native banks.
"""
    if factor == 1:
        return native
    result = native.copy()
    for key in ("w2", "ground2", "depth2", "shore2", "fringe", "riv2", "support2", "bodies2", "nodata2", "season2",
                "access2", "tidal2", "support_kind2"):
        if key not in native:
            continue
        result[key] = native[key][::factor, ::factor]
    geometry = native["feature_inputs"].copy()
    if geometry.get('all_channels'):
        # Complete native channels are independent of raster resolution.
        # Reuse them exactly instead of repeating expensive bank tracing.
        result['topology_stats'] = {**native['topology_stats'], 'geometrySourceMetresPerPixel': RAW_M}
        return result
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
    parser.add_argument("--profile-cache", type=Path,
                        help="Save the matching solver state from this full compilation without a second domain audit")
    parser.add_argument("--bed-overlay", type=Path,
                        help="Reuse a validated native correction overlay for another quality tier")
    parser.add_argument("--continue-repairs", action="store_true",
                        help="Continue bounded repairs from the supplied overlay")
    parser.add_argument("--routing-overrides", type=Path,
                        help="Audited residual-only native routes, validated against original anchors/corridor/saddle")
    parser.add_argument("--orientation",type=Path,help="Explicit frozen immutable-source intent; never silently reorient repairs")
    parser.add_argument("--bed-index-audit", type=Path,
                        help="Explicit reviewed original/proposed support-corner exceptions, at most5m")
    parser.add_argument("--max-bed-lowering", type=float, default=1.0,
                        help="Maximum cumulative lowering in metres, limited to native channel centres")
    parser.add_argument("--bed-exception-cell", action="append", default=[],
                        help="Explicit coarse row,col channel-sill exception permitting at most 5m lowering")
    parser.add_argument("--stage-range", type=Path, help="JSON with independent high/low tide and wet/dry season amplitudes")
    parser.add_argument("--pool-stage-reference", type=Path,
                        help="Reviewed connected-pool response ranges preserved during shoreline expansion")
    parser.add_argument("--seasonal-profile", type=Path,
                        help="Versioned native seasonal proposal, verified against fresh graph and stage responses")
    args = parser.parse_args()
    if args.seasonal_profile and (not args.bed_overlay or args.continue_repairs):
        parser.error('--seasonal-profile requires a fixed --bed-overlay without --continue-repairs')
    from .water_channel_response import load_seasonal_profile
    seasonal_profile = load_seasonal_profile(args.seasonal_profile) if args.seasonal_profile else None
    from .water_stage import stage_range, access_bounds
    stage = stage_range(json.loads(args.stage_range.read_text()) if args.stage_range else None)
    access_min, access_max = access_bounds(stage)
    routing_audit = json.loads(args.routing_overrides.read_text()) if args.routing_overrides else None
    if routing_audit and routing_audit.get('schemaVersion') != 1:
        parser.error('Unsupported native route audit schema')
    routing_overrides = ({int(cell): np.asarray(path, float) for cell, path in routing_audit['overrides'].items()}
                         if routing_audit else None)
    station_overrides = {int(cell): record for cell, record in (routing_audit or {}).get('stationOverrides', {}).items()}
    if not 0 <= args.max_bed_lowering <= 3:
        parser.error("--max-bed-lowering must be between 0 and 3 metres")
    vault = DEFAULT_HEIGHTS.parent.parent
    npz = np.load(vault / "hydrology-pass1.npz")
    refined = np.load(DEFAULT_HEIGHTS)
    z = npz["conditioned"].astype(np.float32)
    original = refined.copy()
    terrain_flips, topology_records = derive_channel_diagonal_flips(original, npz['rivers'], npz['flow_to'])
    args.out_dir.mkdir(parents=True, exist_ok=True)
    topology = {'schemaVersion': 1, 'gridSize': int(refined.shape[0]), 'metresPerPixel': RAW_M,
                'flippedCells': np.flatnonzero(terrain_flips).tolist(), 'audit': topology_records}
    # The terrain exporter can prepare matching topology while the water
    # solve runs; no original terrain assets or public bundle are replaced.
    (args.out_dir / 'water-terrain-topology.json').write_text(json.dumps(topology, separators=(',', ':')))
    # Freeze reach intent before any repair. Excavation must not reverse a
    # neighbouring reach and thereby trigger a second, artificial backwater.
    reference = compute(z, original, npz, profiles_only=True, bank_ground=original,
                        terrain_flips=terrain_flips, close_reference_domains=True)
    orientation_levels = reference['desired_levels'][:len(reference['original_links'])].copy()
    if args.orientation:
        frozen=np.load(args.orientation)
        if frozen.shape!=orientation_levels.shape or not np.isfinite(frozen).all():
            raise ValueError('Frozen orientation does not match the authored channel graph')
        orientation_levels=frozen
    immutable_potential = reference['filled_levels']
    reference_pool_levels = reference['pool_levels']
    from .water_spill_preservation import immutable_retaining_lower_bounds
    retaining_lower_bounds=immutable_retaining_lower_bounds(original,reference_pool_levels,immutable_potential,terrain_flips)
    if args.cache:
        np.save(args.cache.with_suffix('.orientation.npy'), orientation_levels)
    del reference
    print('Frozen native pre-repair reach orientation', flush=True)
    exception_cells = [tuple(map(int, cell.split(","))) for cell in args.bed_exception_cell]
    allowed_exceptions = {(124, 348), (125, 349), (126, 350), (128, 1092)}
    if any(cell not in allowed_exceptions for cell in exception_cells):
        parser.error("Only the four audited existing-channel sill cells permit the5m exception")
    protected_bank_indices = []
    restoration_audit = []
    wetland_restoration_audit = []
    wetland_anchor_restoration_audit = None
    spill_restoration_audit = []
    pool_floor_restoration_audit = []
    retaining_support_restoration_audit = []
    revoked_indexed_authority = []
    indexed_repair_audit = json.loads(args.bed_index_audit.read_text()) if args.bed_index_audit else []
    indexed_limits = {}
    if args.bed_overlay and not indexed_repair_audit:
        indexed_repair_audit = json.loads(args.bed_overlay.read_text()).get('indexedRepairAudit', [])
    for record in indexed_repair_audit:
        for cell in record['support']:
            index = cell['nativeIndex']
            limit = cell['originalM'] - cell['proposedM'] + .0001
            if (not isinstance(index,int) or not 0<=index<original.size or not np.isfinite(limit)
                    or not 0<=limit<=5 or abs(float(original.flat[index])-cell['originalM'])>1e-5):
                raise ValueError('Indexed bed authority must match immutable source and5m ceiling')
            indexed_limits[index] = max(indexed_limits.get(index, args.max_bed_lowering), limit)
    if args.bed_overlay:
        overlay_input = json.loads(args.bed_overlay.read_text())
        protected_bank_indices = overlay_input.get('protectedRetainingBankIndices', [])
        restoration_audit = overlay_input.get('retainingBankRestorationAudit', [])
        wetland_restoration_audit = overlay_input.get('wetlandRegimeRestorationAudit', [])
        wetland_anchor_restoration_audit = overlay_input.get('wetlandAnchorRestorationAudit')
        spill_restoration_audit = overlay_input.get('retainingSpillRestorationAudit', [])
        pool_floor_restoration_audit = overlay_input.get('poolFloorRestorationAudit', [])
        retaining_support_restoration_audit = overlay_input.get('retainingSupportRestorationAudit', [])
        revoked_indexed_authority = overlay_input.get('revokedIndexedRepairAuthority', [])
        if any(not isinstance(i,int) or not 0<=i<original.size for i in protected_bank_indices):
            raise ValueError('Invalid retaining bank protection indices')
        if any(i in indexed_limits and indexed_limits[i]>args.max_bed_lowering for i in protected_bank_indices):
            raise ValueError('A retaining bank cannot receive deeper bed exception authority')
        indexed_limits.update({i:0. for i in protected_bank_indices})
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
                    or previous - height > min(indexed_limits.get(index,
                        5 if exception_cells and index in overlay_input.get("exceptionIndices", []) else args.max_bed_lowering),
                        declared_cap) + 1e-5
                    or abs(float(original.flat[index]) - previous) > 1e-5):
                raise ValueError("Water bed overlay does not match immutable source terrain")
            refined.flat[index] = height
            last = index
    iteration = 0
    while not args.bed_overlay or args.continue_repairs:
        iteration += 1
        profiles = compute(z, refined, npz, profiles_only=True, bank_ground=original,
                           terrain_flips=terrain_flips, orientation_levels=orientation_levels,
                           routing_overrides=routing_overrides, station_overrides=station_overrides, immutable_potential=immutable_potential,
                           reference_pool_levels=reference_pool_levels,retaining_lower_bounds=retaining_lower_bounds)
        exceptional_sources = {source for source, cell in enumerate(profiles["cell_indices"])
                               if (int(cell // z.shape[1]), int(cell % z.shape[1])) in exception_cells}
        changes = repair_channel_beds(original, refined, profiles["points"], profiles["conflicts"],
                                      max_lowering=args.max_bed_lowering, exceptional_sources=exceptional_sources,
                                      terrain_flips=terrain_flips,
                                      depth_targets=profiles['diagnostics']['depthTargets'],
                                      pinned=profiles['diagnostics']['pinned'],
                                      links=profiles['links'], radius=profiles['diagnostics']['bankRadius'],
                                      bank_normals=profiles['diagnostics']['bankNormals'],
                                      indexed_limits=indexed_limits,retaining_lower_bounds=retaining_lower_bounds)
        print(f"Bounded channel repair {iteration}: {changes} native samples; "
              f'{len(profiles["conflicts"])} constrained reaches', flush=True)
        if args.cache:
            progress_indices = np.flatnonzero(refined.ravel() < original.ravel() - 1e-6)
            progress = {"schemaVersion": 1, "gridSize": int(refined.shape[0]), "metresPerPixel": RAW_M,
                        "maxLoweringM": 5 if np.any(original - refined > args.max_bed_lowering + 1e-5) else args.max_bed_lowering,
                        "routineMaxLoweringM": args.max_bed_lowering, "exceptionCells": exception_cells,
                        "protectedRetainingBankIndices": protected_bank_indices,
                        "retainingBankRestorationAudit": restoration_audit,
                        "indexedRepairAudit": indexed_repair_audit,
                        "wetlandRegimeRestorationAudit": wetland_restoration_audit,
                        "wetlandAnchorRestorationAudit": wetland_anchor_restoration_audit,
                        "retainingSpillRestorationAudit": spill_restoration_audit,
                        "poolFloorRestorationAudit": pool_floor_restoration_audit,
                        "retainingSupportRestorationAudit": retaining_support_restoration_audit,
                        "revokedIndexedRepairAuthority": revoked_indexed_authority,
                        "exceptionIndices": np.flatnonzero((original - refined).ravel() > args.max_bed_lowering + 1e-5).tolist(),
                        "changes": [[int(index), round(float(refined.flat[index]), 6),
                                     round(float(original.flat[index]), 6)] for index in progress_indices]}
            args.cache.with_suffix(".bed-progress.json").write_text(json.dumps(progress, separators=(",", ":")))
            diagnostics = [{'source': int(source), 'cell': int(profiles['cell_indices'][source]),
                **{key: value for key, value in conflict.items() if key not in ('pathNodes', 'drainageNodes')},
                'position': profiles['points'][conflict['node']].tolist(),
                'obstructionPosition': profiles['points'][conflict['obstructionNode']].tolist()}
                for source, conflict in profiles['conflicts'].items()]
            args.cache.with_suffix('.constraints.json').write_text(json.dumps(diagnostics, separators=(',', ':')))
        if not changes:
            break
    r = reduce_surface_resolution(compute(z, refined, npz, bank_ground=original,
        terrain_flips=terrain_flips, orientation_levels=orientation_levels,
        routing_overrides=routing_overrides, station_overrides=station_overrides, immutable_potential=immutable_potential,
        reference_pool_levels=reference_pool_levels,retaining_lower_bounds=retaining_lower_bounds, stage=stage,
        seasonal_profile=seasonal_profile, capture_profile=args.profile_cache is not None,
        pool_response_reference=(json.loads(args.pool_stage_reference.read_text())
                                 if args.pool_stage_reference else None)), args.web_step)
    r['topology_stats']['immutableRetainingBoundViolationCount']=int(np.count_nonzero(refined<retaining_lower_bounds-1e-4))

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    if routing_audit:
        (out_dir / 'water-routing-audit.json').write_text(json.dumps(routing_audit, separators=(',', ':')))
    r['topology_stats']['auditedNativeRouteOverrideCount'] = len(routing_overrides or {})
    changed = np.flatnonzero(refined.ravel() < original.ravel() - 1e-6)
    overlay = {"schemaVersion": 1, "gridSize": int(refined.shape[0]), "metresPerPixel": RAW_M,
               "maxLoweringM": 5 if np.any(original - refined > args.max_bed_lowering + 1e-5) else args.max_bed_lowering,
               "routineMaxLoweringM": args.max_bed_lowering, "exceptionCells": exception_cells,
               "protectedRetainingBankIndices": protected_bank_indices,
               "retainingBankRestorationAudit": restoration_audit,
               "indexedRepairAudit": indexed_repair_audit,
               "wetlandRegimeRestorationAudit": wetland_restoration_audit,
               "wetlandAnchorRestorationAudit": wetland_anchor_restoration_audit,
               "retainingSpillRestorationAudit": spill_restoration_audit,
               "poolFloorRestorationAudit": pool_floor_restoration_audit,
               "retainingSupportRestorationAudit": retaining_support_restoration_audit,
               "revokedIndexedRepairAuthority": revoked_indexed_authority,
               "exceptionIndices": np.flatnonzero((original - refined).ravel() > args.max_bed_lowering + 1e-5).tolist(),
               "changes": [[int(index), round(float(refined.flat[index]), 6),
                            round(float(original.flat[index]), 6)] for index in changed]}
    (out_dir / "water-bed-overlay.json").write_text(json.dumps(overlay, separators=(",", ":")))
    r["topology_stats"]["repairedNativeBedSampleCount"] = len(changed)
    r["topology_stats"]["maximumBedLoweringM"] = round(float(np.max(original - refined)), 6)
    r["topology_stats"]["flippedNativeCellCount"] = int(terrain_flips.sum())
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
    Image.fromarray(np.dstack([r["support_kind2"],
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
    access_rg = np.asarray(encode_rg16(r["access2"], access_min, access_max))
    Image.fromarray(np.dstack([access_rg[..., 0], access_rg[..., 1], enc(r["tidal2"])]),
                   mode="RGB").save(out_dir / "water-access.png")

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
        "stageRange": stage,
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
            "terrainTopologyFile": "water-terrain-topology.json",
            "nativeChannelCoverage": True,
            "supportEncoding": "R = 0 outside, 128 native-channel proxy only, 255 standing/sea raster; G,B = 16-bit hydraulic owner (body metadata basinIndex preserves connectivity)",
            "accessFile": "water-access.png", "accessMinOffsetM": access_min,
            "accessSpanM": access_max - access_min,
            "accessEncoding": "R,G = RG16 minimum connected level offset; B = fine tidal response",
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
    from .water_body_records import compile_body_records
    if args.pool_stage_reference:
        import hashlib
        meta['poolStageReferenceSha256'] = hashlib.sha256(args.pool_stage_reference.read_bytes()).hexdigest()
    if args.seasonal_profile:
        import hashlib
        meta['seasonalProfileSha256'] = hashlib.sha256(args.seasonal_profile.read_bytes()).hexdigest()
    meta["bodies"] = compile_body_records(meta, r)
    from .water_cross_sections import pack_cross_sections
    pack_cross_sections(meta, out_dir)
    (out_dir / "water-meta.json").write_text(json.dumps(meta, separators=(',', ':')))
    if args.profile_cache:
        import hashlib
        from .water_profile_cache import save_profile_cache
        provenance = {
            'terrain_source_sha256': hashlib.sha256(DEFAULT_HEIGHTS.read_bytes()).hexdigest(),
            'terrain_overlay_sha256': hashlib.sha256((out_dir / 'water-bed-overlay.json').read_bytes()).hexdigest(),
            'water_meta_sha256': hashlib.sha256((out_dir / 'water-meta.json').read_bytes()).hexdigest(),
        }
        for key, path in (('routing_audit_sha256', out_dir / 'water-routing-audit.json' if args.routing_overrides else None),
                          ('seasonal_profile_sha256', args.seasonal_profile),
                          ('pool_response_reference_sha256', args.pool_stage_reference)):
            if path is not None:
                provenance[key] = hashlib.sha256(path.read_bytes()).hexdigest()
        save_profile_cache(args.profile_cache, r['profile_state'], orientation_levels, **provenance)
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
