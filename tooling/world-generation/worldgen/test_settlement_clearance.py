"""A settlement clears its own vegetation, and the grading is real.

These are the regression guards for decision 0041's clearing integration and
placement principle C13. They run on synthetic fields in a fraction of a
second — no province rasters, no compiler run — so there is no excuse for not
running them.
"""

import numpy as np
import pytest

from . import settlement_clearance as sc
from .scatter import Fields, Layer, Palette, scatter_chunk

# A 100 x 100 m built core inside a 200 x 200 m worked fringe, with one kept
# tree standing in the middle of the built ground.
HARD = [[[100.0, 100.0], [200.0, 100.0], [200.0, 200.0], [100.0, 200.0]]]
THIN = [[[50.0, 50.0], [250.0, 50.0], [250.0, 250.0], [50.0, 250.0]]]
KEPT = [{"id": "kept.test.hist", "kind": "hist-tree", "positionM": [150.0, 150.0]}]
CLEARANCE = {"hardClear": HARD, "thinned": THIN, "kept": KEPT}


def fields_for(clearance, depth=0.0, slope=0.0, region=7, cover=0):
    return Fields(
        height=lambda x, z: 0.0,
        water_depth=lambda x, z: depth,
        slope=lambda x, z: slope,
        region=lambda x, z: region,
        land_cover=lambda x, z: cover,
        settlement_keep=lambda x, z, radius_m=0.0: min(
            [sc.keep_at(x, z, clearance)]
            + [sc.keep_at(x + dx, z + dz, clearance)
               for dx, dz in ((radius_m, 0.0), (-radius_m, 0.0),
                              (0.0, radius_m), (0.0, -radius_m))]
        ) if clearance else 1.0,
    )


def scatter(clearance, density=400.0, tier="T2", radius=0.0):
    palette = Palette("p", [Layer(species="tree", tier=tier,
                                  instances_per_hectare=density,
                                  clearance_radius_m=radius)])
    return scatter_chunk(0, 0, 300, palette, fields_for(clearance), seed=4242)


# --- the hard failures ------------------------------------------------------

def test_no_plant_stands_on_built_ground():
    """A tree inside a hard-clear parcel is a hard failure, every tier."""
    for tier in ("T1", "T2", "T3"):
        placed = scatter(CLEARANCE, tier=tier)
        assert placed, f"{tier}: nothing scattered, the test proves nothing"
        standing = [i for i in placed
                    if any(sc.point_in_polygon(i.x, i.z, p) for p in HARD)
                    and sc.keep_at(i.x, i.z, CLEARANCE) == 0.0]
        assert standing == [], f"{tier}: {len(standing)} plants on built ground"


def test_all_tiers_are_cleared_by_the_same_compile():
    """No ghost trees: a chunk's tiers cannot disagree about a settlement.

    0041 gotcha (c) — near scatter cleared while the distant layer is not
    gives trees that vanish as the player walks up to them.
    """
    palette = Palette("p", [
        Layer(species="hero", tier="T1", instances_per_hectare=120.0),
        Layer(species="mid", tier="T2", instances_per_hectare=300.0),
        Layer(species="herb", tier="T3", instances_per_hectare=900.0),
    ])
    placed = scatter_chunk(0, 0, 300, palette, fields_for(CLEARANCE), seed=99)
    tiers = {i.tier for i in placed}
    assert tiers == {"T1", "T2", "T3"}
    for tier in tiers:
        on_built = [i for i in placed if i.tier == tier
                    and sc.keep_at(i.x, i.z, CLEARANCE) == 0.0]
        assert on_built == [], f"{tier} kept {len(on_built)} on built ground"


def test_a_plants_extent_is_cleared_not_just_its_origin():
    """A canopy overhangs its trunk; an origin-only test leaves it inside."""
    radius = 6.0
    hist = KEPT[0]["positionM"]
    for i in scatter(CLEARANCE, tier="T1", radius=radius):
        if (i.x - hist[0]) ** 2 + (i.z - hist[1]) ** 2 < 20.0 ** 2:
            continue                      # the Hist's protected ground
        reach = min(sc.distance_to_polygon(i.x, i.z, p) for p in HARD)
        assert reach > radius - 0.01, (i.x, i.z, reach)


def test_the_fringe_is_thinner_than_the_wild_but_not_empty():
    wild = scatter(None)
    cleared = scatter(CLEARANCE)
    assert len(cleared) < len(wild)

    def in_fringe(instances):
        return [i for i in instances
                if 0.0 < sc.keep_at(i.x, i.z, CLEARANCE) < 1.0]

    before, after = len(in_fringe(wild)), len(in_fringe(cleared))
    assert before > 30, "fixture too sparse to measure a fringe"
    assert 0 < after < before, (before, after)
    # Graded, not binary: the fringe keeps a real share and the wild beyond it
    # is untouched.
    assert 0.2 < after / before < 0.95
    far = [i for i in wild if sc.keep_at(i.x, i.z, CLEARANCE) == 1.0]
    far_after = [i for i in cleared if sc.keep_at(i.x, i.z, CLEARANCE) == 1.0]
    assert len(far) == len(far_after), "wild ground outside the fringe moved"


def test_the_grade_is_a_gradient_not_a_step():
    """Survival rises monotonically with distance from the built edge."""
    edges = [sc.keep_at(x, 150.0, CLEARANCE) for x in (99.0, 95.0, 90.0, 85.0)]
    assert edges == sorted(edges), edges
    assert edges[0] < edges[-1]
    assert sc.keep_at(60.0, 150.0, CLEARANCE) == pytest.approx(1.0)


def test_a_kept_plant_keeps_its_ground():
    hist = KEPT[0]["positionM"]
    assert sc.keep_at(hist[0], hist[1], CLEARANCE) == 1.0
    assert sc.keep_at(hist[0] + 17.0, hist[1], CLEARANCE) == 1.0
    # ... and the built ground a metre beyond the disc is still built ground.
    assert sc.keep_at(hist[0] + 19.0, hist[1], CLEARANCE) == 0.0
    placed = scatter(CLEARANCE, density=4000.0, tier="T3")
    kept_ground = [i for i in placed
                   if (i.x - hist[0]) ** 2 + (i.z - hist[1]) ** 2 < 12.0 ** 2]
    assert kept_ground, "nothing survives on the Hist's own protected ground"


def test_weeds_are_enriched_at_the_wall_foot():
    """The 0-1.2 m band outside a wall is a deliberate keep, not an oversight."""
    x = 150.0
    # Walk out from the wall to the first ground the clearing leaves standing.
    z = next(z for z in np.arange(100.0, 96.0, -0.02)
             if sc.keep_at(x, z, CLEARANCE) > 0.0)
    at_wall = sc.keep_at(x, z, CLEARANCE)
    # Un-enriched, the fringe rate this close to the wall is the floor.
    assert at_wall > sc.FRINGE_MIN_KEEP * 1.5
    # ... and the enrichment is local: it is gone by the band's edge.
    assert sc.keep_at(x, z - sc.WALL_ENRICH_BAND_M - 0.1, CLEARANCE) < at_wall


# --- the shared rule --------------------------------------------------------

def test_scalar_and_vectorised_rules_agree():
    rng = np.random.default_rng(7)
    xs = rng.uniform(30.0, 270.0, 500)
    zs = rng.uniform(30.0, 270.0, 500)
    for margin in (0.0, 0.9):
        vector = sc.keep_field(xs, zs, CLEARANCE, margin)
        scalar = np.array([sc.keep_at(x, z, CLEARANCE, margin)
                           for x, z in zip(xs, zs)])
        assert np.allclose(vector, scalar)


def test_the_raster_never_reports_built_ground_as_wild():
    """Cell-centre sampling let plants 20 cm inside a wall survive; the
    conservative half-cell margin is what stops it."""
    px_m = 1.83
    keep = sc.keep_raster((200, 200), px_m, [{"id": "t", "clearance": CLEARANCE}])
    rng = np.random.default_rng(3)
    for x, z in zip(rng.uniform(101.0, 199.0, 200), rng.uniform(101.0, 199.0, 200)):
        if sc.keep_at(x, z, CLEARANCE) == 0.0:
            assert keep[int(z / px_m), int(x / px_m)] == 0, (x, z)


def test_affected_chunks_covers_the_interior_and_uses_the_scatter_chunk_size():
    assert sc.CHUNK_M == pytest.approx(467.927, abs=0.01)
    wide = {"hardClear": [[[100.0, 100.0], [1500.0, 100.0],
                           [1500.0, 200.0], [100.0, 200.0]]], "thinned": []}
    cells = sc.affected_chunks(wide)
    # 0..1500 m spans four chunks at 467.9 m, INCLUDING the ones with no vertex.
    assert [c[0] for c in cells] == [0, 1, 2, 3]
    assert {c[1] for c in cells} == {0}
