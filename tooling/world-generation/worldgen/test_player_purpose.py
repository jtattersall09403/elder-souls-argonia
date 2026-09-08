"""Tests for the enterable-purpose rule (owner ruling 2026-09-07)."""

from __future__ import annotations

import json
from pathlib import Path

from . import player_purpose as pp

BLUEPRINT_DIR = Path(__file__).resolve().parents[3] / "world" / "sources" / "blueprints"


def _parcel(pid, kind="dwelling", purposes=None):
    p = {"id": pid, "interior": {"kind": kind}}
    if purposes is not None:
        p["playerPurpose"] = purposes
    return p


def _bp(parcels):
    return {"id": "place.test.x", "parcels": parcels}


def test_vocabulary_is_closed_and_tiers_agree():
    assert set(t for t, _ in pp.PURPOSE_KINDS.values()) == set(pp.TIERS)
    for kind, (tier, need) in pp.PURPOSE_KINDS.items():
        assert tier in pp.TIER_RANK, kind
        assert need and need[0].islower(), kind


def test_dressing_is_out_of_scope():
    bp = _bp([{"id": "parcel.test.arch", "interior": {"kind": "none"}},
              {"id": "parcel.test.stub"}])
    assert pp.validate_player_purpose(bp) == []


def test_missing_purpose_on_an_interior_fails():
    errs = pp.validate_player_purpose(_bp([_parcel("parcel.test.a")]))
    assert len(errs) == 1 and "no playerPurpose" in errs[0]


def test_flavour_only_interior_fails():
    errs = pp.validate_player_purpose(_bp([_parcel("parcel.test.a", purposes=[
        {"kind": "rumour", "tier": "minor", "note": "the household talks about the weather"}])]))
    assert any("flavour-only" in e for e in errs)


def test_medium_purpose_passes_and_minor_may_ride_along():
    errs = pp.validate_player_purpose(_bp([_parcel("parcel.test.a", purposes=[
        {"kind": "fence", "tier": "medium", "note": "buys goods the licence house would query"},
        {"kind": "rumour", "tier": "minor", "note": "names the barge that settles the debts"}])]))
    assert errs == []


def test_unknown_kind_wrong_tier_and_thin_note_fail():
    errs = pp.validate_player_purpose(_bp([
        _parcel("parcel.test.a", purposes=[{"kind": "vibes", "tier": "major", "note": "x" * 30}]),
        _parcel("parcel.test.b", purposes=[{"kind": "bed", "tier": "major", "note": "x" * 30}]),
        _parcel("parcel.test.c", purposes=[{"kind": "bed", "tier": "medium", "note": "short"}]),
    ]))
    assert any("not in the vocabulary" in e for e in errs)
    assert any("is tier 'medium', not 'major'" in e for e in errs)
    assert any("name the concrete thing" in e for e in errs)


def test_distribution_warns_when_every_door_is_a_quest():
    parcels = [_parcel(f"parcel.test.{i}", purposes=[
        {"kind": "quest-giver", "tier": "major", "note": "gives the tariff quest at this door"}])
        for i in range(8)]
    warnings: list[str] = []
    pp.validate_player_purpose(_bp(parcels), warnings)
    assert any("major-tier" in w for w in warnings)
    assert pp.summary_line(_bp(parcels)).startswith("purposeSummary")


def test_small_places_are_not_distribution_checked():
    warnings: list[str] = []
    pp.validate_player_purpose(_bp([_parcel("parcel.test.a", purposes=[
        {"kind": "quest-stage", "tier": "major", "note": "the conduit-room scene plays inside"}])]), warnings)
    assert warnings == []


def test_authored_blueprints_satisfy_the_rule():
    for path in sorted(BLUEPRINT_DIR.glob("*.json")):
        bp = json.loads(path.read_text())["blueprint"]
        assert pp.validate_player_purpose(bp) == [], path.name
