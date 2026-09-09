"""Phase 6: high-detail terrain refinement for the WHOLE province.

Owner decision 2026-08-23 (extends decision 0008): with the Blackrose basin
proven through its gate rounds, the same deterministic refinement now runs
over the full province in one pass — sculpted base (6b), region-conditioned
detail noise, channel carving, the authored Blackrose lake, portage
resolution (0012), land cover (0011 — with northern palette zone, mountain
belts and per-water-type shorelines), flood states, climate tint, and the
production exports (refined heights, land-cover raster; chunks via
worldgen.compile_chunks).

Heights stay TRUE metres (vertical scale applied only where terrain
becomes geometry — ×1, decision 0015).

Usage:
  python3 -m worldgen.refine_province <heightfield-f32.npy> <hydrology-pass1.npz>
"""

from __future__ import annotations

import json
import hashlib
import os
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import ndimage

from .condition import base_terrain
from .landcover import compile_ground_control
from .routes_raster import rasterize_minor_paint
from .scale import RAW_M, TUNE

STEP = 3                               # macro rasters are 1/3 of full res
SEED = 20260823

# Metre-denominated carve/tuning constants below were tuned at x3 and convert
# via scale.TUNE so the approved pixel-space terrain survives rescales (0015).
# Detail-noise amplitude (m) by region class id (vertical — no conversion).
NOISE_AMP = {0: 0.0, 1: 3.0, 2: 2.0, 3: 0.3, 4: 0.3, 5: 0.4, 6: 0.35, 7: 0.35,
             8: 0.4, 9: 0.5, 10: 0.9, 11: 0.8, 12: 0.15, 13: 1.2}
# Floodplain terrace by river band: (half-width m, depth m). This is the WIDE,
# gentle valley the river sits in — NOT the channel. Until 2026-09-07 the same
# 10/22/45 m half-widths were cut to the full depth below, which dug a trough
# two to eight times wider than the river's own hydraulic width and left an
# empty ditch with a rough bed: 297 of 327 reaches were under 95 % wet at peak.
# The depth is now scaled by TERRACE_FRAC so it reads as a shallow valley with
# a bank, and the channel proper is cut TO the water level by carve_to_profile.
CHANNELS = {1: (10.0 * TUNE, 1.4), 2: (22.0 * TUNE, 2.6), 3: (45.0 * TUNE, 4.2)}
TERRACE_FRAC = 0.45
# The channel proper is cut by worldgen.channels (decision 0047): one smooth
# centreline and monotone long profile per reach, shared with compile_water.
CHANNEL_NOISE_FADE_M = 90.0 * TUNE   # detail noise fades within ~2 channel widths
BLACKROSE_UV = (0.32, 0.87)
LAKE_RADII_M = (470.0 * TUNE, 360.0 * TUNE)
LAKE_BED_M = -4.0
ISLAND_R_M = 190.0 * TUNE  # enlarged at the gate: room for a walled island core;
ISLAND_TOP_M = 2.6   # the city spreads over lake boardwalks + shore quarters
# Feeder channels (a0, a1, half-width m, bed level m). Canon: rivers converge
# from NE (Murkwood) and W (Blackwood); the S channel is the lake's outlet
# into Oliis Bay. Feeders carve TO a bed level and START INSIDE the lake
# (rim lip previously blocked two of the three — owner gate report).
FEEDER_SECTORS = {
    "ne": (20, 80, 28.0 * TUNE, -2.2),
    "w": (150, 225, 38.0 * TUNE, -1.8),
    "s": (250, 300, 30.0 * TUNE, -2.8),
}
FEEDER_START_FRAC = 0.55   # start radius as a fraction of the lake rim

REPO_ROOT = Path(__file__).resolve().parents[3]
STUDIO_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "refined"


def _atomic_json(path: Path, value: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, ensure_ascii=False, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def _flow_vectors(flow_to: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    """Decode flattened D8 targets into +X/+Z unit vectors."""
    h, w = shape
    target = np.asarray(flow_to).reshape(h, w)
    source = np.arange(h * w, dtype=np.int64).reshape(h, w)
    valid = target >= 0
    target_safe = np.where(valid, target, source)
    tr, tc = np.divmod(target_safe, w)
    sr, sc = np.indices((h, w))
    dx, dz = (tc - sc).astype(np.float32), (tr - sr).astype(np.float32)
    norm = np.hypot(dx, dz)
    nz = norm > 0
    dx[nz] /= norm[nz]
    dz[nz] /= norm[nz]
    return np.dstack((dx, dz)).astype(np.float32)


def deterrace(h):
    """No-op: real de-terracing now happens in the sculpted base
    (worldgen.sculpt naturalness pass, Phase 6b) — feature-preserving and
    region-weighted, before channels are carved. (History: an earlier smoothing
    chase here turned out to be hunting a texture artefact, not terracing.)"""
    return h


def detail_noise(shape, regions_up, channel_dist_m, rng):
    # Octaves down to ~11 m wavelength: the finest two are the person-scale
    # micro-relief. The σ=1 octave stays subtle (it aliased into moiré at
    # higher weight before the AA'd exports).
    field = np.zeros(shape, dtype=np.float32)
    for sigma, weight in ((32, 1.0), (8, 0.45), (2, 0.30), (1, 0.08)):
        octave = ndimage.gaussian_filter(rng.standard_normal(shape, dtype=np.float32), sigma)
        field += weight * octave / max(octave.std(), 1e-9)
        del octave
    field /= max(field.std(), 1e-9)
    amp = np.zeros(shape, dtype=np.float32)
    for cid, a in NOISE_AMP.items():
        amp[regions_up == cid] = a
    # keep drainage: fade detail out within ~2 channel widths, TO ZERO on the
    # centreline. The old 0.25 floor left up to 0.3 m of noise in the channel
    # core, which is half a band-1 film — the bed has to stay monotone.
    amp *= np.clip(channel_dist_m / CHANNEL_NOISE_FADE_M, 0.0, 1.0)
    return field * amp


def carve_channels(h, rivers_up):
    dist_all = None
    for band, (half_w, depth) in CHANNELS.items():
        mask = rivers_up == band
        if not mask.any():
            continue
        d = (ndimage.distance_transform_edt(~mask) * RAW_M).astype(np.float32)
        h -= (depth * TERRACE_FRAC * np.exp(-((d / half_w) ** 2))).astype(np.float32)
        dist_all = d if dist_all is None else np.minimum(dist_all, d)
    if dist_all is None:
        dist_all = np.full(h.shape, 1e9)
    return h, dist_all


def carve_to_profile(h, npz, save_path=None):
    """Cut every river trench to the channel long profile (decision 0047).

    `channels.solve` builds the smooth centrelines and the monotone profile
    L(s) on THIS terrain (valley floor, bankfull bank, falls as steps);
    `standing_water.pool_channels` backwaters it through the accepted lakes
    (and accepts the hollows a river cannot leave); `channels.carve` cuts the
    parabolic bed to L − D inside the water width, builds the shoulder to
    L + 0.3 and digs the plunge basins. Islets under 12 samples inside a body
    are sunk so pools do not read as speckle. The solution is saved next to the
    heights and compile_water keeps ITS profile (it re-floods the bodies on the
    shipped terrain but never re-solves L): a depression the carve itself made
    (a levee's backswamp, a trench pool) is a body, never a lake that lifts
    the river. A post-carve flood reports pooled stations whose level moved.

    Runs LAST, after the fluvial continuum and the shoreline smoothing.
    """
    from . import channels
    from . import standing_water as sw

    placement = sw.placement_snapshot(h.shape, RAW_M)
    if save_path is not None:
        np.save(Path(save_path).with_name("refined-height-precarve-f32.npy"), h)
    bodies = sw.solve_bodies(h, npz, step=STEP, mpp=RAW_M, placement=placement)
    sol = channels.solve(h, npz, step=STEP, mpp=RAW_M, roads=placement["major_roads"])
    pool_report = sw.pool_channels(sol, bodies, log=print)
    # never cut the rim of a standing body or the sea (a ring cut 6 m + w/2
    # out from a channel that skirts a pool would lower its spill: protect
    # ~16 m) and never raise a bed or a rim (a levee across an outlet dams it)
    water = bodies.wet | bodies.sea
    collar = ndimage.binary_dilation(water, iterations=9) & ~water
    # a CAPTURED lake drains to the channel cut through it: its bed is not
    # protected from the shoulder (the levee beside the channel must seal
    # what will be dry ground)
    body_level = bodies.level_with_sea.copy()
    cap = sol.captured
    if cap.any():
        cy = np.clip(np.round(sol.y[cap]).astype(int), 0, h.shape[0] - 1)
        cx = np.clip(np.round(sol.x[cap]).astype(int), 0, h.shape[1] - 1)
        ids = np.unique(bodies.body[cy, cx])
        ids = ids[ids > 0]
        if len(ids):
            body_level[np.isin(bodies.body, ids)] = -np.inf
    h, stats = channels.carve(h, sol, protect=collar, body_level=body_level)
    h, n_islands = sw.lower_islands(h, bodies)
    # Authored minor waterways are carved, not solved: they are not in the
    # hydrology graph, so nothing else would ever cut them. Geometry and the
    # promise come from world/sources/routes/authored-minor-waterways.json via
    # hydrology_intent (pre-water intent, never a published raster).
    from . import authored_waterways
    h, authored_stats = authored_waterways.carve_authored(
        h, bodies.level_with_sea, bodies.wet | bodies.sea, RAW_M,
        stations=(sol.y, sol.x, sol.L), log=print)
    # A dock declares the deepest hull it serves; a working port keeps the
    # channel that serves it DUG. Every approach that does not already carry
    # its hull class is dredged here, from the blueprints' own dock/terminal
    # data — see worldgen/dock_dredge.py for the rule. It only ever cuts, and
    # never touches ground standing above the waterline.
    from . import dock_dredge
    h, dredge_stats = dock_dredge.dredge_docks(
        h, bodies.level_with_sea, RAW_M, stations=(sol.y, sol.x, sol.L), log=print)
    # self-consistency report: the compiler floods THIS terrain and keeps the
    # profile above; a lake the trench breached, or a hollow the levee made
    # under a channel, shows here as a pooled station whose flood level moved
    bodies2 = sw.solve_bodies(h, npz, step=STEP, mpp=RAW_M, placement=placement)
    pooled = sol.pooled & ~sol.shore
    iy = np.clip(np.round(sol.y[pooled]).astype(int), 0, h.shape[0] - 1)
    ix = np.clip(np.round(sol.x[pooled]).astype(int), 0, h.shape[1] - 1)
    lvl2 = np.nan_to_num(bodies2.level_with_sea[iy, ix], nan=-np.inf, neginf=-np.inf)
    moved = np.abs(lvl2 - sol.pool[pooled]) > 0.1
    stats["pooledLevelMoved"] = int(moved.sum())
    stats["pooledLevelMovedMaxM"] = round(float(np.abs(lvl2 - sol.pool[pooled])[np.isfinite(lvl2)].max()), 3) if np.isfinite(lvl2).any() else 0.0
    stats["pooledLevelLost"] = int((~np.isfinite(lvl2)).sum())
    print(f"post-carve check: {int(moved.sum())} pooled stations whose flood level moved > 0.1 m, "
          f"{int((~np.isfinite(lvl2)).sum())} with no body under them")
    stats["islandsLowered"] = n_islands
    stats["authoredWaterways"] = authored_stats
    stats["dockApproaches"] = dredge_stats
    stats.update({k: v for k, v in pool_report.items() if not k.endswith("Sites")})
    stats["bodies"] = bodies.census
    if save_path is not None:
        sol.save(save_path)
        # the roads/places the pools were judged against: the compile must
        # judge them against the SAME snapshot, or a road re-routed through a
        # pool after the carve drops that pool from under its channel
        sw.save_placement(placement, Path(save_path).with_name("placement-at-carve.npz"))
    return h, stats


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
    d = (ndimage.distance_transform_edt(~mask) * RAW_M).astype(np.float32)
    w = np.exp(-((d / half_w_m) ** 2)).astype(np.float32)
    return np.minimum(h, bed_m * w + h * (1 - w)).astype(np.float32)


def impose_blackrose_lake(h, origin_full, rivers_up, rng):
    cy_full = BLACKROSE_UV[1] * 4033 - origin_full[0]
    cx_full = BLACKROSE_UV[0] * 4033 - origin_full[1]
    dy = (np.arange(h.shape[0], dtype=np.float32)[:, None] - cy_full) * RAW_M * np.ones((1, h.shape[1]), np.float32)
    dx = (np.arange(h.shape[1], dtype=np.float32)[None, :] - cx_full) * RAW_M * np.ones((h.shape[0], 1), np.float32)
    theta = np.arctan2(dy, dx)
    # organic shoreline: low-frequency angular modulation of the radius
    amps = rng.uniform(0.05, 0.12, 3).astype(np.float32)
    phases = rng.uniform(0, 2 * np.pi, 3).astype(np.float32)
    wobble = 1.0 + sum(a * np.sin(k * theta + p) for k, (a, p) in zip((2, 3, 5), zip(amps, phases)))
    r = np.sqrt((dx / LAKE_RADII_M[0]) ** 2 + (dy / LAKE_RADII_M[1]) ** 2) / wobble
    # lake bed: flat centre blending up to original terrain at the rim
    t = np.clip((r - 0.55) / 0.45, 0.0, 1.0)
    blend = t * t * (3 - 2 * t)
    lake_target = LAKE_BED_M * (1 - blend) + h * blend
    h = np.where(r < 1.0, np.minimum(h, lake_target).astype(np.float32), h)
    # city island, offset from centre and irregular
    icx = cx_full + rng.uniform(-60 * TUNE, 60 * TUNE) / RAW_M
    icy = cy_full + rng.uniform(-60 * TUNE, 60 * TUNE) / RAW_M
    idy = (np.arange(h.shape[0], dtype=np.float32)[:, None] - icy) * RAW_M * np.ones((1, h.shape[1]), np.float32)
    idx_ = (np.arange(h.shape[1], dtype=np.float32)[None, :] - icx) * RAW_M * np.ones((h.shape[0], 1), np.float32)
    del dy, dx, theta, wobble, r, t, blend, lake_target
    itheta = np.arctan2(idy, idx_)
    iwob = 1.0 + 0.22 * np.sin(3 * itheta + phases[0]) + 0.12 * np.sin(5 * itheta + phases[1])
    ri = np.sqrt(idx_ ** 2 + idy ** 2) / (ISLAND_R_M * iwob)
    island = np.clip(np.cos(np.clip(ri, 0, 1) * np.pi / 2), 0, 1) ** 1.5 * (ISLAND_TOP_M - LAKE_BED_M)
    h = np.where(ri < 1.0, np.maximum(h, (LAKE_BED_M + island).astype(np.float32)), h)
    # three feeder channels toward canon directions: connect to the nearest
    # river cell in each sector, else to the sea (Oliis Bay for the S outlet),
    # else carve ~2 km outward as a marsh-fading stub. Starting inside the
    # lake guarantees the carve cuts through the rim lip.
    riv_ys, riv_xs = np.where(rivers_up > 0)
    ang = np.degrees(np.arctan2(-(riv_ys - cy_full), riv_xs - cx_full)) % 360
    dist = np.hypot(riv_ys - cy_full, riv_xs - cx_full) * RAW_M
    sea_ys, sea_xs = np.where(h < -1.0)
    sea_ang = np.degrees(np.arctan2(-(sea_ys - cy_full), sea_xs - cx_full)) % 360
    sea_dist = np.hypot(sea_ys - cy_full, sea_xs - cx_full) * RAW_M
    rim = np.array([LAKE_RADII_M[0], LAKE_RADII_M[1]]).mean() / RAW_M
    for name, (a0, a1, half_w, depth) in FEEDER_SECTORS.items():
        min_d = rim * RAW_M * 1.1
        sel = (ang >= a0) & (ang <= a1) & (dist > min_d) & (dist < 3000 * TUNE)
        sea_sel = (sea_ang >= a0) & (sea_ang <= a1) & (sea_dist > min_d) & (sea_dist < 4500 * TUNE)
        if sel.any():
            i = np.argmin(np.where(sel, dist, np.inf))
            target = (riv_xs[i], riv_ys[i])
        elif sea_sel.any():
            i = np.argmin(np.where(sea_sel, sea_dist, np.inf))
            target = (sea_xs[i], sea_ys[i])
        else:
            mid = np.radians((a0 + a1) / 2)
            target = (cx_full + np.cos(mid) * 2000 * TUNE / RAW_M,
                      cy_full - np.sin(mid) * 2000 * TUNE / RAW_M)
        span = max(np.hypot(target[0] - cx_full, target[1] - cy_full), 1e-9)
        start = (cx_full + (target[0] - cx_full) * rim * FEEDER_START_FRAC / span,
                 cy_full + (target[1] - cy_full) * rim * FEEDER_START_FRAC / span)
        h = carve_polyline(h, start, target, half_w, depth, rng)
    return h


# Portage resolution (module 60 §45, decision 0012): short boat-lane land
# hops through low ground become carved canoe channels; longer or higher hops
# stay real portages — recorded for Phase 11 boardwalk/drag-path placement
# and painted as a track on the ground.
PORTAGE_CARVE_MAX_M = 450.0 * TUNE
PORTAGE_CARVE_MAX_GROUND_M = 3.0
CANOE_HALF_W_M = 8.0 * TUNE
CANOE_BED_M = -1.2


def resolve_portages(h, origin_full, rng, lanes_path=None):
    """Resolve waterway land hops. Returns (h, features, track_mask)."""
    lanes_path = Path(lanes_path) if lanes_path is not None else REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "waterways.json"
    features = []
    track = np.zeros(h.shape, dtype=bool)
    canoe = np.zeros(h.shape, dtype=bool)
    if not lanes_path.exists():
        return h, features, track
    for lane in json.loads(lanes_path.read_text()).get("lanes", []):
        px, land = lane["px"], lane["land"]
        run = []
        for i in range(len(px) + 1):
            if i < len(px) and land[i]:
                run.append(px[i])
                continue
            if not run:
                continue
            pts = [(x * STEP - origin_full[1], y * STEP - origin_full[0]) for x, y in run]
            pts = [(x, y) for x, y in pts if 0 <= x < h.shape[1] and 0 <= y < h.shape[0]]
            run = []
            if len(pts) < 2:
                continue
            length_m = sum(np.hypot(x1 - x0, y1 - y0)
                           for (x0, y0), (x1, y1) in zip(pts, pts[1:])) * RAW_M
            ground = float(np.mean([h[y, x] for x, y in pts]))
            mask = canoe if (length_m <= PORTAGE_CARVE_MAX_M
                             and ground < PORTAGE_CARVE_MAX_GROUND_M) else track
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
                xs = np.linspace(x0, x1, n).round().astype(int)
                ys = np.linspace(y0, y1, n).round().astype(int)
                mask[ys, xs] = True
            features.append({
                "lane": f"{lane['from']}-{lane['to']}",
                "mode": "canoe-channel" if mask is canoe else "portage",
                "startKm": [round((origin_full[1] + pts[0][0]) * RAW_M / 1000, 2),
                            round((origin_full[0] + pts[0][1]) * RAW_M / 1000, 2)],
                "lengthM": round(length_m), "meanGroundM": round(ground, 1),
            })
    if canoe.any():
        d = (ndimage.distance_transform_edt(~canoe) * RAW_M).astype(np.float32)
        w = np.exp(-((d / CANOE_HALF_W_M) ** 2)).astype(np.float32)
        h = np.minimum(h, CANOE_BED_M * w + h * (1 - w)).astype(np.float32)
    if track.any():
        track = ndimage.binary_dilation(track, iterations=1)
    return h, features, track


def rasterize_roads(shape, origin_full):
    """Rasterize the Phase 4 road corridors (routes.json, macro [x, y] px)
    into a bool mask ~27 m wide. Water rules override later, so crossings
    stay unpainted (bridges/ferries are placed features)."""
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
    return ndimage.binary_dilation(mask, iterations=2)


def main() -> None:
    height_path, npz_path = Path(sys.argv[1]), Path(sys.argv[2])
    full = base_terrain(height_path)  # image orientation, true metres; sculpted if present (6b)
    npz = np.load(npz_path)
    rivers, regions = npz["rivers"], npz["regions"]

    h = deterrace(full)
    up = lambda a: np.repeat(np.repeat(a, STEP, 0), STEP, 1)[: h.shape[0], : h.shape[1]]
    rivers_up, regions_up = up(rivers), up(regions)

    rng = np.random.default_rng(SEED)
    h, channel_dist = carve_channels(h, rivers_up)
    h += detail_noise(h.shape, regions_up, channel_dist, rng)
    del channel_dist
    h = impose_blackrose_lake(h, (0, 0), rivers_up, rng)
    h, portage_features, portage_track = resolve_portages(h, (0, 0), rng)
    # shoreline smoothing — banks read as mud gradients, not noise spikes
    hs = ndimage.gaussian_filter(h, 2.5)
    band = np.clip(1.0 - np.abs(h - 0.2) / 1.4, 0.0, 1.0)
    h = (h * (1 - 0.7 * band) + hs * (0.7 * band)).astype(np.float32)
    del hs, band

    # Fluvial continuum stage (Phase 8b round 3, owner-approved terrain
    # edits): research-grounded channel geometry, levees/floodplains, oxbows,
    # wetland pools, deltas. Draws from ITS OWN rng so every draw above —
    # the owner-approved 6b noise lattice — stays bit-identical.
    from .fluvial import fluvial_continuum
    rng_fluvial = np.random.default_rng(SEED ^ 0x8B)
    # "wet ground" for rivulets/pools/compaction = the TWI wetlands plus the
    # marsh/jungle heartland regions (owner round 6: more channels + water in
    # the southern/northern marshes and the eastern jungle near Archon)
    wet_mask = (up(npz["wetlands"]) > 0.5) | np.isin(regions_up, (6, 7, 8, 13))
    h, fluvial_stats = fluvial_continuum(
        h, rivers_up, up(npz["accum_km2"]), up(npz["salinity"]),
        wet_mask.astype(np.float32), rng_fluvial,
        rivers_coarse=rivers, flow_to=npz["flow_to"],
        filled=npz["filled"], step=STEP)
    print("fluvial:", fluvial_stats)

    # G11: the current macro plot is the authority for request positions. The
    # typed, content-addressed operations run after general fluvial shaping so
    # that broad noise cannot erase them, and before the shared channel profile
    # makes the final water/terrain join. Final water-relative postconditions
    # are checked downstream against the published water solve.
    from . import catalogue as catalogue_mod, terrain_request_raster, terrain_requests
    terrain_plan, terrain_errors = terrain_requests.build_plan(
        [record for region in catalogue_mod.load_region_files() for record in region.places])
    if terrain_errors:
        raise ValueError("invalid terrain-request plan: " + "; ".join(terrain_errors))
    coarse_flow = _flow_vectors(npz["flow_to"], rivers.shape)
    flow_up = np.repeat(np.repeat(coarse_flow, STEP, 0), STEP, 1)[: h.shape[0], : h.shape[1]]
    h, terrain_fulfillment, terrain_stats = terrain_request_raster.apply_plan(
        h, terrain_plan, RAW_M, flow_vectors=flow_up, wet_mask=wet_mask)
    terrain_applied_sha = hashlib.sha256(h.tobytes()).hexdigest()
    del coarse_flow, flow_up
    print("terrain requests:", len(terrain_stats), "typed operations")

    # Channel bed LAST: cut to the water profile on the final terrain; the
    # solution is saved so the compiler fills the very trench that was cut
    # (owner permission 2026-09-07 to edit terrain for water; decision 0047).
    vault_dir = height_path.parent / "province-refined"
    vault_dir.mkdir(exist_ok=True)
    h, channel_stats = carve_to_profile(h, npz, save_path=vault_dir / "channels-pass1.npz")
    print("channel carve:", json.dumps(channel_stats))
    np.save(vault_dir / "refined-height-f32.npy", h)
    terrain_fulfillment["appliedHeightSha256"] = terrain_applied_sha
    # This is an operation receipt, not a claim about the eventual terrain.
    # Route grading still runs twice after refine. The postcondition stage
    # content-addresses that genuinely final raster and proves every request
    # survived it; naming this intermediate hash "final" made a correct chain
    # fail as soon as grading changed any cell.
    terrain_fulfillment["postRefineHeightSha256"] = hashlib.sha256(h.tobytes()).hexdigest()
    terrain_artifacts = {
        "terrain-request-plan.json": terrain_plan,
        "terrain-request-fulfillments.json": terrain_fulfillment,
        "terrain-request-stats.json": terrain_stats,
    }
    for filename, document in terrain_artifacts.items():
        _atomic_json(vault_dir / filename, document)
        _atomic_json(STUDIO_DIR / filename, document)

    # studio raster at half resolution (RG 16-bit packing), low-passed before
    # decimation (naive [::2] aliased the finest relief octave into moiré).
    from PIL import Image
    half = ndimage.gaussian_filter(h, 1.0)[::2, ::2]
    lo, hi = float(half.min()), float(half.max())
    q = np.round((half - lo) / (hi - lo) * 65535.0).astype(np.uint16)
    rg = np.zeros((*q.shape, 3), dtype=np.uint8)
    rg[..., 0] = q >> 8
    rg[..., 1] = q & 0xFF
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rg).save(STUDIO_DIR / "height-rg.png")

    # Ground-material control map (0011) at full resolution, with the
    # northern palette zone driven by province latitude.
    gy2, gx2 = np.gradient(h, RAW_M)
    slope_f = np.hypot(gx2, gy2).astype(np.float32)
    del gy2, gx2
    v_frac = np.broadcast_to(
        (np.arange(h.shape[0], dtype=np.float32) / h.shape[0])[:, None], h.shape)
    roads = rasterize_roads(h.shape, (0, 0)) | portage_track
    minor = rasterize_minor_paint(h.shape, STEP, (0, 0))
    landcover_mat, control = compile_ground_control(
        h, regions_up, rivers_up, slope_f, RAW_M, rng,
        salinity=up(npz["salinity"]), twi=up(npz["twi"]),
        wetlands=up(npz["wetlands"]), roads=roads,
        minor_routes=minor, v_frac=v_frac)
    del slope_f, roads, minor
    Image.fromarray(control, "RGBA").save(STUDIO_DIR / "ground-control.png")
    np.save(vault_dir / "landcover-i16.npy", landcover_mat)
    (STUDIO_DIR / "portages.json").write_text(json.dumps(
        {"features": portage_features}, indent=1))

    # Flood states (§36 FloodBasin + climatology).
    WET_RISE_M = 1.4
    current_water = h < 0.05
    below = h < 0.05 + WET_RISE_M
    lbl, _ = ndimage.label(below)
    wet_ids = np.unique(lbl[current_water])
    inund = np.isin(lbl, wet_ids[wet_ids > 0])
    newly = inund & ~current_water
    del below, lbl, inund
    Image.fromarray((newly[::2, ::2] * 255).astype(np.uint8)).save(STUDIO_DIR / "flood-wet.png")
    (STUDIO_DIR / "flood-states.json").write_text(json.dumps({
        "basins": [{
            "id": "province-fresh", "meanLevelM": 0.0,
            "seasonalAmplitudeM": WET_RISE_M, "tidalAmplitudeM": 0.5,
            "surgeProfile": "monsoon-pulse-lagged",
            "inundationMask": "flood-wet.png",
            "note": "flood pulse lags the rains 1-2 months (docs/research/world-terrain/black-marsh-climatology.md)",
        }],
        "wetSeasonNewlyFloodedFracOfLand": round(float(newly.sum() / max((~current_water).sum(), 1)), 4),
    }, indent=1))

    # Macro climate tint — retuned at the gate (owner: stronger shift, coast
    # less orange / more tropical, inland greener and darker). The studio has
    # a live strength slider on top of this map.
    qstep = 4
    hq = h[::qstep, ::qstep]

    def qf(a):
        return up(a)[::qstep, ::qstep][: hq.shape[0], : hq.shape[1]].astype(np.float32)

    oc_q = qf(npz["ocean"]) > 0.5
    twi_q = np.nan_to_num(qf(npz["twi"]))
    wet_q = np.clip((twi_q - twi_q.mean()) / max(twi_q.std(), 1e-9) * 0.35 + 0.5, 0, 1)
    coast = np.exp(-(ndimage.distance_transform_edt(~oc_q) * (RAW_M * qstep)).astype(np.float32) / (2500.0 * TUNE))
    south = (np.arange(hq.shape[0], dtype=np.float32) / hq.shape[0])[:, None] * np.ones_like(hq)

    def tnoise():
        m = ndimage.gaussian_filter(rng.standard_normal(hq.shape, dtype=np.float32), 32)
        return (m / max(m.std(), 1e-9)).astype(np.float32)

    tr = 1.0 + 0.02 * coast + 0.06 * (1 - wet_q) - 0.05 * south + 0.06 * tnoise()
    tg = 1.0 + 0.04 * coast + 0.10 * wet_q + 0.07 * south + 0.06 * tnoise()
    tb = 1.0 + 0.03 * coast - 0.04 * wet_q + 0.05 * tnoise()
    dark = 1.0 - 0.06 * wet_q - 0.05 * south + 0.04 * coast
    tint = (np.stack([tr, tg, tb], -1) * dark[..., None]).clip(0.0, 2.0)
    Image.fromarray((tint * 127.5).astype(np.uint8)).save(STUDIO_DIR / "ground-tint.png")

    meta = {
        "originFullPx": [0, 0],
        "originM": [0.0, 0.0],
        "metresPerPixel": RAW_M * 2,
        "imageWidth": int(q.shape[1]), "imageHeight": int(q.shape[0]),
        "heightMinMetres": lo, "heightMaxMetres": hi,
        "extentKm": [round(q.shape[1] * RAW_M * 2 / 1000, 2), round(q.shape[0] * RAW_M * 2 / 1000, 2)],
        "groundControl": "ground-control.png",
        "portages": {
            "canoeChannels": sum(1 for f in portage_features if f["mode"] == "canoe-channel"),
            "portages": sum(1 for f in portage_features if f["mode"] == "portage"),
        },
        "channelCarve": channel_stats,
        "terrainRequests": {
            "requests": len(terrain_plan["requests"]),
            "operations": len(terrain_stats),
            "planDigest": terrain_plan["planDigest"],
            "fulfillment": "terrain-request-fulfillments.json",
        },
        "note": "whole province, true metres (x1 at geometry time, 0015); mild conditioning (0005); chunks via worldgen.compile_chunks",
    }
    (STUDIO_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
