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


def test_the_cut_removes_a_rock_that_hangs_at_its_shipped_pose():
    # The owner's pile at 1.59 km E / 2.30 km S (round 5): the plane rule
    # seats it 2.79 m deep on a 30° slope and by its own underside it still
    # stands 1.3 m off the ground on one side. The cut, measured at the
    # encoded pose, drops it; a boulder that sits stays.
    from . import compile_scatter as cs
    from .scatter import Instance, ANCHOR_TERRAIN, Palette
    species = "vanilla:landscape/rocks/rockpilel01"
    layer = _layer(species, rd.bottom_profile(species))
    palette = cs.attach_bottom_profiles(Palette(id="t", layers=[layer]))
    hanging = Instance(species=species, tier="T1", x=0.0, z=0.0, y=0.0,
                       yaw=math.radians(97.4), scale=0.88, tilt_x=math.radians(11.6),
                       tilt_z=math.radians(-1.1), anchor=ANCHOR_TERRAIN, sink=2.79)
    seated = Instance(species=species, tier="T1", x=0.0, z=0.0, y=0.0,
                      yaw=0.0, scale=0.88, tilt_x=0.0, tilt_z=0.0,
                      anchor=ANCHOR_TERRAIN, sink=6.0)
    old = cs.CUT_GAP_M
    cs.CUT_GAP_M = 0.5
    try:
        kept = cs.cut_hanging_rocks([hanging, seated], palette, Slope(), [species])
    finally:
        cs.CUT_GAP_M = old
    assert kept == [seated]
