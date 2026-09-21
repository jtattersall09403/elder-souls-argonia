"""The generated place-name and quest-title text files (standard 2/4)."""

from __future__ import annotations

import re

from . import place_text as pt
from . import catalogue, quests

TEXT_ID_SHAPE = re.compile(r"^text(\.[a-z0-9]+(-[a-z0-9]+)*){2,}$")


def test_emission_is_byte_stable():
    assert pt.emit_places() == pt.emit_places()
    assert pt.emit_quests() == pt.emit_quests()
    for out in (pt.emit_places(), pt.emit_quests()):
        assert out.endswith("];\n") and not out.endswith("\n\n")


def test_generated_files_are_current():
    assert pt.stale() == [], pt.stale()


def test_the_freshness_check_fails_on_a_stale_file(tmp_path, monkeypatch):
    planted = tmp_path / "place-names.ts"
    planted.write_text("// stale\n", encoding="utf-8")
    monkeypatch.setattr(pt, "PLACE_TS", planted)
    errs = pt.stale()
    assert len(errs) == 1 and "is stale" in errs[0]


def test_every_live_place_and_quest_has_an_entry():
    place_ids = {r["recordId"] for r in pt.place_entries()}
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            if rec.get("status") in pt.DEAD_PLACE_STATUS:
                assert rec["id"] not in place_ids
            else:
                assert rec["id"] in place_ids, rec["id"]
    quest_ids = {r["recordId"] for r in pt.quest_entries()}
    for q in quests.load_quests():
        if q.get("status") in pt.DEAD_QUEST_STATUS:
            assert q["id"] not in quest_ids
        else:
            assert q["id"] in quest_ids, q["id"]


def test_ids_are_well_shaped_and_unique():
    rows = pt.place_entries() + pt.quest_entries()
    ids = [r["id"] for r in rows]
    assert len(ids) == len(set(ids))
    for r in rows:
        assert TEXT_ID_SHAPE.match(r["id"]), r["id"]
        assert r["text"] and r["note"]


def test_rows_are_sorted_by_record_id():
    for rows in (pt.place_entries(), pt.quest_entries()):
        assert [r["recordId"] for r in rows] == sorted(r["recordId"] for r in rows)
