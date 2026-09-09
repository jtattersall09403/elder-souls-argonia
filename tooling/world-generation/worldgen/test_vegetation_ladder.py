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


#: Understory species each region must carry that NONE of the region classes
#: it physically borders carries. Six species per region (decision 0048) still
#: let every neighbour pair share all six, which is what the province did: the
#: flora kit had 81 assets and the palettes placed 78, so there was nothing
#: left to be exclusive with. Round 12 built the kit to 108.
MIN_EXCLUSIVE_UNDERSTORY = 2


@pytest.mark.skipif(not (vl.PROVINCE / "hydro-regions.png").exists(),
                    reason="no region raster in this checkout")
def test_each_region_has_exclusive_understory():
    """Crossing a region boundary must show the player plants they have not
    just been walking through. Adjacency is measured from the shipped region
    raster (`vegetation_ladder.region_adjacency`), so this cannot be satisfied
    by asserting a neighbour list that no longer matches the map."""
    palettes = _palettes()
    adjacency = vl.region_adjacency()
    thin = {}
    for region, entry in palettes.items():
        neighbours = adjacency.get(int(region), set())
        shared = set()
        for other in neighbours:
            other_entry = palettes.get(str(other))
            if other_entry:
                shared |= _understory(other_entry)
        exclusive = _understory(entry) - shared
        if len(exclusive) < MIN_EXCLUSIVE_UNDERSTORY:
            thin[region] = sorted(s.rsplit("/", 1)[-1] for s in exclusive)
    assert not thin, (
        f"region classes with fewer than {MIN_EXCLUSIVE_UNDERSTORY} understory "
        f"species their neighbours do not also carry: {thin}. The assignment "
        f"lives in build_palettes.EXCLUSIVE_UNDERSTORY; adding one means "
        f"adding the mesh to flora-province-v1 and rebuilding the kit.")


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


# --- gate 4: the ground ring's own breadth -----------------------------------

#: Distinct grass species a region must carry across the land covers it
#: actually paints, capped by what the LTEX.GNAM limit physically allows
#: (three per cover). Before round 13 the ring held seven meshes for the whole
#: province and nine of fourteen regions carried four or fewer; the mangrove
#: coast carried exactly one, so every mangrove mudflat in Black Marsh was the
#: same plant. Raising this needs new meshes in groundcover-province-v1.
MIN_GROUND_SPECIES = 6


def _resolved_ground(data: dict, region: str) -> dict[str, list[str]]:
    """Species -> the land covers it carries, for one region, after swaps.

    Resolution is the rule `groundcover.json` states: a swap REPLACES the base
    list for that one cover in that one region, and covers the region never
    paints do not count at all (`regionCovers`, measured from the rasters)."""
    covers = [str(c) for c in data["regionCovers"][region]]
    swaps = data["byRegionClass"][region]["swaps"]
    out: dict[str, list[str]] = collections.defaultdict(list)
    for cover in covers:
        for rule in swaps.get(cover) or data["byLandCover"][cover]["species"]:
            out[rule["asset"]].append(cover)
    return out


def test_every_region_carries_a_real_ground_layer():
    """T3 grass is the layer the player walks through constantly, so it is the
    layer a thin species pool shows up in first."""
    data = json.loads(GROUNDCOVER.read_text())
    cap_per_cover = data["rules"]["maxSpeciesPerCover"]
    thin = {}
    for region in data["byRegionClass"]:
        species = _resolved_ground(data, region)
        # a region painting one cover can never hold more than the GNAM cap
        floor = min(MIN_GROUND_SPECIES,
                    cap_per_cover * len(data["regionCovers"][region]))
        if len(species) < floor:
            thin[region] = (len(species), floor)
    assert not thin, (
        f"region classes below their ground-species floor (species, floor): "
        f"{thin}. The ring's pool is groundcover-province-v1; spreading it is "
        f"byRegionClass.swaps in groundcover.json.")


def test_no_ground_mesh_carries_three_land_covers():
    """The defect this whole axis exists to kill, gated on the BASE table as
    well as per region: `vurt_reeds` used to be MARSH_GRASS, SWAMP_GRASS and
    SCUM at once, which made every reed bed in the province one plant. The
    per-region form of this check lives in
    `test_groundcover_has_a_region_axis`; this one catches a base table that
    is over-spread before any region swaps it."""
    data = json.loads(GROUNDCOVER.read_text())
    limit = data["rules"]["maxCoversPerSpeciesPerRegion"]
    spread: dict[str, list[str]] = collections.defaultdict(list)
    for cover, entry in data["byLandCover"].items():
        for rule in entry["species"]:
            spread[rule["asset"]].append(cover)
    over = {a.rsplit("/", 1)[-1]: c for a, c in spread.items() if len(c) > limit}
    assert not over, (
        f"base land-cover table: {over} — one mesh on more than {limit} land "
        f"covers is a monoculture the region swaps cannot undo, because a "
        f"region that swaps none of those covers inherits all of them.")


def test_ground_ring_meshes_stay_inside_the_instancing_budget():
    """The ring instances these in the tens of thousands inside ~75 m, so they
    are budgeted differently from the flora kit: 128 triangles is the shipped
    seven's own maximum (`grassfern01`) and 3.3 m the tallest of them
    (`marshgrassobj01`). This reads the BUILT manifest, so it fails on what
    actually ships rather than on what the config asked for."""
    manifest = (REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
                / "groundcover-province-v1.kit.json")
    if not manifest.exists():
        pytest.skip("no built ground-ring kit in this checkout")
    assets = json.loads(manifest.read_text())["assets"]
    heavy = {a["id"].rsplit("/", 1)[-1]: a["triangles"]
             for a in assets if a["triangles"] > 128}
    assert not heavy, f"over the ground-ring triangle budget: {heavy}"
    big = {a["id"].rsplit("/", 1)[-1]: a["sizeM"]
           for a in assets if max(a["sizeM"]) > 3.3}
    assert not big, f"too large to read as ankle-height ground cover: {big}"


def test_nothing_in_the_ground_ring_is_solid():
    """Round-12 rule: no fitted wood, no solid. Grass has no wood, so a
    collider here would be something the player cannot walk through."""
    manifest = (REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
                / "groundcover-province-v1.kit.json")
    if not manifest.exists():
        pytest.skip("no built ground-ring kit in this checkout")
    data = json.loads(manifest.read_text())
    solid = [a["id"] for a in data["assets"]
             if a.get("collision") not in (None, "none")]
    assert not solid, f"ground-ring assets with a collider: {solid}"
