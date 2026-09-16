"""Every rock the flora kit ships places by its MINED ground contact.

Round 4 put a 10 m cliff shell on the surface because rocks fell through the
class-default sink; round 6 gives each rock the depth Bethesda actually sank
it to in Tamriel (`world/sources/placement/vanilla-tamriel-placement.json`,
mined table in the composition rules' `species` entries). These tests hold
that contract on the SHIPPED files: the published kit manifest and the rules
file the passes read, never a fixture.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from worldgen.composition import Composition

REPO = Path(__file__).resolve().parents[3]
KIT = REPO / "apps/world-studio/public/kits/flora-province-v1.kit.json"
RULES = REPO / "world/sources/placement/composition-rules.json"

ROCK_DIR = "landscape/rocks/"


def _rocks() -> list[dict]:
    manifest = json.loads(KIT.read_text())
    return [a for a in manifest["assets"] if ROCK_DIR in a["id"]]


@pytest.fixture(scope="module")
def composition() -> Composition:
    return Composition(json.loads(RULES.read_text()))


@pytest.fixture(scope="module")
def rocks() -> list[dict]:
    rocks = _rocks()
    assert len(rocks) >= 40, f"only {len(rocks)} rocks in the published kit"
    return rocks


def test_every_rock_has_a_per_species_sink(rocks, composition):
    """No rock resolves to the class default: each has its own mined p50."""
    rules = json.loads(RULES.read_text())["species"]
    class_flat = Composition.CLASS_SINK["rock"][0]
    for asset in rocks:
        entry = rules.get(asset["id"])
        assert entry, f"{asset['id']}: no composition rule"
        p50 = (entry.get("pivotOffsetM") or {}).get("p50")
        assert isinstance(p50, (int, float)), f"{asset['id']}: no pivotOffsetM.p50"
        rule = composition.species[asset["id"]]
        assert not math.isnan(rule.sink_flat_m), (
            f"{asset['id']}: falls back to CLASS_SINK")
        assert rule.sink_flat_m != class_flat, (
            f"{asset['id']}: sink equals the rock class default")
        # rand=0.5 cancels the +/-50 % jitter, slope 0 drops the slope term.
        sink = composition.sink_m(asset["id"], 0.0, 0.5)
        assert sink == pytest.approx(abs(p50), rel=0.01), (
            f"{asset['id']}: sink {sink:.3f} m != mined |p50| {abs(p50):.3f} m")


def test_every_rock_carries_its_shape_measurements(rocks):
    for asset in rocks:
        for field in ("undersideClosed", "openBackYawDeg", "pivotAboveBaseM"):
            assert field in asset, f"{asset['id']}: no {field} in the manifest"
        assert isinstance(asset["undersideClosed"], bool)
        assert isinstance(asset["pivotAboveBaseM"], (int, float))
        yaw = asset["openBackYawDeg"]
        assert yaw is None or 0.0 <= float(yaw) < 360.0


def test_the_open_backed_shells_are_measured_as_open_backed(rocks):
    """`moss_rockcliff01` is the known open shell (decision 0036), and no
    cliff face is a closed, free-standing boulder."""
    by_id = {a["id"]: a for a in rocks}
    moss = by_id["bmv:landscape/rocks/moss_rockcliff01"]
    assert moss["openBackYawDeg"] is not None
    assert moss["undersideClosed"] is False
    for asset in rocks:
        if "rockcliff" in asset["id"]:
            assert asset["undersideClosed"] is False, (
                f"{asset['id']}: a cliff face measured as closed underneath")


def test_every_rock_is_categorised_as_rock(rocks):
    """A boulder filed as `container` (a CONT record hung on rockm02.nif) or a
    mossy cliff filed as `plant` loses the rock sink and the convex collider."""
    for asset in rocks:
        assert asset.get("category") == "rock", (
            f"{asset['id']}: category {asset.get('category')!r}")
        assert asset.get("collision") == "convex", (
            f"{asset['id']}: collision {asset.get('collision')!r}")
