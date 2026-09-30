"""Authored route geometry: the compiler, its refusals, and the grading exemption."""

from __future__ import annotations

import json
import math

import numpy as np
import pytest

from . import grade_routes as G
from .compile_route_structures import (FAMILIES, RAMP_MAX_DEG, compile_all,
                                       compile_structure, publish_route_outputs,
                                       residual_over_cap, studio_export, validate)
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
            if not isinstance(piece, dict):
                continue
            out[piece["asset"]] = {
                "id": piece["asset"],
                "sizeM": [piece["widthM"], piece["runM"], max(piece["riseM"], 0.5)],
                "originOffsetM": [0.0, 0.0, 0.0],
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


def test_rise_is_checked_against_vertical_bbox_not_a_plan_extent():
    fam = {"broken": {"culture": "test",
                      "stair": {"asset": "a", "runM": 8.0, "riseM": 3.0, "widthM": 4.0}}}
    # A 12 m horizontal extent used to make 3 m look measured even though the
    # mesh is only 1 m high.
    kit = {"a": {"id": "a", "sizeM": [4.0, 8.0, 1.0]}}
    with pytest.raises(ValueError, match="vertical z bbox"):
        validate(kit, fam)


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


def test_a_lip_step_steeper_than_the_ramp_cap_is_built_as_a_flight_and_reported():
    """The ground wins, and the correction is named.

    This used to refuse, which was right while the author and the compiler
    measured a window differently: an impossible piece meant the two disagreed
    and somebody had to look. They now share `measure_window` and `ramp_ok`, so
    the only remaining source of disagreement is honest — the author runs
    between the two road-grading passes and this compiler after the second, and
    a window's endpoints sample the shoulder pass 2 benched. Stopping the whole
    province chain on a piece nobody chose deliberately was the wrong answer;
    building what the ground can carry and saying so is the right one.

    MUTATION: drop the `kindCorrected` row and this test cannot tell a silent
    fixup from a reported one.
    """
    way, h = _slope_way(rise_per_m=0.45)      # 24 deg ground
    st = {"id": "structure.dunmer-north-test.1", "wayId": way["id"],
          "kind": "lip-step", "family": "dunmer-stone",
          "fromM": 100.0, "toM": 160.0, "why": "test"}
    placements, row = compile_structure(st, way, h, _kit_stub())
    assert placements, "the window must still be built"
    assert row["kind"] == "stepped-ascent", row["kind"]
    correction = row.get("kindCorrected")
    assert correction, "a silent correction is exactly what this must not be"
    assert correction["was"] == "lip-step" and correction["now"] == "stepped-ascent"
    assert correction["gradeDeg"] > RAMP_MAX_DEG
    # the stored rise and the measured rise are both reported, because the gap
    # between them IS the finding
    assert "recordRiseM" in correction and "groundRiseM" in correction


def test_refuses_an_authored_window_past_the_current_route_endpoint():
    way, h = _slope_way(cells=80)
    st = {"id": "structure.dunmer-north-test.stale", "wayId": way["id"],
          "kind": "lip-step", "family": "dunmer-stone",
          "fromM": 1_000.0, "toM": 1_050.0, "why": "test"}
    with pytest.raises(ValueError, match="does not overlap the current"):
        compile_structure(st, way, h, _kit_stub())


def test_route_output_publication_replaces_the_exact_file_set(tmp_path):
    out = tmp_path / "route-structures"
    out.mkdir()
    (out / "stale-way.json").write_text("stale")
    docs = {
        "track.region.current": {"schemaVersion": 1, "wayId": "track.region.current",
                                  "structures": [], "placements": []},
    }

    publish_route_outputs(docs, out)

    assert [path.name for path in out.iterdir()] == ["region-current.json"]
    assert json.loads((out / "region-current.json").read_text())["wayId"] \
        == "track.region.current"


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
def test_stretch_export_finds_the_over_cap_run():
    """The grader's run finder (16e): one window round the steep samples,
    extended by the landing either side; a structure window is what the
    grader hands over when no patch fits (test_grade_routes proves that)."""
    chain = np.arange(0.0, 100.0, 2.0)
    slopes = np.full(len(chain) - 1, 5.0)
    slopes[10:20] = 30.0
    runs = G.over_cap_runs(chain, slopes > 12.0)
    assert len(runs) == 1
    a, b = runs[0]
    assert chain[a] < 20.0 < chain[b - 1]


def test_a_way_with_no_structures_compiles_and_publishes_nothing(tmp_path):
    """Every structure on a way can go (16k walk 6: the crossings left the
    province data); the compile then carries no row, no way file and no studio
    entry for it, rather than an empty shell."""
    by_way, rows = compile_all([], {}, np.zeros((4, 4), dtype=np.float32), _kit_stub())
    assert by_way == {} and rows == []
    publish_route_outputs(by_way, tmp_path / "route-structures")
    assert list((tmp_path / "route-structures").iterdir()) == []
    assert studio_export(by_way, rows)["structures"] == []
