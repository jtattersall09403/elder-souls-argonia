"""The prior->roster rule (92 84), one test per numbered clause."""

from __future__ import annotations

import json

import pytest

from worldgen import catalogue
from worldgen import name_forms as nf
from worldgen import npc_roster as nr


def _slots(texts):
    """Authored slots as a writer mints them: {slotId, role}."""
    taken: set[str] = set()
    out = []
    for text in texts:
        sid = nr.mint_slot_id(text, taken)
        taken.add(sid)
        out.append({"slotId": sid, "role": text})
    return out


def _place(place_id, slots, **kw):
    base = {
        "id": place_id,
        "name": place_id.split(".")[-1].replace("-", " ").title(),
        "status": "active",
        "culture": "argonian",
        "ownerFaction": None,
        "contents": {"npcs": []},
        "notableNpcSlots": _slots(slots),
    }
    base.update(kw)
    return base


@pytest.fixture(scope="module")
def live():
    return nr.live_places()


@pytest.fixture(scope="module")
def generated(live):
    return nr.generate()


# 1. scope and ids -----------------------------------------------------------

def test_every_live_slot_has_exactly_one_record(live, generated):
    entries, _ = generated
    homes = [(e["home"]["placeId"], e["home"]["slotIndex"]) for e in entries
             if e["home"]["slotIndex"] is not None]
    expected = [(p["id"], i) for p in live
                for i in range(len(p.get("notableNpcSlots") or []))]
    assert sorted(homes) == sorted(expected)
    assert len(homes) == len(set(homes))


def test_id_shape_and_dedupe_within_a_place():
    place = _place("place.hist-heartland.x",
                   ["the tree-minder", "the tree-minder who left"])
    ids = nr._slot_ids(place)
    assert ids == ["npc.hist-heartland.x.tree-minder",
                   "npc.hist-heartland.x.tree-minder-2"]


def test_every_catalogue_slot_carries_an_authored_slot_id():
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            for i, slot in enumerate(rec.get("notableNpcSlots") or []):
                assert isinstance(slot, dict) and slot.get("slotId") and slot.get("role"), \
                    f"{rec['id']} notableNpcSlots[{i}]"


def test_rewording_a_role_keeps_the_person_id():
    """The id is the slot's, never the role's words (2026-09-23): ce71aee7's
    prose pass renamed two published people by rewording their posts."""
    place = _place("place.hist-heartland.x", ["the tree-minder"])
    before = nr._slot_ids(place)
    place["notableNpcSlots"][0]["role"] = "the keeper of the old grove, who counts rings"
    assert nr._slot_ids(place) == before == ["npc.hist-heartland.x.tree-minder"]


def test_a_slot_without_an_id_is_refused():
    place = _place("place.hist-heartland.x", ["the tree-minder"])
    del place["notableNpcSlots"][0]["slotId"]
    with pytest.raises(ValueError):
        nr._slot_ids(place)


def test_slug_strips_articles_and_who_clauses():
    assert nr.slot_slug("the field-holder who takes the crop and will not go in") \
        == "field-holder"
    assert len(nr.slot_slug("the dock factor who prices every foreign hull").split("-")) <= 4


def test_cut_and_deferred_records_generate_nothing():
    cut = _place("place.hist-heartland.gone", ["the keeper"], status="cut")
    deferred = _place("place.hist-heartland.later", ["the keeper"], status="deferred")
    entries, _ = nr.generate([cut, deferred])
    assert [e for e in entries if e["status"] == "generated"] == []


# 2. cast join ---------------------------------------------------------------

def test_a_cast_slot_yields_the_cast_identity(generated):
    entries, stats = generated
    by_home = {(e["home"]["placeId"], e["home"]["slotIndex"]): e for e in entries
               if e["home"]["slotIndex"] is not None}
    kaska = [e for e in entries if e["name"] == "Kaska-Meen"]
    assert len(kaska) == 1
    assert kaska[0]["status"] == "cast"
    assert kaska[0]["home"]["placeId"] == "place.hist-heartland.helstrom"
    assert kaska[0]["role"] == "the grove's senior tree-minder"
    assert len(stats["castJoins"]) == len(nr.CAST_JOIN) == 46


def test_no_cast_member_has_two_identities(generated):
    entries, _ = generated
    cast = [e for e in entries if e["status"] == "cast"]
    names = [e["name"] for e in cast]
    assert len(names) == len(set(names))
    assert {"Holds-the-Reed", "Nesh-Deeka"} <= set(names)
    ids = {e["name"]: e["id"] for e in cast}
    assert ids["Holds-the-Reed"] == "npc.holds-the-reed"
    assert ids["Nesh-Deeka"] == "npc.nesh-deeka"


def test_no_generated_name_reuses_a_cast_name(generated):
    entries, _ = generated
    for e in entries:
        if e["status"] == "generated":
            assert e["name"] not in nr.CAST_NAMES


# 3. race --------------------------------------------------------------------

def test_a_race_word_in_the_slot_forces_the_race():
    place = _place("place.hist-heartland.x", ["the Dunmer factor who buys sap"])
    entries, _ = nr.generate([place])
    assert entries[0]["race"] == "dunmer"
    assert entries[0]["nameForm"] == "foreign"


def test_culture_restricts_the_draw():
    argonian = _place("place.hist-heartland.x", ["the keeper"] * 6)
    entries, _ = nr.generate([argonian])
    assert {e["race"] for e in entries} == {"argonian"}


def test_mixed_culture_draws_from_the_zone_priors():
    mixed = _place("place.imperial-fringe.x", [f"the clerk {i}" for i in range(40)],
                   culture="mixed")
    entries, _ = nr.generate([mixed])
    races = {e["race"] for e in entries}
    assert "argonian" in races and len(races) > 1


# 4. sex ---------------------------------------------------------------------

def test_pronouns_fix_the_sex():
    assert nr.pick_sex("the widow who keeps her boat", "npc.a") == "female"
    assert nr.pick_sex("the man who will not say his name", "npc.a") == "male"


def test_sex_is_even_without_a_pronoun(generated):
    entries, _ = generated
    females = sum(1 for e in entries if e["sex"] == "female")
    assert 0.4 < females / len(entries) < 0.6


# 5. names and the caps ------------------------------------------------------

def test_pool_floors_hold():
    assert len(nf.jel_pool()) >= 60
    assert len(set(nf.JEL_FIRST) | set(nf.JEL_SECOND)) >= 25
    assert sum(len(v) for v in nf.TRANSLATED_AUTHORED.values()) >= 60
    assert len(nf.EPITHET_POOL) >= 30
    assert len(nf.imperial_pool("female")) + len(nf.imperial_pool("male")) >= 40
    assert len(nf.dunmer_pool("female")) + len(nf.dunmer_pool("male")) >= 40
    assert len(nf.KHAJIIT_POOL) >= 20
    for race in ("nord", "breton", "bosmer", "altmer", "orc", "redguard"):
        pools = nf.OTHER_POOLS[race]
        assert len(pools["female"]) + len(pools["male"]) >= 10
        assert pools["female"] and pools["male"]


def test_translated_cap_holds_per_region(generated):
    entries, _ = generated
    per_region: dict[str, list[str]] = {}
    for e in entries:
        per_region.setdefault(nr.region_of(e["home"]["placeId"]), []).append(e["nameForm"])
    for region, forms in per_region.items():
        assert forms.count("translated") * 3 <= len(forms), region


def test_a_cap_violation_is_repaired_deterministically():
    picker = nr.NamePicker(set())
    first = picker.take("translated", "argonian", "mercantile-coast",
                        "place.mercantile-coast.x", "npc.a", 30)
    # one slot in the region: the one-third cap forbids any translated name
    tight = nr.NamePicker(set())
    repaired = tight.take("translated", "argonian", "mercantile-coast",
                          "place.mercantile-coast.x", "npc.a", 1)
    assert first[1] == "translated"
    assert repaired[1] == "jel"
    assert tight.repairs == 1
    again = nr.NamePicker(set())
    assert again.take("translated", "argonian", "mercantile-coast",
                      "place.mercantile-coast.x", "npc.a", 1) == repaired


def test_names_are_unique_province_wide_and_never_a_place_name(generated):
    entries, _ = generated
    names = [e["name"] for e in entries]
    assert len(names) == len(set(names))
    place_names = {p["name"].lower() for p in nr.load_places()}
    assert not ({n.lower() for n in names} & place_names)


def test_no_imagery_word_twice_in_one_place(generated):
    entries, _ = generated
    seen: dict[str, set[str]] = {}
    for e in entries:
        if e["status"] == "cast":
            continue
        got = seen.setdefault(e["home"]["placeId"], set())
        clash = nr.imagery_of(e["name"]) & got
        assert not clash, (e["id"], clash)
        got |= nr.imagery_of(e["name"])


def test_foreign_given_names_match_the_sex(generated):
    entries, _ = generated
    for e in entries:
        if e["race"] in ("imperial", "dunmer"):
            given = e["name"].split()[0].replace("Brother", "").strip() or e["name"]
            pools = (nf.IMPERIAL_PRAENOMINA if e["race"] == "imperial"
                     else nf.DUNMER_GIVEN)
            if e["status"] == "cast":
                continue
            assert given in pools[e["sex"]], (e["id"], e["name"], e["sex"])


def test_form_follows_region_and_role():
    interior = _place("place.hist-heartland.x", ["the tree-minder"])
    city = _place("place.mercantile-coast.y", ["the dock factor"])
    assert nr.pick_form(interior, "the tree-minder", "argonian") == "jel"
    assert nr.pick_form(city, "the dock factor", "argonian") == "translated"
    assert nr.pick_form(interior, "the smuggler who lands at night", "argonian") == "epithet"
    assert nr.pick_form(interior, "the freed debtor", "argonian") == "chosen"
    assert nr.pick_form(interior, "the tree-minder", "nord") == "foreign"


# 6. faction, home, role, shape ---------------------------------------------

def test_faction_comes_from_the_matching_contents_slot():
    place = _place("place.hist-heartland.x", ["the merchant who prices sap"],
                   ownerFaction="faction.many-root-conclave",
                   contents={"npcs": [{"slotId": "n1", "role": "merchant",
                                       "faction": "faction.reed-sail-compact"}]})
    entries, _ = nr.generate([place])
    assert entries[0]["factionIds"] == ["faction.reed-sail-compact"]


def test_faction_falls_back_to_owner_then_empty():
    owned = _place("place.hist-heartland.x", ["the quiet one"],
                   ownerFaction="faction.many-root-conclave")
    bare = _place("place.hist-heartland.y", ["the quiet one"])
    assert nr.generate([owned])[0][0]["factionIds"] == ["faction.many-root-conclave"]
    assert nr.generate([bare])[0][0]["factionIds"] == []


def test_record_shape_is_the_10b_npc_record(generated):
    entries, _ = generated
    required = {"id", "name", "nameForm", "race", "sex", "factionIds", "home",
                "role", "archetype", "statblock", "hostility", "fightFleeAlarm",
                "marks", "schedules", "patrols", "dialogueTopics", "services",
                "crime", "standing", "status", "sources", "assetAvailability"}
    for e in entries:
        assert required <= set(e)
        assert set(e["home"]) == {"placeId", "slotIndex", "socketId"}
        assert e["status"] in {"generated", "cast"}
        assert e["assetAvailability"]["status"] == "vanilla"


def test_role_is_the_slots_own_words(live, generated):
    entries, _ = generated
    by_id = {p["id"]: p for p in live}
    for e in entries:
        if e["home"]["slotIndex"] is None:
            continue
        slots = by_id[e["home"]["placeId"]]["notableNpcSlots"]
        assert e["role"] == slots[e["home"]["slotIndex"]]["role"]


# determinism and the shipped file ------------------------------------------

def test_two_runs_are_byte_identical():
    a, _ = nr.generate()
    b, _ = nr.generate()
    assert json.dumps(a) == json.dumps(b)


def test_shipped_registry_matches_the_generator(generated):
    entries, _ = generated
    on_disk = json.loads(nr.REGISTRY.read_text())
    assert on_disk["schemaVersion"] == nr.SCHEMA_VERSION
    assert on_disk["domain"] == "npc"
    assert on_disk["entries"] == entries


def test_check_is_clean():
    assert nr.check() == []


# sticky identity (2026-09-20) ----------------------------------------------

def test_inserting_a_slot_never_renames_a_published_entry(tmp_path, monkeypatch):
    """The registry is the ratchet: --apply is additive (npc_roster 4b)."""
    places = [
        _place("place.dunmer-north.alpha", ["the harbour clerk", "the net-mender"]),
        _place("place.dunmer-north.beta", ["the ferryman", "the stall-holder"]),
    ]
    registry = tmp_path / "npcs.json"
    monkeypatch.setattr(nr, "REGISTRY", registry)

    first, _ = nr.generate([dict(p) for p in places])
    nr.write(first)
    before = {e["id"]: (e["name"], e["nameForm"], e["race"], e["sex"]) for e in first}

    places[0]["notableNpcSlots"].insert(0, {"slotId": "tide-caller",
                                            "role": "the tide-caller who is new here"})
    second, _ = nr.generate([dict(p) for p in places])
    after = {e["id"]: (e["name"], e["nameForm"], e["race"], e["sex"]) for e in second}

    assert set(before) <= set(after)
    for npc_id, identity in before.items():
        assert after[npc_id] == identity, npc_id
    added = sorted(set(after) - set(before))
    assert len(added) == 1
    assert len({v[0] for v in after.values()}) == len(after)


def test_a_deleted_slots_name_is_free_again(tmp_path, monkeypatch):
    """Reservation covers live ids only: a cut slot burns no name."""
    places = [_place("place.dunmer-north.alpha", ["the harbour clerk", "the net-mender"])]
    registry = tmp_path / "npcs.json"
    monkeypatch.setattr(nr, "REGISTRY", registry)

    first, _ = nr.generate([dict(p) for p in places])
    nr.write(first)

    # The slots are cut; the registry still holds their entries. Those names
    # must not be reserved, so the same place re-drawn from scratch gets the
    # identical draw it would get with no registry at all.
    places[0]["id"] = "place.dunmer-north.beta"
    places[0]["notableNpcSlots"] = _slots(["the harbour clerk", "the net-mender"])
    with_stale_registry, _ = nr.generate([dict(p) for p in places])
    monkeypatch.setattr(nr, "REGISTRY", tmp_path / "empty.json")
    virgin, _ = nr.generate([dict(p) for p in places])
    assert [e["name"] for e in with_stale_registry] == [e["name"] for e in virgin]
