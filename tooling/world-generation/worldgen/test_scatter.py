import math

import pytest

from .scatter import (
    Fields,
    Instance,
    Layer,
    Palette,
    clark_evans,
    decode,
    depth_response,
    encode,
    hash64,
    scatter_chunk,
    slope_response,
    uniform,
)


def flat_fields(depth=0.0, slope=0.0, region=7, cover=0):
    return Fields(
        height=lambda x, z: 0.0,
        water_depth=lambda x, z: depth,
        slope=lambda x, z: slope,
        region=lambda x, z: region,
        land_cover=lambda x, z: cover,
    )


def test_hash_is_stable_and_order_sensitive():
    assert hash64(1, 2, 3) == hash64(1, 2, 3)
    assert hash64(1, 2, 3) != hash64(3, 2, 1)
    assert 0.0 <= uniform(7, 11) < 1.0


def test_slope_response_halves_then_floors_then_cuts_off():
    assert slope_response(0.0) == 1.0
    assert slope_response(12.0) == pytest.approx(0.5)
    assert slope_response(24.0) == pytest.approx(0.25)
    assert slope_response(50.0) == 0.2          # floor, not zero
    assert slope_response(60.0) == 0.0          # hard cut-off


def test_depth_response_peaks_where_the_species_wants_water():
    assert depth_response(0.0) == pytest.approx(1.0)
    assert depth_response(2.0) < 0.4
    # An open-water species peaks in the shallows instead.
    assert depth_response(1.0, peak_m=1.0) == pytest.approx(1.0)


def test_scatter_is_byte_identical_for_the_same_seed():
    palette = Palette("p", [Layer(species="reed", instances_per_hectare=40)])
    fields = flat_fields()
    a = scatter_chunk(0, 0, 100, palette, fields, seed=99)
    b = scatter_chunk(0, 0, 100, palette, fields, seed=99)
    assert encode(a, ["reed"]) == encode(b, ["reed"])
    c = scatter_chunk(0, 0, 100, palette, fields, seed=100)
    assert encode(c, ["reed"]) != encode(a, ["reed"])


def test_every_instance_lands_inside_the_chunk():
    palette = Palette("p", [Layer(species="reed", instances_per_hectare=60,
                                  clump_radius_m=25.0, singleton_share=0.0)])
    got = scatter_chunk(500.0, -300.0, 120.0, palette, flat_fields(), seed=3)
    assert got
    for instance in got:
        assert 500.0 <= instance.x < 620.0
        assert -300.0 <= instance.z < -180.0


def test_output_is_clustered_the_way_hand_placement_is():
    """The rule this compiler exists to satisfy (research R1)."""
    size = 400.0
    for median, radius in ((3, 6.0), (6, 8.0), (10, 9.6)):
        palette = Palette("p", [Layer(
            species="fern", instances_per_hectare=30,
            clump_size_median=median, clump_radius_m=radius,
        )])
        points = [(i.x, i.z) for i in
                  scatter_chunk(0, 0, size, palette, flat_fields(), seed=11)]
        assert len(points) > 150
        r = clark_evans(points, size * size)
        assert 0.3 <= r <= 0.7, (
            f"Clark-Evans {r:.2f} at median {median}: the mined worlds sit at "
            "0.43-0.49 and a jittered grid scores above 1.0. Patchiness pushes "
            "this a little lower than clumping alone, which is why the band is "
            "wider than the mined spread."
        )


def test_a_gate_that_rejects_the_region_places_nothing():
    palette = Palette("p", [Layer(species="palm", region_classes=(3,),
                                  instances_per_hectare=50)])
    assert scatter_chunk(0, 0, 200, palette, flat_fields(region=7), seed=1) == []
    assert scatter_chunk(0, 0, 200, palette, flat_fields(region=3), seed=1) != []


def test_water_depth_gate_separates_the_aquatic_layer():
    aquatic = Layer(species="lilypad", water_depth_m=(0.3, 2.0),
                    depth_peak_m=1.0, instances_per_hectare=60)
    palette = Palette("p", [aquatic])
    assert scatter_chunk(0, 0, 200, palette, flat_fields(depth=-1.0), seed=5) == []
    assert scatter_chunk(0, 0, 200, palette, flat_fields(depth=1.0), seed=5) != []


def test_clearance_keeps_the_small_layer_out_of_the_big_one():
    """One-directional, big to small: a reed never grows through a hull."""
    hero = Layer(species="hut", instances_per_hectare=8, singleton_share=1.0,
                 clearance_radius_m=12.0, scale_range=(1.0, 1.0))
    small = Layer(species="reed", instances_per_hectare=400, clump_radius_m=6.0)
    fields = flat_fields()
    both = scatter_chunk(0, 0, 200, Palette("p", [hero, small]), fields, seed=7)
    huts = [(i.x, i.z) for i in both if i.species == "hut"]
    reeds = [(i.x, i.z) for i in both if i.species == "reed"]
    assert huts and reeds
    for rx, rz in reeds:
        for hx, hz in huts:
            assert math.hypot(rx - hx, rz - hz) >= 12.0 - 1e-6

    unguarded = Layer(species="reed", instances_per_hectare=400,
                      clump_radius_m=6.0, respects_clearance=False)
    free = scatter_chunk(0, 0, 200, Palette("p", [hero, unguarded]), fields, seed=7)
    assert sum(1 for i in free if i.species == "reed") > len(reeds)


def test_slope_thins_but_does_not_empty_a_hillside():
    palette = Palette("p", [Layer(species="shrub", instances_per_hectare=60,
                                  slope_deg_max=50)])
    flat = scatter_chunk(0, 0, 300, palette, flat_fields(slope=0), seed=2)
    steep = scatter_chunk(0, 0, 300, palette, flat_fields(slope=30), seed=2)
    assert 0 < len(steep) < len(flat) * 0.5


def test_encode_round_trips_through_decode():
    instances = [
        Instance("reed", "T3", 12.5, 40.25, -3.5, math.pi, 1.4, 0.02, -0.03),
        Instance("palm", "T2", 1.0, 2.0, 3.0, 0.0, 1.0, 0.0, 0.0),
    ]
    blob = encode(instances, ["reed", "palm"])
    assert blob[:4] == b"ESVG"
    groups = decode(blob)
    assert [g["count"] for g in groups] == [1, 1]
    reed = groups[0]["instances"][0]
    assert reed["x"] == pytest.approx(12.5)
    assert reed["y"] == pytest.approx(40.25)
    assert reed["z"] == pytest.approx(-3.5)
    assert reed["yaw"] == pytest.approx(math.pi, abs=0.02)
    assert reed["scale"] == pytest.approx(1.4, abs=0.01)


def test_bundle_size_stays_inside_the_budget():
    instances = [Instance("reed", "T3", float(i), 0.0, 0.0, 0.0, 1.0, 0.0, 0.0)
                 for i in range(1000)]
    blob = encode(instances, ["reed"])
    assert (len(blob) - 28) / 1000 == 16.0    # module 65: ~12-16 B/instance


def test_palette_loads_from_plain_data():
    palette = Palette.from_dict({
        "id": "marsh",
        "layers": [{"species": "reed", "region_classes": [7, 8],
                    "water_depth_m": [0.0, 1.5], "scale_range": [0.8, 1.6]}],
    })
    layer = palette.layers[0]
    assert layer.region_classes == (7, 8)
    assert layer.water_depth_m == (0.0, 1.5)
    assert layer.scale_range == (0.8, 1.6)


def test_clumps_survive_a_chunk_seam():
    """A clump straddling a chunk edge must be generated identically from both
    sides, or every seam in the province thins by half a clump radius."""
    layer = Layer(species="reed", instances_per_hectare=120,
                  clump_size_median=8, clump_radius_m=12.0)
    palette = Palette("p", [layer])
    fields = flat_fields()
    size = 200.0
    left = scatter_chunk(0.0, 0.0, size, palette, fields, seed=17)
    right = scatter_chunk(size, 0.0, size, palette, fields, seed=17)

    def density_in(instances, lo, hi):
        band = [i for i in instances if lo <= i.x < hi]
        return len(band) / ((hi - lo) * size)

    # A 24 m band either side of the seam against the two chunks' interiors.
    seam = density_in(left, size - 24, size) + density_in(right, size, size + 24)
    interior = density_in(left, 40, 88) + density_in(right, size + 40, size + 88)
    assert seam > interior * 0.6, (
        f"seam density {seam:.4f} vs interior {interior:.4f} — clumps are "
        "being clipped at the boundary instead of shared across it"
    )


def test_a_layer_keeps_its_pattern_when_the_palette_is_filtered():
    """Merged province palettes are filtered per chunk; a surviving layer's
    output must not shift because its neighbours were dropped."""
    reed = Layer(species="reed", instances_per_hectare=40, region_classes=(7,))
    palm = Layer(species="palm", instances_per_hectare=40, region_classes=(3,))
    fields = flat_fields(region=7)
    full = scatter_chunk(0, 0, 200, Palette("p", [palm, reed]), fields, seed=4)
    only = scatter_chunk(0, 0, 200, Palette("p", [reed]), fields, seed=4)
    assert [(i.x, i.z) for i in full] == [(i.x, i.z) for i in only]


def test_density_varies_across_a_landscape_as_much_as_the_source_does():
    """The owner's brief: 'even within an area there should be sensible
    variation so it's not all just samey'. The reference mod's density varies
    with a standard deviation 2.3-3.1x its mean between neighbouring cells
    (research/vegetation-density-design.md); an evenly spread scatter would be
    far flatter than that."""
    palette = Palette("p", [Layer(species="fern", instances_per_hectare=60)])
    size = 1000.0
    instances = scatter_chunk(0, 0, size, palette, flat_fields(), seed=23)
    cell = 58.0                      # the distance the mined correlation is quoted at
    counts: dict[tuple[int, int], int] = {}
    for i in instances:
        key = (int(i.x // cell), int(i.z // cell))
        counts[key] = counts.get(key, 0) + 1
    grid = int(size // cell)
    values = [counts.get((x, z), 0) for x in range(grid) for z in range(grid)]
    mean = sum(values) / len(values)
    sd = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5
    assert mean > 3
    assert sd / mean > 0.6, (
        f"coefficient of variation {sd / mean:.2f} — the scatter is too even; "
        "the source varies far more than this"
    )


def test_glades_are_shared_between_species_not_private_to_each():
    """A clearing has to be a clearing for everything, or it reads as noise
    rather than as a place. Compared against the shared field itself rather
    than species-to-species: heavy-tailed clump sizes dominate any single
    cell's count, so the mechanism is what the test has to isolate."""
    from .scatter import GLADE_WAVELENGTH_M, hash64, value_noise

    layers = [
        Layer(species="fern", instances_per_hectare=80, patchiness=0.0,
              glade_response=0.9, clump_size_median=2, clump_size_tail=0.0),
        Layer(species="palm", instances_per_hectare=80, patchiness=0.0,
              glade_response=0.9, clump_size_median=2, clump_size_tail=0.0),
    ]
    size, seed = 1200.0, 31
    got = scatter_chunk(0, 0, size, Palette("p", layers), flat_fields(), seed=seed)
    glade_salt = hash64(seed, 0x61ADE)

    open_ground, thicket = {"fern": 0, "palm": 0}, {"fern": 0, "palm": 0}
    for i in got:
        field = value_noise(glade_salt, i.x, i.z, GLADE_WAVELENGTH_M)
        if field < 0.35:
            open_ground[i.species] += 1
        elif field > 0.65:
            thicket[i.species] += 1
    for species in ("fern", "palm"):
        assert thicket[species] > open_ground[species] * 1.8, (
            f"{species}: {thicket[species]} in thickets vs "
            f"{open_ground[species]} in clearings — the shared openness field "
            "is not shaping this layer"
        )
