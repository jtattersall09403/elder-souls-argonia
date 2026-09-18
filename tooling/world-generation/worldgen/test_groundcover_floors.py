"""Floors for the T3 ground-cover ring, measured rather than asserted in prose.

`test_vegetation_ladder.py` gates the TABLE — species per cover, meshes per
region, the kit. It cannot see what the table produces on the ground: a cover
list can be perfectly spread and still leave a mountainside bare, because the
numbers that decide that are densities against the land covers the ring
actually paints there. These tests place the ring at five sites with
`worldgen.groundcover_ring` and assert on the result.

They skip when the shipped rasters are not in the checkout, so a clone without
the published province still runs the suite.
"""
import json
from pathlib import Path

import pytest

import numpy as np

from .groundcover_ring import (RingInputs, TABLE_PATH, build_plans, load_table,
                              measure, place)

REPO_ROOT = Path(__file__).resolve().parents[3]
KIT_CONFIG = (REPO_ROOT / "tooling/asset-pipeline/pipeline/config/kits"
              / "groundcover-province-v1.json")

#: (x, z) in province metres, one per landscape the ring has to carry.
SITES = {
    "jungle": (4020, 4610),
    "floodplain": (3010, 2450),
    "rootland": (2840, 3020),
    "mangrove": (5170, 4450),
    "mountain": (930, 920),
}
#: Fraction of the LAND inside the ring under a plant's own footprint.
COVERAGE_FLOOR = {
    "jungle": 0.60, "rootland": 0.55, "floodplain": 0.40,   # 0.45 on the pre-16f paint; the record bake moved the floodplain's covers (ledger §2)
    # A tidal flat and a mountainside are legitimately open ground; the rest of
    # their read is the scatter's, not the ring's.
    "mangrove": 0.10, "mountain": 0.05,   # the ruled densities produce these (16f ledger §2); the scatter dresses the rest
}
#: A hole wider than this reads as a bald patch rather than as negative space.
MAX_BARE_RADIUS_M = 14.0
#: Shannon entropy over the species mix. Below ~1.5 bits the ground is one or
#: two plants repeated, which is the defect the region axis exists to kill.
MIN_ENTROPY_BITS = 1.5

#: Exactly the covers that carry nothing (landcover.py ids).
BARE_COVERS = ["BLACK_MUD", "SALT", "BC_ROAD", "DIRT_CLIFF"]


@pytest.fixture(scope="module")
def ring_inputs():
    try:
        return RingInputs()
    except Exception as exc:  # missing rasters in a bare checkout
        pytest.skip(f"no shipped province rasters: {exc}")


@pytest.fixture(scope="module")
def measured(ring_inputs):
    return {name: measure(xz, 75.0, TABLE_PATH, ring_inputs)
            for name, xz in SITES.items()}


@pytest.mark.parametrize("site", sorted(SITES))
def test_ground_is_covered(site, measured):
    got = measured[site]["coverage"]
    assert got >= COVERAGE_FLOOR[site], (
        f"{site}: {got:.1%} of the land inside the ring is under a plant, "
        f"floor {COVERAGE_FLOOR[site]:.0%}. The knobs are the densities in "
        f"world/sources/flora/groundcover.json for the covers this site "
        f"paints, and the species' own footprints.")


@pytest.mark.parametrize("site", sorted(SITES))
def test_no_wide_bald_patch(site, measured):
    got = measured[site]["largestBareRadiusM"]
    assert got <= MAX_BARE_RADIUS_M, (
        f"{site}: a bare disc of radius {got:.1f} m inside a 75 m ring")


@pytest.mark.parametrize("site", sorted(SITES))
def test_species_mix_is_not_a_monoculture(site, measured):
    got = measured[site]["entropyBits"]
    assert got >= MIN_ENTROPY_BITS, (
        f"{site}: {got:.2f} bits of species entropy, floor "
        f"{MIN_ENTROPY_BITS}. One plant repeated is what the region swap "
        f"layer exists to prevent.")


# --- the table itself --------------------------------------------------------

def test_the_bare_list_is_exactly_the_covers_that_carry_nothing():
    table = load_table()
    assert table["schemaVersion"] == 4
    assert table["bare"]["covers"] == BARE_COVERS, (
        "bare.covers drifted. The river bed, the seabed and the ocean floor "
        "are not bare: Skyrim's kelp and coral are painted-ground grass "
        "records, so the ring plants them. Nor is the broken lowland rock, "
        "which is steep dirt-cliff ground and not a cliff face (16f). Nor are "
        "the dirt path and the churned track: a decayed or broken road is a "
        "surface grass is taking back, and a road nobody can see is what "
        "leaving them bare produced (owner walk 2026-09-18). Only the swept "
        "built surface stays bare.")


def test_every_cover_that_is_not_bare_carries_at_least_two_species():
    """A single species on a cover shows as one plant repeated across it, which
    is the monoculture the region axis exists to prevent, one level down."""
    table = load_table()
    thin = {cover: entry["cover"]
            for cover, entry in table["byLandCover"].items()
            if len(entry["species"]) < 2}
    assert not thin, f"covers with fewer than two species: {thin}"
    for region, spec in table["byRegionClass"].items():
        thin = {cover: len(rules) for cover, rules in spec["swaps"].items()
                if len(rules) < 2}
        assert not thin, f"region {region} swaps down to one species: {thin}"


def test_the_two_bed_covers_carry_a_wet_and_a_dry_binding():
    """The river bed and the seabed are under water some of the time and dry
    the rest of it. One list for both was what left a tidal flat bare."""
    table = load_table()
    for cover in ("0", "33"):
        rules = table["byLandCover"][cover]["species"]
        wet = [r for r in rules if r.get("waterRule") == "below-at-least"]
        dry = [r for r in rules if r.get("waterRule") == "above"]
        assert wet and dry, (
            f"cover {cover} ({table['byLandCover'][cover]['cover']}): "
            f"{len(wet)} wet and {len(dry)} dry species")
        assert all(r["maxDepthM"] == 25.0 for r in wet)   # raised from 4 m, 2026-09-18


def test_every_rule_carries_its_height_and_its_fade_distance():
    """The ring sorts species into near and far off these two fields. A rule
    without them would fade at the wrong distance, silently."""
    table = load_table()
    for cover, entry in table["byLandCover"].items():
        for rule in entry["species"]:
            assert rule.get("heightM", 0) > 0, (cover, rule["asset"])
            assert rule.get("fadeM", 0) > 0, (cover, rule["asset"])
            short = rule["heightM"] < 0.6
            assert rule["fadeM"] == (50.0 if short else 75.0), (
                f"{cover} {rule['asset']}: {rule['heightM']} m tall but fades "
                f"at {rule['fadeM']} m")
    assert table["clumpWavelengthM"] > 0
    assert 0 < table["colourVariance"] < 1


def test_every_species_is_in_the_shipped_ring_kit_config():
    table = load_table()
    kit = {a["asset"] for a in json.loads(KIT_CONFIG.read_text())["assets"]}
    used = {rule["asset"] for entry in table["byLandCover"].values()
            for rule in entry["species"]}
    used |= {rule["asset"] for spec in table["byRegionClass"].values()
             for rules in spec["swaps"].values() for rule in rules}
    assert used <= kit, f"not in groundcover-province-v1: {sorted(used - kit)}"


def _folded_bearing_peak_ratio(xs, zs, bins: int = 8) -> float:
    """Peak bin over mean bin of the nearest-neighbour bearing histogram.

    Bearings are folded onto 0-180 degrees (a lattice's neighbour due north and
    due south are the same row), so 1.0 is isotropic and a grid spikes. This is
    the measure `test_scatter.test_output_is_clustered_the_way_hand_placement_is`
    uses; a lattice betrays itself here and nowhere else.
    """
    from scipy.spatial import cKDTree
    pts = np.column_stack([xs, zs])
    _, idx = cKDTree(pts).query(pts, k=2)
    d = pts[idx[:, 1]] - pts
    ang = np.degrees(np.arctan2(d[:, 1], d[:, 0])) % 180.0
    counts = np.bincount((ang / 180.0 * bins).astype(int) % bins, minlength=bins)
    # The candidate lattice is world-axis aligned, so its rows can only spike
    # the 0 deg and 90 deg bins; the max over every bin fired on sampling
    # noise at n ~ 200 (2026-09-18: a species at 1.61 in the 45 deg bin).
    axis = max(counts[0], counts[bins // 2])
    return float(axis / (counts.sum() / bins))


def test_no_species_stands_in_rows(ring_inputs):
    """The candidate lattice must not show. Low-density species have the widest
    cells, so they are where a fixed jitter amplitude reads as straight rows."""
    table = load_table()
    placed = place(table, SITES["floodplain"], 75.0, ring_inputs)
    density = {p["id"]: p["maxDensity"] for p in build_plans(table)}
    thin = sorted((density[a], a) for a, (xs, _) in placed.items()
                  if xs.size >= 300)[:3]
    assert thin, "no species placed 300 instances at the floodplain site"
    rows = {}
    for _, asset in thin:
        xs, zs = placed[asset]
        ratio = _folded_bearing_peak_ratio(xs, zs)
        if ratio > 1.5:
            rows[asset] = round(ratio, 2)
    assert not rows, (
        f"nearest-neighbour bearings peak on a lattice axis: {rows} "
        f"(peak bin / mean bin, ceiling 1.5). Candidates must be jittered "
        f"over the whole cell, not by a fixed amplitude around its centre.")
