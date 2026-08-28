"""Compile the province water layer for Phase 8b (decision 0025).

Turns the Phase 3 hydrology solve + the Phase 6/6b refined terrain into the
data the water renderer and the gameplay `WorldWaterQuery` both sample:

- a province-wide water-surface-height field W(x,z): the real surface height
  over water (sea 0, lakes at their fill level, rivers at a monotone-downstream
  surface), extrapolated as a local "water table" across floodable fringes
  (so tide/wet-season level changes flood the right land), and pinned to
  `ground - BURY_M` everywhere else so the rendered surface simply hides
  under the terrain (one continuous mesh, no seams);
- a flow field (direction + speed) along rivers, plus a shore-distance field;
- per-pixel water character (class, turbidity, salinity, season response).

Usage:
  python3 -m worldgen.compile_water            # vault default paths

Writes:
- full arrays -> <vault>/water-pass1.npz
- browser data -> apps/world-studio/public/province/water/
    water-surface.png  2017^2 RGB: R,G = W quantised 16-bit (min/max in meta),
                       B = depth proxy clamp(W - ground, 0, 25.5) / 0.1
    water-flow.png     1345^2 RGBA: R,G = flow dir*speed  (v/FLOW_MAX*0.5+0.5),
                       B = speed / FLOW_MAX, A = shore distance / SHORE_MAX_M
    water-class.png    1345^2 RGBA: R = class idx (nearest-sample only),
                       G = turbidity, B = salinity, A = season response
    water-meta.json    encodings + stats
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .compile_chunks import DEFAULT_HEIGHTS
from .export_web_chunks import encode_rg16
from .hydrology import fill_depressions
from .scale import RAW_METRES_PER_SAMPLE as RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"

STEP = 3                      # hydrology grid: 4033 -> 1345, 5.48352 m/px
WEB_STEP = 2                  # surface grid:   4033 -> 2017, 3.65568 m/px

# Water surface authoring
FREEBOARD = {1: 0.5, 2: 0.9, 3: 1.5}   # river surface = ambient bank - freeboard
CARVE_DEPTH = {1: 1.4, 2: 2.6, 3: 4.2}  # refine_province.CHANNELS bed depths
LAKE_DROP_M = 0.10            # lake surface sits just under the fill level
LAKE_MIN_PX = 4               # ignore pit-noise "lakes" smaller than this
# Refined-grid placement (owner round 2 — "water finds its level")
RIVER_MIN_DEPTH_M = 0.35      # guaranteed column over the local carved bed
MIN_POOL_DEPTH_M = 0.30       # a depression must hold this somewhere to count
MIN_POOL_PX = 24              # ~320 m^2 at 3.66 m/px — no pixel puddle noise
FRINGE_PX = 4                 # flat low-bank continuation (tide/season headroom)
FRINGE_BANK_M = 1.8
SAIL_GUARD_PX = 8             # buried W near water stays below the local level
BURY_M = 3.0                  # dry ground carries W = ground - BURY_M
TABLE_MAX_PX = 24             # how far the water table extends over floodable land
FLOODABLE_HAND_M = 4.0        # hand < this counts as floodable fringe

# Flow field
FLOW_SPEED = {1: 0.4, 2: 0.7, 3: 1.1}  # m/s by river band
FLOW_MAX = 3.0                # encoding ceiling, m/s
SHORE_MAX_M = 160.0           # shore-distance encoding ceiling

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
    rivers = npz["rivers"]
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


def compute(z: np.ndarray, refined: np.ndarray, npz) -> dict:
    """All water fields at the 1345^2 hydrology grid + the 2017^2 surface."""
    mpp1 = RAW_M * STEP
    ocean = npz["ocean"]
    filled = npz["filled"]
    rivers = npz["rivers"]
    lakes = npz["lakes"]
    wetlands = npz["wetlands"]
    tidal = npz["tidal"]
    salinity = npz["salinity"].astype(np.float32)
    hand = npz["hand"]
    flood = npz["flood"]
    flow_to = npz["flow_to"].reshape(-1)

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

    wr = river_surface(z, npz)
    riv = ~np.isnan(wr)
    w = np.where(riv, np.fmax(np.nan_to_num(w, nan=-1e9), wr), w)
    w[w < -1e8] = np.nan
    w = backwater(w, npz, filled)

    wet = ~np.isnan(w)

    # (flow is computed AFTER the refined surface below — round 7: speed
    # comes from the conditioned long profile, not the raw terrain slope)
    h_, w_ = z.shape
    shore_d = (ndimage.distance_transform_edt(wet) * mpp1).astype(np.float32)

    nodata = np.isnan(w)
    w_filled = np.where(nodata, z - BURY_M, w).astype(np.float32)

    # --- 5. the RENDERED surface: water finds its level on the refined grid
    # (owner round 2). Depressions fill to their spill level at full web
    # resolution ("sunken areas fill up"), rivers carry a guaranteed water
    # column over their carved beds, shorelines continue FLAT under low banks
    # (so tide/wet-season raises flood them naturally), and the buried
    # surface near any water stays BELOW the local water level so coarse
    # distant triangles can never bridge a gully as a vertical "sail".
    g2 = refined[::WEB_STEP, ::WEB_STEP].astype(np.float32)
    n2 = g2.shape[0]
    mpp2 = RAW_M * WEB_STEP
    g2s = ndimage.gaussian_filter(g2, 1.0)
    scale2 = n2 / z.shape[0]

    def up_lin(a):
        return ndimage.zoom(a.astype(np.float32), scale2, order=1)[:n2, :n2]

    def up_near(a):
        return ndimage.zoom(a.astype(np.float32), scale2, order=0)[:n2, :n2] > 0.5

    w2 = np.full(g2.shape, np.nan, dtype=np.float32)

    def comp(mask, values):
        nonlocal w2
        w2 = np.where(mask, np.fmax(np.nan_to_num(w2, nan=-1e9), values), w2)
        w2[w2 < -1e8] = np.nan

    # sea plane (y = 0, decision 0003/0005)
    comp(g2 < 0.0, np.float32(0.0))

    # rivers: coarse backwatered level, spread to a >=2-px ribbon, with a
    # guaranteed minimum column over the local carved channel bottom
    # ONE physical model for all inland water (owner round 6 — the round-4/5
    # "guaranteed column" heuristics made bulges above ponds and above banks;
    # gone). Every water level comes from the SAME priority-flood of the
    # refined terrain: rivers are chains of pools standing in their carved
    # channels (they can never exceed their banks — the spill level IS the
    # bank), connected across riffles/rapids by a thin flowing film on the
    # channel centrelines. Fullness therefore comes from CARVING (fluvial
    # stage), which is the owner's "sloped riverbed" model.
    riv2f = ndimage.gaussian_filter(
        up_lin(ndimage.binary_dilation(riv, iterations=1).astype(np.float32)), 1.6)
    riv2 = riv2f > 0.35
    riv2core = up_near(riv)

    ocean2 = g2s < 0.0
    filled2 = fill_depressions(g2s, ocean2)
    depth_fill = filled2 - g2s
    wet_heart = up_near(np.isin(npz["regions"], (6, 7, 8, 13)))
    allow2 = up_near(wetlands | (flood >= 1) | lakes) | riv2 | wet_heart
    # pools are kept or dropped WHOLE (no blocky cell-wise mask clipping)
    cand = (depth_fill > 0.02) & ~ocean2
    gy2s, gx2s = np.gradient(g2s, mpp2)
    slope2 = np.hypot(gy2s, gx2s)
    lbl2, n_l = ndimage.label(cand)
    pool_lvl = np.full(g2.shape, -np.inf, dtype=np.float32)
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
            (max_depth >= 0.10) & (areas2 >= 6),
            (max_depth >= MIN_POOL_DEPTH_M) & (areas2 >= MIN_POOL_PX))
        pool_lvl = np.where(keep2[lbl2], (filled2 - 0.05), -np.inf).astype(np.float32)
        comp(keep2[lbl2], (filled2 - 0.05).astype(np.float32))

    # --- the channel LONG PROFILE (round 7; research: rivers-on-slopes-and-
    # cascades §Q4). No shipped engine renders raw fill output on a slope:
    # along a channel the surface is a smooth monotone-downstream profile
    # (UE5 spline Z, U4 baked sim heights, flood-mapping HAND/REM practice).
    # Stations = coarse river cells. Surface = carved bed + band film depth,
    # clamped UP to any priority-flood pool it crosses, made monotone by a
    # downstream running-min, smoothed along the chain, then spread across
    # the hydraulic width so banks never show dry slivers.
    FILM_DEPTH = {1: 0.30, 2: 0.55, 3: 0.85}
    rflat = rivers.reshape(-1)
    idx_st = np.flatnonzero(rflat > 0)
    n_st = len(idx_st)
    sy = np.minimum(((idx_st // w_) * scale2 + scale2 * 0.5).astype(np.int64), n2 - 1)
    sx = np.minimum(((idx_st % w_) * scale2 + scale2 * 0.5).astype(np.int64), n2 - 1)
    bed_st = ndimage.minimum_filter(g2, size=3)[sy, sx].astype(np.float32)
    film_st = np.select([rflat[idx_st] == b for b in (1, 2, 3)],
                        [np.float32(FILM_DEPTH[b]) for b in (1, 2, 3)]).astype(np.float32)
    w_st = bed_st + film_st
    floor_st = bed_st + 0.08
    pool_at = pool_lvl[sy, sx]
    pooled = pool_at > w_st
    w_st = np.maximum(w_st, pool_at).astype(np.float32)
    # downstream station row for each station (coarse flow graph)
    pos = np.full(z.size, -1, dtype=np.int64)
    pos[idx_st] = np.arange(n_st)
    ds_flat = flow_to[idx_st]
    dsk = np.where((ds_flat >= 0) & (pos[np.maximum(ds_flat, 0)] >= 0),
                   pos[np.maximum(ds_flat, 0)], -1)
    seg_dist = np.full(n_st, mpp1, dtype=np.float32)
    hasd = dsk >= 0
    seg_dist[hasd] = np.hypot(
        (ds_flat[hasd] // w_) - (idx_st[hasd] // w_),
        (ds_flat[hasd] % w_) - (idx_st[hasd] % w_)) * mpp1
    order = np.argsort(-filled.reshape(-1)[idx_st], kind="stable")  # upstream first
    for _pass in range(2):
        for k in order:
            d = dsk[k]
            if d >= 0 and not pooled[d] and w_st[d] > w_st[k]:
                w_st[d] = max(w_st[k], floor_st[d])
        # gentle along-chain smoothing (station <-> its downstream partner)
        w_sm = w_st.copy()
        cnt = np.ones(n_st, dtype=np.float32)
        np.add.at(w_sm, dsk[hasd], w_st[hasd])
        np.add.at(cnt, dsk[hasd], 1.0)
        w_sm[hasd] += w_st[dsk[hasd]]
        cnt[hasd] += 1.0
        w_st = np.where(pooled, w_st, np.maximum(w_sm / cnt, floor_st)).astype(np.float32)
    for k in order:  # final strict monotone pass
        d = dsk[k]
        if d >= 0 and not pooled[d] and w_st[d] > w_st[k]:
            w_st[d] = max(w_st[k], floor_st[d])

    # lateral spread: nearest-station level across the Leopold–Maddock width
    a_st = np.maximum(npz["accum_km2"].reshape(-1)[idx_st], 0.02)
    w_geom = 14.0 * a_st ** 0.40
    d_geom = (1.8 * a_st ** 0.29).astype(np.float32)
    r_st = np.clip(w_geom * 0.5 / mpp2, 1.0, 4.5).astype(np.float32)
    st_mask = np.zeros(g2.shape, dtype=bool)
    st_mask[sy, sx] = True
    lvl_r = np.full(g2.shape, -np.inf, dtype=np.float32)
    np.maximum.at(lvl_r, (sy, sx), w_st)
    r_r = np.zeros(g2.shape, dtype=np.float32)
    np.maximum.at(r_r, (sy, sx), r_st)
    dmax_r = np.zeros(g2.shape, dtype=np.float32)
    np.maximum.at(dmax_r, (sy, sx), film_st + d_geom + 1.2)
    d_st, (ky, kx) = ndimage.distance_transform_edt(~st_mask, return_indices=True)
    lvl_n = lvl_r[ky, kx]
    ribbon = (d_st <= r_r[ky, kx] + 0.5) & np.isfinite(lvl_n)
    # ground far below the station level is off-channel (the downhill bank
    # on a cross-slope) — never flood it from the ribbon
    ribbon &= g2 > (lvl_n - dmax_r[ky, kx])
    comp(ribbon, lvl_n.astype(np.float32))
    riv2 = riv2 | ribbon

    # centreline film backstop over the ROUGH ground: bumps between stations
    # can't punch dry gaps through the channel
    film_h = (np.maximum(g2, g2s) + 0.12).astype(np.float32)
    w2[riv2core] = np.fmax(np.nan_to_num(w2[riv2core], nan=-1e9), film_h[riv2core])

    wet2 = ~np.isnan(w2)

    # low-bank flat continuation (tide/wet-season headroom), then burial with
    # the sail guard
    dist2, (jy, jx) = ndimage.distance_transform_edt(~wet2, return_indices=True)
    wn2 = w2[jy, jx]
    fringe = (~wet2) & (dist2 <= FRINGE_PX) & ((g2s - wn2) < FRINGE_BANK_M)
    w2[fringe] = wn2[fringe]
    # buried surface: under the ground AND never above any NEARBY water
    # level (the local minimum, not just the nearest — terraced pools next
    # to a low channel must not lift the buried sheet over the channel).
    # Distance-free because far LOD triangles span hundreds of metres.
    lvl = np.where(wet2, w2, np.float32(np.inf))
    local_min = ndimage.grey_erosion(lvl, size=33, mode="nearest")
    cap = np.minimum(wn2, np.where(np.isfinite(local_min), local_min, wn2))
    nod2 = np.isnan(w2)
    # near ring (≤2 px of any water): bury JUST below the nearest water
    # level, not below the 120 m-window minimum — on a steep channel that
    # minimum sits tens of metres down, so the bilinear surface plunged
    # sub-pixel and mountain streams read as empty beds with occasional
    # blobs (owner round 6). The per-fragment depth-proxy discard keeps
    # these cells from ever bridging as sails.
    near_ring = nod2 & (dist2 <= 2.0)
    w2 = np.where(nod2, np.minimum(g2 - BURY_M, cap - 1.0), w2)
    w2[near_ring] = np.minimum(g2[near_ring] - 0.45, wn2[near_ring] - 0.35)
    w2 = w2.astype(np.float32)
    # …and clamp any remaining DRY cell that still pokes above nearby water
    # (river-ribbon banks at cascade steps): those triangles would bridge the
    # step as a small wall.
    dry_viol = (~fringe) & (~near_ring) & ((w2 - g2) <= 0.01) & (w2 > cap + 0.05)
    w2[dry_viol] = np.minimum(w2, cap - 1.0)[dry_viol]

    # soften spillway terraces — WET-MASKED smoothing only (round 7): the
    # old plain gaussian mixed buried neighbours (ground − 3 m) into steep
    # wet films, sinking them under ground and punching the dry gaps that
    # broke cascades into blob chains.
    gy2, gx2 = np.gradient(w2, mpp2)
    steep_w = np.hypot(gy2, gx2) > 0.02
    wetf = wet2.astype(np.float32)
    w2s = ndimage.gaussian_filter(np.where(wet2, w2, 0.0), 1.2) / np.maximum(
        ndimage.gaussian_filter(wetf, 1.2), 1e-3)
    w2 = np.where(wet2 & steep_w, 0.5 * w2 + 0.5 * w2s, w2).astype(np.float32)
    # smoothing must never sink the channel film into its bed
    chan_keep = riv2core & wet2
    w2[chan_keep] = np.maximum(w2[chan_keep], (np.maximum(g2, g2s) + 0.10)[chan_keep])

    depth2 = np.clip(w2 - g2, 0.0, 25.5)
    shore2 = np.clip(ndimage.distance_transform_edt(wet2) * mpp2, 0.0, SHORE_MAX_M).astype(np.float32)

    # --- 3. flow: direction from the flow graph; SPEED from the conditioned
    # profile's slope over a ~6-station window, quantised into four reach
    # bands (pool / glide / riffle / rapid) — banded contrast between
    # adjacent reaches is what makes speed legible (research Q2; Vlachos).
    vx = np.zeros(z.shape, dtype=np.float32)
    vz = np.zeros(z.shape, dtype=np.float32)
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
    v_raw = np.clip((0.35 + 9.0 * np.sqrt(slope_win)) * size, 0.15, 3.0)
    v_st = np.select([v_raw < 0.45, v_raw < 0.95, v_raw < 1.7],
                     [np.float32(0.30), np.float32(0.70), np.float32(1.30)],
                     default=np.float32(2.30)).astype(np.float32)
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
    support_s = ndimage.gaussian_filter(support, 1.2)
    vx = ndimage.gaussian_filter(vx, 1.2) / np.maximum(support_s, 0.25)
    vz = ndimage.gaussian_filter(vz, 1.2) / np.maximum(support_s, 0.25)

    # --- 6. classes, from the RENDERED wetness (owner round 2: patchy
    # marsh/ocean splits came from classifying the coarse grid). Wetland
    # water is marsh no matter how saline — a salt marsh is still a marsh.
    wetr = wet | (ndimage.zoom(wet2.astype(np.float32), 1.0 / scale2, order=1)[: z.shape[0], : z.shape[1]] > 0.25)
    cls = np.zeros(z.shape, dtype=np.uint8)
    cls[wetr & sea & (salinity >= 0.3)] = CLASSES.index("coast")
    cls[wetr & sea & (salinity < 0.3) & (salinity >= 0.05)] = CLASSES.index("estuary")
    cls[wetr & sea & (salinity < 0.05)] = CLASSES.index("lake")  # Blackrose-style fresh basin
    cls[wetr & riv] = CLASSES.index("river")
    cls[wetr & big_lakes & ~sea] = CLASSES.index("lake")
    cls[wetr & wetlands & ~riv] = CLASSES.index("marsh")
    cls[wetr & (cls == 0)] = CLASSES.index("marsh")

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

    return {
        "w1": w_filled, "wet": wet, "wetr": wetr, "ext": ext, "cls": cls_ext,
        "turb": turb, "tannin": tannin, "season": season, "salinity": salinity, "vx": vx,
        "vz": vz, "shore_d": shore_d, "w2": w2, "depth2": depth2,
        "ground2": g2, "nodata2": nod2, "shore2": shore2, "fringe": fringe,
        "riv2": riv2,
    }


def main() -> None:
    vault = DEFAULT_HEIGHTS.parent.parent
    npz = np.load(vault / "hydrology-pass1.npz")
    refined = np.load(DEFAULT_HEIGHTS)
    z = npz["conditioned"].astype(np.float32)
    r = compute(z, refined, npz)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        vault / "water-pass1.npz",
        w1=r["w1"], wet=r["wet"], ext=r["ext"], cls=r["cls"], turb=r["turb"],
        season=r["season"], tannin=r["tannin"], vx=r["vx"], vz=r["vz"], shore_d=r["shore_d"],
        w2=r["w2"].astype(np.float32), depth2=r["depth2"].astype(np.float32),
        shore2=r["shore2"].astype(np.float32), fringe=r["fringe"],
        riv2=r["riv2"],
    )

    w2 = r["w2"]
    min_w, max_w = float(w2.min()), float(w2.max())
    surf = np.asarray(encode_rg16(w2, min_w, max_w))
    surf = np.dstack([surf[..., 0], surf[..., 1],
                      np.round(r["depth2"] / 0.1).astype(np.uint8)])
    Image.fromarray(surf, mode="RGB").save(OUT_DIR / "water-surface.png")

    # NO data ever rides a PNG alpha channel: browser canvas decoding
    # premultiplies alpha, destroying the RGB wherever alpha is low — this
    # exactly killed tide response (salty cells have season=0) and river flow
    # vectors near banks in rounds 0-2. Everything ships as RGB.
    enc = lambda a: np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    shore8 = np.clip(np.round(r["shore2"] / SHORE_MAX_M * 255.0), 0, 255).astype(np.uint8)
    n2 = r["shore2"].shape[0]
    up2 = lambda a: ndimage.zoom(a, n2 / a.shape[0], order=1)[:n2, :n2]
    Image.fromarray(
        np.dstack([shore8, enc(up2(r["season"])), enc(up2(r["tannin"]))]), mode="RGB",
    ).save(OUT_DIR / "water-shore.png")

    flow = np.dstack([
        enc(r["vx"] / FLOW_MAX * 0.5 + 0.5),
        enc(r["vz"] / FLOW_MAX * 0.5 + 0.5),
        enc(np.hypot(r["vx"], r["vz"]) / FLOW_MAX),
    ])
    Image.fromarray(flow, mode="RGB").save(OUT_DIR / "water-flow.png")

    klass = np.dstack([r["cls"], enc(r["turb"]), enc(r["salinity"])])
    Image.fromarray(klass, mode="RGB").save(OUT_DIR / "water-class.png")

    wet, ext, cls = r["wet"], r["ext"], r["cls"]
    stats = {
        "wetFrac": round(float(wet.mean()), 4),
        "tableExtFrac": round(float(ext.mean()), 4),
        "classFrac": {name: round(float((cls == i).mean()), 5)
                      for i, name in enumerate(CLASSES) if i},
        "visibleWaterFrac2017": round(float((r["depth2"] > 0.05).mean()), 4),
        "maxDepthM": round(float(r["depth2"].max()), 2),
        # rivers are carved CARVE_DEPTH below the ambient bank (refine_province
        # CHANNELS); the water surface must sit above that bed line
        "riverCellsAboveBed": round(float(np.mean(np.concatenate([
            ((r["w1"] > z - d + 0.05)[npz["rivers"] == b]).ravel()
            for b, d in CARVE_DEPTH.items() if (npz["rivers"] == b).any()
        ]))), 4),
    }
    meta = {
        "surface": {
            "file": "water-surface.png", "size": int(w2.shape[0]),
            "metresPerPixel": RAW_M * WEB_STEP,
            "minM": min_w, "maxM": max_w,
            "encoding": "R,G = 16-bit W; B = depth proxy 0.1 m steps",
            "buryM": BURY_M,
            "shoreFile": "water-shore.png",
            "shoreMaxM": SHORE_MAX_M,
        },
        "flow": {"file": "water-flow.png", "size": int(z.shape[0]),
                 "metresPerPixel": RAW_M * STEP, "flowMax": FLOW_MAX,
                 "shoreMaxM": SHORE_MAX_M},
        "klass": {"file": "water-class.png", "size": int(z.shape[0]),
                  "metresPerPixel": RAW_M * STEP, "classes": CLASSES},
        "stats": stats,
    }
    (OUT_DIR / "water-meta.json").write_text(json.dumps(meta, indent=1))
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
