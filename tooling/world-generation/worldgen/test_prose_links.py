"""Phase 11 B9b named-prose → typed-reference contract."""

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


def test_live_debt_is_visible_and_no_new_hard_row_appears():
    result = pl.check_all()
    baseline = pl.load_debt()
    assert result.hard, "B9b debt was retired: remove the manifest and make this a zero-hard gate"
    assert "place.dunmer-north.crystalgate|why.siteAdvantages|route|route.road.thorn-tear-road" in baseline
    assert pl.new_hard_debt(result) == []
    document = json.loads(pl.DEBT_MANIFEST.read_text(encoding="utf-8"))
    assert document["counts"] == {"faction": 51, "place": 198, "route": 46, "service": 10}
