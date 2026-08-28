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

    # --- 3. flow ----------------------------------------------------------
    h_, w_ = z.shape
    vx = np.zeros(z.shape, dtype=np.float32)
    vz = np.zeros(z.shape, dtype=np.float32)
    idx = np.flatnonzero((rivers > 0).ravel())
    j = flow_to[idx]
    ok = j >= 0
    ii, jj = idx[ok], j[ok]
    dy = (jj // w_) - (ii // w_)
    dx = (jj % w_) - (ii % w_)
    inv = 1.0 / np.hypot(dx, dy).clip(1e-6, None)
    speed = np.zeros(z.shape, dtype=np.float32)
    for band, s in FLOW_SPEED.items():
        speed[rivers == band] = s
    vx.ravel()[ii] = dx * inv * speed.ravel()[ii]
    vz.ravel()[ii] = dy * inv * speed.ravel()[ii]
    # smooth so D8's 45-degree steps read as a continuous current
    vx = ndimage.gaussian_filter(vx, 1.2)
    vz = ndimage.gaussian_filter(vz, 1.2)

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
    wr1 = np.where(riv, w, np.nan).astype(np.float32)
    _, (ry, rx) = ndimage.distance_transform_edt(np.isnan(wr1), return_indices=True)
    wr2 = up_lin(wr1[ry, rx])
    riv2 = up_near(ndimage.binary_dilation(riv, iterations=1))
    bed2 = ndimage.grey_erosion(g2, size=5)
    comp(riv2, np.maximum(wr2, (bed2 + RIVER_MIN_DEPTH_M).astype(np.float32)))

    # standing water: priority-flood the refined terrain; a depression holds
    # water when it is in plausibly wet ground, is deep enough somewhere and
    # big enough to matter — then the WHOLE pool fills to its spill level
    ocean2 = g2s < 0.0
    filled2 = fill_depressions(g2s, ocean2)
    depth_fill = filled2 - g2s
    allow2 = up_near(wetlands | (flood >= 1) | lakes) | riv2
    cand = (depth_fill > 0.02) & allow2 & ~ocean2
    lbl2, n_l = ndimage.label(cand)
    if n_l:
        max_depth = ndimage.maximum(depth_fill, lbl2, np.arange(1, n_l + 1))
        areas2 = np.bincount(lbl2.ravel())[1:]
        keep2 = np.zeros(n_l + 1, dtype=bool)
        keep2[1:] = (max_depth >= MIN_POOL_DEPTH_M) & (areas2 >= MIN_POOL_PX)
        comp(keep2[lbl2], (filled2 - 0.05).astype(np.float32))

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
    w2 = np.where(nod2, np.minimum(g2 - BURY_M, cap - 1.0), w2).astype(np.float32)
    # …and clamp any remaining DRY cell that still pokes above nearby water
    # (river-ribbon banks at cascade steps): those triangles would bridge the
    # step as a small wall.
    dry_viol = (~fringe) & ((w2 - g2) <= 0.01) & (w2 > cap + 0.05)
    w2[dry_viol] = np.minimum(w2, cap - 1.0)[dry_viol]

    depth2 = np.clip(w2 - g2, 0.0, 25.5)
    shore2 = np.clip(ndimage.distance_transform_edt(wet2) * mpp2, 0.0, SHORE_MAX_M).astype(np.float32)

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
    turb = np.clip(ndimage.gaussian_filter(turb, 1.5), 0.0, 1.0)
    tannin = np.clip(ndimage.gaussian_filter(tannin, 1.5), 0.0, 1.0)

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
        season=r["season"], vx=r["vx"], vz=r["vz"], shore_d=r["shore_d"],
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
