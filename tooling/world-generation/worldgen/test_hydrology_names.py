"""The naming record's rules, each proved by making it fail on purpose."""

from __future__ import annotations

import copy
import json

import pytest

from . import hydrology_names as hn


@pytest.fixture(scope="module")
def doc():
    return hn.load()


@pytest.fixture(scope="module")
def graph():
    return json.loads(hn.GRAPH.read_text())


@pytest.fixture(scope="module")
def sites():
    return json.loads(hn.SITES.read_text())


def test_record_is_clean(doc, graph, sites):
    assert hn.check(doc, graph, sites) == []


def test_every_attested_join_is_present(doc):
    have = {e["entityId"]: e["name"] for e in doc["names"]}
    for eid, name in hn.ATTESTED_JOINS.items():
        assert have[eid] == name


def test_a_duplicate_name_fails(doc, graph, sites):
    d = copy.deepcopy(doc)
    d["names"][1]["name"] = d["names"][0]["name"]
    assert any("duplicate name" in e for e in hn.check(d, graph, sites))


def test_one_canon_river_may_carry_one_name_on_several_ids(doc, graph, sites):
    panther = [e for e in doc["names"] if e["name"] == "the Panther River"]
    assert len(panther) == 3 and {e["chain"] for e in panther} == {"panther"}
    assert hn.check(doc, graph, sites) == []


def test_imagery_overuse_fails(doc, graph, sites):
    d = copy.deepcopy(doc)
    n = 0
    for e in d["names"]:
        if e["culture"] == "hist-heartland" and e["grounding"]["kind"] == "extrapolated":
            e["name"] = f"The Bone Thing {n}"
            n += 1
            if n > hn.IMAGERY_MAX:
                break
    assert any("'bone' used" in e for e in hn.check(d, graph, sites))


def test_too_many_verb_clauses_fail(doc, graph, sites):
    """A register with a maximum share (every one but saxhleel-coast)."""
    d = copy.deepcopy(doc)
    n = 0
    for e in d["names"]:
        if e["culture"] == "hist-heartland" and e["grounding"]["kind"] == "extrapolated":
            e["name"] = "Holds-The-N" + "a" * (n + 1)
            n += 1
    assert any("at most a third" in e for e in hn.check(d, graph, sites))


def test_too_few_verb_clauses_on_the_saxhleel_coast_fail(doc, graph, sites):
    """The saxhleel-coast row of the naming register is a MINIMUM share: over
    half its names are hyphenated verb clauses."""
    d = copy.deepcopy(doc)
    n = 0
    for e in d["names"]:
        if e["culture"] == "saxhleel-coast" and e["grounding"]["kind"] == "extrapolated":
            e["name"] = f"Flat Name {n}"
            n += 1
    assert any("needs at least" in e for e in hn.check(d, graph, sites))


def test_a_name_on_an_id_the_graph_does_not_have_fails(doc, graph, sites):
    d = copy.deepcopy(doc)
    d["names"][0]["entityId"] = "river.does-not-exist"
    d["names"][0]["textKey"] = "hydrology.name.river.does-not-exist"
    assert any("not an entity in the hydrology graph" in e
               for e in hn.check(d, graph, sites))


def test_a_peak_below_the_prominence_rule_fails(doc, graph, sites):
    d = copy.deepcopy(doc)
    low = min((s for s in sites["sites"] if s["landform"] == "summit"),
              key=lambda s: s["scores"]["prominenceM"])
    assert low["scores"]["prominenceM"] < hn.PROMINENCE_MIN_M
    d["names"].append({"entityId": low["id"], "kind": "peak", "name": "Nowhere Height",
                       "aliases": [], "textKey": "hydrology.name." + low["id"],
                       "culture": "dunmer-north", "siteId": low["id"],
                       "centreM": low["worldM"],
                       "grounding": {"kind": "extrapolated", "rule": "dunmer-north",
                                     "why": "it does not qualify"}})
    d["names"].sort(key=lambda e: e["entityId"])
    errs = hn.check(d, graph, sites)
    assert any("is below the 60 m rule" in e for e in errs)


def test_an_unnamed_qualifying_entity_fails(doc, graph, sites):
    d = copy.deepcopy(doc)
    d["names"] = [e for e in d["names"] if e["entityId"] != "river.889-484"]
    errs = hn.check(d, graph, sites)
    assert any("qualifies for a name" in e for e in errs)


def test_missing_grounding_fails(doc, graph, sites):
    d = copy.deepcopy(doc)
    d["names"][0]["grounding"] = {"kind": "extrapolated", "rule": "", "why": ""}
    errs = hn.check(d, graph, sites)
    assert any("without a register rule" in e for e in errs)
    assert any("has no why" in e for e in errs)


def test_text_emission_is_byte_stable(doc):
    first = hn.emit_text(doc)
    assert first == hn.emit_text(hn.load())
    assert first.endswith("];\n") and not first.endswith("\n\n")
    assert hn.TEXT_TS.read_text() == first, (
        "packages/text-catalogue/src/generated/hydrology-names.ts is stale: "
        "run python3 -m worldgen.hydrology_names --emit-text")


def test_published_copy_matches_the_record(doc):
    assert hn.PUBLISHED.read_text() == hn.publish(doc), (
        "apps/world-studio/public/province/hydrology-names.json is stale: "
        "run python3 -m worldgen.hydrology_names --publish")
