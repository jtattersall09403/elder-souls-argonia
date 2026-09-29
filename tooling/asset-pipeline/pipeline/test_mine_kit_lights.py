"""mine_kit_lights: LIGH values read from the record, and the config merge."""
import json
import struct

from .mine_kit_lights import ligh_record, merge_into_config


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
