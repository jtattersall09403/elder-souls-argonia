"""Province terrain scour — where the land is already interesting.

HOW TO USE
----------
    cd tooling/world-generation
    python3 -m worldgen.terrain_scour                  # full sweep, ~3 min
    python3 -m worldgen.terrain_scour --no-viewshed    # ~40 s, coarser scores
    python3 -m worldgen.terrain_scour --classes summit,cove --out /tmp

Writes `world/sources/sites/candidate-sites.json` (the dataset) and
`candidate-sites.md` (the digest: authored-land area, counts by landform class
and by region). Deterministic and seeded (standard 6): the seed only breaks
ties in the greedy spacing pass, so a re-run reproduces the file byte for byte.

WHAT THIS IS FOR
----------------
Phase 11 Part 0 item 2 (decision 0041). Part 1 derives *demand* — what places
must exist. This is the *supply*: the ground that already has a shape worth
building on, hiding in, or walking to. Part 3 matches one against the other.
Interesting ground is also demand-generating: a spectacular cove should make
the author ask "what would be here?".

It does not decide what goes where, and it deliberately over-supplies: a
landform is a candidate, not a commitment.

HOW IT WORKS
------------
Every detector runs on one aligned 1345 x 1345 analysis grid at 5.48 m/px
(`site_fields.ProvinceSurvey`), producing a boolean mask plus a score raster.
A greedy harvest then takes the highest-scoring cell of each mask, suppresses
everything within that class's spacing, and repeats — so a 3 km ridge yields
ridge ends, not ten thousand ridge cells.

Each accepted site is then scored on the five axes decision 0041 names:
prominence, effort-to-reach, concealment, visibility and water relation.

ADDING A LANDFORM CLASS
-----------------------
Write a `_detect_<name>(ctx) -> (mask, score)` function, add it to `DETECTORS`
with its spacing and cap, and re-run. The list below is illustrative, never
exhaustive (0041's breadth rule) — if you can see a landform in the rasters
that is not detected, add it.
"""

from __future__ import annotations

import argparse
import json
import math
import zlib
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy import ndimage

from .regions import REGION_CLASSES
from .site_fields import REPO_ROOT, ProvinceSurvey

SCHEMA_VERSION = 1
DEFAULT_SEED = 1109                       # phase 11, part 0 item 2
DEFAULT_OUT = REPO_ROOT / "world" / "sources" / "sites"


# --------------------------------------------------------------------------- #
# raster helpers
# --------------------------------------------------------------------------- #
def _ring_offsets(radius_px: int, dirs: int = 16) -> list[tuple[int, int]]:
    """Integer (drow, dcol) offsets around a circle, deduplicated and ordered
    clockwise from north — deterministic by construction."""
    out: list[tuple[int, int]] = []
    for i in range(dirs):
        a = 2.0 * math.pi * i / dirs
        d = (int(round(-radius_px * math.cos(a))), int(round(radius_px * math.sin(a))))
        out.append(d)
    return out


def _ring(a: np.ndarray, radius_px: int, dirs: int = 16) -> np.ndarray:
    """Stack of `dirs` copies of `a` shifted to sample a ring of that radius.

    np.roll wraps; `_valid` masks the border band out afterwards, which is
    cheaper than padding and exactly as correct for our purposes.
    """
    return np.stack([np.roll(np.roll(a, dr, axis=0), dc, axis=1)
                     for dr, dc in _ring_offsets(radius_px, dirs)])


def _valid(shape: tuple[int, int], border_px: int) -> np.ndarray:
    m = np.zeros(shape, bool)
    m[border_px:-border_px, border_px:-border_px] = True
    return m


def _tpi(h: np.ndarray, radius_px: int) -> np.ndarray:
    """Topographic position index: height minus the mean of its neighbourhood.
    Positive on ridges and knolls, negative in hollows and channels."""
    size = 2 * radius_px + 1
    return h - ndimage.uniform_filter(h, size=size)


@dataclass
class Ctx:
    """Everything the detectors share, computed once."""
    s: ProvinceSurvey
    px_m: float
    h: np.ndarray            # height, metres, 1345 grid
    hs: np.ndarray           # lightly smoothed height (detector-stable)
    slope: np.ndarray
    land: np.ndarray         # detection land: no standing water, not sea
    water: np.ndarray        # detection water: standing water or sea
    ocean: np.ndarray
    river: np.ndarray        # river band > 0
    river_fat: np.ndarray    # river dilated 3 px — ring sampling misses 1-px lines
    river_band: np.ndarray
    depth: np.ndarray        # water depth on the analysis grid
    wet: np.ndarray          # wetland / seasonal flood ground
    dist_water: np.ndarray
    valid: np.ndarray

    def m2px(self, metres: float) -> int:
        return max(1, int(round(metres / self.px_m)))


def build_ctx(s: ProvinceSurvey) -> Ctx:
    from .site_fields import _resample
    h = s.height_grid
    hs = ndimage.gaussian_filter(h, 1.5)
    depth = _resample(s.water_depth_m, s.grid_n).astype(np.float32)
    # Detection uses the WATER COMPILER's surface, not the region raster's
    # open-water classes. The region raster calls some dry upland ground
    # "lake & standing water"; taking it at face value produced fords at 226 m
    # on a 45 deg mountainside. `ProvinceSurvey.open_water` (region-based)
    # stays the definition for the authored-land area, which is a different
    # question.
    ocean = s.region_grid == 0
    water = (depth > 0.05) | ocean
    return Ctx(
        s=s, px_m=s.grid_px_m, h=h, hs=hs, slope=s.slope_grid,
        land=~water, water=water, ocean=ocean,
        river=s.river_band > 0,
        river_fat=ndimage.binary_dilation(s.river_band > 0, iterations=3),
        river_band=s.river_band, depth=depth,
        # "flood plain" for detection = the marsh region family plus the
        # hydrology wetlands mask. The wetlands raster alone covers only ~10 %
        # of the province, far less than the marsh regions do, and using it
        # alone made the classic Argonian siting question ("where is the dry
        # rise?") almost undetectable.
        wet=(s.wetlands | (s.flood >= 2)
             | np.isin(s.region_grid, (3, 4, 6, 7, 8, 9, 14))),
        dist_water=s.dist_to_water_m,
        valid=_valid(h.shape, 8),
    )


# --------------------------------------------------------------------------- #
# detectors — each returns (mask, score); higher score = more interesting
# --------------------------------------------------------------------------- #
def _prominence(ctx: Ctx, radius_m: float = 800.0, dirs: int = 12,
                stride_px: int = 2) -> np.ndarray:
    """Key-col approximation: for each of `dirs` rays, walk outwards and keep
    the lowest height reached before the terrain climbs above the start; the
    highest of those minima is the col. Vectorised as a running scan."""
    steps = max(1, ctx.m2px(radius_m) // stride_px)
    running_min = np.full((dirs, *ctx.hs.shape), np.inf, dtype=np.float32)
    blocked = np.zeros((dirs, *ctx.hs.shape), bool)
    for i in range(1, steps + 1):
        samples = _ring(ctx.hs, i * stride_px, dirs)
        higher = samples > ctx.hs[None, ...]
        running_min = np.where(blocked, running_min,
                               np.minimum(running_min, samples))
        blocked |= higher
    col = np.where(np.isfinite(running_min), running_min, ctx.hs[None, ...]).max(axis=0)
    return (ctx.hs - col).astype(np.float32)


def _detect_summit(ctx: Ctx):
    r = ctx.m2px(180.0)
    peak = ctx.hs >= ndimage.maximum_filter(ctx.hs, size=2 * r + 1) - 1e-4
    prom = ctx.prominence
    mask = peak & ctx.land & ctx.valid & (prom >= 6.0)
    return mask, prom


def _detect_saddle(ctx: Ctx):
    r = ctx.m2px(70.0)
    dirs = 8
    ring = _ring(ctx.hs, r, dirs)
    higher = ring > ctx.hs[None, ...] + 1.0
    lower = ring < ctx.hs[None, ...] - 1.0
    transitions = (higher != np.roll(higher, 1, axis=0)).sum(axis=0)
    ok = (transitions == 4) & (higher.sum(axis=0) >= 2) & (lower.sum(axis=0) >= 2)
    depth = np.where(higher, ring, np.inf).min(axis=0) - ctx.hs
    depth = np.where(np.isfinite(depth), depth, 0.0)
    mask = ok & ctx.land & ctx.valid & (depth > 3.0) & (ctx.hs > 5.0)
    return mask, depth.astype(np.float32)


def _detect_ridge_end(ctx: Ctx):
    r = ctx.m2px(160.0)
    dirs = 16
    ring = _ring(ctx.hs, r, dirs)
    drop = ctx.hs[None, ...] - ring
    falls = (drop > 5.0).sum(axis=0)
    rises = (drop < -2.0).sum(axis=0)
    mask = (falls >= 11) & (rises >= 1) & (rises <= 4) & ctx.land & ctx.valid \
        & (_tpi(ctx.hs, ctx.m2px(300.0)) > 5.0)
    return mask, np.where(drop > 0, drop, 0).mean(axis=0).astype(np.float32)


def _detect_cliff_bench(ctx: Ctx):
    flat = ctx.slope < 7.0
    cliff = ctx.slope > 38.0
    r = ctx.m2px(45.0)
    near_cliff = ndimage.maximum_filter(cliff.astype(np.uint8), size=2 * r + 1) > 0
    bench_area = ndimage.uniform_filter(flat.astype(np.float32), size=2 * r + 1)
    relief = ndimage.maximum_filter(ctx.hs, size=2 * ctx.m2px(120.0) + 1) \
        - ndimage.minimum_filter(ctx.hs, size=2 * ctx.m2px(120.0) + 1)
    mask = flat & near_cliff & ctx.land & ctx.valid & (bench_area > 0.35) & (relief > 15.0)
    return mask, (bench_area * relief).astype(np.float32)


def _incision(ctx: Ctx):
    return -_tpi(ctx.hs, ctx.m2px(130.0))


def _detect_ravine(ctx: Ctx):
    inc = _incision(ctx)
    r = ctx.m2px(70.0)
    walls = ndimage.maximum_filter(ctx.slope, size=2 * r + 1)
    mask = (inc > 3.5) & (inc <= 12.0) & (walls > 24.0) & ctx.land & ctx.valid
    return mask, inc.astype(np.float32)


def _detect_gorge(ctx: Ctx):
    inc = _incision(ctx)
    r = ctx.m2px(70.0)
    walls = ndimage.maximum_filter(ctx.slope, size=2 * r + 1)
    mask = (inc > 12.0) & (walls > 30.0) & ctx.land & ctx.valid
    return mask, inc.astype(np.float32)


def _detect_box_canyon(ctx: Ctx):
    """A ravine or gorge closed on all but one or two sides — the dead end."""
    inc = _incision(ctx)
    r = ctx.m2px(140.0)
    ring = _ring(ctx.hs, r, 12)
    higher = (ring > ctx.hs[None, ...] + 6.0).sum(axis=0)
    mask = (inc > 4.0) & (higher >= 9) & ctx.land & ctx.valid
    return mask, (inc * higher / 12.0).astype(np.float32)


def _detect_enclosed_clearing(ctx: Ctx):
    """Flat, low-relief ground ringed by markedly higher land — a natural room.

    Thresholds were fitted to this province, not assumed: at +7 m over a 280 m
    ring nothing at all qualifies, because Argonia's interior relief is gentle.
    A "room" here is 5 m of wall at 350 m over half the compass.
    """
    r_local = ctx.m2px(110.0)
    relief = ndimage.maximum_filter(ctx.hs, size=2 * r_local + 1) \
        - ndimage.minimum_filter(ctx.hs, size=2 * r_local + 1)
    ring = _ring(ctx.hs, ctx.m2px(350.0), 16)
    surround = (ring > ctx.hs[None, ...] + 5.0).sum(axis=0) / 16.0
    mask = (relief < 5.0) & (surround >= 0.5) & ctx.land & ctx.valid \
        & (ctx.slope < 6.0)
    return mask, (surround * (10.0 - relief)).astype(np.float32)


def _land_components(ctx: Ctx):
    lab, n = ndimage.label(ctx.land & ctx.valid)
    return lab, n


def _detect_island(ctx: Ctx):
    lab, n = ctx.land_labels
    cell_ha = (ctx.px_m ** 2) / 10_000.0
    sizes = np.bincount(lab.ravel())
    mainland = int(sizes[1:].argmax()) + 1 if n else 0
    area_ha = sizes[lab] * cell_ha
    mask = (lab > 0) & (lab != mainland) & (area_ha >= 0.4) & (area_ha <= 60.0)
    # score the island's own high point
    score = ctx.hs - ndimage.minimum_filter(ctx.hs, size=3) + area_ha
    return mask & ctx.valid, score.astype(np.float32)


def _detect_islet(ctx: Ctx):
    lab, n = ctx.land_labels
    cell_ha = (ctx.px_m ** 2) / 10_000.0
    sizes = np.bincount(lab.ravel())
    mainland = int(sizes[1:].argmax()) + 1 if n else 0
    area_ha = sizes[lab] * cell_ha
    mask = (lab > 0) & (lab != mainland) & (area_ha > 0.01) & (area_ha < 0.4)
    return mask & ctx.valid, (ctx.hs + 1.0).astype(np.float32)


def _detect_flood_high(ctx: Ctx):
    """An isolated high in the flood plain — the only dry ground for a mile."""
    tpi = _tpi(ctx.hs, ctx.m2px(400.0))
    r = ctx.m2px(400.0)
    wetness = ndimage.uniform_filter(ctx.wet.astype(np.float32), size=2 * r + 1)
    mask = (tpi > 1.2) & (wetness > 0.6) & ctx.land & ctx.valid & (ctx.slope < 20.0)
    return mask, (tpi * wetness).astype(np.float32)


def _channel_arcs(ctx: Ctx, radius_m: float, dirs: int = 24) -> np.ndarray:
    """How many separate channel arcs cross a ring of this radius.

    Sampled against the DILATED river mask: the published channel raster is one
    pixel wide, and a 24-point ring of integer offsets steps straight over it
    (the thin-line sampling trap — with the raw mask every one of these
    detectors returned zero).
    """
    ring = _ring(ctx.river_fat.astype(np.uint8), ctx.m2px(radius_m), dirs) > 0
    return ((ring.astype(np.int8) - np.roll(ring, 1, axis=0).astype(np.int8)) == 1
            ).sum(axis=0)


def _detect_confluence(ctx: Ctx):
    """Three or more separate channel arcs crossing one ring."""
    arcs = _channel_arcs(ctx, 60.0)
    mask = ctx.river & (arcs >= 3) & ctx.valid
    return mask, (arcs + ctx.river_band).astype(np.float32)


def _detect_oxbow(ctx: Ctx):
    """A meander loop: lots of channel close by, but not a junction."""
    near = _ring(ctx.river_fat.astype(np.uint8), ctx.m2px(110.0), 24).sum(axis=0)
    mask = ctx.river & (near >= 6) & (_channel_arcs(ctx, 60.0) <= 2) & ctx.valid
    return mask, near.astype(np.float32)


def _detect_river_mouth(ctx: Ctx):
    r = ctx.m2px(60.0)
    near_sea = ndimage.maximum_filter(ctx.ocean.astype(np.uint8), size=2 * r + 1) > 0
    mask = ctx.river & near_sea & ctx.valid
    return mask, (ctx.river_band.astype(np.float32) + 1.0)


def _detect_waterfall(ctx: Ctx):
    r = ctx.m2px(45.0)
    drop = ndimage.maximum_filter(np.where(ctx.river, ctx.hs, -1e6), size=2 * r + 1) \
        - ndimage.minimum_filter(np.where(ctx.river, ctx.hs, 1e6), size=2 * r + 1)
    mask = ctx.river & (drop > 5.0) & (drop < 400.0) & ctx.valid
    return mask, drop.astype(np.float32)


def _detect_spring_head(ctx: Ctx):
    """A channel terminus: the water arrives from one side only, and there is
    no channel upstream — headwater ground above 12 m."""
    mask = ctx.river & (_channel_arcs(ctx, 110.0) <= 1) & (ctx.river_band == 1) \
        & (ctx.hs > 12.0) & ctx.valid
    return mask, ctx.hs.astype(np.float32)


def _shelter(ctx: Ctx, radius_m: float) -> np.ndarray:
    r = ctx.m2px(radius_m)
    return _ring(ctx.land.astype(np.uint8), r, 24).sum(axis=0) / 24.0


def _detect_cove(ctx: Ctx):
    shelter = ctx.shelter_250
    sea = ctx.water & ~ctx.river
    r = ctx.m2px(600.0)
    ocean_near = ndimage.maximum_filter(ctx.ocean.astype(np.uint8), size=2 * r + 1) > 0
    mask = sea & ocean_near & (shelter >= 0.55) & (shelter < 0.9) & ctx.valid
    return mask, shelter.astype(np.float32)


def _detect_natural_harbour(ctx: Ctx):
    shelter = ctx.shelter_250
    sea = ctx.water & ~ctx.river
    r = ctx.m2px(600.0)
    ocean_near = ndimage.maximum_filter(ctx.ocean.astype(np.uint8), size=2 * r + 1) > 0
    deep = ndimage.uniform_filter((ctx.depth > 2.0).astype(np.float32),
                                  size=2 * ctx.m2px(80.0) + 1)
    rl = ctx.m2px(120.0)
    easy_shore = ndimage.uniform_filter(
        (ctx.land & (ctx.slope < 10.0)).astype(np.float32), size=2 * rl + 1)
    mask = sea & ocean_near & (shelter >= 0.6) & (deep > 0.3) & (easy_shore > 0.15) \
        & ctx.valid
    return mask, (shelter * deep * (1.0 + easy_shore)).astype(np.float32)


def _detect_headland(ctx: Ctx):
    water_frac = 1.0 - ctx.shelter_250
    mask = ctx.land & (water_frac >= 0.6) & (ctx.hs > 3.0) & ctx.valid
    return mask, (water_frac * ctx.hs).astype(np.float32)


def _neck(ctx: Ctx, target: np.ndarray, max_m: float, dirs: int = 8):
    """For each cell, the narrowest opposed pair of distances to `target`.

    Used twice: land necks (isthmus, land bridge) and water necks (channel
    narrows, fords). Returns the neck width in metres (inf where none).
    """
    steps = ctx.m2px(max_m)
    half = dirs // 2
    first = np.full((dirs, *ctx.h.shape), np.inf, dtype=np.float32)
    for r in range(1, steps + 1):
        hit = _ring(target.astype(np.uint8), r, dirs) > 0
        first = np.where(hit & ~np.isfinite(first), r * ctx.px_m, first)
    widths = first[:half] + first[half:]
    return widths.min(axis=0)


def _detect_isthmus(ctx: Ctx):
    neck = ctx.land_neck
    mask = ctx.land & (neck > 30.0) & (neck <= 260.0) & ctx.valid
    return mask, (300.0 - neck).astype(np.float32)


def _detect_land_bridge(ctx: Ctx):
    neck = ctx.land_neck
    mask = ctx.land & (neck <= 30.0) & ctx.valid
    return mask, (40.0 - neck).astype(np.float32)


def _detect_water_narrows(ctx: Ctx):
    neck = ctx.water_neck
    mask = ctx.water & (neck <= 120.0) & ctx.valid
    return mask, (140.0 - neck).astype(np.float32)


def _detect_ford(ctx: Ctx):
    neck = ctx.water_neck
    r = ctx.m2px(60.0)
    banks = ndimage.minimum_filter(np.where(ctx.land, ctx.slope, 90.0), size=2 * r + 1)
    mask = (ctx.river | ctx.water) & (neck <= 70.0) & (ctx.depth < 1.2) \
        & (ctx.depth > 0.05) & (ctx.slope < 15.0) & (banks < 12.0) & ctx.valid
    return mask, (80.0 - neck).astype(np.float32)


def _detect_sinkhole(ctx: Ctx):
    """A closed depression — karst hollow, collapsed root chamber, dead pond."""
    r = ctx.m2px(150.0)
    pit = ctx.hs <= ndimage.minimum_filter(ctx.hs, size=2 * r + 1) + 1e-4
    ring = _ring(ctx.hs, r, 16)
    rim = (ring > ctx.hs[None, ...] + 2.5).sum(axis=0) / 16.0
    depth = np.where(ring > ctx.hs[None, ...], ring - ctx.hs[None, ...], 0).mean(axis=0)
    mask = pit & (rim >= 0.8) & ctx.land & ~ctx.river & ctx.valid
    return mask, depth.astype(np.float32)


# name -> (detector, spacing metres, cap, one-line description)
DETECTORS: dict[str, tuple] = {
    "summit": (_detect_summit, 260, 80, "prominent local high point"),
    "saddle": (_detect_saddle, 240, 80, "pass between two highs"),
    "ridge-end": (_detect_ridge_end, 240, 80, "spur nose, ground falling away on most sides"),
    "cliff-bench": (_detect_cliff_bench, 200, 80, "flat shelf against a rock face"),
    "ravine": (_detect_ravine, 220, 90, "incised cut, 4-12 m deep, steep walls"),
    "gorge": (_detect_gorge, 260, 60, "deep incision, > 12 m, steep walls"),
    "box-canyon": (_detect_box_canyon, 300, 60, "incised ground closed on most sides"),
    "enclosed-clearing": (_detect_enclosed_clearing, 300, 50, "flat room ringed by higher land"),
    "island": (_detect_island, 200, 60, "land body separated by open water, 0.4-60 ha"),
    "islet": (_detect_islet, 150, 50, "rock or bar under 0.4 ha"),
    "flood-high": (_detect_flood_high, 300, 70, "dry rise in the flood plain"),
    "confluence": (_detect_confluence, 220, 70, "three or more channels meeting"),
    "oxbow": (_detect_oxbow, 220, 50, "meander loop"),
    "river-mouth": (_detect_river_mouth, 300, 30, "channel meeting the sea"),
    "waterfall": (_detect_waterfall, 200, 60, "> 5 m of channel drop in 45 m"),
    "spring-head": (_detect_spring_head, 250, 60, "upstream terminus of a channel above 12 m"),
    "cove": (_detect_cove, 320, 70, "sheltered inlet off the sea"),
    "natural-harbour": (_detect_natural_harbour, 400, 30, "sheltered deep water with a landable shore"),
    "headland": (_detect_headland, 300, 60, "promontory with water on most sides"),
    "isthmus": (_detect_isthmus, 260, 60, "neck of land between two waters, 30-260 m"),
    "land-bridge": (_detect_land_bridge, 200, 50, "neck of land under 30 m — a crossing"),
    "water-narrows": (_detect_water_narrows, 220, 60, "channel pinch under 120 m — a chokepoint"),
    "ford": (_detect_ford, 200, 60, "shallow narrow crossing with easy banks"),
    "sinkhole": (_detect_sinkhole, 220, 40, "closed depression with a rim"),
}


# --------------------------------------------------------------------------- #
# harvest + scoring
# --------------------------------------------------------------------------- #
def harvest(mask: np.ndarray, score: np.ndarray, spacing_m: float, cap: int,
            px_m: float, rng: np.random.Generator) -> list[tuple[int, int, float]]:
    """Greedy highest-score-first pick with a minimum spacing.

    The seeded jitter is 1e-6 of the score range: it only decides ties between
    numerically identical cells, so the result is stable but never depends on
    numpy's argsort tie order.
    """
    rows, cols = np.nonzero(mask)
    if rows.size == 0:
        return []
    values = score[rows, cols].astype(np.float64)
    span = float(np.ptp(values)) or 1.0
    values = values + rng.random(values.size) * span * 1e-6
    order = np.argsort(-values, kind="stable")
    spacing_px = max(1.0, spacing_m / px_m)
    taken: list[tuple[int, int, float]] = []
    tr = np.empty(cap, np.float64)
    tc = np.empty(cap, np.float64)
    for i in order:
        r, c = float(rows[i]), float(cols[i])
        n = len(taken)
        if n and np.min((tr[:n] - r) ** 2 + (tc[:n] - c) ** 2) < spacing_px ** 2:
            continue
        tr[n], tc[n] = r, c
        taken.append((int(rows[i]), int(cols[i]), float(score[rows[i], cols[i]])))
        if len(taken) >= cap:
            break
    return taken


def _slug(name: str) -> str:
    return name.lower().replace(" & ", "-").replace(" ", "-").replace("/", "-")


def score_site(ctx: Ctx, x: float, z: float, row: int, col: int,
               do_viewshed: bool) -> dict:
    s = ctx.s
    prom = float(ctx.prominence[row, col])
    effort = s.effort_to_reach(x, z)
    water_d = float(ctx.dist_water[row, col])
    depth = float(ctx.depth[row, col])
    water_relation = round(float(
        max(0.0, 1.0 - water_d / 400.0) * (1.0 + 0.3 * min(depth, 3.0) / 3.0) / 1.3), 3)
    out = {
        "prominenceM": round(prom, 2),
        "prominenceScore": round(min(1.0, max(0.0, prom) / 40.0), 3),
        "effortScore": effort["effortScore"],
        "distanceToNearestRouteM": effort["distanceToNearestRouteM"],
        "nearestAnchor": effort["nearestAnchor"],
        "distanceToNearestAnchorM": effort["distanceToNearestAnchorM"],
        "waterRelationScore": water_relation,
        "distanceToWaterM": round(water_d, 1),
        "waterDepthM": round(depth, 2),
    }
    if do_viewshed:
        view = s.viewshed(x, z, 1200.0, rays=24, step_m=ctx.px_m * 2)
        out["visibilityScore"] = view["visibleFraction"]
        out["openAzimuthFraction"] = view["openAzimuthFraction"]
        out["horizonP50Deg"] = view["horizonAngleDeg"]["p50"]
        # concealment from the road/lane network within 1.5 km
        pts, hits = 0, 0
        for r in s.routes:
            if r.points_m.size == 0:
                continue
            p = r.points_m[::6]
            d = np.hypot(p[:, 0] - x, p[:, 1] - z)
            near = p[d <= 1500.0]
            for px, pz in near:
                pts += 1
                hits += s.line_of_sight(float(px), float(pz), x, z)
        out["routePointsSampled"] = pts
        out["concealmentScore"] = round(1.0 - (hits / pts if pts else 0.0), 3)
    return out


def sweep(s: ProvinceSurvey, classes: list[str], seed: int,
          do_viewshed: bool) -> dict:
    ctx = build_ctx(s)
    ctx.prominence = _prominence(ctx)
    ctx.land_labels = _land_components(ctx)
    ctx.shelter_250 = _shelter(ctx, 250.0)
    ctx.land_neck = _neck(ctx, ~ctx.land, 200.0)
    ctx.water_neck = _neck(ctx, ctx.land, 120.0)

    sites: list[dict] = []
    per_class: Counter = Counter()
    for name in classes:
        detector, spacing, cap, description = DETECTORS[name]
        # zlib.crc32, not hash(): Python's string hash is salted per process,
        # which would silently break determinism (standard 6).
        rng = np.random.default_rng([seed, zlib.crc32(name.encode())])
        mask, score = detector(ctx)
        picks = harvest(mask, score, spacing, cap, ctx.px_m, rng)
        per_class[name] = len(picks)
        for n, (row, col, value) in enumerate(picks):
            x = (col + 0.5) * ctx.px_m
            z = (row + 0.5) * ctx.px_m
            region = int(s.region_grid[row, col])
            region_slug = _slug(REGION_CLASSES[region][0])
            sites.append({
                "id": f"site.scour.{region_slug}.{name}-{n:03d}",
                "landform": name,
                "landformDescription": description,
                "worldM": [round(x, 1), round(z, 1)],
                "uv": [round(x / s.extent_m, 5), round(z / s.extent_m, 5)],
                "elevationM": round(float(ctx.h[row, col]), 2),
                "slopeDeg": round(float(ctx.slope[row, col]), 2),
                "regionClass": region,
                "regionName": REGION_CLASSES[region][0],
                "dangerBand": int(s.danger[row, col]),
                "cultureTerritory": s.culture_names.get(int(s.culture[row, col])),
                "detectorScore": round(value, 3),
                "scores": score_site(ctx, x, z, row, col, do_viewshed),
            })
    sites.sort(key=lambda site: site["id"])
    return {"sites": sites, "perClass": dict(per_class), "ctx": ctx}


def digest(doc: dict) -> str:
    area = doc["authoredLand"]
    by_class = Counter(s["landform"] for s in doc["sites"])
    by_region = Counter(s["regionName"] for s in doc["sites"])
    by_danger = Counter(s["dangerBand"] for s in doc["sites"])
    lines = [
        "# Province terrain scour — candidate sites",
        "",
        f"schemaVersion {doc['schemaVersion']} · seed {doc['seed']} · "
        f"{len(doc['sites'])} candidate sites · "
        f"{'with' if doc['viewshedComputed'] else 'WITHOUT'} viewshed scores",
        "",
        "Regenerate: `cd tooling/world-generation && "
        "python3 -m worldgen.terrain_scour`",
        "",
        "## Authored-land area (Part 1 sizes the catalogue on this)",
        "",
        f"- **Authored land: {area['authoredLandKm2']} km²** "
        f"(of a {area['provinceBoundingAreaKm2']} km² bounding square).",
        f"- Open sea {area['openSeaKm2']} km² · lakes {area['lakeKm2']} km² · "
        f"deep river/channel {area['deepRiverAndChannelKm2']} km².",
        f"- Of the authored land, {area['ofWhichShallowMarshKm2']} km² is shallow "
        "marsh (waded, poled, built on).",
        f"- {area['definition']}",
        "",
        "At module 95's Phase 11 fine-tempo density of 18–22 named POIs/km² over "
        f"D0–D3 ground, {area['authoredLandKm2']} km² implies roughly "
        f"{int(area['authoredLandKm2'] * 18)}–{int(area['authoredLandKm2'] * 22)} "
        "records if that rate applied everywhere; the D4–D5 rate of 8–12/km² "
        "pulls the real total down, and density is a per-region average with a "
        "causal shape, never a spread (0041, Part 3).",
        "",
        "## Candidates by landform class",
        "",
        "| landform | n | what it is |",
        "| --- | --- | --- |",
    ]
    for name, (_d, _sp, cap, description) in DETECTORS.items():
        n = by_class.get(name, 0)
        flag = " **(capped)**" if n >= cap else ""
        lines.append(f"| `{name}` | {n}{flag} | {description} |")
    lines += ["", "## Candidates by region class", "",
              "| region | n |", "| --- | --- |"]
    for name, n in by_region.most_common():
        lines.append(f"| {name} | {n} |")
    lines += ["", "## Candidates by danger band", "",
              " · ".join(f"D{b}: {n}" for b, n in sorted(by_danger.items())), ""]
    if doc["viewshedComputed"]:
        vis = [s["scores"]["visibilityScore"] for s in doc["sites"]]
        con = [s["scores"]["concealmentScore"] for s in doc["sites"]]
        eff = [s["scores"]["effortScore"] for s in doc["sites"]]
        lines += [
            "## Score spread (the supply's character)",
            "",
            f"- visibility p5/p50/p95: {np.percentile(vis, 5):.3f} / "
            f"{np.percentile(vis, 50):.3f} / {np.percentile(vis, 95):.3f}",
            f"- concealment p5/p50/p95: {np.percentile(con, 5):.3f} / "
            f"{np.percentile(con, 50):.3f} / {np.percentile(con, 95):.3f}",
            f"- effort-to-reach p5/p50/p95: {np.percentile(eff, 5):.3f} / "
            f"{np.percentile(eff, 50):.3f} / {np.percentile(eff, 95):.3f}",
            "",
        ]
    lines += [
        "## How to use this",
        "",
        "This is *supply*, not a plan. Part 1 derives demand; Part 3 matches the "
        "two and records why each dot won its site. Caps are per class — a "
        "capped class means the province has more of that landform than the "
        "sweep reports, so raise the cap rather than assuming scarcity.",
        "",
        "Every site can be surveyed in full with:",
        "",
        "```",
        "python3 -m worldgen.site_dossier --id <name> --x <x> --z <z> --radius 400",
        "```",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p.add_argument("--classes", help="comma-separated subset of landform classes")
    p.add_argument("--no-viewshed", action="store_true",
                   help="skip the per-site viewshed/concealment pass (much faster)")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = p.parse_args(argv)

    classes = ([c.strip() for c in args.classes.split(",")] if args.classes
               else list(DETECTORS))
    unknown = [c for c in classes if c not in DETECTORS]
    if unknown:
        p.error(f"unknown landform class(es): {', '.join(unknown)}")

    s = ProvinceSurvey()
    result = sweep(s, classes, args.seed, not args.no_viewshed)
    doc = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "candidate-sites",
        "seed": args.seed,
        "generatedBy": "worldgen.terrain_scour (Phase 11 Part 0 item 2, decision 0041)",
        "analysisGrid": {"size": s.grid_n, "metresPerPixel": round(s.grid_px_m, 5),
                         "extentM": round(s.extent_m, 2)},
        "viewshedComputed": not args.no_viewshed,
        "landformClasses": {name: {"description": d, "spacingM": sp, "cap": cap}
                            for name, (_f, sp, cap, d) in DETECTORS.items()},
        "authoredLand": s.area_report(),
        "counts": {"total": len(result["sites"]), "byClass": result["perClass"]},
        "sites": result["sites"],
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "candidate-sites.json").write_text(json.dumps(doc, indent=1) + "\n")
    (args.out / "candidate-sites.md").write_text(digest(doc))
    print(f"{len(doc['sites'])} candidate sites -> {args.out / 'candidate-sites.json'}")
    print(f"authored land {doc['authoredLand']['authoredLandKm2']} km2")


if __name__ == "__main__":
    main()
