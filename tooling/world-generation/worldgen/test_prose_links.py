"""Phase 11 B9b named-prose → typed-reference contract."""

import copy
import json

from . import prose_links as pl


def test_named_closed_entity_without_typed_link_is_hard():
    entity = pl.Entity("place", "place.test.nine-trunks", "Nine-Trunks")
    result = pl.check_record(
        {"id": "place.test.camp"},
        [("why.founding", "The boats pole south from Nine-Trunks.")],
        [entity],
    )
    assert len(result.hard) == 1
    assert "placeRef" in result.hard[0].message


def test_native_typed_link_satisfies_the_mention():
    entity = pl.Entity("faction", "faction.an-xileel", "The An-Xileel")
    result = pl.check_record(
        {"id": "place.test.office", "ownerFaction": "faction.an-xileel"},
        [("why.founding", "The An-Xileel keep the office.")],
        [entity],
    )
    assert result.findings == []


def test_quest_title_is_ambiguous_but_explicit_id_is_checked():
    entity = pl.Entity("quest", "quest.local.xx01", "The Roll")
    title = pl.check_record({"id": "place.test.a"}, [("why.founding", "The Roll is kept here.")], [entity])
    assert title.findings == []
    explicit = pl.Entity("quest", entity.id, entity.id)
    marked = pl.check_record({"id": "place.test.a"}, [("notes", "For quest.local.xx01.")], [explicit])
    assert len(marked.hard) == 1


def test_unknown_explicit_ref_is_a_reverse_contradiction():
    result = pl.check_record(
        {"id": "place.test.a", "placeRef": "place.test.missing"}, [],
        [pl.Entity("place", "place.test.real", "Real Place")],
    )
    assert len(result.hard) == 1
    assert "does not resolve" in result.hard[0].message


def test_item_names_warn_until_phase13_register_closes():
    result = pl.check_record(
        {"id": "place.test.a"}, [("vibe.materials", "A Depth stick hangs by the door.")],
        [pl.Entity("item", "item.depth-stick", "Depth stick")],
    )
    assert result.hard == []
    assert len(result.warnings) == 1


def test_matcher_keeps_longest_boundary_case_and_per_field_semantics():
    entities = [
        pl.Entity("place", "place.test.nine", "Nine"),
        pl.Entity("place", "place.test.nine-trunks", "Nine-Trunks"),
    ]
    result = pl.check_record(
        {"id": "place.test.camp"},
        [
            ("why.a", "Nine-Trunks and Nine-Trunks are named here."),
            ("why.b", "Nine-Trunks is named again; nine-trunks and xNine-Trunks are not."),
        ],
        entities,
    )
    assert result.mentions == {"place": 2}
    assert [(finding.field, finding.entity_id) for finding in result.hard] == [
        ("why.a", "place.test.nine-trunks"),
        ("why.b", "place.test.nine-trunks"),
    ]


def test_prose_ref_is_bound_to_one_exact_source_field():
    entity = pl.Entity("place", "place.test.nine-trunks", "Nine-Trunks")
    result = pl.check_record(
        {
            "id": "place.test.camp",
            "proseRefs": [{
                "sourcePath": "why.a",
                "placeRef": entity.id,
            }],
        },
        [("why.a", "Nine-Trunks sends boats."),
         ("why.b", "Nine-Trunks receives them.")],
        [entity],
    )
    assert [(finding.rule, finding.field) for finding in result.hard] == [
        ("missing-ref", "why.b")]


def test_prose_ref_rejects_stale_path_and_a_name_missing_from_its_field():
    entity = pl.Entity("place", "place.test.nine-trunks", "Nine-Trunks")
    stale = pl.check_record(
        {"id": "place.test.camp", "proseRefs": [{
            "sourcePath": "why.old", "placeRef": entity.id,
        }]},
        [("why.current", "Nine-Trunks sends boats.")],
        [entity],
    )
    assert any("does not resolve to current prose" in finding.message for finding in stale.hard)
    wrong_field = pl.check_record(
        {"id": "place.test.camp", "proseRefs": [{
            "sourcePath": "why.a", "placeRef": entity.id,
        }]},
        [("why.a", "No named destination."), ("why.b", "Nine-Trunks sends boats.")],
        [entity],
    )
    assert any("does not name" in finding.message for finding in wrong_field.hard)
    assert any(finding.field == "why.b" and finding.rule == "missing-ref"
               for finding in wrong_field.hard)


def test_prose_ref_requires_one_resolving_typed_key_and_no_duplicate():
    place = pl.Entity("place", "place.test.nine-trunks", "Nine-Trunks")
    faction = pl.Entity("faction", "faction.test", "The Test Faction")
    prose = [("why.a", "Nine-Trunks receives The Test Faction.")]
    malformed = pl.check_record(
        {"id": "place.test.camp", "proseRefs": [
            {"sourcePath": "why.a", "placeRef": place.id, "factionRef": faction.id},
            {"sourcePath": "why.a", "placeRef": "place.test.missing"},
        ]}, prose, [place, faction],
    )
    assert sum(finding.rule == "invalid-prose-ref" for finding in malformed.hard) == 2
    duplicate = pl.check_record(
        {"id": "place.test.camp", "proseRefs": [
            {"sourcePath": "why.a", "placeRef": place.id},
            {"sourcePath": "why.a", "placeRef": place.id},
        ]}, prose, [place, faction],
    )
    assert any("duplicates" in finding.message for finding in duplicate.hard)


def test_item_warning_can_be_retired_without_claiming_the_item_is_present():
    item = pl.Entity("item", "item.mnemic-egg", "Mnemic Egg")
    record = {
        "id": "place.test.bereaved",
        "why": {"founding": "Its Mnemic Egg was never recovered."},
        "proseRefs": [{
            "sourcePath": "why.founding",
            "itemRef": item.id,
        }],
    }
    result = pl.check_record(record, [("why.founding", record["why"]["founding"])], [item])
    assert result.findings == []
    assert "contents" not in record


def test_migration_is_deterministic_idempotent_and_reference_only():
    entities = [
        pl.Entity("place", "place.test.nine-trunks", "Nine-Trunks"),
        pl.Entity("faction", "faction.test", "The Test Faction"),
    ]
    record = {
        "id": "place.test.camp",
        "why": {
            "founding": "The Test Faction built it below Nine-Trunks.",
            "pressures": "Nine-Trunks may close the landing.",
        },
    }
    prose = [("why.founding", record["why"]["founding"]),
             ("why.pressures", record["why"]["pressures"])]
    original = copy.deepcopy(record)
    migrated, additions = pl.migrate_record_prose_refs(record, prose, entities)
    repeated, repeated_additions = pl.migrate_record_prose_refs(migrated, prose, entities)
    assert record == original
    assert additions == 3
    assert repeated_additions == 0
    assert repeated == migrated
    assert migrated["proseRefs"] == [
        {"sourcePath": "why.founding", "factionRef": "faction.test"},
        {"sourcePath": "why.founding", "placeRef": "place.test.nine-trunks"},
        {"sourcePath": "why.pressures", "placeRef": "place.test.nine-trunks"},
    ]
    assert not (set(migrated) & {"relations", "services", "factionPresence", "contents"})
    assert pl.check_record(migrated, prose, entities).findings == []


def test_live_debt_is_visible_and_no_new_hard_row_appears():
    result = pl.check_all()
    baseline = pl.load_debt()
    assert result.hard, "B9b debt was retired: remove the manifest and make this a zero-hard gate"
    assert "place.dunmer-north.crystalgate|why.siteAdvantages|route|route.road.thorn-tear-road" in baseline
    assert pl.new_hard_debt(result) == []
    document = json.loads(pl.DEBT_MANIFEST.read_text(encoding="utf-8"))
    assert document["counts"] == {"faction": 51, "place": 198, "route": 46, "service": 10}
