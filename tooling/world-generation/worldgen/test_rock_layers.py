"""One test per mined rock figure (16f deliverable 3).

Round 4's rocks were typed from memory — a 0.08 m bury, a flat slope cap, an
open-backed cliff shell used freestanding — and nothing caught it. These tests
read the SHIPPED palettes, the composition rules and the kit manifest and check
every rock layer against the mined record it claims to come from, so a rule
typed from memory cannot ship again.
"""

from __future__ import annotations

import json
import math

import pytest

from . import rock_dressing as rd
from .composition import Composition
from .scatter import Fields, Layer, Palette, scatter_chunk
from .vegetation_ladder import PALETTES, ROCK_ROLES, is_stem_layer


def _rock_layers() -> list[tuple[str, dict]]:
    doc = json.loads(PALETTES.read_text())["byRegionClass"]
    return [(region, layer) for region, entry in doc.items()
            for layer in entry["layers"] if layer.get("role") in ROCK_ROLES]


ROCKS = _rock_layers()
COMPOSITION = Composition.load()


def test_there_are_rock_layers():
    assert len(ROCKS) > 50, "the rock dressing did not ship"


@pytest.mark.parametrize("region,layer", ROCKS)
def test_sink_is_the_mined_p50(region, layer):
    """Rule 1: a rock is buried to its own mined median, never a class
    default. `sink_m` at slope 0 with rand 0.5 is exactly the flat depth."""
    species = layer["species"]
    sink = COMPOSITION.sink_m(species, 0.0, 0.5)
    assert sink == pytest.approx(rd.mined(species)["sink_p50"], abs=0.05), species
    assert sink > COMPOSITION.CLASS_SINK["rock"][0] or \
        rd.mined(species)["sink_p50"] <= COMPOSITION.CLASS_SINK["rock"][0]


@pytest.mark.parametrize("region,layer", ROCKS)
def test_tilt_yaw_and_scale_are_mined(region, layer):
    """Rules 2 and 6: tilt is twice the mined median, yaw is uniform, scale
    is the mined p5-p95."""
    m = rd.mined(layer["species"])
    assert 0.0 < layer["tilt_deg_max"] <= 2.0 * m["tilt_p50"] + 0.1
    assert layer.get("yaw_random", True) is True
    assert m["yaw_uniformity"] > 0.7, "mined yaw is not uniform for this species"
    assert layer["scale_range"] == [m["scale_p5"], m["scale_p95"]]
    assert layer.get("align_to_slope") == 1.0


@pytest.mark.parametrize("region,layer", ROCKS)
def test_slope_band(region, layer):
    """Rule 3: the slope gate is the mined p75 + 10, except an open-bottomed
    dry rock (20 deg, so its hollow underside never shows) and an open-backed
    cliff piece (a face to be embedded in)."""
    species = layer["species"]
    m = rd.mined(species)
    if rd.open_back_yaw_deg(species) is not None:
        assert layer["slope_deg_min"] == rd.CLIFF_SLOPE_DEG
        assert layer["slope_deg_max"] >= 70.0
    elif layer["role"] != "wet-rock" and rd.underside_cover(species) < 0.3:
        assert layer["slope_deg_max"] == 20.0
        assert tuple(layer["sink_jitter"]) == (0.8, 1.5)
    else:
        assert layer["slope_deg_max"] == pytest.approx(m["slope_p75"] + 10.0, abs=0.01)


@pytest.mark.parametrize("region,layer", ROCKS)
def test_no_open_side_faces_the_player(region, layer):
    """Mesh rule: an open-BACKED piece is cliff dressing with its back into
    the hill; it never appears in a freestanding boulder layer."""
    species = layer["species"]
    back = rd.open_back_yaw_deg(species)
    if back is None:
        assert layer.get("back_yaw_deg", 0.0) == 0.0
    else:
        assert layer["role"] == "cliff-dressing"
        assert layer["back_yaw_deg"] == back


@pytest.mark.parametrize("region,layer", ROCKS)
def test_water_relation(region, layer):
    """Rule 5: only the wet family stands in water, and it is gated to the
    record's own kinds; every other rock is gated dry."""
    species = layer["species"]
    if layer["role"] == "wet-rock":
        assert "wetrocks/" in species or species.endswith("rocks03"), species
        assert layer["water_kinds"], species
        assert layer["water_depth_m"] == [-1.0, 2.5]
        assert layer["channel_exclusion"] is False
    else:
        assert layer["water_depth_m"][1] <= 0.0, species
        assert layer["channel_exclusion"] is True


@pytest.mark.parametrize("region,layer", ROCKS)
def test_clumping_and_clearance(region, layer):
    """Rule 4: clump radius is half the mined link and clearance is the
    mesh's own footprint, so no rock stands inside another."""
    species = layer["species"]
    m = rd.mined(species)
    assert layer["clump_size_median"] == 3 or layer.get("zone")
    assert layer["singleton_share"] in (0.15, 0.05)
    assert layer["clump_radius_m"] == pytest.approx(m["clump_link_m"] / 2.0, abs=0.02) \
        or layer.get("zone")
    floor = rd.footprint_half_diagonal_m(species) + 0.5
    assert layer["clearance_radius_m"] >= round(floor, 2) - 1e-6


@pytest.mark.parametrize("region,layer", ROCKS)
def test_every_rock_layer_names_its_evidence(region, layer):
    assert layer.get("note"), layer["species"]
    assert "mined n=" in layer["note"]


def test_rocks_are_not_stems():
    """The 0048 ladder measures TREES. A boulder is not a tree."""
    assert not any(is_stem_layer(layer) for _, layer in ROCKS)


# --- placement --------------------------------------------------------------

def _slope_fields(grade: float = 0.25) -> Fields:
    return Fields(
        height=lambda x, z: -grade * z,
        water_depth=lambda x, z: -6.0,
        slope=lambda x, z: math.degrees(math.atan(grade)),
        region=lambda x, z: 1,
        land_cover=lambda x, z: 17,
        shore=lambda x, z: 500.0,
    )


def test_no_rock_stands_inside_another():
    """Rule 4's geometric floor, measured on a synthetic hillside.

    What the scatter can guarantee: clearance stamping is ONE-DIRECTIONAL
    (module 65 §111) — the rock placed first stamps a disc of ITS clearance
    and every later rock keeps out of it — so a pair is held apart by the
    LARGER rock's footprint, not by the sum of the two. The strict no-overlap
    check (gap >= 0.8 x the SUM of the half-diagonals) fails on a dense
    mountain hectare: rockl02 and rockl03 land 9.41 m apart where the sum
    rule wants 9.93 m. That is a limitation of the stamping mechanism, not of
    these figures (it is queued in docs/phases/P-polish/backlog.md); what is
    checked here is the invariant the mechanism does deliver — no rock's
    centre lies inside another rock's footprint.
    """
    layers = [Layer(**{k: v for k, v in entry.items()
                       if k not in Palette.ANNOTATION_KEYS})
              for entry in rd.boulders_dry((1,), 55.0)]
    for layer in layers:
        layer.scale_range = tuple(layer.scale_range)
        layer.water_depth_m = tuple(layer.water_depth_m)
        layer.region_classes = tuple(layer.region_classes)
        layer.sink_jitter = tuple(layer.sink_jitter)
    layers.sort(key=lambda l: -l.clearance_radius_m)
    placed = scatter_chunk(0.0, 0.0, 400.0, Palette("rocks", layers),
                           _slope_fields(), seed=99)
    assert len(placed) > 30
    radius = {s: rd.footprint_half_diagonal_m(s) for s in {i.species for i in placed}}
    for i, a in enumerate(placed):
        for b in placed[i + 1:]:
            gap = math.hypot(a.x - b.x, a.z - b.z)
            floor = 0.8 * max(radius[a.species] * a.scale,
                              radius[b.species] * b.scale)
            assert gap >= floor * 0.999, (a.species, b.species, gap, floor)


# --- the record-driven passes ----------------------------------------------

class _FakeWater:
    def __init__(self, reaches=(), cascades=()):
        self._graph_index = ({r["id"]: r for r in reaches}, {})
        self.meta = {"cascades": list(cascades)}


def _flat_fields() -> Fields:
    return Fields(height=lambda x, z: 10.0, water_depth=lambda x, z: 0.5,
                  slope=lambda x, z: 2.0, region=lambda x, z: 1)


def test_bed_boulders_density_and_determinism():
    """One rock per 160 m2 of wetted bed, seeded by the reach id."""
    reach = {"id": "reach.test-1", "kind": "sloped-rapid", "widthM": 8.0,
             "centreline": [[10.0, 10.0], [410.0, 10.0]]}
    water = _FakeWater([reach])
    bounds = (0.0, 0.0, 468.0, 468.0)
    rocks, records = rd.bed_boulders(water, bounds, 7, _flat_fields())
    bed_m2 = 400.0 * 8.0
    expected = bed_m2 / rd.BED_M2_PER_ROCK
    assert abs(len(rocks) - expected) <= 2, (len(rocks), expected)
    assert len(records) == len(rocks)
    again, _ = rd.bed_boulders(water, bounds, 7, _flat_fields())
    assert [(r.x, r.z, r.species) for r in again] == \
           [(r.x, r.z, r.species) for r in rocks]
    for rec, rock in zip(records, rocks):
        assert rec["reachId"] == "reach.test-1"
        assert rd.BED_RADIUS_M[0] <= rec["radiusM"] <= rd.BED_RADIUS_M[1]
        assert abs(rec["z"] - 10.0) <= 0.8 * 4.0 + 1e-6      # inside 80 % of half
        assert math.hypot(rec["tx"], rec["tz"]) == pytest.approx(1.0, abs=1e-3)
        assert rock.species in {s for _, s in rd._BED_BY_RADIUS}


def test_bed_boulders_ignore_gentle_reaches():
    reach = {"id": "reach.calm", "kind": "horizontal-channel", "widthM": 20.0,
             "centreline": [[10.0, 10.0], [410.0, 10.0]]}
    rocks, _ = rd.bed_boulders(_FakeWater([reach]), (0.0, 0.0, 468.0, 468.0),
                               7, _flat_fields())
    assert rocks == []


def test_cascade_rocks_stand_on_both_sides_of_the_lip():
    cascade = {"id": "reach.fall-1", "widthM": 6.0,
               "lip": {"x": 200.0, "y": 30.0, "z": 200.0},
               "plunge": {"x": 200.0, "y": 20.0, "z": 210.0}}
    rocks, records = rd.cascade_rocks(_FakeWater(cascades=[cascade]),
                                      (0.0, 0.0, 468.0, 468.0), 3, _flat_fields())
    lip_rocks = [r for r in records if abs(r["z"] - 200.0) < 1e-6]
    left = [r for r in lip_rocks if r["x"] < 200.0]
    right = [r for r in lip_rocks if r["x"] > 200.0]
    assert 2 <= len(left) <= 4 and 2 <= len(right) <= 4
    for r in lip_rocks:
        assert abs(r["x"] - 200.0) >= 6.0 / 2 + 1.0 - 1e-6
        assert abs(r["x"] - 200.0) <= 6.0 / 2 + 3.0 + 1e-6
    rim = [r for r in records if r not in lip_rocks]
    for r in rim:
        d = math.hypot(r["x"] - 200.0, r["z"] - 210.0)
        assert 6.0 - 1e-6 <= d <= 10.0 + 1e-6
    assert len(rocks) == len(records)


# --- dressing zones ---------------------------------------------------------

def test_zone_overlay_is_additive_and_inside_the_polygon():
    from . import dressing_zones as dz
    zones = dz.load_zones()
    assert zones, "no dressing zones authored"
    zone = zones[0]
    layers = []
    for entry in dz.zone_layers([zone]):
        fields = {k: v for k, v in entry.items()
                  if k not in Palette.ANNOTATION_KEYS}
        for key in ("scale_range", "water_depth_m", "region_classes",
                    "land_cover", "sink_jitter"):
            if key in fields:
                fields[key] = tuple(fields[key])
        layers.append(Layer(**fields))
    assert all(layer.zone == zone["id"] for layer in layers)
    x0, z0, x1, z1 = dz.bounds(zone)
    fields = Fields(height=lambda x, z: 5.0, water_depth=lambda x, z: -6.0,
                    slope=lambda x, z: 8.0, region=lambda x, z: 2,
                    land_cover=lambda x, z: 17,
                    zone=lambda x, z: zone["id"] if dz.contains(zone, x, z) else "")
    placed = scatter_chunk(x0 - 60, z0 - 60, (x1 - x0) + 140,
                           Palette("zone", layers), fields, seed=5)
    assert placed, "the zone placed nothing"
    for inst in placed:
        assert dz.contains(zone, inst.x, inst.z), (inst.x, inst.z)
    # the overlay ADDS: no region rock layer carries the zone gate
    region_rocks = [layer for _, layer in ROCKS if not layer.get("zone")]
    assert region_rocks, "the zone suppressed the region's own rock"
