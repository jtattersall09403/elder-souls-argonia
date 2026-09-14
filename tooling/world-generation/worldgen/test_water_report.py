"""`ShippedWater` answers the graph-entity question the 0066 gates join through."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from .ladder import requires_layer
from .water_report import ShippedWater

REPO_ROOT = Path(__file__).resolve().parents[3]
WATER_DIR = Path(os.environ.get("ES_WATER_DIR")
                 or (REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"))

pytestmark = [requires_layer("water"), pytest.mark.skipif(
    not ((WATER_DIR / "water-meta.json").exists() and (WATER_DIR / "water-id.png").exists()),
    reason="compiled province water unavailable")]


@pytest.fixture(scope="module")
def shipped() -> ShippedWater:
    return ShippedWater(WATER_DIR, heights=None)


def test_entities_and_ids_agree_with_the_meta(shipped):
    assert shipped.entities is shipped.meta["entities"]
    assert shipped.ids.shape == shipped.w2.shape
    assert int(shipped.ids.max()) <= len(shipped.entities)


# The swamp site is 1873.5/4904.1, not the 1829.7/4838.3 of the brief: measured
# on the shipped compile, that point is dry ground (depth -3.00 m, no id) 79 m
# outside `body.1209-3032`'s extent. Same body, same kind; the coordinate moved.
@pytest.mark.parametrize("x_m,z_m,entity_id,kind", [
    (1873.5, 4904.1, "body.1209-3032", "swamp"),
    (6121.4, 1639.6, "body.ocean", "ocean"),
])
def test_entity_at_names_the_graph_record(shipped, x_m, z_m, entity_id, kind):
    e = shipped.entity_at(x_m, z_m)
    assert e is not None, f"no water entity at {x_m}, {z_m}"
    assert e["id"] == entity_id
    assert e["kind"] == kind


def test_dry_ground_carries_no_entity(shipped):
    """A texel with no water has no id: the join is water-only, not nearest-body."""
    assert shipped.entity_at(1829.7, 4838.3) is None
    assert not shipped.at(1829.7, 4838.3)["wet"]
