"""The freeze gate (Phase 16b): the frozen array keeps every promise the graph
makes — and, first, the checker is shown to FAIL on each kind of broken
promise, so a green run means something."""

from __future__ import annotations

import json

import numpy as np
import pytest

from . import terrain_preconditions as tpc
from .scale import RAW_M

M = RAW_M


def _world(n=80):
    """A tilted plain 10 m high with a river trench down the middle, a bowl,
    a fall face and a plunge bowl — the promises a graph would record."""
    h = np.full((n, n), 10.0, dtype=np.float32)
    h -= (np.arange(n, dtype=np.float32)[:, None] * 0.0)          # flat; the trench carries the slope
    sea = np.zeros((n, n), bool)
    sea[-2:, :] = True
    h[-2:, :] = -1.0
    # trench: column 40, bed 8.0 falling to 7.0, width 6 m, shoulder at level + 0.3
    for y in range(10, 68):                       # the centreline's last point is row 67
        L = 9.0 - (y - 10) / 60.0
        h[y, 39:42] = L - 1.0
        h[y, 37:39] = L + 0.3
        h[y, 42:44] = L + 0.3
    # bowl at (20, 15): floor 6.0, spill 10.0
    h[18:23, 13:18] = 7.0
    h[20, 15] = 6.0
    # fall face at column 60: lip 10 -> plunge 5 over one sample, plunge bowl floor 2.5
    h[30:40, 58:63] = 5.0
    h[35, 60] = 2.5
    return h, sea


def _level(h):
    return np.full(h.shape, -np.inf, dtype=np.float32)


def _graph():
    line = [[40 * M, y * M] for y in range(10, 70, 3)]
    return {
        "reaches": [
            {"id": "reach.t", "kind": "horizontal-channel", "surface": "channel", "widthM": 6.0,
             "levelFromM": 9.0, "levelToM": 8.0, "centreline": line,
             "terrainPrecondition": {"kind": "trench", "bedLevelFromM": 8.0, "bedLevelToM": 7.0, "bedMaxM": 8.0,
                                     "widthM": 6.0, "shoulderCrestM": 8.3, "sealCapM": 2.5}},
            {"id": "reach.f", "kind": "vertical-fall", "surface": "fall", "levelFromM": 10.0, "levelToM": 5.0,
             "centreline": [[60 * M, 28 * M], [60 * M, 29 * M], [60 * M, 31 * M], [60 * M, 33 * M]],
             "terrainPrecondition": {"kind": "fall-face", "lipLevelM": 10.0, "plungeLevelM": 5.0,
                                     "dropM": 5.0, "faceMinSlope": 1.2, "widthM": 3.0, "lipNotch": True}},
        ],
        "bodies": [
            {"id": "body.b", "kind": "pond", "deepestCell": [15, 20], "levelM": 10.0,
             "terrainPrecondition": {"kind": "bowl", "levelM": 10.0, "floorMaxM": 6.0, "spillM": 10.0}},
            {"id": "body.p", "kind": "plunge-pool", "deepestCell": [60, 35], "levelM": 5.0,
             "terrainPrecondition": {"kind": "plunge-bowl", "levelM": 5.0, "depthM": 2.5, "radiusM": 3.0}},
        ],
        "stats": {"suspectFalls": 0},
    }


def test_the_kept_promises_pass():
    h, sea = _world()
    assert tpc.violations(h, _graph(), sea, shaped=h, level=_level(h)) == []


def test_a_raised_trench_bed_fails():
    h, sea = _world()
    h[28:35, 39:42] = 8.6                        # a sill across the bed, 0.6 m above its promise (tol 0.15)
    errs = tpc.violations(h, _graph(), sea)
    assert any("trench bed" in e for e in errs), errs


def test_a_breached_shoulder_fails():
    h, sea = _world()
    shaped = h.copy()
    h[30, 37] = 7.2                              # a gap in the levee under the water level
    errs = tpc.violations(h, _graph(), sea, shaped=shaped, level=_level(h))
    assert any("shoulder" in e for e in errs), errs


def test_a_filled_bowl_and_a_moved_spill_fail():
    h, sea = _world()
    h[20, 15] = 6.5                              # floor raised
    assert any("floor" in e for e in tpc.violations(h, _graph(), sea))
    h, sea = _world()
    h[20, 0:13] = 9.0                            # a cut from the rim to the map edge: spills at 9, not 10
    errs = tpc.violations(h, _graph(), sea)
    assert any("rim cut" in e for e in errs), errs


def test_a_missing_fall_face_and_plunge_bowl_fail():
    h, sea = _world()
    h[30:40, 58:63] = 9.0                        # the face is a step of 1 m, not 5
    errs = tpc.violations(h, _graph(), sea)
    assert any("fall face drops" in e for e in errs), errs
    h, sea = _world()
    h[35, 60] = 4.0                              # bowl not dug (floor should be <= 2.5)
    errs = tpc.violations(h, _graph(), sea)
    assert any("plunge bowl" in e for e in errs), errs


def test_a_suspect_fall_fails():
    h, sea = _world()
    g = _graph(); g["stats"]["suspectFalls"] = 1
    assert any("suspect" in e for e in tpc.violations(h, g, sea))


# --------------------------------------------------------------- the province

def _vault_ready():
    from . import hydrology_graph as hg
    from .carve_province import FROZEN_PATH
    return FROZEN_PATH.exists() and hg.GRAPH_PATH.exists()


@pytest.mark.skipif(not _vault_ready(), reason="frozen province base unavailable")
def test_the_frozen_province_keeps_every_promise():
    from . import freeze
    from .carve_province import FROZEN_PATH
    h = np.load(FROZEN_PATH)
    assert freeze.recorded(freeze.FROZEN) == freeze.sha256_of(h), "the frozen array is not the recorded one"
    errs = tpc.province_violations()
    bad = tpc.unexpected(errs)
    assert bad == [], "\n".join(bad[:40])
