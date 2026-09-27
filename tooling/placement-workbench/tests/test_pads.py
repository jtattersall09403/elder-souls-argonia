"""Building pads in the workbench (decision 0101): the layout's `pad` block,
the datum, the patched ground and rule R1 (`pad-fit`). Fakes only (no kit
builds, no rasters): CI-safe."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import layout, pads  # noqa: E402
from workbench.scene import Piece  # noqa: E402

HOUSE = "composite:farmhouse/farmhouse01-with-door"
WALL = "composite:farmhouse/stonewall-run-5"
HUT = "kotm:argonia/mudhuts/mudhut01"
KITS = {HOUSE: "settlement-imperial-v1", WALL: "settlement-imperial-v1", HUT: "settlement-mud-v1"}


class _Cat:
    def row(self, asset):
        return {"kit": KITS[asset]}


class _Ground:
    """Ground falling 0.2 m per metre east (2.6 m across a 13 m pad)."""

    def __init__(self, fall=0.2):
        self.fall = fall

    def chunk_height(self, x, z):
        return 10.0 - self.fall * x

    survey_height = chunk_height
    wet_east_of = None                  # water east of this x (the survey's depth raster)

    def depth(self, x, z):
        return 1.0 if self.wet_east_of is not None and x > self.wet_east_of else -1.0

    def footprint_max_slope_deg(self, poly):
        return 11.3


class _Scene:
    def __init__(self, pieces, fall=0.2):
        self.pieces = pieces
        self._g = _Ground(fall)

    def ground(self):
        return self._g


def _outline(p):
    x, z = p.x, p.z
    if p.asset == WALL:                       # a 14 x 1 m wall along z at x
        return [(x - 0.5, z - 1.0), (x + 0.5, z - 1.0), (x + 0.5, z + 12.0), (x - 0.5, z + 12.0)]
    return [(x, z), (x + 10.0, z), (x + 10.0, z + 6.0), (x, z + 6.0)]


@pytest.fixture(autouse=True)
def _outlines(monkeypatch):
    monkeypatch.setattr(pads.measure, "footprint_province", lambda cat, p: _outline(p))


def test_the_layout_pad_block_round_trips_through_the_cli():
    ap = wb.parser()
    op = {"op": "place", "uid": "b1", "asset": HOUSE, "at": [316.0, 3064.0], "yaw": 148.0,
          "settle": True, "pad": {"apronM": 1.5, "floorMinM": 35.8}}
    argv = layout.op_to_argv(op, ap)
    assert argv[-3:] == ["--pad", "apronM=1.5", "floorMinM=35.8"]
    assert layout.argv_to_op(argv, ap) == op
    bare = layout.op_to_argv({**op, "pad": {}}, ap)
    assert bare[-1] == "--pad" and layout.argv_to_op(bare, ap)["pad"] == {}
    assert "pad" not in layout.argv_to_op(layout.op_to_argv(
        {k: v for k, v in op.items() if k != "pad"}, ap), ap)
    with pytest.raises(ValueError):
        pads.parse(["height=3"])


def test_pad_fit_is_red_on_an_unretained_edge_and_green_once_walls_retain_it(monkeypatch):
    house = Piece("b1", HOUSE, 0.0, 0.0, pad={})
    scene = _Scene([house])
    pad = pads.resolve(_Cat(), scene.ground(), house)
    assert pad["how"] == "median" and pad["error"] is None
    red = pads.pad_fit(_Cat(), scene, house, pad)
    assert red["padRule"].startswith("pad-fit: 4 pad edge(s)")
    # walls of the kit's family along every edge (two ends here, two sides)
    walls = [Piece("w-west", WALL, -1.5, -0.5), Piece("w-east", WALL, 11.5, -0.5)]
    sides = [Piece("w-north", WALL, 0.0, 0.0), Piece("w-south", WALL, 0.0, 0.0)]
    outlines = {"w-north": [(-2.0, -2.0), (12.0, -2.0), (12.0, -1.0), (-2.0, -1.0)],
                "w-south": [(-2.0, 7.0), (12.0, 7.0), (12.0, 8.0), (-2.0, 8.0)]}
    monkeypatch.setattr(pads.measure, "footprint_province",
                        lambda cat, p: outlines.get(p.uid) or _outline(p))
    half = pads.pad_fit(_Cat(), _Scene([house, *walls]), house, pad)
    assert half["padRule"] and len(half["unretainedEdges"]) == 2
    green = pads.pad_fit(_Cat(), _Scene([house, *walls, *sides]), house, pad)
    assert green["padRule"] is None and green["unretainedEdges"] == []


def test_a_kit_with_no_wall_family_keeps_its_pad_within_the_bar():
    hut = Piece("b4", HUT, 0.0, 0.0, pad={})
    got = pads.pad_fit(_Cat(), _Scene([hut]), hut, pads.resolve(_Cat(), _Ground(), hut))
    assert "no retaining-wall family" in got["padRule"]
    gentle = _Scene([hut], fall=0.05)
    got = pads.pad_fit(_Cat(), gentle, hut, pads.resolve(_Cat(), gentle.ground(), hut))
    assert got["padRule"] is None


def test_the_padded_ground_is_the_datum_under_the_pad_and_its_slope_is_flat():
    house = Piece("b1", HOUSE, 0.0, 0.0, pad={"datumM": 9.0})
    scene = _Scene([house])
    g = pads.ground_for(_Cat(), scene, house)
    assert g.chunk_height(5.0, 3.0) == 9.0 and g.survey_height(5.0, 3.0) == 9.0
    assert g.chunk_height(60.0, 3.0) == scene.ground().chunk_height(60.0, 3.0)
    assert g.footprint_max_slope_deg(_outline(house)) == 0.0


def test_a_piece_without_a_pad_reads_the_same_patched_surface_the_compile_does():
    """The compile reads PaddedSurvey for every piece once the pads resolve
    (0101); the workbench seats and judges an unpadded piece beside a pad on
    that surface too, never the frozen ground."""
    house = Piece("b1", HOUSE, 0.0, 0.0, pad={"datumM": 9.0})
    plain = Piece("p", HOUSE, 11.0, 0.0)           # its outline starts 1 m off the pad's edge
    both = _Scene([house, plain])
    g = pads.ground_for(_Cat(), both, plain)
    assert g.chunk_height(2.0, 3.0) == 9.0         # the pad (the frozen ground there is 9.6)
    assert g.chunk_height(60.0, 3.0) == both.ground().chunk_height(60.0, 3.0)
    alone = _Scene([Piece("q", HOUSE, 20.0, 0.0)])
    assert pads.ground_for(_Cat(), alone, alone.pieces[0]) is alone.ground()   # no pad anywhere


def test_check_refuses_what_the_compile_refuses_water_under_the_pad():
    """`padRule` comes from the compile's own judge (settlement_run_pads.
    building_pad): a pad over water is red in `check`, not only at compile."""
    house = Piece("b1", HUT, 0.0, 0.0, 0.0, pad={})
    scene = _Scene([house], fall=0.01)
    scene._g.wet_east_of = 5.0
    got = pads.pad_fit(_Cat(), scene, house, pads.scene_pads(_Cat(), scene)["b1"])
    assert got["padRule"] and "water" in got["padRule"]


def test_a_one_metre_retaining_piece_on_a_steep_edge_skips_b3_but_not_r1(monkeypatch):
    """Planner ruling 7b (2026-09-26): a piece of the kit's wall family on
    the pad's steep east edge carries no 97 B3 footing rule, yet a 1 m piece
    covers too little of the 10 m edge for rule R1, which stays red."""
    from workbench import paths
    paths.bridge()
    from worldgen import compile_settlement as cs
    stone = "vanilla:architecture/farmhouse/stonewall/stonewall01"
    monkeypatch.setitem(KITS, stone, "settlement-imperial-v1")
    house = Piece("b1", HOUSE, 0.0, 0.0, pad={})
    wall = Piece("w1", stone, 11.5, 2.5)
    outlines = {"w1": [(11.0, 2.5), (12.0, 2.5), (12.0, 3.5), (11.0, 3.5)]}
    monkeypatch.setattr(pads.measure, "footprint_province",
                        lambda cat, p: outlines.get(p.uid) or _outline(p))
    scene = _Scene([house, wall])
    row = {"kit": KITS[stone], "id": stone, "placement": {"evidence": {"policyId": "pad"}}}
    slope = scene.ground().footprint_max_slope_deg(outlines["w1"])       # 11.3 degrees
    assert cs.fit_slope_failure(row, slope) is None
    assert cs.fit_slope_failure({**row, "id": "vanilla:clutter/barrel01"}, slope)
    got = pads.pad_fit(_Cat(), scene, house, pads.resolve(_Cat(), scene.ground(), house))
    assert got["padRule"] and got["unretainedEdges"]


def test_ground_for_reads_its_memo_before_rescanning(monkeypatch):
    """r5 review (CONFIRMED): every call built each live pad's overlay id (a
    scan of every piece and a patch build) before looking at its memo. A
    repeat call on an unchanged scene builds nothing."""
    house = Piece("b1", HOUSE, 0.0, 0.0, pad={"datumM": 9.0})
    scene = _Scene([house, Piece("p", HOUSE, 11.0, 0.0)])
    first = pads.ground_for(_Cat(), scene, house)
    calls = []
    real = pads.overlay_id
    monkeypatch.setattr(pads, "overlay_id", lambda sc, uid: calls.append(uid) or real(sc, uid))
    for p in scene.pieces:
        assert pads.ground_for(_Cat(), scene, p) is first
    assert calls == []
    house.pad = {"datumM": 8.5}                     # a changed pad is read live
    assert pads.ground_for(_Cat(), scene, house).chunk_height(5.0, 3.0) == 8.5
    assert calls == ["b1"]


def test_the_padded_chunk_heights_are_one_vectorised_pass(monkeypatch):
    """r5 review (CONFIRMED): cells an overlay reaches were sampled one
    Python call each. The array sampler never calls the point sampler and
    gives exactly the point sampler's heights."""
    import numpy as np
    from worldgen import pad_overlay

    class _Arr(_Ground):
        def chunk_heights(self, X, Z):
            return 10.0 - self.fall * np.asarray(X, float)

    house = Piece("b1", HOUSE, 0.0, 0.0, pad={"datumM": 9.0})
    g = _Arr()
    pad = pads.resolve(_Cat(), g, house)
    run = pad_overlay.building_overlay("run.r", [[14.0, 0.0], [20.0, 0.0], [20.0, 1.0], [14.0, 1.0]],
                                       11.0, 2.0)
    run.update(kind="run", hardM=0.5)
    padded = pads.PaddedGround(g, [{"id": "pad.b1", **pad}], [run])
    X, Z = np.meshgrid(np.arange(-8.0, 30.0, 0.5), np.arange(-8.0, 14.0, 0.5))
    want = np.array([[padded.chunk_height(float(x), float(z)) for x, z in zip(rx, rz)]
                     for rx, rz in zip(X, Z)])
    monkeypatch.setattr(padded, "_chunks", lambda x, z: (_ for _ in ()).throw(AssertionError))
    got = padded.chunk_heights(X, Z)
    assert got.tobytes() == want.tobytes()


def test_a_mud_pad_edge_up_to_1_2_m_is_a_graded_batter_when_its_apron_is_twice_its_height():
    """0101 R1 amendment (planner ruling 2026-09-27, walk 2 lane P): a kit with
    no retaining-wall family takes a graded earth batter (`batter: true`): an
    edge over 0.6 m and up to 1.2 m is legal when the apron is >= 2 x its
    height; narrower, or higher than 1.2 m, stays red; without `batter` the
    0.6 m bar holds."""
    def fit(fall, **pad):
        hut = Piece("b5", HUT, 0.0, 0.0, pad=dict(pad))
        s = _Scene([hut], fall=fall)
        return pads.pad_fit(_Cat(), s, hut, pads.resolve(_Cat(), s.ground(), hut))
    assert fit(0.12, apronM=2.0)["padRule"]                     # ~0.84 m edges, no batter
    assert fit(0.12, apronM=1.5, batter=True)["padRule"]        # apron 1.5 < 2 x 0.78
    assert fit(0.12, apronM=2.0, batter=True)["padRule"] is None
    assert "1.2 m as a graded batter" in fit(0.2, apronM=3.0, batter=True)["padRule"]  # 1.6 m edges
    ap = wb.parser()
    op = {"op": "place", "uid": "b5", "asset": HUT, "at": [1.0, 2.0], "yaw": 0.0,
          "pad": {"apronM": 2.0, "batter": True}}
    assert layout.argv_to_op(layout.op_to_argv(op, ap), ap)["pad"] == {"apronM": 2.0, "batter": True}
    with pytest.raises(ValueError):
        pads.parse(["batter=ture"])
