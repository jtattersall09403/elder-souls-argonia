"""Record promises the world must keep (decision 0100 decision 7).

A record defect found in a site dossier is fixed as a rule with a test. Two
rules live here, each as a ratchet: the measured violators on 2026-09-25 are
pinned, a new violator fails, and a pinned one that is fixed fails until it
is removed from the pin (the list only shrinks).
"""
import glob
import json

from worldgen import macro_plot as mp
from worldgen import travel_services as ts



def _places() -> dict:
    root = ts.REPO_ROOT / "world" / "sources" / "catalogue"
    out = {}
    for path in sorted(glob.glob(str(root / "places-*.json"))):
        for rec in json.loads(open(path, encoding="utf-8").read())["places"]:
            out[rec["id"]] = rec
    return out


# 97 A7: lived-in classes sit within +-2 bands of their ground (tier 0 exempt,
# as in macro_plot.score). The plot prefers one band and allows the second only
# at its relaxed stages (macro_plot.py:1182, :1982); decision 0102 decision 9
# made that practice the rule, so the twelve records placed there stand.
A7_LIVED_BANDS = mp.DANGER_GAP_LIVED + 1


def danger_violations(places: dict) -> set[str]:
    bad = set()
    for pid, rec in places.items():
        facts = rec.get("plotFacts") or {}
        if rec["classification"]["class"] not in mp.LIVED_IN_CLASSES or facts.get("dangerBand") is None:
            continue
        if rec.get("importanceTier") == 0:
            continue
        gap = abs(mp.DANGER_TIER.get(rec["dangerTier"], 3) - int(facts["dangerBand"]))
        if gap > A7_LIVED_BANDS:
            bad.add(pid)
    return bad


def test_lived_in_records_sit_within_two_bands_of_their_ground():
    bad = danger_violations(_places())
    assert not bad, f"lived-in records beyond 97 A7's two bands: {sorted(bad)}"


def test_danger_rule_fails_on_a_planted_violation():
    places = _places()
    rec = json.loads(json.dumps(places["place.imperial-fringe.claywater-station"]))
    rec["plotFacts"]["dangerBand"] = 4
    rec["dangerTier"] = "D1"          # three bands off: beyond A7
    assert danger_violations({rec["id"]: rec}) == {rec["id"]}
    rec["dangerTier"] = "D2"          # two bands off: inside A7 (0102 decision 9)
    assert danger_violations({rec["id"]: rec}) == set()


# A record that declares travelStation.modes promises a boarding point: the
# travel graph must hold a station for it. Pinned: the 48 active records
# with no station on 2026-09-25 (Claywater included: its three destinations
# stand 334-1947 m from any published lane, so a station-run derives
# `unmatched`; lane D report, tooling/.reports/16k/lane-D-data.md).
def unserved(places: dict) -> set[str]:
    doc = json.loads(ts.SERVICES.read_text(encoding="utf-8"))
    boarded = {s.get("placeId") for s in doc["stations"] if s.get("placeId")}
    return {
        pid for pid, rec in places.items()
        if rec.get("status") == "active"
        and ((rec.get("travelStation") or {}).get("modes"))
        and pid not in boarded
    }


# Claywater Station left the count on 2026-09-25 (lane D2): no boat landing
# with a station is reachable from it on the published lanes, so its record
# dropped the ferry rather than promise one the water cannot carry.
SERVICES_PINNED_COUNT = 47


def test_records_promising_travel_have_stations():
    bad = unserved(_places())
    assert "place.imperial-fringe.claywater-station" not in bad
    assert len(bad) <= SERVICES_PINNED_COUNT, (
        f"{len(bad)} active records promise travel with no station (pin {SERVICES_PINNED_COUNT})")
    assert len(bad) == SERVICES_PINNED_COUNT, (
        f"{len(bad)} now unserved: lower SERVICES_PINNED_COUNT to {len(bad)}")


# --- culture -> kits (decision 0100 decision 7: "a kit the place's culture
# does not use") ------------------------------------------------------------
# world/sources/placement/culture-kits.json lists the assetPlan slugs each
# record culture may carry. A record may use the kits of its culture and of
# its secondaryCultures. Measured 2026-09-25 (16k slice 1b lane D2): these
# records carry slugs outside that set; each is pinned with its offending
# slugs so a new one fails and a fixed one must leave the pin. They are NOT
# exempt: each is a record defect waiting for its place's dossier (re-plan
# the assetPlan or declare secondaryCultures with a lore reason).
CULTURE_KIT_PINNED = {
    "place.dunmer-north.andalen-plantation": ["vanilla-farmhouse"],
    "place.dunmer-north.boom-keepers-lodge": ["vanilla-farmhouse"],
    "place.dunmer-north.branchmont": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.crystalgate": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.dreams-by-the-ash": ["dunmer-telvanni"],
    "place.dunmer-north.gandranen-library": ["vanilla-farmhouse"],
    "place.dunmer-north.hissmir": ["vanilla-farmhouse"],
    "place.dunmer-north.let-upper-floor": ["vanilla-farmhouse"],
    "place.dunmer-north.nine-fords": ["bmv-fort", "vanilla-farmhouse"],
    "place.dunmer-north.nine-stone-bench": ["dunmer-telvanni"],
    "place.dunmer-north.rimfield": ["vanilla-farmhouse"],
    "place.dunmer-north.saltmarch-village": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.stormhold": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.tear-road-stage": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.tearmouth": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.ten-maur-wolk": ["dunmer-telvanni"],
    "place.dunmer-north.the-ash-causeway": ["passerelles-walkway"],
    "place.dunmer-north.the-ash-holding": ["vanilla-shackkit"],
    "place.dunmer-north.the-bone-stage-north": ["dunmer-telvanni"],
    "place.dunmer-north.the-borrowed-tomb": ["bmv-fort", "dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.the-causeway-lodge": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.the-cold-holding": ["vanilla-shackkit"],
    "place.dunmer-north.the-delta-byre": ["dunmer-telvanni"],
    "place.dunmer-north.the-diggings-ladder": ["dunmer-telvanni"],
    "place.dunmer-north.the-dres-rows": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.the-drover-camp": ["dunmer-telvanni"],
    "place.dunmer-north.the-field-edge-hearth": ["dunmer-telvanni"],
    "place.dunmer-north.the-flu-cordon": ["dunmer-telvanni"],
    "place.dunmer-north.the-guar-ground": ["totems-ritual"],
    "place.dunmer-north.the-monsoon-boom": ["dunmer-telvanni"],
    "place.dunmer-north.the-moon-court": ["vanilla-farmhouse"],
    "place.dunmer-north.the-north-border-post": ["dunmer-telvanni"],
    "place.dunmer-north.the-north-holding-pit": ["vanilla-farmhouse"],
    "place.dunmer-north.the-north-vista": ["dunmer-telvanni"],
    "place.dunmer-north.the-pen-yard": ["vanilla-farmhouse"],
    "place.dunmer-north.the-pilots-rest": ["vanilla-farmhouse"],
    "place.dunmer-north.the-rim-hermitage": ["vanilla-farmhouse"],
    "place.dunmer-north.the-rim-shelter": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.the-shoal-bank": ["dunmer-telvanni"],
    "place.dunmer-north.the-slumped-hamlet": ["vanilla-farmhouse"],
    "place.dunmer-north.the-sump-hamlet": ["bamboo-hut", "totems-ritual", "vanilla-shackkit"],
    "place.dunmer-north.the-terrace-watch": ["bmv-fort"],
    "place.dunmer-north.the-thorn-bond": ["bmv-fort", "dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.the-tide-fair": ["dunmer-telvanni"],
    "place.dunmer-north.the-two-gate-bridge": ["dunmer-telvanni"],
    "place.dunmer-north.the-veterans-ridge": ["dunmer-telvanni"],
    "place.dunmer-north.the-white-pans": ["dunmer-telvanni"],
    "place.dunmer-north.thorn": ["hlaalu-domestic", "vanilla-farmhouse"],
    "place.dunmer-north.thorn-paddy-terraces": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.went-down-slowly": ["vanilla-farmhouse"],
    "place.dunmer-north.wolk-market": ["dunmer-telvanni", "vanilla-farmhouse"],
    "place.dunmer-north.zuuk": ["bmv-fort", "vanilla-farmhouse"],
    "place.hist-heartland.alten-markmont": ["imperial-keep"],
    "place.hist-heartland.bubble-spire-collapsed": ["dunmer-telvanni"],
    "place.hist-heartland.bubble-spire-open-helstrom": ["dunmer-telvanni"],
    "place.hist-heartland.umpholo-mission": ["imperial-keep"],
    "place.hist-heartland.xal-meeruth-station": ["imperial-keep"],
    "place.imperial-fringe.bonded-shed-of-the-onkobra": ["hlaalu-domestic"],
    "place.imperial-fringe.cartwrights-cross": ["imperial-keep", "vanilla-farmhouse"],
    "place.imperial-fringe.castle-giovesse": ["hlaalu-domestic"],
    "place.imperial-fringe.fig-market": ["vanilla-farmhouse"],
    "place.imperial-fringe.fort-greenditch": ["hlaalu-domestic"],
    "place.imperial-fringe.fort-swampmoth": ["hlaalu-domestic"],
    "place.imperial-fringe.gideon": ["hlaalu-domestic"],
    "place.imperial-fringe.gideon-synod-outstation": ["hlaalu-domestic"],
    "place.imperial-fringe.guar-holding-of-the-nine-bells": ["vanilla-shackkit"],
    "place.imperial-fringe.keepers-lodge-of-the-lower-onkobra": ["vanilla-farmhouse"],
    "place.imperial-fringe.lower-onkobra-paddies": ["vanilla-farmhouse"],
    "place.imperial-fringe.marcians-terrace": ["bmv-round-huts", "hlaalu-domestic", "mud-mother-grove", "totems-ritual"],
    "place.imperial-fringe.mile-house-of-the-eagle": ["hlaalu-domestic"],
    "place.imperial-fringe.moonrack-calcinator": ["vanilla-farmhouse"],
    "place.imperial-fringe.nine-arch-stage": ["bmv-fort", "vanilla-farmhouse"],
    "place.imperial-fringe.ninefold-station": ["bmv-fort", "imperial-keep"],
    "place.imperial-fringe.ninth-milestone-house": ["vanilla-farmhouse"],
    "place.imperial-fringe.onkobra-field-station": ["hlaalu-domestic"],
    "place.imperial-fringe.silverhand-cairns": ["totems-ritual"],
    "place.imperial-fringe.slough-point": ["hlaalu-domestic"],
    "place.imperial-fringe.slough-point-quarantine-shed": ["hlaalu-domestic"],
    "place.imperial-fringe.sour-orchard": ["vanilla-farmhouse"],
    "place.imperial-fringe.swampmoth-town": ["imperial-keep", "vanilla-farmhouse"],
    "place.imperial-fringe.the-borrowed-house": ["imperial-keep", "vanilla-farmhouse"],
    "place.imperial-fringe.the-cold-forge": ["hlaalu-domestic"],
    "place.imperial-fringe.the-drowned-mule": ["vanilla-farmhouse"],
    "place.imperial-fringe.the-fig-and-ledger": ["argonian-lights", "hlaalu-domestic", "mud-mother-grove"],
    "place.imperial-fringe.the-hollow-pass-station": ["vanilla-farmhouse"],
    "place.imperial-fringe.the-lamp-at-the-ford": ["vanilla-farmhouse"],
    "place.imperial-fringe.the-marble-field": ["hlaalu-domestic"],
    "place.imperial-fringe.the-month-chapel": ["hlaalu-domestic"],
    "place.imperial-fringe.the-pass-shelter": ["vanilla-farmhouse"],
    "place.imperial-fringe.the-quiet-pit": ["vanilla-farmhouse"],
    "place.imperial-fringe.the-second-empire-locks": ["hlaalu-domestic"],
    "place.imperial-fringe.the-shaking-house": ["vanilla-farmhouse"],
    "place.imperial-fringe.the-snowline-cell": ["vanilla-farmhouse"],
    "place.imperial-fringe.the-vellum-estate": ["hlaalu-domestic", "mud-mother-grove"],
    "place.imperial-fringe.westfield-village": ["vanilla-farmhouse"],
    "place.imperial-penal-south.basin-squat": ["bmv-fort", "vanilla-farmhouse"],
    "place.imperial-penal-south.daril-den": ["vanilla-farmhouse"],
    "place.imperial-penal-south.kothringi-ruin-basin": ["bmv-fort", "vanilla-farmhouse"],
    "place.imperial-penal-south.scandal-holding-pit": ["vanilla-farmhouse"],
    "place.mercantile-coast.chasepoint": ["vanilla-farmhouse"],
    "place.mercantile-coast.coast-road-tradehouse": ["vanilla-farmhouse"],
    "place.mercantile-coast.hereguard-paddies": ["vanilla-farmhouse"],
    "place.mercantile-coast.hestra-stone": ["totems-ritual"],
    "place.mercantile-coast.moonmarch": ["vanilla-farmhouse"],
    "place.mercantile-coast.pusbottom-barge": ["vanilla-farmhouse"],
    "place.mercantile-coast.soulrest-whispers-house": ["mud-mother-grove"],
    "place.mercantile-coast.southern-sea-listening-post": ["mud-mother-grove", "vanilla-farmhouse"],
    "place.mercantile-coast.sugar-barge": ["argonian-lights", "vanilla-farmhouse"],
    "place.mercantile-coast.sugar-stack": ["totems-ritual"],
    "place.mercantile-coast.sunken-causeway": ["passerelles-walkway"],
    "place.mercantile-coast.villa-cellars": ["vanilla-farmhouse"],
    "place.naga-kur-deeps.kothringi-ruin-village-deeps": ["bmv-fort", "vanilla-farmhouse"],
    "place.naga-kur-deeps.squatted-ruin-home-block": ["bmv-fort", "vanilla-farmhouse"],
    "place.pirate-freeholds.alten-corimont": ["vanilla-farmhouse"],
    "place.pirate-freeholds.bone-repatriation-waystation": ["vanilla-farmhouse"],
    "place.pirate-freeholds.corimont-bonded-store": ["bmv-fort", "vanilla-farmhouse"],
    "place.pirate-freeholds.corimont-gambling-house": ["vanilla-farmhouse"],
    "place.pirate-freeholds.corimont-hiring-yard": ["vanilla-farmhouse"],
    "place.pirate-freeholds.corimont-tradehouse": ["vanilla-farmhouse"],
    "place.pirate-freeholds.dres-holding-pens": ["bmv-fort"],
    "place.pirate-freeholds.dunmer-frontier-holding": ["bmv-fort", "vanilla-farmhouse"],
    "place.pirate-freeholds.flu-cairn-field": ["totems-ritual"],
    "place.pirate-freeholds.freehold-pest-house": ["vanilla-farmhouse"],
    "place.pirate-freeholds.freehold-smithy": ["vanilla-farmhouse"],
    "place.pirate-freeholds.kothringi-river-ruin": ["totems-ritual"],
    "place.pirate-freeholds.rim-hearth-house": ["vanilla-farmhouse"],
    "place.pirate-freeholds.rim-pass-station": ["bmv-fort", "vanilla-farmhouse"],
    "place.pirate-freeholds.rim-snowline-hermitage": ["bmv-fort", "vanilla-farmhouse"],
    "place.pirate-freeholds.rockpoint": ["bmv-fort", "vanilla-farmhouse"],
    "place.pirate-freeholds.trunk-road-tradehouse": ["stables-yard", "vanilla-farmhouse"],
    "place.pirate-freeholds.upriver-bonded-store": ["bmv-fort", "vanilla-farmhouse"],
    "place.pirate-freeholds.veterans-holding": ["bmv-fort"],
    "place.saxhleel-coast.archon": ["bmv-fort"],
    "place.saxhleel-coast.archon-bonded-row": ["bmv-fort"],
    "place.saxhleel-coast.archon-sacked-quarter": ["vanilla-shackkit"],
    "place.saxhleel-coast.archon-thalmor-post": ["mud-mother-grove", "vanilla-shackkit"],
    "place.saxhleel-coast.archon-whispers-house": ["bmv-stilthouse", "mud-mother-grove"],
    "place.saxhleel-coast.cantemir-foreign-graveyard": ["totems-ritual"],
    "place.saxhleel-coast.cantemir-headland": ["dunmer-telvanni"],
    "place.saxhleel-coast.derelict-timber-concession": ["vanilla-shackkit"],
    "place.saxhleel-coast.estuary-boom-tower": ["bmv-fort"],
}


def _culture_kits() -> dict:
    path = ts.REPO_ROOT / "world" / "sources" / "placement" / "culture-kits.json"
    record = json.loads(path.read_text(encoding="utf-8"))
    assert record["schemaVersion"] == 1
    return record["cultures"]


def culture_kit_violations(places: dict, kits: dict) -> dict[str, list[str]]:
    bad = {}
    for pid, rec in places.items():
        if rec.get("status") == "cut":
            continue
        allowed: set[str] = set()
        for culture in [rec.get("culture")] + list(rec.get("secondaryCultures") or []):
            allowed |= set(kits[culture]["slugs"])
        off = sorted(set(rec.get("assetPlan") or []) - allowed)
        if off:
            bad[pid] = off
    return bad


def test_culture_kits_rows_follow_the_inventory_tags():
    from worldgen import catalogue
    kits = _culture_kits()
    assert set(kits) == catalogue.RECORD_CULTURES
    aliases = catalogue.load_asset_aliases()
    inv_path = ts.REPO_ROOT / "world" / "sources" / "placement" / "settlement-asset-inventory.json"
    families = {f["id"]: f for f in json.loads(inv_path.read_text(encoding="utf-8"))["families"]}
    for culture, row in kits.items():
        assert str(row.get("source") or "").strip(), culture
        want = {s for s, fam in aliases.items() if families[fam]["culture"] in row["familyCultures"]}
        if row["watercraftFromForeignOther"]:
            want |= {s for s, fam in aliases.items()
                     if families[fam]["culture"] == "foreign-other" and families[fam]["class"] == "watercraft"}
        assert set(row["slugs"]) == want, culture


def test_hlaalu_domestic_is_a_dunmer_kit_not_an_imperial_one():
    kits = _culture_kits()
    assert "hlaalu-domestic" in kits["dunmer"]["slugs"]
    assert "hlaalu-domestic" not in kits["imperial"]["slugs"]


def test_records_use_only_their_cultures_kits():
    bad = culture_kit_violations(_places(), _culture_kits())
    assert "place.imperial-fringe.claywater-station" not in bad
    assert bad == CULTURE_KIT_PINNED


def test_culture_kit_rule_fails_on_a_planted_violation():
    places = _places()
    rec = dict(places["place.imperial-fringe.claywater-station"])
    rec["assetPlan"] = list(rec["assetPlan"]) + ["hlaalu-domestic"]
    places[rec["id"]] = rec
    assert culture_kit_violations(places, _culture_kits())[rec["id"]] == ["hlaalu-domestic"]
    rec["secondaryCultures"] = []
    rec["assetPlan"] = [s for s in rec["assetPlan"] if s != "hlaalu-domestic"]
    assert culture_kit_violations(places, _culture_kits())[rec["id"]] == ["bmv-round-huts"]


def test_validator_holds_secondary_cultures_to_the_vocabulary():
    from worldgen import catalogue
    for sec, ok in ((["argonian"], True), (["imperial"], False), (["mixed"], False),
                    (["elves"], False), ([], False), (["argonian", "argonian"], False)):
        errors: list[str] = []
        catalogue._validate_cultures({"culture": "imperial", "secondaryCultures": sec}, "x", errors)
        assert (not errors) == ok, (sec, errors)
    errors = []
    catalogue._validate_cultures({"culture": "elves"}, "x", errors)
    assert errors


# --- travel edges on routes that pass the place (16k slice 1c, 2026-09-26) --
# `relations.travelServiceEdges` names a road or boat lane the place serves.
# The line must pass within the audit's named-route tolerance
# (audit_place_semantics.NAMED_ROUTE_TOL_M, 250 m) beyond the record's own
# footprint. Claywater carried `boat:route.boat.alten-corimont-helstrom`,
# whose nearest point is 3,069 m off. Pinned: the other records measured
# 2026-09-26 with the edges that fail; a fixed one must leave the pin.
TRAVEL_EDGE_PINNED: dict[str, list[str]] = {
    # measured 2026-09-26 once edges resolved through the registry aliases and
    # geometryId (they were skipped before, not passing):
    "place.dunmer-north.hutan-tzel": ["route.boat.archon-estuary"],
    "place.dunmer-north.the-shoal-bank": ["route.boat.archon-estuary"],
    "place.dunmer-north.the-tear-wreck": ["route.boat.archon-estuary"],
    "place.dunmer-north.the-thousand-birds": ["route.boat.archon-estuary"],
    "place.dunmer-north.the-tide-fair": ["route.boat.archon-estuary"],
    "place.imperial-penal-south.bramman-head": ["boat:route.boat.soulrest-blackrose"],
    "place.mercantile-coast.screen-watch": ["route.boat.soulrest-blackrose"],
    "place.dunmer-north.channel-cross-village": ["route.boat.stormhold-alten-corimont"],
    "place.dunmer-north.hixinoag": ["route.boat.stormhold-alten-corimont"],
    "place.dunmer-north.murkwater": ["route.boat.stormhold-alten-corimont"],
    "place.dunmer-north.nine-fords": ["route.road.thorn-tear-road"],
    "place.dunmer-north.reedmoor-stilts": ["route.boat.stormhold-alten-corimont"],
    "place.dunmer-north.stormhold": ["route.road.thorn-tear-road"],
    "place.dunmer-north.tear-road-stage": ["route.road.thorn-tear-road"],
    "place.dunmer-north.tearmouth": ["route.boat.archon-thorn", "route.road.thorn-tear-road"],
    "place.dunmer-north.the-black-stage": ["route.boat.stormhold-alten-corimont"],
    "place.dunmer-north.the-last-landing": ["route.boat.stormhold-alten-corimont"],
    "place.dunmer-north.the-pilots-rest": ["route.boat.stormhold-alten-corimont"],
    "place.dunmer-north.the-thorn-bond": ["route.boat.stormhold-alten-corimont"],
    "place.dunmer-north.thorn": ["route.boat.stormhold-alten-corimont"],
    "place.dunmer-north.wolk-market": ["route.boat.stormhold-alten-corimont", "route.road.thorn-tear-road"],
    "place.hist-heartland.porter-relay-poling": ["boat:route.boat.alten-corimont-helstrom"],
    "place.hist-heartland.stilt-channel-edge-uxaneet": ["boat:route.boat.alten-corimont-helstrom"],
    "place.imperial-fringe.fig-market": ["boat:route.boat.alten-corimont-helstrom"],
    "place.imperial-fringe.gideon": ["boat:route.boat.alten-corimont-helstrom"],
    "place.imperial-fringe.low-water-fair": ["boat:route.boat.alten-corimont-helstrom"],
    "place.imperial-fringe.lowmere-raft-town": ["boat:route.boat.blackrose-lilmoth"],
    "place.imperial-fringe.onkobra-ferry": ["boat:route.boat.alten-corimont-helstrom", "route.boat.alten-corimont-helstrom"],
    "place.imperial-fringe.saddle-fair": ["road:route.road.gideon-blackwood-road"],
    "place.imperial-fringe.slough-point": ["boat:route.boat.alten-corimont-helstrom", "road:route.road.gideon-blackwood-road"],
    "place.imperial-fringe.the-eight-steps": ["boat:route.boat.alten-corimont-helstrom"],
    "place.mercantile-coast.alten-meerhleel": ["boat:route.boat.lilmoth-archon"],
    "place.mercantile-coast.bright-throat-village": ["boat:route.boat.lilmoth-archon"],
    "place.mercantile-coast.lighter-flotilla": ["boat:route.boat.lilmoth-archon", "route.boat.lilmoth-anchorage"],
    "place.mercantile-coast.moonmarch": ["boat:route.boat.lilmoth-archon"],
    "place.mercantile-coast.oliis-ferry-stage": ["boat:route.boat.lilmoth-archon"],
    "place.mercantile-coast.quinrawl-anchorage": ["boat:route.boat.soulrest-lilmoth"],
    "place.pirate-freeholds.chasecreek": ["boat:route.boat.stormhold-alten-corimont"],
    "place.pirate-freeholds.half-chartered-anchorage": ["boat:route.boat.alten-corimont-helstrom"],
    "place.pirate-freeholds.opening-work-barge": ["boat:route.boat.stormhold-alten-corimont"],
    "place.saxhleel-coast.portdun-mont": ["boat:route.boat.lilmoth-archon"],
}


def _route_lines() -> dict:
    import numpy as np
    province = ts.REPO_ROOT / "apps" / "world-studio" / "public" / "province"
    px = float(json.loads((province / "hydrology-meta.json").read_text())["metresPerPixel"])
    lines = {}
    for name, key in (("routes.json", "routes"), ("waterways.json", "lanes"),
                      ("routes-minor.json", "tracks"), ("waterways-minor.json", "channels")):
        for r in json.loads((province / name).read_text()).get(key) or []:
            if r.get("px"):
                lines[r["id"]] = (np.asarray(r["px"], float) + 0.5) * px
    return lines


def edge_line_id(edge: str, lines: dict, aliases: dict, geometry: dict | None = None) -> str | None:
    """The published line a travel edge names: its id as written, or resolved
    through the route registry's aliases (catalogue.py's own resolver).
    ``geometry`` ({registry id: geometryId}) is the registry read once by the
    caller across a batch of edges; built here only when a caller has none
    (a single lookup, never a hot loop)."""
    from worldgen.route_registry import load, resolve
    ref = str(edge).split(":", 1)[-1]
    if ref in lines:
        return ref
    if geometry is None:
        geometry = {r["id"]: r.get("geometryId") for r in load()}
    for cand in (resolve(ref, aliases), resolve(str(edge), aliases)):
        # a registry route solved on the minor network is published under
        # its `geometryId` (route_registry.py:11)
        for lid in (cand, geometry.get(cand)):
            if lid in lines:
                return lid
    return None


def far_travel_edges(places: dict, lines: dict, unresolved: dict | None = None) -> dict[str, list[str]]:
    """Edges passing further than the tolerance. An edge naming no published
    line is never skipped silently: it goes to `unresolved` (pid -> edges)."""
    import numpy as np
    from worldgen.audit_place_semantics import NAMED_ROUTE_TOL_M
    from worldgen.route_registry import alias_map, load
    aliases = alias_map()
    geometry = {r["id"]: r.get("geometryId") for r in load()}  # read once for the whole batch
    bad: dict[str, list[str]] = {}
    for pid, rec in places.items():
        if rec.get("status") == "cut" or not rec.get("positionM"):
            continue
        x, z = rec["positionM"]
        tol = NAMED_ROUTE_TOL_M + float(rec.get("footprintRadiusM") or 0.0)
        for edge in (rec.get("relations") or {}).get("travelServiceEdges") or []:
            if str(edge).startswith("service:"):   # a service id, checked by record.coherence
                continue
            lid = edge_line_id(edge, lines, aliases, geometry)
            if lid is None:
                if unresolved is not None:
                    unresolved.setdefault(pid, []).append(edge)
                continue
            pts = lines[lid]
            if float(np.hypot(pts[:, 0] - x, pts[:, 1] - z).min()) > tol:
                bad.setdefault(pid, []).append(edge)
    return {pid: sorted(set(e)) for pid, e in bad.items()}


def test_travel_edges_name_routes_that_pass_the_place():
    bad = far_travel_edges(_places(), _route_lines())
    assert "place.imperial-fringe.claywater-station" not in bad, bad.get(
        "place.imperial-fringe.claywater-station")
    assert bad == TRAVEL_EDGE_PINNED


# Edges naming no published line (a legacy pair string, a rootway, a lane
# never laid). Measured 2026-09-26 after resolving through the registry
# aliases and the minor route and channel records; each waits for its own
# place's dossier. The count only falls.
TRAVEL_EDGE_UNRESOLVED_PINNED_COUNT = 18


def test_no_travel_edge_is_skipped_silently():
    unresolved: dict = {}
    far_travel_edges(_places(), _route_lines(), unresolved)
    assert "place.imperial-fringe.claywater-station" not in unresolved
    n = sum(len(v) for v in unresolved.values())
    assert n == TRAVEL_EDGE_UNRESOLVED_PINNED_COUNT, (
        f"{n} travel edges name no published line (pin {TRAVEL_EDGE_UNRESOLVED_PINNED_COUNT})")


def test_travel_edge_rule_fails_on_a_planted_violation():
    places = _places()
    rec = json.loads(json.dumps(places["place.imperial-fringe.claywater-station"]))
    rec["relations"]["travelServiceEdges"] = ["boat:route.boat.alten-corimont-helstrom"]
    assert far_travel_edges({rec["id"]: rec}, _route_lines()) == {
        rec["id"]: ["boat:route.boat.alten-corimont-helstrom"]}


# --- stilt prose needs a stilt kit (16k slice 1c, 2026-09-26) ---------------
# A record whose `vibe` or `why` says its houses stand on stilts promises a
# stilt kit; with none in its assetPlan the prose describes a place the
# layout cannot build (lesson L06: prose describing a rejected option is a
# defect). Claywater's Argonian half is `bmv-round-huts` (97 Part F
# argonian-mud; imperial-fringe is outside the argonian-stilt zones) while
# its vibe still said "reed houses on stilts". Stilt kits: the
# argonian-reed-stilt families and the neutral scaffold platform
# (world/sources/catalogue/asset-aliases.json). Pinned: the other records
# measured 2026-09-26; each waits for its own dossier (add the kit with its
# zone reason, or rewrite the prose through text-review).
STILT_KITS = {"bamboo-hut", "bmv-stilthouse", "passerelles-walkway", "stockade-scaffold",
              "vanilla-shackkit"}
STILT_PROSE_PINNED: set[str] = {
    "place.dunmer-north.the-pilots-rest",
    "place.imperial-fringe.the-drowned-mule",
    "place.imperial-fringe.westfield-village",
    "place.imperial-fringe.whispers-house-of-the-low-fen",
    "place.imperial-penal-south.imperial-farmstead-basin",
    "place.mercantile-coast.lilmoth-beast-market",
    "place.mercantile-coast.long-bar-wreckers",
    "place.mercantile-coast.oliis-reef-harvest",
    "place.mercantile-coast.varo-holding",
}


def stilt_prose_without_kit(places: dict) -> set[str]:
    import re
    word = re.compile(r"\bstilt", re.I)
    return {
        pid for pid, rec in places.items()
        if rec.get("status") != "cut"
        and word.search(json.dumps(rec.get("vibe") or {}) + json.dumps(rec.get("why") or {}))
        and not set(rec.get("assetPlan") or []) & STILT_KITS
    }


def test_stilt_prose_has_a_stilt_kit():
    bad = stilt_prose_without_kit(_places())
    assert "place.imperial-fringe.claywater-station" not in bad
    assert bad == STILT_PROSE_PINNED


def test_stilt_prose_rule_fails_on_a_planted_violation():
    rec = json.loads(json.dumps(_places()["place.imperial-fringe.claywater-station"]))
    rec["vibe"]["silhouette"] = "Reed houses on stilts."
    assert stilt_prose_without_kit({rec["id"]: rec}) == {rec["id"]}


# --- a crossing inside one place belongs to it (16k slice 1c, 2026-09-26) ---
# A travel-services row whose every landing (or station) lies inside one
# place's footprint is that place's service: its operator names the place
# (`operator.nearestPlaceId`) and the socket its operator stands on
# (`operator.socketRef`: the place's layout socket once it is laid out, else
# a `sockets.post` id of that record; 0104 decision 2). Where two
# footprints hold every landing, the smaller (the more specific place) owns
# it. Claywater's ford ferry was run by the Drowning Gate's barrier family
# 178 m away while both its landings stood inside Claywater's 65 m footprint
# and Claywater's roster already had a poler. Measured 2026-09-26: two rows
# fall under the rule (the Drowning Gate ford ferry, the Onkobra bond ferry);
# none is pinned.
FOOTPRINT_OWNER_PINNED: dict[str, str] = {}


def footprint_owner_failures(places: dict, doc: dict) -> dict[str, str]:
    import math
    stations = {s["id"]: s for s in doc["stations"]}
    bad: dict[str, str] = {}
    for svc in doc["services"]:
        if svc.get("status") != "active":
            continue
        ids = svc.get("landings") or svc.get("stations") or []
        pts = [stations[i]["positionM"] for i in ids if (stations.get(i) or {}).get("positionM")]
        if not pts or len(pts) != len(ids):
            continue
        owners = sorted(
            (float(rec["footprintRadiusM"]), pid) for pid, rec in places.items()
            if rec.get("status") not in ("cut", "deferred") and rec.get("positionM")
            and rec.get("footprintRadiusM")
            and all(math.dist(rec["positionM"], p) <= float(rec["footprintRadiusM"]) for p in pts))
        if not owners:
            continue
        owner = owners[0][1]
        op = svc.get("operator") or {}
        if op.get("nearestPlaceId") != owner or op.get("socketRef") not in (
                ts.operator_socket_ids(owner, places)):
            bad[svc["id"]] = owner
    return bad


def test_a_crossing_inside_one_place_is_run_from_its_station_socket():
    bad = footprint_owner_failures(_places(), json.loads(ts.SERVICES.read_text(encoding="utf-8")))
    assert "ferry.imperial-fringe.drowning-gate" not in bad
    assert bad == FOOTPRINT_OWNER_PINNED


def test_footprint_owner_rule_fails_on_a_planted_violation():
    doc = json.loads(ts.SERVICES.read_text(encoding="utf-8"))
    svc = next(s for s in doc["services"] if s["id"] == "ferry.imperial-fringe.drowning-gate")
    svc["operator"]["nearestPlaceId"] = "place.imperial-fringe.the-drowning-gate"
    assert footprint_owner_failures(_places(), doc)["ferry.imperial-fringe.drowning-gate"] == (
        "place.imperial-fringe.claywater-station")


def test_travel_services_check_refuses_a_socket_the_place_does_not_have():
    doc = json.loads(ts.SERVICES.read_text(encoding="utf-8"))
    svc = next(s for s in doc["services"] if s["id"] == "ferry.imperial-fringe.drowning-gate")
    svc["operator"]["socketRef"] = "socket.claywater-station.nobody"
    assert any("socketRef" in e for e in ts.check(doc=doc))


# --- every reward kind is backed by a service (16k slice 1c, 2026-09-26) ----
# `rewardProfile.kinds` promises the player a kind of place: rest-shelter
# needs lodging or a tavern, trade-access a trader or a market, and so on
# (`blueprint_promises.REWARD_NEEDS`; `services` needs any one service).
# Claywater Station promised services, rest-shelter and trade-access with
# `services: []` because the M1/M2 ceiling stripped what its reward kinds
# imply. `derive_services` now derives the services a record's reward kinds
# and its type recipe imply, and the ceiling never strips those (coordinator
# ruling 2026-09-26). Count-pinned: the records still unbacked, each a
# record outside the services scope or with a kind no single service
# answers, or a non-settlement record whose kind (faction-access) the
# NON_SETTLEMENT_CEILING still strips (low-water-fair, red-cart-yard); the
# count only falls.
REWARD_UNBACKED_PINNED_COUNT = 172


def unbacked_reward_kinds(places: dict) -> dict[str, list[str]]:
    from worldgen.blueprint_promises import REWARD_NEEDS
    bad: dict[str, list[str]] = {}
    for pid, rec in places.items():
        if rec.get("status") in ("cut", "deferred"):
            continue
        have = set(rec.get("services") or [])
        for kind in (rec.get("rewardProfile") or {}).get("kinds") or []:
            if kind in REWARD_NEEDS and not have & REWARD_NEEDS[kind]:
                bad.setdefault(pid, []).append(kind)
    return bad


def test_every_reward_kind_is_backed_by_a_service():
    bad = unbacked_reward_kinds(_places())
    assert "place.imperial-fringe.claywater-station" not in bad, bad.get(
        "place.imperial-fringe.claywater-station")
    assert len(bad) == REWARD_UNBACKED_PINNED_COUNT, (
        f"{len(bad)} records with an unbacked reward kind (pin {REWARD_UNBACKED_PINNED_COUNT})")


def test_reward_backing_rule_fails_on_a_planted_violation():
    rec = json.loads(json.dumps(_places()["place.imperial-fringe.claywater-station"]))
    rec["services"] = []
    assert unbacked_reward_kinds({rec["id"]: rec})[rec["id"]]


def test_only_a_road_crossing_derives_ferry_from_its_operator():
    """Kind-aware (coordinator ruling 2026-09-26): a crossing the place runs
    (`form: road-crossing`, hops that follow the road, no lane) derives
    `ferry`; a boat or canoe station-run carrying a socketRef derives
    nothing here (a scheduled run is promised by `travelStation`, R5)."""
    from worldgen import derive_services
    doc = json.loads(ts.SERVICES.read_text(encoding="utf-8"))
    assert "place.imperial-fringe.claywater-station" in derive_services.crossing_operators(doc)
    run = next(s for s in doc["services"] if s.get("form") != "road-crossing"
               and s.get("status") == "active")
    run["operator"]["socketRef"] = "socket.x.y"
    assert run["operator"]["nearestPlaceId"] not in derive_services.crossing_operators(
        {"services": [run]})


def test_the_ceiling_spares_only_what_the_record_implies():
    from worldgen import catalogue, derive_services
    rec = json.loads(json.dumps(_places()["place.imperial-fringe.claywater-station"]))
    # Claywater's trader was cut to what stands (walk 9 coherence set), so
    # its record no longer promises trade-access.
    assert derive_services.derive(rec) == ["ferry", "lodging", "stable"]
    assert catalogue.hamlet_overreach(rec, rec["services"]) == []
    rec["rewardProfile"]["kinds"].append("trade-access")
    assert derive_services.derive(rec) == ["ferry", "lodging", "stable", "trader"]
    assert catalogue.hamlet_overreach(rec, rec["services"] + ["smith"]) == ["smith"]
    rec["rewardProfile"]["kinds"] = []
    rec["classification"]["type"] = "flood-high-hamlet"
    assert derive_services.derive(rec) == ["ferry"]


def test_the_ceiling_check_is_the_derivation():
    """The M1/M2 gate spares exactly what `derive` gives: a listed service
    that backs a reward kind does not justify itself."""
    from worldgen import catalogue
    rec = json.loads(json.dumps(_places()["place.imperial-fringe.claywater-station"]))
    rec["rewardProfile"]["kinds"] = ["rest-shelter"]
    assert catalogue.hamlet_overreach(rec, ["ferry", "lodging", "stable", "tavern"]) == ["tavern"]


def test_type_recipe_services_are_in_the_vocabulary():
    from worldgen import derive_services
    derive_services.recipe_services.cache_clear()
    assert derive_services.recipe_services()["road-station-village"] == ("stable",)
