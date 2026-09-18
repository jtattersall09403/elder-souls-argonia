"""The sea bed: what stands on it, where, and how thickly (16f, 2026-09-18).

The owner's walk found the sea bed bare nearly everywhere, and what it did
carry reading as "large flat horizontal 2D squares jumbled on top of each
other". These are the checks that keep both halves fixed: no card fans, real
dressing province-wide, densest inshore, and `ocean` meaning `ocean`.
"""

import json
from pathlib import Path

from . import rock_dressing as rd
from .compile_scatter import floor_submerged_depths

PALETTES = (Path(__file__).resolve().parents[3] / "world" / "sources" / "flora"
            / "palettes.json")

#: The three card fans and the three walkable ruin floors. A palette layer may
#: never place any of them: the fans are flat, and a floor is a place's own
#: geometry (Lilmoth's drowned quarter places them by hand, which is why they
#: stay in the KIT).
BANNED = (
    "depths:dos/misc/tbp_coralbig",
    "depths:dos/misc/tbp_coralmedium",
    "depths:landscape/grass/tbp_coralsmall01",
    "sirenroot:creationclub/_shared/dungeons/ayleidruins/evgruinsset/"
    "aruniquerubblewalkablefl01",
    "sirenroot:creationclub/_shared/dungeons/ayleidruins/evgruinsset/"
    "aruniquerubblewalkablefl03",
    "sirenroot:creationclub/_shared/dungeons/ayleidruins/evgruinsset/"
    "aruniquerubblewalkablefl05",
)


def _layers():
    doc = json.loads(PALETTES.read_text(encoding="utf-8"))
    for key, spec in doc["byRegionClass"].items():
        for layer in spec["layers"]:
            yield key, layer


def _seabed_layers():
    return [(k, l) for k, l in _layers()
            if "SEABED:" in (l.get("note") or "")]


def test_the_seabed_band_exists_and_is_ocean_only():
    """"Sea" is the record's word `ocean`. A lagoon or a tidal marsh reach at
    sea level is not sea and gets no sea bed (decision 0065)."""
    rows = _seabed_layers()
    assert rows, "no sea-bed layer in the shipped palette"
    for key, layer in rows:
        assert layer.get("water_kinds") == ["ocean"], (key, layer["species"],
                                                       layer.get("water_kinds"))
        assert layer.get("season_kinds") == ["perennial"], layer["species"]


def test_no_palette_layer_places_a_card_fan_or_a_walkable_floor():
    placed = {l["species"] for _, l in _layers()}
    assert not placed & set(BANNED), sorted(placed & set(BANNED))


def test_the_shoreline_ramp_is_dense_inshore_and_thin_offshore():
    """1.0 within ~150 m of the coast, 0.4 at 500 m, 0.2 far out.

    The distances are measured AT SEA, where `coast_m` is negative, so the
    ramp has to read the magnitude. It used to clamp at zero, which made
    every sea texel read 0 m from the shore and took the full boost: the
    ramp was inert and the whole bed ran at its shoreline density.
    """
    assert rd.seabed_ramp_factor(0.0) > 0.99
    assert rd.seabed_ramp_factor(100.0) >= 0.9
    assert rd.seabed_ramp_factor(500.0) <= 0.45
    assert abs(rd.seabed_ramp_factor(500.0) - 0.4) < 0.02
    assert rd.seabed_ramp_factor(1000.0) <= 0.25
    assert abs(rd.seabed_ramp_factor(5000.0) - rd.SEABED_RAMP_FLOOR) < 0.001
    # The sea side reads the same as the land side at the same distance.
    for m in (100.0, 150.0, 500.0, 1000.0):
        assert rd.seabed_ramp_factor(-m) == rd.seabed_ramp_factor(m)
    # ...and every sea-bed layer is actually wired to it.
    for key, layer in _seabed_layers():
        assert layer.get("coast_boost_gain") == rd.SEABED_RAMP["coast_boost_gain"]
        assert layer.get("coast_half_width_m") == rd.SEABED_RAMP["coast_half_width_m"]


def test_the_sampler_bell_is_symmetric_about_the_shoreline():
    """`Layer.coast_factor` is what realises the ramp in the scatter, so the
    shape asserted above has to be the shape the sampler computes."""
    from .scatter import Layer
    layer = Layer(species="x", **rd.SEABED_RAMP)
    for m in (0.0, 100.0, 425.0, 1000.0):
        assert abs(layer.coast_factor(-m) - layer.coast_factor(m)) < 1e-9
    assert layer.coast_factor(-1000.0) < 0.25 * layer.coast_factor(0.0)


def test_every_seabed_coast_gate_is_on_the_sea_side():
    """`coast_m` is SIGNED distance to the ocean - positive inland, negative
    at sea (scatter.py `Fields.coast`). A sea-bed layer gated to a positive
    range is gated to dry land and places nothing, which is exactly how
    starfish and driftwood came out at 0 and 18 instances province-wide."""
    gated = [(k, l) for k, l in _seabed_layers() if l.get("coast_m")]
    assert gated, "no sea-bed layer carries a coast_m gate"
    for key, layer in gated:
        lo, hi = layer["coast_m"]
        assert hi <= 0.0, (key, layer["species"], layer["coast_m"])
        assert lo < hi, (key, layer["species"], layer["coast_m"])


def test_the_reef_is_banded_by_depth_and_distance_not_by_a_land_cover():
    """Coral used to be gated to the surf covers (BC_ROCK, PEBBLES,
    MOSSY_ROCK). The bake never paints those under the sea - it paints
    OCEAN_FLOOR, SEABED_SAND and SILT - so the gate placed 0 coral in all 256
    chunks. What bands a reef now is the depth window and `coast_m`."""
    coral = [l for _, l in _seabed_layers() if l.get("role") == "seabed-coral"]
    assert coral, "no coral layer"
    for layer in coral:
        assert not layer.get("land_cover"), layer["species"]
        assert layer["water_depth_m"] == [2.0, 12.0], layer["species"]
        assert layer["coast_m"][1] <= 0.0 and layer["coast_m"][0] >= -600.0
        assert layer["clump_size_median"] >= 8 and layer["singleton_share"] <= 0.05


def test_an_encrusting_layer_is_never_gated_to_a_cover_the_sea_bed_lacks():
    """Measured on the shipped ground-control raster over 158,227 ocean texels
    of 0.3-6 m depth: OCEAN_FLOOR 80.3 %, SEABED_SAND 17.6 %, SILT 2.0 %,
    DIRT_CLIFF 0.08 %, MOUNTAIN_ROCK 0.04 %. Barnacles carry either no cover
    gate at all, or one naming a cover that exists down there - never the dry
    surf covers, which placed 0 clusters province-wide."""
    from . import landcover as lc
    under_the_sea = {lc.OCEAN_FLOOR, lc.SEABED_SAND, lc.SILT, lc.DIRT_CLIFF,
                     lc.MOUNTAIN_ROCK}
    rows = [l for _, l in _seabed_layers() if "barnacle" in l["species"]]
    assert rows, "no barnacle layer"
    for layer in rows:
        covers = set(layer.get("land_cover") or [])
        assert not covers or covers <= under_the_sea, layer["species"]


def test_every_depths_species_band_quotes_the_committed_mine():
    """The ledger's old figures lived only as prose. Any Depths species in the
    band now quotes `depths-underwater-placement.json`, or says it has no
    mined row - never a number with no record behind it."""
    rows = [(k, l) for k, l in _seabed_layers()
            if l["species"].startswith("depths:")]
    assert rows, "no Depths species in the sea-bed band"
    for key, layer in rows:
        note = layer["note"]
        assert ("mined n=" in note
                or "no mined row in depths-underwater-placement.json" in note), \
            (key, layer["species"], note)


def test_the_borrowed_rock_figures_say_they_are_borrowed():
    """Shores of Skyrim's rocks were never placed in a shipped worldspace, so
    their mined figures are the mean of the three `rocks0*wet` rows."""
    rows = [l for _, l in _seabed_layers() if l["species"] in rd.SHORE_ROCKS]
    assert {l["species"] for l in rows} == set(rd.SHORE_ROCKS)
    for layer in rows:
        assert "BORROWED" in layer["note"], layer["species"]


def test_the_submerged_floor_measures_the_top_above_the_bed():
    """`waterkelptall02` and `waterkelptall03` are byte-identical 3.983 m
    meshes with pivots 0.090 and 0.801. The scatter seats a piece by its
    pivot, so their depth floors must differ by 0.711 x the max scale; on the
    old whole-bounding-box measure they were identical."""
    data = {"byRegionClass": {"0": {"layers": [
        {"role": "aquatic-kelp", "species": "depths:landscape/grass/waterkelptall02",
         "water_depth_m": [0.8, 6.0], "scale_range": [0.8, 1.3]},
        {"role": "aquatic-kelp", "species": "depths:landscape/grass/waterkelptall03",
         "water_depth_m": [0.8, 6.0], "scale_range": [0.8, 1.3]},
    ]}}}
    floor_submerged_depths(data)
    floors = [l["water_depth_m"][0] for l in data["byRegionClass"]["0"]["layers"]]
    assert floors == [5.06, 4.14], floors
    assert round(floors[0] - floors[1], 2) == 0.92


def test_flat_lying_dressing_is_not_depth_floored():
    """Pebbles, shells, starfish, sponges and stone lie flat on the bed: they
    read correctly in any depth the band admits, so the floor must leave them
    alone or a 0.3 m band would be pushed off the shallows for nothing."""
    from .compile_scatter import SUBMERGED_ROLES
    flat = {"seabed-pebbles", "seabed-shells", "seabed-starfish",
            "seabed-sponge", "wet-rock"}
    assert not flat & SUBMERGED_ROLES
    for _, layer in _seabed_layers():
        if layer.get("role") in flat:
            assert layer["water_depth_m"][0] <= 2.0, layer["species"]
