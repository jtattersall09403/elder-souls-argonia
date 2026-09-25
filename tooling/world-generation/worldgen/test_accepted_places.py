"""The acceptance freeze (decision 0100 decision 6).

The live gate: no accepted, not reopened place may differ from its receipt.
The demonstration: a yard fixture accepted in a temp copy fails the gate the
moment its compile or its own patches change, and passes again when the
owner reopens it. The report-mode rule for gates added after acceptance is
tested where the exporter applies it (test_export_settlement_bundle.py
`test_a_gate_added_after_acceptance_reports_and_does_not_fail`)."""

import json
import shutil

import pytest

from . import accepted_places as ap
from . import export_settlement_bundle as ex

YARD = "place.fixture.proving-ground-b"


def test_no_accepted_place_has_changed():
    entries = ap.load()
    local = {pid for pid in ap.frozen(entries)
             if (ap.SETTLEMENTS_DIR / f"{pid}.settlement.json").exists()}
    unverifiable = sorted(set(ap.frozen(entries)) - local)
    violations = ap.check_frozen(sorted(local), entries=entries)
    assert violations == [], "\n".join(violations)
    if unverifiable:
        pytest.skip(f"accepted places with no local compile, checked at export only: "
                    f"{unverifiable}")


def test_the_receipt_is_well_formed():
    doc = json.loads(ap.ACCEPTED_PATH.read_text())
    assert doc["schemaVersion"] == ap.SCHEMA_VERSION
    ap.load()                                      # raises on a malformed entry


def _yard_compile() -> dict:
    """The yard's compiled record: the local compile, else the yard's rows of
    the committed bundle (the same record for this purpose: any value in it)."""
    path = ap.SETTLEMENTS_DIR / f"{YARD}.settlement.json"
    if path.exists():
        return json.loads(path.read_text())
    bundle = json.loads(ex.OUT.read_text())
    return {"id": YARD, "settlement": next(s for s in bundle["settlements"] if s["id"] == YARD)}


def test_the_freeze_fails_when_an_accepted_yard_changes(tmp_path):
    doc = _yard_compile()
    patches = tmp_path / "vegetation-patches.json"
    shutil.copy(ap.PATCH_FILES[0], patches)
    assert ap.own_patches(YARD, (patches,)), "the yard owns clearance patches"
    row = {"placeId": YARD, "acceptedOn": "2026-09-25", "authoredOn": "2026-09-25",
           "compiledHash": ap.compiled_hash(doc), "patchesHash": ap.patches_hash(YARD, (patches,))}
    receipt = tmp_path / "accepted-places.json"
    receipt.write_text(json.dumps({"schemaVersion": 1, "places": [row]}))
    entries = ap.load(receipt)
    check = lambda d, e=entries: ap.check_frozen(  # noqa: E731
        [YARD], entries=e, compiled_docs={YARD: d}, patch_files=(patches,))
    assert check(doc) == []

    altered = json.loads(json.dumps(doc))
    altered["frozenProbe"] = 1                     # any change to the compiled record
    assert any("compiled record changed" in v for v in check(altered))

    veg = json.loads(patches.read_text())
    own = next(p for p in veg["patches"] if ap._owns(p, YARD))
    own["why"] += " (edited)"
    patches.write_text(json.dumps(veg))
    assert any("own patches changed" in v for v in check(doc))

    reopened = {YARD: {**row, "reopened": {"on": "2026-09-26", "reason": "owner walk"}}}
    assert check(altered, reopened) == []


def test_a_reopen_needs_a_date_and_a_reason(tmp_path):
    receipt = tmp_path / "accepted-places.json"
    receipt.write_text(json.dumps({"schemaVersion": 1, "places": [{
        "placeId": YARD, "acceptedOn": "2026-09-25", "authoredOn": "2026-09-25",
        "compiledHash": "x", "patchesHash": "y", "reopened": {"on": "2026-09-26"}}]}))
    with pytest.raises(ValueError, match="reopened needs"):
        ap.load(receipt)


def test_a_gate_is_report_only_only_for_places_accepted_before_it():
    entries = {"p": {"placeId": "p", "acceptedOn": "2026-09-25"}}
    assert ap.report_only("p", "2026-09-26", entries)
    assert not ap.report_only("p", "2026-09-25", entries)
    assert not ap.report_only("q", "2026-09-26", entries)
    entries["p"]["reopened"] = {"on": "2026-09-27", "reason": "r"}
    assert not ap.report_only("p", "2026-09-26", entries)
