"""Compile the province water layer (decision 0047: one physical model).

Runs on the full 4033² refined terrain the studio renders. Every level is a
flood level on that terrain:

- sea: 0 on ocean-connected ground below 0;
- standing water: `standing_water.solve_bodies` (priority flood of the raw
  full-res terrain, extent = the flood component, acceptance rules per body);
- rivers: `channels` (the same centrelines and long profile L(s) the terrain
  was carved to), every cell inside the width at L, plus a bounded lateral
  flood from those cells at their own level;
- the "table": dry cells within +2 m of a body carry its level, so the
  runtime's season lift floods and drains physically;
- everything else is buried at ground − 3 m (with the sail guard).

Registration is exact: exported texel i of the 2017 surface grid is the
full-res solution at sample 2i+1 (world (i+0.5)·3.65568 m; terrain sample j
sits at world j·1.828 m, packages/game-core/src/terrain/heightfield.ts).

Usage:
  python3 -m worldgen.compile_water            # vault default paths

Writes:
- full arrays -> <vault>/water-pass1.npz (4033 grid: w_full, wet_full,
  owner_full, body_full (+ body_levels/body_sheet), sea_full; 2017 grid: w2, depth2 (signed), shore2, season2, wet2;
  1345 grid: cls, turb, tannin, salinity, vx, vz; source_height_sha256
  binds the solve to the exact full-resolution terrain array)
- browser data -> apps/world-studio/public/province/water/  (schema v2)
    water-surface.png  2017² RGB: R,G = W 16-bit (minM/maxM);
                       B = round((clamp(W − ground, −6, 24.6) + 6) / 0.12)
    water-shore.png    2017² RGB: R shore distance / shoreMaxM, G season
                       response, B tannin
    water-flow.png     1345² RGB: R,G = dir·speed (v/flowMax·0.5+0.5), B speed
    water-class.png    1345² RGB: R class idx, G turbidity, B salinity
    water-owner.png    2017² L: 0 field / 128 strip / 255 fall footprint
    water-meta.json    encodings, channels[] (strips), cascades[], stats
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from . import channels as ch
from . import standing_water as sw
from .compile_chunks import DEFAULT_HEIGHTS
from .export_web_chunks import encode_rg16
from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"
CHANNELS_FILE = "channels-pass1.npz"      # written by refine_province next to the heights

STEP = 3                      # hydrology / flow / class grid: 4033 -> 1345
WEB_STEP = 2                  # surface grid: 4033 -> 2017
SCHEMA_VERSION = 2

LATERAL_MAX_M = 200.0         # bounded lateral flood from channel cells (a captured lake
                              # refloods at the river's level from the trench through it)
TABLE_RISE_M = 2.0            # dry cells this close above a body carry its level
TABLE_MAX_M = 30.0            # ...within this distance
BURY_M = 3.0
CLIFF_DROP_M = 2.5            # in-width ground this far under the bed is a cliff foot, not river
SAIL_GUARD_WIN = 65           # full-res samples (~120 m) for the buried-below-water guard
DEPTH_MIN_M, DEPTH_SPAN_M = -6.0, 30.6
DEPTH_QUANTUM_M = DEPTH_SPAN_M / 255.0
SEASON_AMPLITUDE_M = sw.SEASON_AMPLITUDE_M
RIVER_RESPONSE = {1: 0.35, 2: 0.5, 3: 0.5}
FLOW_MAX = 3.0
SHORE_MAX_M = 160.0
CLASS_EXT_PX = 4              # class/turbidity continue this far past the shoreline
PROFILE_STEP_M = 1.0
PROFILE_START_M = -3.0
PROFILE_PAST_M = 25.0

CLASSES = ["none", "coast", "estuary", "river", "lake", "marsh"]
REGION_SILT = np.array(
    [0.12, 0.05, 0.45, 0.65, 0.30, 0.55, 0.15, 0.20, 0.25, 0.50, 0.30, 0.40, 0.20, 0.30],
    dtype=np.float32)
REGION_TANNIN = np.array(
    [0.00, 0.00, 0.05, 0.15, 0.35, 0.20, 0.85, 0.70, 0.50, 0.30, 0.20, 0.15, 0.45, 0.60],
    dtype=np.float32)


# ---------------------------------------------------------------------------
# helpers shared with the python consumers of the shipped rasters
# ---------------------------------------------------------------------------

def decode_surface(rgb: np.ndarray, meta: dict) -> tuple[np.ndarray, np.ndarray]:
    """(W metres, signed depth metres) from water-surface.png RGB bytes."""
    m = meta["surface"]
    q = rgb[..., 0].astype(np.uint32) * 256 + rgb[..., 1].astype(np.uint32)
    w = (q.astype(np.float32) / 65535.0) * (m["maxM"] - m["minM"]) + m["minM"]
    dmin = m.get("depthMinM", 0.0)
    dspan = m.get("depthSpanM", 25.5)
    depth = rgb[..., 2].astype(np.float32) / 255.0 * dspan + dmin
    return w.astype(np.float32), depth.astype(np.float32)


def quantise_depth(depth: np.ndarray) -> np.ndarray:
    return np.round((np.clip(depth, DEPTH_MIN_M, DEPTH_MIN_M + DEPTH_SPAN_M) - DEPTH_MIN_M)
                    / DEPTH_QUANTUM_M).astype(np.uint8)


def export_index(n_full: int, step: int) -> np.ndarray:
    """Full-res sample index of exported texel i: step·i + (step−1)//2 + ...
    For the 2017 surface grid that is 2i+1 (texel centre); the 1345 grid
    uses 3i+1 (within 0.9 m of its texel centre)."""
    n = -(-n_full // step)
    return np.minimum(np.arange(n) * step + step // 2, n_full - 1)


_BOX = np.ones((3, 3), dtype=bool)


def _neighbour_levels(t: np.ndarray):
    """(highest, lowest) finite level among the 8 neighbours (-inf/+inf none).
    Eight-connected, like the priority flood that finds the standing
    bodies: a hollow the flood drains through a diagonal gap refills the
    same way."""
    hi = ndimage.grey_dilation(t, footprint=_BOX)
    lo = -ndimage.grey_dilation(np.where(np.isfinite(t), -t, -np.inf), footprint=_BOX)
    return hi, lo


def spread_lateral(t: np.ndarray, g: np.ndarray, local: np.ndarray, ok: np.ndarray,
                   iters: int) -> np.ndarray:
    """Bounded lateral flood from assigned cells: an unassigned cell floods
    at its wet neighbour's level, capped at the LOCAL level (its nearest
    station's L, so an upstream station's higher level is never carried
    sideways down the valley), when its ground is below that."""
    for _ in range(iters):
        hi, _lo = _neighbour_levels(t)
        lvl = np.minimum(hi, local)
        take = ~np.isfinite(t) & np.isfinite(hi) & ok & (g < lvl)
        if not take.any():
            break
        t = np.where(take, lvl, t)
    return t


def spread_table(t: np.ndarray, g: np.ndarray, rise: float, iters: int) -> np.ndarray:
    """The table band: a dry cell within `rise` above a neighbouring level
    carries that level — the highest neighbouring level not above its
    ground, else the lowest one."""
    for _ in range(iters):
        hi, lo = _neighbour_levels(t)
        use_hi = np.isfinite(hi) & (g >= hi)
        lvl = np.where(use_hi, hi, lo)
        take = ~np.isfinite(t) & np.isfinite(lvl) & (g >= lvl) & (g < lvl + rise)
        if not take.any():
            break
        t = np.where(take, lvl, t)
    return t


def _terrain_sampler(refined: np.ndarray, mpp: float):
    ref = refined.astype(np.float32)

    def at(x_m, z_m):
        zs = np.atleast_1d(np.asarray(z_m, dtype=np.float64)) / mpp
        xs = np.atleast_1d(np.asarray(x_m, dtype=np.float64)) / mpp
        return ndimage.map_coordinates(ref, [zs, xs], order=1, mode="nearest")
    return at


def sheet_corridor(sol, shape, pad_m: float = 2.0) -> np.ndarray:
    """Mask of the ground each cascade's SHEET is drawn over: the corridor
    from every lip to its plunge, across the fall's width.

    This is not the same as the `owner == 255` fall footprint, which is the
    ground the fall's *water level* stands over — on the face itself that
    level is the plunge's and lies far below the rock, so the footprint
    covers almost none of the cliff, and the lip and plunge stations at the
    two ends own the rest. The corridor is what the renderer actually paints,
    and it is where water may legitimately have lower dry rock beside it: at
    a brink the water does not end, it falls.
    """
    mask = np.zeros(shape, dtype=bool)
    lips = np.flatnonzero(sol.lip)
    plunges = np.flatnonzero(sol.plunge)
    for k in lips:
        after = plunges[(plunges > k) & (sol.reach[plunges] == sol.reach[k])]
        if not len(after):
            continue
        j = int(after[0])
        r = max(float(sol.width[k]) * 0.5, float(sol.width[j]) * 0.5) / sol.mpp + pad_m / sol.mpp
        y0, y1 = sol.y[k], sol.y[j]
        x0, x1 = sol.x[k], sol.x[j]
        lo_y, hi_y = int(min(y0, y1) - r - 1), int(max(y0, y1) + r + 2)
        lo_x, hi_x = int(min(x0, x1) - r - 1), int(max(x0, x1) + r + 2)
        lo_y, lo_x = max(lo_y, 0), max(lo_x, 0)
        hi_y, hi_x = min(hi_y, shape[0]), min(hi_x, shape[1])
        if hi_y <= lo_y or hi_x <= lo_x:
            continue
        # the bowl the fall digs is part of the fall: `carve` scours it out to
        # a full width from the plunge, and its rim is the fall's own rim
        bowl_r = float(sol.width[j]) / sol.mpp
        lo_y = max(int(min(y0, y1 - bowl_r) - r - 1), 0)
        hi_y = min(int(max(y0, y1 + bowl_r) + r + 2), shape[0])
        lo_x = max(int(min(x0, x1 - bowl_r) - r - 1), 0)
        hi_x = min(int(max(x0, x1 + bowl_r) + r + 2), shape[1])
        if hi_y <= lo_y or hi_x <= lo_x:
            continue
        yy, xx = np.mgrid[lo_y:hi_y, lo_x:hi_x]
        vy, vx = y1 - y0, x1 - x0
        L2 = float(vy * vy + vx * vx) or 1.0
        t = np.clip(((yy - y0) * vy + (xx - x0) * vx) / L2, 0.0, 1.0)
        d = np.hypot(yy - (y0 + t * vy), xx - (x0 + t * vx))
        # the brink above the lip is the fall's head: the water crossing it is
        # already going over, so the rock a step below it is where it is going
        head_r = float(sol.width[k]) / sol.mpp
        mask[lo_y:hi_y, lo_x:hi_x] |= ((d <= r)
                                       | (np.hypot(yy - y1, xx - x1) <= bowl_r)
                                       | (np.hypot(yy - y0, xx - x0) <= head_r))
    return mask


def hovering_edges(W, wet, assigned, g, fall_foot, min_drop: float = 0.05,
                   max_drop: float = ch.CANYON_MAX_M, cliff_out: list | None = None) -> np.ndarray:
    """Mask of wet cells with a 4-neighbour that is dry, unassigned (no level
    of its own) and whose ground lies >= min_drop under the wet cell's W.
    Cells in a fall footprint are excluded on both sides, and so is a drop
    of more than `max_drop`: that is a channel running along a cliff edge
    (a coarse-route defect no levee addresses); their count goes to
    `cliff_out` so the census still shows them."""
    n = g.shape[0]
    bad = np.zeros(g.shape, dtype=bool)
    cliff = 0
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        a = (slice(max(dy, 0), n + min(dy, 0)), slice(max(dx, 0), n + min(dx, 0)))
        b = (slice(max(-dy, 0), n + min(-dy, 0)), slice(max(-dx, 0), n + min(-dx, 0)))
        drop = W[a] - g[b]
        edge = wet[a] & ~wet[b] & ~assigned[b] & ~fall_foot[a] & ~fall_foot[b]
        # Exempt only the neighbour that is itself down the cliff. Looking at
        # its surrounding 3x3 would also exempt a shallow dry ledge beside a
        # cliff, even though that ledge is physically below the water level.
        lip = drop > max_drop
        bad[a] |= edge & (drop >= min_drop) & ~lip
        cliff += int((edge & (drop >= min_drop) & lip).sum())
    if cliff_out is not None:
        cliff_out.append(cliff)
    return bad


# ---------------------------------------------------------------------------
# the compile
# ---------------------------------------------------------------------------

def compute(refined: np.ndarray, npz, sol: ch.ChannelSolution, step: int = STEP,
            mpp: float = RAW_M, with_placement: bool = True, log=print,
            placement: dict | None = None) -> dict:
    t0 = time.perf_counter()
    g = refined.astype(np.float32)
    n = g.shape[0]
    n2 = -(-n // WEB_STEP)
    mpp2 = mpp * WEB_STEP
    mpp1 = mpp * step

    # --- 1. standing water on THIS terrain; the channel profile is the carve's
    # The trench was cut to L; L is never re-solved here, so a depression the
    # carve itself made (a levee's backswamp, an over-deepened trench pool)
    # is a body, never a lake that lifts the river. The hollows the carve
    # accepted for a trapped river (forced basins) are replayed: a pooled
    # station with no flood under it forces its depression at the spill.
    bodies = sw.solve_bodies(g, npz, step, mpp, with_placement=with_placement,
                             placement=placement)
    pooled_c = sol.pooled & ~sol.shore
    iy0 = np.clip(np.round(sol.y[pooled_c]).astype(int), 0, n - 1)
    ix0 = np.clip(np.round(sol.x[pooled_c]).astype(int), 0, n - 1)
    lvl = np.nan_to_num(bodies.level_with_sea[iy0, ix0], nan=-np.inf, neginf=-np.inf)
    dry_pooled = ~np.isfinite(lvl)
    forced = bodies.force_depressions(iy0[dry_pooled], ix0[dry_pooled],
                                      at_level=sol.pool[pooled_c][dry_pooled]) if dry_pooled.any() else 0
    lvl = np.nan_to_num(bodies.level_with_sea[iy0, ix0], nan=-np.inf, neginf=-np.inf)
    moved = np.abs(lvl - sol.pool[pooled_c])
    sol = sol.copy()
    sol.L[pooled_c] = np.where(np.isfinite(lvl), np.minimum(sol.L[pooled_c], lvl), sol.L[pooled_c])
    pool_report = {"forcedBasins": forced,
                   "pooledLevelMoved": int((moved > 0.1).sum()),
                   "pooledLevelMovedMaxM": round(float(moved[np.isfinite(moved)].max()), 3) if np.isfinite(moved).any() else 0.0,
                   "pooledLevelLost": int((~np.isfinite(lvl)).sum()),
                   "lostStations": int(sol.lost.sum()),
                   "lostReaches": int(np.unique(sol.reach[sol.lost]).size)}
    log(f"bodies {bodies.n} ({time.perf_counter() - t0:.0f} s); pooled stations whose level moved: "
        f"{pool_report['pooledLevelMoved']} (max {pool_report['pooledLevelMovedMaxM']} m), "
        f"no body under {pool_report['pooledLevelLost']}")

    # --- 2. W: sea, bodies, channel cells at L ------------------------------
    fld = ch.raster_fields(sol, g.shape)
    lost = sol.lost
    valid_st = ~lost
    w_chan = np.full(g.shape, np.inf, dtype=np.float32)
    in_chan = np.zeros(g.shape, dtype=bool)
    fall_foot = np.zeros(g.shape, dtype=bool)
    # every station projects its level, a pooled one the level its lake now
    # stands at (the carve's groove under the lake keeps it wet if the lake
    # settled a little lower than the carve assumed)
    project = valid_st
    depth_cut = sol.depth_cut
    cliff_cells = 0
    w_dry = np.full(g.shape, np.inf, dtype=np.float32)     # candidates under the ground
    for b, nb, d, inside, lvl in fld["bands"]:
        ok = inside & project[nb]
        # a width that straddles a cliff edge: ground far under the bed the
        # carve made is not this channel's water (it would ship as a column)
        deep = ok & (g < lvl - depth_cut[nb] - CLIFF_DROP_M)
        cliff_cells += int((deep & (bodies.body == 0)).sum())
        ok &= ~deep
        # where two widths overlap, the lowest level that still stands above
        # the ground wins (a reach doubling back on itself below a cliff must
        # not bury its own upper stretch under the lower one's level)
        above = lvl > g
        w_chan = np.where(ok & above, np.minimum(w_chan, lvl), w_chan)
        w_dry = np.where(ok & ~above, np.minimum(w_dry, lvl), w_dry)
        in_chan |= ok
        fall_foot |= ok & above & (sol.kind[nb] == ch.KIND_FALL)
    w_chan = np.where(np.isfinite(w_chan), w_chan, w_dry)
    del w_dry
    near, dist = fld["near"], fld["dist"]
    del fld
    # the plunge pool: the bowl the carve dug is wider than the channel; its
    # cells hold the plunge level (else the pool's rim hangs above dry bowl).
    # Only cells that belong to the fall (nearest to its face or plunge):
    # downstream the chute is already lower
    # ...only cells that belong to the fall (nearest to its face, lip or
    # plunge): downstream the chute is already lower
    k_near = np.maximum(near, 0)
    for k in np.flatnonzero(sol.plunge & valid_st):
        w_m = float(sol.width[k]); rr = int(np.ceil(w_m / mpp)) + 1
        cy, cx = int(round(float(sol.y[k]))), int(round(float(sol.x[k])))
        y0, y1 = max(cy - rr, 0), min(cy + rr + 1, n); x0, x1 = max(cx - rr, 0), min(cx + rr + 1, n)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        kn = k_near[y0:y1, x0:x1]
        # ...and the bowl cells beside the first stations after the plunge
        # (a chute carries no lateral flood, so the pool must claim them)
        below = (sol.reach[kn] == sol.reach[k]) & (kn > k) & (kn <= k + rr)
        disc = (np.hypot(yy - sol.y[k], xx - sol.x[k]) * mpp <= w_m) & ~in_chan[y0:y1, x0:x1] \
            & (g[y0:y1, x0:x1] < sol.L[k]) & ((sol.kind[kn] == ch.KIND_FALL) | (kn == k) | sol.lip[kn] | below)
        w_chan[y0:y1, x0:x1] = np.where(disc, np.minimum(w_chan[y0:y1, x0:x1], sol.L[k]), w_chan[y0:y1, x0:x1])
        in_chan[y0:y1, x0:x1] |= disc
    del k_near
    # a body inside a channel's width is a pool in the bed (a plunge bowl,
    # an over-deepened stretch): the river flows through it at L, never
    # drops into it, so the channel keeps the higher of the two. A channel
    # entering a lake or the sea is pooled to it already (L = its level).
    # a body that lies wholly inside the channel's width is a pool in the
    # bed (a plunge bowl, an over-deepened stretch): the river flows through
    # it at L, so it is river, not a lake. Elsewhere the flood wins where it
    # stands: a channel running into a lake or the sea drops to that level.
    W = np.where(in_chan, w_chan, np.float32(-np.inf))
    if bodies.n:
        idx = np.arange(1, bodies.n + 1)
        outside = np.asarray(ndimage.sum(~in_chan, bodies.body, idx)) == 0
        trench_pool = np.concatenate([[False], outside])[bodies.body]
        if trench_pool.any():
            bodies.level[trench_pool] = -np.inf
            bodies.set_level(bodies.level)    # relabel: ids, levels, areas, sheets
        del trench_pool
    W = np.where(bodies.body > 0, bodies.level, W)
    W = np.where(bodies.sea, np.float32(0.0), W).astype(np.float32)
    del w_chan

    # --- 3. bounded lateral flood from the channel cells at their level -----
    # ...from FIELD stations only: on a steep reach the water stays in its
    # notch (the strip mesh draws it), and the nearest-station bands of a
    # torrent are so short along-stream that "sideways" cells belong to
    # stations metres lower — spreading there runs water down the hillside
    near_ok = near >= 0
    near_L = np.where(near_ok, ch.level_at_cells(sol, near, g.shape), -np.inf).astype(np.float32)
    # ...and from a fall's foot (its plunge pool spreads over any lower
    # ground beside it; the face above is higher than the level anyway)
    kn = sol.kind[np.maximum(near, 0)]
    lat_ok = near_ok & (dist <= LATERAL_MAX_M) & (
        (kn == ch.KIND_FIELD) | ((kn == ch.KIND_FALL) & (dist <= sol.width[np.maximum(near, 0)])))
    del kn
    iters = int(np.ceil(LATERAL_MAX_M / mpp))
    W = spread_lateral(W, g, near_L, lat_ok, iters)
    hi, _lo = _neighbour_levels(W)
    bound_hit = ~np.isfinite(W) & np.isfinite(hi) & lat_ok & (g < np.minimum(hi, near_L))
    bound_reaches = np.unique(sol.reach[near[bound_hit]]) if bound_hit.any() else np.zeros(0, int)
    del hi, lat_ok
    wet = np.isfinite(W) & (W > g)

    # --- 4. the table band: +2 m uphill flood -------------------------------
    W = spread_table(W, g, TABLE_RISE_M, int(np.ceil(TABLE_MAX_M / mpp)))
    assigned = np.isfinite(W)

    # --- 5. burial with the sail guard --------------------------------------
    lvl = np.where(wet, W, np.float32(np.inf))
    local_min = ndimage.grey_erosion(lvl, size=(SAIL_GUARD_WIN, SAIL_GUARD_WIN), mode="nearest")
    buried = np.minimum(g - BURY_M, np.where(np.isfinite(local_min), local_min - 1.0, np.inf))
    W = np.where(assigned, W, buried).astype(np.float32)
    del lvl, local_min, buried

    # --- 6. invariants census at full res -----------------------------------
    # A hovering edge: a wet cell next to a dry cell whose ground is >= 0.05 m
    # below the wet cell's W and which has NO local level at all (buried) —
    # the bank of the next station down a sloping river carries that
    # station's level as its table and is not a hole; fall footprints are
    # bridged by the sheet.
    cliff_edge: list = []
    # a brink is not a hole: the sheet carries the water down the corridor
    corridor = sheet_corridor(sol, g.shape)
    hover = int(hovering_edges(W, wet, assigned, g, fall_foot | corridor,
                               cliff_out=cliff_edge).sum())
    brink_cells = int((hovering_edges(W, wet, assigned, g, fall_foot).sum()) - hover)
    iy = np.clip(np.round(sol.y).astype(int), 0, n - 1)
    ix = np.clip(np.round(sol.x).astype(int), 0, n - 1)
    st_wet = np.isfinite(W[iy, ix]) & (W[iy, ix] >= g[iy, ix] - 0.01)   # water reaches the bed
    live = valid_st & (sol.kind != ch.KIND_FALL)
    coarse_id = (iy // step) * npz["rivers"].shape[1] + (ix // step)
    live_cells = np.unique(coarse_id[live])
    wet_cells = np.unique(coarse_id[live & st_wet])
    dry_cells = np.setdiff1d(live_cells, wet_cells)

    # --- 7. owner and season response ---------------------------------------
    owner = np.zeros(g.shape, dtype=np.uint8)
    strip_cell = in_chan & wet & near_ok & (sol.kind[np.maximum(near, 0)] == ch.KIND_STEEP)
    owner[strip_cell] = 128
    owner[fall_foot] = 255
    resp_body = sw.season_response(g, bodies)
    band_resp = np.array([0.0] + [RIVER_RESPONSE[b] for b in (1, 2, 3)], dtype=np.float32)
    resp = np.zeros(g.shape, dtype=np.float32)
    chan_wet = in_chan & wet & (bodies.body == 0)
    resp[chan_wet] = band_resp[sol.band[np.maximum(near, 0)]][chan_wet]
    if bodies.n:
        inb = bodies.body > 0
        resp[inb] = resp_body[bodies.body[inb] - 1]
    resp[bodies.sea] = 0.0
    del chan_wet

    # --- 8. the export grids (texel i = sample 2i+1 / 3i+1) -----------------
    i2 = export_index(n, WEB_STEP)
    W2 = W[np.ix_(i2, i2)]
    g2 = g[np.ix_(i2, i2)]
    depth2 = (W2 - g2).astype(np.float32)
    depth_q = quantise_depth(depth2)
    wet2 = depth_q > int(round(-DEPTH_MIN_M / DEPTH_QUANTUM_M))
    owner2 = owner[np.ix_(i2, i2)].copy()
    owner2[(owner2 == 128) & ~wet2] = 0
    d2, (jy, jx) = ndimage.distance_transform_edt(~wet2, return_indices=True)
    shore2 = np.clip(d2 * mpp2, 0.0, SHORE_MAX_M).astype(np.float32)
    resp2 = resp[np.ix_(i2, i2)]
    resp2 = np.where(wet2, resp2, resp2[jy, jx]).astype(np.float32)
    table2 = ~wet2 & (depth2 > -TABLE_RISE_M) & (W2 > g2 - BURY_M + 0.01)
    resp2[~wet2 & ~table2] = 0.0
    del d2, jy, jx

    i3 = export_index(n, step)
    n3 = len(i3)
    blk = lambda a: ndimage.maximum_filter(a.astype(np.uint8), size=step)[np.ix_(i3, i3)] > 0
    wet3 = blk(wet)
    sea3 = bodies.sea[np.ix_(i3, i3)]
    chan3 = blk(in_chan & wet)
    body3 = blk(bodies.body > 0)
    salinity = npz["salinity"].astype(np.float32)[:n3, :n3]
    wetlands = npz["wetlands"][:n3, :n3]
    cls = np.zeros((n3, n3), dtype=np.uint8)
    cls[wet3 & sea3 & (salinity >= 0.3)] = CLASSES.index("coast")
    cls[wet3 & sea3 & (salinity < 0.3) & (salinity >= 0.05)] = CLASSES.index("estuary")
    cls[wet3 & sea3 & (salinity < 0.05)] = CLASSES.index("lake")
    cls[wet3 & ~sea3 & body3] = CLASSES.index("lake")
    cls[wet3 & ~sea3 & body3 & wetlands] = CLASSES.index("marsh")
    cls[wet3 & ~sea3 & chan3] = CLASSES.index("river")
    cls[wet3 & (cls == 0)] = CLASSES.index("marsh")
    regions = np.clip(npz["regions"][:n3, :n3], 0, len(REGION_SILT) - 1)
    turb = REGION_SILT[regions].copy()
    tannin = REGION_TANNIN[regions].copy()
    turb[cls == CLASSES.index("estuary")] += 0.15
    tannin = np.clip(ndimage.gaussian_filter(tannin, 1.5), 0.0, 1.0)
    ww = ndimage.binary_dilation(npz["rivers"][:n3, :n3] >= 2, iterations=2) & (tannin < 0.5)
    turb[ww] = np.maximum(turb[ww], 0.58)
    turb = np.clip(ndimage.gaussian_filter(turb, 1.5), 0.0, 1.0)
    dist_px, (ky, kx) = ndimage.distance_transform_edt(~wet3, return_indices=True)
    ext = (~wet3) & (dist_px <= CLASS_EXT_PX)
    cls_ext = cls.copy()
    cls_ext[ext] = cls[ky[ext], kx[ext]]
    for arr in (turb, tannin, salinity):
        arr[ext] = arr[ky[ext], kx[ext]]
    del dist_px, ky, kx

    # --- 9. flow (1345): centreline tangent × speed --------------------------
    vx = np.zeros((n3, n3), dtype=np.float32)
    vz = np.zeros((n3, n3), dtype=np.float32)
    cnt = np.zeros((n3, n3), dtype=np.float32)
    sel = live
    cy = np.minimum(iy[sel] // step, n3 - 1)
    cx = np.minimum(ix[sel] // step, n3 - 1)
    np.add.at(vx, (cy, cx), sol.tx[sel] * sol.speed[sel])
    np.add.at(vz, (cy, cx), sol.ty[sel] * sol.speed[sel])
    np.add.at(cnt, (cy, cx), 1.0)
    has = cnt > 0
    vx[has] /= cnt[has]
    vz[has] /= cnt[has]
    support = ndimage.gaussian_filter(has.astype(np.float32), 1.2)
    vx = ndimage.gaussian_filter(vx, 1.2) / np.maximum(support, 0.25)
    vz = ndimage.gaussian_filter(vz, 1.2) / np.maximum(support, 0.25)
    speed3 = np.hypot(vx, vz)
    over = speed3 > FLOW_MAX
    vx[over] *= FLOW_MAX / speed3[over]
    vz[over] *= FLOW_MAX / speed3[over]

    # --- 10. strips and cascades ---------------------------------------------
    terrain_at = _terrain_sampler(g, mpp)
    x_m = sol.x * mpp
    z_m = sol.y * mpp

    def field_at(k):
        # the field surface at the cell the EMITTED (rounded) coordinates name
        cy = int(np.clip(round(round(float(z_m[k]), 2) / mpp), 0, n - 1))
        cx = int(np.clip(round(round(float(x_m[k]), 2) / mpp), 0, n - 1))
        return float(W[cy, cx])

    def point(k, kind, y=None):
        return {"x": round(float(x_m[k]), 2), "z": round(float(z_m[k]), 2),
                "y": round(float(sol.L[k] if y is None else y), 3),
                "bedY": round(float(terrain_at(x_m[k], z_m[k])[0]), 2),
                "halfWidthM": round(float(sol.width[k] * 0.5), 2),
                "speedMS": round(float(sol.speed[k]), 2),
                "season": round(float(band_resp[sol.band[k]]), 2),
                "kind": kind}

    strips = []
    strip_len = 0.0
    for a, b in ch.steep_runs(sol):
        r = int(sol.reach[a])
        r0, r1 = int(sol.reach_start[r]), int(sol.reach_end[r])
        if lost[a:b + 1].any():
            continue
        pts = []
        if a > r0 and sol.plunge[a - 1]:
            pts.append(point(a - 1, "plunge"))
        elif a > r0 and sol.kind[a - 1] == ch.KIND_FIELD:
            pts.append(point(a - 1, "join", field_at(a - 1)))
        else:
            pts.append(point(a, "join", field_at(a)))
        core = range(a, b + 1) if pts[-1]["kind"] != "join" or a > r0 else range(a + 1, b + 1)
        for k in core:
            pts.append(point(k, "lip" if sol.lip[k] else "steep"))
        if sol.lip[b]:
            pass
        elif b + 1 < r1 and sol.kind[b + 1] == ch.KIND_FIELD:
            pts.append(point(b + 1, "join", field_at(b + 1)))
        else:
            pts[-1]["kind"] = "join"
            pts[-1]["y"] = round(field_at(b), 3)
        arc = 0.0
        for i, p in enumerate(pts):
            if i:
                q = pts[i - 1]
                arc += float(np.hypot(p["x"] - q["x"], p["z"] - q["z"]))
            p["arcM"] = round(arc, 2)
        if len(pts) < 3:
            continue
        strips.append({"id": f"strip-{len(strips)}", "band": int(sol.band[a]), "points": pts})
        strip_len += float(sol.arc[b] - sol.arc[a])

    cascades = []
    for a, b in ch.falls(sol):
        if lost[a] or lost[b]:
            continue
        lx, lz, px, pz = float(x_m[a]), float(z_m[a]), float(x_m[b]), float(z_m[b])
        dx, dz = float(sol.tx[a]), float(sol.ty[a])
        dl = float(np.hypot(px - lx, pz - lz))
        s = np.arange(PROFILE_START_M, dl + PROFILE_PAST_M + 1e-6, PROFILE_STEP_M)
        prof = terrain_at(lx + dx * s, lz + dz * s)
        cascades.append({
            "id": f"fall-{len(cascades)}", "bodyIndex": 0, "riverBand": int(sol.band[a]),
            "lip": {"x": round(lx, 2), "y": round(float(sol.L[a]), 3), "z": round(lz, 2)},
            "plunge": {"x": round(px, 2), "y": round(float(sol.L[b]), 3), "z": round(pz, 2)},
            "direction": {"x": round(dx, 4), "y": 0, "z": round(dz, 4)},
            "widthM": round(float(sol.width[a]), 2),
            "dropM": round(float(sol.L[a] - sol.L[b]), 3),
            "profileStepM": PROFILE_STEP_M, "profileStartM": PROFILE_START_M,
            "profile": [round(float(v), 2) for v in prof],
            "lipSpeedMS": round(float(sol.speed[a]), 2),
        })

    stats = {
        "compileSeconds": round(time.perf_counter() - t0, 1),
        "hoveringEdges": hover,
        "cliffEdgeCells": int(cliff_edge[0]),
        "brinkEdgeCells": int(brink_cells),
        "boundHitCells": int(bound_hit.sum()),
        "boundHitReaches": int(len(bound_reaches)),
        "dryStations": int((live & ~st_wet).sum()),
        "cliffFootCellsInWidth": cliff_cells,
        "sillStations": int(sol.sill.sum()),
        "dryCoarseRiverCells": int(len(dry_cells)),
        "liveCoarseRiverCells": int(len(live_cells)),
        "stations": int(sol.n),
        "reaches": int(len(sol.reach_start)),
        "stationKinds": {"field": int((sol.kind == 0).sum()), "steep": int((sol.kind == 1).sum()),
                         "fall": int((sol.kind == 2).sum()), "lost": int((sol.kind == 3).sum())},
        "stripCount": len(strips), "stripKm": round(strip_len / 1000.0, 2),
        "cascadeCount": len(cascades),
        "wetFrac": round(float(wet.mean()), 4),
        "visibleWaterFrac2017": round(float(wet2.mean()), 4),
        "tableFrac2017": round(float(table2.mean()), 4),
        "maxDepthM": round(float(depth2.max()), 2),
        "ownerFrac": round(float((owner2 > 0).mean()), 6),
        "classFrac": {name: round(float((cls_ext == i).mean()), 5)
                      for i, name in enumerate(CLASSES) if i},
        **{k: v for k, v in bodies.census.items()},
        **pool_report,
    }
    return {
        "W": W, "wet": wet, "assigned": assigned, "bodies": bodies, "in_chan": in_chan,
        "owner": owner, "fall_foot": fall_foot,
        "w2": W2, "depth2": depth2, "depth_q": depth_q, "wet2": wet2, "shore2": shore2,
        "season2": resp2, "owner2": owner2, "ground2": g2,
        "cls": cls_ext, "turb": turb, "tannin": tannin, "salinity": salinity, "vx": vx, "vz": vz,
        "channels": strips, "cascades": cascades, "stats": stats, "sol": sol,
    }


def main() -> None:
    vault = DEFAULT_HEIGHTS.parent.parent
    npz = np.load(vault / "hydrology-pass1.npz")
    refined = np.load(DEFAULT_HEIGHTS)
    sol_path = DEFAULT_HEIGHTS.parent / CHANNELS_FILE
    if not sol_path.exists():
        raise SystemExit(f"{sol_path} missing: run worldgen.refine_province first "
                         "(it carves the channels and records their solution)")
    sol = ch.ChannelSolution.load(sol_path)
    # the pools are judged against the roads/places the CARVE saw (a road
    # re-routed through a pool afterwards is placement's problem, reported
    # in stats.roadCellsInWater)
    placement = sw.load_placement(sol_path.with_name("placement-at-carve.npz"))
    r = compute(refined, npz, sol, placement=placement)
    # roads never stand in open water except at a ford (<= 0.3 m); the split
    # says whose defect a remaining cell is: a river crossing is the carve's,
    # a lake is the pool acceptance's, the SEA is the route solver's (its
    # COST_OPEN_WATER ferry/causeway crossings)
    depth = r["W"] - refined
    body = r["bodies"].body > 0
    sea = r["bodies"].sea
    for key, kinds in (("road", ("major_roads",)), ("track", ("roads",))):
        m = sw.placement_cells(refined.shape, RAW_M, kinds=kinds)
        wet = m & r["wet"]
        deep = wet & (depth > 0.3)
        r["stats"][f"{key}CellsInWater"] = int(wet.sum())
        r["stats"][f"{key}CellsDeepInWater"] = int(deep.sum())
        r["stats"][f"{key}CellsDeepBy"] = {"sea": int((deep & sea).sum()),
                                           "lake": int((deep & body & ~sea).sum()),
                                           "river": int((deep & ~body & ~sea).sum())}
    source_height_sha256 = hashlib.sha256(
        np.ascontiguousarray(refined).tobytes()
    ).hexdigest()
    write_outputs(r, vault, source_height_sha256=source_height_sha256)
    print(json.dumps(r["stats"], indent=1))


def write_outputs(r: dict, vault: Path, *, source_height_sha256: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        vault / "water-pass1.npz",
        w_full=r["W"].astype(np.float32), wet_full=r["wet"], owner_full=r["owner"],
        assigned_full=r["assigned"], chan_full=r["in_chan"],
        body_full=r["bodies"].body, body_levels=r["bodies"].levels,
        body_sheet=r["bodies"].sheet, sea_full=r["bodies"].sea,
        w2=r["w2"].astype(np.float32), depth2=r["depth2"].astype(np.float32),
        shore2=r["shore2"], season2=r["season2"], wet2=r["wet2"],
        cls=r["cls"], turb=r["turb"], tannin=r["tannin"], salinity=r["salinity"],
        vx=r["vx"], vz=r["vz"],
        source_height_sha256=np.asarray(source_height_sha256),
    )
    w2 = r["w2"]
    min_w, max_w = float(w2.min()), float(w2.max())
    surf = np.asarray(encode_rg16(w2, min_w, max_w))
    surf = np.dstack([surf[..., 0], surf[..., 1], r["depth_q"]])
    Image.fromarray(surf, mode="RGB").save(OUT_DIR / "water-surface.png")

    # NO data ever rides a PNG alpha channel (browser canvas premultiply)
    enc = lambda a: np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    n2 = w2.shape[0]
    up2 = lambda a: ndimage.zoom(a, n2 / a.shape[0], order=1)[:n2, :n2]
    shore8 = enc(r["shore2"] / SHORE_MAX_M)
    Image.fromarray(np.dstack([shore8, enc(r["season2"]), enc(up2(r["tannin"]))]),
                    mode="RGB").save(OUT_DIR / "water-shore.png")
    flow = np.dstack([enc(r["vx"] / FLOW_MAX * 0.5 + 0.5), enc(r["vz"] / FLOW_MAX * 0.5 + 0.5),
                      enc(np.hypot(r["vx"], r["vz"]) / FLOW_MAX)])
    Image.fromarray(flow, mode="RGB").save(OUT_DIR / "water-flow.png")
    klass = np.dstack([r["cls"], enc(r["turb"]), enc(r["salinity"])])
    Image.fromarray(klass, mode="RGB").save(OUT_DIR / "water-class.png")
    Image.fromarray(r["owner2"], mode="L").save(OUT_DIR / "water-owner.png")

    n3 = r["cls"].shape[0]
    meta = {
        "schemaVersion": SCHEMA_VERSION,
        "sourceHeightSha256": source_height_sha256,
        "surface": {
            "file": "water-surface.png", "size": int(n2), "metresPerPixel": RAW_M * WEB_STEP,
            "minM": min_w, "maxM": max_w,
            "encoding": ("R,G = 16-bit W; B = signed depth: round((clamp(W - ground, -6, 24.6) + 6) / 0.12). "
                         "Wet <=> depth > 0; table cells sit in (-2, 0]; buried ground <= -2.5."),
            "depthMinM": DEPTH_MIN_M, "depthSpanM": DEPTH_SPAN_M,
            "registration": "texel i = refined sample 2i+1 = world (i + 0.5) * metresPerPixel",
            "buryM": BURY_M,
            "shoreFile": "water-shore.png", "shoreMaxM": SHORE_MAX_M,
            "ownerFile": "water-owner.png",
            "ownerEncoding": "0 field / 128 strip / 255 fall footprint",
        },
        "season": {
            "file": "water-shore.png", "channel": "G", "amplitudeM": SEASON_AMPLITUDE_M,
            "runtime": "wet <=> signedDepth + amplitudeM * season * seasonWetness > 0",
            "encoding": ("wet-season RESPONSE 0..1 per body: pools (median rim - level)/amplitude "
                         "clipped to [0, 0.35]; rivers band 1 0.35, bands 2-3 0.5; marsh sheets 1; "
                         "sea and estuary 0. Table cells carry their body's response."),
        },
        "flow": {"file": "water-flow.png", "size": int(n3), "metresPerPixel": RAW_M * STEP,
                 "flowMax": FLOW_MAX, "shoreMaxM": SHORE_MAX_M},
        "klass": {"file": "water-class.png", "size": int(n3), "metresPerPixel": RAW_M * STEP,
                  "classes": CLASSES},
        "channels": r["channels"],
        "cascades": r["cascades"],
        "stats": r["stats"],
    }
    (OUT_DIR / "water-meta.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
