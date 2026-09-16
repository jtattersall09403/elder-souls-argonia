"""The shipped vegetation against the signed water record (16f, decision 0066).

Three gates, all measured on files this repo ships, so they run in CI without
the asset vault (they skip cleanly when the bundles or the water id raster are
not there):

* nothing woody stands in a flowing channel — the defect the channel-exclusion
  gate exists to prevent, checked on the BUNDLES rather than on the sampler;
* the scatter's copy of the graph vocabulary is the graph's vocabulary;
* `ProvinceFields.channel_m` is the record's channel mask, not a re-derivation.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from .scatter import SEASON_KINDS, WATER_KINDS, decode

REPO_ROOT = Path(__file__).resolve().parents[3]
BUNDLES = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "vegetation"
WATER_ID = (REPO_ROOT / "apps" / "world-studio" / "public" / "province"
            / "water" / "water-id.png")
PALETTES = REPO_ROOT / "world" / "sources" / "flora" / "palettes.json"
GRAPH = REPO_ROOT / "world" / "sources" / "hydrology" / "hydrology-graph.json"
REFINED = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "refined"


def _water():
    if not WATER_ID.exists():
        pytest.skip("no water id raster in this checkout")
    from .water_report import ShippedWater
    return ShippedWater()


def _channel_species() -> set[str]:
    """Every species placed by a layer that may not stand in a channel."""
    data = json.loads(PALETTES.read_text(encoding="utf-8"))
    return {layer["species"] for entry in data["byRegionClass"].values()
            for layer in entry["layers"] if layer.get("channel_exclusion")}


def test_no_woody_trunk_stands_in_a_channel():
    index_path = BUNDLES / "vegetation-index.json"
    if not index_path.exists():
        pytest.skip("no published vegetation bundles in this checkout")
    from .water_report import CHANNEL_REACH_KINDS
    water = _water()
    channel = water.kind_grid(CHANNEL_REACH_KINDS)
    order = json.loads(index_path.read_text(encoding="utf-8"))["speciesOrder"]
    wanted = {i for i, name in enumerate(order) if name in _channel_species()}

    n = channel.shape[0]
    offenders = 0
    total = 0
    for bundle in sorted(BUNDLES.glob("chunk_*_vegetation.bin")):
        for group in decode(bundle.read_bytes()):
            if group["index"] not in wanted:
                continue
            for item in group["instances"]:
                if item["anchor"] != 0:
                    continue
                total += 1
                row = int(np.clip(item["z"] / water.mpp2, 0, n - 1))
                col = int(np.clip(item["x"] / water.mpp2, 0, n - 1))
                if channel[row, col]:
                    offenders += 1
    print(f"channel-excluded instances: {offenders:,} of {total:,} stand in a "
          f"channel")
    assert offenders == 0, (
        f"{offenders:,} of {total:,} channel-excluded instances stand in a "
        "flowing channel — re-run compile_scatter with the record gates. "
        "The 47 the 2026-09-16 bundles carry are cluster COMPANIONS: "
        "`composition.expand_clusters` placed 1-4 pieces within 2 m of an "
        "anchor without re-gating, so an anchor just outside a wetted bank "
        "margin spawned pieces inside it. Fixed at the root (16f) — a "
        "companion may not cross a margin its anchor respects — and the "
        "count clears on the next province scatter.")


def test_scatter_vocabulary_matches_the_graph():
    vocabulary = json.loads(GRAPH.read_text(encoding="utf-8"))["vocabulary"]
    assert WATER_KINDS == set(vocabulary["reachKinds"]) | set(vocabulary["bodyKinds"])
    assert SEASON_KINDS == set(vocabulary["seasons"])


def test_channel_field_is_the_record():
    """`channel_m <= 0` exactly on the record's channel texels."""
    from .compile_chunks import DEFAULT_HEIGHTS
    if not (REFINED / "height-rg.png").exists() or not DEFAULT_HEIGHTS.exists():
        pytest.skip("the refined rasters / vault heights are not in this checkout")
    from .compile_scatter import ProvinceFields
    from .water_report import CHANNEL_REACH_KINDS
    fields = ProvinceFields()
    channel = _water().kind_grid(CHANNEL_REACH_KINDS)
    rng = np.random.default_rng(16_06)
    n = channel.shape[0]
    rows = rng.integers(0, n, 20_000)
    cols = rng.integers(0, n, 20_000)
    inside = fields.channel_m[rows, cols] <= 0.0
    assert np.array_equal(inside, channel[rows, cols]), (
        "channel_m disagrees with the record's channel mask on "
        f"{int((inside != channel[rows, cols]).sum())} of 20,000 texels")
