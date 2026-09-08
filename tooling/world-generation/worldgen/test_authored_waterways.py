"""Authored minor waterways are carved to a navigable, CONNECTED trench.

Source-only: builds a synthetic bank beside a body, no vault rasters.
"""
from __future__ import annotations

import numpy as np

from worldgen import authored_waterways as aw


def _bank_beside_body(mpp=1.0, n=120, body_level=1.8):
    """Left third is a body at `body_level` (bed 0 m); the rest is a 3 m bank."""
    h = np.full((n, n), 3.0, dtype=np.float32)
    h[:, :30] = 0.0
    wet = np.zeros((n, n), dtype=bool)
    wet[:, :30] = True
    level = np.full((n, n), np.nan, dtype=np.float32)
    level[wet] = body_level
    return h, level, wet


def test_carve_connects_and_reaches_promised_depth():
    mpp = 1.0
    h, level, wet = _bank_beside_body(mpp=mpp)
    before = h.copy()
    # an authored line along the bank, ending 12 m from the body edge
    way = {"id": "waterway.test.bank", "pointsM": [[42.0, 20.0], [40.0, 60.0], [42.0, 95.0]]}
    h, stats = aw.carve_authored(h, level, wet, mpp, waterways=[way])
    assert len(stats) == 1 and stats[0]["receivingLevelM"] == 1.8

    need = aw.HULL_CLASS_DEPTH_M[aw.AUTHORED_HULL_CLASS]
    seed = wet.copy()
    depth = aw.connected_depth(h, 1.8, seed)
    for x, z in aw.resample_polyline(way["pointsM"]):
        d = depth[int(round(z / mpp)), int(round(x / mpp))]
        assert d >= need, f"({x:.1f},{z:.1f}) is {d:.2f} m deep, needs {need} m"

    # nothing beyond the channel width plus its shoulder was touched
    reach = aw.CHANNEL_HALF_WIDTH_M + aw.SHOULDER_M
    changed = np.argwhere(h != before)
    pts = aw.resample_polyline(way["pointsM"])
    for y, x in changed:
        d = np.min(np.hypot(pts[:, 1] - y * mpp, pts[:, 0] - x * mpp))
        # the connecting spur runs to the body, so allow the body side too
        assert d <= reach + 2.0 or x < 30 + reach + 2.0, (y, x, d)


def test_no_receiving_water_is_an_error():
    h = np.full((80, 80), 3.0, dtype=np.float32)
    level = np.full((80, 80), np.nan, dtype=np.float32)
    wet = np.zeros((80, 80), dtype=bool)
    way = {"id": "waterway.test.dry", "pointsM": [[20.0, 20.0], [20.0, 60.0]]}
    try:
        aw.carve_authored(h, level, wet, 1.0, waterways=[way])
    except ValueError as exc:
        assert "receiving water" in str(exc)
    else:
        raise AssertionError("a line with no receiving water must fail loudly")


def test_resample_keeps_endpoints_and_spacing():
    pts = aw.resample_polyline([[0.0, 0.0], [0.0, 10.0]], spacing_m=2.0)
    assert list(pts[0]) == [0.0, 0.0] and list(pts[-1]) == [0.0, 10.0]
    steps = np.hypot(np.diff(pts[:, 0]), np.diff(pts[:, 1]))
    assert steps.max() <= 2.0 + 1e-9


def test_live_authored_file_loads_and_ends_at_its_terminal():
    from worldgen.hydrology_intent import load_authored_minor_waterways
    ways, errors = load_authored_minor_waterways()
    assert not errors, errors
    assert ways, "the authored minor waterway file must not be empty"
    for way in ways:
        assert way["pointsM"][-1] == way["terminalM"]
