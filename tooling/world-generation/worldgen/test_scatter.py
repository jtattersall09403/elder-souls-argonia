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
        if len(points) >= 300:
            ratio = _bearing_peak_ratio(points)
            assert ratio < 1.5, (
                f"nearest-neighbour bearings peak at {ratio:.2f} at median "
                f"{median}: the scatter has a lattice in it. A jittered grid "
                "scores well above 2 (its neighbours sit on the axes); "
                "uniform-random sits at ~1.25 at this n.")


def _bearing_peak_ratio(points, bins: int = 16) -> float:
    """How directional the nearest-neighbour bearings are.

    A grid betrays itself here and nowhere else: Clark-Evans only measures how
    FAR the neighbour is, so a lattice of clumps passes it while every plant
    still has its neighbour due north. 16 bins over the circle; the ratio is
    the four fullest bins against four average ones, so 1.0 is perfectly
    isotropic.
    """
    counts = [0] * bins
    for x, z in points:
        best, bearing = None, 0.0
        for qx, qz in points:
            if (qx, qz) == (x, z):
                continue
            d = math.hypot(qx - x, qz - z)
            if best is None or d < best:
                best, bearing = d, math.atan2(qz - z, qx - x)
        if best is None:
            continue
        counts[int((bearing % math.tau) / math.tau * bins) % bins] += 1
    total = sum(counts)
    if not total:
        return 1.0
    return sum(sorted(counts)[-4:]) / (4 * total / bins)


def test_channel_exclusion_rejects_the_channel_and_its_bank_margin():
    """A trunk may not stand in a river, nor on its wetted bank (16f)."""
    layer = Layer(species="cypress", instances_per_hectare=200,
                  channel_exclusion=True)
    assert layer.gate(0.0, 0.0, 7, 0, channel_m=30.0, bank_margin_m=6.0)
    assert not layer.gate(0.0, 0.0, 7, 0, channel_m=3.0, bank_margin_m=6.0)
    assert not layer.gate(0.0, 0.0, 7, 0, channel_m=-4.0, bank_margin_m=6.0)
    # Off, the same position is fine — a reed belt lives exactly there.
    reeds = Layer(species="reeds", instances_per_hectare=200)
    assert reeds.gate(0.0, 0.0, 7, 0, channel_m=-4.0, bank_margin_m=6.0)

    inside = Fields(
        height=lambda x, z: 0.0, water_depth=lambda x, z: 0.0,
        slope=lambda x, z: 0.0, region=lambda x, z: 7,
        channel=lambda x, z: 1.0, bank_margin=lambda x, z: 6.0,
    )
    assert scatter_chunk(0, 0, 200, Palette("p", [layer]), inside, seed=3) == []
    assert scatter_chunk(0, 0, 200, Palette("p", [layer]), flat_fields(),
                         seed=3) != []


def test_water_kind_gate():
    """A layer gated to the record's kinds refuses every other kind."""
    kelp = Layer(species="kelp", instances_per_hectare=200,
                 water_kinds=("ocean", "lagoon"), season_kinds=("perennial",))
    assert kelp.gate(1.0, 0.0, 7, 0, water_kind="ocean", water_season="perennial")
    assert not kelp.gate(1.0, 0.0, 7, 0, water_kind="pond", water_season="perennial")
    assert not kelp.gate(1.0, 0.0, 7, 0, water_kind="ocean", water_season="seasonal")

    sea = Fields(height=lambda x, z: 0.0, water_depth=lambda x, z: 1.0,
                 slope=lambda x, z: 0.0, region=lambda x, z: 7,
                 water_kind=lambda x, z: "ocean",
                 water_season=lambda x, z: "perennial")
    pond = Fields(height=lambda x, z: 0.0, water_depth=lambda x, z: 1.0,
                  slope=lambda x, z: 0.0, region=lambda x, z: 7,
                  water_kind=lambda x, z: "pond",
                  water_season=lambda x, z: "perennial")
    assert scatter_chunk(0, 0, 200, Palette("p", [kelp]), sea, seed=5) != []
    assert scatter_chunk(0, 0, 200, Palette("p", [kelp]), pond, seed=5) == []


def test_named_water_entity_gate_matches_the_reach_or_its_river():
    layer = Layer(species="lotus", instances_per_hectare=200,
                  water_entities=("river-argonian-main",))
    assert layer.gate(0.5, 0.0, 7, 0, water_entity=("reach-0412", "river-argonian-main"))
    assert layer.gate(0.5, 0.0, 7, 0, water_entity=("river-argonian-main", ""))
    assert not layer.gate(0.5, 0.0, 7, 0, water_entity=("reach-0412", "river-other"))


def test_unknown_water_kind_raises_at_load():
    """A typo in a palette is a load error, never a layer that quietly never
    places anything."""
    good = {"id": "p", "layers": [{"species": "kelp", "water_kinds": ["ocean"]}]}
    assert Palette.from_dict(good).layers[0].water_kinds == ("ocean",)
    bad = {"id": "p", "layers": [{"species": "kelp", "water_kinds": ["lake"]}]}
    with pytest.raises(ValueError, match="kelp"):
        Palette.from_dict(bad)
    worse = {"id": "p", "layers": [{"species": "kelp", "season_kinds": ["wet"]}]}
    with pytest.raises(ValueError, match="season_kinds"):
        Palette.from_dict(worse)


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
    # v2: 12-byte file header + one 28-byte species header; 17 B/instance
    # (module 65's ~12-16 B budget +1 byte for the composition sink).
    assert (len(blob) - 12 - 28) / 1000 == 17.0


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
    (research/vegetation/vegetation-density-design.md); an evenly spread scatter would be
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


def test_altitude_gate_separates_montane_from_lowland():
    lowland = Layer(species="palm", instances_per_hectare=40,
                    altitude_m=(-999, 120))
    montane = Layer(species="juniper", instances_per_hectare=40,
                    altitude_m=(300, 9999))
    fields = flat_fields(depth=-2.0)
    fields.height = lambda x, z: 400.0
    placed = scatter_chunk(0, 0, 200, Palette("p", [lowland, montane]), fields, 7)
    assert placed and all(i.species == "juniper" for i in placed)


def test_shore_band_confines_the_reed_belt_to_the_edge():
    """The meso scene control: a species banded to the water's edge appears
    there and nowhere else, however big the chunk."""
    reed = Layer(species="reed", instances_per_hectare=200,
                 shore_m=(-6.0, 3.0))
    fields = flat_fields(depth=0.1)
    # A shoreline running down x=100: water to the left, land to the right.
    fields.shore = lambda x, z: x - 100.0
    placed = scatter_chunk(0, 0, 400, Palette("p", [reed]), fields, 7)
    assert placed
    assert all(94.0 <= i.x <= 103.0 for i in placed)


def test_shore_boost_thickens_the_bank_the_mined_2x():
    """Mined rule M2: Black Marsh density roughly doubles at the water and
    relaxes inland. The boost is soft, so both bands still place plants."""
    shrub = Layer(species="shrub", instances_per_hectare=60,
                  shore_boost_gain=1.1, shore_boost_peak_m=-2.0,
                  shore_boost_half_width_m=25.0,
                  patchiness=0.0, glade_response=0.0)
    fields = flat_fields(depth=-0.5)
    fields.shore = lambda x, z: x  # bank at x=0, inland to the right
    placed = scatter_chunk(0, 0, 400, Palette("p", [shrub]), fields, 7)
    near = sum(1 for i in placed if i.x < 40)
    # Baseline over the whole inland run, not one 40 m band — clumping makes
    # any single band noisy.
    inland = sum(1 for i in placed if 120 <= i.x < 400)
    inland_per_band = inland / 7.0
    assert near > inland_per_band * 1.4
    assert inland > 0


def test_glade_band_puts_the_edge_wall_at_the_glade_edge():
    """Green-wall species live on the openness field's mid band; the deep
    interior and the open glade centres both stay clear of them."""
    wall = Layer(species="thicket", instances_per_hectare=150,
                 glade_band=(0.55, 0.8), patchiness=0.0, glade_response=0.0)
    fields = flat_fields(depth=-1.0)
    placed = scatter_chunk(0, 0, 468, Palette("p", [wall]), fields, 7)
    open_everywhere = Layer(species="thicket", instances_per_hectare=150,
                            patchiness=0.0, glade_response=0.0)
    everywhere = scatter_chunk(0, 0, 468, Palette("p", [open_everywhere]), fields, 7)
    # The band admits only part of the landscape, so the banded layer places
    # fewer — and both place something (the band is not degenerate).
    assert 0 < len(placed) < len(everywhere)


def test_water_guilds_theme_by_place_and_never_mix():
    """Rule M3: pools are matrix + ONE guild. Layers with different guild
    names in the same region never share a ~110 m neighbourhood."""
    lily = Layer(species="lilypad", instances_per_hectare=120, guild="lilypad",
                 patchiness=0.0, glade_response=0.0)
    reed = Layer(species="reed", instances_per_hectare=120, guild="reed-bed",
                 patchiness=0.0, glade_response=0.0)
    fields = flat_fields(depth=1.0)
    placed = scatter_chunk(0, 0, 936, Palette("p", [lily, reed]), fields, 7)
    assert {i.species for i in placed} == {"lilypad", "reed"}
    # Guild identity is per 220 m tile: away from tile borders (> one clump
    # radius in), a tile holds exactly one guild.
    tiles: dict[tuple[int, int], set] = {}
    for i in placed:
        bx, bz = i.x % 220.0, i.z % 220.0
        if 15.0 < bx < 205.0 and 15.0 < bz < 205.0:
            tiles.setdefault((int(i.x // 220), int(i.z // 220)), set()).add(i.species)
    assert tiles
    assert all(len(kinds) == 1 for kinds in tiles.values())


# --- slope alignment (Phase 10 round 5, A2) ----------------------------------


def _ramp_fields(grade):
    """A plane falling toward +X at `grade` (rise over run)."""
    return Fields(
        height=lambda x, z: -grade * x,
        water_depth=lambda x, z: -5.0,
        slope=lambda x, z: math.degrees(math.atan(grade)),
        region=lambda x, z: 2,
    )


def test_terrain_aim_points_downhill_at_the_true_slope_angle():
    from .scatter import terrain_aim

    aim, pitch = terrain_aim(_ramp_fields(0.5), 100.0, 100.0)
    assert pitch == pytest.approx(math.atan(0.5))
    # Yaw convention: this value points the model's +Z axis downhill, and
    # downhill here is +X, so +Z must rotate onto +X — a quarter turn.
    assert math.sin(aim) == pytest.approx(1.0)
    assert math.cos(aim) == pytest.approx(0.0, abs=1e-6)
    # Flat ground has no downhill to speak of and must not spin instances.
    assert terrain_aim(_ramp_fields(0.0), 10.0, 10.0) == (0.0, 0.0)


def test_aligned_layers_lie_with_the_slope_and_trees_do_not():
    """Rocks settle into a hillside; trunks stay vertical whatever it does."""
    fields = _ramp_fields(0.4)
    expected = math.atan(0.4)

    def place(align):
        palette = Palette("t", [Layer(species="rock", instances_per_hectare=400.0,
                                      slope_deg_max=80.0, align_to_slope=align)])
        return scatter_chunk(0.0, 0.0, 200.0, palette, fields, seed=5)

    aligned = place(0.9)
    upright = place(0.0)
    assert aligned and upright
    # Aligned instances tip by ~0.9 of the slope, jittered by the ±4° default.
    for rock in aligned:
        assert rock.tilt_x == pytest.approx(0.9 * expected,
                                            abs=math.radians(4.5))
        assert math.sin(rock.yaw) > 0.5          # still broadly downhill
    # Unaligned ones keep the small random tilt only — the tree behaviour.
    for tree in upright:
        assert abs(tree.tilt_x) <= math.radians(4.5)


def test_slope_min_gate_keeps_cliff_dressing_off_flat_ground():
    palette = Palette("t", [Layer(species="shell", instances_per_hectare=500.0,
                                  slope_deg_min=28.0, slope_deg_max=70.0)])
    flat = scatter_chunk(0.0, 0.0, 200.0, palette, _ramp_fields(0.05), seed=5)
    steep = scatter_chunk(0.0, 0.0, 200.0, palette, _ramp_fields(0.8), seed=5)
    assert flat == []
    assert steep


def test_back_yaw_turns_an_open_back_into_the_hill():
    """An open-BACKED cliff piece aims its missing face uphill (16f).

    The aligned yaw points the model's +Z downhill; `back_yaw_deg` 180 turns
    it round so the hollow side faces the slope it is embedded in.
    """
    fields = _ramp_fields(0.5)
    def place(back):
        palette = Palette("t", [Layer(species="shell", instances_per_hectare=400.0,
                                      slope_deg_max=80.0, align_to_slope=1.0,
                                      back_yaw_deg=back)])
        return scatter_chunk(0.0, 0.0, 200.0, palette, fields, seed=11)
    plain, turned = place(0.0), place(180.0)
    assert plain and len(plain) == len(turned)
    for a, b in zip(plain, turned):
        assert (a.x, a.z) == (b.x, b.z)
        assert math.cos(b.yaw - a.yaw) == pytest.approx(-1.0, abs=1e-6)


def test_cliff_zone_and_cover_gates():
    """The three gates 16f added: distance to a cliff, the authored dressing
    zone, and the covers a layer refuses."""
    fields = Fields(height=lambda x, z: 0.0, water_depth=lambda x, z: -6.0,
                    slope=lambda x, z: 5.0, region=lambda x, z: 1,
                    land_cover=lambda x, z: 23 if x < 100 else 17,
                    cliff=lambda x, z: 5.0 if z < 100 else 90.0,
                    zone=lambda x, z: "zone.a" if x < 100 else "")
    def place(**kw):
        return scatter_chunk(0.0, 0.0, 200.0, Palette("t", [
            Layer(species="s", instances_per_hectare=800.0, **kw)]), fields, seed=3)
    near = place(cliff_m=(0.0, 15.0))
    assert near and all(i.z < 100 for i in near)
    zoned = place(zone="zone.a")
    assert zoned and all(i.x < 100 for i in zoned)
    off_rock = place(land_cover_not=(23,))
    assert off_rock and all(i.x >= 100 for i in off_rock)


def test_sink_jitter_band_is_the_layers_own():
    """An open-bottomed rock's sink floor is raised, so its hollow underside
    is never left showing (16f)."""
    from .composition import Composition
    comp = Composition.load()
    species = "vanilla:landscape/rocks/rockl02"
    flat = comp.sink_m(species, 0.0, 0.5)
    assert comp.sink_m(species, 0.0, 0.0, jitter=(0.8, 1.5)) == pytest.approx(flat * 0.8)
    assert comp.sink_m(species, 0.0, 0.0) == pytest.approx(flat * 0.5)


def test_litter_mask_is_set_under_a_crown_and_clear_away_from_one():
    """16f deliverable 10: the alpha of the ground tint marks where crowns
    cover the ground."""
    from .compile_scatter import litter_alpha
    alpha = litter_alpha([(100.0, 100.0, 12.0)], size_px=64, metres_per_px=5.0)
    assert alpha[20, 20] == 255                      # under the crown
    assert alpha[0, 0] == 0                          # 140 m away, nothing
    assert alpha[63, 63] == 0


def test_shipped_litter_mask_has_an_alpha_channel():
    """The shipped tint must carry an alpha channel at all: read as RGB the
    shader would see alpha = 1 and litter the whole province."""
    from pathlib import Path
    from PIL import Image
    from .compile_scatter import PROVINCE
    path = PROVINCE / "refined" / "ground-tint.png"
    if not path.exists():
        pytest.skip("no shipped ground tint")
    assert Image.open(path).mode == "RGBA"


def test_submerged_layers_never_sit_shallower_than_their_plant():
    """A rigid 3.98 m kelp authored for [0.8, 6.0] m water stood 2-3 m out of
    the sea (owner walk 2026-09-17); the floor is the plant's drawn height at
    its largest scale, sliding the whole band down-to-up so the authored
    thickness survives. Drowned trees, reeds and lilypads keep their bands: all
    three stand proud of the water by design."""
    from .compile_scatter import floor_submerged_depths, _kit_heights
    data = {"byRegionClass": {"4": {"layers": [
        {"role": "aquatic-kelp", "species": "k", "water_depth_m": [0.8, 6.0], "scale_range": [0.9, 1.2]},
        {"role": "aquatic-kelp", "species": "k", "water_depth_m": [5.0, 6.0]},
        {"role": "drowned-tree", "species": "t", "water_depth_m": [0.4, 3.0]},
        {"role": "aquatic-reeds", "species": "r", "water_depth_m": [-0.15, 1.5]},
        {"role": "aquatic-lilypads", "species": "l", "water_depth_m": [0.4, 2.2]},
        {"role": "aquatic-shells", "species": "c", "water_depth_m": [0.3, 5.0]},
    ]}}}
    changed = floor_submerged_depths(data, {"k": 3.98, "t": 9.0, "c": 0.12,
                                                 "r": 4.3, "l": 3.3})
    layers = data["byRegionClass"]["4"]["layers"]
    assert layers[0]["water_depth_m"] == [4.78, 9.98]   # 5.2 m thickness kept
    assert layers[1]["water_depth_m"] == [5.0, 6.0]
    assert layers[2]["water_depth_m"] == [0.4, 3.0]
    assert layers[3]["water_depth_m"] == [-0.15, 1.5]   # reeds emerge by design
    assert layers[4]["water_depth_m"] == [0.4, 2.2]     # lilypads float
    assert layers[5]["water_depth_m"] == [0.3, 5.0]     # shells: 0.12 m fits 0.3 m
    assert len(changed) == 1 and "0.8-6.0 -> 4.78-9.98" in changed[0]

    # The floor is the TOP ABOVE THE BED, not the whole bounding box: the
    # scatter seats a piece by its pivot, so the part that must be covered is
    # `sizeM[2] - pivotAboveBaseM`. `waterkelptall02` and `waterkelptall03`
    # are byte-identical 3.983 m meshes with pivots 0.090 and 0.801, so at the
    # same max scale their floors must differ by exactly 0.71 x that scale.
    heights = _kit_heights()
    tall02 = heights["depths:landscape/grass/waterkelptall02"]
    tall03 = heights["depths:landscape/grass/waterkelptall03"]
    assert round(tall02 - tall03, 3) == 0.711
    twins = {"byRegionClass": {"4": {"layers": [
        {"role": "aquatic-kelp", "species": "depths:landscape/grass/waterkelptall02",
         "water_depth_m": [0.8, 6.0], "scale_range": [0.8, 1.3]},
        {"role": "aquatic-kelp", "species": "depths:landscape/grass/waterkelptall03",
         "water_depth_m": [0.8, 6.0], "scale_range": [0.8, 1.3]},
    ]}}}
    floor_submerged_depths(twins)
    floors = [l["water_depth_m"][0] for l in twins["byRegionClass"]["4"]["layers"]]
    assert floors == [5.06, 4.14], floors          # 3.893 and 3.182 at 1.3
    assert round(floors[0] - floors[1], 2) == 0.92  # 0.711 x 1.3, to 2 dp
    # On the old whole-box measure both would have been 3.983 x 1.3 = 5.18,
    # identical, and both 1.2-1.9 m too deep.


def test_open_back_is_solved_to_uphill_on_a_thirty_degree_slope():
    """The owner walk's defect: an open back that does not face the hill.

    The world bearing of the missing face is `yaw + back_yaw_deg`; uphill is
    the downhill aim turned 180. The old rule ADDED the offset to the aim,
    which lands the face at `downhill + 2 x back` — right only for a back at
    90 or 270 deg. `rockcliff02`'s back is 258.8 deg, and the shipped province
    put it a median 26.7 deg off uphill.
    """
    grade = math.tan(math.radians(30.0))
    fields = _ramp_fields(grade)
    back = 258.8
    palette = Palette("t", [Layer(species="shell", instances_per_hectare=400.0,
                                  slope_deg_max=80.0, align_to_slope=1.0,
                                  back_yaw_deg=back)])
    placed = scatter_chunk(0.0, 0.0, 200.0, palette, fields, seed=11)
    assert placed
    uphill = math.atan2(grade, 0.0) + math.pi   # downhill is +X, so uphill -X
    for inst in placed:
        delta = (inst.yaw + math.radians(back)) - uphill
        delta = (delta + math.pi) % math.tau - math.pi
        assert abs(delta) <= math.radians(10.0), math.degrees(delta)


def test_a_piece_with_no_open_back_still_points_its_plus_z_downhill():
    fields = _ramp_fields(0.5)
    palette = Palette("t", [Layer(species="rock", instances_per_hectare=400.0,
                                  slope_deg_max=80.0, align_to_slope=1.0)])
    placed = scatter_chunk(0.0, 0.0, 200.0, palette, fields, seed=11)
    assert placed
    downhill = math.pi / 2.0                     # +X
    for inst in placed:
        delta = (inst.yaw - downhill + math.pi) % math.tau - math.pi
        assert abs(delta) <= math.radians(23.0)


# --- the burial rule ---------------------------------------------------------

def _ridge_fields(fall_per_m: float) -> Fields:
    """A ridge crest along x = 100: ground falls away on both sides."""
    return Fields(
        height=lambda x, z: -fall_per_m * abs(x - 100.0),
        water_depth=lambda x, z: -5.0,
        slope=lambda x, z: 8.0,
        region=lambda x, z: 2,
    )


def test_burial_sinks_a_rock_whose_footprint_overhangs_a_ridge():
    """No rock floats: the footprint's lowest ground sample must end up at or
    below the pivot's sink (owner walk 2026-09-18)."""
    from .scatter import burial

    layer = Layer(species="rock", footprint_half_m=(2.0, 2.0), height_m=6.0)
    # 0.5 m/m fall over a 2 m half-footprint = 1 m of ground drop at the edge.
    extra, cap = burial(_ridge_fields(0.5), layer, 100.0, 100.0,
                        yaw=0.0, tilt_x=0.0, tilt_z=0.0, scale=1.0)
    assert cap == pytest.approx(0.6 * 6.0)
    assert extra >= 1.0
    assert extra == pytest.approx(1.0 + 0.25)


def test_burial_is_zero_on_flat_ground():
    from .scatter import burial

    layer = Layer(species="rock", footprint_half_m=(2.0, 2.0), height_m=6.0)
    flat = Fields(height=lambda x, z: 12.0, water_depth=lambda x, z: -5.0,
                  slope=lambda x, z: 0.0, region=lambda x, z: 2)
    extra, cap = burial(flat, layer, 50.0, 50.0, 0.0, 0.0, 0.0, 1.0)
    assert extra == 0.0
    assert cap == pytest.approx(0.6 * 6.0)


def test_burial_never_swallows_the_piece():
    from .scatter import burial

    layer = Layer(species="rock", footprint_half_m=(3.0, 3.0), height_m=2.0)
    extra, cap = burial(_ridge_fields(4.0), layer, 100.0, 100.0,
                        0.0, 0.0, 0.0, 1.5)
    assert cap == pytest.approx(0.6 * 2.0 * 1.5)
    assert extra == pytest.approx(cap)


def test_burial_leaves_a_plant_layer_alone():
    from .scatter import burial

    assert burial(_ridge_fields(0.5), Layer(species="fern"), 100.0, 100.0,
                  0.0, 0.0, 0.0, 1.0) == (0.0, math.inf)


def test_composition_adds_the_measured_burial_under_its_cap():
    """`finalise_anchors` ADDS the sampler's measurement to the composed sink
    and holds the total under the instance's own cap."""
    from .composition import Composition

    comp = Composition({"species": {}})
    flat = Fields(height=lambda x, z: 0.0, water_depth=lambda x, z: -5.0,
                  slope=lambda x, z: 0.0, region=lambda x, z: 2)
    plain = Instance(species="vanilla:landscape/rocks/rockl01", tier="T1",
                     x=1.0, y=0.0, z=1.0, yaw=0.0, scale=1.0,
                     tilt_x=0.0, tilt_z=0.0)
    buried = Instance(species="vanilla:landscape/rocks/rockl01", tier="T1",
                      x=1.0, y=0.0, z=1.0, yaw=0.0, scale=1.0,
                      tilt_x=0.0, tilt_z=0.0, extra_sink_m=1.5,
                      sink_cap_m=9.0)
    capped = Instance(species="vanilla:landscape/rocks/rockl01", tier="T1",
                      x=1.0, y=0.0, z=1.0, yaw=0.0, scale=1.0,
                      tilt_x=0.0, tilt_z=0.0, extra_sink_m=1.5,
                      sink_cap_m=0.2)
    comp.finalise_anchors([plain, buried, capped], flat, seed=4)
    assert buried.sink == pytest.approx(plain.sink + 1.5)
    assert capped.sink == pytest.approx(0.2)


def test_the_bundle_sink_range_covers_the_burial():
    """The encoder quantises sink into the species' own [min, max] range, so
    the range has to be computed AFTER the burial is added, or a buried rock
    would be clipped back to the un-buried maximum."""
    group = [Instance(species="r", tier="T1", x=float(i), y=0.0, z=0.0,
                      yaw=0.0, scale=1.0, tilt_x=0.0, tilt_z=0.0,
                      sink=0.5 + 3.0 * i)
             for i in range(3)]
    decoded = decode(encode(group, ["r"]))[0]
    assert decoded["sinkRange"] == (0.5, 6.5)
    assert [i["sink"] for i in decoded["instances"]] == \
        pytest.approx([0.5, 3.5, 6.5], abs=0.03)
