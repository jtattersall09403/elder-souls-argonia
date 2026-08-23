"""Phase 6 pass 1: high-detail terrain refinement for the reference watershed.

Deterministic province-to-local refinement (master plan §85.2, decision 0008):
crops the Blackrose basin from the full-resolution conditioned heightfield
(~5.5 m/sample at world scale) and

- adds region-conditioned multi-octave detail (marsh hummocks, jungle
  roughness, hill relief), suppressed near channels so drainage survives;
- carves the macro river network into real channel cross-sections;
- realises Blackrose's canon site — "situated in a lake … where three rivers
  converge" (Lore:Blackrose) — as an authored lake with a city island and
  three carved feeder channels toward the canonical directions;
- exports the refined grid to the vault and a half-resolution raster to the
  studio for the basin flyover.

Heights stay in TRUE metres (no vertical-scale bake): the ×1.5–2 question in
decision 0006 is judged by the owner at the Phase 6 gate with the live
exaggeration slider. Collision/LOD/chunk streaming are Phase 6 pass 2.

Usage:
  python3 -m worldgen.refine_watershed <heightfield-f32.npy> <hydrology-pass1.npz>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

from .condition import condition
from .landcover import compile_ground_control

RAW_M = 4096.0 * 0.01428 / 32.0 * 3.0  # full-res sample size at world scale (~5.48 m)
STEP = 3                               # macro rasters are 1/3 of full res
SEED = 20260823

# Basin probes (u, v): union of watershed labels found here defines the basin
# (labels are not stable across recompiles, so 0008 defines it by region).
BASIN_PROBES = [(0.36, 0.75), (0.33, 0.80), (0.40, 0.60), (0.30, 0.70), (0.36, 0.68)]
MARGIN_COARSE = 30  # extra macro pixels around the basin bbox

# Detail-noise amplitude (m) by region class id.
NOISE_AMP = {0: 0.0, 1: 3.0, 2: 2.0, 3: 0.3, 4: 0.3, 5: 0.4, 6: 0.35, 7: 0.35,
             8: 0.4, 9: 0.5, 10: 0.9, 11: 0.8, 12: 0.15, 13: 1.2}
# Channel cross-sections by river band: (half-width m, depth m).
CHANNELS = {1: (10.0, 1.4), 2: (22.0, 2.6), 3: (45.0, 4.2)}

BLACKROSE_UV = (0.32, 0.87)
LAKE_RADII_M = (470.0, 360.0)
LAKE_BED_M = -4.0
ISLAND_R_M = 130.0
ISLAND_TOP_M = 2.6
# Feeder channels (a0, a1, half-width m, bed level m). Canon: rivers converge
# from NE (Murkwood) and W (Blackwood); the S channel is the lake's short
# outlet into Oliis Bay (the sea is ~1 km south — probe 2026-08-23), so it
# resolves to the nearest sea cell when no river exists in-sector. Pass 2:
# feeders carve TO a bed level (not a fixed depth) so channels stay wet even
# through higher ground — the pass-1 W feeder read as a dry gulley for its
# first kilometre; S connects toward the bay instead of dead-ending.
FEEDER_SECTORS = {
    "ne": (20, 80, 28.0, -2.2),
    "w": (150, 225, 38.0, -1.8),
    "s": (250, 300, 30.0, -2.8),
}

REPO_ROOT = Path(__file__).resolve().parents[3]
STUDIO_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "basin"


def detail_noise(shape, regions_up, channel_dist_m, rng):
    # Octaves down to ~11 m wavelength: the finest two are the person-scale
    # micro-relief (owner 2026-08-23: ground felt too flat between contours).
    field = np.zeros(shape, dtype=np.float32)
    for sigma, weight in ((32, 1.0), (8, 0.45), (2, 0.30), (1, 0.16)):
        octave = ndimage.gaussian_filter(rng.standard_normal(shape), sigma)
        field += weight * octave / max(octave.std(), 1e-9)
    field /= max(field.std(), 1e-9)
    amp = np.zeros(shape, dtype=np.float32)
    for cid, a in NOISE_AMP.items():
        amp[regions_up == cid] = a
    # keep drainage: fade detail out within ~2 channel widths
    amp *= np.clip(channel_dist_m / 90.0, 0.25, 1.0)
    return field * amp


def carve_channels(h, rivers_up):
    dist_all = None
    for band, (half_w, depth) in CHANNELS.items():
        mask = rivers_up == band
        if not mask.any():
            continue
        d = ndimage.distance_transform_edt(~mask) * RAW_M
        h -= (depth * np.exp(-((d / half_w) ** 2))).astype(np.float32)
        dist_all = d if dist_all is None else np.minimum(dist_all, d)
    if dist_all is None:
        dist_all = np.full(h.shape, 1e9)
    return h, dist_all


def carve_polyline(h, p0, p1, half_w_m, bed_m, rng):
    """Carve a wiggly channel whose floor reaches bed_m along the line —
    to-a-level, not by-a-depth, so it stays wet through higher ground."""
    n = int(np.hypot(p1[0] - p0[0], p1[1] - p0[1])) * 2 + 2
    t = np.linspace(0, 1, n)
    wiggle = ndimage.gaussian_filter1d(rng.standard_normal(n), 8) * 6.0
    xs = p0[0] + (p1[0] - p0[0]) * t + wiggle * (p1[1] - p0[1]) / max(n, 1)
    ys = p0[1] + (p1[1] - p0[1]) * t - wiggle * (p1[0] - p0[0]) / max(n, 1)
    mask = np.zeros(h.shape, dtype=bool)
    xs = np.clip(xs.astype(int), 0, h.shape[1] - 1)
    ys = np.clip(ys.astype(int), 0, h.shape[0] - 1)
    mask[ys, xs] = True
    d = ndimage.distance_transform_edt(~mask) * RAW_M
    w = np.exp(-((d / half_w_m) ** 2)).astype(np.float32)
    return np.minimum(h, bed_m * w + h * (1 - w)).astype(np.float32)


def impose_blackrose_lake(h, origin_full, rivers_up, rng):
    cy_full = BLACKROSE_UV[1] * 4033 - origin_full[0]
    cx_full = BLACKROSE_UV[0] * 4033 - origin_full[1]
    yy, xx = np.mgrid[0 : h.shape[0], 0 : h.shape[1]]
    dy = (yy - cy_full) * RAW_M
    dx = (xx - cx_full) * RAW_M
    theta = np.arctan2(dy, dx)
    # organic shoreline: low-frequency angular modulation of the radius
    amps = rng.uniform(0.05, 0.12, 3)
    phases = rng.uniform(0, 2 * np.pi, 3)
    wobble = 1.0 + sum(a * np.sin(k * theta + p) for k, (a, p) in zip((2, 3, 5), zip(amps, phases)))
    r = np.sqrt((dx / LAKE_RADII_M[0]) ** 2 + (dy / LAKE_RADII_M[1]) ** 2) / wobble
    # lake bed: flat centre blending up to original terrain at the rim
    t = np.clip((r - 0.55) / 0.45, 0.0, 1.0)
    blend = t * t * (3 - 2 * t)
    lake_target = LAKE_BED_M * (1 - blend) + h * blend
    h = np.where(r < 1.0, np.minimum(h, lake_target).astype(np.float32), h)
    # city island, offset from centre and irregular
    icx = cx_full + rng.uniform(-60, 60) / RAW_M
    icy = cy_full + rng.uniform(-60, 60) / RAW_M
    idy, idx_ = (yy - icy) * RAW_M, (xx - icx) * RAW_M
    itheta = np.arctan2(idy, idx_)
    iwob = 1.0 + 0.22 * np.sin(3 * itheta + phases[0]) + 0.12 * np.sin(5 * itheta + phases[1])
    ri = np.sqrt(idx_ ** 2 + idy ** 2) / (ISLAND_R_M * iwob)
    island = np.clip(np.cos(np.clip(ri, 0, 1) * np.pi / 2), 0, 1) ** 1.5 * (ISLAND_TOP_M - LAKE_BED_M)
    h = np.where(ri < 1.0, np.maximum(h, (LAKE_BED_M + island).astype(np.float32)), h)
    # three feeder channels toward canon directions: connect to the nearest
    # river cell in each sector, else to the sea (Oliis Bay for the S outlet),
    # else carve ~2 km outward as a marsh-fading stub
    riv_ys, riv_xs = np.where(rivers_up > 0)
    ang = np.degrees(np.arctan2(-(riv_ys - cy_full), riv_xs - cx_full)) % 360
    dist = np.hypot(riv_ys - cy_full, riv_xs - cx_full) * RAW_M
    sea_ys, sea_xs = np.where(h < -1.0)
    sea_ang = np.degrees(np.arctan2(-(sea_ys - cy_full), sea_xs - cx_full)) % 360
    sea_dist = np.hypot(sea_ys - cy_full, sea_xs - cx_full) * RAW_M
    rim = np.array([LAKE_RADII_M[0], LAKE_RADII_M[1]]).mean() / RAW_M
    for name, (a0, a1, half_w, depth) in FEEDER_SECTORS.items():
        min_d = rim * RAW_M * 1.1
        sel = (ang >= a0) & (ang <= a1) & (dist > min_d) & (dist < 3000)
        sea_sel = (sea_ang >= a0) & (sea_ang <= a1) & (sea_dist > min_d) & (sea_dist < 4500)
        if sel.any():
            i = np.argmin(np.where(sel, dist, np.inf))
            target = (riv_xs[i], riv_ys[i])
        elif sea_sel.any():
            i = np.argmin(np.where(sea_sel, sea_dist, np.inf))
            target = (sea_xs[i], sea_ys[i])
        else:
            mid = np.radians((a0 + a1) / 2)
            target = (cx_full + np.cos(mid) * 2000 / RAW_M, cy_full - np.sin(mid) * 2000 / RAW_M)
        start = (cx_full + (target[0] - cx_full) * rim / max(np.hypot(target[0] - cx_full, target[1] - cy_full), 1e-9),
                 cy_full + (target[1] - cy_full) * rim / max(np.hypot(target[0] - cx_full, target[1] - cy_full), 1e-9))
        h = carve_polyline(h, start, target, half_w, depth, rng)
    return h


def rasterize_roads(shape, origin_full):
    """Rasterize the Phase 4 road corridors (routes.json, macro [x, y] px)
    into the full-res crop as a bool mask ~11-16 m wide. Water rules override
    later, so crossings stay unpainted (bridges/ferries are placed features)."""
    routes_path = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "routes.json"
    mask = np.zeros(shape, dtype=bool)
    if not routes_path.exists():
        return mask
    for route in json.loads(routes_path.read_text()).get("routes", []):
        px = route.get("px", [])
        for (x0m, y0m), (x1m, y1m) in zip(px, px[1:]):
            x0, y0 = x0m * STEP - origin_full[1], y0m * STEP - origin_full[0]
            x1, y1 = x1m * STEP - origin_full[1], y1m * STEP - origin_full[0]
            steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
            xs = np.linspace(x0, x1, steps).round().astype(int)
            ys = np.linspace(y0, y1, steps).round().astype(int)
            ok = (xs >= 0) & (xs < shape[1]) & (ys >= 0) & (ys < shape[0])
            mask[ys[ok], xs[ok]] = True
    # ~27 m corridor: trunk roads must read from flyover altitude
    return ndimage.binary_dilation(mask, iterations=2)


def main() -> None:
    height_path, npz_path = Path(sys.argv[1]), Path(sys.argv[2])
    raw = np.load(height_path)
    full = condition(np.flipud(raw))  # image orientation, conditioned, true metres
    npz = np.load(npz_path)
    sheds, rivers, regions = npz["watersheds"], npz["rivers"], npz["regions"]
    n = sheds.shape[0]

    labels = {int(sheds[int(v * n), int(u * n)]) for u, v in BASIN_PROBES}
    labels.discard(0), labels.discard(-1)
    basin = np.isin(sheds, list(labels))
    ys, xs = np.where(ndimage.binary_dilation(basin, iterations=MARGIN_COARSE))
    cy0, cy1, cx0, cx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1

    # Pass 2 (owner 2026-08-23): pull any anchor city just outside the bbox
    # into the crop (Soulrest sat ~1 km beyond the west edge), then extend
    # each edge seaward until a border line is nearly all sea — so beaches,
    # headland cities and the SE island fall inside. Capped at ~4 km.
    anchors_spec = json.loads((REPO_ROOT / "world" / "sources" / "anchors" /
                               "settlement-anchors.json").read_text())
    for a in anchors_spec.get("anchors", []):
        ay, ax = a["v"] * n, a["u"] * n
        if cy0 - 70 < ay < cy1 + 70 and cx0 - 70 < ax < cx1 + 70:
            cy0, cy1 = min(cy0, int(ay) - 25), max(cy1, int(ay) + 25)
            cx0, cx1 = min(cx0, int(ax) - 25), max(cx1, int(ax) + 25)
    ocean = npz["ocean"]
    CAP = 250

    def _seaward(start, step, line_at, bound):
        for k in range(1, CAP):
            j = start + step * k
            if j < 0 or j >= bound:
                break
            if 1.0 - line_at(j).mean() < 0.15:  # mostly sea (coasts run diagonally)
                return j + step * 4  # small offshore margin
        return start

    cy1 = min(max(cy1, _seaward(cy1 - 1, +1, lambda j: ocean[j, cx0:cx1], n) + 1), n)
    cy0 = max(min(cy0, _seaward(cy0, -1, lambda j: ocean[j, cx0:cx1], n)), 0)
    cx1 = min(max(cx1, _seaward(cx1 - 1, +1, lambda j: ocean[cy0:cy1, j], n) + 1), n)
    cx0 = max(min(cx0, _seaward(cx0, -1, lambda j: ocean[cy0:cy1, j], n)), 0)
    cy0, cy1 = max(cy0, 0), min(cy1, n)
    cx0, cx1 = max(cx0, 0), min(cx1, n)
    # full-res crop aligned to the 3x macro grid
    fy0, fy1, fx0, fx1 = cy0 * STEP, min(cy1 * STEP, full.shape[0]), cx0 * STEP, min(cx1 * STEP, full.shape[1])
    h = full[fy0:fy1, fx0:fx1].copy()
    up = lambda a: np.repeat(np.repeat(a[cy0:cy1, cx0:cx1], STEP, 0), STEP, 1)[: h.shape[0], : h.shape[1]]
    rivers_up, regions_up = up(rivers), up(regions)

    rng = np.random.default_rng(SEED)
    h, channel_dist = carve_channels(h, rivers_up)
    h += detail_noise(h.shape, regions_up, channel_dist, rng)
    h = impose_blackrose_lake(h, (fy0, fx0), rivers_up, rng)
    # pass 2: shoreline smoothing — soften noisy banks in a band around the
    # waterline so shores read as mud gradients, not jagged noise spikes
    hs = ndimage.gaussian_filter(h, 2.5)
    band = np.clip(1.0 - np.abs(h - 0.2) / 1.4, 0.0, 1.0)
    h = h * (1 - 0.7 * band) + hs * (0.7 * band)

    vault_dir = height_path.parent / "blackrose-basin"
    vault_dir.mkdir(exist_ok=True)
    np.save(vault_dir / "refined-height-f32.npy", h)

    # studio raster at half resolution (RG 16-bit packing, as the province)
    from PIL import Image
    half = h[::2, ::2]
    lo, hi = float(half.min()), float(half.max())
    q = np.round((half - lo) / (hi - lo) * 65535.0).astype(np.uint16)
    rg = np.zeros((*q.shape, 3), dtype=np.uint8)
    rg[..., 0] = q >> 8
    rg[..., 1] = q & 0xFF
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rg).save(STUDIO_DIR / "height-rg.png")

    # Ground-material control map (decision 0011): semantic land cover ×
    # per-region material palettes -> (id0, id1, blend, macro) consumed by the
    # studio's texture-array shader, compiled at full resolution (~5.5 m/texel
    # — owner: finer micro variation). Detail lives in landcover.py.
    gy2, gx2 = np.gradient(h, RAW_M)
    slope_f = np.hypot(gx2, gy2).astype(np.float32)
    roads = rasterize_roads(h.shape, (fy0, fx0))
    _, control = compile_ground_control(
        h, regions_up, rivers_up, slope_f, RAW_M, rng,
        salinity=up(npz["salinity"]), twi=up(npz["twi"]),
        wetlands=up(npz["wetlands"]), roads=roads)
    Image.fromarray(control, "RGBA").save(STUDIO_DIR / "ground-control.png")

    # Macro climate tint (first slice of the §33.1 climate model): low-res RGB
    # multipliers over the albedo so the palette drifts with geography —
    # warmer/paler toward the coast and dry ground, greener/darker where wet,
    # subtly greener southward — plus ~700 m colour patchiness so large
    # same-region areas stop reading as one repeated palette (owner feedback).
    qstep = 4
    hq = h[::qstep, ::qstep]

    def qf(a):
        return up(a)[::qstep, ::qstep][: hq.shape[0], : hq.shape[1]].astype(np.float32)

    oc_q = qf(npz["ocean"]) > 0.5
    twi_q = np.nan_to_num(qf(npz["twi"]))
    wet_q = np.clip((twi_q - twi_q.mean()) / max(twi_q.std(), 1e-9) * 0.35 + 0.5, 0, 1)
    coast = np.exp(-ndimage.distance_transform_edt(~oc_q) * RAW_M * qstep / 2500.0).astype(np.float32)
    south = ((np.arange(hq.shape[0], dtype=np.float32) * qstep + fy0) / 4033.0)[:, None]
    south = (south - south.min()) / max(south.max() - south.min(), 1e-9)

    def tnoise():
        m = ndimage.gaussian_filter(rng.standard_normal(hq.shape), 32)
        return (m / max(m.std(), 1e-9)).astype(np.float32)

    tr = 1.0 + 0.06 * coast + 0.05 * (1 - wet_q) - 0.03 * south + 0.05 * tnoise()
    tg = 1.0 + 0.06 * wet_q + 0.04 * south - 0.02 * coast + 0.05 * tnoise()
    tb = 1.0 - 0.03 * wet_q + 0.02 * coast + 0.04 * tnoise()
    tint = np.stack([tr, tg, tb], -1).clip(0.0, 2.0)
    Image.fromarray((tint * 127.5).astype(np.uint8)).save(STUDIO_DIR / "ground-tint.png")
    meta = {
        "originFullPx": [int(fx0), int(fy0)],
        "originM": [round(fx0 * RAW_M, 1), round(fy0 * RAW_M, 1)],
        "metresPerPixel": RAW_M * 2,
        "imageWidth": int(q.shape[1]), "imageHeight": int(q.shape[0]),
        "heightMinMetres": lo, "heightMaxMetres": hi,
        "basinLabels": sorted(labels),
        "extentKm": [round(q.shape[1] * RAW_M * 2 / 1000, 2), round(q.shape[0] * RAW_M * 2 / 1000, 2)],
        "groundControl": "ground-control.png",
        "note": "true metres, no vertical bake (x4 applied in the studio, 0006); pass 2 in progress - no collision/LOD/chunking yet",
    }
    (STUDIO_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
