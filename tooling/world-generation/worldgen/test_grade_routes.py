"""Route grading: gradient caps, rim benching, determinism, water safety."""

from __future__ import annotations

import math

import numpy as np

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
    bad = changed & (after > gr.RIM_MAX_DEG + 1.0) & (after > before + 1.0)
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
