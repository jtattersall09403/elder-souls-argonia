"""Footprint measurer tests (Part 6, owner ruling 2026-09-05).

Kits are derived output and gitignored, so these skip in a checkout that has
not built them.
"""

import json

import pytest

from . import measure_footprints as mf

KIT = "settlement-stilt-v1"
STILT_HOUSE = "bmv:architecture/stilthouse/stilthouseext"


@pytest.fixture(scope="module")
def measured():
    if not (mf.KITS_DIR / f"{KIT}.glb").exists():
        pytest.skip("kits are not built in this checkout")
    return mf.measure_kit(KIT)


def test_convex_hull_is_convex_and_ordered():
    square = [(0, 0), (2, 0), (2, 2), (0, 2), (1, 1)]
    hull = mf.convex_hull_2d(square)
    assert len(hull) == 4                       # the interior point is dropped
    assert hull[0] == [0.0, 0.0]                # canonical start vertex
    signs = []
    for i in range(len(hull)):
        o, a, b = hull[i], hull[(i + 1) % len(hull)], hull[(i + 2) % len(hull)]
        signs.append((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]))
    assert all(s > 0 for s in signs)            # one consistent turn direction
    assert mf.polygon_area(hull) == pytest.approx(4.0)


def test_every_manifest_asset_is_measured(measured):
    manifest = json.loads((mf.KITS_DIR / f"{KIT}.kit.json").read_text())
    assert set(measured["assets"]) == {a["id"] for a in manifest["assets"]}
    assert measured["schemaVersion"] == mf.SCHEMA_VERSION


def test_measured_outline_matches_the_manifest_bounds(measured):
    record = measured["assets"][STILT_HOUSE]
    assert record["areaM2"] > 0
    assert len(record["footprintM"]) >= 3
    assert len(record["planOutlineM"]) >= 3
    assert record["groundBandM"] == mf.GROUND_BAND_M
    # kit.json sizeM is Blender Z-up [x, y, z]; the GLB is Y-up, so the plan
    # extents are sizeM[0] x sizeM[1] and the height is sizeM[2].
    manifest = json.loads((mf.KITS_DIR / f"{KIT}.kit.json").read_text())
    size = next(a["sizeM"] for a in manifest["assets"] if a["id"] == STILT_HOUSE)
    assert record["widthM"] == pytest.approx(size[0], abs=0.05)
    assert record["depthM"] == pytest.approx(size[1], abs=0.05)
    assert record["heightM"] == pytest.approx(size[2], abs=0.05)


def test_measurement_is_deterministic(measured):
    assert json.dumps(mf.measure_kit(KIT), sort_keys=True) == json.dumps(measured, sort_keys=True)


def test_a_buried_shell_is_measured_at_its_designed_sink_plane():
    """16k fix 2 ruling 3: the KotM house pod stands 8.7 m into the ground
    (designedSinkM above a pivot 6.7 m over its tip: 1.9922 since walk 2
    round 5, the porch smpodextdoor's plugin sink 0.7693 carried through its
    offsetM z 1.2229, `part:` evidence; the base pod's 1.647 before). Its footprint is
    the ring at the ground plane, not the 5.3 m2 buried tip, so the free-pose
    search and walkRule treat the pod as solid."""
    kit = "settlement-mud-v1"
    if not (mf.KITS_DIR / f"{kit}.glb").exists():
        pytest.skip("built kits unavailable")
    rec = mf.measure_kit(kit)["assets"]["composite:mud/kotm-house-pod"]
    xs = [p[0] for p in rec["footprintM"]]
    zs = [p[1] for p in rec["footprintM"]]
    assert rec["groundPlaneM"] == pytest.approx(1.992, abs=0.01)
    assert max(xs) - min(xs) > 11.0 and max(zs) - min(zs) > 11.0
    assert rec["areaM2"] > 100.0
