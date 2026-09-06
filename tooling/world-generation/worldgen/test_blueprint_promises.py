"""The promise ledger (97 E9, G22): a record's promises vs the blueprint's objects.

The owner's finding of 2026-09-05 in one test: a record that promises a trader,
a named official and a travel destination, and a blueprint that builds only the
trader, must fail with the promise named and the remedy spelled out.
"""

import pytest

from . import blueprint_promises as bpr


def _record(**over):
    rec = {
        "id": "place.testreg.three-promises",
        "name": "Three Promises",
        "classification": {"class": "settlement", "family": "village", "type": "stilt-village",
                           "magnitude": "M3"},
        "status": "active",
        "culture": "argonian",
        "entrance": "door",
        "services": ["trader", "lodging"],
        "sockets": {"scene": [], "evidence": [], "station": [], "marks": []},
        "questHooks": {"provisions": []},
        "rewardProfile": {"kinds": ["trade-access"]},
        "contents": {"creatures": [], "loot": [], "npcs": [
            {"slotId": "n1", "role": "official", "registerRef": None, "named": True}]},
        "travelStation": {"modes": ["ferry"], "destinations": ["place.testreg.far-landing"]},
    }
    rec.update(over)
    return rec


def _blueprint(**over):
    bp = {
        "id": "place.testreg.three-promises",
        "parcels": [
            {"id": "parcel.tp.trader", "use": "shop", "service": "trader"},
            {"id": "parcel.tp.hut", "use": "dwelling"},
        ],
        "doors": [{"id": "door.testreg.tp.1", "parcelId": "parcel.tp.trader",
                   "interiorClaim": {"interiorRef": "vanilla-farmhouse-int"}}],
        "occupants": [{"slotId": "o.factor", "ladderRef": "capable-d2", "cultureRole": "factor"}],
        "docks": [{"id": "dock.tp.landing"}],
        "travelServices": [],
        "questSockets": [],
        "variants": [],
        "landmarks": [],
    }
    bp.update(over)
    return bp


def _by_id(ledger):
    return {p.id: p for p in ledger}


def test_the_met_promise_names_what_realised_it():
    ledger = _by_id(bpr.build_ledger(_blueprint(), _record()))
    assert ledger["promise.service.trader"].met
    assert ledger["promise.service.trader"].realisedBy == ["parcel.tp.trader"]


def test_three_unmet_promises_are_named_with_their_remedy():
    errors, warnings, ledger = bpr.check_promises(_blueprint(), _record())
    unmet = {p.id for p in ledger if not p.met}
    assert {"promise.service.lodging", "promise.named-npc.n1",
            "promise.travel.dest.place.testreg.far-landing"} <= unmet
    text = "\n".join(errors)
    assert "promise.service.lodging" in text and 'service: "lodging"' in text
    assert "promise.named-npc.n1" in text and "worksAt" in text
    assert "place.testreg.far-landing" in text and "travelServices" in text
    assert not warnings, "M3 and above is HARD: nothing should be downgraded to a warning"


def test_below_m3_an_unmet_promise_is_a_warning_not_an_error():
    rec = _record(classification={"class": "settlement", "family": "hamlet", "type": "holding",
                                  "magnitude": "M2"}, services=["shrine"])
    errors, warnings, _ = bpr.check_promises(_blueprint(), rec)
    assert not errors and warnings


def test_a_service_you_walk_into_needs_a_door_onto_a_real_interior():
    bp = _blueprint(doors=[])
    ledger = _by_id(bpr.build_ledger(bp, _record()))
    p = ledger["promise.service.trader"]
    assert not p.met and "no door onto a linked interior" in p.remedy


def test_an_occupant_pointing_at_a_missing_parcel_fails_the_schema():
    bp = _blueprint(occupants=[{"slotId": "o.factor", "worksAt": "parcel.tp.nowhere"}])
    errs = bpr.validate_promise_fields(bp)
    assert errs and "worksAt" in errs[0]


def test_an_unknown_service_on_a_parcel_fails_the_schema():
    bp = _blueprint(parcels=[{"id": "parcel.tp.x", "use": "shop", "service": "wizard-tower"}])
    assert bpr.validate_promise_fields(bp)


def test_the_ledger_is_deterministic():
    a = bpr.build_ledger(_blueprint(), _record())
    b = bpr.build_ledger(_blueprint(), _record())
    assert [p.id for p in a] == [p.id for p in b] == sorted(p.id for p in a)


def test_the_markdown_says_met_over_total():
    rec = _record()
    md = bpr.ledger_markdown(rec["id"], rec, bpr.build_ledger(_blueprint(), rec))
    assert "promises met" in md and "Remedy if not" in md


@pytest.mark.parametrize("place", ["place.mercantile-coast.lilmoth"])
def test_the_shipped_blueprints_build_a_ledger(place):
    import json
    bp = json.loads((bpr.BLUEPRINT_DIR / f"{place}.json").read_text())["blueprint"]
    rec = bpr.load_record(place)
    ledger = bpr.build_ledger(bp, rec)
    assert ledger and all(p.remedy for p in ledger)
