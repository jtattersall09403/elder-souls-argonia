"""Tests for the WEAP/ARMO reader.

The decoding tests build plugin bytes in memory so they run on CI, which has no
Skyrim.esm. The assertions that need the real vault are skipped without it.
"""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path

import pytest

from pipeline import npc_records as nr, weapon_records as wr

HAVE_VAULT = (nr.DATA / "Skyrim.esm").exists()
RECORDS = (
    Path(__file__).resolve().parents[3]
    / "packages" / "game-core" / "src" / "equipment" / "generated" / "weapon-records.json"
)


def _sub(sig: bytes, payload: bytes) -> bytes:
    return sig + struct.pack("<H", len(payload)) + payload


def _weap(editor_id: str, model: str, value: int, weight: float, damage: int,
          speed: float, reach: float, crit: int) -> bytes:
    return b"".join([
        _sub(b"EDID", editor_id.encode() + b"\x00"),
        _sub(b"MODL", model.encode() + b"\x00"),
        _sub(b"DATA", struct.pack("<IfH", value, weight, damage)),
        # animType, unk8, unk16, speed, reach, then the rest of DNAM we ignore.
        _sub(b"DNAM", struct.pack("<BbHff", 1, 0, 0, speed, reach) + b"\x00" * 84),
        _sub(b"CRDT", struct.pack("<H", crit) + b"\x00" * 22),
    ])


def test_parse_weap_reads_the_data_and_dnam_layouts():
    parsed = wr.parse_weap(
        _weap("IronSword", r"Weapons\Iron\LongSword.nif", 25, 9.0, 7, 1.0, 1.0, 3)
    )
    assert parsed["editorId"] == "IronSword"
    assert parsed["model"] == r"Weapons\Iron\LongSword.nif"
    assert (parsed["value"], parsed["weight"], parsed["damage"]) == (25, 9.0, 7)
    assert (parsed["speed"], parsed["reach"]) == (1.0, 1.0)
    assert parsed["critDamage"] == 3


def test_parse_weap_keeps_speed_and_reach_apart():
    """A greatsword is slow *and* long; swapping the two floats hides that."""
    parsed = wr.parse_weap(
        _weap("IronGreatsword", "a.nif", 50, 16.0, 15, 0.7, 1.3, 7)
    )
    assert parsed["speed"] == pytest.approx(0.7)
    assert parsed["reach"] == pytest.approx(1.3)


def test_parse_armo_reads_value_weight_and_rating():
    data = b"".join([
        _sub(b"EDID", b"ArmorIronShield\x00"),
        _sub(b"MOD2", b"Armor\\Iron\\Shield.nif\x00"),
        _sub(b"DATA", struct.pack("<If", 60, 12.0)),
        _sub(b"DNAM", struct.pack("<i", 2000)),
    ])
    parsed = wr.parse_armo(data)
    assert parsed["editorId"] == "ArmorIronShield"
    assert (parsed["value"], parsed["weight"], parsed["armourRating"]) == (60, 12.0, 20.0)


def test_model_key_normalises_case_slashes_and_the_first_person_mesh():
    assert wr._model_key(r"Weapons\Iron\LongSword.nif") == "weapons/iron/longsword.nif"
    assert wr._model_key("meshes/weapons/elven/elvendagger.nif") == (
        wr._model_key(r"Weapons\Elven\1stPersonElvenDagger.nif")
    )


def test_choose_prefers_the_plain_editor_id():
    candidates = [
        {"editorId": "EnchIronSwordFire01"},
        {"editorId": "DraugrIronSword"},
        {"editorId": "IronSword"},
        {"editorId": "FavorAmrenIronSword"},
    ]
    assert wr.choose(candidates)["editorId"] == "IronSword"


def test_choose_falls_back_when_every_candidate_is_a_variant():
    candidates = [{"editorId": "EnchThing02"}, {"editorId": "EnchThing01"}]
    assert wr.choose(candidates)["editorId"] == "EnchThing01"


@pytest.mark.skipif(not HAVE_VAULT, reason="needs the Skyrim vault")
def test_every_arsenal_item_resolves():
    arsenal = json.loads(wr.ARSENAL.read_text())
    mined = wr.mine()
    assert set(mined["items"]) == {i["id"] for i in arsenal["items"]}
    assert mined["items"]["iron-sword"]["editorId"] == "IronSword"
    assert list(mined["items"]) == sorted(mined["items"])


@pytest.mark.skipif(not RECORDS.exists(), reason="records not generated")
def test_the_generated_file_is_current_with_the_arsenal():
    arsenal = json.loads(wr.ARSENAL.read_text())
    items = json.loads(RECORDS.read_text())["items"]
    assert set(items) == {i["id"] for i in arsenal["items"]}


def _plugin_bytes(records: list[bytes]) -> bytes:
    """A minimal plugin: a TES4 header then one WEAP group of `records`."""
    def rec(sig: bytes, body: bytes) -> bytes:
        return sig + struct.pack("<IIIII", len(body), 0, 0, 0, 0) + body

    weaps = b"".join(rec(b"WEAP", b) for b in records)
    group = b"GRUP" + struct.pack("<I", len(weaps) + 24) + b"WEAP" + \
        struct.pack("<iII", 0, 0, 0) + weaps
    return rec(b"TES4", _sub(b"HEDR", struct.pack("<fiI", 1.7, 1, 0x800))) + group


def test_an_item_with_a_root_resolves_in_that_mods_own_plugin(tmp_path, monkeypatch):
    """The mod path: a `root` is searched for plugins, matched case-insensitively
    on the MODL path, and the item records which plugin it came from."""
    data = tmp_path / "vault" / "mod" / "Data"
    data.mkdir(parents=True)
    plugin = data / "NewArmoury.esp"
    plugin.write_bytes(_plugin_bytes([
        # MODL casing and slashes differ from the arsenal's `nif` field on purpose.
        _weap("IronRapier", r"Weapons\NewArmoury\Rapier\IronRapier.nif",
              25, 6.0, 5, 1.3, 1.35, 10),
    ]))
    arsenal = tmp_path / "arsenal.json"
    arsenal.write_text(json.dumps({"items": [
        {"id": "iron-rapier", "nif": "meshes/weapons/newarmoury/rapier/ironrapier.nif",
         "root": "mod/Data"},
    ]}))
    monkeypatch.setattr(wr, "ARSENAL", arsenal)
    # A stand-in for the vault's vanilla plugin, so the test needs no Skyrim.esm.
    vanilla = tmp_path / "vault" / "Skyrim.esm"
    vanilla.write_bytes(_plugin_bytes([]))
    monkeypatch.setattr(wr, "DATA", tmp_path / "vault")

    mined = wr.mine(plugins=("Skyrim.esm",), vault_root=tmp_path / "vault")
    item = mined["items"]["iron-rapier"]
    assert item["editorId"] == "IronRapier"
    assert (item["damage"], item["weight"], item["speed"], item["reach"]) == (5, 6.0, 1.3, 1.35)
    assert item["source"]["plugin"] == "NewArmoury.esp"
    assert item["source"]["sha256"] == hashlib.sha256(plugin.read_bytes()).hexdigest()


def test_plugins_under_finds_only_plugin_files(tmp_path):
    (tmp_path / "Meshes").mkdir()
    for name in ("NewArmoury.esp", "b.esm", "notes.txt"):
        (tmp_path / name).write_bytes(b"")
    assert [p.name for p in wr.plugins_under(tmp_path)] == ["NewArmoury.esp", "b.esm"]


@pytest.mark.skipif(not HAVE_VAULT, reason="needs the Skyrim vault")
def test_the_mod_sourced_items_carry_their_plugin_source():
    """Every arsenal item with a `root` is credited to the plugin it was read
    from; the vanilla ones keep the file's top-level source."""
    arsenal = json.loads(wr.ARSENAL.read_text())
    mined = wr.mine()
    for item in arsenal["items"]:
        rec = mined["items"][item["id"]]
        assert ("source" in rec) == bool(item.get("root")), item["id"]
