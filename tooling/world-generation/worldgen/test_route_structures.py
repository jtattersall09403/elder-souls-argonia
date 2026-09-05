"""Authored route geometry: the compiler, its refusals, and the grading exemption."""

from __future__ import annotations

import math

import numpy as np

from . import grade_routes as G
from .compile_route_structures import (FAMILIES, RAMP_MAX_DEG, compile_structure,
                                       residual_over_cap, validate)
from .scale import RAW_M


def _slope_way(cells: int = 240, rise_per_m: float = 0.45):
    """A straight west-east way over a constant slope, plus its heightfield.

    Macro px are full-res / STEP, and one full-res sample is RAW_M metres.
    """
    ny = nx = cells
    h = np.zeros((ny, nx), dtype=np.float32)
    h[:, :] = (np.arange(nx) * RAW_M * rise_per_m)[None, :]
    way = {"id": "track.dunmer-north.test", "kind": "track",
           "px": [[4, 20], [60, 20]]}
    return way, h


def _kit_stub() -> dict:
    """A kit manifest that measures exactly what the family table claims."""
    out = {}
    for spec in FAMILIES.values():
        for role, piece in spec.items():
            if isinstance(piece, dict):
                out[piece["asset"]] = {
                    "id": piece["asset"],
                    "sizeM": [piece["widthM"], piece["runM"], max(piece["riseM"], 0.5)],
                }
    return out


def test_family_pieces_are_walkable_flights():
    """Every family's stair is under its own cap (35 deg masonry, 48 lashed)."""
    validate(_kit_stub())


def test_refuses_a_piece_that_is_too_steep():
    fam = {"broken": {"culture": "test",
                      "stair": {"asset": "a", "runM": 2.0, "riseM": 4.0, "widthM": 2.0},
                      "landing": {"asset": "a", "runM": 2.0, "riseM": 0.0, "widthM": 2.0},
                      "deck": {"asset": "a", "runM": 2.0, "riseM": 0.0, "widthM": 2.0}}}
    kit = {"a": {"id": "a", "sizeM": [2.0, 2.0, 4.0]}}
    try:
        validate(kit, fam)
    except ValueError as e:
        assert "cap" in str(e)
    else:
        raise AssertionError("a 63 deg flight was accepted")


def test_lays_a_flight_on_a_synthetic_slope():
    way, h = _slope_way()
    piece = FAMILIES["dunmer-stone"]["stair"]
    st = {"id": "structure.dunmer-north-test.1", "wayId": way["id"],
          "kind": "stepped-ascent", "family": "dunmer-stone",
          "fromM": 100.0, "toM": 200.0, "why": "test"}
    placements, row = compile_structure(st, way, h, _kit_stub())

    # 100 m of window at the piece's own run, every piece a stair (the ground
    # climbs faster than the flight everywhere on a constant slope).
    assert row["pieces"] == math.ceil(100.0 / piece["runM"])
    assert len(placements) == row["pieces"]
    assert {p["assetId"] for p in placements} == {piece["asset"]}
    # Feet march along the way, each at the ground height under it.
    xs = [p["posM"][0] for p in placements]
    assert xs == sorted(xs)
    for p in placements:
        assert abs(p["posM"][1] - p["posM"][0] * 0.45) < 1.0
    assert placements[0]["provenance"]["sourceStructureId"] == st["id"]
    assert row["riseM"] > 0


def test_puts_a_landing_where_the_ground_flattens():
    way, h = _slope_way()
    h[:, 60:] = h[:, 60][:, None]            # a level shelf from x = 60 on
    st = {"id": "structure.dunmer-north-test.1", "wayId": way["id"],
          "kind": "stepped-ascent", "family": "dunmer-stone",
          "fromM": 40.0, "toM": 220.0, "why": "test"}
    placements, _ = compile_structure(st, way, h, _kit_stub())
    assets = {p["assetId"] for p in placements}
    assert FAMILIES["dunmer-stone"]["landing"]["asset"] in assets
    assert FAMILIES["dunmer-stone"]["stair"]["asset"] in assets


def test_refuses_a_deck_steeper_than_the_ramp_cap():
    way, h = _slope_way(rise_per_m=0.45)      # 24 deg ground
    st = {"id": "structure.dunmer-north-test.1", "wayId": way["id"],
          "kind": "deck", "family": "dunmer-stone",
          "fromM": 100.0, "toM": 160.0, "why": "test"}
    try:
        compile_structure(st, way, h, _kit_stub())
    except ValueError as e:
        assert f"{RAMP_MAX_DEG:.0f} deg deck cap" in str(e)
    else:
        raise AssertionError("a 24 deg deck was accepted")


def test_residual_is_zero_when_every_stretch_is_covered():
    doc = {"ways": [{"wayId": "track.a.b", "kind": "track", "capDeg": 12.0,
                     "stretches": [{"fromM": 10.0, "toM": 40.0, "overM": 20.0,
                                    "worstDeg": 20.0, "atFrac": 0.1}]}]}
    covered = [{"wayId": "track.a.b", "fromM": 10.0, "toM": 40.0}]
    assert residual_over_cap(doc, covered) == {}
    assert residual_over_cap(doc, []) == {"track.a.b": 20.0}


# --------------------------------------------------------------------------
# grading exemption
# --------------------------------------------------------------------------
def test_grading_leaves_a_structure_window_alone():
    """Inside a structure's window the ground keeps its natural shape, and the
    way's measured 'after' gradient ignores it — the player is on the pieces."""
    way, h = _slope_way()
    graded_free, stats_free = G.grade(h, [way], step=G.STEP)
    spans = {way["id"]: [(0.0, 400.0)]}
    graded_span, stats_span = G.grade(h, [way], step=G.STEP, spans=spans)

    pts = G.resample(way["px"], G.STEP)
    ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
    chain = np.concatenate([[0.0], np.cumsum(ds)])
    inside = (chain > 20.0) & (chain < 380.0)
    ix = np.clip(np.round(pts[inside, 0]).astype(int), 0, h.shape[1] - 1)
    iy = np.clip(np.round(pts[inside, 1]).astype(int), 0, h.shape[0] - 1)

    # The free run cuts the slope; the exempt run does not touch it.
    assert np.abs(graded_free[iy, ix] - h[iy, ix]).max() > 1.0
    assert np.abs(graded_span[iy, ix] - h[iy, ix]).max() < 1e-3
    assert stats_span[0]["structureM"] > 0.0
    assert stats_span[0]["after"] <= stats_free[0]["after"] + 1e-6


def test_stretch_export_finds_the_over_cap_run():
    chain = np.arange(0.0, 100.0, 2.0)
    slopes = np.full(len(chain) - 1, 5.0)
    slopes[10:20] = 30.0
    ok = np.ones(len(slopes), dtype=bool)
    out = G.over_cap_stretches(chain, slopes, ok, 12.0)
    assert len(out) == 1
    assert out[0]["fromM"] < 20.0 < out[0]["toM"]
    assert out[0]["worstDeg"] == 30.0
