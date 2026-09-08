"""Derived parcel kinds (97 C5/C6/C7/C12, decision 2026-09-07).

The kits are derived data, so the tests skip where they are not built; what is
tested without them is the derivation's own logic.
"""

import pytest

from . import blueprint_footprints, parcel_kinds


def _kits_built() -> bool:
    return bool(blueprint_footprints.library())


def test_a_pinned_kind_wins():
    assert parcel_kinds.parcel_kind({"kind": "prop", "assetRef": "x", "use": "gate"}) == "prop"


def test_a_gate_or_a_wall_is_a_structure():
    for use in ("gate", "wall", "deck", "scaffold"):
        assert parcel_kinds.parcel_kind({"use": use, "assetRef": "made:up/piece"}) == "structure"


def test_the_measured_hull_decides_a_named_prop():
    """A piece the tokens call a rack but that measures like a hall is not
    dressing: geometry, never labels (97 E2)."""
    if not _kits_built():
        pytest.skip("kits are not built in this checkout")
    small = {"assetRef": "vanilla:clutter/common/tanningrack01", "use": "work"}
    assert parcel_kinds.parcel_kind(small) == "prop"


def test_a_shell_with_a_doorway_is_a_building():
    if not _kits_built():
        pytest.skip("kits are not built in this checkout")
    hut = {"assetRef": "composite:stilt/bamboohut01-with-door", "use": "dwelling"}
    assert parcel_kinds.parcel_kind(hut) == "building"


def test_a_stacked_piece_is_not_counted_twice():
    bp = {"parcels": [{"id": "a", "use": "deck", "assetRef": "made:up/deck"},
                      {"id": "b", "use": "deck", "assetRef": "made:up/deck", "stacksOn": "a"},
                      {"id": "c", "kind": "prop", "assetRef": "made:up/rack"}]}
    counted = [p["id"] for p in parcel_kinds.counted_parcels(bp)]
    assert counted == ["a"]
