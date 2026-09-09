"""Route grading: gradient caps, rim benching, determinism, water safety."""

from __future__ import annotations

import functools
import math

import numpy as np
import pytest

from worldgen import grade_routes as gr
from worldgen.scale import RAW_M


def terrace(n: int = 260, lip_x: int = 130, drop_m: float = 9.0) -> np.ndarray:
    """A flat upper terrace that falls away in one abrupt lip — the shape the
    owner reported roads running off the edge of."""
    h = np.zeros((n, n), dtype=np.float32)
    h[:, lip_x:] = -drop_m
    h[:, lip_x] = -drop_m * 0.5
    return h


def straight_way(kind: str, y: int = 120, x0: int = 10, x1: int = 80) -> dict:
    """A way running west to east across the lip, in macro px (STEP = 3)."""
    return {"id": f"test.{kind}", "kind": kind,
            "px": [[x, y] for x in range(x0, x1 + 1)]}


def _profile(h: np.ndarray, way: dict):
    pts = gr.resample(way["px"])
    z = gr.sample_bilinear(h, pts[:, 0], pts[:, 1])
    ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
    return z, ds


def test_lip_is_graded_under_the_cap_for_every_class():
    h = terrace()
    for kind, cap in gr.GRADIENT_CAP_DEG.items():
        way = straight_way(kind, y=40)
        before = gr.max_gradient_deg(*_profile(h, way))
        assert before > cap, "the synthetic lip must start over the cap"
        graded, stats = gr.grade(h, [way])
        after = gr.max_gradient_deg(*_profile(graded, way))
        assert after <= cap + 0.5, (kind, before, after)
        assert stats[0]["graded"] and stats[0]["metres"] > 0


def _slope_deg(field: np.ndarray) -> np.ndarray:
    gy, gx = np.gradient(field, RAW_M)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def test_grading_never_leaves_a_rim_steeper_than_thirty_degrees():
    """Nowhere the pass touched may end up over 30 deg unless the untouched
    ground there was already that steep (grading may not CREATE a wall)."""
    h = terrace()
    graded, _ = gr.grade(h, [straight_way("road", y=40)])
    before, after = _slope_deg(h), _slope_deg(graded)
    changed = np.abs(graded - h) > 1e-4
    # +2: `after` is a central difference over 1.83 m, and a smoothstep face
    # built to exactly 30 deg reads a little over that on the discrete grid.
    bad = changed & (after > gr.RIM_MAX_DEG + 2.0) & (after > before + 1.0)
    assert not bad.any(), (int(bad.sum()), float(after[bad].max()))


def test_cross_slope_on_the_running_surface_is_flat():
    h = terrace()
    way = straight_way("road", y=40)
    graded, _ = gr.grade(h, [way])
    row = 40 * gr.STEP
    half = int(0.5 * gr.FLAT_WIDTH_M["road"] / RAW_M)
    col = 60 * gr.STEP
    strip = graded[row - half:row + half + 1, col]
    cross = np.degrees(np.arctan(np.abs(np.diff(strip)) / RAW_M)) if strip.size > 1 else np.zeros(1)
    assert cross.max() <= gr.CROSS_SLOPE_MAX_DEG + 1e-6, float(cross.max())


def test_total_climb_is_preserved_and_endpoints_pinned():
    h = terrace()
    way = straight_way("footpath", y=40)
    z, ds = _profile(h, way)
    g = gr.grade_profile(z.astype(np.float64), ds, gr.GRADIENT_CAP_DEG["footpath"])
    assert math.isclose(g[0], z[0], abs_tol=1e-6)
    assert math.isclose(g[-1], z[-1], abs_tol=1e-6)


def test_deterministic():
    h = terrace()
    w = [straight_way("road", y=40), straight_way("track", y=60)]
    a, sa = gr.grade(h, w)
    b, sb = gr.grade(h, w)
    assert np.array_equal(a, b)
    assert sa == sb


def test_boardwalk_grades_nothing():
    h = terrace()
    graded, stats = gr.grade(h, [straight_way("boardwalk", y=40)])
    assert np.array_equal(graded, h)
    assert stats[0]["graded"] is False


def test_water_is_not_dug_into_off_fords():
    """A way running along a river bank must not be cut below the water
    surface; a way crossing the water writes nothing there (ford/bridge)."""
    h = terrace(drop_m=4.0)
    level = np.full(h.shape, -1.0, dtype=np.float32)
    wet = np.zeros(h.shape, dtype=bool)
    wet[:, 150:170] = True             # a river band east of the lip
    h[wet] = -2.0                      # its bed, below the surface
    way = straight_way("track", y=40)
    graded, stats = gr.grade(h, [way], level, wet)
    # nothing written inside the wet crossing band
    assert np.array_equal(graded[:, 152:168], h[:, 152:168])
    # and no graded sample anywhere sits below the published surface on dry land
    changed = np.abs(graded - h) > 1e-4
    assert not np.any(changed & wet)


# --------------------------------------------------------------------------
# survivors: what the report says a way still needs (owner requirement 2026-09-05)
# --------------------------------------------------------------------------
def test_where_label_names_the_end_a_step_sits_at():
    assert gr.where_label(0.0) == "the place end"
    assert gr.where_label(1.0) == "the junction end"
    assert "mid-way" in gr.where_label(0.5)


def test_remedy_matches_the_shape_of_the_defect():
    def stat(over_m, frac):
        return {"kind": "track", "worst": {"overM": over_m, "frac": frac}}
    assert "lip" in gr.remedy(stat(8.0, 0.5))            # a metre or two of step
    assert "bridge" in gr.remedy(stat(60.0, 0.5))        # a gap mid-way
    assert "terrace" in gr.remedy(stat(60.0, 0.02))      # the approach to a site
    assert "flight" in gr.remedy(stat(400.0, 0.5))       # a whole hill climb


def test_report_lists_every_survivor_with_a_remedy():
    h = terrace(drop_m=60.0)                 # far past any class cut/fill budget
    way = straight_way("road", y=40)
    _, stats = gr.grade(h, [way])
    assert stats[0]["after"] > gr.GRADIENT_CAP_DEG["road"] + 1.0
    text = gr.write_report(stats, gr.REPORT_PATH.with_name("_test-route-grading.md"), 0)
    assert "Survivors and what each one needs" in text
    assert way["id"] in text
    assert gr.remedy(stats[0]) in text
    gr.REPORT_PATH.with_name("_test-route-grading.md").unlink()


# --------------------------------------------------------------------------
# the province itself (the synthetic lip above is necessary, not sufficient)
# --------------------------------------------------------------------------
@functools.lru_cache(maxsize=1)
def _province_grade_cached():
    """Grade the committed NATURAL raster in memory. Read-only throughout —
    `np.load` never writes, and nothing here writes back — so the whole slow
    province suite shares ONE grade (~8 s) instead of paying for a 65 MB copy
    and a fresh solve per test."""
    from worldgen.compile_chunks import DEFAULT_HEIGHTS
    src = DEFAULT_HEIGHTS.with_name("refined-height-ungraded-f32.npy")
    if not src.exists() or not (gr.PROVINCE / "routes.json").exists():
        pytest.skip("province rasters not available in this checkout")
    h = np.load(src)
    level, wet = gr._water_fields(gr.PROVINCE, h.shape)
    ways = gr.ways(gr.PROVINCE)
    graded, stats = gr.grade(h, ways, level, wet, spans=gr.load_structure_spans())
    return h, graded, ways, stats, level, wet


def _province_grade(tmp_path=None):
    h, graded, ways, stats, _, _ = _province_grade_cached()
    return h, graded, ways, stats


# Budgets, not zeros. Two residual classes are known and are NOT this pass's
# defect: a way crossing an earlier way that is locked at a different height
# (the junction is a junction only in plan), and the shoreline, where nothing
# may be filled. Both are small, local and bounded.
#
# RE-BASED 2026-09-09, measured, not bumped. The old cap was 20000 against a
# measured 19989 — 0.05 % of headroom, which is not a gate, it is a coin flip:
# CI caught the SAME code at 22602 on a different water rebuild, because this
# residual moves with the ground the water pass shifts under grading (a 13 %
# swing on identical code). The measured-waterline grader leaves 19559 on the
# shipped build. The cap is set at 30000: 53 % above the highest number ever
# measured on a working grader (22602) and 52 % of what the un-benched grader
# left (57955), so the wall-building failure this gate exists for still trips
# it. The tighter, network-size-independent companion gate below is the one
# that catches a real regression.
MAX_STEEPENED_CELLS = 30000
# Steepened cells as a fraction of the cells grading touched. This does not
# move when the route network grows or the province is re-plotted, which is
# what made the absolute count unusable. Measured 0.0226 (19559 / 864788).
MAX_STEEPENED_FRACTION = 0.030
MAX_RIM_P95_DEG = 47.0   # the un-benched grader left 47.6


@pytest.mark.slow
def test_province_grading_fills_nothing_deeper_than_the_cap(tmp_path):
    h, graded, ways, stats = _province_grade(tmp_path)
    fill = graded - h
    assert float(fill.max()) <= gr.MAX_FILL_M + 0.01, float(fill.max())
    assert int((fill > 10.0).sum()) == 0


@pytest.mark.slow
def test_province_grading_leaves_no_unreported_wall(tmp_path):
    """Every face grading leaves steeper than 30 deg is either ground that was
    already that steep, or inside a window the grader reported as over-cap —
    where `author_route_structures` puts a deck, span or flight instead."""
    h, graded, ways, stats = _province_grade(tmp_path)
    audit = gr.audit_rims(h, graded, ways, stats)
    touched = int((np.abs(graded - h) > 1e-4).sum())
    bad = audit["rimCellsMadeSteeperOutsideWindows"]
    assert bad < MAX_STEEPENED_CELLS, audit
    assert bad / max(touched, 1) < MAX_STEEPENED_FRACTION, (bad, touched, audit)
    assert audit["rimP95Deg"] <= MAX_RIM_P95_DEG, audit
    assert audit["overCapWindows"] > 0


# --------------------------------------------------------------------------
# where the grader thinks the water is (redesigned 2026-09-09)
# --------------------------------------------------------------------------
# The three sites a full chain reported when the FIRST attempt at the
# depth-not-class rewrite went in: two hovering edges, a coarse river cell with
# a dry bed, and strip points outside their trench. Reproducing them needs a
# whole terrain chain and eight minutes; the grader-side CAUSE of all three is
# checkable in seconds against the shipped rasters, which is what these do.
# World metres (x east, z south).
REVERTED_FAILURE_SITES = [
    (1320.0, 3080.0, "hovering edge"),
    (1338.0, 3076.0, "hovering edge"),
    (2764.0, 2530.0, "hovering edge"),
    (6186.0, 499.0, "strip points outside their trench"),
]


def _water_faults(h, graded, level, wet):
    """(raised open water, cut below the wet-season waterline) — the two ways
    grading can break a water invariant, measured on the grader's own output.

    A dry river bed is grading FILLING a cell that has water standing on it; a
    hovering edge is grading CUTTING a cell below the waterline of the water
    beside it. Neither needs the water compiler to detect."""
    raised = (graded > h + 1e-4) & wet
    known = np.isfinite(level)
    cut_under = known & (h >= level) & (graded < level - 1e-3)
    return raised, cut_under


@pytest.mark.slow
def test_grading_never_fills_measured_open_water_or_cuts_under_the_waterline():
    h, graded, _, _, level, wet = _province_grade_cached()
    raised, cut_under = _water_faults(h, graded, level, wet)
    assert int(raised.sum()) == 0, f"{int(raised.sum())} open-water cells filled"
    assert int(cut_under.sum()) == 0, (
        f"{int(cut_under.sum())} cells cut below the wet-season waterline "
        f"(worst {float((level - graded)[cut_under].max()):.2f} m under)")


@pytest.mark.slow
def test_grading_leaves_no_dry_neighbour_below_its_wet_neighbours_surface():
    """A hovering edge, stated as the grader's own contract and measured
    WITHOUT reference to the grader's internal floor — so shrinking that floor
    cannot make this pass. For every dry cell touching measured water, the
    graded ground must not sit below the water standing next to it, unless the
    NATURAL ground was already there (grading is not the cause of that one)."""
    from scipy import ndimage

    from worldgen.water_report import ShippedWater
    h, graded, _, _, _, _ = _province_grade_cached()
    S = ShippedWater(gr.PROVINCE / "water", heights=None)
    wet = S.wet_grid("wet")
    surface = (S.w2 + S.signed_depth_m("wet") - S.depth2).astype(np.float32)
    # Highest wet-season water surface in the 8-neighbourhood, on the export
    # grid, lifted to the full-res grid the grader writes on.
    near = ndimage.maximum_filter(np.where(wet, surface, -np.inf), size=3)
    z = (h.shape[0] / near.shape[0], h.shape[1] / near.shape[1])
    near = ndimage.zoom(near, z, order=0)[: h.shape[0], : h.shape[1]]
    wet_full = ndimage.zoom(wet.astype(np.uint8), z, order=0)[: h.shape[0], : h.shape[1]] > 0
    bad = ~wet_full & np.isfinite(near) & (h >= near) & (graded < near - 1e-3)
    assert int(bad.sum()) == 0, (
        f"{int(bad.sum())} dry cells cut below the water beside them, "
        f"worst {float((near - graded)[bad].max()):.2f} m")


@pytest.mark.slow
@pytest.mark.parametrize("x,z,what", REVERTED_FAILURE_SITES)
def test_the_reverted_water_rewrite_failure_sites_are_clean(x, z, what):
    h, graded, _, _, level, wet = _province_grade_cached()
    raised, cut_under = _water_faults(h, graded, level, wet)
    r = int(round(60.0 / RAW_M))
    cy, cx = int(z / RAW_M), int(x / RAW_M)
    sl = (slice(max(cy - r, 0), cy + r + 1), slice(max(cx - r, 0), cx + r + 1))
    assert int(raised[sl].sum()) == 0, f"{what} at {x}/{z}: open water filled"
    assert int(cut_under[sl].sum()) == 0, f"{what} at {x}/{z}: cut under the waterline"


def test_the_waterline_clamp_holds_on_the_shoulder_not_just_the_centreline():
    """The synthetic version of the same rule, so it runs where the province
    rasters do not (CI). A way graded ALONGSIDE a river pulls the bank down
    towards the road across its whole shoulder, tens of metres wide — capping
    only the centreline profile leaves the bank cut below the river."""
    n = 260
    h = np.zeros((n, n), dtype=np.float32)
    h[:, 150:170] = -3.0                    # a trench with a river in it
    level = np.full((n, n), -np.inf, dtype=np.float32)
    wet = np.zeros((n, n), dtype=bool)
    wet[:, 150:170] = True
    level[:, 148:172] = -1.0                # surface, and its two-texel skirt
    # A road on the bank, 6 m from the water, wanting to sit 5 m lower.
    h[:, 172:] = 0.0
    way = {"id": "test.bank", "kind": "road",
           "px": [[58, y] for y in range(10, 80)]}   # macro px 58 -> sample 174
    h[:, 174] = -5.0                        # the line it wants to hold
    graded, _ = gr.grade(h, [way], level, wet)
    known = np.isfinite(level)
    cut_under = known & (h >= level) & (graded < level - 1e-3)
    assert int(cut_under.sum()) == 0, int(cut_under.sum())
    assert not np.any((graded > h + 1e-4) & wet), "open water was filled"


def test_marsh_is_gradeable_ground_but_still_obeys_the_waterline():
    """Marsh is wet GROUND: it is excluded from the no-write mask (so a marsh
    way is not chopped into graded and ungraded pieces), and it is NOT excluded
    from the waterline floor (so the road across it is a causeway, not a
    trench). `_water_fields` is what encodes that; this is the province check
    that the mask really drops marsh and the floor really keeps it."""
    from worldgen.water_report import ShippedWater
    if not (gr.PROVINCE / "water" / "water-meta.json").exists():
        pytest.skip("water bake not available in this checkout")
    S = ShippedWater(gr.PROVINCE / "water", heights=None)
    marsh_wet = S.wet_grid("wet") & (_cls_on(S) == gr.MARSH_CLASS)
    assert marsh_wet.any(), "the province has wet marsh to test against"
    level, wet = gr._water_fields(gr.PROVINCE, S.wet_grid("wet").shape)
    assert not np.any(wet & marsh_wet), "marsh leaked into the no-write mask"
    assert np.isfinite(level[marsh_wet]).all(), "wet marsh has no waterline floor"


def test_the_grader_floor_is_the_wet_season_waterline_not_the_dry_one():
    """The season is named, and it is the wet one. The reverted 2026-09-09
    version said 'measured at the WET SEASON' in its comment and tested the dry
    season in its code; a road graded to the dry waterline is under water for
    half the year. Measured here against the accessor, so the two cannot drift
    apart again."""
    from worldgen.water_report import ShippedWater
    if not (gr.PROVINCE / "water" / "water-meta.json").exists():
        pytest.skip("water bake not available in this checkout")
    S = ShippedWater(gr.PROVINCE / "water", heights=None)
    wet_wet, wet_dry = S.wet_grid("wet"), S.wet_grid("dry")
    assert wet_wet.sum() > wet_dry.sum(), "the seasons must differ to test this"
    surface_wet = S.w2 + S.signed_depth_m("wet") - S.depth2
    level, _ = gr._water_fields(gr.PROVINCE, wet_wet.shape)
    # Every cell wet ONLY in the wet season must still carry a floor, and the
    # floor over open water must be the wet-season surface, not the dry one.
    seasonal = wet_wet & ~wet_dry
    assert seasonal.any()
    assert np.isfinite(level[seasonal]).all(), \
        "cells wet only in flood have no waterline floor: the grader is on the dry season"
    body = wet_wet & np.isfinite(level)
    assert float((level[body] - surface_wet[body]).min()) >= -1e-3, \
        "the floor sits below the wet-season surface"


def _cls_on(S):
    """The class label resampled onto the surface grid, nearest — the same
    combination `_water_fields` has to make (1345^2 label, 2017^2 measurement)."""
    from scipy import ndimage
    w = S.wet_grid("wet")
    z = (w.shape[0] / S.cls.shape[0], w.shape[1] / S.cls.shape[1])
    return ndimage.zoom(S.cls, z, order=0)[:w.shape[0], :w.shape[1]]
