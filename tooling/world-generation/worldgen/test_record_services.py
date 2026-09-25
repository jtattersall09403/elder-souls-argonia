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


# 97 A7: lived-in classes sit within +-1 band of their ground (tier 0 exempt,
# as in macro_plot.score). The plot's relaxed stages allow one more band
# (macro_plot.py:1182, :1982); these records were placed there.
DANGER_PINNED = {
    "place.dunmer-north.channel-cross-village",
    "place.dunmer-north.the-diggings-ladder",
    "place.hist-heartland.platform-ladder-tower-watch",
    "place.imperial-fringe.long-causeway",
    "place.imperial-fringe.reedcutters-toll",
    "place.imperial-fringe.the-back-kiln",
    "place.imperial-penal-south.natural-dive-shaft",
    "place.naga-kur-deeps.necropolis-nightbound",
    "place.naga-kur-deeps.portage-slipway-narrows-deeps",
    "place.pirate-freeholds.trunk-road-tradehouse",
    "place.saxhleel-coast.pearl-lots",
    "place.saxhleel-coast.quarantine-village-lagoon",
}


def danger_violations(places: dict) -> set[str]:
    bad = set()
    for pid, rec in places.items():
        facts = rec.get("plotFacts") or {}
        if rec["classification"]["class"] not in mp.LIVED_IN_CLASSES or facts.get("dangerBand") is None:
            continue
        if rec.get("importanceTier") == 0:
            continue
        gap = abs(mp.DANGER_TIER.get(rec["dangerTier"], 3) - int(facts["dangerBand"]))
        if gap > mp.DANGER_GAP_LIVED:
            bad.add(pid)
    return bad


def test_lived_in_records_sit_within_one_band_of_their_ground():
    bad = danger_violations(_places())
    assert "place.imperial-fringe.claywater-station" not in bad
    assert not bad - DANGER_PINNED, f"new danger-band violators: {sorted(bad - DANGER_PINNED)}"
    assert not DANGER_PINNED - bad, f"fixed, remove from the pin: {sorted(DANGER_PINNED - bad)}"


def test_danger_rule_fails_on_a_planted_violation():
    places = _places()
    rec = json.loads(json.dumps(places["place.imperial-fringe.claywater-station"]))
    rec["dangerTier"] = "D1"
    assert danger_violations({rec["id"]: rec}) == {rec["id"]}


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
    "place.imperial-fringe.bog-iron-workings": ["vanilla-farmhouse"],
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
