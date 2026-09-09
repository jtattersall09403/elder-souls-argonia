"""Route grading — make every road, track and footpath walkable end to end.

    cd tooling/world-generation
    python3 -m worldgen.grade_routes            # whole province, in place

WHY THIS EXISTS (owner report, 2026-09-05)
------------------------------------------
The route solvers pick *cheap* lines across the province, but nothing ever
touched the terrain under them. Where a line crossed a terrace lip or a
sculpted bench the ground kept its step, so in 3D a road ran off the edge of
a contour and left a sudden drop or a shelf. Grading is the missing civil
engineering: cut and fill the heightfield along each way so the surface a
player walks has a sane longitudinal gradient, is flat across its width, and
blends back into the hillside without leaving a climbable-only rim.

WHERE IT SITS IN THE CHAIN
--------------------------
    sculpt_province → refine_province → **grade_routes** → compile_chunks
    → export_web_chunks → compile_water → rebake_landcover → compile_scatter

It runs AFTER refinement (it needs the final channels, lake and detail noise)
and BEFORE anything derived from heights (chunks, collision, water surface,
land cover, scatter) — all of which must be regenerated after it.

Idempotence: refinement's output is snapshotted once as
`refined-height-ungraded-f32.npy`; every run reads that snapshot and rewrites
`refined-height-f32.npy`, so grading twice gives the same file as grading
once, and re-running `refine_province` refreshes the snapshot.

THE ALGORITHM (deterministic, no randomness)
--------------------------------------------
Per way, in a stable id order:

1. **Sample** the centreline at ~one full-res sample (1.83 m) and read the
   height profile bilinearly.
2. **Smooth + cap.** Alternate a short low-pass (endpoints pinned — a way
   must still meet the network at the junction height) with a
   cap-and-redistribute pass on the along-path increments: increments over
   the class cap are clipped, and the clipped-off climb is pushed back onto
   the increments of the same sign that still have headroom, so the *total*
   climb is preserved and merely spread over more distance. Clipping never
   flips an increment's sign, so a monotone climb stays monotone.
3. **Write back** across a cross-section: flat at the way's own width, then a
   smoothstep shoulder over 2-3x the width. The shoulder is *benched*: it is
   extended locally until the cut/fill face it leaves is under 30 degrees, so
   grading a terrace lip produces a bank you can walk up, not a new wall.

Water and specials:
* A **boardwalk grades nothing** — it is a placed deck over the water.
* On a way that is not crossing water, the graded profile is never pushed
  below the **wet-season** waterline, measured from the compiled signed depth
  (`water_report.ShippedWater`, not the class label) and extended a mesh skirt
  past the shoreline: we do not dig roads into rivers, and we do not dig them
  under a marsh in flood either.
* **Authored structures** — a stair flight, stepped ascent, boardwalk/bridge
  deck or one-step lip recorded in `world/sources/routes/route-structures.json`
  is treated exactly like a bridge: nothing is cut or filled inside its
  chainage window, its landings are pinned, and the window is excluded from
  the "after" gradient because the player walks the piece, not the ground.
  The over-cap stretches this pass measures are exported to
  `output/route-grading-stretches.json` (gitignored) so the structure data is
  derived from the measurement rather than typed by hand.
* **Fords and bridges** — the stretches where a way crosses open water — are
  derived from measured wet-season depth, with marsh (wet ground, crossed on
  foot) excluded by class. Their profile
  is still smoothed (so the approaches line up) but no height is ever written
  on a wet cell: a ford keeps its bed and a bridge deck is an asset above the
  gap.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
REPORT_PATH = REPO_ROOT / "world" / "sources" / "sites" / "route-grading.md"

STEP = 3                       # macro (1345) px -> full-res samples

# Longitudinal gradient cap by way class, degrees. Stairs/ramps are authored
# geometry, not terrain, and are exempt (they never appear in these networks).
GRADIENT_CAP_DEG = {
    "road": 8.0,
    "trunk_road": 8.0,
    "track": 12.0,
    "causeway": 12.0,
    "footpath": 17.0,
}
# Flat running-surface width, metres: the wider of the class width the owner
# specified and the width `routes_raster` actually paints, so the painted
# surface always sits on flat ground.
FLAT_WIDTH_M = {
    "road": 5.0,
    "trunk_road": 5.0,
    "track": 3.6,
    "causeway": 3.6,
    "footpath": 2.4,
}
# How far the graded way may leave the natural ground, metres (cut, fill).
# Without this a capped profile happily floats a 36 m embankment across a
# hollow: past these depths the honest answer is a steeper way, not a viaduct.
# Cut is generous and fill is mean on purpose: a side-hill CUT leaves a bank
# the hill already supports, an embankment has to be built out of nothing and
# is what buried the terrace lips the owner reported. Where the profile cannot
# be met inside these, the stretch is left ungraded and reported (see
# MAX_FILL_M and the bench feasibility test in `grade`).
MAX_OFFSET_M = {
    "road": (14.0, 6.0),
    "trunk_road": (14.0, 6.0),
    "track": (10.0, 4.0),
    "causeway": (10.0, 4.0),
    "footpath": (8.0, 2.5),
}
# Hard ceiling on how much ground grading may ADD anywhere, metres. Anything
# deeper is an earth wall, not a road: the stretch is left alone and handed to
# `author_route_structures` as an over-cap window (a deck, span or flight).
MAX_FILL_M = 6.0
MIN_FLAT_PX = 1.5              # resolution floor for the flat band, samples
SHOULDER_FACTOR = 2.5          # shoulder length = this x the flat width ...
MAX_SHOULDER_M = 70.0          # ... extended to bench a lip, up to this
BENCH_ITERS = 4                # shoulder-radius fixed-point iterations
SHOULDER_FEATHER_PX = 1.5      # blur applied to the shoulder's delta, samples
RIM_MAX_DEG = 30.0             # steepest face the blend may leave
CROSS_SLOPE_MAX_DEG = 3.0      # the running surface itself is flat (0) by build
SMOOTH_ITERS = 24              # low-pass / redistribute alternations
SMOOTH_SIGMA_SAMPLES = 2.5     # low-pass width, in centreline samples
WATER_CLEARANCE_M = 0.15
# water-class.png R indices: 0 none, 1 coast, 2 estuary, 3 river, 4 lake, 5 marsh.
# The class raster answers *what kind* of water a cell is, never *whether* it is
# wet — that is measured from the signed depth (see `_water_fields`). The only
# class this pass asks about is marsh, which is wet ground, not open water.
MARSH_CLASS = 5
# How far past the measured waterline the "never cut below this" floor reaches,
# in surface-grid (export) texels. 1 is the neighbourhood `hovering_edges`
# compares; the second is registration slack, because grading happens on the
# full-res grid and the invariant reads every other sample.
SHORE_FLOOR_EXT_PX = 2

# The ungraded studio raster, written beside `height-rg.png` for siting.
NATURAL_HEIGHT_FILE = "height-natural-rg.png"

BOARDWALK = "boardwalk"

# Authored geometry (worldgen.compile_route_structures) and the derived
# over-cap stretch export.
STRUCTURES_PATH = REPO_ROOT / "world" / "sources" / "routes" / "route-structures.json"
STRETCHES_PATH = Path(__file__).resolve().parents[1] / "output" / "route-grading-stretches.json"
# An over-cap run is merged with the next one when the under-cap gap between
# them is shorter than this: two steps 5 m apart are one flight, not two.
STRETCH_MERGE_GAP_M = 25.0
# Landing pad added at each end of a stretch, so a structure starts and ends on
# ground that is already under the cap.
STRETCH_LANDING_M = 8.0


def load_structure_spans(path: Path | None = None) -> dict[str, list[tuple[float, float]]]:
    """wayId -> [(fromM, toM)] from the authored structures file (may be absent).

    Chainage is measured along the same resampled centreline this module uses
    (`resample(px, STEP)`), so the compiler and the grader agree sample for
    sample."""
    path = path or STRUCTURES_PATH
    if not path.exists():
        return {}
    out: dict[str, list[tuple[float, float]]] = {}
    for s in json.loads(path.read_text()).get("structures", []):
        a, b = float(s["fromM"]), float(s["toM"])
        out.setdefault(str(s["wayId"]), []).append((min(a, b), max(a, b)))
    for v in out.values():
        v.sort()
    return out


def span_mask(chain: np.ndarray, spans: list[tuple[float, float]]) -> np.ndarray:
    """Samples that sit inside an authored span. The window's first and last
    samples stay graded and pinned — they are the structure's landings — except
    where the window runs to the end of the way itself: there is no landing
    beyond the last sample, so the whole tail is carried by the piece."""
    m = np.zeros(len(chain), dtype=bool)
    end = float(chain[-1])
    for a, b in spans:
        inside = np.flatnonzero((chain >= a) & (chain <= b))
        if len(inside) < 2:
            continue
        lo = 0 if a <= float(chain[0]) + 1e-6 else 1
        hi = len(inside) if b >= end - 1e-6 else len(inside) - 1
        if hi - lo >= 1:
            m[inside[lo:hi]] = True
    return m


def over_cap_stretches(chain: np.ndarray, slopes: np.ndarray, ok: np.ndarray,
                       cap: float) -> list[dict]:
    """Contiguous over-cap runs along one way, merged across short under-cap
    gaps and extended to a landing at each end. Chainage in metres."""
    over = ok & (slopes > cap)
    runs: list[list[int]] = []
    i = 0
    while i < len(over):
        if not over[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(over) and over[j + 1]:
            j += 1
        if runs and chain[i] - chain[runs[-1][1] + 1] <= STRETCH_MERGE_GAP_M:
            runs[-1][1] = j
        else:
            runs.append([i, j])
        i = j + 1
    out = []
    for a, b in runs:
        z0 = max(0.0, float(chain[a]) - STRETCH_LANDING_M)
        z1 = min(float(chain[-1]), float(chain[b + 1]) + STRETCH_LANDING_M)
        seg = slopes[a:b + 1]
        out.append({"fromM": round(z0, 2), "toM": round(z1, 2),
                    "overM": round(float((chain[b + 1] - chain[a])), 2),
                    "worstDeg": round(float(seg.max()), 2),
                    "atFrac": round(a / max(len(slopes) - 1, 1), 3)})
    return out


def over_cap_runs(chain: np.ndarray, flag: np.ndarray, deg: np.ndarray,
                  cap: float) -> list[dict]:
    """Contiguous runs of flagged samples as chainage windows, in the same
    shape `over_cap_stretches` produces, so `author_route_structures` consumes
    them unchanged. Used for the stretches no 30 deg bench can carry: the
    grader leaves the ground alone there and a deck, span or flight is
    authored over it instead of a 50 m embankment."""
    out: list[dict] = []
    n = len(flag)
    i = 0
    while i < n:
        if not flag[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and flag[j + 1]:
            j += 1
        z0 = max(0.0, float(chain[i]) - STRETCH_LANDING_M)
        z1 = min(float(chain[-1]), float(chain[min(j + 1, n - 1)]) + STRETCH_LANDING_M)
        if out and z0 - out[-1]["toM"] <= STRETCH_MERGE_GAP_M:
            out[-1]["toM"] = round(z1, 2)
            out[-1]["worstDeg"] = max(out[-1]["worstDeg"],
                                      round(float(deg[i:j + 1].max()), 2))
            out[-1]["overM"] = round(out[-1]["toM"] - out[-1]["fromM"], 2)
        else:
            out.append({"fromM": round(z0, 2), "toM": round(z1, 2),
                        "overM": round(z1 - z0, 2),
                        "worstDeg": round(max(float(deg[i:j + 1].max()), cap + 0.1), 2),
                        "atFrac": round(i / max(n - 1, 1), 3),
                        "reason": "bench"})
        i = j + 1
    return out


# --------------------------------------------------------------------------
# way collection
# --------------------------------------------------------------------------
def ways(province: Path | None = None) -> list[dict]:
    """Every gradeable way, in a stable order: majors first, then minors, each
    sorted by id. `px` are macro (1345) grid coordinates as [x, y]."""
    province = province or PROVINCE
    out: list[dict] = []
    major = province / "routes.json"
    if major.exists():
        for route in json.loads(major.read_text()).get("routes", []):
            cls = route.get("class")
            if cls not in ("road", "trunk"):
                continue           # boat lanes are not ways
            out.append({"id": route.get("id", ""),
                        "kind": "trunk_road" if cls == "trunk" else "road",
                        "px": route.get("px", [])})
    minor = province / "routes-minor.json"
    if minor.exists():
        for track in json.loads(minor.read_text()).get("tracks", []):
            out.append({"id": track.get("id", ""),
                        "kind": track.get("kind", "footpath"),
                        "px": track.get("px", [])})
    out.sort(key=lambda w: (w["kind"] not in ("road", "trunk_road"), w["id"]))
    return out


def resample(px: list, step: int = STEP) -> np.ndarray:
    """Macro polyline -> full-res (x, y) sample points about RAW_M apart."""
    pts = np.asarray(px, dtype=np.float64) * step
    if len(pts) < 2:
        return pts.reshape(-1, 2)
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])))
        if n <= 0:
            continue
        for i in range(1, n + 1):
            out.append(a + (b - a) * (i / n))
    return np.asarray(out, dtype=np.float64)


def sample_bilinear(field: np.ndarray, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    h, w = field.shape
    x = np.clip(xs, 0, w - 1.001)
    y = np.clip(ys, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
    return (field[y0, x0] * (1 - fx) * (1 - fy) + field[y0, x1] * fx * (1 - fy)
            + field[y1, x0] * (1 - fx) * fy + field[y1, x1] * fx * fy)


# --------------------------------------------------------------------------
# profile smoothing
# --------------------------------------------------------------------------
def cap_and_redistribute(dz: np.ndarray, cap: np.ndarray) -> np.ndarray:
    """Clip increments to +/-cap and push the clipped climb back onto
    same-sign increments that still have headroom, so the total is kept."""
    out = np.clip(dz, -cap, cap)
    for _ in range(8):
        for sign in (1.0, -1.0):
            excess = sign * (dz.sum() - out.sum())
            if excess <= 1e-9:
                continue
            room = np.maximum(cap - sign * out, 0.0)
            room[np.sign(out) == -sign] = 0.0    # never flip a sign
            total = room.sum()
            if total <= 1e-12:
                continue
            out = out + sign * room * min(1.0, excess / total)
    return out


def _slope_feasible_envelope(floor: np.ndarray, ds: np.ndarray, cap_deg: float) -> np.ndarray:
    """Lower envelope of `floor` that a cap-feasible profile can clear: a
    single high constraint would otherwise force a spike no smoothing can
    remove, so spread it out at the cap slope (min-plus dilation, both ways)."""
    slope = np.tan(math.radians(cap_deg))
    e = floor.astype(np.float64).copy()
    for i in range(1, len(e)):
        e[i] = max(e[i], e[i - 1] - slope * ds[i - 1])
    for i in range(len(e) - 2, -1, -1):
        e[i] = max(e[i], e[i + 1] - slope * ds[i])
    return e


def grade_profile(z: np.ndarray, ds: np.ndarray, cap_deg: float,
                  floor: np.ndarray | None = None,
                  offset: tuple[float, float] | None = None) -> np.ndarray:
    """Smoothed, gradient-capped profile with both endpoints pinned."""
    if len(z) < 3:
        return z.copy()
    cap = np.tan(math.radians(cap_deg)) * ds
    g = z.astype(np.float64).copy()
    z0, z1 = float(z[0]), float(z[-1])
    s = np.concatenate([[0.0], np.cumsum(ds)])
    frac = s / max(s[-1], 1e-9)
    for _ in range(SMOOTH_ITERS):
        g = ndimage.gaussian_filter1d(g, SMOOTH_SIGMA_SAMPLES, mode="nearest")
        g[0], g[-1] = z0, z1
        g = np.concatenate([[z0], z0 + np.cumsum(cap_and_redistribute(np.diff(g), cap))])
        if floor is not None:
            g = np.maximum(g, floor)
            g[0] = z0
        if offset is not None:
            g = np.clip(g, z - offset[0], z + offset[1])
        # Tie the far end back to the junction height by spreading the residual
        # evenly along the run. On a run too short to hold the cap at all (a
        # mountain spur) this is the minimum-possible max gradient, and it is a
        # ramp rather than the cliff a hard endpoint pin would leave.
        g = g + (z1 - g[-1]) * frac
    return g


def max_gradient_deg(z: np.ndarray, ds: np.ndarray) -> float:
    if len(z) < 2:
        return 0.0
    return float(np.degrees(np.arctan(np.abs(np.diff(z)) / np.maximum(ds, 1e-6))).max())


# --------------------------------------------------------------------------
# main grading pass
# --------------------------------------------------------------------------
def _water_fields(province: Path, shape) -> tuple[np.ndarray | None, np.ndarray | None]:
    """(wet-season waterline floor in metres, open-water mask), full-res, or
    (None, None) if the water bake has not been produced yet.

    WHERE THE WATER IS IS MEASURED, NOT LABELLED (2026-09-09)
    --------------------------------------------------------
    `water-class.png` is a *type label over a superset* of the wet area — it is
    deliberately dilated `compile_water.CLASS_EXT_PX` past the shoreline so the
    class, turbidity and salinity of a body continue under its mesh skirt.
    6.5 km2 of it is dry in every season. Reading it as a wetness mask both
    over-protected ground that never sees water and MISSED cells that stand at
    or below the water table outside the label, where the grader could cut a
    road under the waterline. So wetness comes from the compiled signed depth,
    through the one accessor (`water_report.ShippedWater`), and the class
    raster is used for the only thing it is: the type name.

    Two questions, two answers — this is the distinction the reverted
    2026-09-09 version collapsed:

    * **May the grader write ground here?** No, on open water: a ford keeps its
      bed and a bridge deck is an asset above the gap. MARSH is exempt: marsh
      is wet *ground*, paths cross it, and treating it as open water would chop
      every marsh way into graded and ungraded pieces with a step between them
      — the defect this pass exists to remove.
    * **How low may the graded surface go?** Never below the WET-SEASON
      waterline. That floor applies over marsh too: a marsh road is a causeway,
      and an exemption from the no-write rule is not an exemption from the
      water. The floor is extended a couple of export texels past the waterline
      (a plain maximum over that radius) so a dry cell ADJACENT to a river
      cannot be cut below its neighbour's surface either — that is exactly what
      a hovering edge is, seen from the dry side, and the invariant that counts
      them compares a wet cell against its 8-neighbourhood on the export grid.
      The extension is sized off that neighbourhood plus a texel of
      registration slack, NOT off the class raster's 22 m mesh skirt: the skirt
      is a rendering allowance, and using it as a grading floor lifts roads a
      shoreline's width inland for no measured reason.

    The season is the wet one throughout: `signed_depth_m("wet")`, the seasonal
    maximum. Grading for the dry season would leave the road under water for
    half the year.
    """
    meta_path = province / "water" / "water-meta.json"
    if not meta_path.exists():
        return None, None
    from .water_report import ShippedWater

    S = ShippedWater(province / "water", heights=None)
    # Measured standing water at the seasonal maximum, on the surface grid.
    wet_all = S.wet_grid("wet")
    # The wet-season water surface: base surface lifted by the same per-body
    # seasonal response that lifts the depth, so surface - ground stays the
    # signed depth the accessor reports.
    surface_wet = (S.w2 + S.signed_depth_m("wet") - S.depth2).astype(np.float32)

    # Floor: the wet-season waterline, extended over the neighbourhood the
    # hovering-edge invariant reads (one export texel) plus a texel of slack.
    level = ndimage.maximum_filter(np.where(wet_all, surface_wet, -np.inf),
                                   size=2 * SHORE_FLOOR_EXT_PX + 1)

    # No-write: open water only. The class raster is 1345^2 and the surface
    # grid 2017^2, so the label has to be resampled onto the measurement before
    # the two can be combined — NEAREST, because a class is a label and
    # interpolating it would invent classes between two bodies.
    zoom_c = (wet_all.shape[0] / S.cls.shape[0], wet_all.shape[1] / S.cls.shape[1])
    cls2 = ndimage.zoom(S.cls, zoom_c, order=0)[: wet_all.shape[0], : wet_all.shape[1]]
    wet = wet_all & (cls2 != MARSH_CLASS)

    # Both fields go to the full-res grid nearest-neighbour: the mask is a
    # mask, and the floor is a constraint (a bilinear blend of a waterline with
    # the -inf that means "no water here" would be meaningless).
    zoom = (shape[0] / level.shape[0], shape[1] / level.shape[1])
    level = ndimage.zoom(level, zoom, order=0)[: shape[0], : shape[1]]
    wet = ndimage.zoom(wet.astype(np.uint8), zoom, order=0)[: shape[0], : shape[1]] > 0
    return level.astype(np.float32), wet


def grade(h: np.ndarray, ways_list: list[dict],
          level: np.ndarray | None = None, wet: np.ndarray | None = None,
          step: int = STEP,
          spans: dict[str, list[tuple[float, float]]] | None = None
          ) -> tuple[np.ndarray, list[dict]]:
    """Return (graded heightfield, per-way stats). Pure: `h` is not modified.

    Ways are graded IN PRIORITY ORDER (roads, then tracks and footpaths by id)
    against the running result, and an earlier way's running surface is locked:
    a footpath meeting a road samples the road's graded height and ties into
    it, instead of the two disagreeing and leaving a step at the junction.

    `spans` maps a way id to authored-structure chainage windows (metres). A
    window behaves exactly like a bridge: no height is written inside it, its
    landings are pinned, and it is excluded from the "after" gradient.
    """
    spans = spans or {}
    cur = h.astype(np.float32).copy()
    locked = np.zeros_like(cur)
    stats: list[dict] = []
    ny, nx = h.shape
    # Open water is measured, so a cell in the mask already HAS water standing
    # over its ground: no second height test is needed (and the old one, which
    # compared the ungraded ground against the water surface, let the grader
    # fill any wet cell whose bed the previous pass had already raised).
    submerged = wet

    for way in ways_list:
        kind = way["kind"]
        pts = resample(way["px"], step)
        if len(pts) < 3 or kind == BOARDWALK or kind not in GRADIENT_CAP_DEG:
            if len(pts) >= 2:
                z = sample_bilinear(h, pts[:, 0], pts[:, 1])
                ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
                deg = max_gradient_deg(z, ds)
                stats.append({"id": way["id"], "kind": kind, "graded": False,
                              "before": deg, "after": deg, "metres": 0.0,
                              "crossingM": 0.0, "worst": None})
            continue

        xs, ys = pts[:, 0], pts[:, 1]
        ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
        before = max_gradient_deg(sample_bilinear(h, xs, ys), ds)
        z = sample_bilinear(cur, xs, ys).astype(np.float64)

        ix = np.clip(np.round(xs).astype(int), 0, nx - 1)
        iy = np.clip(np.round(ys).astype(int), 0, ny - 1)
        # Every open-water sample is a crossing: a ford bed, the gap under a
        # bridge, or the last metres of a quay. Nothing is graded there, and
        # the dry runs either side are pinned to the water's-edge height, so a
        # way ties into the shore instead of ending on a cliff above it.
        crossing = (wet[iy, ix] if wet is not None
                    else np.zeros(len(pts), dtype=bool))
        chain = np.concatenate([[0.0], np.cumsum(ds)])
        structure = span_mask(chain, spans.get(way["id"], []))
        skip = crossing | structure
        # Never cut a way that starts above the sea down below it ...
        floor = np.where((z > 0.0) & ~skip, WATER_CLEARANCE_M, -1e9)
        # ... and never cut it below the local WET-SEASON waterline either.
        # This is the rule that keeps a marsh causeway a causeway: marsh is
        # exempt from the no-write mask above, not from the water.
        if level is not None:
            near = level[iy, ix]
            here = np.isfinite(near) & ~skip
            floor = np.where(here, np.maximum(floor, near + WATER_CLEARANCE_M), floor)

        g = z.copy()
        i0 = 0
        while i0 < len(pts):
            if skip[i0]:
                i0 += 1
                continue
            i1 = i0
            while i1 + 1 < len(pts) and not skip[i1 + 1]:
                i1 += 1
            if i1 - i0 >= 2:
                seg, dseg = slice(i0, i1 + 1), ds[i0:i1]
                cap = GRADIENT_CAP_DEG[kind]
                g[seg] = grade_profile(z[seg], dseg, cap,
                                       _slope_feasible_envelope(floor[seg], dseg, cap),
                                       MAX_OFFSET_M[kind])
            i0 = i1 + 1

        flat_m = FLAT_WIDTH_M[kind]
        # At 1.83 m per sample a 2.4 m footpath is barely one texel wide, so
        # the flat band is floored at MIN_FLAT_PX: below that there is no
        # running surface to protect from the next way's shoulder.
        r_flat = max(0.5 * flat_m / RAW_M, MIN_FLAT_PX)
        r_base = (0.5 * flat_m + SHOULDER_FACTOR * flat_m) / RAW_M
        r_max = (0.5 * flat_m + MAX_SHOULDER_M) / RAW_M
        rim_tan = math.tan(math.radians(RIM_MAX_DEG))

        pad = int(math.ceil(r_max)) + 2
        by0 = max(0, int(ys.min()) - pad); by1 = min(ny, int(ys.max()) + pad + 1)
        bx0 = max(0, int(xs.min()) - pad); bx1 = min(nx, int(xs.max()) + pad + 1)
        wz = np.zeros((by1 - by0, bx1 - bx0), dtype=np.float32)
        ws = np.zeros_like(wz)
        wmax = np.zeros_like(wz)
        graded_m = 0.0

        unbenchable = np.zeros(len(pts), dtype=bool)
        local_deg = np.zeros(len(pts), dtype=np.float64)
        for i in range(len(pts)):
            if skip[i]:
                continue
            cx, cy, cz = xs[i], ys[i], g[i]
            # Running surface: an embankment taller than MAX_FILL_M is not a
            # road, it is a wall. Hand the sample to the structure author.
            rf = int(math.ceil(r_flat)) + 1
            fy0, fy1 = max(0, int(cy) - rf), min(ny, int(cy) + rf + 1)
            fx0, fx1 = max(0, int(cx) - rf), min(nx, int(cx) + rf + 1)
            if fy1 <= fy0 or fx1 <= fx0:
                continue
            band = cur[fy0:fy1, fx0:fx1]
            fill_here = float(cz - band.min())
            # Bench the shoulder against the change the blend will actually
            # APPLY, not against the natural relief and not against a 4 px
            # peephole: at radius r the smoothstep writes w(d) * |cz - ground|,
            # so the face the blend leaves is sized by the largest weighted
            # offset anywhere inside r. A terrace lip sitting just outside the
            # flat band is therefore seen (it used to be invisible, and got
            # buried under a 50 m fill). Solve r by fixed point: a bigger r
            # sees more relief, which asks for a bigger r, and it converges in
            # a few passes or runs out of shoulder.
            r_out, need = r_base, r_base
            for _ in range(BENCH_ITERS):
                rr = int(math.ceil(r_out)) + 1
                dy0, dy1 = max(0, int(cy) - rr), min(ny, int(cy) + rr + 1)
                dx0, dx1 = max(0, int(cx) - rr), min(nx, int(cx) + rr + 1)
                yy = np.arange(dy0, dy1)[:, None] - cy
                xx = np.arange(dx0, dx1)[None, :] - cx
                t = np.clip((r_out - np.hypot(yy, xx)) / max(r_out - r_flat, 1e-6), 0.0, 1.0)
                w_i = t * t * (3.0 - 2.0 * t)
                raise_i = w_i * (cz - cur[dy0:dy1, dx0:dx1])
                applied = np.abs(w_i * (cur[dy0:dy1, dx0:dx1] - cz))
                depth = float(applied.max()) if applied.size else 0.0
                # Fill is what the blend ADDS, anywhere under the shoulder —
                # not just under the running surface. Measuring it only in the
                # flat band is how a lip a few metres off the centreline used
                # to end up under tens of metres of made ground.
                fill_here = max(fill_here,
                                float(raise_i.max()) if raise_i.size else 0.0)
                need = max(r_base, 1.5 * depth / rim_tan / RAW_M + r_flat)
                if need <= r_out * 1.02 + 1e-6:
                    break
                r_out = min(need, r_max)
                if need > r_max:
                    break
            if need > r_max or fill_here > MAX_FILL_M:
                # The face a clamped shoulder would leave here, for the report.
                local_deg[i] = math.degrees(math.atan(
                    1.5 * depth / max((r_max - r_flat) * RAW_M, 1e-6)))
                # No 30 deg bench fits inside MAX_SHOULDER_M, or the only way
                # to hold the line here is an embankment. Leave the ground.
                unbenchable[i] = True
                continue
            r_out = min(need, r_max)

            rr = int(math.ceil(r_out)) + 1
            y0, y1 = max(by0, int(cy) - rr), min(by1, int(cy) + rr + 1)
            x0, x1 = max(bx0, int(cx) - rr), min(bx1, int(cx) + rr + 1)
            if y1 <= y0 or x1 <= x0:
                continue
            yy = np.arange(y0, y1)[:, None] - cy
            xx = np.arange(x0, x1)[None, :] - cx
            t = np.clip((r_out - np.hypot(yy, xx)) / max(r_out - r_flat, 1e-6), 0.0, 1.0)
            w = (t * t * (3.0 - 2.0 * t)).astype(np.float32)   # smoothstep
            sy, sx = slice(y0 - by0, y1 - by0), slice(x0 - bx0, x1 - bx0)
            np.maximum(wmax[sy, sx], w, out=wmax[sy, sx])
            ws[sy, sx] += w
            wz[sy, sx] += w * np.float32(cz)
            graded_m += float(ds[min(i, len(ds) - 1)])

        bb = (slice(by0, by1), slice(bx0, bx1))
        eff = wmax * (1.0 - locked[bb])       # an earlier way's surface wins
        if submerged is not None:
            eff = np.where(submerged[bb], 0.0, eff)   # never fill open water
        touched = eff > 0
        tgt = wz[touched] / np.maximum(ws[touched], 1e-6)
        blended = (cur[bb][touched] * (1.0 - eff[touched])
                   + tgt * eff[touched]).astype(np.float32)
        # Hard fill ceiling. Samples that needed more than this were already
        # dropped above, so on the running surface this is a no-op; out on the
        # shoulder it stops a blend stacking an earth wall against a lip.
        blended = np.minimum(blended, h[bb][touched] + np.float32(MAX_FILL_M))
        base = cur[bb].copy()
        cur[bb][touched] = blended
        # Feather the shoulder. Neighbouring samples can want quite different
        # shoulder radii (the relief under them differs), and the per-cell max
        # of their weights leaves a one-cell wrinkle where the radii step —
        # small in metres, but a metre over 1.8 m is a 30 deg face. Smoothing
        # the DELTA (never the natural ground) removes the wrinkle and leaves
        # the running surface, where the blend is at full weight, untouched.
        delta = cur[bb] - base
        smooth = ndimage.gaussian_filter(delta, SHOULDER_FEATHER_PX)
        # Protect the running surfaces (ours, and any earlier way's, which is
        # locked and gets no delta at all); everything between them feathers,
        # so the lock boundary tapers instead of leaving a bare step.
        k = np.clip((np.maximum(eff, locked[bb]) - 0.96) / 0.04, 0.0, 1.0)
        k = k * k * (3.0 - 2.0 * k)          # no seam where the feather starts
        add = k * delta + (1.0 - k) * smooth
        if submerged is not None:
            add = np.where(submerged[bb], 0.0, add)   # never fill open water
        cur[bb] = (base + add).astype(np.float32)
        # THE WATERLINE IS ENFORCED ON THE WRITE, not only on the profile.
        # Capping the centreline profile is not enough: the shoulder blend
        # reaches up to MAX_SHOULDER_M sideways and pulls the ground down
        # towards the road, so a bank beside a river could still be cut below
        # the river's surface — which is precisely a hovering edge, seen from
        # the dry side. Clamp every written cell to the local wet-season
        # waterline, but never RAISE ground that was already under it: that
        # would be fill, and filling water is the other invariant.
        if level is not None:
            lf = level[bb] + np.float32(WATER_CLEARANCE_M)
            known = np.isfinite(lf)
            cur[bb] = np.where(known, np.maximum(cur[bb], np.minimum(base, lf)),
                               cur[bb]).astype(np.float32)
        np.maximum(locked[bb], wmax, out=locked[bb])

        bench = over_cap_runs(chain, unbenchable & ~skip, local_deg,
                              GRADIENT_CAP_DEG[kind])
        stats.append({"id": way["id"], "kind": kind, "graded": True,
                      "benchStretches": bench,
                      "before": before, "after": before, "metres": graded_m,
                      "crossingM": float(ds[crossing[:-1]].sum()) if len(ds) else 0.0,
                      "structureM": float(sum(min(b, chain[-1]) - max(a, 0.0)
                                              for a, b in spans.get(way["id"], []))),
                      "_pts": pts, "_ds": ds, "_crossing": skip, "worst": None})

    # Honest 'after' numbers: re-measure on the surface a player will actually
    # walk, skipping ford/bridge gaps (which are crossed, not walked down).
    for s in stats:
        pts = s.pop("_pts", None)
        if pts is None:
            continue
        ds, crossing = s.pop("_ds"), s.pop("_crossing")
        z = sample_bilinear(cur, pts[:, 0], pts[:, 1])
        seg_ok = ~(crossing[:-1] | crossing[1:])
        slopes = np.degrees(np.arctan(np.abs(np.diff(z)) / ds))
        s["after"] = float(slopes[seg_ok].max()) if seg_ok.any() else 0.0
        if seg_ok.any():
            idx = np.flatnonzero(seg_ok)
            wi = int(idx[np.argmax(slopes[idx])])
            cap = GRADIENT_CAP_DEG[s["kind"]]
            over = seg_ok & (slopes > cap)
            s["stretches"] = sorted(
                over_cap_stretches(np.concatenate([[0.0], np.cumsum(ds)]),
                                   slopes, seg_ok, cap)
                + s.get("benchStretches", []),
                key=lambda w: w["fromM"])
            s["worst"] = {"deg": float(slopes[wi]),
                          "km": [round(float(pts[wi, 0]) * RAW_M / 1000.0, 3),
                                 round(float(pts[wi, 1]) * RAW_M / 1000.0, 3)],
                          # where along the way the worst step sits, 0 = the
                          # place end (a minor way is traced from its place
                          # back to the network), 1 = the junction.
                          "frac": round(wi / max(len(slopes) - 1, 1), 3),
                          "overM": float(ds[over].sum()),
                          "lengthM": float(ds.sum())}
    return cur, stats


# --------------------------------------------------------------------------
# report + CLI
# --------------------------------------------------------------------------
def over_line(over: list[dict], stats: list[dict]) -> str:
    graded = [r for r in stats if r.get("graded")]
    return f"{len(over)} of {len(graded)}"


def where_label(frac: float) -> str:
    """Where the worst step sits along the way. A minor way is traced from the
    place it serves back to the network, so 0 is the place end."""
    if frac <= 0.15:
        return "the place end"
    if frac >= 0.85:
        return "the junction end"
    return f"mid-way ({frac:.0%})"


def remedy(stat: dict) -> str:
    """The authored piece this survivor needs, from the shape of its defect.

    A step at the very end is the approach to a place sited on steep ground:
    the way is right and the last few metres are a stair or a ramped terrace.
    A step in the middle of a way is a gap in the ground the line must cross:
    a boardwalk or a bridge deck over it. A long over-cap run is neither — it
    is a hill climb, and the piece is a flight of steps up it.
    """
    w = stat["worst"]
    if w["overM"] <= 20.0:
        return "one step or deck piece over the lip"
    if w["overM"] > 120.0:
        return "stepped ascent (authored flight) over the climb"
    if w["frac"] <= 0.15 or w["frac"] >= 0.85:
        return "stair or ramped terrace on the approach"
    return "boardwalk or bridge deck over the step"


def write_stretches(stats: list[dict], path: Path | None = None) -> dict:
    """Export the per-way over-cap stretches (chainage windows) as JSON.

    This is the input the authored-structure data is derived from: the windows
    in `world/sources/routes/route-structures.json` are read off this file, not
    typed by hand, so a re-grade that moves a stretch is visible immediately.
    Gitignored output — it is a measurement, not a record.
    """
    path = path or STRETCHES_PATH
    doc = {"schemaVersion": 1,
           "_": "Over-cap stretches per way, metres of chainage along the "
                "resampled centreline (worldgen.grade_routes.resample, STEP=3). "
                "Derived output; regenerate with `python3 -m worldgen.grade_routes`.",
           "ways": [{"wayId": s["id"], "kind": s["kind"],
                     "capDeg": GRADIENT_CAP_DEG[s["kind"]],
                     "lengthM": round(s["worst"]["lengthM"], 2),
                     "stretches": s["stretches"]}
                    for s in sorted(stats, key=lambda s: s["id"])
                    if s.get("stretches")]}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n")
    return doc


def major_repairs(province: Path) -> list[str]:
    """The per-road record `reroute_majors` left, as report lines."""
    marker = province / "routes-repaired-by.json"
    roads = json.loads(marker.read_text()).get("roads", []) if marker.exists() else []
    if not roads:
        return []
    L = ["## Major roads: stretches re-routed before grading", "",
         "`worldgen.reroute_majors` re-solved every stretch of a published road "
         "whose natural longitudinal gradient was over the class cap, between "
         "that stretch's own endpoints, with the gradient wall on. The road "
         "keeps its ends, its length changes, and the natural corridors are "
         "kept as `routes-natural.json` for siting to score against.", "",
         "| road | class | natural max before | after | stretches | points |",
         "| --- | --- | --- | --- | --- | --- |"]
    for r in sorted(roads, key=lambda r: r["id"]):
        L.append("| `{}` | {} | {:.1f} | {:.1f} | {} | {} → {} |".format(
            r["id"], r["kind"], r["beforeDeg"], r["afterDeg"], r["stretches"],
            r["pxBefore"], r["pxAfter"]))
    return L + [""]


def write_report(stats: list[dict], path: Path, cells: int,
                 province: Path | None = None) -> str:
    by_kind: dict[str, list[dict]] = {}
    for s in stats:
        by_kind.setdefault(s["kind"], []).append(s)
    lines = ["# Route grading",
             "",
             "Generated by `python3 -m worldgen.grade_routes` (deterministic).",
             "Longitudinal gradient along every way's centreline, before and after",
             "grading. The shoulder is sized from the change the blend "
             f"actually applies, so where a {RIM_MAX_DEG:.0f} deg bench fits "
             f"inside a {MAX_SHOULDER_M:.0f} m shoulder the blend face is "
             f"under {RIM_MAX_DEG:.0f} deg and no fill exceeds "
             f"{MAX_FILL_M:.0f} m; where it does not fit, the stretch is left "
             "ungraded and reported as an over-cap window for authored "
             "geometry, never buried under an embankment.",
             "",
             "Where the water is is MEASURED, from the compiled signed depth "
             "at the wet season, not read off the class raster (which is a "
             "type label deliberately dilated past the shoreline). Open water "
             "is never written on; marsh is gradeable ground, because paths "
             "cross it; and no graded cell anywhere, marsh included, is left "
             "below the wet-season waterline. A marsh way that cannot be held "
             "above it becomes an over-cap window and gets a deck.",
             "",
             "| class | ways | cap deg | max grad before | max grad after | metres graded | ford/bridge m |",
             "| --- | --- | --- | --- | --- | --- | --- |"]
    for kind in sorted(by_kind):
        rows = by_kind[kind]
        cap = GRADIENT_CAP_DEG.get(kind)
        lines.append("| {} | {} | {} | {:.1f} | {:.1f} | {:.0f} | {:.0f} |".format(
            kind, len(rows), f"{cap:.0f}" if cap else "n/a (not graded)",
            max(r["before"] for r in rows), max(r["after"] for r in rows),
            sum(r["metres"] for r in rows),
            sum(r.get("crossingM", 0.0) for r in rows)))
    over = [r for r in stats if r.get("graded")
            and r["after"] > GRADIENT_CAP_DEG[r["kind"]] + 1.0]
    lines += ["", f"Heightfield samples changed: {cells}.", "",
              f"Ways still over their cap: {over_line(over, stats)}. Routing now "
              "holds the gradient itself — both solvers wall off any step over "
              "the class cap (`routes.grade_factor`), so a line climbs a spur "
              "by switchback or contour instead of head-on. What survives is "
              "not a line that could have gone round: it is ground that has to "
              "be climbed to reach the place at the end of it, and the honest "
              "remedy is authored geometry (a stair, a ramped terrace, a "
              "boardwalk or a bridge over the gap), not a deeper cut.", ""]
    if over:
        lines += ["## Survivors and what each one needs", "",
                  "| way | class | worst deg | over-cap m | where | remedy |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for s in sorted(over, key=lambda s: (-s["worst"]["deg"], s["id"])):
            w = s["worst"]
            lines.append("| `{}` | {} | {:.1f} | {:.0f} of {:.0f} | {} | {} |".format(
                s["id"], s["kind"], w["deg"], w["overM"], w["lengthM"],
                where_label(w["frac"]), remedy(s)))
        lines.append("")
    covered = [r for r in stats if r.get("structureM", 0.0) > 0.0
               and r not in over]
    if covered:
        lines += ["## Covered by authored geometry", "",
                  "These ways were over the cap on the natural ground and are "
                  "not any more: the climb is walked on placed pieces (see "
                  "`world/sources/sites/route-structures.md`), and the ground "
                  "inside each structure's window is left alone.", "",
                  "| way | class | structure m | max grad after |",
                  "| --- | --- | --- | --- |"]
        for s in sorted(covered, key=lambda s: s["id"]):
            lines.append("| `{}` | {} | {:.0f} | {:.1f} |".format(
                s["id"], s["kind"], s["structureM"], s["after"]))
        lines.append("")
    lines += major_repairs(province or PROVINCE)
    lines += ["## Worst ten remaining spots", "",
              "| way | class | deg | km east | km south |", "| --- | --- | --- | --- | --- |"]
    worst = sorted((r for r in stats if r.get("worst")),
                   key=lambda r: (-r["worst"]["deg"], r["id"]))[:10]
    for r in worst:
        w = r["worst"]
        lines.append("| {} | {} | {:.1f} | {:.2f} | {:.2f} |".format(
            r["id"], r["kind"], w["deg"], w["km"][0], w["km"][1]))
    text = "\n".join(lines) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return text


# --------------------------------------------------------------------------
# rim audit (the guarantee, measured)
# --------------------------------------------------------------------------
def slope_deg_field(field: np.ndarray) -> np.ndarray:
    gy, gx = np.gradient(field.astype(np.float64), RAW_M)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def reported_window_mask(ways_list: list[dict], stats: list[dict], shape,
                         step: int = STEP) -> np.ndarray:
    """Cells the grader has already declared it cannot bench: everything within
    a full shoulder of a reported over-cap window. Nothing inside is a defect —
    it is the ground an authored piece is placed over."""
    m = np.zeros(shape, dtype=bool)
    by_id = {s["id"]: s for s in stats}
    ny, nx = shape
    for way in ways_list:
        st = by_id.get(way["id"])
        if not st or not st.get("stretches"):
            continue
        pts = resample(way["px"], step)
        if len(pts) < 2:
            continue
        ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
        chain = np.concatenate([[0.0], np.cumsum(ds)])
        rr = int(math.ceil((0.5 * max(FLAT_WIDTH_M.values()) + MAX_SHOULDER_M) / RAW_M)) + 2
        for w in st["stretches"]:
            idx = np.flatnonzero((chain >= w["fromM"]) & (chain <= w["toM"]))
            for i in idx:
                cy, cx = int(pts[i, 1]), int(pts[i, 0])
                m[max(0, cy - rr):min(ny, cy + rr + 1),
                  max(0, cx - rr):min(nx, cx + rr + 1)] = True
    return m


def audit_rims(natural: np.ndarray, graded: np.ndarray,
               ways_list: list[dict], stats: list[dict]) -> dict:
    """The province numbers behind the printed guarantee."""
    delta = graded - natural
    changed = np.abs(delta) > 1e-4
    before, after = slope_deg_field(natural), slope_deg_field(graded)
    steeper = changed & (after > RIM_MAX_DEG + 1.0) & (after > before + 1.0)
    excused = reported_window_mask(ways_list, stats, natural.shape)
    bad = steeper & ~excused
    rim = after[changed]
    windows = sum(len(s.get("stretches", [])) for s in stats)
    return {"cellsFilledOver10m": int((delta > 10.0).sum()),
            "cellsFilledOver30m": int((delta > 30.0).sum()),
            "maxFillM": round(float(delta.max()), 2),
            "maxCutM": round(float(-delta.min()), 2),
            "rimCellsMadeSteeper": int(steeper.sum()),
            "rimCellsMadeSteeperOutsideWindows": int(bad.sum()),
            "rimP95Deg": round(float(np.percentile(rim, 95)) if rim.size else 0.0, 2),
            "rimMaxDeg": round(float(rim.max()) if rim.size else 0.0, 2),
            "overCapWindows": int(windows)}


def snapshot_natural_state(height_path: Path, province: Path) -> tuple[Path, Path]:
    """Freeze the pre-grading state and return the ungraded heightfield path.

    Grading reshapes the ground *because of* where the plot put places and
    where the route solvers ran, and the water bake then follows the graded
    ground. Re-scoring siting on that surface is a feedback loop that quietly
    moves committed records, so the natural state is snapshotted once and the
    siting layer (`site_fields.ProvinceSurvey`) reads the snapshot. A fresh
    `refine_province` run makes the refined heights newer than the snapshot,
    which refreshes it.
    """
    ungraded = height_path.with_name("refined-height-ungraded-f32.npy")
    marker = height_path.with_name("refined-height-graded-by.json")
    # The snapshot is valid only while the refined heights are still the ones
    # THIS tool last wrote. Anything else (a fresh refine_province) means the
    # natural state moved on. An mtime test alone would be fatal here: our own
    # output is always newer than the snapshot it came from.
    fingerprint = {"size": height_path.stat().st_size,
                   "mtime_ns": height_path.stat().st_mtime_ns}
    stale = not ungraded.exists() or not marker.exists() \
        or json.loads(marker.read_text()) != fingerprint
    if stale:
        shutil.copy2(height_path, ungraded)
    water, natural = province / "water", province / "water" / "natural"
    if water.exists() and (stale or not natural.exists()):
        natural.mkdir(parents=True, exist_ok=True)
        for f in sorted(water.glob("water-*")):
            shutil.copy2(f, natural / f.name)
    return ungraded, marker


def main() -> None:
    from .compile_chunks import DEFAULT_HEIGHTS

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("heights", nargs="?", default=str(DEFAULT_HEIGHTS))
    ap.add_argument("--province", default=str(PROVINCE))
    ap.add_argument("--dry-run", action="store_true", help="report only, write no rasters")
    ap.add_argument("--audit-rims", action="store_true",
                    help="print the province rim/fill numbers and exit without writing")
    args = ap.parse_args()

    height_path = Path(args.heights)
    province = Path(args.province)
    if args.audit_rims:
        # Read-only: never take (or refresh) a snapshot just to measure.
        ungraded = height_path.with_name("refined-height-ungraded-f32.npy")
        marker = height_path.with_name("refined-height-graded-by.json")
        if not ungraded.exists():
            raise SystemExit("no ungraded snapshot to audit against; run the "
                             "grader once first")
    else:
        ungraded, marker = snapshot_natural_state(height_path, province)
    h = np.load(ungraded)
    level, wet = _water_fields(province, h.shape)
    graded, stats = grade(h, ways(province), level, wet,
                          spans=load_structure_spans())
    cells = int((graded != h).sum())
    if args.audit_rims:
        print(json.dumps(audit_rims(h, graded, ways(province), stats), indent=2))
        return
    write_stretches(stats)
    print(write_report(stats, REPORT_PATH, cells, province))
    if args.dry_run:
        return
    np.save(height_path, graded)
    marker.write_text(json.dumps({"size": height_path.stat().st_size,
                                  "mtime_ns": height_path.stat().st_mtime_ns}))
    # keep the studio's 2D height raster in step with the graded surface
    # Studio rasters. `height-rg.png` is the GRADED surface (what the world
    # is); `height-natural-rg.png` is the ungraded one, which is what SITING
    # scores on — the macro plot and the route networks were solved on natural
    # ground, and re-scoring them on ground that was shaped *because* of them
    # is a feedback loop that quietly moves committed places.
    meta_path = province / "refined" / "meta.json"
    meta = json.loads(meta_path.read_text())
    lo, hi = meta["heightMinMetres"], meta["heightMaxMetres"]
    natural_half = ndimage.gaussian_filter(h, 1.0)[::2, ::2]
    graded_half = ndimage.gaussian_filter(graded, 1.0)[::2, ::2]
    lo = min(lo, float(natural_half.min()), float(graded_half.min()))
    hi = max(hi, float(natural_half.max()), float(graded_half.max()))

    def save(arr, name):
        q = np.round((arr - lo) / (hi - lo) * 65535.0).astype(np.uint16)
        rg = np.zeros((*q.shape, 3), dtype=np.uint8)
        rg[..., 0] = q >> 8
        rg[..., 1] = q & 0xFF
        Image.fromarray(rg).save(province / "refined" / name)

    save(graded_half, "height-rg.png")
    save(natural_half, NATURAL_HEIGHT_FILE)
    meta["heightMinMetres"], meta["heightMaxMetres"] = lo, hi
    meta["naturalHeight"] = NATURAL_HEIGHT_FILE
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"graded heightfield written: {height_path} ({cells} samples changed)")


if __name__ == "__main__":
    main()
