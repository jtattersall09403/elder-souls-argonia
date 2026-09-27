"""16k fix 2 round 5 planner rulings on the workbench: (1) `apply` seats every
ground-settled piece once more on the final padded ground (building AND run
pads) and hung pieces follow their parent; (3) an asset id held by several
kits resolves in the place's own culture kits first."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import pads, paths  # noqa: E402
from workbench.kits import Catalogue  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

CLAYWATER = "place.imperial-fringe.claywater-station"
BARREL = "vanilla:clutter/barrel01"


def test_reseat_settles_props_again_and_hung_pieces_follow(monkeypatch, tmp_path):
    """Run members and padded pieces keep their pose; a ground-settled prop is settled again on
    the final ground; a piece mounted on it moves by the same rise."""
    scene = Scene(path=tmp_path / "s.json", placeId="p")
    run = Piece("w1", "wall", 0.0, 0.0, y=10.0, role={"kind": "run", "id": "r", "index": 0},
                settledBy="settle:streamed-origin:chunks")
    prop = Piece("crate", "crate", 5.0, 0.0, y=10.5, settledBy="settle:streamed-perimeter:chunks")
    lamp = Piece("lamp", "lamp", 5.0, 0.0, y=11.5, settledBy="mount:crate")
    # round 6 ruling 1: a piece that owns a pad keeps its pad seat
    house = Piece("b2", "house", 9.0, 0.0, y=10.5, pad={"kind": "plinth"},
                  settledBy="settle:streamed-origin:chunks")
    scene.pieces = [run, prop, lamp, house]
    calls = []

    def fake_settle(cat, sc, piece, source="chunks", declared_pads=None):
        calls.append((piece.uid, source))
        piece.y = 10.0              # the final padded ground lies 0.5 m lower
        return {"y": piece.y}

    monkeypatch.setattr(wb, "_settle", fake_settle)
    monkeypatch.setattr(pads, "scene_pads", lambda cat, sc: {})
    moves = wb.reseat_after_pads(None, scene)
    assert calls == [("crate", "chunks")]
    assert run.y == 10.0 and prop.y == 10.0 and lamp.y == pytest.approx(11.0)
    assert house.y == 10.5
    assert [m["uid"] for m in moves] == ["crate", "lamp"]


@pytest.mark.skipif(not (paths.PUBLISHED_KITS / "settlement-imperial-v1.kit.json").exists(),
                    reason="needs the published kits")
def test_an_exterior_prop_in_an_interior_kit_reads_the_culture_kit_row():
    """barrel01 sits in bmv-treehouse-int (first alphabetically) and in the
    imperial settlement kit: at Claywater (culture imperial) the imperial
    kit's row decides, as the compile resolves it."""
    assert Catalogue().row(BARREL)["kit"] == "bmv-treehouse-int"
    assert wb.place_catalogue(CLAYWATER).row(BARREL)["kit"] == "settlement-imperial-v1"


def test_interior_kits_come_last_in_the_place_preference(monkeypatch):
    """Round 6 ruling 4: an exterior prop also held by an interior kit reads
    the exterior kit's row, so interior-zero kits rank after every exterior
    kit of the place's cultures."""
    paths.bridge()
    from worldgen import compile_settlement as cs
    inner = cs.interior_kits()
    assert {"vanilla-farmhouse-int", "vanilla-imperial-int"} <= inner
    got = cs.place_kit_preference(CLAYWATER)
    first_inner = min(i for i, k in enumerate(got) if k in inner)
    assert all(k in inner for k in got[first_inner:]), got
    assert got[0] == "settlement-imperial-v1"
