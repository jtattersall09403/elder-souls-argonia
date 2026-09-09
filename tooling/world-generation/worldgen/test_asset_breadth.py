"""Breadth of the sourced pool (owner ruling 2026-09-07).

The floor itself is Part 8's call; until then these tests keep the mechanism
honest — the report runs, and it never silently reports nothing.
"""

import pytest

from . import asset_breadth as ab
from . import compile_settlement as cs


def test_report_runs_and_counts_linked_shells():
    # The kits are built from the asset vault into a gitignored directory, so
    # a clean checkout has none and this can only ever fail there — it blocked
    # the Pages deploy on "no linked shell is shipped by any built kit"
    # (2026-09-09). Skip where there are no kits at all; a machine that has
    # built them still runs the check in full, and an EMPTY report on a machine
    # that HAS kits is still the failure this test exists for.
    if not any(cs.KITS_DIR.glob("*.kit.json")):
        pytest.skip("no built asset kits (vault build output, absent on a clean checkout)")
    data = ab.report()
    assert data["linkedShellsAvailable"] > 0, "no linked shell is shipped by any built kit"
    assert data["linkedShellsUsed"] <= data["linkedShellsAvailable"]
    for culture, row in data["byCulture"].items():
        assert 0.0 <= row["fraction"] <= 1.0, culture


def test_every_blueprint_is_reported():
    data = ab.report()
    assert data["perBlueprint"], "no blueprint was read"
    for row in data["perBlueprint"].values():
        assert row["distinctLinkedShells"] <= row["distinctShells"]


def test_floor_is_not_silently_enforced_before_part_8():
    if ab.BREADTH_FLOOR is None:
        assert ab.check() == []
    else:
        assert 0.0 < ab.BREADTH_FLOOR <= 1.0


def test_understory_breadth_is_reported():
    """`asset_breadth` had no flora term at all, so one grass per region would
    have passed every breadth check we owned. The gate is in
    `test_vegetation_ladder.py`; this only proves the report sees the layer."""
    flora = ab.understory_breadth()
    assert flora["distinctUnderstorySpecies"] > 0
    assert len(flora["byRegionClass"]) == 14
    for region, row in flora["byRegionClass"].items():
        assert row["species"] > 0, region
