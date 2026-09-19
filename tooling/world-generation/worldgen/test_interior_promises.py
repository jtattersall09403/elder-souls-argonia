"""The world 70 §48 interior promises: the recipe table, the schema gates and
the migration's derivations (16g)."""

from __future__ import annotations

import copy
import json

import pytest

from . import catalogue
from . import migrate_interior_promises as mig
from . import quest_promises


# --------------------------------------------------------------- the recipes

def test_every_dungeon_kind_family_has_a_realisation_recipe():
    """§48 rule 2: a family with no recipe is re-typed or sourced, never
    promised."""
    recipes = catalogue.load_interior_recipes()
    assert recipes is not None, "world/sources/catalogue/interior-recipes.json is missing"
    families = {r["interior"]["family"] for rf in catalogue.load_region_files()
                for r in rf.places
                if (r.get("interior") or {}).get("kind") in catalogue.DUNGEON_KINDS}
    missing = sorted(families - set(recipes))
    assert missing == [], f"families promised with no recipe row: {missing}"


def test_every_recipe_kit_exists_on_disk():
    """A recipe backed by a kit nobody built is a promise the world cannot
    keep. MUTATION: rename any kit in the table and this goes red."""
    recipes = catalogue.load_interior_recipes()
    missing = sorted(
        f"{family}:{kit}"
        for family, row in recipes.items()
        for kit in list(row["kits"]) + list(row.get("dressingKits") or [])
        if not catalogue.kit_exists(kit))
    assert missing == [], f"recipe rows naming kits that exist nowhere: {missing}"


def test_a_recipe_naming_an_unbuilt_kit_is_detected():
    assert not catalogue.kit_exists("kit-that-was-never-built-v1")


def test_every_recipe_row_cites_its_source():
    recipes = catalogue.load_interior_recipes()
    thin = sorted(f for f, row in recipes.items() if not (row.get("source") or "").strip())
    assert thin == [], f"recipe rows with no source: {thin}"


def test_a_family_with_no_recipe_row_fails(tmp_path, monkeypatch):
    rec = _dungeon_record()
    rec["interior"]["family"] = "root-cavern"
    monkeypatch.setattr(catalogue, "load_interior_recipes",
                        lambda *_a, **_k: {"flooded-cave": {"recipe": "x", "kits": []}})
    errors: list[str] = []
    catalogue._validate_interior_promises(rec, rec["interior"], rec["id"], errors)
    assert any("has no row in interior-recipes.json" in e for e in errors), errors


# ------------------------------------------------------------ the schema gate

def _dungeon_record(**over):
    rec = {
        "id": "place.testreg.root-hollow",
        "schemaVersion": 3,
        "dangerTier": "D3",
        "entrance": "root-mouth",
        "underwaterAccess": "none",
        "traversalModes": ["walk"],
        "hostility": {"baseline": "hostile"},
        "questHooks": {"provisions": [], "tags": []},
        "sockets": {"scene": [], "evidence": [], "station": [], "marks": []},
        "contents": {"creatures": [], "npcs": [], "loot": []},
        "interior": {
            "kind": "delve", "family": "root-cavern", "sizeBand": "S1",
            "wetFraction": 0.0, "entranceCount": 1, "exteriorShell": False,
            "programRef": None, "verticalRelationship": "below",
            "roomFunctions": ["root-throat", "gallery"], "loop": "none",
            "traversal": {"swimM": 0, "diveM": 0, "climbM": 0, "breathGated": False,
                          "current": "none", "darkFraction": 0.8},
            "combatSpaces": [{"scale": "smallGroup", "footing": "dry", "clearance": "tight"}],
            "anchorSockets": [], "light": "bioluminescent", "lock": "hard",
        },
    }
    rec.update(over)
    return rec


def _promise_errors(rec):
    errors: list[str] = []
    catalogue._validate_interior_promises(rec, rec["interior"], rec["id"], errors)
    return errors


def test_the_reference_record_is_clean():
    assert _promise_errors(_dungeon_record()) == []


@pytest.mark.parametrize("key,value,needle", [
    ("verticalRelationship", "sideways", "verticalRelationship must be"),
    ("roomFunctions", ["gallery", "tea-room"], "not in the closed list"),
    ("roomFunctions", ["gallery"], "at least `entrance` plus one"),
    ("loop", "loop-de-loop", "loop must be one of"),
    ("light", "candlelit", "light must be one of"),
    ("lock", "padlocked", "lock must be one of"),
])
def test_a_promise_outside_its_closed_list_fails(key, value, needle):
    rec = _dungeon_record()
    rec["interior"][key] = value
    assert any(needle in e for e in _promise_errors(rec)), _promise_errors(rec)


def test_a_bad_combat_space_fails():
    rec = _dungeon_record()
    rec["interior"]["combatSpaces"] = [{"scale": "skirmish", "footing": "dry", "clearance": "tight"}]
    assert any("scale must be one of" in e for e in _promise_errors(rec))


def test_a_bad_traversal_fails():
    rec = _dungeon_record()
    rec["interior"]["traversal"]["current"] = "torrential"
    assert any("current must be one of" in e for e in _promise_errors(rec))


def test_a_second_entrance_means_the_interior_loops():
    """Since the 2026-09-19 precedence a two-door interior may be a
    vertical-return or a water-loop, but it may never be `none`."""
    rec = _dungeon_record()
    rec["interior"]["entranceCount"] = 2
    assert any("means the interior loops" in e for e in _promise_errors(rec))
    rec["interior"]["loop"] = "water-loop"
    assert _promise_errors(rec) == []


def test_the_loop_precedence_puts_the_ground_first():
    """A shaft is a vertical return even with two doors; standing water is a
    water loop before a second door counts."""
    assert mig.loop(_dungeon_record(entrance="well-shaft")) == "vertical-return"
    wet = _dungeon_record()
    wet["interior"]["wetFraction"] = 0.6
    wet["interior"]["entranceCount"] = 2
    assert mig.loop(wet) == "water-loop"
    dry = _dungeon_record()
    dry["interior"]["entranceCount"] = 2
    assert mig.loop(dry) == "second-entrance"


def test_a_second_entrance_always_owes_an_escape_pin():
    rec = _dungeon_record(entrance="well-shaft")
    rec["interior"]["entranceCount"] = 2
    rooms = mig.room_functions(rec)
    kinds = {s["kind"] for s in mig.anchor_sockets(rec, rooms, mig.loop(rec))}
    assert mig.loop(rec) == "vertical-return" and "escape" in kinds


def test_a_socket_provision_not_on_the_record_fails():
    rec = _dungeon_record()
    rec["interior"]["anchorSockets"] = [
        {"id": "socket.root-hollow.cache", "kind": "cache", "whereInInterior": "hidden",
         "provision": "quest.provision.invented-here"}]
    assert any("is not on the record's" in e for e in _promise_errors(rec))


def test_a_socket_provision_on_the_record_passes():
    rec = _dungeon_record()
    rec["questHooks"]["provisions"] = ["quest.provision.lq01-anchor"]
    rec["interior"]["anchorSockets"] = [
        {"id": "socket.root-hollow.cache", "kind": "cache", "whereInInterior": "hidden",
         "provision": "quest.provision.lq01-anchor"}]
    assert _promise_errors(rec) == []


def test_a_boss_room_with_no_boss_socket_fails():
    rec = _dungeon_record()
    rec["interior"]["roomFunctions"] = ["root-throat", "gallery", "boss"]
    assert any("boss room with no boss socket" in e for e in _promise_errors(rec))


def test_a_contents_slot_without_where_in_interior_fails(tmp_path):
    from .test_catalogue import _errs, _record
    rec = _record(
        interior={"kind": "delve", "family": "root-cavern", "sizeBand": "S1",
                  "wetFraction": 0.0, "entranceCount": 1, "exteriorShell": False,
                  "verticalRelationship": "below",
                  "roomFunctions": ["root-throat", "gallery"], "loop": "none",
                  "traversal": {"swimM": 0, "diveM": 0, "climbM": 0, "breathGated": False,
                                "current": "none", "darkFraction": 0.8},
                  "combatSpaces": [{"scale": "duel", "footing": "dry", "clearance": "tight"}],
                  "anchorSockets": [], "light": "dark", "lock": "simple"},
        entrance="root-mouth",
        contents={"creatures": [], "loot": [],
                  "npcs": [{"slotId": "n1", "role": "rank-and-file", "registerRef": None,
                            "count": "few"}]})
    errs = _errs(tmp_path, [rec])
    assert any("needs whereInInterior" in e for e in errs), errs


def test_a_where_in_interior_outside_the_vocabulary_fails(tmp_path):
    from .test_catalogue import _errs, _record
    rec = _record()
    rec["contents"]["npcs"][0]["whereInInterior"] = "upstairs-left"
    errs = _errs(tmp_path, [rec])
    assert any("whereInInterior must be one of" in e for e in errs), errs


# ----------------------------------------------------- the migration's rules

def test_the_entrance_picks_the_first_room():
    for entrance, first in mig.ENTRANCE_FIRST_ROOM.items():
        rec = _dungeon_record(entrance=entrance)
        assert mig.room_functions(rec)[0] == first


def test_an_underwater_entry_is_breath_gated():
    rec = _dungeon_record(entrance="underwater-entry", underwaterAccess="deep-dive")
    tv = mig.traversal(rec)
    assert tv["diveM"] == 10 and tv["breathGated"] is True


def test_a_surface_swim_is_not_breath_gated():
    rec = _dungeon_record(entrance="underwater-entry", underwaterAccess="surface-swim")
    assert mig.traversal(rec)["breathGated"] is False


def test_a_rapid_reach_makes_the_current_strong():
    rec = _dungeon_record(plotFacts={"water": {"kind": "sloped-rapid"}})
    assert mig.current(rec) == "strong"
    rec = _dungeon_record(plotFacts={"water": {"kind": "tidal-flat"}})
    assert mig.current(rec) == "mild"
    assert mig.current(_dungeon_record()) == "none"


def test_a_tier_zero_quest_seals_the_lock():
    rec = _dungeon_record(questHooks={"provisions": [], "tags": [],
                                      "tierOwnership": "MQ23 · tier-0"})
    assert mig.lock(rec) == "quest-sealed"


def test_the_size_band_caps_the_reveal():
    rec = _dungeon_record()
    rec["interior"]["sizeBand"] = "S0"
    rec["interior"]["family"] = "imperial-fort"
    assert len(mig.room_functions(rec)) <= 2


def test_the_migration_is_idempotent():
    rec = _dungeon_record()
    before = copy.deepcopy(rec)
    assert mig.fill_record(rec) == []
    assert rec == before


def test_the_migration_never_overwrites_an_authored_value():
    rec = _dungeon_record()
    rec["interior"]["light"] = "daylit"
    mig.fill_record(rec)
    assert rec["interior"]["light"] == "daylit"


def test_the_derivation_is_deterministic():
    a, b = _dungeon_record(), _dungeon_record()
    del a["interior"]["light"], b["interior"]["light"]
    mig.fill_record(a)
    mig.fill_record(b)
    assert a["interior"]["light"] == b["interior"]["light"]


def test_every_live_dungeon_record_carries_the_promises():
    missing = [r["id"] for rf in catalogue.load_region_files() for r in rf.places
               if (r.get("interior") or {}).get("kind") in catalogue.DUNGEON_KINDS
               and any(k not in r["interior"] for k in mig.PROMISE_KEYS)]
    assert missing == [], f"{len(missing)} dungeon-kind records without the §48 promises: {missing[:5]}"


def test_every_record_with_an_interior_says_where_it_sits():
    missing = [r["id"] for rf in catalogue.load_region_files() for r in rf.places
               if (r.get("interior") or {}).get("kind") not in (None, "none")
               and "verticalRelationship" not in r["interior"]]
    assert missing == [], f"{len(missing)} interiors with no verticalRelationship: {missing[:5]}"


# ------------------------------------------------------- quest-derived pins

def test_quest_promises_are_idempotent():
    records = [r for rf in catalogue.load_region_files() for r in rf.places]
    anchored = quest_promises.anchored_place_ids()
    added = [k for r in records if r["id"] in anchored for k in quest_promises.fill_record(r)]
    assert added == [], f"quest_promises has not been applied: {added[:5]}"


def test_a_boss_tag_asks_for_a_boss_socket_and_a_boss_room():
    rec = _dungeon_record(questHooks={"provisions": ["quest.provision.lq01-anchor"],
                                      "tags": ["BOSS"]})
    assert quest_promises.fill_record(rec) == ["boss"]
    assert "boss" in rec["interior"]["roomFunctions"]
    socket = rec["interior"]["anchorSockets"][0]
    assert socket["kind"] == "boss" and socket["provision"] == "quest.provision.lq01-anchor"


def test_a_record_with_no_provision_gets_no_quest_socket():
    rec = _dungeon_record(questHooks={"provisions": [], "tags": ["BOSS"]})
    assert quest_promises.fill_record(rec) == []


def test_every_socket_provision_is_one_the_record_carries():
    bad = []
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            provisions = set((rec.get("questHooks") or {}).get("provisions") or [])
            for socket in (rec.get("interior") or {}).get("anchorSockets") or []:
                if socket.get("provision") and socket["provision"] not in provisions:
                    bad.append(f"{rec['id']}:{socket['id']}")
    assert bad == [], bad
