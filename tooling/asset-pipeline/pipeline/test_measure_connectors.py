"""Connector measurement (97 G19, owner 2026-09-08).

The two evidence paths, one failing and one passing case each, on synthetic
inputs so the arithmetic is readable.
"""

from pipeline.measure_connectors import (bounds_connectors,
                                         coplacement_connectors, measure_kit)


def outline(hw, hd):
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]


def test_a_run_module_gets_its_two_end_faces_only():
    rec = {"planOutlineM": outline(5.0, 1.0), "heightM": 6.0}
    conns = bounds_connectors(rec)
    assert [c["face"] for c in conns] == ["east", "west"]
    assert conns[0]["positionInPiece"] == [5.0, 0.0]
    assert conns[0]["normalDeg"] == 90.0
    assert conns[0]["widthM"] == 2.0 and conns[0]["heightM"] == 6.0


def test_a_squarer_piece_gets_all_four_faces():
    rec = {"planOutlineM": outline(3.0, 2.0), "heightM": 9.0}
    assert sorted(c["face"] for c in bounds_connectors(rec)) == ["east", "north", "south", "west"]


def _templates(*offsets):
    return [{"id": f"stub:t{i}", "anchor": "kit:a", "part": "kit:b", "count": 9,
             "offsetM": [ox, oy, 0.0], "riseM": 0.0, "yawDeg": yaw, "isDoor": False}
            for i, (ox, oy, yaw) in enumerate(offsets)]


FOOTPRINTS = {"kit:a": {"planOutlineM": outline(1.8, 1.8), "heightM": 2.7},
              "kit:b": {"planOutlineM": outline(1.8, 1.8), "heightM": 2.7}}


def test_a_co_placement_puts_the_face_midway_between_the_two_pivots():
    out = coplacement_connectors({"kit:a", "kit:b"}, _templates((3.6, 0.0, 0.0)), FOOTPRINTS)
    a = out["kit:a"][0]
    b = out["kit:b"][0]
    assert a["positionInPiece"] == [1.8, 0.0] and a["normalDeg"] == 90.0
    assert b["positionInPiece"] == [-1.8, 0.0] and b["normalDeg"] == 270.0
    assert a["evidence"] == "co-placement" and a["pairedWith"] == "kit:b"


def test_a_chain_of_two_modules_does_not_become_a_face_inside_the_neighbour():
    # the same pair also appears two modules apart; halving THAT offset would
    # put a connector 3.6 m out, inside the piece next door.
    out = coplacement_connectors({"kit:a", "kit:b"},
                                 _templates((3.6, 0.0, 0.0), (7.2, 0.0, 0.0)), FOOTPRINTS)
    assert [c["positionInPiece"] for c in out["kit:a"]] == [[1.8, 0.0]]


def test_a_vertical_stack_is_not_a_ground_plane_join():
    tmpl = _templates((0.0, 0.0, 0.0))
    tmpl[0]["offsetM"] = [0.0, 0.0, 2.73]
    tmpl[0]["riseM"] = 2.73
    assert coplacement_connectors({"kit:a", "kit:b"}, tmpl, FOOTPRINTS) == {}


def test_the_shipped_gate_arch_carries_a_face_on_each_pier():
    data = measure_kit("imperial-keep")
    arch = data["assets"]["mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/"
                          "exterior/walls/mwimparchwallgate01"]
    assert [c["face"] for c in arch] == ["east", "west"]
    assert data["counts"]["assets"] == 88
