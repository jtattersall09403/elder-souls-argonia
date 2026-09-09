"""Effort distance: how far two points are IN WALKING, not on the plan.

WHY (owner ruling 2026-09-09, decision 0041 Part 3c)
---------------------------------------------------
The isolation gates (`proximity.minFromClassM`) were straight-line plan
distances.  The type prose they were read from does not talk about plan
distance — `lone/hermit-hut` says "deliberately far from everything; the
effort-to-reach IS the design".  A hermitage 300 m from a village but 250 m
above it up a rim face is isolated; a hut 700 m across flat marsh on a track
is not.  Plan distance is why every border-rim isolation record failed its
floor while marsh records cleared theirs with room to spare.

THE CURVE
---------
Tobler's hiking function, the standard slope-dependent travel-cost model in
archaeology and GIS least-cost work:

    W(S) = 6 * exp(-3.5 * |S + 0.05|)   km/h,  S = rise/run (a ratio)

The +0.05 puts peak speed on a gentle downhill (-2.86 %), so the function is
ANISOTROPIC: A->B and B->A differ.  A siting gate is a property of a PAIR, so
we take the mean of the two traverse costs, which is symmetric by
construction and still charges the ascent (the uphill leg dominates the mean;
see `test_travel_cost`).

Tobler's off-path variant multiplies the speed by 3/5.  Every approach we are
measuring is off-path, so that factor is constant and cancels in the
normalisation below; it is named here so a later agent does not "add" it.

Irmischer & Clarke's off-path curve was considered and not used: it is
symmetric in slope, so it cannot charge ascent, which is the whole point.

A landcover/water difficulty factor was considered and REJECTED.  The
province's baseline ground IS flooded marsh; a wading factor would multiply
almost every pair and become the blanket loosening the owner banned.  Slope
is the difficulty signal that actually distinguishes a rim climb from a marsh
walk here.

THE UNIT: equivalent flat metres (EFM)
--------------------------------------
Cost is reported as time * the flat-ground speed W(0) = 5.036 km/h, i.e. the
distance you could have walked on the flat in the time this traverse takes.
Consequences, both deliberate:

* on flat ground EFM == plan metres EXACTLY, so the authored floors (600 m
  etc.), which were calibrated as plan distance over flat marsh, keep their
  calibration and their number.  They are now floors in EFM.
* EFM >= plan metres for every non-flat pair (the mean of a convex reciprocal
  about a symmetric pair of gradients), so this can only ever make a slope
  MORE isolating.  It is not a loosening of the flat-ground case.

Sampling is at the survey's own grid pitch (5.48 m), on the natural-height
grid the solver already reads.
"""

from __future__ import annotations

import math
from functools import lru_cache

import numpy as np

TOBLER_PEAK_KMH = 6.0
TOBLER_DECAY = 3.5
TOBLER_OFFSET = 0.05
#: Tobler is fitted to walking, and walking stops somewhere around 45 deg.
#: Past a 100 % gradient the curve is extrapolation, and it explodes: an
#: unclamped 67 deg rim face made `hermit-hut-exile-warden` read 778,920 EFM
#: over 125 plan metres. Clamping the sampled gradient to +/-1.0 caps any
#: segment at exp(3.5) = 33.1x flat cost, which is the honest statement "this
#: is a climb, not a walk" without letting one raster spike carry a gate.
MAX_GRADIENT = 1.0
#: flat-ground speed, the normalisation that makes EFM == plan metres on flat
FLAT_SPEED_KMH = TOBLER_PEAK_KMH * math.exp(-TOBLER_DECAY * TOBLER_OFFSET)
#: the unit these distances are in; carried into the recipe schema
DISTANCE_UNIT = "equivalent-flat-metres"


def tobler_speed_kmh(gradient: float) -> float:
    """Walking speed for a rise/run gradient, km/h (Tobler 1993)."""
    return TOBLER_PEAK_KMH * math.exp(-TOBLER_DECAY * abs(gradient + TOBLER_OFFSET))


def _samples(heights: np.ndarray, px_m: float, n_px: int,
             ax: float, az: float, bx: float, bz: float, step_m: float):
    """Heights along the straight A->B line, at `step_m` pitch."""
    d = math.hypot(bx - ax, bz - az)
    n = max(1, int(math.ceil(d / step_m)))
    t = np.linspace(0.0, 1.0, n + 1)
    xs = np.clip(((ax + (bx - ax) * t) / px_m).astype(np.int64), 0, n_px - 1)
    zs = np.clip(((az + (bz - az) * t) / px_m).astype(np.int64), 0, n_px - 1)
    return d, heights[zs, xs]


def effort_distance_m(survey, ax: float, az: float, bx: float, bz: float) -> float:
    """Symmetric Tobler travel cost between two points, in equivalent flat metres.

    `survey` is a `ProvinceSurvey` (or anything with `height_grid`,
    `grid_px_m`, `grid_n`).
    """
    # The per-segment cost is symmetric by construction, but the SAMPLING is
    # not: walking A->B and B->A lands on different cells of the height grid.
    # A siting gate is a property of a pair, so the endpoints are put in a
    # canonical order first and the answer cannot depend on which record the
    # solver reached first.
    if (bx, bz) < (ax, az):
        ax, az, bx, bz = bx, bz, ax, az
    step = float(survey.grid_px_m)
    d, h = _samples(survey.height_grid, step, int(survey.grid_n), ax, az, bx, bz, step)
    if d <= 0.0:
        return 0.0
    seg = d / (len(h) - 1)
    dh = np.diff(h)
    g = np.clip(dh / seg, -MAX_GRADIENT, MAX_GRADIENT)
    # mean of the two traverse directions: forward gradient g, reverse -g
    hours = 0.0
    for gi in g:
        vf = TOBLER_PEAK_KMH * math.exp(-TOBLER_DECAY * abs(gi + TOBLER_OFFSET))
        vr = TOBLER_PEAK_KMH * math.exp(-TOBLER_DECAY * abs(-gi + TOBLER_OFFSET))
        hours += 0.5 * (1.0 / vf + 1.0 / vr)
    return float(hours * seg / 1000.0 * FLAT_SPEED_KMH * 1000.0)


class EffortMetric:
    """Cached effort distance for one survey.

    The solver asks the same question about the same pair many times over the
    relaxation stages, so pairs are memoised on their rounded metre position.
    Rounding to 1 m is far below the 5.48 m sampling pitch, so it cannot
    change an answer; determinism is preserved (same inputs, same key).
    """

    def __init__(self, survey, cache_size: int = 1 << 17):
        self.survey = survey
        self._cached = lru_cache(maxsize=cache_size)(self._compute)

    def _compute(self, key):
        ax, az, bx, bz = key
        return effort_distance_m(self.survey, ax, az, bx, bz)

    def __call__(self, ax: float, az: float, bx: float, bz: float) -> float:
        a = (round(ax), round(az))
        b = (round(bx), round(bz))
        if b < a:
            a, b = b, a
        return self._cached((float(a[0]), float(a[1]), float(b[0]), float(b[1])))


def effort_or_plan(metric, ax: float, az: float, bx: float, bz: float,
                   plan: float, floor: float) -> float:
    """The distance an isolation FLOOR is judged on.

    Effort distance is never less than plan distance, so a pair already clear
    on the plan is clear on effort too and needs no terrain walk. This is a
    pure optimisation and is asserted in `test_travel_cost`.
    """
    if metric is None or plan >= floor:
        return plan
    return metric(ax, az, bx, bz)
