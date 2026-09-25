"""The designed sink miner reads only terrain-supported references (16h round 10)."""

from pathlib import Path

import pytest

pytest.importorskip("trimesh")

from .mine_designed_sink import (PLUGIN_UNSUPPORTED_SILL, STATIC_SUPPORTED_SILL, build_document,
                                 complete_record)
from .mine_mounts import static_supported_refs
from .test_mine_mounts import (_ALL_BASES, _BASES, _LAND_OFFSET, _MESHES, _box, _kit,
                               _plugin_file)


def _sink(tmp_path, chair_z: float, chair_dx: float = 0.0) -> dict:
    """Three walls on the LAND (-1.14 m) and three chairs at ``chair_z``,
    ``chair_dx`` metres east of each wall."""
    refs = []
    for i in range(3):
        refs += [(0x01000C01 + 2 * i, _BASES["wall"][0], (10.0 * i, 0.0, -1.14), 0.0),
                 (0x01000C02 + 2 * i, _BASES["chair"][0], (10.0 * i + chair_dx, 0.0, chair_z), 0.0)]
    path = _plugin_file(tmp_path / "Yard.esm", _ALL_BASES,
                        {(0, 0): {"refs": refs, "land": _LAND_OFFSET}})
    kits = {f"vanilla:test/{n}01": _kit(_MESHES[n]) for n in ("wall", "chair")}
    meshes = {f"vanilla:test/{n}01": _MESHES[n] for n in ("wall", "chair")}
    plugins = [("vanilla", path)]
    supported = static_supported_refs(kits, Path("/nonexistent"), plugins=plugins,
                                      meshes=meshes.get)
    tells = {"vanilla:test/chair01": {"tell": "post-foot", "valueM": 0.0}}
    return build_document(kits, Path("/nonexistent"), tells=tells, plugins=plugins,
                          supported=supported)


def test_a_piece_standing_on_a_static_is_not_read_against_the_heightmap(tmp_path):
    """Chairs on the walls' tops (4 m above the LAND) would read a -4 m sink;
    they stand on a mesh, so the mesh tell gives the sink instead."""
    chair = _sink(tmp_path, 2.86)["assets"]["vanilla:test/chair01"]
    assert (chair["evidence"], chair["p50"], chair["refsDroppedStaticSupported"]) == (
        STATIC_SUPPORTED_SILL, 0.0, 3), chair


def test_a_piece_on_the_terrain_keeps_its_plugin_sink(tmp_path):
    chair = _sink(tmp_path, -1.14, chair_dx=5.0)["assets"]["vanilla:test/chair01"]
    assert (chair["evidence"], chair["n"]) == ("plugin", 3), chair
    assert "refsDroppedStaticSupported" not in chair


def test_a_piece_floating_clear_of_the_land_is_not_a_ground_line(tmp_path):
    """Round 13 decision 4 (totem03): chairs whose bottom stands 1 m above the
    LAND with nothing under them stand on something no contact test saw; they
    do not vote for the sink and the mesh tell decides."""
    document = _sink(tmp_path, -0.14, chair_dx=5.0)
    chair = document["assets"]["vanilla:test/chair01"]
    assert (chair["evidence"], chair["p50"], chair["refsDroppedPluginUnsupported"]) == (
        PLUGIN_UNSUPPORTED_SILL, 0.0, 3), chair
    assert document["refsPluginUnsupported"] == 3


def test_a_piece_set_into_a_neighbour_but_touching_the_land_keeps_its_plugin_sink(tmp_path):
    """Round 18 ruling 2 (overlapping stone walls, rocks): a barrier whose foot
    is set into a plank lying on the LAND also reaches the terrain (lowest
    point 0.10 m under it): the terrain wins, it stays in the sink sample.
    Round 16 dropped it as static-supported."""
    plank = _box((-1.0, -0.2, -0.11), (1.0, 0.2, 0.0))
    barrier = _box((-0.5, -0.05, -0.15), (0.5, 0.05, 1.0))
    bases = [(0x01000808, b"STAT", "Test\\Plank01.nif", None),
             (0x01000809, b"STAT", "Test\\Barrier01.nif", None)]
    refs = []
    for i in range(3):
        refs += [(0x01000C01 + 2 * i, 0x01000808, (10.0 * i, 0.0, -1.09), 0.0),
                 (0x01000C02 + 2 * i, 0x01000809, (10.0 * i, 0.0, -1.09), 0.0)]
    path = _plugin_file(tmp_path / "Yard.esm", bases,
                        {(0, 0): {"refs": refs, "land": _LAND_OFFSET}})
    kits = {"vanilla:test/plank01": _kit(plank), "vanilla:test/barrier01": _kit(barrier)}
    meshes = {"vanilla:test/plank01": plank, "vanilla:test/barrier01": barrier}
    plugins = [("vanilla", path)]
    supported = static_supported_refs(kits, Path("/nonexistent"), plugins=plugins,
                                      meshes=meshes.get)
    assert supported == set()
    document = build_document(kits, Path("/nonexistent"), tells={}, plugins=plugins,
                              supported=supported)
    row = document["assets"]["vanilla:test/barrier01"]
    assert (row["evidence"], row["n"]) == ("plugin", 3), row
    assert "refsDroppedStaticSupported" not in row


def test_a_structure_whose_plugin_sink_spreads_takes_its_mesh_tell():
    """Round 20 fix (b) (M19 ruling 3, scoped): housetronc001 (architecture,
    n 4, IQR 41.6 m on a 55.6 m mesh) takes its mesh tell; a rock with the same
    spread keeps its plugin row (0075); a structure with n >= 6 and a spread
    under half its height keeps it; a second completion is idempotent."""
    from .mine_designed_sink import PLUGIN_SPREAD_SILL

    def plugin(n, iqr):
        return {"p25": 0.0, "p50": 15.64, "p75": iqr, "n": n, "iqrM": iqr,
                "slopeTermMPerDeg": None, "evidence": "plugin"}
    kits = {"a:trunk": {"category": "architecture", "sizeM": [9.0, 9.0, 55.6]},
            "a:rock": {"category": "rock", "sizeM": [9.0, 9.0, 55.6]},
            "a:wall": {"category": "architecture", "sizeM": [4.0, 1.0, 4.0]},
            "a:tall": {"category": "ruin", "sizeM": [4.0, 1.0, 1.5]}}
    assets = {"a:trunk": plugin(4, 41.6), "a:rock": plugin(4, 41.6),
              "a:wall": plugin(8, 1.2), "a:tall": plugin(8, 1.2)}
    tells = {aid: {"tell": "post-foot", "valueM": -23.87} for aid in kits}
    counts = complete_record(assets, kits, tells, bases={})
    assert counts["plugin-spread"] == 2
    got = {aid: (row["evidence"], row["p50"]) for aid, row in assets.items()}
    assert got == {"a:trunk": (PLUGIN_SPREAD_SILL, -23.87), "a:rock": ("plugin", 15.64),
                   "a:wall": ("plugin", 15.64), "a:tall": (PLUGIN_SPREAD_SILL, -23.87)}
    assert assets["a:trunk"]["pluginSpread"]["iqrM"] == 41.6
    complete_record(assets, kits, tells, bases={})
    assert {aid: (row["evidence"], row["p50"]) for aid, row in assets.items()} == got
