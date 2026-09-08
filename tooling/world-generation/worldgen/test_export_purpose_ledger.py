"""The committed purpose ledger is what the blueprints say (owner review
2026-09-08). A stale ledger is worse than none: Phase 12/13 would build against
promises the blueprints no longer make."""

from __future__ import annotations

import json

from . import export_purpose_ledger as epl
from .player_purpose import PURPOSE_KINDS, PURPOSE_PHASE


def test_every_purpose_kind_names_a_delivering_phase():
    assert set(PURPOSE_PHASE) == set(PURPOSE_KINDS)
    assert set(PURPOSE_PHASE.values()) <= {"phase-12", "phase-13", "quests"}


def test_committed_ledger_is_byte_current_with_the_blueprints():
    assert epl.OUT_PATH.exists(), "world/sources/sites/purpose-ledger.json is missing"
    assert epl.OUT_PATH.read_text(encoding="utf-8") == epl.serialise(epl.build()), (
        "purpose-ledger.json is stale — run "
        "'python3 -m worldgen.export_purpose_ledger' from tooling/world-generation")


def test_rows_are_stable_ids_and_quest_rows_carry_their_socket():
    doc = json.loads(epl.OUT_PATH.read_text(encoding="utf-8"))
    assert doc["schemaVersion"] == epl.SCHEMA_VERSION
    ids = [r["id"] for r in doc["rows"]]
    assert ids == sorted(ids) and len(ids) == len(set(ids))
    for row in doc["rows"]:
        if row["deliveredBy"] == "quests":
            assert row["socketRef"], f"{row['id']} is a quest purpose with no socket"
