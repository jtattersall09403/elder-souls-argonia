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
