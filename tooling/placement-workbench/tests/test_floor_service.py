"""An open-floor house on piles (manifest `walkTopM`, blueprint parcel
`interior: none`) is served through its floor (Riverwalk long house,
2026-09-29): walkRule reaches the floor top, berthReachRule measures to the
floor's edge, propSeatRule seats a prop on the floor inside that service. A
house with a door is judged by its doorway exactly as before. Local only:
the Claywater fixture scene needs the raw kit builds and the ground window."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import measure, paths, rules  # noqa: E402
from workbench.kits import Catalogue  # noqa: E402
from workbench.scene import Piece  # noqa: E402

LAYOUT = HERE.parent / "fixtures" / "claywater-walk1.layout.json"
HOUSE = "composite:stilt/swamp-house-with-landing"
PARCEL = "parcel.test.open-floor-house"


@pytest.fixture(scope="module")
def cat():
    return Catalogue()


@pytest.fixture(scope="module")
def base(applied_layout, cat):
    from workbench import pads
    s = applied_layout(LAYOUT)
    pads.ground_for(cat, s, None)
    return s


def _blueprint(tmp_path, monkeypatch, scene, kind):
    """The place's blueprint with the test parcel added (interior ``kind``)."""
    src = json.loads((paths.BLUEPRINTS / f"{scene.placeId}.json").read_text())
    src["blueprint"]["parcels"] = list(src["blueprint"].get("parcels") or []) + [
        {"id": PARCEL, "interior": {"kind": kind}, "services": ["lodging", "trader"]}]
    (tmp_path / f"{scene.placeId}.json").write_text(json.dumps(src))
    monkeypatch.setattr(paths, "BLUEPRINTS", tmp_path)


def _house(cat, scene, lift=0.0):
    """The swamp house by the road terminal, its floor top 0.1 m over the
    ground at its landing's end (+ ``lift``), placed walkable."""
    tx, tz = rules.terminal(scene)
    p = scene.add(Piece("fh", HOUSE, tx + 14.0, tz, 180.0,
                        role={"kind": "parcel", "id": PARCEL}, walkable=True))
    g = scene.ground()
    top = cat.row(HOUSE)["walkTopM"]
    p.y = float(g.chunk_height(tx + 4.0, tz)) + 0.1 - top + lift
    return p


def _view(base, tmp_path):
    s = base.view()
    s.path = tmp_path / "scene.json"
    return s


def test_open_floor_house_serves_entrance_lodging_trader_on_its_floor(base, cat, tmp_path,
                                                                     monkeypatch):
    scene = _view(base, tmp_path)
    _blueprint(tmp_path, monkeypatch, scene, "none")
    p = _house(cat, scene)
    got = rules.walk(cat, scene)
    t = next(t for t in got["targets"] if t["uid"] == "fh")
    assert t["id"] == "floor:fh" and t["ok"], t
    assert t["services"] == ["entrance", "lodging", "trader"]
    assert not any(x["id"].startswith("door:fh") for x in got["targets"])
    route = rules.walk_routes(cat, scene)["routes"]["floor:fh"]
    assert route["parcelId"] == PARCEL
    # a prop on the floor seats on the floor, inside the service
    floor_y = rules.floor_services(cat, scene)["fh"]["floorY"]
    on = rules.floor_outline(cat, p, floor_y).representative_point()
    stool = scene.add(Piece("fh-stool", scene.piece("isy-barrel1").asset, on.x, on.y, 0.0))
    stool.y = 0.0
    stool.y = floor_y - rules._lowest_m(cat, stool)
    row = rules.prop_seat(cat, scene, ["fh-stool"])["pieces"]["fh-stool"]
    assert row["on"] == "floor:fh" and row["inside"] == PARCEL and abs(row["gapM"]) < 0.01
    # berth reach counts to the floor edge, never the house as its own way
    edge = rules.floor_outline(cat, p, floor_y)
    ex, ez = edge.exterior.coords[0] if edge.geom_type == "Polygon" else \
        max(edge.geoms, key=lambda g: g.area).exterior.coords[0]
    scene.paths.append({"id": "test.to-floor", "pointsM": [list(rules.terminal(scene)), [ex, ez]]})
    b = rules.berth_reach(cat, scene)
    if "fh" in b["pieces"]:                 # a water-class parcel is a berth
        assert b["pieces"]["fh"]["to"] == "floor"
        assert b["pieces"]["fh"]["way"] != "fh"
        assert b["pieces"]["fh"]["gapM"] <= rules.BERTH_REACH_M


def test_open_floor_house_with_its_floor_out_of_reach_fails_naming_the_floor(
        base, cat, tmp_path, monkeypatch):
    scene = _view(base, tmp_path)
    _blueprint(tmp_path, monkeypatch, scene, "none")
    _house(cat, scene, lift=1.5)
    got = rules.walk(cat, scene)
    t = next(t for t in got["targets"] if t["uid"] == "fh")
    assert t["id"] == "floor:fh" and not t["ok"]
    assert any(f.startswith("fh: walk to its floor (walkTopM top") for f in got["failures"])


def test_a_door_house_is_judged_as_before(base, cat, tmp_path, monkeypatch):
    scene = _view(base, tmp_path)
    before = rules.walk(cat, scene)
    _blueprint(tmp_path, monkeypatch, scene, "dwelling")
    _house(cat, scene)
    assert rules.floor_services(cat, scene) == {}
    got = rules.walk(cat, scene)
    mine = [t for t in got["targets"] if t["uid"] == "fh"]
    assert mine and all(t["kind"] == "door" for t in mine)
    assert "fh" not in json.dumps(before["targets"])
    others = [t for t in got["targets"] if t["uid"] != "fh"]
    assert [(t["id"], t["ok"]) for t in others] == [(t["id"], t["ok"]) for t in before["targets"]]
