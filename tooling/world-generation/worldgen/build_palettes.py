"""Generate `world/sources/flora/palettes.json` — the evidence-based v2.

Why a generator: the v1 palettes hand-wrote ~60 layers and the same structural
mistakes repeated in every one (dry species hard-gated to the water table,
one flat stratum, no scenes). v2 has ~140 layers across 13 regions built from
a small set of ARCHETYPES that encode the evidence once:

* **Strata** (research/tropical-vegetation-ecology-targets.md §7): landmark
  giants (owner 0036 Q2) / emergents / canopy / understory / shrubs, with
  per-landscape densities from the game-translation table.
* **Four water postures** (research/mod-vegetation-micro-siting.md M1):
  depth-sorted aquatics, waterline-committed trees, bimodal drowned trees,
  and a WADING terrestrial matrix (dry species run ~0.35 m into the water —
  this, not the aquatics, is what makes a marsh read flooded).
* **Signed riparian boost** (M2): wetland matrix ×~2 at the bank easing by
  ~40 m; dry country inverts and stands back from rivers.
* **Pool guilds** (M3): each ~220 m guild tile is a lilypad pond OR a reed
  bed OR a drowned thicket, never a blend.
* **Edges and gaps** (ecology §1.4/§6.2): gap-fill thickets on the open end
  of the shared openness field, green walls on its mid band, interior kept
  comparatively open at eye level — the "impenetrable jungle" is edge and
  regrowth, not interior.
* **Gallery ribbons** (ecology §6.1): open landscapes carry closed-forest
  ribbons within ~35 m of watercourses with an abrupt outer edge.

Species are the 40 already converted into flora-province-v1 — density and
structure change here, the asset set does not (kit rebuild not required).

Run:  python3 -m worldgen.build_palettes     (from tooling/world-generation)
Then: python3 -m worldgen.compile_scatter --report ... per the 0036 run-book.
"""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT = REPO_ROOT / "world" / "sources" / "flora" / "palettes.json"

# Asset ids, aliased so the region tables below read like the ecology tables.
S = {
    "cypress_big": "bmv:landscape/trees/cypress1",
    "cypress": "bmv:landscape/trees/cypress3",
    "jungle_tree_hero": "bmv:landscape/trees/gkbjungletreenew12v3",
    "jungle_tree": "bmv:landscape/trees/gkbjungletreenew1",
    "mangrove_a": "bmv:landscape/trees/mangrovereachtree0gkb3",
    "mangrove_b": "bmv:landscape/trees/mangrovereachtree0gkb9",
    "willow_a": "bmv:landscape/trees/treewillow01a",
    "willow_b": "bmv:landscape/trees/treewillow02a",
    "willow_c": "bmv:landscape/trees/treewillow03a",
    "cedar": "bmv:landscape/trees/cedartree3",
    "juniper": "bmv:landscape/trees/dwarfjunip05",
    "palm_a": "bmv:landscape/trees/beachpalm1",
    "palm_b": "bmv:landscape/trees/beachpalm2",
    "palm_c": "bmv:landscape/trees/beachpalm3",
    "fanpalm": "bmv:landscape/trees/fanpalm1",
    "bamboo": "bmv:landscape/trees/bambooplant",
    "trop_plant": "bmv:landscape/trees/tropicalplant01",
    "trop_shrub": "bmv:landscape/trees/tropicalshrub01",
    "vines_a": "bmv:landscape/trees/hangingvines1",
    "vines_b": "bmv:landscape/trees/hangingvines2",
    "fall_shrub": "bmv:landscape/trees/gkbfallforestshrub02",
    "lilypad": "bmv:landscape/trees/gkblillipad2",
    "root_a": "bmv:architecture/phitt/ashlands/tramaroot01",
    "root_b": "bmv:architecture/phitt/ashlands/tramaroot06",
    "moss_a": "bmv:landscape/plants/florahangingmoss02aaa",
    "moss_b": "bmv:landscape/plants/florahangingmoss03aaa",
    "fern_big": "bmv:landscape/plants/fernlarge03",
    "fern": "bmv:landscape/plants/fern01",
    "manfern": "tropical:plants/tropical/manfern",
    "bracken": "bmv:landscape/plants/braken",
    "big_shrub": "bmv:landscape/plants/bigshrub2(colorful)",
    "loebush": "bmv:landscape/plants/esloebush08",
    "chickweed": "bmv:landscape/plants/chickweed",
    "shroom": "bmv:vurt_shroom/vurt_shroom_big1",
    "kelp_tall": "bmv:landscape/plants/kelptallstatic01aaa",
    "wkelp_tall": "bmv:landscape/grass/waterkelptall01",
    "wkelp_short": "bmv:landscape/grass/waterkelpshort01",
    "reeds": "bmv:landscape/grass/vurt_reeds",
    "algrass": "bmv:vvardenfell/flora/algrass03b",
    "moss_rock": "bmv:landscape/rocks/moss_rockcliff01",
}

WADE = 0.35   # M1: terrestrial matrix runs this deep into the water
RIPARIAN_WET = dict(shore_boost_gain=1.1, shore_boost_peak_m=-2.0,
                    shore_boost_half_width_m=25.0)          # M2 marsh shape
RIPARIAN_DRY = dict(shore_boost_gain=-0.55, shore_boost_peak_m=0.0,
                    shore_boost_half_width_m=18.0)          # M2 inverted


def layer(species: str, per_ha: float, **kw) -> dict:
    entry = {"species": S[species], "tier": kw.pop("tier", "T2"),
             "instances_per_hectare": round(per_ha, 2)}
    entry.update(kw)
    return entry


def landmark_giant(species: str, per_ha: float = 0.12,
                   depth=(-99.0, 1.0), slope_max=32.0) -> dict:
    """Owner 0036 Q2: rare ×1.8–2.6 navigation silhouettes, wide clearance."""
    return layer(species, per_ha, tier="T1", role="landmark-giant",
                 clump_size_median=1, clump_size_tail=0.0, singleton_share=1.0,
                 clump_radius_m=0.0, patchiness=0.2, glade_response=0.0,
                 water_depth_m=list(depth), slope_deg_max=slope_max,
                 scale_range=[1.8, 2.6], clearance_radius_m=14.0,
                 respects_clearance=False)


def emergent(species: str, per_ha: float, depth=(-99.0, WADE)) -> dict:
    """Ecology §1.2: the few big-crowned trees standing over the canopy —
    ordinary scale range's top end, not the owner's landmark giants."""
    return layer(species, per_ha, tier="T1", role="emergent",
                 clump_size_median=1, singleton_share=0.8, clump_radius_m=10.0,
                 water_depth_m=list(depth), slope_deg_max=34.0,
                 slope_half_angle_deg=25.0, scale_range=[1.15, 1.5],
                 clearance_radius_m=4.0)


def canopy(species: str, per_ha: float, depth=(-99.0, WADE), scale=(0.65, 1.05),
           slope_max=38.0, riparian=None, clearance=1.6, **kw) -> dict:
    """The closed-canopy workhorse. Wading gate (M1), tropical slope
    tolerance (real rainforest fully covers 25° hillsides — ecology §5.1)."""
    defaults = dict(clump_size_median=4, clump_radius_m=14.0)
    defaults.update(kw)
    defaults.setdefault("patchiness", 1.0)
    defaults.setdefault("glade_response", 0.95)
    defaults.setdefault("glade_band", [0.0, 0.9])   # top ~8%: treefall gaps
    defaults.setdefault("slope_half_angle_deg", 25.0)
    entry = layer(species, per_ha, tier="T1", role="canopy",
                  water_depth_m=list(depth), slope_deg_max=slope_max,
                  scale_range=list(scale),
                  clearance_radius_m=clearance, **defaults)
    if riparian:
        entry.update(riparian)
    return entry


def understory(species: str, per_ha: float, depth=(-99.0, WADE),
               scale=(0.5, 0.9), riparian=None, **kw) -> dict:
    """Saplings and small trees — ecology §1.2's 100–150/ha asset tier."""
    defaults = dict(clump_size_median=5, clump_radius_m=8.0)
    defaults.update(kw)
    defaults.setdefault("patchiness", 1.1)
    defaults.setdefault("glade_response", 0.85)
    defaults.setdefault("slope_deg_max", 40.0)
    defaults.setdefault("slope_half_angle_deg", 28.0)
    entry = layer(species, per_ha, role="understory",
                  water_depth_m=list(depth), scale_range=list(scale), **defaults)
    if riparian:
        entry.update(riparian)
    return entry


def interior_shrub(species: str, per_ha: float, depth=(-99.0, WADE), **kw) -> dict:
    """Sparse under closed canopy (ecology §6.5: primary interior is OPEN at
    eye level) — confined to the closed end of the openness field."""
    return layer(species, per_ha, role="interior-shrub",
                 glade_band=[0.0, 0.58], clump_size_median=4,
                 clump_radius_m=7.0, water_depth_m=list(depth),
                 slope_deg_max=40.0, scale_range=[0.7, 1.2], **kw)


def gap_thicket(species: str, per_ha: float, depth=(-99.0, WADE), **kw) -> dict:
    """Treefall-gap regrowth: shrubs ×4–8 where light reaches the floor
    (ecology §1.4) — the open end of the openness field."""
    defaults = dict(slope_deg_max=40.0)
    defaults.update(kw)
    return layer(species, per_ha, role="gap-thicket",
                 glade_band=[0.62, 1.0], glade_response=0.0,
                 clump_size_median=6, clump_radius_m=6.5,
                 water_depth_m=list(depth),
                 scale_range=[0.8, 1.4], **defaults)


def green_wall(species: str, per_ha: float, depth=(-99.0, WADE), **kw) -> dict:
    """The edge wall (ecology §6.2): dense growth on the mid band between
    closed interior and open glade — where the light gradient lives."""
    return layer(species, per_ha, role="green-wall",
                 glade_band=[0.5, 0.72], glade_response=0.0,
                 clump_size_median=5, clump_radius_m=6.0,
                 water_depth_m=list(depth), slope_deg_max=40.0,
                 scale_range=[0.8, 1.4], **kw)


def bank_wall(species: str, per_ha: float, shore=(0.0, 15.0),
              depth=(-99.0, WADE), **kw) -> dict:
    """Water-margin green wall: rivers/pools open the canopy, so their banks
    thicken (ecology §6.2) — banded on shore distance, not on the glade."""
    return layer(species, per_ha, role="bank-wall", shore_m=list(shore),
                 clump_size_median=5, clump_radius_m=6.0,
                 water_depth_m=list(depth), slope_deg_max=38.0,
                 scale_range=[0.8, 1.4], **kw)


def gallery(species: str, per_ha: float, shore=(0.0, 35.0), scale=(0.6, 1.0),
            **kw) -> dict:
    """Gallery-forest ribbon through open country (ecology §6.1): closed-
    forest density inside ~35 m of the water, abrupt outer edge."""
    return layer(species, per_ha, tier="T1", role="gallery",
                 shore_m=list(shore), clump_size_median=4, clump_radius_m=10.0,
                 water_depth_m=[-99.0, WADE], slope_deg_max=34.0,
                 slope_half_angle_deg=25.0, scale_range=list(scale),
                 clearance_radius_m=1.5, **kw)


def waterline_tree(species: str, per_ha: float, scale=(0.75, 1.2), **kw) -> dict:
    """M1's waterline-committed posture (mangrove/cypress5 pattern): ~50 % of
    instances within ±0.3 m of the line, flooded median 0.3–0.6 m."""
    return layer(species, per_ha, tier="T1", role="waterline-tree",
                 clump_size_median=5, clump_radius_m=11.0,
                 water_depth_m=[-0.6, 1.4], depth_peak_m=0.4,
                 depth_half_width_m=1.2, slope_deg_max=28.0,
                 scale_range=list(scale), clearance_radius_m=1.6, **kw)


def drowned_tree(species: str, per_ha: float, **kw) -> list[dict]:
    """M1's bimodal posture (cypress1/3): deep water OR dry ground, never the
    margin — two layers, one per mode."""
    deep = layer(species, per_ha * 0.45, tier="T1", role="drowned-tree",
                 clump_size_median=2, clump_radius_m=12.0,
                 water_depth_m=[0.8, 3.5], depth_peak_m=2.5,
                 depth_half_width_m=1.2, slope_deg_max=26.0,
                 scale_range=[0.6, 0.95], clearance_radius_m=1.8, **kw)
    dry = layer(species, per_ha * 0.55, tier="T1", role="drowned-tree-dry",
                clump_size_median=3, clump_radius_m=13.0,
                water_depth_m=[-99.0, -0.5], slope_deg_max=32.0,
                slope_half_angle_deg=25.0, scale_range=[0.65, 1.0],
                clearance_radius_m=1.8, **kw)
    return [deep, dry]


def aquatic_reeds(per_ha: float, guild: str | None = None, **kw) -> dict:
    """M1: reeds straddle the waterline into the shallows; M3: reed beds
    stand OFFSHORE more than they fringe the beach."""
    entry = layer("reeds", per_ha, role="aquatic-reeds",
                  clump_size_median=10, clump_radius_m=5.0,
                  water_depth_m=[-0.15, 0.7], depth_peak_m=0.35,
                  depth_half_width_m=0.8, shore_m=[-25.0, 3.0],
                  scale_range=[1.0, 1.8], **kw)
    if guild:
        entry["guild"] = guild
    return entry


def aquatic_lilypads(per_ha: float, guild: str | None = None, **kw) -> dict:
    """M1/M3: a floating belt over 0.5–2 m of water, 5–20 m off the bank."""
    entry = layer("lilypad", per_ha, role="aquatic-lilypads",
                  clump_size_median=8, clump_radius_m=6.0,
                  water_depth_m=[0.4, 2.2], depth_peak_m=1.0,
                  depth_half_width_m=0.8, shore_m=[-22.0, -3.0],
                  scale_range=[0.8, 1.4], tilt_deg_max=0.0, **kw)
    if guild:
        entry["guild"] = guild
    return entry


def aquatic_kelp(species: str, per_ha: float, depth=(1.0, 6.0), peak=1.8,
                 guild: str | None = None, **kw) -> dict:
    """M1: kelp is genuinely deep — median 1.6 m of standing water."""
    entry = layer(species, per_ha, role="aquatic-kelp",
                  clump_size_median=7, clump_radius_m=7.0,
                  water_depth_m=list(depth), depth_peak_m=peak,
                  depth_half_width_m=2.0, scale_range=[0.8, 1.3], **kw)
    if guild:
        entry["guild"] = guild
    return entry


def drowned_thicket_guild(species: str, per_ha: float) -> dict:
    """M3's third pool theme: land plants standing IN the pool."""
    return layer(species, per_ha, role="drowned-thicket", guild="drowned-thicket",
                 clump_size_median=6, clump_radius_m=6.0,
                 water_depth_m=[0.1, 1.2], depth_peak_m=0.5,
                 depth_half_width_m=0.7, shore_m=[-20.0, 0.0],
                 scale_range=[0.8, 1.4])


def root_cluster(species: str, per_ha: float, depth=(-3.0, 1.2)) -> dict:
    """Ecology §4.2: knees/roots cluster tightly around big swamp trunks —
    high clump counts at small radius approximate 15–25 per tree."""
    return layer(species, per_ha, tier="T1", role="root",
                 clump_size_median=7, clump_radius_m=4.5, singleton_share=0.05,
                 water_depth_m=list(depth), slope_deg_max=35.0,
                 scale_range=[1.1, 2.4], clearance_radius_m=1.2)


def epiphyte_moss(species: str, per_ha: float, depth=(-99.0, 1.0)) -> dict:
    """Hanging moss/epiphyte dressing rides where the big trees are (same
    gates), clumped so trunks read dressed rather than the air."""
    return layer(species, per_ha, role="epiphyte",
                 clump_size_median=5, clump_radius_m=6.0,
                 water_depth_m=list(depth), slope_deg_max=38.0,
                 scale_range=[0.9, 1.6])


# ---------------------------------------------------------------------------
# The thirteen regions. Densities are the ecology §7.1 targets adapted to the
# region's landscape type; where a region mixes types the hectare mean is
# lower than the type column because bands/gates confine layers to their part.
# ---------------------------------------------------------------------------

REGIONS: dict[int, dict] = {}

REGIONS[13] = {
    "id": "tropical-jungle",
    "note": "Ecology type 1 (terra firme interior). Canopy 90-95% closed from"
            " ~205 canopy assets/ha; interior deliberately open at eye level"
            " (§6.5) — the thickets live in gaps, on edges and along banks."
            " Herb layer is the T3 ring (JUNGLE cover, 15,500/ha).",
    "layers": [
        landmark_giant("jungle_tree_hero", 0.12, depth=(-99.0, 0.6), slope_max=34.0),
        emergent("jungle_tree_hero", 6.0),
        canopy("jungle_tree_hero", 75.0, riparian=RIPARIAN_WET,
               scale=(0.7, 1.1), clump_size_median=5, clump_radius_m=15.0),
        canopy("jungle_tree", 85.0, riparian=RIPARIAN_WET, scale=(0.65, 1.0)),
        canopy("palm_a", 45.0, scale=(0.5, 0.8), clearance=1.4),
        understory("bamboo", 45.0, scale=(0.9, 1.6), clump_size_median=9,
                   clump_radius_m=5.0),
        understory("trop_plant", 50.0, scale=(0.7, 1.2)),
        understory("manfern", 40.0, scale=(0.6, 1.0)),
        understory("fern_big", 55.0, scale=(0.7, 1.3)),
        interior_shrub("bracken", 45.0),
        gap_thicket("trop_shrub", 190.0),
        gap_thicket("bracken", 120.0),
        green_wall("trop_shrub", 130.0),
        bank_wall("big_shrub", 150.0, shore=(0.0, 15.0)),
        layer("vines_a", 40.0, role="liana", clump_size_median=4,
              clump_radius_m=8.0, water_depth_m=[-99.0, WADE],
              slope_deg_max=36.0, scale_range=[0.9, 1.6]),
        layer("vines_b", 35.0, role="liana", clump_size_median=4,
              clump_radius_m=8.0, water_depth_m=[-99.0, WADE],
              slope_deg_max=36.0, scale_range=[0.9, 1.6]),
        epiphyte_moss("moss_b", 40.0),
        aquatic_reeds(60.0),
        aquatic_lilypads(30.0),
    ],
}

REGIONS[7] = {
    "id": "interior-swamp",
    "note": "Ecology type 2 (flooded forest) on the reference watershed:"
            " wading cypress matrix, waterline mangrove, bimodal drowned"
            " cypress, pool guilds. T3: SWAMP_GRASS/MARSH_GRASS covers.",
    "layers": [
        landmark_giant("cypress_big", 0.12, depth=(-99.0, 1.0)),
        emergent("cypress_big", 4.0, depth=(-99.0, 1.0)),
        canopy("cypress_big", 70.0, depth=(-99.0, 1.0), riparian=RIPARIAN_WET,
               scale=(0.6, 0.95), clump_radius_m=16.0),
        canopy("cypress", 55.0, depth=(-99.0, 0.8), riparian=RIPARIAN_WET,
               scale=(0.6, 0.95)),
        waterline_tree("mangrove_b", 30.0),
        *drowned_tree("cypress", 22.0),
        canopy("willow_a", 12.0, depth=(-2.0, 0.5), scale=(0.6, 0.9),
               slope_max=28.0),
        understory("trop_plant", 55.0, depth=(-99.0, 0.6), riparian=RIPARIAN_WET),
        understory("fern_big", 65.0, depth=(-99.0, 0.5), riparian=RIPARIAN_WET),
        interior_shrub("bracken", 55.0, depth=(-99.0, 0.4)),
        gap_thicket("big_shrub", 150.0, depth=(-99.0, 0.3)),
        green_wall("bracken", 100.0, depth=(-99.0, 0.4)),
        bank_wall("big_shrub", 120.0),
        layer("vines_a", 30.0, role="liana", clump_size_median=3,
              clump_radius_m=8.0, water_depth_m=[-99.0, 0.8],
              slope_deg_max=35.0, scale_range=[0.9, 1.5]),
        epiphyte_moss("moss_a", 45.0),
        aquatic_reeds(90.0, guild="reed-bed"),
        aquatic_lilypads(70.0, guild="lilypad-pond"),
        drowned_thicket_guild("bracken", 60.0),
        aquatic_kelp("wkelp_short", 30.0, depth=(0.6, 4.0), peak=1.5),
    ],
}

REGIONS[6] = {
    "id": "rootland-deep-marsh",
    "note": "Ecology type 4 (dark deep swamp): few HUGE buttressed trunks,"
            " root-dominated ground, almost bare floor (§4.3 — herbs <5%),"
            " moss on everything. Identity from mass and dark, not clutter."
            " T3: MOSS/BC_MOSS covers only.",
    "layers": [
        landmark_giant("cypress_big", 0.15, depth=(-3.0, 1.0)),
        emergent("cypress_big", 10.0, depth=(-99.0, 1.0)),
        canopy("cypress_big", 110.0, depth=(-99.0, 1.0), riparian=RIPARIAN_WET,
               scale=(0.75, 1.15), clump_radius_m=15.0, clearance=2.2),
        canopy("cypress", 45.0, depth=(-99.0, 0.8), scale=(0.7, 1.0)),
        root_cluster("root_a", 90.0),
        root_cluster("root_b", 80.0, depth=(-3.0, 1.2)),
        understory("trop_plant", 30.0, depth=(-99.0, 0.6), scale=(0.6, 1.0)),
        interior_shrub("fern_big", 40.0, depth=(-99.0, 0.5)),
        layer("shroom", 35.0, role="fungal-floor", clump_size_median=4,
              clump_radius_m=5.0, water_depth_m=[-2.0, 0.3],
              slope_deg_max=30.0, scale_range=[0.7, 1.5]),
        epiphyte_moss("moss_a", 90.0, depth=(-3.0, 0.8)),
        epiphyte_moss("moss_b", 70.0, depth=(-3.0, 0.8)),
        layer("vines_a", 35.0, role="liana", clump_size_median=4,
              clump_radius_m=7.0, water_depth_m=[-3.0, 0.8],
              slope_deg_max=35.0, scale_range=[1.0, 1.8]),
        aquatic_reeds(70.0, guild="reed-bed"),
        aquatic_lilypads(50.0, guild="lilypad-pond"),
        drowned_thicket_guild("fern_big", 45.0),
    ],
}

REGIONS[4] = {
    "id": "coastal-lagoon-salt-marsh",
    "note": "Ecology type 3: mangrove banding by shore distance (fringe"
            " densest at the waterline, basin behind, landward palms), salt"
            " pans bare by land cover. T3: salt-marsh grass covers.",
    "layers": [
        waterline_tree("mangrove_a", 130.0, scale=(0.8, 1.3),
                       shore_m=[-12.0, 6.0]),
        waterline_tree("mangrove_b", 90.0, scale=(0.75, 1.2),
                       shore_m=[-10.0, 8.0]),
        layer("mangrove_a", 70.0, tier="T1", role="basin-mangrove",
              clump_size_median=5, clump_radius_m=9.0,
              water_depth_m=[-1.2, 1.0], shore_m=[5.0, 45.0],
              scale_range=[0.6, 0.95], clearance_radius_m=1.6),
        canopy("palm_b", 25.0, depth=(-6.0, -0.2), scale=(0.55, 0.85),
               slope_max=28.0, clearance=1.5),
        canopy("fanpalm", 30.0, depth=(-6.0, -0.1), scale=(0.7, 1.2)),
        understory("trop_shrub", 45.0, depth=(-6.0, 0.2)),
        aquatic_reeds(160.0),
        aquatic_kelp("wkelp_tall", 60.0, depth=(0.8, 6.0), peak=2.0),
        aquatic_kelp("kelp_tall", 30.0, depth=(1.2, 7.0), peak=2.5),
    ],
}

REGIONS[3] = {
    "id": "tidal-delta",
    "note": "Reedier, muddier cousin of the lagoon: mangrove lines the"
            " channels, reeds carry the flats.",
    "layers": [
        waterline_tree("mangrove_b", 90.0, shore_m=[-12.0, 8.0]),
        layer("mangrove_a", 40.0, tier="T1", role="basin-mangrove",
              clump_size_median=5, clump_radius_m=9.0,
              water_depth_m=[-1.0, 1.2], shore_m=[5.0, 40.0],
              scale_range=[0.6, 0.9], clearance_radius_m=1.6),
        understory("trop_plant", 35.0, depth=(-4.0, 0.5), riparian=RIPARIAN_WET),
        aquatic_reeds(220.0),
        aquatic_lilypads(60.0),
        aquatic_kelp("wkelp_short", 40.0, depth=(0.6, 4.0), peak=1.4),
    ],
}

REGIONS[5] = {
    "id": "deep-river-corridor",
    "note": "A moving-water gallery: cypress walls on the banks (riparian"
            " boost), aquatics in the margins, open channel kept open.",
    "layers": [
        landmark_giant("cypress_big", 0.08, depth=(-99.0, 0.6)),
        canopy("cypress", 60.0, depth=(-99.0, 0.6), riparian=RIPARIAN_WET,
               scale=(0.6, 0.95)),
        canopy("cypress_big", 35.0, depth=(-99.0, 0.6), riparian=RIPARIAN_WET,
               scale=(0.65, 1.0)),
        waterline_tree("willow_a", 20.0, scale=(0.6, 0.9)),
        understory("trop_plant", 45.0, depth=(-99.0, 0.5), riparian=RIPARIAN_WET),
        understory("fern_big", 50.0, depth=(-99.0, 0.4), riparian=RIPARIAN_WET),
        bank_wall("big_shrub", 130.0),
        aquatic_reeds(120.0),
        aquatic_lilypads(45.0),
        aquatic_kelp("kelp_tall", 45.0, depth=(1.0, 8.0), peak=2.5),
    ],
}

REGIONS[8] = {
    "id": "fringe-marsh",
    "note": "Canopy 0.3 — genuinely open (the band the player crosses)."
            " Reed flats, scattered trees, thickets only at the water.",
    "layers": [
        landmark_giant("cypress", 0.06, depth=(-3.0, 0.6)),
        canopy("cypress", 20.0, depth=(-99.0, 0.6), riparian=RIPARIAN_WET,
               scale=(0.6, 0.9), clump_radius_m=18.0),
        waterline_tree("willow_b", 12.0, scale=(0.6, 0.9)),
        understory("loebush", 40.0, depth=(-99.0, 0.2)),
        understory("fern", 50.0, depth=(-99.0, 0.4), riparian=RIPARIAN_WET),
        bank_wall("loebush", 90.0),
        aquatic_reeds(200.0, guild="reed-bed"),
        aquatic_lilypads(50.0, guild="lilypad-pond"),
        drowned_thicket_guild("fern", 40.0),
    ],
}

REGIONS[9] = {
    "id": "seasonal-floodplain",
    "note": "Ecology 5c-adjacent: open grass (T3 carries it) + gallery"
            " ribbons along the channels with an abrupt outer edge (§6.1)."
            " The flood takes free-standing trees; the ribbon survives.",
    "layers": [
        gallery("willow_c", 70.0, shore=(0.0, 30.0)),
        gallery("cypress", 40.0, shore=(0.0, 25.0)),
        bank_wall("loebush", 80.0, shore=(0.0, 18.0)),
        understory("fern", 30.0, depth=(-99.0, 0.4), riparian=RIPARIAN_WET),
        layer("algrass", 55.0, role="tall-grass", clump_size_median=8,
              clump_radius_m=8.0, water_depth_m=[-99.0, 0.5],
              slope_deg_max=32.0, scale_range=[0.8, 1.4]),
        layer("chickweed", 40.0, role="forb", clump_size_median=8,
              clump_radius_m=7.0, water_depth_m=[-99.0, 0.4],
              slope_deg_max=32.0, scale_range=[0.9, 1.5]),
        aquatic_reeds(60.0),
    ],
}

REGIONS[10] = {
    "id": "raised-hammock",
    "note": "Tree islands: dry crest palms/bamboo over a marsh skirt that"
            " wades (M1). The crest/skirt split is the depth gate.",
    "layers": [
        canopy("palm_c", 45.0, depth=(-8.0, -0.2), scale=(0.55, 0.85),
               slope_max=30.0, clearance=1.5),
        canopy("fanpalm", 60.0, depth=(-8.0, -0.1), scale=(0.7, 1.2)),
        understory("bamboo", 80.0, depth=(-6.0, 0.2), scale=(0.9, 1.6),
                   clump_size_median=9, clump_radius_m=5.0),
        interior_shrub("bracken", 60.0, depth=(-6.0, 0.3)),
        gap_thicket("trop_shrub", 120.0, depth=(-6.0, 0.2)),
        aquatic_reeds(90.0),
    ],
}

REGIONS[11] = {
    "id": "firm-lowland",
    "note": "The drier ground BETWEEN waterways — still swamp-forest to the"
            " eye (owner 0036 Q4 reading), just with dry feet: jungle canopy"
            " at ~60% of the jungle target, bamboo brakes, gallery thickening"
            " along whatever water crosses it.",
    "layers": [
        landmark_giant("jungle_tree_hero", 0.06, depth=(-99.0, 0.2)),
        emergent("jungle_tree", 3.0),
        canopy("jungle_tree", 70.0, riparian=RIPARIAN_WET, scale=(0.65, 1.0)),
        canopy("jungle_tree_hero", 40.0, scale=(0.7, 1.05)),
        understory("bamboo", 55.0, scale=(0.9, 1.6), clump_size_median=8,
                   clump_radius_m=5.5),
        understory("trop_plant", 45.0),
        interior_shrub("bracken", 50.0),
        gap_thicket("trop_shrub", 140.0),
        green_wall("trop_shrub", 90.0),
        bank_wall("big_shrub", 110.0),
        layer("chickweed", 35.0, role="forb", clump_size_median=7,
              clump_radius_m=7.0, water_depth_m=[-99.0, 0.3],
              slope_deg_max=36.0, scale_range=[0.9, 1.5]),
        epiphyte_moss("moss_b", 25.0),
    ],
}

REGIONS[12] = {
    "id": "lake-and-standing-water",
    "note": "Open water: guild-themed aquatics near the shore, deep centre"
            " bare, drowned trees for silhouettes (M1 bimodal, deep mode).",
    "layers": [
        aquatic_lilypads(90.0, guild="lilypad-pond"),
        aquatic_reeds(130.0, guild="reed-bed"),
        aquatic_kelp("kelp_tall", 70.0, depth=(1.0, 9.0), peak=3.0,
                     guild="kelp-forest"),
        layer("cypress_big", 6.0, tier="T1", role="drowned-tree",
              clump_size_median=2, clump_radius_m=12.0,
              water_depth_m=[0.8, 3.5], depth_peak_m=2.2,
              depth_half_width_m=1.2, slope_deg_max=26.0,
              scale_range=[0.6, 0.95], clearance_radius_m=4.0),
    ],
}

REGIONS[2] = {
    "id": "upland-hills",
    "note": "Ecology 5a/5b mix: cedar hill forest in stands (high"
            " patchiness), thin-stem scrub between, grass via T3; rivers run"
            " OPEN (M2 inverted) but carry gallery ribbons where the land is"
            " otherwise bare.",
    "layers": [
        # The sculpted uplands are STEEP (median ~29 deg, p90 ~50): montane
        # forest really does cover such slopes (ecology 5a), so the slope
        # tolerance here is high and only crags/scars stay bare.
        canopy("cedar", 70.0, depth=(-99.0, -0.3), scale=(0.7, 1.0),
               slope_max=48.0, riparian=RIPARIAN_DRY, patchiness=1.3,
               clearance=1.5, slope_half_angle_deg=35.0),
        understory("fall_shrub", 100.0, depth=(-99.0, -0.2),
                   riparian=RIPARIAN_DRY, scale=(0.8, 1.3),
                   slope_deg_max=52.0, slope_half_angle_deg=35.0),
        gap_thicket("fall_shrub", 110.0, depth=(-99.0, -0.2),
                    slope_deg_max=50.0),
        gallery("willow_a", 50.0, shore=(0.0, 25.0)),
        layer("algrass", 70.0, role="tall-grass", clump_size_median=6,
              clump_radius_m=7.0, water_depth_m=[-99.0, 0.1],
              slope_deg_max=50.0, slope_half_angle_deg=35.0,
              scale_range=[0.8, 1.4]),
        layer("moss_rock", 30.0, role="rock", clump_size_median=3,
              clump_radius_m=8.0, water_depth_m=[-99.0, -0.5],
              slope_deg_max=55.0, scale_range=[0.6, 1.3]),
    ],
}

REGIONS[1] = {
    "id": "border-mountains",
    "note": "The sparse, dry proof (owner 0036 Q3): juniper scrub thinning"
            " with altitude, bare rock carrying the view. Trees stop at the"
            " high altitude band; scrub climbs a little further.",
    "layers": [
        canopy("juniper", 32.0, depth=(-99.0, -0.5), scale=(0.7, 1.1),
               slope_max=50.0, altitude_m=[0.0, 420.0], clearance=1.5,
               riparian=RIPARIAN_DRY, slope_half_angle_deg=35.0),
        canopy("cedar", 15.0, depth=(-99.0, -0.5), scale=(0.6, 0.9),
               slope_max=38.0, altitude_m=[0.0, 300.0], clearance=1.6,
               riparian=RIPARIAN_DRY, patchiness=1.3),
        understory("fall_shrub", 45.0, depth=(-99.0, -0.3),
                   altitude_m=[0.0, 480.0], scale=(0.7, 1.2)),
        layer("moss_rock", 55.0, role="rock", clump_size_median=3,
              clump_radius_m=8.0, water_depth_m=[-99.0, -0.5],
              slope_deg_max=60.0, scale_range=[0.6, 1.3]),
    ],
}


def build() -> dict:
    total = {}
    for region, spec in sorted(REGIONS.items()):
        per_ha = sum(l["instances_per_hectare"] for l in spec["layers"])
        entry = {"id": spec["id"], "layers": spec["layers"],
                 "targetInstancesPerHectare": round(per_ha, 1)}
        if "note" in spec:
            entry["note"] = spec["note"]
        total[str(region)] = entry
    return {
        "id": "argonia-flora-v2",
        "status": "EVIDENCE-BASED v2 (Phase 10 round 2) — generated by "
                  "worldgen/build_palettes.py; edit THAT, then re-run it. "
                  "Structure and densities from the three research docs; "
                  "owner decisions 0036 Q1-Q4 still bind (landmark giants, "
                  "five exemplar areas, region rebalance).",
        "grounding": {
            "ecology": "docs/research/tropical-vegetation-ecology-targets.md "
                       "§7 — per-landscape strata targets and spatial rules",
            "microSiting": "docs/research/mod-vegetation-micro-siting.md — "
                           "M1 four water postures, M2 signed riparian, M3 "
                           "pool guilds, M5 groundcover carries the look",
            "architecture": "docs/research/openworld-vegetation-placement-"
                            "architecture.md — macro/meso/micro layering",
            "canonFlora": "world/sources/lore/topics/fauna-hazards.md § Flora",
            "regionClasses": "tooling/world-generation/worldgen/regions.py",
        },
        "conventions": {
            "generator": "worldgen/build_palettes.py — the archetypes "
                         "(strata, water postures, walls, guilds) encode the "
                         "evidence once; regions read like the ecology table",
            "water_depth_m": "standing water over ground; negative is height "
                             "above the local water table. Dry-tolerant "
                             "species gate [-99, +0.35]: the WADING rule (M1)"
                             " — never re-tighten to a water-table band, that "
                             "was the v1 sparse-jungle defect",
            "shore_m": "signed distance to the water's edge (+ land, − "
                       "water): reed belts, bank walls, mangrove banding, "
                       "gallery ribbons",
            "glade_band": "band on the shared openness field: interior "
                          "shrubs low end, green walls mid, gap thickets "
                          "high end",
            "guild": "per ~220 m tile, one water guild (M3): lilypad-pond / "
                     "reed-bed / drowned-thicket / kelp-forest",
            "tier": "T1 hero statics, T2 instanced mid. Herb layer is "
                    "groundcover.json (T3 ring) — most of the 'dense' read "
                    "lives THERE (M5), not here",
            "densityScale": "global multiplier, owner's one knob",
        },
        "byRegionClass": total,
        "densityScale": 1.0,
    }


def main() -> None:
    data = build()
    OUT.write_text(json.dumps(data, indent=1) + "\n")
    layers = sum(len(e["layers"]) for e in data["byRegionClass"].values())
    print(f"wrote {OUT} — {len(data['byRegionClass'])} regions, {layers} layers")
    for region, entry in data["byRegionClass"].items():
        print(f"  {region:>2} {entry['id']:28s} "
              f"{entry['targetInstancesPerHectare']:7.1f}/ha authored")


if __name__ == "__main__":
    main()
