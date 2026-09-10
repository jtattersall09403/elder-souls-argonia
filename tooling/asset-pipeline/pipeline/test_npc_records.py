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

from pipeline import build_races, npc_records as nr

APPEARANCES = Path(__file__).resolve().parent / "config" / "appearances"
HAVE_VAULT = (nr.DATA / "Skyrim.esm").exists()

#: formId -> body weight, as originally transcribed by hand for the male
#: appearances. The plugin is now the source; these stay as the fixed point that
#: proves the reader still agrees with what shipped.
KNOWN_WEIGHTS = {
    "00013284": 30,  # Gulum-Ei
    "0001c3ab": 40,  # Nazir
    "00019fe8": 65,  # Golldir
    "0001338c": 15,  # Brother Verulus
    "000661ad": 55,  # Adeber
    "00013298": 50,  # Mazaka
    "00013353": 20,  # Dravin Llanith
}

#: The ten male heightScale values that shipped in the roster while they were
#: hand-transcribed. Now derived from the RACE record; kept here as the fixed
#: point that proves the derivation reproduces what players already have.
SHIPPED_MALE_HEIGHTS = {
    "nord": 1.03, "imperial": 1.0, "breton": 1.0, "redguard": 1.005,
    "altmer": 1.08, "bosmer": 0.98, "dunmer": 1.0, "orsimer": 1.045,
    "khajiit": 1.0, "argonian": 1.01,
}

#: our race id -> the Skyrim RACE its heightScale comes from.
CONFIG_RACES = {
    "nord": "NordRace",
    "imperial": "ImperialRace",
    "breton": "BretonRace",
    "redguard": "RedguardRace",
    "altmer": "HighElfRace",
    "bosmer": "WoodElfRace",
    "dunmer": "DarkElfRace",
    "orsimer": "OrcRace",
    "khajiit": "KhajiitRace",
    "argonian": "ArgonianRace",
}


def _npc(name: str, skin, hair, weight, facegen=True, parts=("HairX",)) -> nr.NpcRecord:
    return nr.NpcRecord(
        formId="00000001",
        editorId=name,
        isFemale=True,
        raceEditorId="NordRace",
        skinTint=skin,
        hairTint=hair,
        bodyWeight=weight,
        headParts=parts,
        hasFaceGen=facegen,
    )


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
    expected = json.loads((APPEARANCES / "argonian-male.json").read_text())["hairTint"]
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


def test_race_data_yields_both_sexes_heights():
    data = _sub(b"EDID", b"NordRace\x00") + _sub(
        b"DATA", b"\x00" * nr._RACE_SCALES + struct.pack("<ffff", 1.03, 1.0, 1.0, 0.9) + b"\x00" * 96
    )
    race = nr._parse_race(0x13746, data)
    assert (race.editorId, race.formId) == ("NordRace", "00013746")
    assert (race.maleHeight, race.femaleHeight) == pytest.approx((1.03, 1.0))
    assert (race.maleWeight, race.femaleWeight) == pytest.approx((1.0, 0.9))


# -- donor selection --------------------------------------------------------


def test_donor_candidate_requires_every_appearance_field():
    good = _npc("Good", (0.5, 0.5, 0.5), (0.2, 0.2, 0.2), 40.0)
    assert nr.is_donor_candidate(good)
    from dataclasses import replace

    assert not nr.is_donor_candidate(replace(good, hasFaceGen=False))
    assert not nr.is_donor_candidate(replace(good, skinTint=None))
    assert not nr.is_donor_candidate(replace(good, hairTint=None))
    assert not nr.is_donor_candidate(replace(good, bodyWeight=None))
    assert not nr.is_donor_candidate(replace(good, headParts=()))


def test_most_distinct_drops_the_near_duplicate():
    pale = _npc("Pale", (0.9, 0.9, 0.9), (0.9, 0.9, 0.9), 100.0)
    twin = _npc("Twin", (0.9, 0.9, 0.9), (0.9, 0.9, 0.9), 99.0)
    dark = _npc("Dark", (0.1, 0.1, 0.1), (0.1, 0.1, 0.1), 0.0)
    picked = {n.editorId for n in nr.most_distinct([pale, twin, dark], 2)}
    assert picked == {"Pale", "Dark"}
    assert len(nr.most_distinct([pale, twin, dark], 9)) == 3


def test_hair_and_brows_ignores_eyes_and_scars():
    npc = _npc(
        "N", (0.5,) * 3, (0.2,) * 3, 40.0,
        parts=("MarksFemaleArgonianScar04", "FemaleEyesArgonianOlive", "HairArgonianFemale04"),
    )
    assert nr._hair_and_brows(npc) == "HairArgonianFemale04"


# -- vault-dependent --------------------------------------------------------


@pytest.mark.skipif(not HAVE_VAULT, reason="Skyrim.esm not present")
def test_known_npcs_reproduce_their_transcribed_weights():
    npcs = nr.load_npcs()
    for form_id, weight in KNOWN_WEIGHTS.items():
        assert npcs[form_id].bodyWeight == pytest.approx(weight), form_id


@pytest.mark.skipif(not HAVE_VAULT, reason="Skyrim.esm not present")
def test_male_heights_reproduce_every_shipped_height_scale():
    """The whole point of the RACE parse: the ten values that shipped in the
    roster before heightScale was derived must fall out of the plugin, or the
    offset is wrong."""
    heights = build_races.height_scales()
    for race, expected in SHIPPED_MALE_HEIGHTS.items():
        assert heights[race]["male"] == pytest.approx(expected, abs=1e-6), race


@pytest.mark.skipif(not HAVE_VAULT, reason="Skyrim.esm not present")
def test_female_heights_are_plausible_body_scales():
    """Female height has no shipped counterpart to check against, so pin the
    races where it *differs* from the male value -- if the offset were wrong or
    aliased onto the male field these would collapse to equality."""
    heights = build_races.height_scales()
    assert heights["breton"]["female"] == pytest.approx(0.95, abs=1e-6)
    assert heights["khajiit"]["female"] == pytest.approx(0.95, abs=1e-6)
    # Bosmer women are *taller* than Bosmer men in Skyrim's own record. This is
    # not a transcription slip; it is what the plugin says.
    assert heights["bosmer"]["male"] == pytest.approx(0.98, abs=1e-6)
    assert heights["bosmer"]["female"] == pytest.approx(1.0, abs=1e-6)
    for race in SHIPPED_MALE_HEIGHTS:
        assert 0.9 <= heights[race]["female"] <= 1.1, race


@pytest.mark.skipif(not HAVE_VAULT, reason="Skyrim.esm not present")
def test_every_appearance_is_read_from_the_plugin_not_transcribed():
    """Standard 12 in miniature: the tints and weight an appearance ships have
    to be the donor NPC's own, for all forty configs (twenty playable, twenty
    sheet alternates). A drift here is a character quietly recoloured."""
    npcs = nr.load_npcs()
    configs = sorted(APPEARANCES.glob("*.json"))
    assert len(configs) == 40
    for path in configs:
        config = json.loads(path.read_text())
        npc = npcs[config["faceGen"]["formId"].lower()]
        assert npc.editorId == config["faceGen"]["editorId"], path.name
        assert nr.is_donor_candidate(npc), path.name
        assert npc.isFemale == (config["sex"] == "female"), path.name
        assert npc.raceEditorId == CONFIG_RACES[config["race"]], path.name
        assert npc.skinTint == pytest.approx(config["skinTint"], abs=1e-9), path.name
        assert npc.hairTint == pytest.approx(config["hairTint"], abs=1e-9), path.name
        assert npc.bodyWeight == pytest.approx(config["bodyWeight"]), path.name


@pytest.mark.skipif(not HAVE_VAULT, reason="Skyrim.esm not present")
def test_gulum_ei_matches_the_argonian_config():
    npc = nr.load_npcs()["00013284"]
    config = json.loads((APPEARANCES / "argonian-male.json").read_text())
    assert npc.editorId == config["faceGen"]["editorId"]
    assert npc.raceEditorId == "ArgonianRace"
    assert npc.skinTint == pytest.approx(config["skinTint"], abs=1e-6)
    assert npc.hairTint == pytest.approx(config["hairTint"], abs=1e-6)
    assert npc.hasFaceGen
