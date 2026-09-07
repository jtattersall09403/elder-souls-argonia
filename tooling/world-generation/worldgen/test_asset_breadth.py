"""Breadth of the sourced pool (owner ruling 2026-09-07).

The floor itself is Part 8's call; until then these tests keep the mechanism
honest — the report runs, and it never silently reports nothing.
"""

from . import asset_breadth as ab


def test_report_runs_and_counts_linked_shells():
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
