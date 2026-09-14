"""Typed terrain patches (Phase 16b): each of the six invariants is shown
FAILING on an injected bad patch, and a good patch passes."""

from __future__ import annotations

import numpy as np
import pytest

from . import terrain_patches as tp
from .scale import RAW_M

M = RAW_M
N = 120


def _ctx(with_channel=True, structures=()):
    """A flat 10 m plain with a pond (level 8) at rows 60-70, cols 20-30 and
    a river trench down column 90 at level 6."""
    level = np.full((N, N), -np.inf, dtype=np.float32)
    level[60:70, 20:30] = 8.0
    sea = np.zeros((N, N), bool)
    ys = np.arange(5, 115, dtype=np.float32)
    xs = np.full_like(ys, 90.0)
    L = np.full_like(ys, 6.0)
    w = np.full_like(ys, 6.0)
    live = np.ones(len(ys), bool)
    if not with_channel:
        live[:] = False
    return tp.Context(level, sea, (ys, xs, L, w, live), npz=None, structures=list(structures))


def _ground():
    h = np.full((N, N), 10.0, dtype=np.float32)
    h[60:70, 20:30] = 7.0          # the pond's bed under its 8 m level
    h[5:115, 88:93] = 5.0          # the trench bed
    return h


def _patch(bbox_m, max_delta=2.0, **kw):
    p = {"id": "patch.test", "kind": "poling-channel", "order": 0, "after": [], "crosses": [],
         "makesWater": False, "bboxM": list(bbox_m), "blendM": 0.0, "maxDeltaM": max_delta,
         "source": {}, "params": {}}
    p.update(kw)
    return p


def _box(y0, y1, x0, x1):
    return [x0 * M, y0 * M, x1 * M, y1 * M]


def test_a_good_patch_passes():
    before, after = _ground(), _ground()
    after[40:45, 40:45] += 1.0                # a mound: nothing to hold water
    assert tp.check_invariants(before, after, _patch(_box(40, 45, 40, 45)), _ctx()) == []


def test_1_bounds_fails_outside_the_region():
    before, after = _ground(), _ground()
    after[40:45, 40:45] -= 1.0
    after[50, 50] -= 0.5                      # a sample outside the declared bbox
    errs = tp.check_invariants(before, after, _patch(_box(40, 45, 40, 45)), _ctx())
    assert any(e.startswith("bounds") for e in errs), errs


def test_2_amplitude_fails_over_max_delta():
    before, after = _ground(), _ground()
    after[40:45, 40:45] -= 3.0
    errs = tp.check_invariants(before, after, _patch(_box(40, 45, 40, 45), max_delta=2.0), _ctx())
    assert any(e.startswith("amplitude") for e in errs), errs


def test_3_channels_fail_on_a_raise_in_the_trench_and_a_cut_by_a_non_channel_kind():
    before, after = _ground(), _ground()
    after[50:52, 89:91] += 0.5                # raised inside the channel
    errs = tp.check_invariants(before, after, _patch(_box(48, 54, 86, 96)), _ctx())
    assert any("raised inside a channel" in e for e in errs), errs
    before, after = _ground(), _ground()
    after[50:52, 94:96] -= 0.5                # lowered in the shoulder by a terrain-request kind
    errs = tp.check_invariants(before, after, _patch(_box(48, 54, 86, 98), kind="terrain-request"), _ctx())
    assert any("non-channel kind" in e for e in errs), errs


def test_4_water_fails_when_a_body_dries_leaks_or_a_new_hollow_appears():
    before, after = _ground(), _ground()
    after[62:64, 22:24] = 8.5                 # pond cells raised above their level: dried
    errs = tp.check_invariants(before, after, _patch(_box(60, 70, 20, 30)), _ctx())
    assert any("dried" in e for e in errs), errs
    before, after = _ground(), _ground()
    after[65, 30:60] = 7.5                    # a cut from the pond out past the patch region: leak
    errs = tp.check_invariants(before, after, _patch(_box(64, 66, 30, 40)), _ctx())
    assert any("beyond the patch region" in e or "past the window" in e for e in errs), errs
    before, after = _ground(), _ground()
    after[40:45, 40:45] -= 1.0                # a closed hollow with makesWater undeclared
    errs = tp.check_invariants(before, after, _patch(_box(40, 45, 40, 45)), _ctx())
    assert any("new depression" in e for e in errs), errs
    errs = tp.check_invariants(before, after, _patch(_box(40, 45, 40, 45), makesWater=True), _ctx())
    assert not any("new depression" in e for e in errs), errs


def test_5_overlap_fails_without_a_declared_order():
    a = _patch(_box(40, 45, 40, 45), id="patch.a")
    b = _patch(_box(43, 50, 43, 50), id="patch.b")
    errs = tp.validate([a, b])
    assert any("overlap without a declared order" in e for e in errs), errs
    b["after"] = ["patch.a"]
    assert tp.validate([a, b]) == []


def test_6_structures_fail_when_crossed_undeclared():
    before, after = _ground(), _ground()
    after[40:45, 40:45] += 1.0
    structure = {"id": "structure.test", "pointsM": [[40 * M, 42 * M], [46 * M, 42 * M]]}
    errs = tp.check_invariants(before, after, _patch(_box(40, 45, 40, 45)), _ctx(structures=[structure]))
    assert any("crosses structure.test" in e for e in errs), errs
    errs = tp.check_invariants(before, after, _patch(_box(40, 45, 40, 45), crosses=["structure.test"]),
                               _ctx(structures=[structure]))
    assert errs == []


def test_apply_all_refuses_and_records():
    """A poling channel with no receiving water is refused; the array is unchanged."""
    ctx = _ctx()
    frozen = _ground()
    way = {"id": "waterway.test", "pointsM": [[50 * M, 20 * M], [50 * M, 30 * M]], "terminalM": [50 * M, 30 * M]}
    patch = _patch(_box(10, 40, 40, 60), kind="poling-channel", makesWater=True, max_delta=4.0,
                   params={"waterway": way})
    h, receipts, boxes = tp.apply_all(frozen, [patch], ctx, log=lambda *_: None)
    assert receipts[0]["status"] == "refused" and "receiving water" in receipts[0]["reason"]
    assert np.array_equal(h, frozen) and boxes == []


# ----------------------------------------------------------- 16c kinds

def _bed_cut(bbox_m, stations, **kw):
    return _patch(bbox_m, kind="bed-cut", blendM=tp.BED_CUT_BLEND_M, max_delta=8.0,
                  params={"stations": stations, "blendM": tp.BED_CUT_BLEND_M}, **kw)


def _levee(bbox_m, stations, **kw):
    return _patch(bbox_m, kind="levee", blendM=tp.LEVEE_BLEND_M, max_delta=3.0, driesBodyCells=True,
                  params={"stations": stations, "edgeGapM": tp.LEVEE_EDGE_GAP_M, "bandM": 6.0, "blendM": tp.LEVEE_BLEND_M}, **kw)


def test_bed_cut_lowers_the_run_to_its_promise_and_a_weir_floors_it():
    """A dam of 12 m across the trench at rows 50-52: the cut takes it to the
    parabola (bed 4.5 at the centre, level 6 at the edge); a weir station floors
    its own disc at the level; nothing rises; the blend never gouges the bank."""
    ctx = _ctx()
    h = _ground()
    h[50:53, 88:93] = 12.0
    sts = [{"x": 90.0, "y": float(y), "halfWidthM": 3.0, "levelM": 6.0, "bedM": 4.5, "weir": False} for y in (49, 50, 51, 52, 53)]
    out, rec = tp.apply_bed_cut(h, _bed_cut(_box(46, 56, 86, 94), sts))
    assert out[51, 90] == pytest.approx(4.5, abs=1e-3) and out[51, 90] < h[51, 90]
    assert out[51, 91] <= 6.0 + 1e-3
    assert (out <= h).all() and out[30, 90] == h[30, 90]
    assert out[51, 96] == h[51, 96]          # 6 samples out (11 m): untouched, no gouge into the plain
    assert tp.check_invariants(h, out, _bed_cut(_box(46, 56, 86, 94), sts), ctx) == []
    weir = [dict(s, weir=True, bedM=6.0) for s in sts]
    out_w, _ = tp.apply_bed_cut(h, _bed_cut(_box(46, 56, 86, 94), weir))
    assert out_w[51, 90] == pytest.approx(6.0, abs=1e-3)


def test_bed_cut_is_refused_when_it_raises_anything():
    before, after = _ground(), _ground()
    after[50:53, 88:93] -= 0.5
    after[55, 90] += 0.2                      # a raise, even inside the trench
    sts = [{"x": 90.0, "y": 51.0, "halfWidthM": 3.0, "levelM": 6.0, "bedM": 4.5, "weir": False}]
    errs = tp.check_invariants(before, after, _bed_cut(_box(46, 58, 86, 94), sts), _ctx())
    assert any(e.startswith("bed-cut") and "raised" in e for e in errs), errs


def test_levee_raises_the_band_never_the_water_width_and_fills_no_water():
    """A trench at level 6 down column 90 with the plain to its east dropping
    to 4 m (a perched bank): the band (the edge .. edge + 6 m) rises to the
    crest 6.3, the width stays, the west side (already above) does not move,
    and the raise tapers to nothing 2 m past the band."""
    ctx = _ctx()
    h = _ground()
    h[40:60, 94:110] = 4.0                    # low ground east of the trench (edge at col 91.6)
    sts = [{"x": 90.0, "y": float(y), "tx": 0.0, "ty": 1.0, "halfWidthM": 3.0, "crestM": 6.3} for y in range(45, 56)]
    p = _levee(_box(42, 58, 82, 100), sts)
    out, rec = tp.apply_levee(h, p, ctx)
    assert (out >= h).all()
    assert np.array_equal(out[:, 89:92], h[:, 89:92])                     # inside the water width (6 m): untouched
    assert out[50, 92] == pytest.approx(6.3, abs=1e-3)                    # 3.7 m out: just past the 3 m half-width, in the band
    assert out[50, 94] == pytest.approx(6.3, abs=1e-3)                    # 7.3 m out: in the band
    assert h[50, 95] < out[50, 95] < 6.3                                    # 9.1 m out: in the 2 m blend (one cell), raised a little
    assert out[50, 84] == h[50, 84]                                        # the west shoulder already stands at 10
    assert out[50, 97] == h[50, 97]                                        # 12.8 m out: past band + blend
    assert tp.check_invariants(h, out, p, ctx) == []


def test_levee_is_refused_inside_the_water_width_or_when_it_lowers():
    before, after = _ground(), _ground()
    after[50:52, 94:97] += 1.0
    after[50, 90] += 0.3                      # inside the trench
    sts = [{"x": 90.0, "y": 50.0, "tx": 0.0, "ty": 1.0, "halfWidthM": 3.0, "crestM": 6.3}]
    errs = tp.check_invariants(before, after, _levee(_box(46, 56, 82, 100), sts), _ctx())
    assert any("raised inside a channel's water width" in e for e in errs), errs
    before, after = _ground(), _ground()
    after[50:52, 94:97] += 1.0
    after[50, 98] -= 0.3
    errs = tp.check_invariants(before, after, _levee(_box(46, 56, 82, 100), sts), _ctx())
    assert any(e.startswith("levee") and "lowered" in e for e in errs), errs


def test_levee_may_dry_a_body_fringe_only_inside_its_region_with_the_body_kept():
    """The pond (level 8, rows 60-70, cols 20-30, bed 7): raising its west fringe
    inside the region passes with driesBodyCells; the same raise without the
    declaration, beyond the region, or on its deepest cell is refused."""
    ctx = _ctx()
    sts = [{"x": 15.0, "y": 65.0, "tx": 0.0, "ty": 1.0, "halfWidthM": 2.0, "crestM": 8.5}]
    before = _ground(); before[65, 25] = 6.0          # the pond's deepest cell
    after = before.copy(); after[62:68, 20:22] = 8.5  # the fringe dries
    p = _levee(_box(58, 72, 10, 24), sts)
    assert tp.check_invariants(before, after, p, ctx) == []
    p_undeclared = dict(p, driesBodyCells=False)
    assert any("dried" in e for e in tp.check_invariants(before, after, p_undeclared, ctx))
    p_small = _levee(_box(58, 72, 10, 17), sts)       # region ends at col 19 (bbox + blend): cols 20-21 dried beyond it
    assert any("beyond the patch region" in e for e in tp.check_invariants(before, after, p_small, ctx))
    deep = before.copy(); deep[62:68, 20:22] = 8.5; deep[65, 25] = 8.5
    assert any("deepest cell" in e for e in tp.check_invariants(before, deep, _levee(_box(58, 72, 10, 30), sts), ctx))


def test_water_invariant_judges_the_change_not_the_frozen_rasters_own_leak():
    """A frozen body whose raster is not a closed flat flood (its level lies
    above dry ground beside it): a no-op passes, and so does a patch that
    does not touch the leak, because the check compares the flood after with
    the flood before (2026-09-14: 22 levees were refused for the raster's leak)."""
    ctx = _ctx()
    ctx.level[60:70, 30:40] = 8.0           # the raster says wet here too, over ground at 7...
    h = _ground(); h[60:70, 30:40] = 7.0; h[60:70, 40:45] = 7.5   # ...and the plain beside it is under 8 but marked dry
    assert tp.check_invariants(h, h.copy(), _patch(_box(40, 45, 40, 45)), ctx) == []
    after = h.copy(); after[42, 42] += 0.5
    assert tp.check_invariants(h, after, _patch(_box(40, 45, 40, 45)), ctx) == []


def test_rim_levee_raises_the_listed_dry_rim_never_the_body_or_a_channel_width():
    """The pond (level 8, rows 60-70, cols 20-30) leaks over dry ground at 7.5 m
    along col 31: the listed cells rise to 8.3, the pond's own wet cells and the
    river's water width never move, and the patch passes the invariants."""
    ctx = _ctx()
    h = _ground(); h[60:70, 31:33] = 7.5            # the dry rim under the pond's level
    cells = [[y, 31] for y in range(60, 70)]
    p = _patch(_box(58, 72, 28, 36), kind="levee", blendM=tp.LEVEE_BLEND_M, max_delta=3.0,
               driesBodyCells=False, params={"levelM": 8.0, "blendM": tp.LEVEE_BLEND_M, "cells": cells})
    out, rec = tp.apply_rim_levee(h, p, ctx)
    assert out[65, 31] == pytest.approx(8.3, abs=1e-3)         # the listed cell: level + freeboard
    assert out[65, 32] == pytest.approx(8.3, abs=1e-3)         # its dry 8-neighbour under the level
    assert np.array_equal(out[60:70, 20:30], h[60:70, 20:30])  # the pond's own cells: untouched
    assert np.array_equal(out[:, 88:93], h[:, 88:93])          # the river's water width: untouched
    assert rec["samplesRaised"] > 0 and (out >= h).all()
    assert tp.check_invariants(h, out, p, ctx) == []


def test_reauthoring_on_a_patched_census_keeps_the_patches(monkeypatch):
    """Defect: the census is measured on the ground the patches already moved,
    so a fixed defect vanishes from it. Authoring is cumulative — a second
    pass on an EMPTY census keeps every bed-cut and levee."""
    from . import water_correction_patches as wc

    spec = {"bedCuts": {"sites": []}, "levees": {}}
    from types import SimpleNamespace
    fake = SimpleNamespace(published_census=True, bed_over=np.zeros(0, bool), runs=lambda f: {}, ground=None)
    monkeypatch.setattr(wc, "Census", lambda *a, **k: fake)
    monkeypatch.setattr(wc, "WATER_META_PATH", tp.REPO_ROOT / "no-such-water-meta.json")

    cut = _patch(_box(10, 12, 10, 12), id="patch.bed-cut.site-a", kind="bed-cut",
                 params={"stations": [{"x": 10.0, "y": 10.0, "halfWidthM": 3.0}]})
    bank = _patch(_box(20, 22, 20, 22), id="patch.levee.reach.1-2", kind="levee",
                  params={"stations": [{"x": 20.0, "y": 20.0, "halfWidthM": 3.0}]})
    rim = _patch(_box(30, 32, 30, 32), id="patch.levee.rim.body.1-2", kind="levee",
                 params={"cells": [[30, 30]]})

    def _census(cuts, levees, rims):
        monkeypatch.setattr(wc, "bed_cut_patches", lambda c, s, **k: (cuts, {"unapprovedRuns": [], "sites": []}))
        monkeypatch.setattr(wc, "levee_patches", lambda c, s, **k: (
            levees, {"perchedRuns": 0, "perchedStations": 0, "sealable": 0, "unsealable": [], "maxRaiseM": 4.5}))
        monkeypatch.setattr(wc, "rim_levee_patches", lambda c, **k: (rims, {"bodies": 0, "cells": 0, "unsealable": []}))

    _census([cut], [bank], [rim])
    first = wc.author(None, spec=spec, log=lambda *a: None, existing=[])
    assert sorted(p["id"] for p in first) == ["patch.bed-cut.site-a", "patch.levee.reach.1-2", "patch.levee.rim.body.1-2"]

    _census([], [], [])                      # the patched ground reports nothing
    again = wc.author(None, spec=spec, log=lambda *a: None, existing=first)
    assert sorted(p["id"] for p in again) == sorted(p["id"] for p in first)
    assert again == first

    pruned = wc.author(None, spec=spec, log=lambda *a: None, existing=first, prune=True)
    assert pruned == []
