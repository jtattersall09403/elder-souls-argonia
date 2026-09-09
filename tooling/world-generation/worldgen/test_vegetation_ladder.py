"""Gates on the between-region vegetation ladder and the understory breadth.

These three tests exist because nothing checked either thing and both drifted
for four authoring rounds: no test under `worldgen/` read `palettes.json` at
all, `test_scatter.py` checks variance WITHIN a landscape and never the
ordering BETWEEN regions, and `asset_breadth.py` had no understory term, so
one grass species per region would have passed every gate we owned.

Each of the three fails on its own defect — see the mutation results recorded
in the commit that added them.
"""

from __future__ import annotations

import collections
import json
from pathlib import Path

import pytest

from . import vegetation_ladder as vl

REPO_ROOT = Path(__file__).resolve().parents[3]
GROUNDCOVER = REPO_ROOT / "world" / "sources" / "flora" / "groundcover.json"
FLORA_KIT = (REPO_ROOT / "tooling" / "asset-pipeline" / "pipeline" / "config"
             / "kits" / "flora-province-v1.json")
GROUNDCOVER_KIT = FLORA_KIT.with_name("groundcover-province-v1.json")

#: Minimum distinct understory species per region class. Nine of fourteen
#: regions sat under this on 2026-09-08 and the border mountains carried
#: exactly one, which is why every mountain slope in the province read the
#: same. Raising this needs new meshes in the flora kit — see the sourcing log.
MIN_UNDERSTORY_SPECIES = 6


def _palettes() -> dict[str, dict]:
    return vl.load_palettes()


def _understory(entry: dict) -> set[str]:
    """Everything that is not a tree stem and not rock: shrubs, thickets,
    walls, ferns, forbs, tall grass, lianas, epiphytes, floor fungi and the
    aquatic tiers. The aquatics belong here — `report_flora_variety.py` used
    to filter them out, which is precisely why the reed monoculture never
    showed up in a report."""
    return {layer["species"] for layer in entry["layers"]
            if not vl.is_stem_layer(layer)
            and layer.get("role") not in vl.ROCK_ROLES}


# --- gate 1: the authored ladder (fast, no bundles) --------------------------

def test_authored_ladder_hits_the_target_ratios():
    palettes = _palettes()
    reference = vl.delivered_equivalent(palettes, 13)
    assert reference > 0.0
    for region, target in sorted(vl.TARGET_RATIOS.items()):
        if region not in vl.MEASURED_ATTENUATION:
            continue
        ratio = vl.delivered_equivalent(palettes, region) / reference
        tolerance = (vl.THIN_RATIO_TOLERANCE if region in vl.THIN_SAMPLE_CLASSES
                     else vl.RATIO_TOLERANCE)
        assert abs(ratio - target) <= tolerance, (
            f"region {region} authors a delivered-equivalent ratio of "
            f"{ratio:.2f} against a target of {target:.2f}. The ladder lives "
            f"in worldgen/vegetation_ladder.TARGET_RATIOS and is applied by "
            f"build_palettes.rebase_stems — re-run build_palettes after "
            f"changing either.")


def test_jungle_is_held_at_its_shipped_level():
    """Owner constraint 2026-09-09: the tropical jungle's density feels right
    and does NOT move. Every other class is re-based relative to it, so if
    region 13's own multiplier ever leaves 1.0 the whole ladder has shifted
    under the owner rather than around them."""
    assert vl.multipliers()[13] == 1.0
    assert vl.TARGET_RATIOS[13] == 1.0


def test_authored_ladder_ordering():
    """The ordering the province must read on foot, coarser than the ratios
    and therefore harder to satisfy by accident."""
    palettes = _palettes()
    equiv = {r: vl.delivered_equivalent(palettes, r) for r in vl.TARGET_RATIOS
             if r in vl.MEASURED_ATTENUATION}
    # Mangrove out-stems the jungle — a thicket, not a roof (§7.1 type 3).
    assert equiv[14] > equiv[13]
    # ...and the jungle out-stems every other class in the province.
    for region, value in equiv.items():
        if region in (13, 14):
            continue
        assert value < equiv[13], (
            f"region {region} carries {value:.1f} stems/ha against the "
            f"jungle's {equiv[13]:.1f} — the jungle must lead the lowlands")
    for lower, higher in ((6, 13), (7, 6), (11, 5), (11, 2), (10, 11),
                          (8, 10), (4, 8), (1, 4), (9, 1), (12, 9)):
        assert equiv[lower] < equiv[higher], (
            f"ladder inverted: region {lower} ({equiv[lower]:.1f}/ha) should "
            f"sit below region {higher} ({equiv[higher]:.1f}/ha)")


# --- gate 2: the delivered ladder (decodes the shipped bundles) --------------

@pytest.mark.skipif(not (vl.VEGETATION / "vegetation-index.json").exists(),
                    reason="no compiled vegetation bundles in this checkout")
def test_delivered_ladder():
    """THIS TEST IS EXPECTED TO FAIL until the scatter rollout runs.

    The palettes were re-based on 2026-09-09; the bundles in
    `apps/world-studio/public/province/vegetation/` are still the pre-re-base
    compile. `python3 -m worldgen.compile_scatter` (after rebuilding the flora
    kit) is what turns it green. That is the whole point of the test: the
    ladder was allowed to drift for four rounds because nothing measured what
    actually shipped.
    """
    delivered = vl.measure_delivered_by_region()
    reference = delivered.get(13, 0.0)
    assert reference > 0.0, "no tropical-jungle stems in the shipped bundles"
    failures = []
    for region, target in sorted(vl.TARGET_RATIOS.items()):
        if region == 0 or region in vl.THIN_SAMPLE_CLASSES:
            continue
        ratio = delivered.get(region, 0.0) / reference
        if abs(ratio - target) > vl.RATIO_TOLERANCE:
            failures.append(f"region {region}: delivered ratio {ratio:.2f}, "
                            f"target {target:.2f} "
                            f"({delivered.get(region, 0.0):.1f}/ha)")
    assert not failures, (
        "the SHIPPED bundles do not carry the ladder:\n  "
        + "\n  ".join(failures)
        + "\n\nIf the palettes were just re-based this is expected and "
          "correct: re-run the flora kit build and then "
          "`python3 -m worldgen.compile_scatter` to roll the change into the "
          "bundles. This test is the only thing that measures what actually "
          "ships.")


# --- gate 3: understory and groundcover breadth ------------------------------

def test_every_region_carries_a_real_understory():
    palettes = _palettes()
    thin = {region: sorted(s.rsplit("/", 1)[-1] for s in _understory(entry))
            for region, entry in palettes.items()
            if len(_understory(entry)) < MIN_UNDERSTORY_SPECIES}
    assert not thin, (
        f"region classes below {MIN_UNDERSTORY_SPECIES} distinct understory "
        f"species: {thin}. Understory variety is what a player reads at eye "
        f"level; a region with one shrub reads as every other region with one "
        f"shrub.")


def test_no_species_is_the_whole_understory_of_a_region():
    """A region whose understory is one species' worth of weight is a
    monoculture whatever the species count says."""
    palettes = _palettes()
    for region, entry in palettes.items():
        weights: dict[str, float] = collections.defaultdict(float)
        for layer in entry["layers"]:
            if not vl.is_stem_layer(layer) and layer.get("role") not in vl.ROCK_ROLES:
                weights[layer["species"]] += layer["instances_per_hectare"]
        total = sum(weights.values())
        if total <= 0:
            continue
        top, share = max(weights.items(), key=lambda kv: kv[1])
        assert share / total < 0.6, (
            f"region {region}: {top.rsplit('/', 1)[-1]} is {share / total:.0%} "
            f"of the whole understory")


def test_groundcover_has_a_region_axis():
    data = json.loads(GROUNDCOVER.read_text())
    assert data["schemaVersion"] == 2
    assert "PROVISIONAL" not in data["status"]
    base = data["byLandCover"]
    regions = data["byRegionClass"]
    region_covers = data["regionCovers"]
    assert set(regions) == set(region_covers)
    for region, spec in regions.items():
        covers = [str(c) for c in region_covers[region]]
        dead = [c for c in spec["swaps"] if c not in covers]
        assert not dead, (
            f"region {region} swaps land covers {dead} it never paints — "
            f"dead data (regionCovers is measured from the shipped rasters)")
        by_asset: dict[str, list[str]] = collections.defaultdict(list)
        for cover in covers:
            rules = spec["swaps"].get(cover) or base[cover]["species"]
            assert 0 < len(rules) <= data["rules"]["maxSpeciesPerCover"], (
                f"region {region} cover {cover}: {len(rules)} species breaks "
                f"the LTEX.GNAM cap of {data['rules']['maxSpeciesPerCover']}")
            for rule in rules:
                by_asset[rule["asset"]].append(cover)
        limit = data["rules"]["maxCoversPerSpeciesPerRegion"]
        spread = {a.rsplit("/", 1)[-1]: c for a, c in by_asset.items()
                  if len(c) > limit}
        assert not spread, (
            f"region {region}: {spread} — one mesh carrying more than {limit} "
            f"land covers is how `vurt_reeds` came to be every reed bed in "
            f"Black Marsh")


def test_groundcover_species_are_all_in_the_shipped_ring_kit():
    """The ring loads ONE GLB. A species the kit does not carry is an invisible
    patch of ground, not a new plant."""
    data = json.loads(GROUNDCOVER.read_text())
    kit = {a["asset"] for a in json.loads(GROUNDCOVER_KIT.read_text())["assets"]}
    used = {rule["asset"] for entry in data["byLandCover"].values()
            for rule in entry["species"]}
    used |= {rule["asset"] for spec in data["byRegionClass"].values()
             for rules in spec["swaps"].values() for rule in rules}
    assert used <= kit, f"not in groundcover-province-v1: {sorted(used - kit)}"


def test_palette_species_are_all_in_the_shipped_flora_kit():
    """Same rule one tier up, and the reason the round-8 breadth pass could
    not simply reach for the held stock: adding a species to a palette without
    adding it to the kit compiles a forest of missing meshes."""
    palettes = _palettes()
    kit = {a["asset"] for a in json.loads(FLORA_KIT.read_text())["assets"]}
    used = {layer["species"] for entry in palettes.values()
            for layer in entry["layers"]}
    assert used <= kit, f"not in flora-province-v1: {sorted(used - kit)}"
