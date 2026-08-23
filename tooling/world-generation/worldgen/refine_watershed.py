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
FEEDER_SECTORS = {  # canon: rivers from NE (Murkwood), W (Blackwood), S (Oliis Bay)
    "ne": (20, 80), "w": (150, 225), "s": (250, 300)
}
FEEDER_HALF_W_M = 28.0
FEEDER_DEPTH_M = 3.2

REPO_ROOT = Path(__file__).resolve().parents[3]
STUDIO_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "basin"


def detail_noise(shape, regions_up, channel_dist_m, rng):
    field = np.zeros(shape, dtype=np.float32)
    for sigma, weight in ((32, 1.0), (8, 0.45), (2, 0.18)):
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


def carve_polyline(h, p0, p1, half_w_m, depth_m, rng):
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
    h -= (depth_m * np.exp(-((d / half_w_m) ** 2))).astype(np.float32)
    return h


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
    # three feeder channels toward canon directions: connect to nearest river
    # cell in each sector, else carve ~2 km outward anyway
    riv_ys, riv_xs = np.where(rivers_up > 0)
    ang = np.degrees(np.arctan2(-(riv_ys - cy_full), riv_xs - cx_full)) % 360
    dist = np.hypot(riv_ys - cy_full, riv_xs - cx_full) * RAW_M
    rim = np.array([LAKE_RADII_M[0], LAKE_RADII_M[1]]).mean() / RAW_M
    for name, (a0, a1) in FEEDER_SECTORS.items():
        sel = (ang >= a0) & (ang <= a1) & (dist > rim * RAW_M * 1.1) & (dist < 3000)
        if sel.any():
            i = np.argmin(np.where(sel, dist, np.inf))
            target = (riv_xs[i], riv_ys[i])
        else:
            mid = np.radians((a0 + a1) / 2)
            target = (cx_full + np.cos(mid) * 2000 / RAW_M, cy_full - np.sin(mid) * 2000 / RAW_M)
        start = (cx_full + (target[0] - cx_full) * rim / max(np.hypot(target[0] - cx_full, target[1] - cy_full), 1e-9),
                 cy_full + (target[1] - cy_full) * rim / max(np.hypot(target[0] - cx_full, target[1] - cy_full), 1e-9))
        h = carve_polyline(h, start, target, FEEDER_HALF_W_M, FEEDER_DEPTH_M, rng)
    return h


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
    # full-res crop aligned to the 3x macro grid
    fy0, fy1, fx0, fx1 = cy0 * STEP, min(cy1 * STEP, full.shape[0]), cx0 * STEP, min(cx1 * STEP, full.shape[1])
    h = full[fy0:fy1, fx0:fx1].copy()
    up = lambda a: np.repeat(np.repeat(a[cy0:cy1, cx0:cx1], STEP, 0), STEP, 1)[: h.shape[0], : h.shape[1]]
    rivers_up, regions_up = up(rivers), up(regions)

    rng = np.random.default_rng(SEED)
    h, channel_dist = carve_channels(h, rivers_up)
    h += detail_noise(h.shape, regions_up, channel_dist, rng)
    h = impose_blackrose_lake(h, (fy0, fx0), rivers_up, rng)

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

    # Splatmaps for Skyrim ground textures. splat.png RGBA = grass/marsh/rock/
    # mud; splat2.png = jungle (R), shore sand (G), macro brightness mottle (B).
    # Weights come from region classes, water/channel proximity, slope — plus a
    # medium-scale noise that mottles grass<->marsh so no material reads as one
    # continuous carpet (owner feedback: the basin looked like a single texture).
    reg_h = regions_up[::2, ::2][: half.shape[0], : half.shape[1]]
    dist_h = channel_dist[::2, ::2][: half.shape[0], : half.shape[1]]
    gy2, gx2 = np.gradient(half, RAW_M * 2)
    slope_h = np.hypot(gx2, gy2)
    mottle = ndimage.gaussian_filter(rng.standard_normal(half.shape), 8)
    mottle /= max(mottle.std(), 1e-9)
    water_dist = ndimage.distance_transform_edt(half >= 0) * RAW_M * 2  # to any water

    # Per-region-class material palette — the semantic link the plan's §16
    # RegionGrammar.materialPalette describes. Base mixes per ecological class;
    # physical modifiers (slope, channels, shorelines) and mottle layer on top.
    # Channel order: grass, marsh, rock, mud, jungle, sand.
    PALETTE = {
        0:  (0.00, 0.00, 0.00, 0.70, 0.00, 0.30),  # ocean floor
        1:  (0.15, 0.00, 0.80, 0.05, 0.00, 0.00),  # border mountains
        2:  (0.50, 0.05, 0.45, 0.00, 0.00, 0.00),  # upland hills
        3:  (0.05, 0.35, 0.00, 0.25, 0.00, 0.35),  # tidal delta
        4:  (0.10, 0.45, 0.00, 0.20, 0.00, 0.25),  # lagoon & salt marsh
        5:  (0.45, 0.25, 0.00, 0.30, 0.00, 0.00),  # deep river corridor
        6:  (0.05, 0.70, 0.00, 0.15, 0.10, 0.00),  # rootland deep marsh
        7:  (0.10, 0.65, 0.00, 0.15, 0.10, 0.00),  # interior swamp
        8:  (0.30, 0.55, 0.00, 0.15, 0.00, 0.00),  # fringe marsh
        9:  (0.55, 0.30, 0.00, 0.15, 0.00, 0.00),  # seasonal floodplain
        10: (0.55, 0.05, 0.15, 0.00, 0.25, 0.00),  # raised hammock
        11: (0.80, 0.10, 0.05, 0.05, 0.00, 0.00),  # firm lowland
        12: (0.00, 0.30, 0.00, 0.70, 0.00, 0.00),  # lake bed
        13: (0.20, 0.00, 0.00, 0.10, 0.70, 0.00),  # tropical jungle
    }
    stack = np.zeros((*half.shape, 6), dtype=np.float32)
    for cid, weights in PALETTE.items():
        stack[reg_h == cid] = weights
    # physical modifiers
    stack[..., 2] = np.maximum(stack[..., 2], np.clip((slope_h - 0.10) / 0.18, 0, 1))       # steep -> rock
    stack[..., 3] = np.maximum(stack[..., 3], np.clip(1.0 - dist_h / 45.0, 0, 1))           # channels -> mud
    stack[..., 3] = np.maximum(stack[..., 3], (half < -0.3).astype(np.float32))             # beds -> mud
    stack[..., 5] = np.maximum(stack[..., 5], ((np.abs(half - 0.3) < 1.0) & (water_dist < 40)).astype(np.float32) * 0.8)  # shorelines -> sand
    # mottle: shift grass<->marsh and thin the jungle so nothing is a carpet
    shift = 0.25 * mottle
    stack[..., 0] = np.clip(stack[..., 0] - shift * (stack[..., 1] > 0.1), 0, 1)
    stack[..., 1] = np.clip(stack[..., 1] + shift * (stack[..., 1] > 0.1), 0, 1)
    stack[..., 4] *= np.clip(1.0 + 0.4 * mottle, 0.4, 1.3)
    stack = ndimage.gaussian_filter(stack, (1.5, 1.5, 0))
    stack /= np.maximum(stack.sum(-1, keepdims=True), 1e-6)
    Image.fromarray((stack[..., :4] * 255).astype(np.uint8), "RGBA").save(STUDIO_DIR / "splat.png")
    macro = ndimage.gaussian_filter(rng.standard_normal(half.shape), 40)
    macro = (macro / max(macro.std(), 1e-9)).clip(-2, 2) / 4 + 0.5  # 0..1
    splat2 = np.stack([stack[..., 4], stack[..., 5], macro,
                       np.ones_like(macro)], -1)
    Image.fromarray((splat2 * 255).astype(np.uint8), "RGBA").save(STUDIO_DIR / "splat2.png")
    meta = {
        "originFullPx": [int(fx0), int(fy0)],
        "originM": [round(fx0 * RAW_M, 1), round(fy0 * RAW_M, 1)],
        "metresPerPixel": RAW_M * 2,
        "imageWidth": int(q.shape[1]), "imageHeight": int(q.shape[0]),
        "heightMinMetres": lo, "heightMaxMetres": hi,
        "basinLabels": sorted(labels),
        "extentKm": [round(q.shape[1] * RAW_M * 2 / 1000, 2), round(q.shape[0] * RAW_M * 2 / 1000, 2)],
        "note": "true metres, no vertical bake (decision 0006 judged at gate); pass 1 - no collision/LOD/chunking yet",
    }
    (STUDIO_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
