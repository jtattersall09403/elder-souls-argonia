"""Phase 6b base-terrain sculpting: orogeny + character-scale naturalness.

Runs ONCE on the conditioned full-resolution heightfield and writes the
authoritative sculpted base (`heightfield-sculpted-f32.npy`) that hydrology,
refinement and chunking then consume (condition.base_terrain). Two jobs
(decision 0015; research: docs/research/world-terrain/mountain-terrain-synthesis.md):

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
   shape_province and carve_province, so they cannot be erased.

Deterministic (fixed seed). All heights true metres, image orientation.

Usage:
  python3 -m worldgen.sculpt_province <heightfield-f32.npy> [--report-only]
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from .carve_routes import carve_source
from .condition import condition, interiorness
from .fastfilter import gaussian
from .hydrology import d8_flow, fill_depressions, ocean_mask, resolve_flats, sea_connected
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
BENCH_MIN_Z = 45.0            # no benching below (Phase 16b: was 110 — the
                              # foothill faces between 45 and 110 m read as
                              # smooth grey; C5 in the phase plan)
BENCH_BAND_VARY = 0.40        # band spacing varies by +-this fraction over ~250 m
BENCH_VARY_SIGMA = 140.0      # ...so ledges are not evenly spaced strata
BENCH_MIN_SLOPE = 0.55        # only faces steeper than ~29 deg
BENCH_WARP_M = 18.0           # strata surfaces undulate, not level planes
# Full-res crag texture on steep mountain faces (ridged noise, metres).
CRAG_AMP_M = 5.0
CRAG_MIN_SLOPE = 0.35
# Erosion pits (Phase 16b, ruling 2): above PIT_MIN_Z a closed depression
# smaller than PIT_KEEP_AREA_M2 is filled to its spill; what survives is a
# tarn the hydrology graph names (>= 1 ha, hydrology_graph.LAKE_MIN_M2).
PIT_MIN_Z = 30.0              # = hydrology_graph.LOWLAND_MAX_M: lowland pools are marsh, not pits
PIT_KEEP_AREA_M2 = 10_000.0

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
# Coastal shelf steps (Phase 16b). The source heightmap's quantised lowland
# shelves meet the sea as a single-sample wall (-0.05 m beside 13.5 m at The
# Break); the water graph then measures a "waterfall" wherever a creek drops
# off one. Only real relief makes a fall (owner, 2026-09-11), so a low bank
# that steps straight into sea-level water is ramped down to the shore at
# COAST_BANK_GRADE. A bank taller than COAST_BANK_MAX_Z is a sea cliff and is
# kept: that is the coast's drama, and a river over it is a real fall.
COAST_BANK_MAX_Z = 15.0       # = hydrology_graph.SUSPECT_FALL_LIP_M
COAST_BANK_STEP_M = 2.0       # a sample-to-sample drop into the sea taller than this
COAST_BANK_GRADE = 0.35       # the ramp: rise over run (~19 deg, a steep beach)
COAST_BANK_REACH_M = 60.0     # how far inland the ramp may reach from the step

REPO_ROOT = Path(__file__).resolve().parents[3]
# The road corridors the uplift is suppressed along. A FROZEN input
# (`carve-inputs/sculpt-corridors.json`, seeded once from the published
# network and never re-promoted by `carve_routes --promote`): the published
# `routes.json` is rewritten by `reroute_majors` from the ground this very
# stage shapes, and reading it here was the chain's last live cycle (Phase 16b,
# decision 0059). Re-seeding it is a deliberate act: delete the file, re-sculpt.
SCULPT_CORRIDORS = "sculpt-corridors.json"
ANCHORS_JSON = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"


def _noise(shape, sigma, rng):
    n = gaussian(rng.standard_normal(shape, dtype=np.float32), sigma)
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
    routes_json = carve_source(SCULPT_CORRIDORS)
    if routes_json is not None:
        hard = np.zeros(shape, dtype=bool)
        for route in json.loads(routes_json.read_text()).get("routes", []):
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
    slope = gaussian(slope, 3.0)
    strata_on = 0.5 + 0.5 * _noise(z.shape, 90.0, rng)   # patchy, not everywhere
    w = (_smoothstep(BENCH_MIN_Z, BENCH_MIN_Z + 60.0, z)
         * _smoothstep(BENCH_MIN_SLOPE, BENCH_MIN_SLOPE + 0.25, slope)
         * envelope_full * np.clip(strata_on, 0.0, 1.0))
    warp = BENCH_WARP_M * _noise(z.shape, 60.0, rng)
    # the vertical spacing between ledges wanders: real strata thin and thicken
    band = BENCH_BAND_M * (1.0 + BENCH_BAND_VARY * np.clip(_noise(z.shape, BENCH_VARY_SIGMA, rng), -1.0, 1.0))
    phase = (z + warp) / band
    push = -np.sin(2.0 * np.pi * phase) * (band / (2.0 * np.pi))
    return (z + BENCH_STRENGTH * w * push).astype(np.float32), slope


def crag(z, envelope_full, slope, rng):
    """Ridged-noise rock texture on steep mountain faces."""
    r = 1.0 - np.abs(_noise(z.shape, 3.0, rng))
    r += 0.6 * (1.0 - np.abs(_noise(z.shape, 8.0, rng)))
    r = np.clip(r / 1.6 - 0.5, -1.2, 1.0).astype(np.float32)  # cap gaussian tails
    w = envelope_full * _smoothstep(CRAG_MIN_SLOPE, CRAG_MIN_SLOPE + 0.3, slope)
    return (z + CRAG_AMP_M * w * r).astype(np.float32)


def coastal_banks(z, coast_ok, log=print):
    """Ramp low quantised shelves that step straight into sea-level water.

    Returns (z, step cells found, step cells left). A cell is a step when it
    stands under COAST_BANK_MAX_Z, touches water below 0 and drops more than
    COAST_BANK_STEP_M into it in one sample. Within COAST_BANK_REACH_M of a
    step the ground is lowered to at most COAST_BANK_GRADE x its distance from
    the water (only ever lowered, the coast guard band untouched), so the
    shelf becomes a slope that meets the shore.
    """
    sea = sea_connected(z) & (z < 0.0)
    lo = ndimage.minimum_filter(z, size=3)
    touches = ndimage.binary_dilation(sea, iterations=1) & ~sea
    step = touches & (z - lo > COAST_BANK_STEP_M) & (z < COAST_BANK_MAX_Z)
    n_before = int(step.sum())
    if not n_before:
        return z, 0, 0
    reach_px = max(int(round(COAST_BANK_REACH_M / RAW_M)), 1)
    zone = ndimage.binary_dilation(step, iterations=reach_px) & ~sea & (z < COAST_BANK_MAX_Z + 1.0)
    d_sea = (ndimage.distance_transform_edt(~sea) * RAW_M).astype(np.float32)
    ramp = (COAST_BANK_GRADE * d_sea).astype(np.float32)
    target = np.minimum(z, ramp)
    z = np.where(zone, z + coast_ok * (target - z), z).astype(np.float32)
    lo = ndimage.minimum_filter(z, size=3)
    left = int((touches & (z - lo > COAST_BANK_STEP_M) & (z < COAST_BANK_MAX_Z)).sum())
    log(f"  coastal banks: {n_before} shelf-step cells ramped over {int(zone.sum())} cells, {left} left")
    return z, n_before, left


def naturalness(z, envelope_full, rng, log=print):
    """De-terracing + region-proxy-weighted undulation, coast-guarded."""
    # LANDFORM slope (sigma 8 px ~ 15 m), not texture slope: fine steps and
    # noise read as "steep" at texel scale, which made bumpy ground protect
    # itself from its own de-terracing.
    gy, gx = np.gradient(gaussian(z, 8.0), RAW_M)
    slope0 = np.hypot(gy, gx).astype(np.float32)
    del gy, gx
    coast_ok = _smoothstep(COAST_GUARD_M * 0.5, COAST_GUARD_M, np.abs(z))
    z, _, _ = coastal_banks(z, coast_ok, log=log)
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
    target = gaussian(z, 6.0)
    target_marsh = gaussian(z, 11.0)
    marsh_zone = _smoothstep(10.0, 6.0, z)
    target = target + marsh_zone * (target_marsh - target)
    del target_marsh, marsh_zone
    z = (z + (plateau * w_flat) * (target - z)).astype(np.float32)
    log(f"  naturalness: plateau zone {float((plateau > 0.5).mean()) * 100:.1f}% of map")
    del plateau, target
    for _ in range(DETERRACE_ITERS):
        sm = gaussian(z, 2.0)
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
    # The pit fill drains only to sea-CONNECTED water: the source has a
    # below-sea data hole inside 97 m terrain by Zuuk (2654, 48), and calling
    # it "sea" kept it out of the fill and shipped a 99 m deep pond (Phase 16b).
    # Every other below-sea cell keeps its bathymetry as before (the lowland's
    # sea-level marsh hollows are water, not land to be lifted).
    from .pits import fill_small_high_pits
    drain = sea_connected(full_conditioned) & sea
    z, pit_report = fill_small_high_pits(z, drain, PIT_MIN_Z, PIT_KEEP_AREA_M2, RAW_M, log=log)

    report = {
        "summitM": round(float(z.max()), 1),
        "baseMaxM": round(base_max, 1),
        "upliftAreaFraction": round(float((env_c > 0.5).mean()), 4),
        "meanAbsDeltaOutsideEnvelopeM": round(float(
            np.abs(z - full_conditioned)[env_full < 0.02].mean()), 3),
        "maxAbsDeltaOutsideEnvelopeM": round(float(
            np.abs(z - full_conditioned)[env_full < 0.02].max()), 2),
        "pits": pit_report,
    }
    return z, report
