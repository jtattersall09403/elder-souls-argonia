"""Phase 6b base-terrain sculpting: orogeny + character-scale naturalness.

Runs ONCE on the conditioned full-resolution heightfield and writes the
authoritative sculpted base (`heightfield-sculpted-f32.npy`) that hydrology,
refinement and chunking then consume (condition.base_terrain). Two jobs
(decision 0015; research: docs/research/mountain-terrain-synthesis.md):

1. **Orogeny** — dramatic-but-plausible border mountains. Uplift confined to
   a mask over the existing border belts (weighted toward the source prior's
   own ridges so the canon macro-shape survives), dissected by stream-power
   fluvial erosion (Braun & Willett implicit solver over the D8 flow tree) so
   dendritic valleys, gorges and interfluves emerge with plausible drainage;
   thermal erosion lays talus below the crags; structural benching steps the
   steep faces into cliff bands separated by walkable ledges (POI shelves,
   climb targets). Road-corridor and anchor masks suppress uplift so passes
   stay traversable — the route solver then re-solves on the result.
2. **Naturalness** — province-wide, amplitude-bounded: FPDEMS-style
   step-selective de-terracing removes the source's VHGT quantisation
   staircase on gentle ground while preserving real banks and cliffs; gentle
   region-proxy-weighted undulation gives rolling ground its swell (marsh
   stays near-flat with subtle hummocks; mountains get crag, not swell).
   The waterline band |z| < COAST_GUARD_M is untouched (coastline stable),
   and authored/simulated channels are carved AFTER this stage by
   refine_province, so they cannot be erased.

Deterministic (fixed seed). All heights true metres, image orientation.

Usage:
  python3 -m worldgen.sculpt_province <heightfield-f32.npy> [--report-only]
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from .condition import condition, interiorness
from .hydrology import d8_flow, fill_depressions, ocean_mask, resolve_flats
from .scale import RAW_M

SEED = 20260824
STEP = 3                      # simulation grid = full res / 3 (hydrology res)

# --- Orogeny -----------------------------------------------------------------
SUMMIT_TARGET_M = 650.0       # tallest summit after sculpting (owner gate tunes)
MASK_MIN_Z = 32.0             # border-belt prior: high ground …
MASK_MAX_INTERIOR = 0.42      # … near the map border (interiorness < this)
MASK_FEATHER_M = 900.0        # uplift envelope feather beyond the belt core
RIDGE_FLOOR = 0.30            # uplift share independent of existing relief
EROSION_STEPS = 36
ROUTING_EVERY = 6             # recompute flow tree every N erosion steps
DT = 1.0
K_FLUVIAL = 0.0026            # stream-power constant (E = K·sqrt(A)·S per step)
K_LOWLAND_FRACTION = 0.10     # erosion outside the uplift envelope
TALUS_TAN = 0.78              # ~38 deg repose angle for coarse talus pass
TALUS_ITERS = 10
# Full-res relaxation cap (~49 deg): the steepest angle loose debris is left
# resting at after benching. Ground BETWEEN ~0.8*TALUS_TAN and this is
# debris-mantled; steeper than this is structural rock face. landcover.py
# reads both to paint scree without inventing a second slope threshold.
TALUS_FULL_TAN = 1.15
# Passes and anchors: uplift is suppressed and erosion boosted along the
# Phase 4 road corridors crossing the belts, and around settlement anchors.
CORRIDOR_HALF_W_M = 140.0
CORRIDOR_UPLIFT_KEEP = 0.12
ANCHOR_CLEAR_M = 320.0
# Structural benching (full res): strata bands on steep high faces.
BENCH_BAND_M = 26.0           # vertical distance between cliff bands
BENCH_STRENGTH = 0.34         # 0..~0.5: tread flattening / riser steepening
BENCH_MIN_Z = 110.0           # no benching below (foothills stay fluid)
BENCH_MIN_SLOPE = 0.55        # only faces steeper than ~29 deg
BENCH_WARP_M = 18.0           # strata surfaces undulate, not level planes
# Full-res crag texture on steep mountain faces (ridged noise, metres).
CRAG_AMP_M = 5.0
CRAG_MIN_SLOPE = 0.35

# --- Naturalness -------------------------------------------------------------
DETERRACE_ITERS = 4
DETERRACE_STEP_M = 0.34       # residuals below this are quantisation steps …
DETERRACE_KEEP_M = 0.55       # … above this they are real banks: untouched
DETERRACE_RATE = 0.62
UNDULATION = (                # (gaussian sigma px @ full res, amplitude m)
    (48.0, 1.5),              # ~150 m rolling swell
    (18.0, 0.7),              # ~60 m secondary swell
)
MARSH_UND_FRACTION = 0.15     # low flat ground keeps only hummock-scale swell
COAST_GUARD_M = 0.8           # |z| below this: untouched (coastline stable)

REPO_ROOT = Path(__file__).resolve().parents[3]
ROUTES_JSON = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "routes.json"
ANCHORS_JSON = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"


def _noise(shape, sigma, rng):
    n = ndimage.gaussian_filter(rng.standard_normal(shape, dtype=np.float32), sigma)
    return (n / max(n.std(), 1e-9)).astype(np.float32)


def _smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def uplift_envelope(z, m_per_px):
    """0..1 uplift envelope over the border-mountain belts, feathered."""
    interior = interiorness(*z.shape)
    core = (z > MASK_MIN_Z) & (interior < MASK_MAX_INTERIOR)
    core = ndimage.binary_closing(core, iterations=3)
    core = ndimage.binary_opening(core, iterations=2)
    d_out = ndimage.distance_transform_edt(~core) * m_per_px
    return _smoothstep(1.0, 0.0, d_out / MASK_FEATHER_M).astype(np.float32), core


def corridor_and_anchor_mask(shape, m_per_px):
    """1 where uplift must stay suppressed (road corridors, anchors), feathered."""
    mask = np.zeros(shape, dtype=np.float32)
    half_px = max(int(CORRIDOR_HALF_W_M / m_per_px), 2)
    if ROUTES_JSON.exists():
        hard = np.zeros(shape, dtype=bool)
        for route in json.loads(ROUTES_JSON.read_text()).get("routes", []):
            for (x0, y0), (x1, y1) in zip(route.get("px", []), route.get("px", [])[1:]):
                n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
                xs = np.clip(np.linspace(x0, x1, n).round().astype(int), 0, shape[1] - 1)
                ys = np.clip(np.linspace(y0, y1, n).round().astype(int), 0, shape[0] - 1)
                hard[ys, xs] = True
        d = ndimage.distance_transform_edt(~hard)
        mask = np.maximum(mask, _smoothstep(2.0, 0.4, d / half_px).astype(np.float32))
    if ANCHORS_JSON.exists():
        pts = np.zeros(shape, dtype=bool)
        for a in json.loads(ANCHORS_JSON.read_text())["anchors"]:
            pts[int(a["v"] * (shape[0] - 1)), int(a["u"] * (shape[1] - 1))] = True
        d = ndimage.distance_transform_edt(~pts) * m_per_px
        mask = np.maximum(mask, _smoothstep(ANCHOR_CLEAR_M * 1.6, ANCHOR_CLEAR_M * 0.5, d).astype(np.float32))
    return mask


def _routing(z, ocean, cell_km2):
    """(flow_to flat idx, drainage area km^2, topo order high->low)."""
    drain = resolve_flats(fill_depressions(z, ocean), ocean)
    flow_to = d8_flow(drain, ocean)
    order = np.argsort(drain, axis=None)[::-1]
    acc = np.full(z.size, cell_km2, dtype=np.float32)
    acc[ocean.reshape(-1)] = 0.0
    ocean_flat = ocean.reshape(-1)
    for i in order:
        j = flow_to[i]
        if j >= 0 and not ocean_flat[i]:
            acc[j] += acc[i]
    return flow_to, acc, order


def erode(z0, ocean, uplift_m_per_step, k_field, m_per_px, log=print):
    """Stream-power fluvial erosion with uplift (implicit Braun & Willett)."""
    z = z0.astype(np.float64).copy()
    cell_km2 = (m_per_px / 1000.0) ** 2
    sqrt_a = None
    h, w = z.shape
    up_flat = uplift_m_per_step.reshape(-1)
    k_flat = k_field.reshape(-1)
    ocean_flat = ocean.reshape(-1)
    yy, xx = np.divmod(np.arange(z.size), w)
    for step in range(EROSION_STEPS):
        if step % ROUTING_EVERY == 0:
            flow_to, acc, order_desc = _routing(z.reshape(h, w).astype(np.float32), ocean, cell_km2)
            sqrt_a = np.sqrt(acc * 1e6)          # sqrt of drainage area in m^2
            ry, rx = np.divmod(np.maximum(flow_to, 0), w)
            dist_m = np.hypot(yy - ry, xx - rx) * m_per_px
            dist_m[flow_to < 0] = m_per_px
            order_asc = order_desc[::-1]         # low->high: receivers first
            f = DT * k_flat * sqrt_a / np.maximum(dist_m, 1e-6)
        zf = z.reshape(-1)
        zf += DT * up_flat
        # implicit solve in upstream order: receiver height is already final
        for i in order_asc:
            j = flow_to[i]
            if j < 0 or ocean_flat[i]:
                continue
            fi = f[i]
            if fi > 0.0:
                zf[i] = (zf[i] + fi * zf[j]) / (1.0 + fi)
        z = zf.reshape(h, w)
        if step % ROUTING_EVERY == ROUTING_EVERY - 1:
            log(f"  erosion step {step + 1}/{EROSION_STEPS}: max {z.max():.0f} m")
    return z.astype(np.float32)


def thermal(z, active, tan_repose, m_per_px, iters):
    """Capped-transfer thermal erosion (talus), masked to `active` cells."""
    z = z.copy()
    max_drop = tan_repose * m_per_px
    for _ in range(iters):
        moved = np.zeros_like(z)
        for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
            a = z[max(0, -dy):z.shape[0] - max(0, dy) or None,
                  max(0, -dx):z.shape[1] - max(0, dx) or None]
            b = z[max(0, dy):z.shape[0] - max(0, -dy) or None,
                  max(0, dx):z.shape[1] - max(0, -dx) or None]
            dist = np.hypot(dy, dx)
            diff = a - b
            excess = (np.abs(diff) - max_drop * dist)
            move = np.sign(diff) * np.clip(excess, 0.0, None) * 0.25  # <= H/2 cap
            am = active[max(0, -dy):z.shape[0] - max(0, dy) or None,
                        max(0, -dx):z.shape[1] - max(0, dx) or None]
            bm = active[max(0, dy):z.shape[0] - max(0, -dy) or None,
                        max(0, dx):z.shape[1] - max(0, -dx) or None]
            move = move * (am & bm)
            a -= move
            b += move
            del a, b
        del moved
    return z


def bench(z, envelope_full, rng):
    """Structural benching: step steep high faces into strata cliff bands."""
    gy, gx = np.gradient(z, RAW_M)
    slope = np.hypot(gx, gy).astype(np.float32)
    del gy, gx
    slope = ndimage.gaussian_filter(slope, 3.0)
    strata_on = 0.5 + 0.5 * _noise(z.shape, 90.0, rng)   # patchy, not everywhere
    w = (_smoothstep(BENCH_MIN_Z, BENCH_MIN_Z + 60.0, z)
         * _smoothstep(BENCH_MIN_SLOPE, BENCH_MIN_SLOPE + 0.25, slope)
         * envelope_full * np.clip(strata_on, 0.0, 1.0))
    warp = BENCH_WARP_M * _noise(z.shape, 60.0, rng)
    phase = (z + warp) / BENCH_BAND_M
    push = -np.sin(2.0 * np.pi * phase) * (BENCH_BAND_M / (2.0 * np.pi))
    return (z + BENCH_STRENGTH * w * push).astype(np.float32), slope


def crag(z, envelope_full, slope, rng):
    """Ridged-noise rock texture on steep mountain faces."""
    r = 1.0 - np.abs(_noise(z.shape, 3.0, rng))
    r += 0.6 * (1.0 - np.abs(_noise(z.shape, 8.0, rng)))
    r = np.clip(r / 1.6 - 0.5, -1.2, 1.0).astype(np.float32)  # cap gaussian tails
    w = envelope_full * _smoothstep(CRAG_MIN_SLOPE, CRAG_MIN_SLOPE + 0.3, slope)
    return (z + CRAG_AMP_M * w * r).astype(np.float32)


def naturalness(z, envelope_full, rng, log=print):
    """De-terracing + region-proxy-weighted undulation, coast-guarded."""
    # LANDFORM slope (sigma 8 px ~ 15 m), not texture slope: fine steps and
    # noise read as "steep" at texel scale, which made bumpy ground protect
    # itself from its own de-terracing.
    gy, gx = np.gradient(ndimage.gaussian_filter(z, 8.0), RAW_M)
    slope0 = np.hypot(gy, gx).astype(np.float32)
    del gy, gx
    coast_ok = _smoothstep(COAST_GUARD_M * 0.5, COAST_GUARD_M, np.abs(z))
    # smoothing weight: strong on low, gentle ground; weak on steeps/mountains
    w_flat = (np.clip(1.0 - (z - 8.0) / 45.0, 0.25, 1.0)
              * _smoothstep(0.14, 0.04, slope0)
              * (1.0 - 0.8 * envelope_full) * coast_ok).astype(np.float32)
    # PLATEAU de-terracing: the source lowland is bitwise-flat shelves for
    # tens of metres broken by single-sample metre-plus walls. Real ground is
    # never exactly flat, so exact-equality flatness IS the artefact — detect
    # it and ramp the risers over ~20 m. Amplitude-based rules can't do this
    # (a 2.8 m riser looks like a real bank); the pattern can.
    flat3 = (np.abs(z - ndimage.uniform_filter(z, 3)) < 2e-3).astype(np.float32)
    plateau = _smoothstep(0.25, 0.55, ndimage.uniform_filter(flat3, 9))
    del flat3
    # marsh zone ramps over ~2x the distance: a 3 m wall smoothed over ~20 m
    # is a 14% grade that broke the wetland classifier's slope limit and
    # fragmented the approved marsh — over ~35 m it stays classifier-wet
    target = ndimage.gaussian_filter(z, 6.0)
    target_marsh = ndimage.gaussian_filter(z, 11.0)
    marsh_zone = _smoothstep(10.0, 6.0, z)
    target = target + marsh_zone * (target_marsh - target)
    del target_marsh, marsh_zone
    z = (z + (plateau * w_flat) * (target - z)).astype(np.float32)
    log(f"  naturalness: plateau zone {float((plateau > 0.5).mean()) * 100:.1f}% of map")
    del plateau, target
    for _ in range(DETERRACE_ITERS):
        sm = ndimage.gaussian_filter(z, 2.0)
        resid = z - sm
        steplike = 1.0 - _smoothstep(DETERRACE_STEP_M, DETERRACE_KEEP_M, np.abs(resid))
        z = (z - DETERRACE_RATE * w_flat * steplike * resid).astype(np.float32)
    # undulation: rolling ground swells, marsh keeps hummock-scale only
    rolling = (_smoothstep(5.0, 14.0, z) * np.clip(1.0 - (z - 55.0) / 60.0, 0.0, 1.0)
               * _smoothstep(0.16, 0.05, slope0) * (1.0 - 0.85 * envelope_full))
    marsh = _smoothstep(14.0, 5.0, z) * _smoothstep(0.10, 0.02, slope0)
    und = np.zeros_like(z)
    for sigma, amp in UNDULATION:
        und += amp * _noise(z.shape, sigma, rng)
    total_amp = sum(a for _, a in UNDULATION)
    und = np.clip(und, -1.5 * total_amp, 1.5 * total_amp)  # cap gaussian tails
    z = (z + rolling * coast_ok * und).astype(np.float32)
    # marsh hummocks rise ABOVE the water table — symmetric swell ponded the
    # flats (anything >0.15 m deep classifies as standing water) and dragged
    # the approved wetland/lake/salinity fractions; dips are kept slight
    marsh_und = np.where(und > 0, und, 0.2 * und)
    z = (z + MARSH_UND_FRACTION * marsh * coast_ok * marsh_und).astype(np.float32)
    log(f"  naturalness: deterrace weight mean {w_flat.mean():.2f}, "
        f"undulation amp mean {((rolling + MARSH_UND_FRACTION * marsh) * coast_ok * total_amp).mean():.2f} m")
    return z


def sculpt(full_conditioned, rng, log=print):
    """Full pipeline: returns (sculpted full-res heights, report dict)."""
    hf, wf = full_conditioned.shape
    zc = full_conditioned[::STEP, ::STEP].copy()
    m_c = RAW_M * STEP
    ocean_c, _ = ocean_mask(zc, m_c)

    env_c, core_c = uplift_envelope(zc, m_c)
    env_c[ocean_c] = 0.0            # never uplift the sea floor
    protect = corridor_and_anchor_mask(zc.shape, m_c)
    env_eff = env_c * (1.0 - (1.0 - CORRIDOR_UPLIFT_KEEP) * protect)

    # uplift budget: erosion takes a share, then delta is renormalised anyway
    ridge_w = RIDGE_FLOOR + (1.0 - RIDGE_FLOOR) * np.clip((zc - 25.0) / 90.0, 0.0, 1.0)
    base_max = float(zc.max())
    budget = (SUMMIT_TARGET_M - base_max) * 1.5   # erosion eats ~1/3
    uplift = (env_eff * ridge_w * (budget / EROSION_STEPS)).astype(np.float32)
    k_field = (K_FLUVIAL * (K_LOWLAND_FRACTION + (1.0 - K_LOWLAND_FRACTION) * env_c)
               * (1.0 + 1.6 * protect)).astype(np.float32)
    log(f"  uplift envelope: {float((env_c > 0.5).mean()) * 100:.1f}% of map, "
        f"budget {budget:.0f} m over {EROSION_STEPS} steps")

    z_or = erode(zc, ocean_c, uplift, k_field, m_c, log=log)
    z_or = thermal(z_or, env_c > 0.2, TALUS_TAN, m_c, TALUS_ITERS)

    # renormalise the mountain delta to hit the summit target exactly
    delta_c = z_or - zc
    peak = float((zc + delta_c).max())
    if peak > base_max + 1.0:
        delta_c *= (SUMMIT_TARGET_M - base_max) / (peak - base_max)
    # containment: nothing outside the envelope feather
    delta_c *= _smoothstep(0.0, 0.05, env_c)

    delta_full = ndimage.zoom(delta_c, (hf / delta_c.shape[0], wf / delta_c.shape[1]), order=3)
    env_full = ndimage.zoom(env_c, (hf / env_c.shape[0], wf / env_c.shape[1]), order=1)
    z = (full_conditioned + delta_full).astype(np.float32)
    del delta_full, delta_c, z_or

    rng2 = np.random.default_rng(SEED + 1)
    z, slope = bench(z, env_full, rng2)
    z = crag(z, env_full, slope, rng2)
    del slope
    # light full-res talus so benched knife-edges relax into rock, not spikes
    z = thermal(z, env_full > 0.3, TALUS_FULL_TAN, RAW_M, 4)
    z = naturalness(z, env_full, rng2, log=log)
    # sea-floor guarantee: no orogeny bleed underwater (an upsampled mountain
    # delta at a coastal belt raised near-shore floor into a wall). Sea cells
    # keep their base bathymetry plus at most a small naturalness delta, and
    # never surface — the waterline cannot move.
    sea = full_conditioned < -0.05
    z[sea] = np.minimum(full_conditioned[sea] + np.clip(z[sea] - full_conditioned[sea], -2.5, 2.5), -0.05)

    report = {
        "summitM": round(float(z.max()), 1),
        "baseMaxM": round(base_max, 1),
        "upliftAreaFraction": round(float((env_c > 0.5).mean()), 4),
        "meanAbsDeltaOutsideEnvelopeM": round(float(
            np.abs(z - full_conditioned)[env_full < 0.02].mean()), 3),
        "maxAbsDeltaOutsideEnvelopeM": round(float(
            np.abs(z - full_conditioned)[env_full < 0.02].max()), 2),
    }
    return z, report
