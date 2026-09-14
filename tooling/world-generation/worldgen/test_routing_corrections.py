"""The owner's routing corrections start where the river actually ends.

2026-09-13/14 drift: `fromMouth` is a position typed at 10 m precision; read
as a grid cell it landed one row beside river.1223-143's last cell, the
re-route started from a non-river cell, and the coarse pass no longer
reproduced the one the shaped ground was frozen on (3 minor river cells). The
start is now resolved to the river's last cell and checked against the id.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from .approved_bodies import apply_routing_corrections, resolve_mouth


def _routing(n=40):
    """A river down column 20 from row 2 to row 29, ending in a sea sink that
    fills rows 30+; a pocket of that sea at rows 30-33, cols 18-22 will be
    declared not-sea by the correction."""
    rivers = np.zeros((n, n), np.uint8)
    flow = np.full((n, n), -1, np.int64)
    sink = np.zeros((n, n), bool)
    sink[30:] = True
    for y in range(2, 30):
        rivers[y, 20] = 1
        flow[y, 20] = (y + 1) * n + 20
    accum = np.where(rivers > 0, 2.0, 0.0).astype(np.float32)
    return {"rivers": rivers, "flow_to": flow, "sink": sink, "accum_km2": accum,
            "watersheds": np.zeros((n, n), np.int32)}


def test_mouth_resolves_to_the_rivers_last_cell_not_the_typed_cell():
    r = _routing()
    n = r["rivers"].shape[0]
    # a position one row past the mouth, on a cell that is not river
    assert r["rivers"][30, 20] == 0
    assert resolve_mouth(r, 20, 30, "river.20-29") == 29 * n + 20
    # and one column beside it
    assert resolve_mouth(r, 21, 29, None) == 29 * n + 20


def test_mouth_id_disagreement_is_an_error():
    r = _routing()
    with pytest.raises(SystemExit):
        resolve_mouth(r, 20, 30, "river.20-27")   # the id names an upstream cell
    with pytest.raises(SystemExit):
        resolve_mouth(r, 5, 5, None)               # no mouth anywhere near


def test_correction_reroutes_from_the_mouth_and_is_deterministic(tmp_path):
    r = _routing()
    n = r["rivers"].shape[0]
    mpp = 10.0
    doc = {"corrections": [{
        "id": "c", "river16a": "river.20-29",
        "notSeaBox": {"eastM": [180, 220], "southM": [300, 330]},
        "fromMouth": {"eastM": 200, "southM": 300},      # row 30: one row past the mouth
        "mouthNear": {"eastM": 200, "southM": 360},
    }]}
    path = tmp_path / "corr.json"
    path.write_text(json.dumps(doc))
    z = np.zeros((n, n), np.float32)
    logs = []
    out = apply_routing_corrections(dict(r), z, mpp, corrections=path, log=logs.append)
    # the box is no longer a sink, the river continues from ITS last cell through it to the sea
    assert not out["sink"][30:34, 18:23].any()
    assert out["flow_to"][29, 20] != -1 and out["flow_to"][29, 20] == 30 * n + 20
    assert (out["rivers"][30:34, 20] > 0).all()
    assert "mouth cell (20 E, 29 S)" in logs[0]
    again = apply_routing_corrections(dict(r), z, mpp, corrections=path, log=lambda *_: None)
    for k in ("rivers", "flow_to", "sink", "accum_km2"):
        assert np.array_equal(out[k], again[k])
