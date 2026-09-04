"""World registry framework tests (decision 0044)."""

import json

import pytest

from . import registries as R


def _doc(dirpath, name, domain, entries):
    (dirpath / name).write_text(json.dumps(
        {"schemaVersion": R.SCHEMA_VERSION, "domain": domain, "entries": entries}))


def _entry(**over):
    e = {"id": "faction.naga-kur", "name": "The Naga-Kur", "kind": "tribal-power",
         "status": "derived", "sources": ["catalogue"], "notes": "one line"}
    e.update(over)
    return e


# --------------------------------------------------------------- the live data

def test_live_registries_validate_and_cross_check():
    assert R.check() == []


def test_live_registries_cover_every_catalogue_reference():
    registries = R.load_all()
    used = R.catalogue_refs()
    for domain, refs in used.items():
        assert refs <= R.ids(domain, registries), f"{domain} registry is missing ids"


def test_factions_include_the_canonical_lines():
    fac = R.ids("faction")
    for expected in ("faction.shadowscales", "faction.nisswo", "faction.marsh-charter",
                     "faction.veiled-reed", "faction.an-xileel", "faction.unbound-root"):
        assert expected in fac


def test_quests_include_the_main_spine_and_every_line():
    q = R.ids("quest")
    assert "quest.main.mq01" in q and "quest.main.mq32" in q
    assert "quest.line.main" in q
    for line in ("shadowscales", "night-reed", "many-root", "rootworm-waykeepers"):
        assert f"quest.line.{line}" in q


def test_every_questline_names_a_registered_faction():
    registries = R.load_all()
    fac = R.ids("faction", registries)
    for e in registries["quest"]["entries"]:
        if e.get("faction"):
            assert e["faction"] in fac, f"{e['id']} names an unregistered faction"


# ------------------------------------------------------------------- validator

def test_validate_rejects_bad_id_shape(tmp_path):
    _doc(tmp_path, "factions.json", "faction", [_entry(id="Faction.Naga_Kur")])
    assert any("lower-kebab" in p for p in R.validate(R.load_all(tmp_path)))


def test_validate_rejects_wrong_domain_prefix(tmp_path):
    _doc(tmp_path, "factions.json", "faction", [_entry(id="quest.main.mq01")])
    assert any("does not start with domain" in p for p in R.validate(R.load_all(tmp_path)))


def test_validate_rejects_unknown_status(tmp_path):
    _doc(tmp_path, "factions.json", "faction", [_entry(status="probably")])
    assert any("status" in p for p in R.validate(R.load_all(tmp_path)))


def test_validate_requires_sources_on_canon_entries(tmp_path):
    _doc(tmp_path, "factions.json", "faction", [_entry(status="canon", sources=[])])
    assert any("no sources" in p for p in R.validate(R.load_all(tmp_path)))


def test_validate_rejects_duplicate_ids_across_domains(tmp_path):
    _doc(tmp_path, "factions.json", "faction", [_entry(id="shared.a.b")])
    _doc(tmp_path, "quests.json", "quest", [_entry(id="shared.a.b")])
    problems = R.validate(R.load_all(tmp_path))
    assert any("already used in" in p for p in problems)


def test_load_rejects_wrong_schema_version(tmp_path):
    (tmp_path / "factions.json").write_text(json.dumps(
        {"schemaVersion": 99, "domain": "faction", "entries": []}))
    with pytest.raises(ValueError, match="schemaVersion"):
        R.load_all(tmp_path)


# ----------------------------------------------------------------- cross-check

def test_cross_check_flags_an_unregistered_faction(tmp_path):
    _doc(tmp_path, "factions.json", "faction", [_entry()])
    place = {"hostility": {"owner": "faction.not-registered"}, "contents": {}}
    problems = R.cross_check(R.load_all(tmp_path), [place])
    assert any("faction.not-registered" in p for p in problems)


def test_cross_check_resolves_register_refs_by_bucket(tmp_path):
    _doc(tmp_path, "creatures.json", "creature", [_entry(id="creature.wamasu", kind="apex")])
    place = {"contents": {"creatures": [{"registerRef": "creature.wamasu"}],
                          "loot": [{"registerRef": "item.ghost"}]}}
    problems = R.cross_check(R.load_all(tmp_path), [place])
    assert not any("creature.wamasu" in p for p in problems)
    assert any("item.ghost" in p for p in problems)


def test_sync_adds_missing_catalogue_ids_as_placeholders(tmp_path, monkeypatch):
    _doc(tmp_path, "deeds.json", "deed", [_entry(id="deed.tolls.paid", kind="counter")])
    monkeypatch.setattr(R, "REGISTRY_DIR", tmp_path)
    monkeypatch.setattr(R, "REPO_ROOT", tmp_path.parent)
    monkeypatch.setattr(R, "catalogue_refs", lambda *a, **k: {"deed": {"deed.tolls.paid", "deed.new.thing"}})
    added = R.sync(tmp_path)
    assert added == ["deed.new.thing"]
    entries = json.loads((tmp_path / "deeds.json").read_text())["entries"]
    assert [e["id"] for e in entries] == ["deed.new.thing", "deed.tolls.paid"]
    assert entries[0]["status"] == "placeholder"
