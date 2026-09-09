"""Source gates for the trunk fitter (Phase 10 round 11).

The kit-data gate lives with the shipped file
(`apps/world-studio/src/character/vegetationSolidity.test.ts`); these are the
gates on the FITTER, so a newly added species with an unseen card texture is
loud here rather than silently solid in the world.
"""
from __future__ import annotations

import numpy as np
import pytest

from pipeline.trunk_solids import (
    CARD_TRI_AREA_PER_HEIGHT2,
    MAX_RADIUS_FACTOR,
    fit_cluster,
    is_card,
    is_wood,
)


def test_cards_are_told_from_tubes_by_geometry_not_by_name():
    # The mangrove crown card the owner walked into: 1.13 m² triangles on an
    # 8.6 m tree. Its texture name (`gkbbranch10`) is a wood word, and no name
    # list had it — the geometry is what gives it away.
    assert is_wood("gkbbranch10")
    assert is_card(1.132, 8.6)
    # The anvil canopy palm's genuine trunk carries LARGER triangles (0.67 m²)
    # on a much taller tree, and must survive. No absolute area cut can do
    # both, which is why the rule is relative to the tree.
    assert not is_card(0.673, 42.4)


def test_the_card_cut_keeps_its_margin_either_side():
    # Measured over flora-province-v1: largest tube 1.44e-3 of height²,
    # smallest card 2.49e-3. The cut must sit clear of both.
    assert 1.44e-3 * 1.2 < CARD_TRI_AREA_PER_HEIGHT2 < 2.49e-3 / 1.2


def test_a_splayed_multi_stem_becomes_several_slim_discs():
    # Two 0.3 m stems 2.4 m apart — a mangrove's prop-root pair. One disc over
    # both would be ~1.5 m of mostly walk-through air.
    rng = np.random.default_rng(3)
    angle = rng.random(400) * 2 * np.pi
    stem = np.stack([0.3 * np.cos(angle), 0.3 * np.sin(angle)], axis=1)
    points = np.vstack([stem[:200], stem[200:] + np.array([2.4, 0.0])])
    discs = fit_cluster(points, 0.39, 0.45)
    assert len(discs) >= 2
    assert max(r for _, r in discs) <= 0.45


def test_nothing_survives_wider_than_the_clamp():
    rng = np.random.default_rng(5)
    spray = rng.normal(0.0, 1.4, size=(600, 2))
    girth = 0.5
    discs = fit_cluster(spray, girth * 1.3, girth * MAX_RADIUS_FACTOR)
    assert discs
    assert max(r for _, r in discs) <= girth * MAX_RADIUS_FACTOR + 1e-9


@pytest.mark.parametrize("height_m", [0.0, -1.0])
def test_a_species_with_no_measured_height_is_never_called_a_card(height_m):
    # Better to fit something than to silently drop every wood primitive.
    assert not is_card(99.0, height_m)


def test_the_comp_veto_no_longer_kills_bark_tubes():
    # Round 12. `comp` was vetoing `gkbtreeaspenbarkcomp`, a genuine bark tube
    # (3.6e-4 of height²), which is why a 10.6 m aspen shipped with no fitted
    # trunk. Every `*branchcomp*` leaf card in the kit is caught geometrically
    # instead, so the name veto was pure cost.
    assert is_wood("gkbtreeaspenbarkcomp")
    assert is_wood("gkbtreeaspenbranchcompgreen1dark")  # a card...
    assert is_card(0.878, 10.6)                          # ...caught by geometry
    assert not is_card(0.041, 10.6)                      # the bark tube survives


def test_a_cane_clump_is_not_wood_and_so_gets_no_solid():
    # The bamboo the owner walked into is one 1,440-triangle primitive
    # textured `bamboo`. It matches no wood word, so the fitter finds no wood
    # and `rewrite` must drop the species to `none` rather than stand up the
    # silhouette capsule. Guarding the classifier here; the manifest-side gate
    # lives in apps/world-studio/src/character/vegetationSolidity.test.ts.
    assert not is_wood("bamboo")
    assert not is_wood("banana_tree")
    assert not is_wood("tropicalplant01")
    # ...while the slender things that DO have boles stay wood.
    assert is_wood("gkbtundradriftwoodbark01")
    assert is_wood("palmbarknew14")
