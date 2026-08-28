"""Fluvial continuum carving (Phase 8b round 3, owner-approved terrain edits).

Research: docs/research/tropical-fluvial-geomorphology.md. Channel geometry
follows Leopold–Maddock hydraulic geometry (W ∝ A^0.40, D ∝ A^0.29) with the
game-scale width multiplier (§0), valley form follows Montgomery–Buffington
slope classes (steep reaches narrow/deepen, no floodplain), lowland majors
get levees + gentle floodplain smoothing (backswamps emerge behind the
levees and fill via compile_water's depression flood), meander belts get
oxbow scars, wetlands get their dips deepened into real pools, and sheltered
whitewater mouths get delta distributaries + a mudflat apron.

All randomness draws from the rng PASSED IN (a separate stream from
refine_province's) so the owner-approved 6b noise lattice is bit-identical.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

from .scale import RAW_M

# Game-scale hydraulic geometry (research §0/§1.1: real exponents, one width
# multiplier so hierarchy tiers read at province compression).
W_COEF, W_EXP = 14.0, 0.40   # W = 14·A^0.40  (m; A km²) → 6/14/29 m tiers
# depth raised in owner round 6: under the unified fill model the carve IS
# what makes rivers run full (pools stand in the channel up to its lip)
D_COEF, D_EXP = 1.80, 0.29   # D = 1.8·A^0.29 (m)       → 0.9/1.8/3.0 m
STEEP_SLOPE = 0.03           # Montgomery–Buffington: step-pool and steeper
LEVEE_H = 0.55               # m, lowland majors only
OXBOW_DEPTH = 2.0            # m
POOL_DEEPEN = 1.05           # wetland dips deepen by up to this × dip


def channel_geometry(area_km2):
    a = np.maximum(area_km2, 0.02)
    return W_COEF * a ** W_EXP, D_COEF * a ** D_EXP


def _carve_channels(h, riv, area, steep, ambient):
    """Log-binned continuum carve: h = min(h, ambient − D·gauss(d, W/2))."""
    edges = np.geomspace(0.02, max(float(area[riv].max()), 0.05) + 0.01, 9)
    for i in range(len(edges) - 1):
        for is_steep in (False, True):
            m = riv & (area >= edges[i]) & (area < edges[i + 1]) & (steep == is_steep)
            if not m.any():
                continue
            a_mid = float(np.exp(np.log(area[m]).mean()))
            w, d = channel_geometry(a_mid)
            if is_steep:
                w, d = w * 0.7, d * 1.3   # V-gorge: narrow, deep
            dist = ndimage.distance_transform_edt(~m) * RAW_M
            prof = d * np.exp(-((dist / (w * 0.5)) ** 2))
            np.minimum(h, np.where(prof > 0.05, ambient - prof, h), out=h)
    return h


def _levees_and_floodplain(h, riv, area, steep):
    maj = riv & (area > 1.0) & ~steep & (h < 14.0)
    if not maj.any():
        return h
    dist = ndimage.distance_transform_edt(~maj) * RAW_M
    w_typ = 26.0
    lowland = (h > 0.15) & (h < 12.0)
    levee = LEVEE_H * np.exp(-(((dist - 1.15 * w_typ) / (0.6 * w_typ)) ** 2))
    h = (h + np.where(lowland & (dist < 4.0 * w_typ), levee, 0.0)).astype(np.float32)
    # floodplain: soften high-frequency bumps out to ~6×W (backswamp basins
    # survive as the low points and fill in compile_water)
    fp = lowland & (dist > 1.8 * w_typ) & (dist < 6.0 * w_typ)
    hs = ndimage.gaussian_filter(h, 12.0)
    fade = np.clip(1.0 - (dist - 1.8 * w_typ) / (4.2 * w_typ), 0.0, 1.0)
    h = np.where(fp & (h > hs), h - 0.5 * (h - hs) * fade, h).astype(np.float32)
    return h


def _oxbows(h, riv, area, steep, rng):
    """Crescent scars in the meander belts of lowland majors (research §5)."""
    belt = riv & (area > 1.2) & ~steep & (h < 10.0)
    ys, xs = np.nonzero(belt)
    if len(ys) < 40:
        return h, 0
    order = np.argsort(ys * 100000 + xs)  # deterministic scan order
    stride = max(len(order) // 22, 1)
    n = 0
    ox_depth = np.zeros_like(h)  # overlapping scars take the MAX, never stack
    gy, gx = np.gradient(ndimage.gaussian_filter(h, 8.0))
    for k in order[::stride]:
        cy, cx = int(ys[k]), int(xs[k])
        a = float(area[cy, cx])
        w, _ = channel_geometry(a)
        # perpendicular to local flow ≈ along the local contour
        vx, vy = gy[cy, cx], -gx[cy, cx]
        norm = float(np.hypot(vx, vy))
        if norm < 1e-6:
            continue
        side = 1 if rng.random() < 0.5 else -1
        off = (2.3 + rng.random()) * w / RAW_M
        oy = cy + side * (vy / norm) * off
        ox = cx + side * (vx / norm) * off
        r = (1.6 + 0.6 * rng.random()) * w / RAW_M
        win = int(r + 0.9 * w / RAW_M + 3)
        y0, y1 = max(int(oy) - win, 0), min(int(oy) + win + 1, h.shape[0])
        x0, x1 = max(int(ox) - win, 0), min(int(ox) + win + 1, h.shape[1])
        if y1 - y0 < 4 or x1 - x0 < 4:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        ring = np.abs(np.hypot(yy - oy, xx - ox) - r) * RAW_M
        # only the far half of the ring (facing away from the river) survives
        away = ((yy - oy) * (oy - cy) + (xx - ox) * (ox - cx)) > 0
        prof = (OXBOW_DEPTH * np.exp(-((ring / (0.45 * w)) ** 2)) * away).astype(np.float32)
        np.maximum(ox_depth[y0:y1, x0:x1], prof, out=ox_depth[y0:y1, x0:x1])
        n += 1
    h -= ox_depth
    return h, n


def _rivulets(h, riv, accum, wet, ambient):
    """The anastomosing wetland drainage web (research §1.2/§3): every
    sub-river drainage line inside wetland ground becomes a narrow, shallow
    channel connecting the pools — splash-through swamp plumbing."""
    mask = (wet > 0.5) & ~riv & (accum > 0.02) & (accum <= 0.12)
    if not mask.any():
        return h
    # feather the (coarse-grid staircase) mask so channels curve, not step
    soft = ndimage.gaussian_filter(mask.astype(np.float32), 2.0) > 0.30
    dist = ndimage.distance_transform_edt(~soft) * RAW_M
    prof = 0.7 * np.exp(-((dist / 2.4) ** 2))
    return np.minimum(h, np.where(prof > 0.05, ambient - prof, h)).astype(np.float32)


def _wetland_compaction(h, wet, riv):
    """Lower the wetland interiors a touch (peat compaction): broad, smooth,
    so the flood-fill knits the pools into larger sheets (owner: the marsh
    heartlands should read mostly-water-with-land)."""
    soft = ndimage.gaussian_filter(wet, 14.0)
    dchan = ndimage.distance_transform_edt(~riv) * RAW_M
    return (h - 0.6 * soft * (dchan > 25.0)).astype(np.float32)


def _deepen_wetland_pools(h, riv, wet):
    """Existing wetland dips become real pools (owner: 'make marsh pools
    deeper') — amplify only local hollows, never touch channels or ridges."""
    dchan = ndimage.distance_transform_edt(~riv) * RAW_M
    dips = np.clip(ndimage.gaussian_filter(h, 6.0) - h, 0.0, 1.5)
    h -= (POOL_DEEPEN * dips * wet * (dchan > 40.0)).astype(np.float32)
    return h


def _delta(h, riv, area, salinity, rng):
    """Distributaries + mudflat apron at the largest sheltered whitewater
    mouth(s) (Galloway simplified, research §4.1)."""
    from .refine_province import carve_polyline
    ocean = h <= -0.2
    if not ocean.any():
        return h, 0
    ocean_near, (oy_i, ox_i) = ndimage.distance_transform_edt(~ocean, return_indices=True)
    ocean_near = ocean_near * RAW_M
    mouths = riv & (area > 1.2) & (salinity > 0.12) & (ocean_near < 120.0)
    lbl, nl = ndimage.label(mouths)
    n_done = 0
    for i in range(1, nl + 1):
        if n_done >= 2:
            break
        ys, xs = np.nonzero(lbl == i)
        cy, cx = float(ys.mean()), float(xs.mean())
        # direction: straight toward the nearest open water
        ty, tx = float(oy_i[int(cy), int(cx)]), float(ox_i[int(cy), int(cx)])
        dy, dx = ty - cy, tx - cx
        norm = float(np.hypot(dy, dx))
        if norm < 1e-7:
            continue
        dy, dx = dy / norm, dx / norm
        length = (260.0 + 90.0 * rng.random()) / RAW_M
        for ang in (-0.5, -0.17, 0.17, 0.5):
            c, s = np.cos(ang), np.sin(ang)
            ddy, ddx = dy * c - dx * s, dy * s + dx * c
            p1 = (cy + ddy * length, cx + ddx * length)
            h = carve_polyline(h, (cy, cx), p1, 9.0, -1.6, rng)
        # mudflat apron: pull low ground toward a flat around the fan
        yy, xx = np.mgrid[0:h.shape[0], 0:h.shape[1]]
        fan = (np.hypot(yy - cy, xx - cx) * RAW_M < 330.0) & (h > -0.6) & (h < 1.2)
        h = np.where(fan, (h * 0.35 - 0.18).astype(np.float32), h)
        n_done += 1
    return h, n_done


def fluvial_continuum(h, rivers_up, accum_up, salinity_up, wet_up, rng):
    """The full stage. Returns (h, stats dict)."""
    h = h.astype(np.float32)
    riv = rivers_up > 0
    area = np.where(riv, np.maximum(accum_up, 0.02), 0.0).astype(np.float32)
    hs = ndimage.gaussian_filter(h, 10.0)
    gy, gx = np.gradient(hs, RAW_M)
    steep = np.hypot(gy, gx) > STEEP_SLOPE
    ambient = ndimage.gaussian_filter(h, 25.0)
    h = _carve_channels(h, riv, area, steep, ambient)
    h = _rivulets(h, riv, accum_up, wet_up, ambient)
    h = _levees_and_floodplain(h, riv, area, steep)
    h, n_ox = _oxbows(h, riv, area, steep, rng)
    h = _wetland_compaction(h, wet_up, riv)
    h = _deepen_wetland_pools(h, riv, wet_up)
    h, n_delta = _delta(h, riv, area, salinity_up, rng)
    return h.astype(np.float32), {"oxbows": n_ox, "deltas": n_delta}
