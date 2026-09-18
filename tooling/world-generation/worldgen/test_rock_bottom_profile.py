"""The burial rule seats the rock's own rim, not a plane (16f round 5)."""
import json
import math
from pathlib import Path

from . import rock_dressing as rd
from .scatter import Layer, burial, rotate_yxz, base_plane_normal

ROOT = Path(__file__).resolve().parents[3]
PROFILES = ROOT / "world" / "sources" / "placement" / "rock-bottom-profiles.json"


class Slope:
    """A 30° hillside falling toward +x."""
    def height(self, x, z):
        return -math.tan(math.radians(30)) * x

    def slope(self, x, z):
        return 30.0


def _layer(species, profile):
    return Layer(species=species, tier="M", footprint_half_m=rd.footprint_half_m(species),
                 height_m=rd.height_m(species), pivot_above_base_m=rd.pivot_above_base_m(species),
                 bottom_profile=profile, sink_deep_m=3.0)


def test_every_shipped_rock_species_has_a_profile():
    doc = json.loads(PROFILES.read_text())
    assert doc["schemaVersion"] == 2
    rocks = [a["id"] for a in rd._manifest().values() if a.get("category") == "rock"]
    assert rocks and all(r in doc["species"] for r in rocks)
    for entry in doc["species"].values():
        assert 1 <= len(entry["points"]) <= 20_000


def test_rotate_yxz_matches_the_base_plane_normal():
    for yaw, tx, tz in [(0.3, 0.2, -0.1), (2.0, -0.3, 0.25), (5.9, 0.0, 0.0)]:
        assert rotate_yxz(0, 1, 0, yaw, tx, tz) == tuple(
            __import__("pytest").approx(v) for v in base_plane_normal(yaw, tx, tz))


def test_the_rim_demands_sink_where_the_plane_did_not():
    # The owner's rock at 1.59 km E / 2.30 km S (round 5): a pile on a 30°
    # slope, yaw 97°, tilt 11.6°/-1.1°, scale 0.88. The plane census passed
    # it buried 1.35 m; its mesh stood 1.28 m off the ground on one bearing.
    species = "vanilla:landscape/rocks/rockpilel01"
    profile = rd.bottom_profile(species)
    assert profile
    args = (Slope(), 0.0, 0.0, math.radians(97.4), math.radians(11.6), math.radians(-1.1), 0.88)
    plane_demand, _ = burial(Slope(), _layer(species, None), *args[1:])
    rim_demand, cap = burial(Slope(), _layer(species, profile), *args[1:])
    assert rim_demand > plane_demand
    # Whether the pile is then seated deeper or refused is the cap's call;
    # either way it does not ship hanging.
