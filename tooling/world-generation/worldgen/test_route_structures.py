"""Authored route geometry: the compiler, its refusals, and the grading exemption."""

from __future__ import annotations

import json
import math

import numpy as np
import pytest

from . import grade_routes as G
from .compile_route_structures import (DECK_LINE, FAMILIES, FOOT,
                                       MONOLITH_OVERHANG_MAX_M, RAMP_MAX_DEG,
                                       SPAN_SYSTEMS, choose_monolith,
                                       compile_structure, publish_route_outputs,
                                       residual_over_cap, validate,
                                       validate_spans)
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
    """A kit manifest that measures exactly what the family and span tables claim."""
    out = {}
    for spec in FAMILIES.values():
        for role, piece in spec.items():
            if role == "span" or not isinstance(piece, dict):
                continue
            out[piece["asset"]] = {
                "id": piece["asset"],
                "sizeM": [piece["widthM"], piece["runM"], max(piece["riseM"], 0.5)],
                "originOffsetM": [0.0, 0.0, 0.0],
            }
    for system in SPAN_SYSTEMS.values():
        pieces = [p for p in (system.get(r) for r in ("deck", "pier", "abutment"))
                  if p] + (system.get("monoliths") or [])
        for piece in pieces:
            height = max(piece.get("dropM", 0.0), 1.0) + piece.get("deckOffsetM", 0.0)
            if piece["anchor"] == FOOT:
                pivot = 0.0
                height = max(height, piece.get("storeyM", height))
            else:
                pivot = piece.get("dropM", height)
            out[piece["asset"]] = {
                "id": piece["asset"],
                "sizeM": [piece["widthM"], piece["runM"], round(height, 3)],
                "originOffsetM": [0.0, 0.0, round(pivot, 3)],
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


def test_a_deck_steeper_than_the_ramp_cap_is_built_as_a_flight_and_reported():
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
          "kind": "deck", "family": "dunmer-stone",
          "fromM": 100.0, "toM": 160.0, "why": "test"}
    placements, row = compile_structure(st, way, h, _kit_stub())
    assert placements, "the window must still be built"
    assert row["kind"] == "stepped-ascent", row["kind"]
    correction = row.get("kindCorrected")
    assert correction, "a silent correction is exactly what this must not be"
    assert correction["was"] == "deck" and correction["now"] == "stepped-ascent"
    assert correction["gradeDeg"] > RAMP_MAX_DEG
    # the stored rise and the measured rise are both reported, because the gap
    # between them IS the finding
    assert "recordRiseM" in correction and "groundRiseM" in correction


def test_refuses_an_authored_window_past_the_current_route_endpoint():
    way, h = _slope_way(cells=80)
    st = {"id": "structure.dunmer-north-test.stale", "wayId": way["id"],
          "kind": "deck", "family": "dunmer-stone",
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


# --------------------------------------------------------------------------
# span systems (route-spans-v1)
# --------------------------------------------------------------------------
def test_every_family_declares_a_complete_span_system():
    """A family must say how it carries a way over a gap, and the system it
    names must be able to terminate its own run."""
    validate_spans(_kit_stub())


def test_a_family_with_no_span_block_is_refused():
    fam = {"broken": {"culture": "test",
                      "stair": {"asset": "a", "runM": 4.0, "riseM": 1.0, "widthM": 3.0}}}
    with pytest.raises(ValueError, match="no `span` block"):
        validate_spans(_kit_stub(), fam)


def test_a_deck_with_no_abutment_is_refused():
    """MUTATION: drop this and a chain can end in mid-air with nothing failing."""
    systems = {"broken": {"deck": {"asset": "a", "runM": 4.0, "widthM": 3.0,
                                   "anchor": DECK_LINE}}}
    kit = {"a": {"id": "a", "sizeM": [3.0, 4.0, 1.0], "originOffsetM": [0, 0, 1.0]}}
    with pytest.raises(ValueError, match="no abutment"):
        validate_spans(kit, {}, systems)


def test_a_deck_line_piece_whose_pivot_is_its_foot_is_refused():
    """The whole point of `deck-line`: the pivot IS the walking surface and the
    structure hangs below it. A foot-anchored piece placed there is buried."""
    systems = {"broken": {
        "deck": {"asset": "a", "runM": 4.0, "widthM": 3.0, "anchor": DECK_LINE},
        "abutment": {"asset": "a", "runM": 4.0, "widthM": 3.0, "anchor": DECK_LINE}}}
    kit = {"a": {"id": "a", "sizeM": [3.0, 4.0, 20.0], "originOffsetM": [0, 0, 0.0]}}
    with pytest.raises(ValueError, match="foot-anchored"):
        validate_spans(kit, {}, systems)


def test_a_pier_drop_that_the_manifest_does_not_measure_is_refused():
    systems = {"broken": {
        "deck": {"asset": "a", "runM": 4.0, "widthM": 3.0, "anchor": DECK_LINE},
        "abutment": {"asset": "a", "runM": 4.0, "widthM": 3.0, "anchor": DECK_LINE},
        "pier": {"asset": "a", "runM": 4.0, "widthM": 3.0, "anchor": DECK_LINE,
                 "dropM": 40.0, "everyM": 4.0}}}
    kit = {"a": {"id": "a", "sizeM": [3.0, 4.0, 20.0], "originOffsetM": [0, 0, 18.0]}}
    with pytest.raises(ValueError, match="shaft the manifest measures"):
        validate_spans(kit, {}, systems)


def test_a_system_may_not_mix_whole_bridges_with_a_chained_deck():
    systems = {"broken": {
        "deck": {"asset": "a", "runM": 4.0, "widthM": 3.0, "anchor": DECK_LINE},
        "abutment": {"asset": "a", "runM": 4.0, "widthM": 3.0, "anchor": DECK_LINE},
        "monoliths": [{"asset": "a", "runM": 20.0, "widthM": 3.0, "anchor": DECK_LINE}]}}
    kit = {"a": {"id": "a", "sizeM": [3.0, 4.0, 20.0], "originOffsetM": [0, 0, 18.0]}}
    with pytest.raises(ValueError, match="mixes whole authored bridges"):
        validate_spans(kit, {}, systems)


def test_the_monolith_rule_takes_the_smallest_bridge_that_fits():
    arch = SPAN_SYSTEMS["stone-arch"]
    # A 40 m road crossing: bridge01 (42.084 m, 9.133 m wide) is the smallest
    # that both covers it and carries a 5 m running surface.
    chosen = choose_monolith(arch, 40.0, 5.0)
    assert chosen["asset"].endswith("bridge01"), chosen
    # A 23 m track: the narrow twin is enough.
    assert choose_monolith(arch, 23.0, 3.6)["asset"].endswith("bridgenarrow01")
    # A 60 m crossing is longer than anything vanilla ships whole.
    assert choose_monolith(arch, 60.0, 5.0) is None
    # And a 5 m gap does NOT get a 23 m bridge overhanging 18 m of hillside.
    assert choose_monolith(arch, 5.0, 3.6) is None


def test_a_crossing_is_built_on_the_chord_with_piers_that_reach_the_ground():
    """The measured proof the owner is shown: no floating end, no buried deck,
    every pier standing on the ground under it, and no terrain touched."""
    way, h = _slope_way(rise_per_m=0.0)         # the way runs cells 4 -> 60
    # 15 m deep: inside the 21.848 m of shaft the Nordic pier carries below its
    # deck-line pivot, so every pier can reach the floor of it
    h[:, 22:46] -= 15.0
    # the gorge sits between chainage 20 m and 63 m; the window brackets it,
    # so both endpoints are on the level ground the road actually arrives on
    st = {"id": "structure.dunmer-north-test.1", "wayId": way["id"],
          "kind": "bridge", "family": "dunmer-stone",
          "fromM": 10.0, "toM": 90.0, "why": "test"}
    placements, row = compile_structure(st, way, h, _kit_stub())
    facts = row["span"]
    assert facts["arrangement"] == "chain", facts     # too long for any monolith
    assert facts["system"] == "nordic-viaduct"
    assert facts["piers"] > 0 and facts["piersShort"] == 0
    roles = [p["role"] for p in placements]
    assert roles[0] == "abutment" and "abutment" in roles[1:], roles[:3]
    # The deck ends meet the ground; nothing floats and nothing is buried.
    assert facts["endDropM"] == [0.0, 0.0]
    ys = [p["posM"][1] for p in placements if p["role"] == "deck"]
    assert ys, "a chained crossing must lay deck"
    assert max(ys) - min(ys) < 5.0, "the deck runs on the chord, not the ground"
