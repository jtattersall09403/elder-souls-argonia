"""mine_kit_lights: LIGH values read from the record, and the config merge."""
import json
import struct

from types import SimpleNamespace

from .mine_kit_lights import ligh_record, median_offset, merge_into_config, piece_offset
from worldgen.esp_index import UNITS_PER_METRE  # noqa: E402  (path set by mine_kit_lights)


def _data(radius=512, rgb=(173, 103, 52), flags=0x9, period=1.5):
    return (struct.pack("<iI", -1, radius) + bytes([*rgb, 0]) + struct.pack("<I", flags)
            + struct.pack("<6f", 1.0, 90.0, 0.0, period, 0.2, 12.0) + struct.pack("<If", 0, 0.0))


def test_ligh_record_reads_data_and_fnam_fade():
    light = ligh_record({b"EDID": b"FarmInteriorFireLight01\0", b"DATA": _data(),
                         b"FNAM": struct.pack("<f", 1.35)}, "0001abcd")
    assert (light["radiusUnits"], light["colourRgb"], light["fade"]) == (512, [173, 103, 52], 1.35)
    assert light["flags"] == ["dynamic", "flicker"]
    assert light["flicker"]["frequency"] == 0.667
    assert ligh_record({b"DATA": b"\0" * 8}, "x") is None


def test_merge_never_overwrites_a_block_another_method_wrote(tmp_path):
    walk2 = {"formId": "00088243", "evidence": "Skyrim.esm: DefaultTorch01NS is the nearest LIGH ref",
             "fixtureKind": "brazier"}
    (tmp_path / "k.json").write_text(json.dumps({"id": "k", "assets": [
        {"asset": "a", "light": walk2}, {"asset": "b"}, {"asset": "c"}]}, indent=2) + "\n")
    new = {"formId": "1", "evidence": "... (pipeline/mine_kit_lights.py)."}
    wrote = merge_into_config("k", {"a": {"light": dict(new)}, "b": {"light": dict(new)},
                                    "c": {"light": None}}, tmp_path)
    assert wrote == ["b"]
    assets = {e["asset"]: e for e in json.loads((tmp_path / "k.json").read_text())["assets"]}
    assert assets["a"]["light"] == walk2 and assets["b"]["light"] == new and "light" not in assets["c"]


def test_light_above_a_table_candle_is_gltf_y():
    """Skyrim Z-up -> glTF Y-up: a LIGH 1 m above the candle is offset y 1, at any yaw."""
    for yaw in (0.0, 1.3, 4.0):
        ref = SimpleNamespace(pos=(100.0, 200.0, 50.0), rot=(0.0, 0.0, yaw), scale=1.0)
        x, y, z = piece_offset(ref, (100.0, 200.0, 50.0 + UNITS_PER_METRE))
        assert abs(y - 1.0) < 1e-6 and abs(x) < 1e-6 and abs(z) < 1e-6


def test_wall_light_out_of_the_face_turns_with_the_piece():
    """A LIGH 1 m along the piece's local -Y stays at glTF z +1 whatever the yaw
    (clockwise heading, local (x, y) -> world (x cos + y sin, -x sin + y cos))."""
    import math
    for yaw in (0.0, math.pi / 2, 3.5):
        u = UNITS_PER_METRE
        ref = SimpleNamespace(pos=(0.0, 0.0, 0.0), rot=(0.0, 0.0, yaw), scale=2.0)
        light = (-u * math.sin(yaw) * 2, -u * math.cos(yaw) * 2, 0.0)
        x, y, z = piece_offset(ref, light)
        assert abs(x) < 1e-6 and abs(y) < 1e-6 and abs(z - 1.0) < 1e-6


def test_scattered_hits_keep_height_and_drop_the_side():
    wall = [(0.0, -0.1, 1.1), (0.1, 0.0, 1.0), (-0.1, -0.05, 1.3)]
    assert median_offset(wall) == [0.0, -0.05, 1.1]
    shared = [(0.22, 0.36, 0.72), (-2.0, 0.07, -1.7), (-0.46, -0.14, 0.82),
              (2.51, 0.07, 0.61), (0.27, 0.05, 1.57)]
    assert median_offset(shared) == [0.0, 0.07, 0.0]


def test_a_re_mine_carries_the_hand_set_fixture_kind(tmp_path):
    mined = {"formId": "1", "evidence": "... (pipeline/mine_kit_lights.py)."}
    (tmp_path / "k.json").write_text(json.dumps({"id": "k", "assets": [
        {"asset": "a", "light": {**mined, "fixtureKind": "lantern"}}]}, indent=2) + "\n")
    merge_into_config("k", {"a": {"light": {"formId": "2", "evidence": mined["evidence"]}}}, tmp_path)
    light = json.loads((tmp_path / "k.json").read_text())["assets"][0]["light"]
    assert light["formId"] == "2" and light["fixtureKind"] == "lantern"
