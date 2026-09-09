"""Tests for the place semantic audit (Phase 11 Part 4).

Fast by construction: the `Terrain` protocol is stubbed, so nothing here loads
the province rasters. The two owner-reported cases are pinned against the REAL
catalogue records and the REAL route geometry (both cheap JSON reads).
"""

from __future__ import annotations

import copy

import json

from . import audit_place_semantics as aps
from . import catalogue


# --------------------------------------------------------------------------- #
# stubs
# --------------------------------------------------------------------------- #
class FlatTerrain:
    """Featureless dry ground, everything visible, no deep water."""

    def __init__(self, **over):
        self.base = {
            "elevationM": 3.0, "slopeDeg": 0.5, "regionName": "firm lowland",
            "dangerBand": 2, "culture": "pirate-freeholds", "relief150M": 0.4,
            "heightAboveWaterM": 2.0, "waterDepthM": 0.0, "maxDepthNearbyM": 0.1,
            "maxDepthAtEntranceM": 0.1, "distanceToWaterM": 400.0,
            "shoreDistanceM": 400.0, "coastDistanceM": 900.0, "wetland": False,
            "floodBand": 0,
        }
        self.base.update(over)

    def terrain_at(self, x, z):
        return dict(self.base)

    def line_of_sight(self, ax, az, bx, bz):
        return True


def straight_route(key, names, x0, z0, x1, z1, n=20, kind="road", major=True):
    pts = [(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n) for i in range(n + 1)]
    return aps.RouteLine(key, kind, major, names, pts)


def make_ctx(records, routes=None, terrain=None):
    recs = {r["id"]: r for r in records}
    return aps.Ctx(terrain=terrain or FlatTerrain(),
                   routes=routes if routes is not None else [],
                   records=recs,
                   region_of={r["id"]: r["id"].split(".")[1] for r in records})


def record(rid, **over):
    rec = {
        "id": rid, "name": "Testhold", "status": "active",
        "classification": {"class": "settlement", "family": "dry-village",
                           "type": "flood-high-hamlet", "magnitude": "M2"},
        "why": {"founding": "A hamlet.", "siteAdvantages": "Firm dry ground.",
                "occupantsMotive": "Fishers.", "pressures": "None."},
        "vibe": {"silhouette": "low roofs", "approach": "reed all round",
                 "signatureFeature": "a mended net"},
        "sitingPrefs": {"regionClasses": ["firm lowland"], "hardConstraints": [],
                        "preferences": [], "landformClasses": ["any-firm-ground"]},
        "relations": {"dependsOn": [], "supplies": [], "reachedVia": [],
                      "patrols": [], "tolls": [], "travelServiceEdges": []},
        "occupants": ["D1 fishers"], "dangerTier": "D2",
        "discovery": "rumour", "entrance": "gate", "underwaterAccess": "none",
        "positionM": [1000.0, 1000.0],
        "whySiteWon": "firm ground in firm lowland (danger band 2), 40 m from the nearest route.",
        "plotFacts": {"landform": "any-firm-ground", "regionClass": "firm lowland",
                      "dangerBand": 2, "distanceToRouteM": 40.0, "distanceToWaterM": 20.0},
    }
    rec.update(over)
    return rec


# --------------------------------------------------------------------------- #
# 1. a consistent record produces no findings
# --------------------------------------------------------------------------- #
def test_consistent_record_passes():
    road = straight_route("a->b", ("stormhold", "thorn"), 900.0, 1000.0, 1200.0, 1000.0)
    ctx = make_ctx([record("place.pirate-freeholds.clean")], routes=[road])
    assert aps.audit(ctx) == []


# --------------------------------------------------------------------------- #
# 2. synthetic contradictions are caught, one per check
# --------------------------------------------------------------------------- #
def test_synthetic_contradictions_are_caught():
    road = straight_route("stormhold->thorn", ("stormhold", "thorn"),
                          5000.0, 5000.0, 6000.0, 5000.0)
    bad = record(
        "place.pirate-freeholds.liar",
        name="The False Span",
        why={"founding": "The trunk road crosses here, on the Stormhold to Thorn line.",
             "siteAdvantages": "A dry rise that never floods, with a quay on the bank.",
             "occupantsMotive": "Toll-takers.",
             "pressures": "None."},
        dangerTier="D1",
        occupants=["D4 marsh-thing"],
        discovery="road",
        whySiteWon=("firm ground in firm lowland (danger band 5), 900 m from the nearest "
                    "route; no free 'flood-high' site was left in the zone, so plain ground; "
                    "placed from the homeless batch at stage 'region-relaxed'."),
        plotFacts={"landform": "any-firm-ground", "regionClass": "interior swamp",
                   "dangerBand": 5, "distanceToRouteM": 900.0, "distanceToWaterM": 800.0},
    )
    # the water check MEASURES: the 800 m lives on the ground, not on the
    # record's own plotFacts, which is the field it used to grade itself by.
    ctx = make_ctx([bad], routes=[road], terrain=FlatTerrain(distanceToWaterM=800.0))
    found = {f.check for f in aps.audit(ctx)}
    assert {"route", "landform", "water", "region", "danger", "discovery",
            "generic"} <= found

    by_check = {f.check: f for f in aps.audit(ctx)}
    assert "Stormhold–Thorn road" in by_check["route"].fact
    assert "flood-high" in by_check["landform"].fact
    assert by_check["water"].fact.startswith("800 m")
    assert all(f.resolution in aps.RESOLUTIONS for f in aps.audit(ctx))


# --------------------------------------------------------------------------- #
# 3. determinism
# --------------------------------------------------------------------------- #
def test_audit_is_deterministic():
    road = straight_route("stormhold->thorn", ("stormhold", "thorn"),
                          5000.0, 5000.0, 6000.0, 5000.0)
    recs = [record(f"place.pirate-freeholds.r{i}",
                   positionM=[1000.0 + 30 * i, 1000.0],
                   why={"founding": "On the Stormhold to Thorn line.",
                        "siteAdvantages": "A quay on the bank.",
                        "occupantsMotive": "x", "pressures": "y"})
            for i in range(6)]
    ctx = make_ctx(recs, routes=[road])
    a, b = aps.audit(ctx), aps.audit(ctx)
    assert a == b
    assert [f.sort_key() for f in a] == sorted(f.sort_key() for f in a)
    assert aps.report_md(aps.report_json(ctx, a)) == aps.report_md(aps.report_json(ctx, b))


# --------------------------------------------------------------------------- #
# 4. the two cases the owner found by eye
# --------------------------------------------------------------------------- #
def _real(rid):
    for _region, places in aps.load_places():
        for rec in places:
            if rec["id"] == rid:
                return rec
    raise AssertionError(f"{rid} not in the catalogue")


def test_owner_reported_cases_are_caught():
    """The two records the owner pointed at (2026-09-03), frozen as they were
    BEFORE the repair round: the real records have since been rewritten, so the
    test re-applies the original claims, positions and plot facts to copies."""
    routes = aps.load_routes()
    span = copy.deepcopy(_real("place.pirate-freeholds.trunk-toll-bridge"))
    span["why"]["founding"] = ("The northern trunk road crosses the river at its narrowest point, "
                               "and the crossing has an owner — as every crossing here does.")
    span["why"]["siteAdvantages"] = "A water narrows with hard banks, on the Stormhold-to-Thorn line."
    span["sitingPrefs"]["landformClasses"] = ["water-narrows", "ford", "land-bridge"]
    span["sitingPrefs"]["hardConstraints"] = ["spans the channel at its narrowest", "on the trunk route"]
    span["positionM"] = [3539.6, 1198.1]
    span["plotFacts"] = dict(span.get("plotFacts") or {}, landform="any-firm-ground", distanceToRouteM=270.0)
    span["whySiteWon"] = "firm ground in firm lowland (danger band 3), 270 m from the nearest route; no free 'water-narrows' site was left in the zone, so plain ground."
    creek = copy.deepcopy(_real("place.pirate-freeholds.chasecreek"))
    creek["why"]["founding"] = ("A fishing hamlet on the one dry rise at a creek mouth, which discovered that a boat "
                                "can wait here unseen while the free port is being watched.")
    creek["why"]["siteAdvantages"] = ("A single flood-high rise with a creek deep enough to hide a hull and shallow "
                                      "enough that nobody follows.")
    creek["sitingPrefs"]["landformClasses"] = ["flood-high", "any-channel-bank"]
    creek["positionM"] = [3539.6, 934.9]
    creek["plotFacts"] = dict(creek.get("plotFacts") or {}, landform="any-firm-ground")
    creek["whySiteWon"] = "firm ground in firm lowland (danger band 3), 354 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground."
    ctx = make_ctx([span, creek], routes=routes)

    span_route = [f for f in aps.check_route(ctx, span) if f.check == "route"]
    assert span_route, "The Trunk Span's Stormhold–Thorn claim was not flagged"
    assert "Stormhold–Thorn road" in span_route[0].fact
    assert "Alten Corimont" in span_route[0].fact  # the road it is actually on

    creek_lf = aps.check_landform(ctx, creek)
    assert creek_lf, "Chasecreek's flood-high identity was not flagged"


def test_report_json_shape():
    ctx = make_ctx([record("place.pirate-freeholds.clean")])
    doc = aps.report_json(ctx, aps.audit(ctx))
    assert doc["schemaVersion"] == aps.SCHEMA_VERSION
    assert doc["livePlaces"] == 1
    json.dumps(doc)  # serialisable


# --------------------------------------------------------------------------- #
# the vocabularies the water check tests membership in
# --------------------------------------------------------------------------- #
# `check_water` once asked whether `underwaterAccess` was one of
# {"dive-entry", "flooded-interior", "submerged", "dive"} and `entrance` one of
# {"underwater-entry", "flooded"}. Five of those six names exist nowhere in the
# catalogue, so the branch never fired on any of 180 typed-dive records
# (docs/research/world-terrain/place-water-facts-vs-shipped-water.md §5.4). The
# sets now live in `catalogue`, beside the vocabularies they are subsets of,
# and these two tests make a dead membership test impossible to reintroduce:
# a name must be legal AND actually used.
WATER_VOCABULARIES = {
    "WET_ACCESS": (catalogue.WET_ACCESS, catalogue.UNDERWATER_ACCESS, "underwaterAccess"),
    "DEEP_ACCESS": (catalogue.DEEP_ACCESS, catalogue.UNDERWATER_ACCESS, "underwaterAccess"),
    "UNDERWATER_ENTRANCES": (catalogue.UNDERWATER_ENTRANCES, catalogue.ENTRANCES, "entrance"),
}


def test_every_water_vocabulary_is_a_subset_of_the_schema():
    for name, (subset, vocab, _field) in WATER_VOCABULARIES.items():
        assert subset, f"{name} is empty"
        assert subset <= vocab, f"{name} names values the schema does not allow: {subset - vocab}"


def test_every_water_vocabulary_name_actually_occurs_in_the_catalogue():
    """The check a regex cannot do: is this string ever in the data?"""
    used: dict[str, set] = {"underwaterAccess": set(), "entrance": set()}
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            for f in used:
                if rec.get(f) is not None:
                    used[f].add(rec[f])
    for name, (subset, _vocab, field_name) in WATER_VOCABULARIES.items():
        dead = subset - used[field_name]
        assert not dead, (
            f"{name} tests membership in {sorted(dead)}, which no record's "
            f"'{field_name}' ever carries — the branch cannot fire")


def test_the_water_check_fires_on_a_typed_dive_in_dry_ground():
    """Both directions, on the vocabulary that really ships."""
    rec = {"id": "place.pirate-freeholds.probe", "name": "Probe",
           "positionM": [1000.0, 1000.0], "underwaterAccess": "deep-dive",
           "entrance": "well-shaft"}
    dry = make_ctx([rec], terrain=FlatTerrain())
    assert [f.check for f in aps.check_water(dry, rec)] == ["water"]
    # water in the neighbourhood but not at the entrance is still a defect
    near = make_ctx([rec], terrain=FlatTerrain(maxDepthNearbyM=4.0,
                                               maxDepthAtEntranceM=0.0,
                                               distanceToWaterM=70.0))
    finding = aps.check_water(near, rec)
    assert len(finding) == 1 and "entrance" in finding[0].fact
    # ...and real water at the entrance passes
    wet = make_ctx([rec], terrain=FlatTerrain(maxDepthNearbyM=4.0,
                                              maxDepthAtEntranceM=3.0,
                                              distanceToWaterM=0.0))
    assert aps.check_water(wet, rec) == []
