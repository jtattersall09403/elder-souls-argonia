"""Tests for the NPC_ reader.

The decoding tests build plugin bytes in memory so they run on CI, which has no
Skyrim.esm. The assertions that matter most -- that the parse reproduces values
a human transcribed by hand -- need the real vault and are skipped without it.
"""

from __future__ import annotations

import json
import struct
import zlib
from pathlib import Path

import pytest

from pipeline import npc_records as nr

RACES = Path(__file__).resolve().parent / "config" / "races"
HAVE_VAULT = (nr.DATA / "Skyrim.esm").exists()

#: formId -> body weight, as transcribed by hand into config/races/*.json.
KNOWN_WEIGHTS = {
    "00013284": 30,  # Gulum-Ei
    "0001c3ab": 40,  # Nazir
    "00019fe8": 65,  # Golldir
    "0001338c": 15,  # Brother Verulus
    "000661ad": 55,  # Adeber
    "00013298": 50,  # Mazaka
    "00013353": 20,  # Dravin Llanith
}


def _sub(sig: bytes, payload: bytes) -> bytes:
    return sig + struct.pack("<H", len(payload)) + payload


def _record(sig: bytes, data: bytes, form_id: int = 1, flags: int = 0) -> bytes:
    return sig + struct.pack("<IIIII", len(data), flags, form_id, 0, 0) + data


def _grup(children: bytes) -> bytes:
    return b"GRUP" + struct.pack("<IIIII", len(children) + 24, 0, 0, 0, 0) + children


# -- subrecord walking ------------------------------------------------------


def test_subrecord_walk_reads_signature_and_payload():
    data = _sub(b"EDID", b"Test\x00") + _sub(b"NAM7", struct.pack("<f", 42.0))
    assert list(nr.iter_subrecords(data)) == [
        (b"EDID", b"Test\x00"),
        (b"NAM7", struct.pack("<f", 42.0)),
    ]


def test_xxxx_overrides_next_subrecord_size():
    big = b"x" * 70000
    data = (
        _sub(b"XXXX", struct.pack("<I", len(big)))
        + b"VMAD"
        + struct.pack("<H", 0)
        + big
        + _sub(b"EDID", b"After\x00")
    )
    got = list(nr.iter_subrecords(data))
    assert got[0] == (b"VMAD", big)
    assert got[1] == (b"EDID", b"After\x00")


def test_compressed_record_data_is_inflated():
    inner = _sub(b"EDID", b"Packed\x00")
    packed = struct.pack("<I", len(inner)) + zlib.compress(inner)
    assert nr.record_data(packed, nr._COMPRESSED) == inner
    assert nr.record_data(inner, 0) == inner


def test_records_are_found_inside_nested_grups():
    npc = _record(b"NPC_", _sub(b"EDID", b"Lizard\x00"), form_id=0x99)
    buf = _grup(_grup(npc))
    got = [(s, f) for s, f, _b, _fl in nr.iter_records(buf)]
    assert got == [(b"NPC_", 0x99)]


# -- field decoding ---------------------------------------------------------


def test_acbs_female_bit():
    assert nr.acbs_is_female(struct.pack("<I", 0x00000001) + b"\x00" * 20)
    assert not nr.acbs_is_female(struct.pack("<I", 0x00000010) + b"\x00" * 20)
    assert not nr.acbs_is_female(b"")


def test_cnam_normalises_to_the_recorded_argonian_hair_tint():
    expected = json.loads((RACES / "argonian.json").read_text())["hairTint"]
    # File-order bytes R=36, G=23, B=23 -> little-endian 0x00171724.
    assert nr.cnam_to_tint(0x00171724) == pytest.approx(expected)


def test_npc_subrecords_are_collected():
    data = (
        _sub(b"EDID", b"TestNpc\x00")
        + _sub(b"ACBS", struct.pack("<I", 1) + b"\x00" * 20)
        + _sub(b"RNAM", struct.pack("<I", 0x13745))
        + _sub(b"QNAM", struct.pack("<fff", 0.5, 0.25, 0.125))
        + _sub(b"HCLF", struct.pack("<I", 0xAAA))
        + _sub(b"NAM7", struct.pack("<f", 35.0))
        + _sub(b"PNAM", struct.pack("<I", 1))
        + _sub(b"PNAM", struct.pack("<I", 2))
    )
    npc = nr._parse_npc(data)
    assert npc["editorId"] == "TestNpc"
    assert npc["isFemale"]
    assert npc["race"] == 0x13745
    assert npc["skinTint"] == [0.5, 0.25, 0.125]
    assert npc["bodyWeight"] == 35.0
    assert npc["headParts"] == [1, 2]


# -- vault-dependent --------------------------------------------------------


@pytest.mark.skipif(not HAVE_VAULT, reason="Skyrim.esm not present")
def test_known_npcs_reproduce_their_transcribed_weights():
    npcs = nr.load_npcs()
    for form_id, weight in KNOWN_WEIGHTS.items():
        assert npcs[form_id].bodyWeight == pytest.approx(weight), form_id


@pytest.mark.skipif(not HAVE_VAULT, reason="Skyrim.esm not present")
def test_gulum_ei_matches_the_argonian_config():
    npc = nr.load_npcs()["00013284"]
    config = json.loads((RACES / "argonian.json").read_text())
    assert npc.editorId == config["faceGen"]["editorId"]
    assert npc.raceEditorId == "ArgonianRace"
    assert npc.skinTint == pytest.approx(config["skinTint"], abs=1e-6)
    assert npc.hairTint == pytest.approx(config["hairTint"], abs=1e-6)
    assert npc.hasFaceGen
