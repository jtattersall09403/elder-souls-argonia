"""16k lane F: run pads (carried item 13) — seat, emit, merge, apply."""

from __future__ import annotations

import numpy as np

from . import terrain_patches as tp
from .settlement_run_pads import (SEAT_BAR_M, apply_settlement_pad, declare_order,
                                  merge_pad_patches, run_pad_patches)


def _row(i: int, x0: float, rise: float = 0.0) -> dict:
    return {"id": f"place.t.run.piece.{i}", "run": {"id": "place.t.run", "riseM": rise},
            "anchor": {"designedSinkM": {"p50": 0.1}}, "scale": 1.0,
            "footprintM": [[x0, 0.0], [x0 + 4.0, 0.0], [x0 + 4.0, 1.0], [x0, 1.0]]}


def _falling(x: float, _z: float) -> float:
    """Ground 10 m high to x = 8, then falling 0.2 m per metre."""
    return 10.0 if x <= 8.0 else 10.0 - 0.2 * (x - 8.0)


def test_only_the_members_the_ground_falls_away_from_get_a_pad():
    rows = [_row(0, 0.0), _row(1, 4.0), _row(2, 8.0), _row(3, 12.0)]
    (patch,) = run_pad_patches(rows, "place.t", _falling)
    assert patch["id"] == "patch.pad.settlement.place.t.run" and patch["kind"] == "settlement-pad"
    pieces = {r["placementId"][-1]: r for r in patch["params"]["pieces"]}
    assert set(pieces) == {"2", "3"}                       # the datum and its level twin sit
    assert all(r["gapM"] > SEAT_BAR_M for r in pieces.values())
    assert pieces["3"]["targetM"] == 10.0                   # the chain's ground line (datum 9.9 + sink)
    assert not tp.validate([patch])
    assert run_pad_patches(rows, "place.t", lambda x, z: 10.0) == []
    assert run_pad_patches(rows, "place.t", _falling, is_wet=lambda x, z: x > 8.0) == []


def test_the_merge_is_cumulative_a_pad_that_worked_is_never_dropped():
    rows = [_row(0, 0.0), _row(1, 4.0), _row(2, 8.0), _row(3, 12.0)]
    first = run_pad_patches(rows, "place.t", _falling)
    other = {"id": "patch.poling.x", "kind": "poling-channel", "order": 0, "after": [],
             "bboxM": [100.0, 100.0, 110.0, 110.0], "maxDeltaM": 1.0}
    merged = merge_pad_patches([other], first)
    # re-measured on the ground the pad already raised: no gap, nothing emitted
    again = merge_pad_patches(merged, run_pad_patches(rows, "place.t", lambda x, z: 10.0))
    assert sorted(p["id"] for p in again) == sorted(p["id"] for p in merged)
    assert again == merged
    declare_order(again)
    assert not tp.validate(again)


def test_the_pad_seats_every_footprint_sample_and_tapers_outside():
    mpp = 2.0
    h = np.zeros((40, 40), np.float32)
    patch = {"id": "patch.pad.settlement.t.r", "kind": "settlement-pad", "bboxM": [30.0, 30.0, 38.0, 34.0],
             "blendM": 3.0, "maxDeltaM": 2.0,
             "params": {"pieces": [{"placementId": "a", "targetM": 0.5,
                                    "footprintM": [[30.0, 30.0], [38.0, 30.0], [38.0, 34.0], [30.0, 34.0]]}]}}
    out, stats = apply_settlement_pad(h, patch, mpp, cell_offset=0.5)
    for x, z in patch["params"]["pieces"][0]["footprintM"] + [[34.0, 32.0]]:
        assert out[int(z / mpp), int(x / mpp)] == 0.5       # the nearest-pixel sampler reads the seat
    assert out[0, 0] == 0.0 and 0.0 < out[16, 12] < 0.5      # far ground untouched; a taper between
    assert stats["maxRaiseM"] == 0.5 and stats["maxCutM"] == 0.0
    assert "settlement-pad" in tp.KINDS and tp.SCHEMA_VERSION == 2
