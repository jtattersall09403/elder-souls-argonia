"""Every placed record names the water it sits by, by graph id.

`plotFacts.water` is the join from a place to the hydrology record (decision
0066): the stages below the freeze gate read the kind, level and season of the
water beside a place out of `hydrology-graph.json` through this id, and never
re-derive "river", "lake" or "marsh" from a raster of their own. This gate
checks the three things that would let that join rot:

  * the id resolves to a reach or a body in the graph, and the kind recorded
    on the place is the kind the graph gives that entity;
  * the distance in the fact is the same measurement as `distanceToWaterM`;
  * re-measuring the fact today reproduces the same entity.

`python3 -m worldgen.remeasure_plot_facts` is the fix for a red run here: it
rewrites facts and cannot move a place.
"""

from __future__ import annotations

import json

import pytest

from . import catalogue
from .compile_water import GRAPH_PATH
from .site_fields import ProvinceSurvey
from .ladder import requires_layer

pytestmark = requires_layer("water")

DEAD_STATUSES = {"cut", "deferred"}


@pytest.fixture(scope="module")
def survey():
    try:
        return ProvinceSurvey()
    except Exception as exc:  # noqa: BLE001 — no published rasters in this checkout
        pytest.skip(f"province rasters unavailable: {exc}")


@pytest.fixture(scope="module")
def graph_kinds() -> dict[str, str]:
    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    return {e["id"]: e["kind"] for e in list(graph["reaches"]) + list(graph["bodies"])}


def _positioned() -> list[dict]:
    return [rec for rf in catalogue.load_region_files() for rec in rf.places
            if rec.get("status") not in DEAD_STATUSES
            and isinstance(rec.get("positionM"), list)
            and isinstance(rec.get("plotFacts"), dict)]


def test_every_positioned_record_names_its_water_by_graph_id(graph_kinds):
    bad = []
    for rec in _positioned():
        fact = rec["plotFacts"].get("water")
        if not isinstance(fact, dict) or not fact.get("entityId"):
            bad.append((rec["id"], "no plotFacts.water.entityId"))
            continue
        kind = graph_kinds.get(fact["entityId"])
        if kind is None:
            bad.append((rec["id"], f"{fact['entityId']} is not in the graph"))
        elif kind != fact.get("kind"):
            bad.append((rec["id"], f"kind {fact.get('kind')!r} != graph {kind!r}"))
    assert not bad, (f"{len(bad)} of {len(_positioned())} positioned records: "
                     + "; ".join(f"{i}: {w}" for i, w in bad[:10]))


def test_the_water_fact_distance_is_the_distance_to_water_fact():
    bad = []
    for rec in _positioned():
        facts = rec["plotFacts"]
        fact = facts.get("water")
        if not isinstance(fact, dict):
            bad.append((rec["id"], "no plotFacts.water"))
            continue
        if abs(float(fact.get("distanceM", -1)) - float(facts["distanceToWaterM"])) > 1e-9:
            bad.append((rec["id"], f"{fact.get('distanceM')} != {facts['distanceToWaterM']}"))
    assert not bad, f"{len(bad)} records disagree: " + "; ".join(
        f"{i}: {w}" for i, w in bad[:10])


def test_remeasuring_a_sample_reproduces_the_same_entity(survey):
    recs = sorted(_positioned(), key=lambda r: r["id"])
    step = max(1, len(recs) // 25)
    bad = []
    for rec in recs[::step][:25]:
        x, z = rec["positionM"]
        now = survey.nearest_water_entity(float(x), float(z))
        fact = rec["plotFacts"].get("water") or {}
        if (now or {}).get("entityId") != fact.get("entityId"):
            bad.append((rec["id"], f"{fact.get('entityId')} -> {(now or {}).get('entityId')}"))
    assert not bad, f"{len(bad)} of 25 sampled records: " + "; ".join(
        f"{i}: {w}" for i, w in bad[:10])
