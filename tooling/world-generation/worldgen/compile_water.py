"""Compile the province water ONCE from the hydrology graph (Phase 16c,
decisions 0058 / 0060 / 0063).

The graph (`world/sources/hydrology/hydrology-graph.json`) is the record:
every river reach with its level profile, every standing body with its level
and season, every fall with its plunge pool. The terrain stage built the
frozen ground to those promises. This stage REALISES them on that ground and
solves nothing: no priority flood of the province, no re-pooling of the
channel profile, no acceptance rules. Every level below comes from the graph
or from the channel solution the graph names (`channels-pass1.npz`, the same
curve the carve cut, decision 0047's one definition):

- sea: 0 on ocean-connected ground below 0 (`standing_water.sea_mask`);
- rivers: every cell inside a station's width at that station's L; a steep
  (strip) station wets only its WETTED width, because the ribbon is the water
  there and the rest of the notch is dry bed;
- standing bodies: the extent is READ from the graph's own rasters
  (`hydrology-graph-bodies.npz`: `level` per cell, `sea` with its lagoons),
  never re-flooded here — the compile realises the graph's classification
  and re-derives none of it (owner 2026-09-14). The raster gives the
  extent, the record gives the level, and this frozen ground decides which
  of those cells are wet; a promised plunge pool and a captured body are
  filled by the channel that owns them; the authored lake by the measured
  body it is realised by;
- a river through a body is the body (16a rule): inside a body's extent the
  body's level and id own the cell, no channel level survives there;
- a bounded lateral flood carries a FIELD station's level over lower ground
  beside its trench (a marsh sheet the river runs through, a captured lake),
  never into another body and never above the station's own level;
- everything else is buried at ground − 3 m.

THE HIGH-WATER LINE (owner 2026-09-13). The levels the graph records — the
water drawn on the 2D map, the extents 16b carved for — are the wet-season
HIGH water. Nothing ever rises above them: the season only draws the water
DOWN (the graph's `drySeasonLevelM`, a seasonal reach to its bed) and the
tide only falls from the line. So the runtime's lift is never positive:
`level = W − amplitudeM · response · (1 − s) / 2` for the season scalar s in
[−1, 1] (s = 1 wet season = the line; s = −1 dry season). The "table" band
above the line is kept only so the beach swash has ground to run up.

Registration is exact: exported texel i of the 2017 surface grid is the
full-res solution at sample 2i+1 (world (i+0.5)·3.65568 m; terrain sample j
sits at world j·1.828 m, packages/game-core/src/terrain/heightfield.ts).

Usage:
  python3 -m worldgen.compile_water                       # the province
  python3 -m worldgen.compile_water --footprint FILE.json # prove locality against the last compile

Writes (schema 3):
- full arrays -> <vault>/water-pass1.npz
- browser data -> apps/world-studio/public/province/water/
    water-surface.png  2017² RGB: R,G = W 16-bit (minM/maxM);
                       B = round((clamp(W − ground, −6, 24.6) + 6) / 0.12)
    water-shore.png    2017² RGB: R shore distance / shoreMaxM, G season
                       DRAW-DOWN response (× amplitudeM = metres the dry
                       season lowers this water), B tannin
    water-flow.png     1345² RGB: R,G = dir·speed (v/flowMax·0.5+0.5),
                       B = sqrt(fetch / fetchMaxM) — the sea is fully
                       developed (fetchMaxM); inland water reads the open
                       water upwind along the prevailing wind within its own
                       water (a diagonal march); a mouth or lagoon does not
                       inherit the sea's fetch
    water-class.png    1345² RGB: R class idx, G turbidity, B salinity
    water-owner.png    2017² L: 0 field / 128 strip / 255 fall footprint
    water-id.png       2017² RGB: R,G = 16-bit entity label (0 none, else
                       1 + index into meta.entities[]: the graph id of the
                       body or reach that owns the texel)
    water-meta.json    encodings, entities[], channels[] (strips keyed by
                       reach id), cascades[] (keyed by the fall reach id),
                       stats
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from . import channels as ch
from . import freeze
from . import hydrology_graph as hg
from . import standing_water as sw
from .compile_chunks import DEFAULT_HEIGHTS, NATURAL_HEIGHTS
from .export_web_chunks import encode_rg16
from .npz_io import savez as _savez
from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"
GRAPH_PATH = REPO_ROOT / "world" / "sources" / "hydrology" / "hydrology-graph.json"
FREEZE_PATH = REPO_ROOT / "world" / "sources" / "terrain" / "freeze.json"
CHANNELS_FILE = "channels-pass1.npz"      # the graph's solution, copied by carve_province next to the heights

STEP = 3                      # hydrology / flow / class grid: 4033 -> 1345
WEB_STEP = 2                  # surface grid: 4033 -> 2017
SCHEMA_VERSION = 3

LATERAL_MAX_M = 400.0         # bounded lateral flood from field channel cells (33 cells hit 200 m, 2026-09-13)
TABLE_RISE_M = 2.0            # dry cells this close above water carry its level (the swash band)
TABLE_MAX_M = 30.0            # ...within this distance
BURY_M = 3.0
HOVER_MIN_DROP_M = 0.05       # a dry neighbour this far under a wet cell's W is a hole
CLIFF_DROP_M = 2.5            # in-width ground this far under the bed is a cliff foot, not river
SAIL_GUARD_WIN = 65           # full-res samples (~120 m) for the buried-below-water guard
DEPTH_MIN_M, DEPTH_SPAN_M = -6.0, 30.6
DEPTH_QUANTUM_M = DEPTH_SPAN_M / 255.0
# --- the season is a DRAW-DOWN from the high-water line (owner 2026-09-13) ---
SEASON_AMPLITUDE_M = sw.SEASON_AMPLITUDE_M        # the scale the response is encoded against (1.4 m)
DRY_SEASON_FRACTION = 0.2                          # = hydrology_graph.DRY_SEASON_FRACTION: a body's dry level
RIVER_RESPONSE = {1: 0.35, 2: 0.5, 3: 0.5}         # perennial reaches draw down DRY_SEASON_FRACTION x this x amplitude
SEASONAL_REACH_DRY_MARGIN_M = 0.10                 # a seasonal reach draws down to its bed and a little past it
SEASON_TAPER_M = 60.0                              # a river's response ramps to its receiving body's over this
STRIP_JOIN_BLEND_M = 6.0                           # a strip's level ramps from the field's L to its own over this
BODY_CAP_CELLS = 2                                 # a lateral flood within this many cells of a body never stands above it
BODY_LEVEL_EPS_M = 0.005                           # half the graph's 0.01 m level rounding: the spill cell stays dry
IN_BOX_CHANNEL_TOL_M = 0.3                         # in-box flood: a river up to this far under the level still runs THROUGH the body
GROUND_CAP_TOL_M = 0.7                             # drawn width: ground this far over a station's level still counts as under the water.
                                                   # The cap exists to stop the ribbon being drawn INTO ROCK, not to re-measure the
                                                   # trench. The carved parabola bed(t) = L - D*ramp*(1 - t^2) meets the level AT the
                                                   # trench edge, so on a 1.83 m sample grid a ~3.2 m half-width is two or three
                                                   # samples and a tighter tolerance caps on the bank's own sampling noise
                                                   # (measured 2026-09-14: 0.15 m capped 9,897 stations, median ratio 0.864).
                                                   # 0.7 m is the tolerance test_strip_points_sit_inside_their_trench uses at
                                                   # 0.7 x the half-width, for exactly this reason.
MIN_DRAWN_HALF_WIDTH_M = 0.5                       # ...and the drawn half-width never falls under this (a river is never a line)
RIM_LEAK_TOL_M = 0.01                              # rim leak census: under test_no_body_stands_above_its_rim's own tolerance (6 mm for the record's rounding), so the census covers everything that gate measures
FLOOD_PAD_CELLS = 8                                # a body's flood window: the graph's bbox plus this (~15 m); the
FLOOD_WINDOW_GROWTHS = 0                           # box IS the extent (the graph flooded it on the shaped ground); a
                                                   # flood reaching the window is leaking through a carved outlet: what
                                                   # lies outside the box is then eroded back from its leak (dry_leaks)
# --- the graph is the classification; the compile re-derives none of it (owner 2026-09-14) ---
SEA_LEVEL_TOL_M = 0.05        # a station or body this close to 0 stands in the sea's water
LEAK_TOL_M = 0.05             # a lateral sheet cell over a dry neighbour this far under its W would drain: dried
SPECK_MIN_CELLS = 6           # a lateral sheet under this many full-res cells (~20 m²) is not the map's water
HOLLOW_GROWTH_MAX = 2.0       # `flood_carve_hollows`: a body gaining more than this multiple of its recorded area is skipped
MOUTH_RAMP_M = 40.0           # a river's level ramps down to a lower receiving body's over this much arc
PERCHED_DROP_M = 0.3          # a channel bank standing this far over lower dry ground is perched (a levee patch seals it)
CLEAR_WATER_FACTOR = 0.35     # turbidity factor for upland/montane bodies and whitewater/clearwater reaches above the lowland
CLEAR_LOWLAND_FACTOR = 0.6    # ...and for clearwater reaches in the lowland
FLOW_MAX = 3.0
SHORE_MAX_M = 160.0
FETCH_MAX_M = 60000.0         # open-water fetch cap: Topal Bay opens to the ocean (waves.ts SEA.fetchMaxM twin)
# --- how far past the shoreline the class/turbidity/salinity label continues.
# NOT a taste number: the distance the GROUND shader reads the class raster
# at (`groundWetness.ts` gates its wet-shore band on `esWetShore < 22.0` m,
# sampled bilinearly, so a fragment at 22 m blends texels up to half a texel
# further out). Measured 2026-09-09: 4 px left 3 311 dry cells inside the
# band with no class; the derivation gives 5 px (27.42 m).
CLASS_SHADER_BAND_M = 22.0
CLASS_EXT_PX = int(math.ceil(
    (CLASS_SHADER_BAND_M + RAW_M * STEP * math.sqrt(0.5)) / (RAW_M * STEP)))
CLASS_EXT_RISE_M = 2.0        # ...and how far ABOVE its water an extension cell may stand
PROFILE_STEP_M = 1.0
PROFILE_START_M = -3.0
PROFILE_PAST_M = 25.0

CLASSES = ["none", "coast", "estuary", "river", "lake", "marsh"]
LAKE_KINDS = ("lake-lowland", "tarn-upland", "pond", "pool", "plunge-pool")
MARSH_KINDS = ("marsh-fringe", "marsh-deep", "swamp", "backswamp", "mudflat")
LAGOON_KINDS = ("lagoon",)                       # sea-level, brackish, tidal: rendered as the estuary class
CLEAR_BANDS = ("upland", "montane")
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


def decode_ids(rgb: np.ndarray) -> np.ndarray:
    """Entity label per texel from water-id.png RGB bytes (0 = none)."""
    return rgb[..., 0].astype(np.int32) * 256 + rgb[..., 1].astype(np.int32)


def quantise_depth(depth: np.ndarray) -> np.ndarray:
    return np.round((np.clip(depth, DEPTH_MIN_M, DEPTH_MIN_M + DEPTH_SPAN_M) - DEPTH_MIN_M)
                    / DEPTH_QUANTUM_M).astype(np.uint8)


def export_index(n_full: int, step: int) -> np.ndarray:
    """Full-res sample index of exported texel i: step·i + (step−1)//2.
    For the 2017 surface grid that is 2i+1 (texel centre); the 1345 grid
    uses 3i+1 (within 0.9 m of its texel centre)."""
    n = -(-n_full // step)
    return np.minimum(np.arange(n) * step + step // 2, n_full - 1)


_BOX = np.ones((3, 3), dtype=bool)


def _neighbour_levels(t: np.ndarray):
    """(highest, lowest) finite level among the 8 neighbours (-inf/+inf none)."""
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


def drain_lateral(W: np.ndarray, g: np.ndarray, keep: np.ndarray, wall: np.ndarray,
                  min_drop: float = HOVER_MIN_DROP_M, max_iters: int = 600) -> tuple[np.ndarray, int]:
    """Remove every lateral-flood cell (finite W above ground, not in `keep`)
    that has a 4-neighbour with no level whose ground lies more than
    `min_drop` under its surface, repeatedly, until the sheet is contained.
    `wall` cells never count as a leak. Returns (W, cells drained)."""
    n = W.shape[0]
    lat = np.isfinite(W) & ~keep & (W > g)
    drained = 0
    for _ in range(max_iters):
        dry_un = ~np.isfinite(W) & ~wall
        gm = np.full(W.shape, np.inf, dtype=np.float32)
        gd = np.where(dry_un, g, np.inf).astype(np.float32)
        gm[:, :-1] = np.minimum(gm[:, :-1], gd[:, 1:])
        gm[:, 1:] = np.minimum(gm[:, 1:], gd[:, :-1])
        gm[:-1, :] = np.minimum(gm[:-1, :], gd[1:, :])
        gm[1:, :] = np.minimum(gm[1:, :], gd[:-1, :])
        leak = lat & (gm < W - min_drop)
        k = int(leak.sum())
        if not k:
            break
        drained += k
        W = np.where(leak, np.float32(-np.inf), W)
        lat &= ~leak
    return W.astype(np.float32), drained


def relax_lateral(W: np.ndarray, g: np.ndarray, keep: np.ndarray, max_iters: int = 400) -> tuple[np.ndarray, int]:
    """Every connected lateral sheet (finite W above ground, not in `keep`)
    takes the minimum level over its cells; cells whose ground then stands
    above it dry out. Returns (W, cells dried)."""
    lat = np.isfinite(W) & ~keep & (W > g)
    Wl = np.where(lat, W, np.float32(np.inf)).astype(np.float32)
    for _ in range(max_iters):
        nb = ndimage.grey_erosion(Wl, size=3, mode="nearest")
        new = np.where(lat, np.minimum(Wl, nb), Wl).astype(np.float32)
        if np.array_equal(new, Wl):
            break
        Wl = new
    dried = lat & (Wl <= g)
    W = np.where(lat, np.where(dried, np.float32(-np.inf), Wl), W).astype(np.float32)
    return W, int(dried.sum())


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


def _ratio_census(pairs) -> dict:
    r = np.array([w / h for w, h in pairs if h > 0], dtype=np.float64)
    if not len(r):
        return {"n": 0}
    return {"n": int(len(r)), "min": round(float(r.min()), 3),
            "median": round(float(np.median(r)), 3), "max": round(float(r.max()), 3)}


def _terrain_sampler(refined: np.ndarray, mpp: float):
    ref = refined.astype(np.float32)

    def at(x_m, z_m):
        zs = np.atleast_1d(np.asarray(z_m, dtype=np.float64)) / mpp
        xs = np.atleast_1d(np.asarray(x_m, dtype=np.float64)) / mpp
        return ndimage.map_coordinates(ref, [zs, xs], order=1, mode="nearest")
    return at


def sheet_corridor(sol, shape, pad_m: float = 2.0) -> np.ndarray:
    """Mask of the ground each cascade's SHEET is drawn over: the corridor
    from every lip to its plunge, across the fall's width, plus the bowl and
    the brink. Where the water legitimately has lower dry rock beside it: at
    a brink the water does not end, it falls."""
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
        head_r = float(sol.width[k]) / sol.mpp
        mask[lo_y:hi_y, lo_x:hi_x] |= ((d <= r)
                                       | (np.hypot(yy - y1, xx - x1) <= bowl_r)
                                       | (np.hypot(yy - y0, xx - x0) <= head_r))
    return mask


def strip_corridor(sol, shape, pad_m: float = ch.SHOULDER_BLEND_M) -> np.ndarray:
    """Mask of the ground each STEEP run's ribbon is drawn over and the
    shoulder beside it: every steep station's width plus the carve's blend
    ring (a chute's raster edge sits inside rock that keeps falling away; the
    ribbon, not the field, is the water there, and a field sheet beside a
    chute ends at the brink of the hillside the chute descends)."""
    mask = np.zeros(shape, dtype=bool)
    n = shape[0]
    for k in np.flatnonzero((sol.kind == ch.KIND_STEEP) & ~sol.lost):
        r_m = float(sol.width[k]) * 0.5 + pad_m
        r = int(np.ceil(r_m / sol.mpp))
        cy, cx = int(round(float(sol.y[k]))), int(round(float(sol.x[k])))
        y0, y1 = max(cy - r, 0), min(cy + r + 1, n)
        x0, x1 = max(cx - r, 0), min(cx + r + 1, shape[1])
        if y1 <= y0 or x1 <= x0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        mask[y0:y1, x0:x1] |= np.hypot(yy - sol.y[k], xx - sol.x[k]) * sol.mpp <= r_m
    return mask


def hovering_edges(W, wet, assigned, g, fall_foot, min_drop: float = HOVER_MIN_DROP_M,
                   max_drop: float = ch.CANYON_MAX_M, cliff_out: list | None = None) -> np.ndarray:
    """Mask of wet cells with a 4-neighbour that is dry, unassigned (no level
    of its own) and whose ground lies >= min_drop under the wet cell's W.
    Cells in a fall footprint are excluded on both sides, and so is a drop
    of more than `max_drop` (a channel along a cliff edge; counted in
    `cliff_out`)."""
    n = g.shape[0]
    bad = np.zeros(g.shape, dtype=bool)
    cliff = 0
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        a = (slice(max(dy, 0), n + min(dy, 0)), slice(max(dx, 0), n + min(dx, 0)))
        b = (slice(max(-dy, 0), n + min(-dy, 0)), slice(max(-dx, 0), n + min(-dx, 0)))
        drop = W[a] - g[b]
        edge = wet[a] & ~wet[b] & ~assigned[b] & ~fall_foot[a] & ~fall_foot[b]
        lip = drop > max_drop
        bad[a] |= edge & (drop >= min_drop) & ~lip
        cliff += int((edge & (drop >= min_drop) & lip).sum())
    if cliff_out is not None:
        cliff_out.append(cliff)
    return bad


def water_step_edges(W, wet, lbl, body_max_label: int, min_step: float = 0.10) -> np.ndarray:
    """Mask of wet cells with a WET 4-neighbour of a different entity, one of
    the two a standing body or the sea (label <= body_max_label), whose
    surface is >= min_step lower: a wall of water where two waters meet (a
    river standing over the lake it enters, a lateral flood beside a lower
    body). Two reaches of one river meet on a slope, not a wall, so
    reach-to-reach drops are not counted. The old census only counted
    wet-against-dry."""
    n = W.shape[0]
    bad = np.zeros(W.shape, dtype=bool)
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        a = (slice(max(dy, 0), n + min(dy, 0)), slice(max(dx, 0), n + min(dx, 0)))
        b = (slice(max(-dy, 0), n + min(-dy, 0)), slice(max(-dx, 0), n + min(-dx, 0)))
        body_side = (lbl[a] <= body_max_label) | (lbl[b] <= body_max_label)
        bad[a] |= wet[a] & wet[b] & (lbl[a] != lbl[b]) & body_side & (np.abs(W[a] - W[b]) >= min_step)
    return bad


# ---------------------------------------------------------------------------
# the graph -> the ground: bodies
# ---------------------------------------------------------------------------

class BodyFlood:
    """The standing water realised from the graph on this ground.

    `level`: per-cell level (-inf where none, the sea excluded); `body`:
    per-cell label (0 none, else 1 + index into `records`); `records`: the
    graph body per label (in label order); `sea`: the sea mask; per-label
    `levels`, `areas` (cells), `sheet`; `census`.
    """

    def __init__(self, g: np.ndarray, sea: np.ndarray, level: np.ndarray, body: np.ndarray,
                 records: list[dict], census: dict):
        self.g = g
        self.sea = sea
        self.level = level.astype(np.float32)
        self.body = body.astype(np.int32)
        self.records = records
        self.census = census
        self.n = len(records)
        idx = np.arange(1, self.n + 1)
        self.levels = np.array([r["levelM"] for r in records], dtype=np.float32)
        self.areas = np.bincount(self.body.ravel(), minlength=self.n + 1)[1:] if self.n else np.zeros(0, np.int64)
        self.sheet = np.array([bool(r.get("sheet")) for r in records], dtype=bool)
        del idx

    @property
    def wet(self) -> np.ndarray:
        return self.body > 0

    @property
    def level_with_sea(self) -> np.ndarray:
        return np.where(self.sea, np.float32(0.0), self.level).astype(np.float32)

    @classmethod
    def from_solution(cls, bodies: sw.BodySolution) -> "BodyFlood":
        """A solver's bodies as a flood (the synthetic tests: no graph)."""
        recs = []
        idx = np.arange(1, bodies.n + 1)
        argmin = ndimage.minimum_position(bodies.g, bodies.body, idx) if bodies.n else []
        for i in range(bodies.n):
            dy, dx = argmin[i]
            recs.append({"id": f"body.{int(dx)}-{int(dy)}", "kind": "pond", "levelM": float(bodies.levels[i]),
                         "sheet": bool(bodies.sheet[i]), "season": "perennial",
                         "drySeasonLevelM": float(bodies.levels[i]) - DRY_SEASON_FRACTION * SEASON_AMPLITUDE_M * 0.2,
                         "deepestCell": [int(dx), int(dy)], "origin": "measured"})
        return cls(bodies.g, bodies.sea, bodies.level, bodies.body, recs, dict(bodies.census))


def flood_bodies(g: np.ndarray, exclude: np.ndarray, graph: dict, chan_level: np.ndarray | None = None,
                 chan_pooled: np.ndarray | None = None, log=print) -> BodyFlood:
    """Realise every graph body on `g`: the connected cells under its level
    (less half the record's rounding, so the spill cell stays dry and the
    flood never crosses the saddle) around its deepest cell, `exclude` (the
    ocean's seed) and any channel standing more than IN_BOX_CHANNEL_TOL_M
    LOWER excluded (a lake outlet: the body ends where the river leaves it;
    a POOLED station's cells are never excluded — a river through a body
    is the body, whatever its profile said before the carve). Skipped,
    because another owner fills them: the ocean; a promised plunge pool (the
    channel); the authored lake (its measured twin); a body lost at the
    carve. Since 2026-09-14 this runs only over the handful of bodies the
    graph's rasters do not carry (`graph_bodies`). A CAPTURED body (a channel runs through it below its level) is
    flooded like any other, to its recorded level: the 16c round-1 skip
    left 75 of them to the channel, and the sea mask then drew 16 of them
    at 0. Where two floods overlap the higher level wins and the overlap is
    counted."""
    n = g.shape[0]
    level = np.full(g.shape, -np.inf, dtype=np.float32)
    lbl = np.zeros(g.shape, dtype=np.int32)
    records: list[dict] = []
    census = {"dry": [], "overlaps": 0, "overlapCells": 0, "windowsGrown": 0, "openWindows": 0,
              "skipped": {"promised": 0, "authored": 0, "lostAtCarve": 0, "ocean": 0},
              "areaRatio": [], "captured": 0}
    for b in graph["bodies"]:
        if b["kind"] == "ocean" or b.get("deepestCell") is None:
            census["skipped"]["ocean"] += 1
            continue
        if b.get("lostAtCarve"):
            census["skipped"]["lostAtCarve"] += 1
            continue
        if b["origin"] == "promised":
            census["skipped"]["promised"] += 1
            continue
        if b["origin"] == "authored":
            census["skipped"]["authored"] += 1
            continue
        if b.get("captured"):
            census["captured"] += 1
        dx, dy = int(b["deepestCell"][0]), int(b["deepestCell"][1])
        L = float(b["levelM"])
        bb = b.get("bboxCells") or [dx - 20, dy - 20, dx + 21, dy + 21]
        x0, y0, x1, y1 = (int(v) for v in bb)
        pad = FLOOD_PAD_CELLS
        for attempt in range(FLOOD_WINDOW_GROWTHS + 1):
            X0, Y0 = max(x0 - pad, 0), max(y0 - pad, 0)
            X1, Y1 = min(x1 + pad, n), min(y1 + pad, n)
            gw = g[Y0:Y1, X0:X1]
            cand = (gw < L - BODY_LEVEL_EPS_M) & ~exclude[Y0:Y1, X0:X1]
            if chan_level is not None:
                cw = chan_level[Y0:Y1, X0:X1]
                outlet = np.isfinite(cw) & (cw < L - IN_BOX_CHANNEL_TOL_M)
                if chan_pooled is not None:
                    outlet &= ~chan_pooled[Y0:Y1, X0:X1]
                cand &= ~outlet
            if not cand[dy - Y0, dx - X0]:
                census["dry"].append({"id": b["id"], "kind": b["kind"], "levelM": L,
                                      "groundM": round(float(g[dy, dx]), 2), "areaM2": b.get("areaM2")})
                break
            comp_lbl, _nc = ndimage.label(cand, structure=_BOX)
            comp = comp_lbl == comp_lbl[dy - Y0, dx - X0]
            touches_window = ((X0 > 0 and comp[:, 0].any()) or (Y0 > 0 and comp[0].any())
                              or (X1 < n and comp[:, -1].any()) or (Y1 < n and comp[-1].any()))
            if touches_window and attempt < FLOOD_WINDOW_GROWTHS:
                pad *= 2
                census["windowsGrown"] += 1
                continue
            if touches_window:
                census["openWindows"] += 1
            sub_l = level[Y0:Y1, X0:X1]
            sub_b = lbl[Y0:Y1, X0:X1]
            over = comp & (sub_b > 0)
            if over.any():
                census["overlaps"] += 1
                census["overlapCells"] += int(over.sum())
            take = comp & (L > sub_l)
            records.append(b)
            sub_l[take] = L
            sub_b[take] = len(records)
            census["areaRatio"].append(float(comp.sum()) * RAW_M * RAW_M / max(float(b.get("areaM2") or 1.0), 1.0))
            break
    ar = np.array(census["areaRatio"], dtype=np.float64)
    census["areaRatio"] = {"n": int(ar.size), "p5": round(float(np.percentile(ar, 5)), 3) if ar.size else None,
                           "median": round(float(np.median(ar)), 3) if ar.size else None,
                           "p95": round(float(np.percentile(ar, 95)), 3) if ar.size else None,
                           "max": round(float(ar.max()), 3) if ar.size else None}
    census["realised"] = len(records)
    log(f"bodies: {len(records)} realised from the graph, {len(census['dry'])} dry on this ground, "
        f"{census['overlaps']} overlaps ({census['overlapCells']} cells), area ratio median "
        f"{census['areaRatio']['median']} p95 {census['areaRatio']['p95']} max {census['areaRatio']['max']}")
    return BodyFlood(g, exclude, level, lbl, records, census)


def graph_bodies(g: np.ndarray, graph: dict, rasters: dict, ocean_up: np.ndarray,
                 log=print) -> tuple[BodyFlood, list[dict]]:
    """Read every standing body's EXTENT from the graph's own rasters
    (`hydrology_graph.BODIES_FILE`: `level`, the graph's flood level per
    cell on the shaped ground, and `sea`, the graph's ocean mask with its
    lagoons) — nothing is flooded here (owner 2026-09-14: the compile
    realises the graph's classification and never re-derives it).

    A body whose `deepestCell` is finite in `level` takes the 8-connected
    piece of cells at that same level around it; one that is not, but that
    stands in `sea`, takes the piece of `sea & ~ocean_up` around it (a
    lagoon, a sea-level marsh joined to the sea). The record's `levelM` is
    the level — the raster gives the extent, the record gives the height.
    A body in neither raster (a promised plunge pool's twin, a body the
    graph never rasterised) is returned in the second value for the old
    in-box flood. Wet = the extent's cells that this frozen ground holds
    under that level; where two extents overlap the higher level wins."""
    sea_all = rasters["sea"]
    lv = rasters["level"]
    n = g.shape[0]
    lv_finite = np.isfinite(lv)
    sea_only = sea_all & ~ocean_up
    level = np.full(g.shape, -np.inf, dtype=np.float32)
    lbl = np.zeros(g.shape, dtype=np.int32)
    records: list[dict] = []
    census = {"dry": [], "overlaps": 0, "overlapCells": 0, "extentCellsDry": 0,
              "skipped": {"promised": 0, "authored": 0, "ocean": 0},
              "fromRaster": 0, "fromSeaRaster": 0, "floodedInBox": [], "submerged": []}
    in_box: list[dict] = []
    diff_n, diff_max = 0, 0.0
    # the deepest cells whose record level the raster CONFIRMS: a component
    # holding one of these is that body's extent, not a disagreeing body's
    agrees = np.zeros(g.shape, dtype=bool)
    for b in graph["bodies"]:
        if b["kind"] == "ocean" or b.get("deepestCell") is None or b["origin"] in ("promised", "authored"):
            continue
        dx0, dy0 = int(b["deepestCell"][0]), int(b["deepestCell"][1])
        if np.isfinite(lv[dy0, dx0]) and abs(float(lv[dy0, dx0]) - float(b["levelM"])) <= 0.006:
            agrees[dy0, dx0] = True
    for b in graph["bodies"]:
        if b["kind"] == "ocean" or b.get("deepestCell") is None:
            census["skipped"]["ocean"] += 1
            continue
        if b["origin"] == "promised":
            census["skipped"]["promised"] += 1
            continue
        if b["origin"] == "authored":
            census["skipped"]["authored"] += 1
            continue
        dx, dy = int(b["deepestCell"][0]), int(b["deepestCell"][1])
        L = float(b["levelM"])
        bb = b.get("bboxCells") or [dx - 40, dy - 40, dx + 41, dy + 41]
        x0, y0, x1, y1 = (int(v) for v in bb)
        X0, Y0 = min(max(x0 - 2, 0), dx), min(max(y0 - 2, 0), dy)
        X1, Y1 = max(min(x1 + 3, n), dx + 1), max(min(y1 + 3, n), dy + 1)
        lvd = lv[dy, dx]
        if np.isfinite(lvd):
            d = abs(float(lvd) - L)
            if d > 0.05:
                diff_n += 1
                diff_max = max(diff_max, d)
            cand = lv_finite[Y0:Y1, X0:X1] & (np.abs(lv[Y0:Y1, X0:X1] - lvd) < 0.006)
            src = "fromRaster"
            disagrees = d > 0.05
        elif sea_all[dy, dx] and sea_only[dy, dx]:
            cand = sea_only[Y0:Y1, X0:X1]
            src = "fromSeaRaster"
            disagrees = False
        else:
            in_box.append(b)
            census["floodedInBox"].append(b["id"])
            continue
        if not cand[dy - Y0, dx - X0]:
            in_box.append(b)
            census["floodedInBox"].append(b["id"])
            continue
        comp_lbl, _nc = ndimage.label(cand, structure=_BOX)
        comp = comp_lbl == comp_lbl[dy - Y0, dx - X0]
        # This body's record disagrees with the raster under it. If the
        # component it sits in is ANOTHER body's extent — one whose record
        # the raster confirms — then this body is inside that body's flood
        # and IS that body's water: skipped. Otherwise the component is
        # this body's own extent and the record was simply adjusted after
        # the raster was written (body.1002-335, the deepest graph lake:
        # record 378.77 against the raster's 378.955), so it is realised
        # here at the RECORD's level.
        if disagrees and (comp & agrees[Y0:Y1, X0:X1]).any():
            census["submerged"].append(b["id"])
            continue
        wet_cells = comp & (g[Y0:Y1, X0:X1] < L - BODY_LEVEL_EPS_M)
        census["extentCellsDry"] += int(comp.sum() - wet_cells.sum())
        if not wet_cells[dy - Y0, dx - X0]:
            census["dry"].append({"id": b["id"], "kind": b["kind"], "levelM": L,
                                  "groundM": round(float(g[dy, dx]), 2), "areaM2": b.get("areaM2")})
            continue
        sub_l = level[Y0:Y1, X0:X1]
        sub_b = lbl[Y0:Y1, X0:X1]
        over = wet_cells & (sub_b > 0)
        if over.any():
            census["overlaps"] += 1
            census["overlapCells"] += int(over.sum())
        take = wet_cells & (L > sub_l)
        records.append(b)
        sub_l[take] = L
        sub_b[take] = len(records)
        census[src] += 1
    census["realised"] = len(records)
    census["levelDiffersFromRaster"] = {"n": diff_n, "maxM": round(diff_max, 3)}
    log(f"bodies: {len(records)} realised from the graph's rasters "
        f"({census['fromRaster']} level, {census['fromSeaRaster']} sea), {len(in_box)} flooded in box, "
        f"{len(census['dry'])} dry on this ground, {census['overlaps']} overlaps "
        f"({census['overlapCells']} cells), {census['extentCellsDry']} extent cells dry")
    return BodyFlood(g, sea_all, level, lbl, records, census), in_box


def merge_floods(a: BodyFlood, b: BodyFlood, sea: np.ndarray) -> BodyFlood:
    """One flood from two (the second pass over the sea-level bodies the
    sea did not reach): labels of `b` follow `a`'s, the higher level wins
    where they overlap; `sea` becomes the flood's sea."""
    level = np.maximum(a.level, b.level)
    take_b = b.body > 0
    both = take_b & (a.body > 0)
    take_b &= ~(both & (a.level >= b.level))
    body = np.where(take_b, b.body + a.n, a.body).astype(np.int32)
    census = dict(a.census)
    census["secondPass"] = {"realised": b.n, "dry": len(b.census["dry"])}
    census["dry"] = list(a.census["dry"]) + list(b.census["dry"])
    return BodyFlood(a.g, sea, level, body, list(a.records) + list(b.records), census)


def dry_leaks(W: np.ndarray, g: np.ndarray, lateral: np.ndarray, tol: float = LEAK_TOL_M,
              max_iters: int = 400) -> tuple[np.ndarray, int]:
    """A lateral sheet cell standing over a dry 8-neighbour whose ground is
    under its own level would drain there, so it is dried — and again,
    until no cell leaks: the sheet erodes back to the ground that holds
    it. Only lateral cells (`lateral`: never a body, a channel or the sea)
    are dried. This is the hovering-shard rule: the 16c round-1 rasters
    held 4,240 wet texels standing over half a metre above a dry
    neighbour's ground (1,309 over two metres), each drawn by the field as
    a flat plate hanging in the air off a bank ("tonnes of isolated
    hovering shards", owner 2026-09-14)."""
    W = W.copy()
    dried = 0
    for _ in range(max_iters):
        wet = np.isfinite(W) & (W > g)
        low = ndimage.minimum_filter(np.where(wet, np.inf, g).astype(np.float32), size=3, mode="nearest")
        leak = wet & lateral & (low < W - tol)
        k = int(leak.sum())
        if not k:
            break
        W[leak] = -np.inf
        dried += k
    return W, dried


def dry_specks(W: np.ndarray, g: np.ndarray, lateral: np.ndarray, min_cells: int = SPECK_MIN_CELLS) -> tuple[np.ndarray, int]:
    """A lateral sheet smaller than `min_cells` (a dip on a bank, one or two
    samples wide) is not the map's water: dried."""
    wet = np.isfinite(W) & (W > g) & lateral
    lbl, n = ndimage.label(wet, structure=_BOX)
    if not n:
        return W, 0
    sizes = ndimage.sum(wet, lbl, np.arange(1, n + 1))
    small = np.isin(lbl, np.flatnonzero(sizes < min_cells) + 1)
    W = W.copy()
    W[small] = -np.inf
    return W, int(small.sum())


def _shift(a: np.ndarray, dy: int, dx: int, fill):
    """`out[i, j] = a[i + dy, j + dx]`, `fill` off the grid."""
    out = np.full(a.shape, fill, dtype=a.dtype)
    n, m = a.shape
    out[max(0, -dy):n + min(0, -dy), max(0, -dx):m + min(0, -dx)] = \
        a[max(0, dy):n + min(0, dy), max(0, dx):m + min(0, dx)]
    return out


_OFFSETS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def backwater_body_cells(sol: ch.ChannelSolution, near: np.ndarray, in_chan: np.ndarray,
                        reach_ids, reach_rec: dict, bodies: BodyFlood) -> tuple[np.ndarray, int]:
    """Per channel cell, the LABEL of the body its `horizontal-backwater`
    reach names (-1 the ocean, 0 none) — the mapping `join_carve_cuts` needs
    to let a backwater's trench join the body it runs through (0063 §2).

    Returns (per-cell labels, count of backwater stations whose `bodyId` is
    neither a realised body nor the sea)."""
    label_of = {rec["id"]: i + 1 for i, rec in enumerate(bodies.records)}
    st = np.zeros(sol.n, dtype=np.int32)
    unrealised = 0
    for k in range(sol.n):
        rid = reach_ids[k] if reach_ids is not None else None
        rr = reach_rec.get(rid) if rid is not None else None
        if rr is None or rr.get("kind") != "horizontal-backwater":
            continue
        bid = rr.get("bodyId")
        if bid == "body.ocean":
            st[k] = -1
        elif bid in label_of:
            st[k] = label_of[bid]
        else:
            unrealised += 1
    out = np.zeros(in_chan.shape, dtype=np.int32)
    ok = in_chan & (near >= 0)
    out[ok] = st[near[ok]]
    return out, unrealised


def join_carve_cuts(bodies: BodyFlood, sea: np.ndarray, g: np.ndarray, shaped: np.ndarray,
                    in_chan: np.ndarray, backwater_of: np.ndarray | None = None,
                    max_iters: int = 400) -> tuple[BodyFlood, np.ndarray, int]:
    """The carve's cuts join the water they touch. A cell the carve LOWERED
    (`shaped > g + 0.05`) that is dry, outside every channel corridor, and
    8-adjacent to standing water whose level is above this cell's frozen
    ground is part of that water: it takes its neighbour's level and id (the
    sea's 0 and its mask). Grown until nothing more joins.

    This is what the round-2 rim failures were: a sea-level body sitting
    beside dry ground at -1.45 m that the carve had cut away beneath it
    (label 2109, 2.80 km E 2.71 km S), counted as a rim the body
    "overtopped" when in truth the water simply runs into the cut.

    A backwater reach's trench is the body's water (0063 §2: a river through
    a body IS the body). `backwater_of` carries, per cell, the LABEL of the
    body whose `horizontal-backwater` reach owns that channel cell (-1 the
    ocean, 0 none); such a cell is allowed to join THAT body (or the sea)
    even though it lies inside a channel corridor. 400 of the 546 cells the
    round-2 compile left hovering were exactly these."""
    level = bodies.level.copy()
    lbl = bodies.body.copy()
    sea = sea.copy()
    wet = sea | (lbl > 0)
    bw = (np.zeros(g.shape, dtype=np.int32) if backwater_of is None
          else np.asarray(backwater_of, dtype=np.int32))
    cand = (shaped > g + 0.05) & ~wet & (~in_chan | (bw != 0))
    added = 0
    added_bw = 0
    for _ in range(max_iters):
        if not cand.any():
            break
        level_w = np.where(wet, np.where(sea, np.float32(0.0), level), np.float32(-np.inf)).astype(np.float32)
        lbl_ext = np.where(sea, np.int32(-1), lbl).astype(np.int32)
        best_l = np.full(g.shape, -np.inf, dtype=np.float32)
        best_k = np.zeros(g.shape, dtype=np.int32)
        for dy, dx in _OFFSETS:
            sl = _shift(level_w, dy, dx, np.float32(-np.inf))
            sk = _shift(lbl_ext, dy, dx, np.int32(0))
            better = sl > best_l
            best_l = np.where(better, sl, best_l)
            best_k = np.where(better, sk, best_k)
        take = cand & np.isfinite(best_l) & (best_l > g) & (~in_chan | (best_k == bw))
        k = int(take.sum())
        added_bw += int((take & in_chan).sum())
        if not k:
            break
        to_sea = take & (best_k < 0)
        to_body = take & (best_k > 0)
        sea[to_sea] = True
        level[to_body] = best_l[to_body]
        lbl[to_body] = best_k[to_body]
        wet |= take
        cand &= ~take
        added += k
    census = dict(bodies.census)
    census["carveJoinedCells"] = added
    census["carveJoinedBackwaterCells"] = added_bw
    return BodyFlood(bodies.g, sea, level, lbl, bodies.records, census), sea, added


def flood_carve_hollows(bodies: BodyFlood, sea: np.ndarray, g: np.ndarray, in_chan: np.ndarray,
                        chan_level: np.ndarray, mpp: float, max_iters: int = 400) -> BodyFlood:
    """The carve's cut joins the hollow behind it, not only the cut itself. The
    graph solved a body's extent on the SHAPED ground, and a reach running
    THROUGH that body then had its trench cut across ground that had separated
    a hollow from the body; on the frozen ground that hollow lies below the
    body's level and is connected to it through the cut, so the body's water
    stands in it, and a compile that absorbs only the cut cells leaves the
    trench's water hanging over dry lower ground beside it (373 of the 534
    hovering edges measured 2026-09-14 sit under a `horizontal-backwater`).
    This realises the record on the frozen ground rather than re-deriving it
    (decision 0065): the level, the identity and the bounding box all come
    from the graph — the flood only ever absorbs DRY cells inside that body's
    own `bboxCells` (padded by 2), under its recorded level, that are neither
    the sea, nor another body, nor a channel carrying its own higher water.

    Guarded: a body that would gain more than `HOLLOW_GROWTH_MAX` times its
    recorded `areaM2` is skipped whole and its id censused — a body with a
    huge box must not swallow its box."""
    level = bodies.level.copy()
    lbl = bodies.body.copy()
    n = g.shape[0]
    cell_m2 = float(mpp) * float(mpp)
    chan_level = np.asarray(chan_level, dtype=np.float32)
    added_total = 0
    bodies_grown = 0
    skipped: list[str] = []
    cap_hit = 0
    for i, rec in enumerate(bodies.records):
        k = i + 1
        L = float(rec["levelM"])
        bb = rec.get("bboxCells")
        if not bb:
            continue
        x0, y0, x1, y1 = (int(v) for v in bb)
        X0, Y0 = max(x0 - 2, 0), max(y0 - 2, 0)
        X1, Y1 = min(x1 + 3, n), min(y1 + 3, n)
        if X1 <= X0 or Y1 <= Y0:
            continue
        sub_l = level[Y0:Y1, X0:X1]
        sub_b = lbl[Y0:Y1, X0:X1]
        sub_g = g[Y0:Y1, X0:X1]
        sub_sea = sea[Y0:Y1, X0:X1]
        sub_chan = in_chan[Y0:Y1, X0:X1]
        sub_cl = chan_level[Y0:Y1, X0:X1]
        mine = sub_b == k
        if not mine.any():
            continue
        # a DRY cell the graph's box allows, under this body's level, that is
        # neither the sea, nor another body, nor a channel standing higher
        cand = (~sub_sea & (sub_b == 0) & (sub_g < L - BODY_LEVEL_EPS_M)
                & ~(sub_chan & np.isfinite(sub_cl) & (sub_cl > L)))
        if not cand.any():
            continue
        grown = mine.copy()
        gained = np.zeros_like(mine)
        area_cap = HOLLOW_GROWTH_MAX * float(rec.get("areaM2") or 0.0)
        over = False
        it = 0
        for it in range(1, max_iters + 1):
            nb = ndimage.binary_dilation(grown, structure=_BOX) & cand & ~grown
            if not nb.any():
                break
            grown |= nb
            gained |= nb
            if area_cap > 0.0 and float(gained.sum()) * cell_m2 > area_cap:
                over = True
                break
        else:
            cap_hit += 1
        if over:
            skipped.append(rec["id"])
            continue
        c = int(gained.sum())
        if not c:
            continue
        sub_l[gained] = np.float32(L)
        sub_b[gained] = np.int32(k)
        added_total += c
        bodies_grown += 1
    census = dict(bodies.census)
    census["carveFloodedHollowCells"] = added_total
    census["carveFloodedHollowBodies"] = bodies_grown
    census["carveFloodedHollowSkipped"] = skipped
    census["carveFloodedHollowIterCapHit"] = cap_hit
    return BodyFlood(bodies.g, sea, level, lbl, bodies.records, census)


def ramp_mouths(sol: ch.ChannelSolution, bodies: BodyFlood, sea: np.ndarray, ramp_m: float = MOUTH_RAMP_M) -> dict:
    """Where a river enters a body (or the sea) standing LOWER than its last
    free stations, the level ramps down to the body's over `ramp_m` of arc
    (never under the station's natural level), so no wall of water stands
    at the mouth. The profile was graded to the body's 16a level; the
    body the ground holds can sit lower (44 realised over 1 m from the 16a
    level, 16b ledger §9), and the step then showed as a hard edge where a
    riffle met its lake (0.11 km E 3.04 km S, 0.52 m, owner 2026-09-14).
    Edits `sol.L` in place; returns the census."""
    n = sol.shape[0]
    iy = np.clip(np.round(sol.y).astype(int), 0, n - 1)
    ix = np.clip(np.round(sol.x).astype(int), 0, n - 1)
    lbl = bodies.body[iy, ix]
    inb = lbl > 0
    target = np.where(inb, bodies.levels[np.maximum(lbl - 1, 0)], np.where(sea[iy, ix], 0.0, np.nan)).astype(np.float32)
    # never under the frozen bed at the station plus a film (the carve cut
    # the bed to the old profile; a level under it would be a dry station)
    floor = np.maximum(sol.natural, bodies.g[iy, ix] + 0.15).astype(np.float32)
    moved = 0
    max_move = 0.0
    for r in range(len(sol.reach_start)):
        sl = sol.stations_of(r)
        inside = np.isfinite(target[sl])
        if not inside.any() or inside.all():
            continue
        arc = sol.arc[sl]
        L = sol.L[sl].copy()
        nat = floor[sl]
        tb = target[sl]
        last_arc, last_t = np.inf, np.nan
        for i in range(len(arc) - 1, -1, -1):
            if inside[i]:
                last_arc, last_t = arc[i], tb[i]
                continue
            d = last_arc - arc[i]
            if d > ramp_m or not np.isfinite(last_t) or L[i] <= last_t + 0.01:
                continue
            t = d / ramp_m
            new = max(last_t + (L[i] - last_t) * t, float(nat[i]))
            if new < L[i] - 1e-3:
                max_move = max(max_move, float(L[i] - new))
                L[i] = new
                moved += 1
        sol.L[sl] = L.astype(np.float32)
    return {"stations": moved, "maxMoveM": round(max_move, 3)}


# ---------------------------------------------------------------------------
# the graph -> the ground: channels
# ---------------------------------------------------------------------------

FEEDER_FLOW_DEPTH_M = 0.5    # a graded outlet canal runs this deep over its bed, under the lake's level


def append_feeders(sol: ch.ChannelSolution, graph: dict, g: np.ndarray | None = None) -> tuple[ch.ChannelSolution, dict[int, str]]:
    """The terrain-stage reaches the shape stage carved (the Blackrose
    feeders, `origin: terrain-stage`, in no river): appended to the channel
    solution as field stations along their centreline, level linear from
    `levelFromM` to `levelToM`, so they are filled and drawn like any other
    reach. Returns the widened solution and {reach index: graph reach id}."""
    feeders = [r for r in graph["reaches"] if r.get("origin") == "terrain-stage" and r.get("centreline")]
    if not feeders:
        return sol, {}
    mpp = float(sol.mpp)
    n0 = sol.n
    n_r0 = len(sol.reach_start)
    cols = {k: [] for k in ("x", "y", "tx", "ty", "arc", "reach", "band", "accum", "width", "depth",
                            "floor", "bank_min", "bank_low", "centre", "centre_cell", "natural", "to_sea",
                            "pool", "L", "lip", "plunge", "pooled", "lost", "captured", "fall_drop",
                            "held", "shore", "sill", "ramp", "kind", "slope_w", "speed")}
    starts, ends, downs = [], [], []
    names: dict[int, str] = {}
    count = n0
    for f in feeders:
        pts = np.asarray(f["centreline"], dtype=np.float64) / mpp     # (east, south) -> (x, y) samples
        if len(pts) < 2:
            continue
        seg = np.hypot(*(pts[1:] - pts[:-1]).T)
        arc = np.concatenate([[0.0], np.cumsum(seg)])
        total = float(arc[-1])
        m = max(int(np.floor(total)) + 1, 2)
        s = np.linspace(0.0, total, m)
        x = np.interp(s, arc, pts[:, 0]); y = np.interp(s, arc, pts[:, 1])
        tx = np.gradient(x); ty = np.gradient(y)
        nrm = np.hypot(tx, ty); nrm[nrm == 0] = 1.0
        tx /= nrm; ty /= nrm
        backwater = abs(float(f["levelFromM"]) - float(f["levelToM"])) < 1e-3
        if backwater or g is None:
            L = np.interp(s, [0.0, total], [float(f["levelFromM"]), float(f["levelToM"])])
        else:
            # a GRADED outlet (0060 §2): the water hugs the bed the shape stage
            # graded — a flow depth over it, never above the lake it leaves,
            # never under the sea it reaches, non-increasing downstream
            bed = ndimage.map_coordinates(g, [y, x], order=1, mode="nearest")
            L = np.minimum.accumulate(np.clip(bed + FEEDER_FLOW_DEPTH_M, float(f["levelToM"]), float(f["levelFromM"])))
        width = np.full(m, float(f["widthM"]), dtype=np.float32)
        depth = np.full(m, float(f.get("depthM") or ch.CENTRE_DEPTH[3]), dtype=np.float32)
        r = n_r0 + len(starts)
        names[r] = f["id"]
        starts.append(count); count += m; ends.append(count); downs.append(-1)
        cols["x"].append(x); cols["y"].append(y); cols["tx"].append(tx); cols["ty"].append(ty)
        cols["arc"].append(s * mpp); cols["reach"].append(np.full(m, r)); cols["band"].append(np.full(m, int(f.get("band") or 3)))
        cols["accum"].append(np.zeros(m)); cols["width"].append(width); cols["depth"].append(depth)
        for key in ("floor", "bank_min", "bank_low", "centre", "centre_cell", "natural"):
            cols[key].append(L - depth)
        cols["to_sea"].append(np.full(m, not backwater)); cols["pool"].append(np.full(m, L[0] if backwater else -np.inf))
        cols["L"].append(L)
        for key in ("lip", "plunge", "lost", "captured", "held", "shore", "sill"):
            cols[key].append(np.zeros(m, dtype=bool))
        cols["pooled"].append(np.full(m, backwater))
        cols["fall_drop"].append(np.zeros(m)); cols["ramp"].append(np.ones(m)); cols["kind"].append(np.zeros(m))
        cols["slope_w"].append(np.zeros(m)); cols["speed"].append(np.full(m, float(f.get("speedMS") or 0.3)))
    if not starts:
        return sol, {}
    out = sol.copy()
    for key, parts in cols.items():
        base = getattr(sol, key)
        out.__dict__[key] = np.concatenate([base, np.concatenate(parts).astype(base.dtype)])
    out.reach_start = np.concatenate([sol.reach_start, np.asarray(starts, dtype=np.int64)])
    out.reach_end = np.concatenate([sol.reach_end, np.asarray(ends, dtype=np.int64)])
    out.down_reach = np.concatenate([sol.down_reach, np.asarray(downs, dtype=np.int64)])
    return out, names


def station_reach_ids(sol: ch.ChannelSolution, graph: dict, feeder_names: dict[int, str]) -> np.ndarray:
    """The graph reach id of every station (object array; None for a station
    no graph reach covers). A graph reach's id names the full-res cell of its
    first station, so within one channel reach the graph reaches are located
    by that cell and each runs to the next one's start."""
    n = sol.n
    out = np.full(n, None, dtype=object)
    iy = np.clip(np.round(sol.y).astype(int), 0, sol.shape[0] - 1)
    ix = np.clip(np.round(sol.x).astype(int), 0, sol.shape[1] - 1)
    cell_first: dict[tuple[int, int], list[int]] = {}
    for k in range(n):
        cell_first.setdefault((int(ix[k]), int(iy[k])), []).append(k)
    starts_by_reach: dict[int, list[tuple[int, str]]] = {}
    unplaced = 0
    for rec in graph["reaches"]:
        if rec.get("origin") == "terrain-stage":
            continue
        base = rec["id"].split("-")
        # reach.<cx>-<cy>[-<n>]
        cx, cy = int(base[0].split(".")[1]), int(base[1])
        ks = cell_first.get((cx, cy))
        if not ks:
            unplaced += 1
            continue
        # several stations may share the cell (a junction): the one whose
        # channel runs the way this reach's centreline goes
        k = ks[0]
        if len(ks) > 1 and len(rec["centreline"]) > 1:
            e1, s1 = rec["centreline"][1]
            best = None
            for kk in ks:
                k2 = min(kk + 3, int(sol.reach_end[int(sol.reach[kk])]) - 1)
                d = float(np.hypot(sol.x[k2] * RAW_M - e1, sol.y[k2] * RAW_M - s1))
                if best is None or d < best[0]:
                    best = (d, kk)
            k = best[1]
        starts_by_reach.setdefault(int(sol.reach[k]), []).append((k, rec["id"]))
    for r, items in starts_by_reach.items():
        sl = sol.stations_of(r)
        items.sort()
        for i, (k, rid) in enumerate(items):
            k_end = items[i + 1][0] if i + 1 < len(items) else sl.stop
            out[k:k_end] = rid
        # stations before the first graph reach start (a lost head) keep None
    for r, rid in feeder_names.items():
        sl = sol.stations_of(r)
        out[sl] = rid
    return out


def wetline_coarse(npz) -> np.ndarray:
    """The wet-season line's WETLAND part on the coarse grid, by the graph's
    own rule (`hydrology_graph.wet_season_line`: the Phase 3 wetlands in
    8-connected pieces of at least WETLINE_MIN_CELLS, the ocean excluded);
    the river cells and the bodies are realised by the channel and body
    floods themselves."""
    from .hydrology_graph import WETLINE_MIN_CELLS
    wet = npz["wetlands"] & ~npz["ocean"]
    lbl, n = ndimage.label(wet, structure=_BOX)
    if n:
        sz = np.bincount(lbl.ravel())
        wet = wet & (sz[lbl] >= WETLINE_MIN_CELLS)
    return wet


# ---------------------------------------------------------------------------
# the compile
# ---------------------------------------------------------------------------

def strip_levels(sol: ch.ChannelSolution, wetted: np.ndarray, mpp: float) -> np.ndarray:
    """The water level at every station as DRAWN: the profile level L,
    bankfull, steep stations included. The compiled line is the HIGH-WATER
    line (decision 0063 §5), and at high water a mountain stream fills the
    channel the carve cut for it: the level plane meets the parabolic bed
    exactly at the trench's edges (`bed(±w/2) = L`). The 16c round-1 rule
    that drew a steep station as a thin flow in the bottom of its notch
    (`L − D·ramp·(1 − r²)` over the wetted width) was retired by the owner
    on 2026-09-14: it read as a ribbon hugging the floor of an empty
    channel, broke into pieces wherever the ground poked through, dipped
    below the lip before every fall, and left the strip's raster cells too
    thin for the interaction stack. `wetted` is kept in the signature for
    the callers; it no longer changes the drawn level."""
    del wetted, mpp
    return sol.L.astype(np.float32).copy()


def ground_capped_half_width(sol: ch.ChannelSolution, g: np.ndarray, mpp: float) -> tuple[np.ndarray, dict]:
    """The drawn half-width: bankfull, capped by the GROUND (owner 2026-09-14).

    16c round 2 made the drawn water fill its trench (0063 §5). Where the
    frozen ground inside the trench stands higher than the station's level —
    a chute cut on a hillside, a bank the refine left proud — bank-to-bank
    water then stands in the air: 85 strip points read up to 1.84 m of ground
    inside the drawn edge.

    So march out from the centreline in `RAW_M * 0.5` steps to the trench
    half-width on BOTH sides, sampling the frozen ground bilinearly, and take
    the drawn half-width as the largest offset whose whole run in from the
    centreline stands at or under `L + GROUND_CAP_TOL_M` on both sides. Never
    under `MIN_DRAWN_HALF_WIDTH_M`, never over the trench.

    Returns (half-width per station, census)."""
    half = (sol.width * 0.5).astype(np.float64)
    if not sol.n:
        return half.astype(np.float32), {"groundCappedStations": 0}
    at = _terrain_sampler(g, mpp)
    step = float(mpp) * 0.5
    ns = max(1, int(np.ceil(float(np.nanmax(half)) / step)) + 1)
    offs = (np.arange(1, ns + 1, dtype=np.float64) * step)
    nx = -sol.ty.astype(np.float64)
    ny = sol.tx.astype(np.float64)
    xs = sol.x.astype(np.float64) * mpp
    zs = sol.y.astype(np.float64) * mpp
    lim = sol.L.astype(np.float64) + GROUND_CAP_TOL_M
    ok = np.ones((sol.n, ns), dtype=bool)
    for sgn in (1.0, -1.0):
        px = xs[:, None] + sgn * nx[:, None] * offs[None, :]
        pz = zs[:, None] + sgn * ny[:, None] * offs[None, :]
        gh = at(px.ravel(), pz.ravel()).reshape(sol.n, ns)
        ok &= gh <= lim[:, None]
    run = np.logical_and.accumulate(ok, axis=1).sum(axis=1).astype(np.float64) * step
    capped = np.minimum(np.maximum(run, MIN_DRAWN_HALF_WIDTH_M), half)
    live = ~sol.lost
    ratio = np.where(half > 0, capped / np.maximum(half, 1e-9), 1.0)[live]
    census = {
        "groundCappedStations": int(((capped < half - 1e-6) & live).sum()),
        "groundCapMedianRatio": round(float(np.median(ratio)), 4) if ratio.size else 1.0,
        "groundCapMinRatio": round(float(ratio.min()), 4) if ratio.size else 1.0,
    }
    cr = np.where(half > 0, capped / np.maximum(half, 1e-9), 1.0)[(capped < half - 1e-6) & live]
    census["groundCappedBelowHalf"] = int((cr < 0.5).sum())
    census["groundCapP05Ratio"] = round(float(np.percentile(cr, 5)), 4) if cr.size else 1.0
    return capped.astype(np.float32), census


def channel_raster(g: np.ndarray, sol: ch.ChannelSolution, wetted: np.ndarray, level: np.ndarray, mpp: float):
    """Every cell inside a live station's width at that station's level
    (interpolated along the reach), steep stations over their FULL width
    (bankfull, see `strip_levels`), the plunge bowls at the held level.
    Returns (w_chan, in_chan, fall_foot, near, dist, cliff_cells, bowl):
    `fall_foot` is the fall's own cells (its face and the bowl), `bowl` the
    plunge bowl alone — the field surface draws the bowl (it is the pool's
    water), so the owner raster must never stamp it as a fall footprint."""
    n = g.shape[0]
    saved_L = sol.L
    sol.L = level
    try:
        fld = ch.raster_fields(sol, g.shape)
    finally:
        sol.L = saved_L
    valid_st = ~sol.lost
    depth_cut = sol.depth_cut
    steep = sol.kind == ch.KIND_STEEP
    w_chan = np.full(g.shape, np.inf, dtype=np.float32)
    in_chan = np.zeros(g.shape, dtype=bool)
    fall_foot = np.zeros(g.shape, dtype=bool)
    cliff_cells = 0
    w_dry = np.full(g.shape, np.inf, dtype=np.float32)
    del steep
    bowl = np.zeros(g.shape, dtype=bool)
    half_drawn = np.asarray(wetted, dtype=np.float32)
    for b, nb, d, inside, lvl in fld["bands"]:
        ok = inside & valid_st[nb] & (d <= half_drawn[nb] + 0.5 * mpp)
        deep = ok & (g < lvl - depth_cut[nb] - CLIFF_DROP_M)
        cliff_cells += int(deep.sum())
        ok &= ~deep
        above = lvl > g
        w_chan = np.where(ok & above, np.minimum(w_chan, lvl), w_chan)
        w_dry = np.where(ok & ~above, np.minimum(w_dry, lvl), w_dry)
        in_chan |= ok
        fall_foot |= ok & above & (sol.kind[nb] == ch.KIND_FALL)
    w_chan = np.where(np.isfinite(w_chan), w_chan, w_dry)
    del w_dry
    near, dist = fld["near"], fld["dist"]
    del fld
    # the plunge bowl (0060 §4): centred `throwM` past the face, radius from
    # the same law the carve dug it by, at the held level
    for k in np.flatnonzero(sol.plunge & valid_st):
        geo = ch.plunge_geometry(float(sol.width[k]), float(sol.fall_drop[k]), float(depth_cut[k]))
        rb, throw = geo["radiusM"], geo["throwM"]
        bx = float(sol.x[k]) + float(sol.tx[k]) * throw / mpp
        by = float(sol.y[k]) + float(sol.ty[k]) * throw / mpp
        rr = int(np.ceil((rb + throw) / mpp)) + 1
        cy, cx = int(round(float(sol.y[k]))), int(round(float(sol.x[k])))
        y0, y1 = max(cy - rr, 0), min(cy + rr + 1, n); x0, x1 = max(cx - rr, 0), min(cx + rr + 1, n)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        along = (xx - sol.x[k]) * sol.tx[k] + (yy - sol.y[k]) * sol.ty[k]
        pool = (np.hypot(yy - by, xx - bx) * mpp <= rb) & (along >= -0.5 * mpp) & (g[y0:y1, x0:x1] < sol.L[k])
        disc = pool & ~in_chan[y0:y1, x0:x1]
        w_chan[y0:y1, x0:x1] = np.where(disc, np.minimum(w_chan[y0:y1, x0:x1], sol.L[k]), w_chan[y0:y1, x0:x1])
        in_chan[y0:y1, x0:x1] |= disc
        fall_foot[y0:y1, x0:x1] |= disc
        # the whole bowl (the face's foot cells under the landing sheet
        # included) is the pool's water: the field draws it
        bowl[y0:y1, x0:x1] |= pool
    return w_chan, in_chan, fall_foot, near, dist, cliff_cells, bowl


def reconcile_pooled(sol: ch.ChannelSolution, bodies: BodyFlood, sea: np.ndarray, reach_ids, reach_rec: dict,
                     body_rec: dict) -> dict:
    """Give every pooled (or shore) station the level of the body it stands
    in on this ground (see compute § 2b). Edits `sol.L` in place; returns the
    census. A run is only ever LOWERED (a body that rose is flooded over the
    channel by the body itself)."""
    n = sol.shape[0]
    iy = np.clip(np.round(sol.y).astype(int), 0, n - 1)
    ix = np.clip(np.round(sol.x).astype(int), 0, n - 1)
    pooled = sol.pooled | sol.shore
    target = np.full(sol.n, np.inf, dtype=np.float32)
    cause = np.full(sol.n, "", dtype=object)
    lbl = bodies.body[iy, ix]
    inb = pooled & (lbl > 0)
    target[inb] = bodies.levels[lbl[inb] - 1]
    cause[inb] = "in-body"
    at_sea = pooled & ~inb & sea[iy, ix]
    target[at_sea] = 0.0
    cause[at_sea] = "sea"
    rest = pooled & ~inb & ~at_sea
    for k in np.flatnonzero(rest):
        rr = reach_rec.get(reach_ids[k]) if reach_ids[k] is not None else None
        b = body_rec.get((rr or {}).get("bodyId")) if rr else None
        if b is None:
            continue
        if b.get("joinedSea"):
            target[k] = 0.0; cause[k] = "joined-sea"
        elif b.get("captured"):
            # the body is flooded to its recorded level (a river through a
            # body is the body); a pooled station its flood did not reach
            # on this ground takes that level, never the pre-carve channel's
            target[k] = float(b["levelM"]); cause[k] = "captured"
        elif b.get("lostAtCarve"):
            cause[k] = "lost-at-carve"
    # never under the station's own natural level (its floor plus the
    # clearance, the level the solver would have given it with no body at
    # all): a river through a basin the carve drained keeps flowing over its
    # bed instead of stopping at the level of the water that is gone
    target = np.maximum(target, sol.natural)
    move = np.isfinite(target) & (target < sol.L - 1e-3)
    by_cause = {}
    for c in ("in-body", "sea", "joined-sea", "captured"):
        by_cause[c] = int((move & (cause == c)).sum())
    by_cause["lost-at-carve (kept)"] = int((cause == "lost-at-carve").sum())
    max_move = float((sol.L - target)[move].max()) if move.any() else 0.0
    L_before = sol.L.copy()
    sol.L = np.where(move, target, sol.L).astype(np.float32)
    # inside a moved run the stations stay non-increasing downstream; the
    # stations after it (a weir cut at the old level) keep theirs — the lake
    # simply no longer reaches its sill, and the census shows the step
    # ...and inside the run the water backs up behind the highest bed
    # downstream of it (a basin the carve drained keeps a bed the trench
    # never cut, protected as the body's collar): the level there is that
    # bed plus a film, never above the old pool, so the river crosses the
    # drained floor as a pool behind a sill instead of a dry gap
    bed = bodies.g[iy, ix]
    backed = 0
    k = 0
    while k < sol.n:
        if not move[k]:
            k += 1
            continue
        j = k
        r = sol.reach[k]
        while j + 1 < sol.n and move[j + 1] and sol.reach[j + 1] == r:
            j += 1
        seg = sol.L[k:j + 1]
        back = np.maximum.accumulate((bed[k:j + 1] + 0.05)[::-1])[::-1]
        lifted = np.minimum(np.maximum(seg, back), L_before[k:j + 1])
        backed += int((lifted > seg + 1e-3).sum())
        sol.L[k:j + 1] = np.minimum.accumulate(lifted).astype(np.float32)
        k = j + 1
    return {"stations": int(move.sum()), "maxMoveM": round(max_move, 3), "byCause": by_cause,
            "backedUpBehindBed": backed}


def compute(refined: np.ndarray, npz, sol: ch.ChannelSolution, graph: dict | None = None,
            step: int = STEP, mpp: float = RAW_M, log=print, bodies: BodyFlood | None = None,
            graph_rasters: dict | None = None) -> dict:
    """Realise the water. `graph` is the hydrology graph (the province), and
    with it `graph_rasters` — `{"level", "sea"}` from the graph's own
    `hydrology_graph.BODIES_FILE`, which give every standing body its
    EXTENT (owner 2026-09-14: the compile realises the graph's
    classification, it never re-derives one). `bodies` may be given instead
    (the synthetic tests: a solver's bodies as a flood, no graph)."""
    t0 = time.perf_counter()
    g = refined.astype(np.float32)
    n = g.shape[0]
    n2 = -(-n // WEB_STEP)
    mpp2 = mpp * WEB_STEP
    ocean_up = sw.upsample(npz["ocean"], step, g.shape)
    feeder_names: dict[int, str] = {}
    if graph is not None:
        sol, feeder_names = append_feeders(sol, graph, g)
    reach_ids = station_reach_ids(sol, graph, feeder_names) if graph is not None else np.full(sol.n, None, dtype=object)
    lost = sol.lost
    valid_st = ~lost
    reach_rec = {r["id"]: r for r in graph["reaches"]} if graph is not None else {}
    body_rec = {b["id"]: b for b in graph["bodies"]} if graph is not None else {}

    # --- 1. channel cells at L: the graph's profile ---------------------------
    wetted = ch.wetted_width(sol)
    depth_cut = sol.depth_cut
    steep = sol.kind == ch.KIND_STEEP
    del wetted
    # the drawn width is bankfull, capped by the ground (owner 2026-09-14)
    drawn_half, ground_cap = ground_capped_half_width(sol, g, mpp)
    strip_level = strip_levels(sol, drawn_half, mpp)
    w_chan, in_chan, fall_foot, near, dist, cliff_cells, bowl = channel_raster(g, sol, drawn_half, strip_level, mpp)
    chan_level = np.where(in_chan & (w_chan > g), w_chan, np.float32(-np.inf)).astype(np.float32)
    log(f"channels: {int(in_chan.sum())} cells inside a width, {cliff_cells} cliff-foot cells excluded "
        f"({time.perf_counter() - t0:.0f} s)")

    # --- 2. bodies from the graph -------------------------------------------
    if bodies is None:
        if graph is None:
            raise ValueError("compute needs the graph or a BodyFlood")
        if graph_rasters is None:
            from .hydrology_graph import BODIES_FILE
            raise ValueError("compute needs graph_rasters={'level':…, 'sea':…} from the graph's own "
                             f"<vault>/{BODIES_FILE} when it is given the graph: the body extents are "
                             "READ from the graph's rasters, never re-flooded (owner 2026-09-14)")
        # a river through a body is the body: a POOLED station's cells never
        # cut a body's flood, whatever level the pre-carve profile gave them
        # a captured body's river runs THROUGH it: its captured stations must
        # never cut the body's flood either
        sol_captured = getattr(sol, "captured", np.zeros(sol.n, bool))
        chan_pooled = (near >= 0) & (sol.pooled | sol.shore | sol_captured)[np.maximum(near, 0)]
        sea_all = graph_rasters["sea"]
        bodies, in_box = graph_bodies(g, graph, graph_rasters, ocean_up, log=log)
        # the few bodies the graph's rasters do not carry are flooded in their box
        if in_box:
            second = flood_bodies(g, ocean_up | sea_all, {"bodies": in_box}, chan_level=chan_level,
                                  chan_pooled=chan_pooled, log=log)
            bodies = merge_floods(bodies, second, sea_all)
        # SUBMERGED, second source: a realised body whose own deepest cell
        # now carries ANOTHER body's label had its cells taken by a higher
        # body — it IS that body's water. Labels are never renumbered; the
        # id is simply censused (owner 2026-09-14).
        for i, rec in enumerate(bodies.records):
            dx_s, dy_s = int(rec["deepestCell"][0]), int(rec["deepestCell"][1])
            if int(bodies.body[dy_s, dx_s]) not in (0, i + 1):
                bodies.census["submerged"].append(rec["id"])
        # the sea is the graph's own sea mask less the cells a lagoon or a
        # sea-level body owns (owner 2026-09-14)
        sea = sea_all & ~(bodies.body > 0)
        bodies.sea = sea
        # the carve's cuts join the water they touch (owner 2026-09-14), and a
        # backwater reach's trench joins the body its reach names (0063 §2)
        if graph_rasters.get("shaped") is not None:
            backwater_of, bw_unrealised = backwater_body_cells(sol, near, in_chan, reach_ids, reach_rec, bodies)
            bodies, sea, joined = join_carve_cuts(bodies, sea, g, graph_rasters["shaped"], in_chan, backwater_of)
            bodies.census["backwaterStationsWithoutRealisedBody"] = bw_unrealised
            log(f"carve cuts joined to the water they touch: {joined} cells "
                f"({bodies.census.get('carveJoinedBackwaterCells', 0)} backwater-trench cells)")
            # ...and the hollow BEHIND the cut is the same water (0065)
            bodies = flood_carve_hollows(bodies, sea, g, in_chan, chan_level, mpp)
            log(f"carve hollows flooded to their bodies: {bodies.census['carveFloodedHollowCells']} cells "
                f"in {bodies.census['carveFloodedHollowBodies']} bodies "
                f"({len(bodies.census['carveFloodedHollowSkipped'])} skipped by the growth guard, "
                f"{bodies.census['carveFloodedHollowIterCapHit']} at the iteration cap)")
            sea = bodies.sea
            del backwater_of
        del chan_pooled, sea_all
    else:
        sea = bodies.sea
    lbl_body = bodies.body
    in_body = lbl_body > 0

    # --- 2b. reconcile the pooled runs with the bodies the ground holds ------
    # The profile was solved before the carve; the carve then re-measured,
    # captured, joined to the sea or lost some of the bodies it was pooled
    # in (0059 extension rule, recorded in the graph). A pooled station takes
    # the level of the body it stands in NOW; over the sea, 0; in a captured
    # body, the channel's level through it. The stations below the run (a
    # weir cut at the old level) keep theirs: the step is counted, never
    # hidden by a dry sill.
    reconciled = reconcile_pooled(sol, bodies, sea, reach_ids, reach_rec, body_rec)
    ramped = ramp_mouths(sol, bodies, sea)
    if reconciled["stations"] or ramped["stations"]:
        drawn_half, ground_cap = ground_capped_half_width(sol, g, mpp)
        strip_level = strip_levels(sol, drawn_half, mpp)
        w_chan, in_chan, fall_foot, near, dist, cliff_cells, bowl = channel_raster(g, sol, drawn_half, strip_level, mpp)
        log(f"reconciled {reconciled['stations']} pooled stations to their bodies "
            f"(max move {reconciled['maxMoveM']} m; {reconciled['byCause']}); "
            f"{ramped['stations']} mouth stations ramped (max {ramped['maxMoveM']} m); channels re-rastered")
    # a river through a body is the body: inside the extent the body's level
    # owns the cell, and the channel level is forgotten there
    W = np.where(in_chan, w_chan, np.float32(-np.inf))
    W = np.where(in_body, bodies.level, W)
    W = np.where(sea, np.float32(0.0), W).astype(np.float32)
    del w_chan
    pooled_c = sol.pooled & ~sol.shore & valid_st
    iy = np.clip(np.round(sol.y).astype(int), 0, n - 1)
    ix = np.clip(np.round(sol.x).astype(int), 0, n - 1)
    pooled_no_body = int((pooled_c & ~in_body[iy, ix] & ~sea[iy, ix]).sum())

    # --- 3. bounded lateral flood from FIELD channel cells ------------------
    near_ok = near >= 0
    near_L = np.where(near_ok, ch.level_at_cells(sol, near, g.shape), -np.inf).astype(np.float32)
    # ...onto any lower ground within the bound, whichever station is
    # nearest: the level is capped at the cell's OWN station level (so an
    # upstream level is never carried down the valley), and a pool below a
    # chute backs up into the notch above it because the notch's cells are
    # under the pool's level (the old field-only rule left a hole there:
    # 315 hovering edges of 5-7 m at chute feet, 2026-09-13)
    # ...and only inside the wet-season line the owner approved on the 2D map
    # (the Phase 3 wetlands in pieces of at least WETLINE_MIN_COARSE_CELLS,
    # exactly the graph's `hydrograph-wetline`): the compile realises the
    # map's water, it does not invent floodplain sheets beside every river
    wetline = sw.upsample(wetline_coarse(npz), step, g.shape)
    lat_ok = near_ok & (dist <= LATERAL_MAX_M) & ~in_body & ~sea & wetline
    # beside a body the flood never stands above it: the level of any body
    # (or the sea) within BODY_CAP_CELLS caps the lateral level there
    # Beside a LOWER body the record is inconsistent with itself (a river
    # standing above the sheet it touches: the shoulder could not seal
    # against a body, 16b). Capping, ramping or draining the sheet there only
    # moved the wall of water a cell or two inland and opened hovering edges
    # along the new line (measured 2026-09-13: 459 / 869 of them). The sheet
    # therefore spreads as the level says, the wall is kept where the two
    # waters meet, and it is COUNTED station by station for the owner.
    body_lvl = np.where(in_body, bodies.level, np.where(sea, np.float32(0.0), np.float32(np.inf))).astype(np.float32)
    body_cap = ndimage.grey_erosion(body_lvl, size=2 * BODY_CAP_CELLS + 1, mode="nearest")
    iters = int(np.ceil(LATERAL_MAX_M / mpp))
    W = spread_lateral(W, g, near_L, lat_ok, iters)
    # ...and a sheet is ONE pool: a floodplain sheet stands at the lowest
    # river level it connects to (water runs down the floodplain to rejoin
    # the river at its lowest point), never as a staircase of each cell's
    # own station level — the staircase's risers were 326 hovering edges of
    # up to 10 m down long valleys (2026-09-13). The sheet's connected cells
    # relax to their minimum, and the ground that then stands above it dries.
    W, drained = relax_lateral(W, g, in_chan | in_body | sea)
    # ...and a sheet holds only where the ground holds it: a cell that would
    # drain into a lower dry neighbour is dried, and a sheet too small to be
    # the map's water is dried (the hovering shards, see `dry_leaks`)
    lateral_cells = ~in_chan & ~in_body & ~sea
    W, leaked = dry_leaks(W, g, lateral_cells)
    W, specks = dry_specks(W, g, lateral_cells)
    del lateral_cells, wetline
    del body_lvl, body_cap
    hi, _lo = _neighbour_levels(W)
    bound_hit = ~np.isfinite(W) & np.isfinite(hi) & lat_ok & (g < np.minimum(hi, near_L))
    bound_reaches = np.unique(sol.reach[near[bound_hit]]) if bound_hit.any() else np.zeros(0, int)
    del hi, lat_ok
    wet = np.isfinite(W) & (W > g)
    # PERCHED: a channel cell (outside any body and the sea) whose water
    # stands over PERCHED_DROP_M above a dry 8-neighbour's ground — the
    # bank the carve could not raise to the profile (SHOULDER_RAISE_CAP_M),
    # beside a lower marsh or beside plain lower ground. Measured
    # 2026-09-14 on the frozen ground: 46 % of the free lowland stations
    # have a shoulder under their level 3 m out, 2,600 by over a metre; the
    # round-1 lateral sheets hid it by flooding the ground beside every
    # river to the river's level. The owner's call (b): the rim is raised
    # as a typed `levee` patch (16b machinery), authored from this census.
    low_dry = ndimage.minimum_filter(np.where(wet, np.inf, g).astype(np.float32), size=3, mode="nearest")
    perched_cell = in_chan & ~in_body & ~sea & wet & np.isfinite(low_dry) & (low_dry < W - PERCHED_DROP_M)
    # every cell inside a station's width, the body it may run through
    # included: what a consumer asking "is there a river here" reads
    # (`chan_full`, terrain_request_postconditions); the renderer's class and
    # owner rasters use the body-masked one below (a river through a body is
    # the body)
    chan_all = in_chan.copy()
    in_chan &= ~in_body

    # --- 4. the table band (the swash's ground) ------------------------------
    W = spread_table(W, g, TABLE_RISE_M, int(np.ceil(TABLE_MAX_M / mpp)))
    assigned = np.isfinite(W)

    # --- 5. burial with the sail guard --------------------------------------
    lvl = np.where(wet, W, np.float32(np.inf))
    local_min = ndimage.grey_erosion(lvl, size=(SAIL_GUARD_WIN, SAIL_GUARD_WIN), mode="nearest")
    buried = np.minimum(g - BURY_M, np.where(np.isfinite(local_min), local_min - 1.0, np.inf))
    W = np.where(assigned, W, buried).astype(np.float32)
    del lvl, local_min, buried

    # --- 5b. the BODY RIM LEAK census ---------------------------------------
    # The body-side twin of the perched channel stations: a realised body
    # whose ring of dry ground carries cells UNDER its level — the water
    # stands over ground it should have flooded or been held by, and its
    # edge hovers. The ring excludes the water's own ways out (a fall's
    # footprint and the channel) exactly as test_no_body_stands_above_its_rim
    # does. The owner's call (b): these rims are raised as typed `levee`
    # patches (16b machinery), authored from this census.
    body_rim_leaks: list[dict] = []
    # a leak cell the GRAPH's own level raster holds as water is not a rim to
    # raise: it is a WALL between two graph waters standing at different
    # levels — the graph's own inconsistency, 16a's to resolve, never a patch
    _graph_water = None
    if graph_rasters is not None and graph_rasters.get("level") is not None:
        _gl = graph_rasters["level"]
        if np.shape(_gl) == np.shape(g):
            _graph_water = np.isfinite(_gl)
    if bodies.n:
        _brink = ndimage.binary_dilation(fall_foot, iterations=2)
        _ring_mask = (lbl_body == 0) & ~wet & ~chan_all & ~_brink
        _ring = np.where(_ring_mask, ndimage.grey_dilation(lbl_body, size=3), 0)
        for i, rec in enumerate(bodies.records):
            L_b = float(rec["levelM"])
            leak = (_ring == i + 1) & (g < L_b - RIM_LEAK_TOL_M)
            n_leak = int(leak.sum())
            if not n_leak:
                continue
            wall = leak & _graph_water if _graph_water is not None else np.zeros_like(leak)
            patchable = leak & ~wall
            n_wall = int(wall.sum())
            n_patch = int(patchable.sum())
            ys_l, xs_l = np.nonzero(leak)
            ys_p, xs_p = np.nonzero(patchable)
            ring_i = _ring == i + 1
            body_rim_leaks.append({
                "body": rec["id"], "kind": rec["kind"], "levelM": round(L_b, 2),
                "cells": n_leak,
                "cellsPatchable": n_patch,
                "cellsGraphWater": n_wall,
                "minRimM": round(float(g[ring_i].min()), 2),
                "eastM": round(float(xs_l.mean() * mpp)),
                "southM": round(float(ys_l.mean() * mpp)),
                # the levee authoring reads cellsM: the PATCHABLE cells only
                "cellsM": [[round(float(x * mpp)), round(float(y * mpp))]
                           for x, y in zip(xs_p[:400], ys_p[:400])],
            })
        del _brink, _ring_mask, _ring
    del _graph_water
    log(f"body rim leaks: {len(body_rim_leaks)} bodies, "
        f"{sum(r['cellsPatchable'] for r in body_rim_leaks)} patchable cells, "
        f"{sum(r['cellsGraphWater'] for r in body_rim_leaks)} graph-wall cells")

    # --- 6. entity labels: bodies, then the channel's reach ------------------
    # label 1 = the ocean; 2.. = bodies in flood order; then the graph reaches
    entities: list[dict] = [{"id": "body.ocean", "kind": "ocean", "levelM": 0.0}]
    ent_lbl = np.where(sea & wet, 1, 0).astype(np.int32)
    for i, rec in enumerate(bodies.records):
        entities.append({"id": rec["id"], "kind": rec["kind"], "levelM": rec["levelM"]})
    ent_lbl = np.where(in_body & wet, lbl_body + 1, ent_lbl)
    # the lagoons and the sea-level bodies are ordinary records now: their
    # extent came from the graph's own sea raster (owner 2026-09-14)
    tidal_labels = {1}
    lagoon_labels: set[int] = set()
    for i, rec in enumerate(bodies.records):
        if rec["kind"] in LAGOON_KINDS:
            lagoon_labels.add(i + 2)
            tidal_labels.add(i + 2)
    reach_label: dict[str, int] = {}
    st_ent = np.zeros(sol.n, dtype=np.int32)
    for k in range(sol.n):
        rid = reach_ids[k]
        if rid is None:
            continue
        if rid not in reach_label:
            reach_label[rid] = len(entities) + 1
            rr = reach_rec.get(rid, {})
            entities.append({"id": rid, "kind": rr.get("kind", "horizontal-channel"), "levelM": rr.get("levelFromM")})
        st_ent[k] = reach_label[rid]
    chan_ent = np.where(near_ok, st_ent[np.maximum(near, 0)], 0)
    ent_lbl = np.where(wet & (ent_lbl == 0), chan_ent, ent_lbl)
    del chan_ent
    # per entity, from the graph's own records: is it tidal (the ocean, a
    # lagoon, a tidal reach — the only water that carries salinity and the
    # tide), and how clear is it (an upland or montane body, a whitewater or
    # clearwater reach: the region's silt scaled down, so a mountain lake is
    # seen through and a blackwater swamp is not)
    lowland_max = float((graph or {}).get("thresholds", {}).get("lowlandMaxM", 30.0))
    ent_tidal = np.zeros(len(entities) + 1, dtype=bool)
    ent_lagoon = np.zeros(len(entities) + 1, dtype=bool)
    ent_clear = np.ones(len(entities) + 1, dtype=np.float32)
    for label in tidal_labels:
        ent_tidal[label] = True
    for label in lagoon_labels:
        ent_lagoon[label] = True
    for label, e in enumerate(entities, start=1):
        rec = body_rec.get(e["id"])
        if rec is not None:
            if rec.get("altitudeBand") in CLEAR_BANDS:
                ent_clear[label] = CLEAR_WATER_FACTOR
            continue
        rr = reach_rec.get(e["id"])
        if rr is None:
            continue
        if rr.get("tidal"):
            ent_tidal[label] = True
        water = rr.get("water")
        high = float(rr.get("levelFromM") or 0.0) > lowland_max
        if water in ("whitewater", "clearwater") and high:
            ent_clear[label] = CLEAR_WATER_FACTOR
        elif water == "clearwater":
            ent_clear[label] = CLEAR_LOWLAND_FACTOR

    # --- 7. invariants census at full res -----------------------------------
    cliff_edge: list = []
    corridor = sheet_corridor(sol, g.shape)
    ribbon = strip_corridor(sol, g.shape)
    hover = int(hovering_edges(W, wet, assigned, g, fall_foot | corridor | ribbon, cliff_out=cliff_edge).sum())
    sheet_only = int(hovering_edges(W, wet, assigned, g, fall_foot | corridor).sum())
    brink_cells = int(hovering_edges(W, wet, assigned, g, fall_foot).sum()) - sheet_only
    strip_cells = sheet_only - hover
    steps = water_step_edges(W, wet, ent_lbl, bodies.n + 1) & ~fall_foot & ~corridor & ~ribbon
    step_cells = int(steps.sum())
    step_sites = []
    if step_cells:
        ys, xs = np.nonzero(steps)
        order = np.argsort(-(W[ys, xs]))
        for j in order[:12]:
            step_sites.append([round(float(xs[j] * mpp)), round(float(ys[j] * mpp)), round(float(W[ys[j], xs[j]]), 2)])
    # a station is DRY when its bed was promised real depth and the water
    # does not reach it; a weir station (bed AT the level, depth 0 by design)
    # whose lake now sits a hand lower is a bare sill, not lost water
    st_wet = np.isfinite(W[iy, ix]) & ((W[iy, ix] >= g[iy, ix] - 0.01) | (sol.L - g[iy, ix] <= 0.05))
    live = valid_st & (sol.kind != ch.KIND_FALL)
    bed_over = live & (g[iy, ix] > sol.L + 0.01)
    dry_runs = []
    for r in np.unique(sol.reach[bed_over]):
        sl = sol.stations_of(int(r))
        ks = np.flatnonzero(bed_over[sl]) + sl.start
        dry_runs.append({"reach": reach_ids[ks[0]], "stations": int(len(ks)),
                         "eastM": round(float(sol.x[ks[0]] * mpp)), "southM": round(float(sol.y[ks[0]] * mpp)),
                         "bedOverLevelM": round(float((g[iy, ix] - sol.L)[ks].max()), 2), "band": int(sol.band[ks[0]])})
    perched_st = np.zeros(sol.n, dtype=bool)
    perched_st[np.unique(near[perched_cell & near_ok])] = True
    perched_st &= live & ~sol.pooled
    perched_runs = []
    for r in np.unique(sol.reach[perched_st]):
        sl = sol.stations_of(int(r))
        ks = np.flatnonzero(perched_st[sl]) + sl.start
        perched_runs.append({"reach": reach_ids[ks[0]], "stations": int(len(ks)),
                             "eastM": round(float(sol.x[ks[0]] * mpp)), "southM": round(float(sol.y[ks[0]] * mpp)),
                             "levelM": round(float(sol.L[ks[0]]), 2), "band": int(sol.band[ks[0]])})
    del perched_cell
    n_c = npz["rivers"].shape[1]
    coarse_id = (iy // step) * n_c + (ix // step)
    live_cells = np.unique(coarse_id[live & (np.arange(sol.n) < sol.n)])
    wet_cells = np.unique(coarse_id[live & st_wet])
    dry_cells = np.setdiff1d(live_cells, wet_cells)

    # --- 8. owner and the season draw-down ----------------------------------
    owner = np.zeros(g.shape, dtype=np.uint8)
    # (the plunge bowl is the pool's water, never a strip's: the ribbon
    # starts at the plunge point but the bowl is wider than the ribbon)
    strip_cell = in_chan & wet & near_ok & steep[np.maximum(near, 0)] & ~bowl
    owner[strip_cell] = 128
    # the fall's face only: the plunge bowl is the pool's water and the field
    # draws it (stamped as footprint in round 1, the pool had no surface
    # seen from outside — owner 2026-09-14, image copy 6)
    owner[fall_foot & ~bowl] = 255
    # per station: the metres the dry season lowers this water, as a response
    # against SEASON_AMPLITUDE_M. A perennial reach: the band rule. A seasonal
    # reach: to its bed. Near a body it ramps to the body's own draw-down.
    band_resp = np.array([0.0] + [DRY_SEASON_FRACTION * RIVER_RESPONSE[b] for b in (1, 2, 3)], dtype=np.float32)
    body_drop = np.array([max(float(r["levelM"]) - float(r.get("drySeasonLevelM", r["levelM"])), 0.0)
                          for r in bodies.records], dtype=np.float32)
    st_resp = band_resp[sol.band]
    for k in range(sol.n):
        rid = reach_ids[k]
        rr = reach_rec.get(rid) if rid is not None else None
        if rr is not None and rr.get("season") == "seasonal":
            st_resp[k] = (float(depth_cut[k]) + SEASONAL_REACH_DRY_MARGIN_M) / SEASON_AMPLITUDE_M
    st_body_resp = np.where(in_body[iy, ix], body_drop[np.maximum(lbl_body[iy, ix] - 1, 0)] / SEASON_AMPLITUDE_M,
                            np.where(sea[iy, ix], 0.0, np.nan)).astype(np.float32)
    # the taper: walk each reach upstream from every station standing in a
    # body (or the sea), ramping the response from the body's to the band's
    for r in range(len(sol.reach_start)):
        sl = sol.stations_of(r)
        arc = sol.arc[sl]
        br = st_body_resp[sl]
        resp = st_resp[sl]
        inb = np.isfinite(br)
        if not inb.any() or inb.all():
            if inb.all():
                st_resp[sl] = br
            continue
        # distance downstream to the next in-body station
        nxt = np.full(len(arc), np.inf)
        last_arc, last_resp = np.inf, 0.0
        for i in range(len(arc) - 1, -1, -1):
            if inb[i]:
                last_arc, last_resp = arc[i], br[i]
                resp[i] = br[i]
                continue
            d = last_arc - arc[i]
            if d <= SEASON_TAPER_M:
                t = d / SEASON_TAPER_M
                resp[i] = last_resp * (1.0 - t) + resp[i] * t
        st_resp[sl] = resp
    resp = np.zeros(g.shape, dtype=np.float32)
    chan_wet = in_chan & wet
    resp[chan_wet] = st_resp[np.maximum(near, 0)][chan_wet]
    lateral = wet & ~chan_wet & ~in_body & ~sea & near_ok
    resp[lateral] = st_resp[np.maximum(near, 0)][lateral]
    if bodies.n:
        resp[in_body] = (body_drop / SEASON_AMPLITUDE_M)[lbl_body[in_body] - 1]
    resp[sea] = 0.0
    resp = np.clip(resp, 0.0, 1.0)
    del chan_wet, lateral

    # --- 9. the export grids (texel i = sample 2i+1 / 3i+1) -----------------
    i2 = export_index(n, WEB_STEP)
    W2 = W[np.ix_(i2, i2)]
    g2 = g[np.ix_(i2, i2)]
    depth2 = (W2 - g2).astype(np.float32)
    depth_q = quantise_depth(depth2)
    wet2 = depth_q > int(round(-DEPTH_MIN_M / DEPTH_QUANTUM_M))
    owner2 = owner[np.ix_(i2, i2)].copy()
    owner2[(owner2 == 128) & ~wet2] = 0
    ent2 = ent_lbl[np.ix_(i2, i2)].copy()
    ent2[~wet2] = 0
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
    sea3 = sea[np.ix_(i3, i3)]
    chan3 = blk(in_chan & wet)
    marsh_lbl = np.zeros(bodies.n + 1, dtype=bool)
    lake_lbl = np.zeros(bodies.n + 1, dtype=bool)
    for i, rec in enumerate(bodies.records):
        if rec["kind"] in MARSH_KINDS:
            marsh_lbl[i + 1] = True
        else:
            lake_lbl[i + 1] = True
    body_marsh3 = blk(marsh_lbl[lbl_body])
    body_lake3 = blk(lake_lbl[lbl_body])
    # the entity under each class texel (any wet entity in the block)
    ent3 = ndimage.maximum_filter(ent_lbl, size=step)[np.ix_(i3, i3)]
    tidal3 = ent_tidal[ent3]
    lagoon3 = ent_lagoon[ent3]
    # salinity (the runtime's tide response, waterData.tideResponseOf) only
    # on the graph's tidal water: the ocean, a lagoon, a tidal reach
    salinity = np.where(tidal3, npz["salinity"].astype(np.float32)[:n3, :n3], np.float32(0.0)).astype(np.float32)
    wetlands = npz["wetlands"][:n3, :n3]
    cls = np.zeros((n3, n3), dtype=np.uint8)
    # the sea is coast, or estuary where a river freshens it — NEVER lake
    # (round 1 classed fresh sea cells as lake, which gave them the lake's
    # standing-wave blend: the whole sea rose, fell and foamed in unison)
    cls[wet3 & sea3 & (salinity >= 0.3)] = CLASSES.index("coast")
    cls[wet3 & sea3 & (salinity < 0.3)] = CLASSES.index("estuary")
    cls[wet3 & lagoon3] = CLASSES.index("estuary")
    cls[wet3 & ~sea3 & ~lagoon3 & chan3] = CLASSES.index("river")
    # a river through a body is the body: the body's kind names the class
    cls[wet3 & ~sea3 & ~lagoon3 & body_lake3] = CLASSES.index("lake")
    cls[wet3 & ~sea3 & ~lagoon3 & body_marsh3] = CLASSES.index("marsh")
    cls[wet3 & (cls == 0) & wetlands] = CLASSES.index("marsh")
    cls[wet3 & (cls == 0)] = CLASSES.index("marsh")
    regions = np.clip(npz["regions"][:n3, :n3], 0, len(REGION_SILT) - 1)
    turb = REGION_SILT[regions].copy()
    tannin = REGION_TANNIN[regions].copy()
    turb[cls == CLASSES.index("estuary")] += 0.15
    tannin = np.clip(ndimage.gaussian_filter(tannin, 1.5), 0.0, 1.0)
    ww = ndimage.binary_dilation(npz["rivers"][:n3, :n3] >= 2, iterations=2) & (tannin < 0.5)
    turb[ww] = np.maximum(turb[ww], 0.58)
    turb *= ent_clear[ent3]
    turb = np.clip(ndimage.gaussian_filter(turb, 1.5), 0.0, 1.0)
    # the FETCH: the open water upwind of every cell along the prevailing SE
    # trade (decision 0063 §6). WAVES.windDir = (0.66, -0.75) in world (x, z);
    # on the raster x = column and z = row, so the wind blows toward +col and
    # -row and the UPWIND neighbour of (r, c) is (r + 1, c - 1). One diagonal
    # run-length march up the grid: a cell's fetch is its upwind neighbour's
    # plus the diagonal step. It runs over the INLAND wet cells only — the sea
    # is fully developed and a mouth or lagoon never inherits its fetch.
    del ent3, tidal3, lagoon3
    # The open sea is FULLY DEVELOPED everywhere: its swell arrives from
    # storms beyond the province, so it is never glassy and a single
    # prevailing direction must not make every east-facing beach a lee
    # shore. The sea is therefore set at the cap OUTRIGHT, and the inland
    # march never touches it: a mouth or a lagoon reads only the open water
    # upwind WITHIN ITS OWN WATER and does not inherit the sea's fetch.
    L_step = float(mpp * step) * math.sqrt(2.0)
    fetch3 = np.zeros((n3, n3), dtype=np.float32)
    sea_wet3 = wet3 & sea3
    inl3 = wet3 & ~sea3
    # an inland wet cell whose upwind neighbour is sea or off the grid starts
    # at one step
    fetch3[n3 - 1] = np.where(inl3[n3 - 1], np.float32(L_step), 0.0)
    for r in range(n3 - 2, -1, -1):
        fetch3[r, 0] = L_step if inl3[r, 0] else 0.0
        up = np.where(inl3[r + 1, :-1], fetch3[r + 1, :-1] + L_step, np.float32(L_step))
        fetch3[r, 1:] = np.where(inl3[r, 1:], up, 0.0)
    fetch3[sea_wet3] = FETCH_MAX_M
    fetch3 = np.clip(fetch3, 0.0, FETCH_MAX_M).astype(np.float32)
    del sea_wet3
    # the class extension past the shoreline: lateral bound = the shader's
    # band, vertical bound = CLASS_EXT_RISE_M above the water (the high-water
    # line IS the seasonal maximum now). Computed from the EXPORTED surface
    # grid exactly as test_water_invariants recomputes it from the shipped
    # rasters, so the gate and the compile can never disagree by a texel.
    season_max2 = ndimage.maximum_filter(np.where(wet2, W2, np.float32(-np.inf)), size=3)
    idx2 = np.clip((((np.arange(n3) + 0.5) * (mpp * step) / mpp2) - 0.5).round().astype(int), 0, n2 - 1)
    season_max3 = season_max2[np.ix_(idx2, idx2)]
    ground3 = ndimage.minimum_filter(g, size=step)[np.ix_(i3, i3)]
    dist_px, (ky, kx) = ndimage.distance_transform_edt(~wet3, return_indices=True)
    near3 = (~wet3) & (dist_px <= CLASS_EXT_PX)
    ext = near3 & (ground3 <= season_max3[ky, kx] + CLASS_EXT_RISE_M)
    class_ext_stats = {"classExtPx": CLASS_EXT_PX, "classExtRiseM": CLASS_EXT_RISE_M,
                       "classExtCells": int(ext.sum()), "classExtRejectedByRise": int((near3 & ~ext).sum())}
    cls_ext = cls.copy()
    cls_ext[ext] = cls[ky[ext], kx[ext]]
    for arr in (turb, tannin, salinity):
        arr[ext] = arr[ky[ext], kx[ext]]
    del dist_px, ky, kx, near3, season_max2, season_max3, ground3, idx2

    # --- 10. flow (1345): centreline tangent × speed --------------------------
    vx = np.zeros((n3, n3), dtype=np.float32)
    vz = np.zeros((n3, n3), dtype=np.float32)
    cnt = np.zeros((n3, n3), dtype=np.float32)
    sel = live
    cy_ = np.minimum(iy[sel] // step, n3 - 1)
    cx_ = np.minimum(ix[sel] // step, n3 - 1)
    np.add.at(vx, (cy_, cx_), sol.tx[sel] * sol.speed[sel])
    np.add.at(vz, (cy_, cx_), sol.ty[sel] * sol.speed[sel])
    np.add.at(cnt, (cy_, cx_), 1.0)
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

    # --- 11. strips and cascades, keyed by graph reach ------------------------
    terrain_at = _terrain_sampler(g, mpp)
    x_m = sol.x * mpp
    z_m = sol.y * mpp

    def field_at(k):
        cy = int(np.clip(round(round(float(z_m[k]), 2) / mpp), 0, n - 1))
        cx = int(np.clip(round(round(float(x_m[k]), 2) / mpp), 0, n - 1))
        return float(W[cy, cx])

    def point(k, kind, y=None):
        if y is None:
            y = strip_level[k] if kind in ("steep", "lip") else sol.L[k]
        return {"x": round(float(x_m[k]), 2), "z": round(float(z_m[k]), 2),
                "y": round(float(y), 3),
                "bedY": round(float(terrain_at(x_m[k], z_m[k])[0]), 2),
                "halfWidthM": round(float(sol.width[k] * 0.5), 2),
                # bankfull (owner 2026-09-14), capped by the ground inside
                # the trench (`ground_capped_half_width`)
                "wettedHalfWidthM": round(float(drawn_half[k]), 2),
                "speedMS": round(float(sol.speed[k]), 2),
                "season": round(float(st_resp[k]), 3),
                "kind": kind}

    strips = []
    strip_len = 0.0
    per_reach_count: dict[str, int] = {}
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
        # the id: the graph reach most of the run's stations belong to; a
        # reach with several raw runs numbers them in station order
        ids = [reach_ids[k] for k in range(a, b + 1) if reach_ids[k] is not None]
        rid = max(set(ids), key=ids.count) if ids else f"reach.{int(round(float(sol.x[a])))}-{int(round(float(sol.y[a])))}"
        per_reach_count[rid] = per_reach_count.get(rid, 0) + 1
        sid = rid if per_reach_count[rid] == 1 else f"{rid}#{per_reach_count[rid]}"
        strips.append({"id": sid, "reachId": rid, "band": int(sol.band[a]), "points": pts})
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
        drop = float(sol.L[a] - sol.L[b])
        geo = ch.plunge_geometry(float(sol.width[b]), float(sol.fall_drop[b]), float(depth_cut[b]))
        # the fall's graph reach: the first fall-interior station's, else the lip's
        rid = None
        for k in range(a, b + 1):
            rr = reach_rec.get(reach_ids[k]) if reach_ids[k] is not None else None
            if rr is not None and rr.get("kind") == "vertical-fall":
                rid = reach_ids[k]
                break
        if rid is None:
            rid = reach_ids[a] or f"reach.{int(round(float(sol.x[a])))}-{int(round(float(sol.y[a])))}"
        fr = (reach_rec.get(rid) or {}).get("fall") or {}
        plunge_body = fr.get("plungeBodyId")
        cascades.append({
            "id": rid, "reachId": rid, "plungeBodyId": plunge_body, "riverBand": int(sol.band[a]),
            "lip": {"x": round(lx, 2), "y": round(float(sol.L[a]), 3), "z": round(lz, 2)},
            "plunge": {"x": round(px, 2), "y": round(float(sol.L[b]), 3), "z": round(pz, 2)},
            "direction": {"x": round(dx, 4), "y": 0, "z": round(dz, 4)},
            "widthM": round(float(sol.width[a]), 2),
            "wettedWidthM": round(float(drawn_half[a] * 2.0), 2),
            "dropM": round(drop, 3),
            "throwM": round(float(geo["throwM"]), 2), "bowlRadiusM": round(float(geo["radiusM"]), 2),
            "holdM": round(float(geo["holdM"]), 2),
            "profileStepM": PROFILE_STEP_M, "profileStartM": PROFILE_START_M,
            "profile": [round(float(v), 2) for v in prof],
            "lipSpeedMS": round(float(sol.speed[a]), 2),
        })

    # the shipped texels as the field draws them: a wet texel standing over
    # half a metre above a dry 8-neighbour's ground is a plate in the air
    # (round 1: 4,240); a wet piece of four texels or fewer is a speck
    gmin2 = ndimage.minimum_filter(np.where(wet2, np.inf, g2).astype(np.float32), size=3, mode="nearest")
    hover2 = wet2 & np.isfinite(gmin2) & (W2 - gmin2 > 0.5)
    comp2, ncomp2 = ndimage.label(wet2, structure=_BOX)
    sizes2 = ndimage.sum(wet2, comp2, np.arange(1, ncomp2 + 1)) if ncomp2 else np.zeros(0)
    del gmin2, comp2
    # graph bodies above the sea's level whose deepest cell the sea claims:
    # the round-1 defect (17 bodies, 1.3 km²); zero by construction now
    # (a captured body whose river through it is at the sea's level is the
    # sea's water by the graph's own record: listed apart, never a defect)
    drawn_as_sea, captured_at_sea = [], []
    for b in (graph["bodies"] if graph else []):
        if b.get("deepestCell") is None or b["kind"] == "ocean" or b.get("lostAtCarve") \
                or float(b["levelM"]) <= SEA_LEVEL_TOL_M \
                or not sea[int(b["deepestCell"][1]), int(b["deepestCell"][0])]:
            continue
        if b.get("captured") and float(b["terrainPrecondition"].get("channelLevelM", 1e9)) <= SEA_LEVEL_TOL_M:
            captured_at_sea.append(b["id"])
        else:
            drawn_as_sea.append(b["id"])
    stats = {
        # (the compile's seconds are PRINTED, never written: a wall-clock
        # number in a world record makes two identical builds differ)
        "hoveringEdges": hover,
        "hoveringTexels2017": int(hover2.sum()),
        "speckPieces2017": int((sizes2 <= 4).sum()),
        "lateralLeaksDried": leaked,
        "lateralSpecksDried": specks,
        "mouthStationsRamped": ramped,
        "bodiesDrawnAsSea": drawn_as_sea,
        "capturedBodiesAtSeaLevel": captured_at_sea,
        "cliffEdgeCells": int(cliff_edge[0]),
        "brinkEdgeCells": int(brink_cells),
        "stripEdgeCells": int(strip_cells),
        "bodyRimLeaks": body_rim_leaks,
        "bodyRimLeakCells": int(sum(r["cellsPatchable"] for r in body_rim_leaks)),
        "bodyRimLeakGraphWallBodies": [r["body"] for r in body_rim_leaks if r["cellsPatchable"] == 0],
        "waterStepCells": step_cells,
        "waterStepSites": step_sites,
        "boundHitCells": int(bound_hit.sum()),
        "lateralCellsDrained": drained,
        "boundHitReaches": int(len(bound_reaches)),
        "dryStations": int((live & ~st_wet).sum()),
        "bedOverLevelStations": int(bed_over.sum()),
        "bedOverLevelRuns": dry_runs,
        "pooledStationsWithoutBody": pooled_no_body,
        "pooledStationsReconciled": reconciled,
        "perchedStations": int(perched_st.sum()),
        "perchedRuns": perched_runs,
        "cliffFootCellsInWidth": cliff_cells,
        "sillStations": int(sol.sill.sum()),
        "dryCoarseRiverCells": int(len(dry_cells)),
        "liveCoarseRiverCells": int(len(live_cells)),
        "stations": int(sol.n),
        "reaches": int(len(sol.reach_start)),
        "graphReachesUnplaced": int(sum(1 for r in (graph["reaches"] if graph else []) if r.get("origin") != "terrain-stage"
                                        and r["id"] not in reach_label)),
        "stationKinds": {"field": int((sol.kind == 0).sum()), "steep": int((sol.kind == 1).sum()),
                         "fall": int((sol.kind == 2).sum()), "lost": int((sol.kind == 3).sum())},
        "stripCount": len(strips), "stripKm": round(strip_len / 1000.0, 2),
        "cascadeCount": len(cascades),
        "wettedFracCascades": _ratio_census([(c["wettedWidthM"], c["widthM"]) for c in cascades]),
        "wettedFracStrips": _ratio_census([(p["wettedHalfWidthM"], p["halfWidthM"])
                                           for s in strips for p in s["points"]]),
        **ground_cap,
        "wetFrac": round(float(wet.mean()), 4),
        "visibleWaterFrac2017": round(float(wet2.mean()), 4),
        "tableFrac2017": round(float(table2.mean()), 4),
        "maxDepthM": round(float(depth2.max()), 2),
        "ownerFrac": round(float((owner2 > 0).mean()), 6),
        "classFrac": {name: round(float((cls_ext == i).mean()), 5)
                      for i, name in enumerate(CLASSES) if i},
        "fetchMaxM": FETCH_MAX_M,
        "fetchP50M": round(float(np.median(fetch3[wet3 & sea3])), 1) if (wet3 & sea3).any() else 0.0,
        "seasonDrawdownM": {"riverBand1": round(float(band_resp[1] * SEASON_AMPLITUDE_M), 3),
                            "riverBand2": round(float(band_resp[2] * SEASON_AMPLITUDE_M), 3),
                            "bodyMax": round(float(body_drop.max()), 3) if bodies.n else 0.0,
                            "seasonalReaches": int(sum(1 for r in reach_rec.values() if r.get("season") == "seasonal"))},
        **class_ext_stats,
        "bodies": {k: v for k, v in bodies.census.items()},
        "entities": len(entities),
    }
    return {
        "W": W, "wet": wet, "assigned": assigned, "bodies": bodies, "in_chan": chan_all,
        "owner": owner, "fall_foot": fall_foot, "sea": sea, "entity": ent_lbl,
        "w2": W2, "depth2": depth2, "depth_q": depth_q, "wet2": wet2, "shore2": shore2,
        "season2": resp2, "owner2": owner2, "ground2": g2, "entity2": ent2,
        "cls": cls_ext, "turb": turb, "tannin": tannin, "salinity": salinity, "vx": vx, "vz": vz, "fetch": fetch3,
        "channels": strips, "cascades": cascades, "entities": entities, "stats": stats, "sol": sol,
    }


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

def load_graph(path: Path = GRAPH_PATH) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def provenance(refined: np.ndarray) -> dict:
    """The shas the compile is bound to: the array it ran on (the natural
    ground: the frozen base plus its applied patches), the frozen base in
    freeze.json, and the graph's shaped ground. A mismatch is a defect."""
    fz = json.loads(FREEZE_PATH.read_text(encoding="utf-8"))["frozen"]
    natural = hashlib.sha256(np.ascontiguousarray(refined).tobytes()).hexdigest()
    frozen = fz[freeze.FROZEN]["sha256"]
    shaped = fz[freeze.SHAPED]["sha256"]
    applied = DEFAULT_HEIGHTS.parent / "terrain-patches-applied.json"
    if applied.exists():
        doc = json.loads(applied.read_text(encoding="utf-8"))
        if doc.get("naturalSha256") != natural:
            raise SystemExit("compile_water: refined-height-natural-f32.npy is not the array apply_terrain_patches wrote "
                             f"({natural[:12]}… vs {str(doc.get('naturalSha256'))[:12]}…): a stage between them touched the ground")
        if doc.get("frozenSha256") != frozen:
            raise SystemExit("compile_water: the patch receipt names a different frozen base than freeze.json")
    return {"sourceHeightSha256": natural, "frozenSha256": frozen, "shapedSha256": shaped}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="compile the province water once from the hydrology graph")
    ap.add_argument("--footprint", type=Path, default=None,
                    help="a chain-footprint.json: prove the compile is local to it against the last outputs")
    a = ap.parse_args(argv)
    vault = DEFAULT_HEIGHTS.parent.parent
    npz = np.load(vault / "hydrology-pass1.npz")
    refined = np.load(NATURAL_HEIGHTS)
    sol_path = DEFAULT_HEIGHTS.parent / CHANNELS_FILE
    if not sol_path.exists():
        raise SystemExit(f"{sol_path} missing: run worldgen.carve_province first "
                         "(it carves the channels to the graph's solution and copies it here)")
    sol = ch.ChannelSolution.load(sol_path)
    graph = load_graph()
    prov = provenance(refined)
    if graph["sourceHeightSha256"] != prov["shapedSha256"]:
        raise SystemExit(f"compile_water: the graph was solved on {graph['sourceHeightSha256'][:12]}… but freeze.json's "
                         f"shaped ground is {prov['shapedSha256'][:12]}…; run `hydrology_graph derive` and the carve first")
    t0 = time.perf_counter()
    z = np.load(vault / hg.BODIES_FILE)
    shaped = np.load(vault / "heightfield-shaped-f32.npy")
    r = compute(refined, npz, sol, graph=graph,
                graph_rasters={"level": z["level"], "sea": z["sea"], "shaped": shaped})
    print(f"compiled in {time.perf_counter() - t0:.0f} s")
    if a.footprint is not None:
        prove_local(r, vault, a.footprint)
    write_outputs(r, vault, provenance=prov, graph=graph)
    print(json.dumps(r["stats"], indent=1))
    return 0


def prove_local(r: dict, vault: Path, footprint: Path) -> None:
    """The local twin of `patch_water`: against the previous compile, the
    water must be unchanged outside the footprint's boxes (padded by the
    lateral-flood reach). Exits non-zero when it is not."""
    from . import footprint as fp
    prev_path = vault / "water-pass1.npz"
    if not prev_path.exists():
        print("prove_local: no previous compile to compare against")
        return
    prev = np.load(prev_path)["w_full"]
    doc = json.loads(Path(footprint).read_text(encoding="utf-8"))
    boxes = [tuple(b) for b in doc.get("sampleBoxes", [])]
    pad = int(np.ceil((LATERAL_MAX_M + TABLE_MAX_M) / RAW_M))
    padded = [(max(y0 - pad, 0), min(y1 + pad, prev.shape[0]), max(x0 - pad, 0), min(x1 + pad, prev.shape[1]))
              for (y0, y1, x0, x1) in boxes]
    inside = fp.mask(padded, prev.shape) if padded else np.zeros(prev.shape, dtype=bool)
    delta = np.abs(r["W"] - prev)
    outside = delta > 0.01
    outside &= ~inside
    n_out = int(outside.sum())
    print(f"prove_local: {len(boxes)} boxes; {n_out} samples changed outside them (max {float(delta[~inside].max()) if (~inside).any() else 0:.3f} m)")
    if n_out:
        ys, xs = np.nonzero(outside)
        raise SystemExit(f"compile_water --footprint: the water moved outside the footprint at row {ys[0]}, col {xs[0]} "
                         f"(and {n_out - 1} more): the patches were not local")


def write_outputs(r: dict, vault: Path, *, provenance: dict, graph: dict | None = None) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bodies = r["bodies"]
    _savez(
        vault / "water-pass1.npz",
        w_full=r["W"].astype(np.float32), wet_full=r["wet"], owner_full=r["owner"],
        assigned_full=r["assigned"], chan_full=r["in_chan"],
        body_full=bodies.body, body_levels=bodies.levels,
        body_sheet=bodies.sheet, sea_full=r["sea"], entity_full=r["entity"],
        w2=r["w2"].astype(np.float32), depth2=r["depth2"].astype(np.float32),
        shore2=r["shore2"], season2=r["season2"], wet2=r["wet2"],
        cls=r["cls"], turb=r["turb"], tannin=r["tannin"], salinity=r["salinity"],
        vx=r["vx"], vz=r["vz"], fetch=r["fetch"],
        source_height_sha256=np.asarray(provenance["sourceHeightSha256"]),
        frozen_sha256=np.asarray(provenance["frozenSha256"]),
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
                      enc(np.sqrt(np.clip(r["fetch"] / FETCH_MAX_M, 0.0, 1.0)))])
    Image.fromarray(flow, mode="RGB").save(OUT_DIR / "water-flow.png")
    klass = np.dstack([r["cls"], enc(r["turb"]), enc(r["salinity"])])
    Image.fromarray(klass, mode="RGB").save(OUT_DIR / "water-class.png")
    Image.fromarray(r["owner2"], mode="L").save(OUT_DIR / "water-owner.png")
    ent = r["entity2"].astype(np.uint32)
    ids = np.dstack([(ent // 256).astype(np.uint8), (ent % 256).astype(np.uint8), np.zeros(ent.shape, np.uint8)])
    Image.fromarray(ids, mode="RGB").save(OUT_DIR / "water-id.png")

    n3 = r["cls"].shape[0]
    body_by_id = {b["id"]: b for b in (graph["bodies"] if graph else [])}
    entities = []
    for e in r["entities"]:
        rec = body_by_id.get(e["id"])
        row = dict(e)
        if rec is not None:
            row.update({"season": rec.get("season"), "drySeasonLevelM": rec.get("drySeasonLevelM"),
                        "origin": rec.get("origin")})
        entities.append(row)
    meta = {
        "schemaVersion": SCHEMA_VERSION,
        **provenance,
        "graphContentSha256": graph.get("contentSha256") if graph else None,
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
            "idFile": "water-id.png",
            "idEncoding": "R,G = 16-bit label; 0 none, else 1 + index into entities[]",
        },
        "season": {
            "file": "water-shore.png", "channel": "G", "amplitudeM": SEASON_AMPLITUDE_M,
            "model": "draw-down",
            "runtime": ("The compiled W is the HIGH-WATER line (the wet season). The season only lowers it: "
                        "level = W - amplitudeM * response * (1 - s) / 2 for the season scalar s in [-1, 1] "
                        "(s = 1 wet season = the line, s = -1 dry season); wet <=> signedDepth + lift > 0. "
                        "Nothing ever rises above the line (owner 2026-09-13)."),
            "encoding": ("DRAW-DOWN response 0..1 per texel: the dry season lowers this water by "
                         "amplitudeM * response. Bodies: (levelM - drySeasonLevelM) / amplitudeM from the graph "
                         "(marsh sheets 0.2, pools <= 0.07); perennial rivers band 1 0.07, bands 2-3 0.1; "
                         "a SEASONAL reach to its bed (dry); the sea 0. A river's response ramps to its "
                         "receiving body's over the last 60 m, so no step opens at a mouth."),
        },
        "tide": {"model": "fall-only", "runtime": "high water is the line: tideOffset = amplitude * (sin(phase) - 1) <= 0"},
        "flow": {"file": "water-flow.png", "size": int(n3), "metresPerPixel": RAW_M * STEP,
                 "flowMax": FLOW_MAX, "shoreMaxM": SHORE_MAX_M,
                 "fetchMaxM": FETCH_MAX_M,
                 "fetchEncoding": "B = sqrt(fetch / fetchMaxM): the sea is fully developed (fetchMaxM); "
                                  "inland water reads the open water upwind along the prevailing wind "
                                  "(a diagonal march), seeded from the sea"},
        "klass": {"file": "water-class.png", "size": int(n3), "metresPerPixel": RAW_M * STEP,
                  "classes": CLASSES,
                  "extPx": CLASS_EXT_PX,
                  "extM": round(CLASS_EXT_PX * RAW_M * STEP, 2),
                  "extShaderBandM": CLASS_SHADER_BAND_M,
                  "extRiseM": CLASS_EXT_RISE_M,
                  "meaning": "TYPE label over a SUPERSET of the wet area, not a wetness mask: what kind of "
                             "water a cell belongs to, out to extPx past the shore and extRiseM above the "
                             "high-water line. Wetness is the signed depth in water-surface.png B plus the "
                             "season lift. A river through a body carries the body's class."},
        "entities": entities,
        "channels": r["channels"],
        "cascades": r["cascades"],
        "stats": r["stats"],
    }
    (OUT_DIR / "water-meta.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    raise SystemExit(main())
