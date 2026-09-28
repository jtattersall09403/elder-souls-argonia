"""The designed sink miner reads only terrain-supported references (16h round 10)."""

import json
from pathlib import Path

import pytest

pytest.importorskip("trimesh")

from .mine_designed_sink import (PLUGIN_UNSUPPORTED_SILL, STATIC_SUPPORTED_SILL, build_document,
                                 complete_record)
from .mine_mounts import static_supported_refs
from .test_mine_mounts import (_ALL_BASES, _BASES, _LAND_OFFSET, _MESHES, _box, _kit, _master_form,
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


def test_a_composite_that_poses_its_base_as_placed_takes_the_base_plugin_sink():
    """Walk 2 lane P (planner 2026-09-27): `composite:mud/kotm-house-pod` turns
    its pod over as the plugin places it (part 0 pitch 180, roll 8.11, no
    offset) and adds the porch and door, so its bounds are its own; its pivot
    is still the pod's pivot and the pod's plugin references ARE its
    placements, so it takes the pod's sink (base:<id>). An upright composite
    with bounds of its own (a quay run) keeps its tell (round 14)."""
    plugin = {"p25": 1.0168, "p50": 1.6468, "p75": 1.915, "n": 7, "iqrM": 0.8982,
              "slopeTermMPerDeg": None, "evidence": "plugin"}
    kits = {"k:pod": {"sizeM": [13.557, 13.918, 13.877], "originOffsetM": [7.445, 7.724, 7.179]},
            "composite:pod-house": {"sizeM": [13.621, 14.914, 13.747],
                                    "originOffsetM": [7.967, 7.19, 6.725]},
            "k:deck": {"sizeM": [7.0, 4.0, 3.0], "originOffsetM": [3.5, 2.0, 2.0]},
            "composite:quay": {"sizeM": [7.0, 11.0, 3.0], "originOffsetM": [3.5, 9.0, 2.0]}}
    assets = {"k:pod": dict(plugin), "k:deck": dict(plugin)}
    tells = {"composite:pod-house": {"tell": "foundation-top", "valueM": 4.1984},
             "composite:quay": {"tell": "deck-top", "valueM": -0.31}}
    counts = complete_record(assets, kits, tells,
                             bases={"composite:pod-house": "k:pod", "composite:quay": "k:deck"},
                             posed={"composite:pod-house"})
    assert counts["base"] == 1 and counts["mesh-sill"] == 1
    house = assets["composite:pod-house"]
    assert (house["p50"], house["n"], house["evidence"]) == (1.6468, 7, "base:k:pod")
    assert assets["composite:quay"]["evidence"] == "mesh-sill"


def test_composite_posed_bases_reads_part_zero_pitch_and_roll(tmp_path):
    (tmp_path / "k.json").write_text(json.dumps({"assets": [
        {"asset": "composite:a", "compose": {"parts": [
            {"asset": "k:pod", "scale": 1.0, "pitchDeg": 180.0, "rollDeg": 8.11}, {"asset": "k:x"}]}},
        {"asset": "composite:b", "compose": {"parts": [{"asset": "k:deck"}, {"asset": "k:deck"}]}},
    ]}))
    from .mine_designed_sink import composite_posed_bases
    assert composite_posed_bases(tmp_path) == {"composite:a"}


def test_a_composite_seated_by_a_named_part_takes_its_sink_through_the_offset():
    """Walk 2 round 5 (planner 2026-09-27): the KotM pod house is seated by its
    porch, the entrance the plugin builds: porch p50 0.7693 + the porch's
    offsetM z 1.2229 = 1.9922 at the pod's pivot. Fails on the base rule, which
    gave the pod's own 1.6468."""
    pod = {"p25": 1.0168, "p50": 1.6468, "p75": 1.915, "n": 7, "iqrM": 0.8982,
           "slopeTermMPerDeg": None, "evidence": "plugin"}
    porch = {"p25": 0.6921, "p50": 0.7693, "p75": 0.8191, "n": 4, "iqrM": 0.127,
             "slopeTermMPerDeg": None, "evidence": "plugin"}
    kits = {"k:pod": {"sizeM": [1, 1, 1], "originOffsetM": [0, 0, 0]},
            "k:porch": {"sizeM": [1, 1, 1], "originOffsetM": [0, 0, 0]},
            "composite:house": {"sizeM": [2, 2, 2], "originOffsetM": [0, 0, 0]}}
    assets = {"k:pod": dict(pod), "k:porch": dict(porch)}
    counts = complete_record(
        assets, kits, {}, bases={"composite:house": "k:pod"}, posed={"composite:house"},
        part_offsets={"composite:house": {"k:pod": [{"asset": "k:pod"}],
                                          "k:porch": [{"asset": "k:porch", "offsetM": [-0.2993, -3.3566, 1.2229]}]}},
        seated_by={"composite:house": ("k:porch", "ruling")})
    house = assets["composite:house"]
    assert counts["part"] == 1 and counts["base"] == 0
    assert (house["p50"], house["p25"], house["n"], house["evidence"]) == (1.9922, 1.915, 4, "part:k:porch")
    assert house["seatedBy"] == {"part": "k:porch", "partP50": 0.7693, "partOffsetZM": 1.2229,
                                 "ruling": "ruling"}
    # idempotent on a re-run
    complete_record(assets, kits, {}, bases={"composite:house": "k:pod"}, posed={"composite:house"},
                    part_offsets={"composite:house": {"k:porch": [{"asset": "k:porch", "offsetM": [0, 0, 1.2229]}]}},
                    seated_by={"composite:house": ("k:porch", "ruling")})
    assert assets["composite:house"]["p50"] == 1.9922


def test_a_part_seat_refuses_what_a_z_offset_cannot_carry():
    """Review 2026-09-27: a seating part placed twice, scaled, pitched or under
    a scaled anchor, or with no plugin row, is refused, never shifted by z."""
    import pytest
    from .mine_designed_sink import seat_row
    porch = {"p25": 0.6, "p50": 0.7, "p75": 0.8, "n": 4, "iqrM": 0.2,
             "slopeTermMPerDeg": None, "evidence": "plugin"}
    one = {"asset": "k:porch", "offsetM": [0, 0, 1.0]}
    assert seat_row("c", "k:porch", "r", porch, [one])["p50"] == 1.7
    for entries, source, why in (([one, one], porch, "placed 2 times"),
                                 ([{**one, "scale": 1.3}], porch, "scale"),
                                 ([{**one, "pitchDeg": 180.0}], porch, "pitchDeg"),
                                 ([{**one, "_anchorScale": 1.3}], porch, "anchorScale"),
                                 ([one], None, "no plugin sink"),
                                 (None, porch, "not one of its parts")):
        with pytest.raises(ValueError, match=why):
            seat_row("c", "k:porch", "r", source, entries)


def test_a_merge_run_of_the_composite_alone_reads_the_parts_committed_row():
    """Review 2026-09-27: `--merge --assets <composite>` measures the composite
    without its porch; the porch's committed plugin row (``known``) seats it."""
    porch = {"p25": 0.6, "p50": 0.7, "p75": 0.8, "n": 4, "iqrM": 0.2,
             "slopeTermMPerDeg": None, "evidence": "plugin"}
    kits = {"composite:house": {"sizeM": [2, 2, 2], "originOffsetM": [0, 0, 0]}}
    assets: dict = {}
    complete_record(assets, kits, {}, bases={}, posed=set(),
                    part_offsets={"composite:house": {"k:porch": [{"asset": "k:porch", "offsetM": [0, 0, 1.0]}]}},
                    seated_by={"composite:house": ("k:porch", "r")}, known={"k:porch": porch})
    assert assets["composite:house"]["p50"] == 1.7


def test_the_kotm_pod_house_record_is_seated_by_its_porch():
    from .mine_designed_sink import DEFAULT_OUT
    row = json.loads(DEFAULT_OUT.read_text())["assets"]["composite:mud/kotm-house-pod"]
    assert (row["p50"], row["evidence"]) == (1.9922, "part:kotm:argonia/mudhuts/smpodextdoor")
    shell = json.loads(DEFAULT_OUT.read_text())["assets"]["kotm:argonia/mudhuts/smpodext02"]
    assert shell["p50"] == 1.6468


def test_a_composite_takes_its_base_sink_at_the_scale_it_places_the_base(tmp_path):
    """Planner ruling 2026-09-27 (scaled references, 16k slice 2): BM&V
    places all 11 ``hutexterior`` references at scale 1.30, so no unit-scale
    sample survives. The samples are grouped by placement scale; a composite
    whose part 0 is the base at 1.3 takes that group's plugin sink
    (``base:<id>@1.30``), never the mesh-sill. The bare base keeps its mesh
    tell and the count of the references the unit-scale sample dropped."""
    from .mine_designed_sink import measure, summarise
    from .test_mine_mounts import _plugin
    from .esp_index import UNITS_PER_METRE
    wall, land = _BASES["wall"][0], _LAND_OFFSET * 8 / UNITS_PER_METRE
    refs = [(0x01000C01 + i, wall, (10.0 * i, 0.0, land - 0.3), 0.0, 1.3) for i in range(3)]
    plugins = [("vanilla", _plugin(tmp_path, _ALL_BASES, refs))]
    kits = {"vanilla:test/wall01": _kit(_MESHES["wall"]),
            "composite:wall-house": {"sizeM": [6.0, 3.0, 5.2], "originOffsetM": [2.6, 1.5, 0.0]}}
    samples, _stats = measure(kits, Path("/nonexistent"), plugins=plugins, supported=set())
    assets = summarise(samples)
    tells = {"vanilla:test/wall01": {"type": "mesh", "tell": "floor-plane", "valueM": 0.0},
             "composite:wall-house": {"type": "mesh", "tell": "floor-plane", "valueM": 0.0}}
    counts = complete_record(assets, kits, tells,
                             bases={"composite:wall-house": "vanilla:test/wall01"},
                             posed=set(), part_offsets={}, seated_by={},
                             base_scales={"composite:wall-house": 1.3})
    house = assets["composite:wall-house"]
    assert (house["evidence"], house["p50"], house["n"]) == (
        "base:vanilla:test/wall01@1.30", 0.3, 3), house
    assert counts["base"] == 1
    base = assets["vanilla:test/wall01"]
    assert (base["evidence"], base["refsDroppedNonUnitScale"]) == ("mesh-sill", 3), base
    assert base["byScale"]["1.30"]["p50"] == 0.3


def test_composite_base_scales_reads_part_zero_scale(tmp_path):
    (tmp_path / "k.json").write_text(json.dumps({"assets": [
        {"asset": "composite:a", "compose": {"parts": [{"asset": "k:hut", "scale": 1.3},
                                                       {"asset": "k:x", "offsetM": [1, 0, 0]}]}},
        {"asset": "composite:b", "compose": {"parts": [{"asset": "k:deck", "scale": 1.0}]}},
        {"asset": "composite:c", "compose": {"parts": [{"asset": "k:deck", "scale": 2.0,
                                                        "offsetM": [0, 1, 0]}]}},
    ]}))
    from .mine_designed_sink import composite_base_scales
    assert composite_base_scales(tmp_path) == {"composite:a": 1.3}


def test_a_scaled_base_group_needs_the_base_in_the_kits():
    """A composite takes a base's byScale group only when the base is a kit
    asset, as the same-shape base rule requires (review 2026-09-27)."""
    group = {"p25": 0.1, "p50": 0.3, "p75": 0.4, "n": 3, "iqrM": 0.3}
    kits = {"composite:h": {"sizeM": [6.0, 3.0, 5.2], "originOffsetM": [2.6, 1.5, 0.0]}}
    assets = {"k:hut": {"byScale": {"1.30": group}}}
    tells = {"composite:h": {"type": "mesh", "tell": "floor-plane", "valueM": 0.0}}
    complete_record(assets, kits, tells, bases={"composite:h": "k:hut"}, posed=set(),
                    part_offsets={}, seated_by={}, base_scales={"composite:h": 1.3})
    assert assets["composite:h"]["evidence"] == "mesh-sill"


def _override(tmp_path, child_land=None, master_land=_LAND_OFFSET, drop=0.5):
    """R12 fixture: Master.esm owns the cell and its LAND (-1.14 m); Child.esp
    overrides the cell (``child_land``: none, or a VHGT offset) and places
    three of the master's chairs ``drop`` metres into the master's ground."""
    from .esp_index import UNITS_PER_METRE
    ground = master_land * 8 / UNITS_PER_METRE
    master = _plugin_file(tmp_path / "Master.esm", _ALL_BASES,
                          {(0, 0): {"land": master_land}})
    chairs = [(0x01000C21 + i, _master_form("chair"), (float(i), 0.0, ground - drop), 0.0)
              for i in range(3)]
    child = _plugin_file(tmp_path / "Child.esp", [],
                         {(0, 0): {"refs": chairs, "land": child_land}},
                         masters=("Master.esm",), world=0x00000B00, cell_base=0x00000A00)
    kits = {"vanilla:test/chair01": _kit(_MESHES["chair"])}
    tells = {"vanilla:test/chair01": {"type": "mesh", "tell": "floor-plane", "valueM": 0.0}}
    return build_document(kits, Path("/nonexistent"), tells=tells, supported=set(),
                          plugins=[("vanilla", child), ("vanilla", master)])


def test_r12_an_override_cell_without_land_reads_the_masters_ground(tmp_path):
    """R12 (16k walk 3): the Skyfall Hist tree and the Mud Mother .esl place
    their pieces in a master's cell and carry no LAND for it. Before R12 the
    references found no terrain and the row fell back to the mesh tell."""
    document = _override(tmp_path)
    chair = document["assets"]["vanilla:test/chair01"]
    assert (chair["evidence"], chair["n"], chair["refsMasterLand"]) == ("plugin", 3, 3), chair
    assert abs(chair["p50"] - 0.5) < 0.01, chair
    assert "fallback" not in chair
    assert (document["refsMasterLand"], document["refsNoLand"]) == (3, 0)
    assert document["sinkFallback"]["rows"] == 0


def test_r12_the_placing_files_own_real_land_wins(tmp_path):
    """A file that carries real LAND for its cell is read on its own ground,
    never its master's (the chairs stand 0.5 m into the master's ground and
    about 2.8 m above the child's)."""
    chair = _override(tmp_path, child_land=-30.0)["assets"]["vanilla:test/chair01"]
    assert "refsMasterLand" not in chair
    assert chair.get("n", 0) == 0 or chair["p50"] < -2.0, chair


def test_r12_a_flat_placeholder_yields_to_the_masters_real_land(tmp_path):
    """A flat LAND (BM&V placeholders; ``mine_mounts.is_placeholder_land``)
    is no ground while a master holds real terrain for the cell."""
    from .esp_index import LandData
    from .mine_designed_sink import is_real_land
    assert not is_real_land(LandData(heights=[[3.0, 3.0], [3.0, 3.0]]))
    assert is_real_land(LandData(heights=[[3.0, 3.0], [3.0, 4.0]]))
    assert not is_real_land(None)


def test_r12_no_land_anywhere_is_counted_and_the_fallback_is_flagged(tmp_path):
    """A reference with no LAND in its file or any master is counted on its
    row (never silently dropped) and the mesh-sill row says it is a fallback."""
    from .esp_index import UNITS_PER_METRE  # noqa: F401
    master = _plugin_file(tmp_path / "Master.esm", _ALL_BASES, {(5, 5): {"land": None}})
    chairs = [(0x01000C31 + i, _master_form("chair"), (float(i), 0.0, 0.0), 0.0)
              for i in range(3)]
    child = _plugin_file(tmp_path / "Child.esp", [], {(0, 0): {"refs": chairs}},
                         masters=("Master.esm",), world=0x00000B00, cell_base=0x00000A00)
    kits = {"vanilla:test/chair01": _kit(_MESHES["chair"])}
    tells = {"vanilla:test/chair01": {"type": "mesh", "tell": "floor-plane", "valueM": 0.0}}
    document = build_document(kits, Path("/nonexistent"), tells=tells, supported=set(),
                              plugins=[("vanilla", child), ("vanilla", master)])
    chair = document["assets"]["vanilla:test/chair01"]
    assert (chair["evidence"], chair["refsNoLand"], chair["fallback"]) == (
        "mesh-sill", 3, True), chair
    assert document["refsNoLand"] == 3
    assert document["sinkFallback"]["rows"] == 1
    assert document["sinkFallback"]["byEvidence"] == {"mesh-sill": 1}


def test_a_texture_variant_takes_its_bases_row():
    """Walk 3 L5 rec 2 (miner side): the sick Hist tree ships the healthy
    tree's mesh, so its row is the base's, never its own mesh tell; a plugin
    base reads as swap:<base>."""
    kits = {"k:tree": {"sizeM": [1, 1, 1], "originOffsetM": [0, 0, 0]},
            "k:tree-sick": {"sizeM": [1, 1, 1], "originOffsetM": [0, 0, 0],
                            "variantOf": "k:tree"},
            "k:rock": {"sizeM": [1, 1, 1], "originOffsetM": [0, 0, 0]},
            "k:rock-wet": {"sizeM": [1, 1, 1], "originOffsetM": [0, 0, 0],
                           "variantOf": "k:rock"}}
    assets = {"k:tree": {"p25": -0.7, "p50": -0.6, "p75": -0.5, "n": 4, "iqrM": 0.2,
                         "slopeTermMPerDeg": None, "evidence": "plugin"}}
    tells = {key: {"type": "mesh", "tell": "floor-plane", "valueM": 0.25} for key in kits}
    tells["k:rock"]["valueM"] = -0.4
    counts = complete_record(assets, kits, tells, bases={}, posed=set(), part_offsets={},
                             seated_by={}, base_scales={})
    assert counts["variant"] == 2
    sick = assets["k:tree-sick"]
    assert (sick["evidence"], sick["p50"], sick["variantOf"]) == ("swap:k:tree", -0.6, "k:tree")
    assert "fallback" not in sick
    wet = assets["k:rock-wet"]
    assert (wet["evidence"], wet["p50"], wet["fallback"]) == ("mesh-sill", -0.4, True), wet


def test_the_ground_is_the_cell_under_the_pivot_not_the_parent_cell(tmp_path):
    """R12 follow-on (16k walk 3 full run): SNT ferry.esp keeps its rafts in
    the worldspace's persistent cell, which carries XCLC 0,0, at cell -16,22.
    Reading (0,0)'s LAND (from Skyrim.esm once R12 looked there) set them 116 m
    under the ground. The ground is the LAND of the cell under the pivot."""
    from .esp_index import UNITS_PER_METRE
    ground = _LAND_OFFSET * 8 / UNITS_PER_METRE
    master = _plugin_file(tmp_path / "Master.esm", _ALL_BASES,
                          {(0, 0): {"land": -400.0}, (2, 0): {"land": _LAND_OFFSET}})
    x0 = 2 * 4096 / UNITS_PER_METRE             # the west edge of cell (2, 0)
    chairs = [(0x01000C41 + i, _master_form("chair"), (x0 + 5.0 + i, 5.0, ground - 0.5), 0.0)
              for i in range(3)]
    child = _plugin_file(tmp_path / "Child.esp", [], {(0, 0): {"refs": chairs}},
                         masters=("Master.esm",), world=0x00000B00, cell_base=0x00000A00)
    kits = {"vanilla:test/chair01": _kit(_MESHES["chair"])}
    tells = {"vanilla:test/chair01": {"type": "mesh", "tell": "floor-plane", "valueM": 0.0}}
    document = build_document(kits, Path("/nonexistent"), tells=tells, supported=set(),
                              plugins=[("vanilla", child), ("vanilla", master)])
    chair = document["assets"]["vanilla:test/chair01"]
    assert (chair["evidence"], chair["n"]) == ("plugin", 3), chair
    assert abs(chair["p50"] - 0.5) < 0.01, chair
    assert document["refsOutsideCell"] == 3


def test_a_reference_outside_its_parent_cell_reads_the_pivot_cells_water(tmp_path):
    """L12 review (PLAUSIBLE, confirmed here): a raft in the persistent cell
    (XCLC 0,0, water 0 m) stands in cell (2, 0), whose own water is 3 m. Its
    waterline is read against the pivot cell's 3 m, never the parent's 0 m."""
    from .esp_index import UNITS_PER_METRE
    deep = (_LAND_OFFSET - 4000.0) * 8 / UNITS_PER_METRE     # the bed far under the water
    master = _plugin_file(tmp_path / "Master.esm", _ALL_BASES,
                          {(0, 0): {"land": -400.0, "water": 0.0},
                           (2, 0): {"land": _LAND_OFFSET - 4000.0, "water": 3.0}})
    x0 = 2 * 4096 / UNITS_PER_METRE
    rafts = [(0x01000C41 + i, _master_form("chair"), (x0 + 5.0 + i, 5.0, 2.5), 0.0)
             for i in range(3)]
    child = _plugin_file(tmp_path / "Child.esp", [], {(0, 0): {"refs": rafts, "water": 0.0}},
                         masters=("Master.esm",), world=0x00000B00, cell_base=0x00000A00)
    kits = {"vanilla:test/chair01": _kit(_MESHES["chair"])}
    tells = {"vanilla:test/chair01": {"type": "mesh", "tell": "floor-plane", "valueM": 0.0}}
    document = build_document(kits, Path("/nonexistent"), tells=tells, supported=set(),
                              plugins=[("vanilla", child), ("vanilla", master)])
    raft = document["assets"]["vanilla:test/chair01"]
    assert deep < -10 and document["refsOutsideCell"] == 3
    assert document["refsParentCellWater"] == 0
    # water 3.0 m minus pivot 2.5 m (the parent cell's water read -2.5 m)
    assert abs(raft["waterline"]["p50"] - 0.5) < 0.01, raft


def test_r19_whole_population_divides_a_scaled_sample_by_its_scale():
    """0105 R19: the Skyfall tree's one reference at scale 1.40 sinks 0.941 m;
    the whole-population row reads -0.672 m at unit scale, the full run's
    MIN_SAMPLES row stays empty, and mark_whole_population accepts it."""
    from .mine_designed_sink import AssetSamples, summarise, mark_whole_population, MIN_SAMPLES
    entry = AssetSamples()
    entry.scaled_refs = 1
    entry.by_scale["1.40"].append(-0.941)
    entry.scaled_unit.append(-0.941 / 1.40)
    entry.plugins.add("Skyfall Sleeping Tree Overhaul.esp")
    full = summarise({"tree": entry}, MIN_SAMPLES)["tree"]
    assert "p50" not in full and full["refsDroppedNonUnitScale"] == 1
    row = summarise({"tree": entry}, 1)["tree"]
    assert row["p50"] == -0.6721 and row["n"] == 1 and row["refsScaledNormalised"] == 1
    mark_whole_population("tree", row, "R19")
    assert row["wholePopulation"]["n"] == 1
    entry.scaled_dropped = 1                       # a dropped scaled ref: not the population
    with pytest.raises(SystemExit):
        mark_whole_population("tree", summarise({"tree": entry}, 1)["tree"], "R19")


def test_r19_a_tree_in_shallow_water_is_on_the_ground():
    from .mine_designed_sink import AssetSamples, measure_ref, TREE_SHALLOWS_M
    from . import mine_designed_sink as mds
    from .esp_index import UNITS_PER_METRE

    class Ref:
        pos = (0.0, 0.0, -6100.0)
        scale = 1.0
    terrain = -6075.0
    stats = {"refsNoLand": 0, "refsJoined": 0, "refsPluginUnsupported": 0}
    orig_h, orig_s, orig_b = mds.height_at, mds.slope_degrees_at, mds.bottom_clear_of_land
    mds.height_at = lambda *a: terrain
    mds.slope_degrees_at = lambda *a: 0.0
    mds.bottom_clear_of_land = lambda *a: False
    try:
        shallow, deep = (terrain + d * UNITS_PER_METRE for d in (1.33, TREE_SHALLOWS_M + 0.5))
        for base_type, height, water, grounded in (("TREE", 24.0, shallow, True),
                                                   ("STAT", 24.0, shallow, False),
                                                   ("TREE", 0.2, shallow, False),   # a lily pad
                                                   ("KELP", 12.0, shallow, False),  # tall kelp
                                                   ("TREE", 24.0, deep, False)):
            entry = AssetSamples()
            kit = {"sizeM": [5.0, 5.0, height],
                   **({"category": "aquatic-plant"} if base_type == "KELP" else {})}
            measure_ref(entry, stats, kit, object(),
                        (Ref, (0, 0), water, 1, 2, "TREE" if base_type == "KELP" else base_type), set())
            assert bool(entry.sink) == grounded and bool(entry.waterline) != grounded, base_type
    finally:
        mds.height_at, mds.slope_degrees_at, mds.bottom_clear_of_land = orig_h, orig_s, orig_b


def test_a_merge_of_a_base_carries_its_texture_variants(tmp_path, monkeypatch):
    """L12: `--merge --assets <base>` re-resolves the base's variants (the
    sick Hist tree kept the base's old mesh-sill row after the R19 merge)."""
    from . import mine_designed_sink as mds
    base, sick = "h:tree", "h:tree-sick"
    kits = {base: {"kit": "k", "sizeM": [1, 1, 1], "originOffsetM": [0, 0, 0]},
            sick: {"kit": "k", "sizeM": [1, 1, 1], "originOffsetM": [0, 0, 0], "variantOf": base}}
    old = {"p25": -1.4, "p50": -1.4, "p75": -1.4, "n": 0, "iqrM": 0.0, "evidence": "mesh-sill",
           "groundLineTell": {"type": "mesh", "tell": "post-foot", "valueM": -1.4}}
    out = tmp_path / "sink.json"
    out.write_text(json.dumps({"assets": {base: dict(old), sick: dict(old, variantOf=base)}}))
    new = {"p25": -0.67, "p50": -0.67, "p75": -0.67, "n": 1, "iqrM": 0.0,
           "slopeTermMPerDeg": None, "evidence": "plugin"}
    monkeypatch.setattr(mds, "kit_assets", lambda *a: kits)
    monkeypatch.setattr(mds, "build_document", lambda *a, **k: {"assets": {base: dict(new)}})
    monkeypatch.setattr(mds, "composite_base_scales", lambda: {})
    monkeypatch.setattr(mds, "composite_bases", lambda: {})
    monkeypatch.setattr(mds, "composite_part_offsets", lambda: {})
    assert mds._main(["--merge", "--assets", base, "--out", str(out), "--quiet"]) == 0
    got = json.loads(out.read_text())["assets"][sick]
    assert (got["p50"], got["evidence"], got["variantOf"]) == (-0.67, f"swap:{base}", base)
