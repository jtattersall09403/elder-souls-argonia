"""wb.py audit-interior on synthetic cells: it fails on a floating piece, a
dropped hearth fire and a shell on a LOD swatch (16k walk 6)."""
import numpy as np
import trimesh

from workbench import interior_audit as ia


def _cell(table_lift: float):
    floor = trimesh.creation.box((6, 0.2, 6))
    floor.apply_translation((0, -0.1, 0))
    table = trimesh.creation.box((1, 0.8, 1))
    table.apply_translation((0, 0.4 + table_lift, 0))
    mesh = trimesh.util.concatenate([floor, table])
    owner = np.array([0] * len(floor.faces) + [1] * len(table.faces))
    return mesh, owner


def test_a_table_on_the_floor_is_supported_and_one_in_the_air_is_not():
    mesh, owner = _cell(0.0)
    assert ia.isup.contact_gaps(mesh, owner, 2)[1] <= ia.SUPPORT_M
    mesh, owner = _cell(0.3)
    assert ia.isup.contact_gaps(mesh, owner, 2)[1] > ia.SUPPORT_M


def test_a_lamp_hung_from_a_beam_and_a_plate_on_a_wall_are_supported():
    beam = trimesh.creation.box((4, 0.2, 0.2))
    beam.apply_translation((0, 3.0, 0))
    lamp = trimesh.creation.box((0.3, 0.6, 0.3))
    lamp.apply_translation((0, 2.6, 0))          # top at 2.9, the beam's underside
    wall = trimesh.creation.box((0.2, 3, 4))
    wall.apply_translation((2.0, 1.5, 0))
    plate = trimesh.creation.box((0.05, 0.3, 0.3))
    plate.apply_translation((1.875, 1.7, 0))     # back face on the wall's face (1.9)
    mesh = trimesh.util.concatenate([beam, lamp, wall, plate])
    owner = np.repeat([0, 1, 2, 3], [len(beam.faces), len(lamp.faces), len(wall.faces), len(plate.faces)])
    g = ia.isup.contact_gaps(mesh, owner, 4)
    assert g[1] <= ia.SUPPORT_M and g[3] <= ia.SUPPORT_M
    lamp.apply_translation((0, -0.4, 0))
    mesh = trimesh.util.concatenate([beam, lamp, wall, plate])
    assert ia.isup.contact_gaps(mesh, owner, 4)[1] > ia.SUPPORT_M


def test_two_runs_give_identical_gaps():
    mesh, owner = _cell(0.02)
    a = ia.isup.contact_gaps(mesh, owner, 2)
    b = ia.isup.contact_gaps(mesh, owner, 2)
    assert np.array_equal(a, b) and abs(a[1] - 0.02) < 1e-6


def test_settle_drops_a_bowl_proud_of_its_table_and_leaves_one_far_above():
    mesh, owner = _cell(0.08)
    bundle = {"placements": [{"id": "floor", "category": "architecture", "positionM": [0, 0, 0]},
                             {"id": "t", "category": "furniture", "positionM": [0, 0.08, 0]}]}
    rows = ia.isup.settle(bundle, mesh, owner)
    assert rows == [{"id": "t", "dropM": 0.08}] and abs(bundle["placements"][1]["positionM"][1]) < 1e-6
    mesh, owner = _cell(0.3)
    bundle["placements"][1]["positionM"] = [0, 0.3, 0]
    assert ia.isup.settle(bundle, mesh, owner) == []


class _Kits:
    def __init__(self, stand_in):
        self.assets = {("k", "shell"): {"id": "shell", "category": "misc", "sizeM": [15, 8, 14], "textures": ["ceramic01teal_d.dds"]}}
        self.subst = {"k": {"ceramic01teal_d.dds": stand_in}}
        self.missing = {"k": set()}
        self.parts = {}


def test_a_shell_on_a_lod_swatch_is_red_and_on_a_real_texture_is_not():
    bundle = {"placements": [{"kit": "k", "assetId": "shell", "positionM": [0, 0, 0]}]}
    rows = ia.texture_rows(bundle, _Kits("textures/lod/ceramic01teal_dlod.dds"))
    assert any("LOD" in r["why"] for r in rows)
    rows = ia.texture_rows(bundle, _Kits("textures/architecture/solitude/sstuccowallint01.dds"))
    assert not any("LOD" in r["why"] for r in rows)


def test_only_furniture_and_hearths_are_living_zones(tmp_path):
    # 0109 rule 4 lights living zones; a beast's cave (rock, bones, a chest)
    # has none and keeps its plugin's own lights (16k walk 9)
    import json
    (tmp_path / "k.kit.json").write_text(json.dumps({"assets": [
        {"id": "bed", "category": "furniture"}, {"id": "cave/wall", "category": "dungeon-kit"},
        {"id": "chest", "category": "container"}, {"id": "stonefireplace01", "category": "misc"}]}))
    k = ia.Kits(tmp_path)
    assert k.living("k", "bed") and k.living("k", "stonefireplace01")
    assert not k.living("k", "cave/wall") and not k.living("k", "chest")


def test_a_dropped_plugin_hearth_fire_is_red():
    k = _Kits("x")
    bundle = {"placements": [], "drops": [{"refId": "1", "base": "FXfireWithEmbersLogs01"}]}
    assert ia.hearth_rows(bundle, k)
    assert not ia.hearth_rows({"placements": [], "drops": []}, k)


def test_a_table_top_is_not_reachable_floor():
    floor = trimesh.creation.box((6, 0.2, 6))
    floor.apply_translation((0, -0.1, 0))
    roof = trimesh.creation.box((6, 0.2, 6))
    roof.apply_translation((0, 4.1, 0))
    table = trimesh.creation.box((2, 0.8, 2))
    table.apply_translation((1.5, 0.4, 1.5))
    base = trimesh.util.concatenate([floor, roof])
    base_owner = np.repeat([0, 1], [len(floor.faces), len(roof.faces)])
    with_table = trimesh.util.concatenate([floor, roof, table])
    owner = np.repeat([0, 1, 2], [len(floor.faces), len(roof.faces), len(table.faces)])
    start = [[-2.0, 0.0, -2.0]]
    bare, how = ia.reachable_floor_m2(base, base_owner, start)
    furnished, how2 = ia.reachable_floor_m2(with_table, owner, start)
    assert how == how2 == "reached"
    assert bare > 30.0
    # the table's 4 m2 is gone from the floor and its top is not added back
    assert furnished <= bare - 3.0


def test_a_rug_on_the_floor_is_not_a_second_floor():
    floor = trimesh.creation.box((6, 0.2, 6))
    floor.apply_translation((0, -0.1, 0))
    roof = trimesh.creation.box((6, 0.2, 6))
    roof.apply_translation((0, 4.1, 0))
    rug = trimesh.creation.box((2, 0.06, 2))
    rug.apply_translation((0, 0.03, 0))
    bare = trimesh.util.concatenate([floor, roof])
    with_rug = trimesh.util.concatenate([floor, roof, rug])
    start = [[-2.0, 0.0, -2.0]]
    a, _ = ia.reachable_floor_m2(bare, np.repeat([0, 1], [12, 12]), start)
    b, _ = ia.reachable_floor_m2(with_rug, np.repeat([0, 1, 2], [12, 12, 12]), start)
    assert abs(a - b) < 0.5


def _stair_cell(stair_bottom: float):
    """A floor (top at y 0), a 3 m stair block whose bottom sits at
    `stair_bottom` and a landing at its top on the +x side."""
    floor = trimesh.creation.box((6, 0.2, 6))
    floor.apply_translation((0, -0.1, 0))
    stair = trimesh.creation.box((1, 3, 2))
    stair.apply_translation((0, stair_bottom + 1.5, 0))
    landing = trimesh.creation.box((2, 0.2, 2))
    landing.apply_translation((1.5, stair_bottom + 2.9, 0))
    mesh = trimesh.util.concatenate([floor, stair, landing])
    owner = np.repeat([0, 1, 2], [len(floor.faces), len(stair.faces), len(landing.faces)])
    bundle = {"placements": [{"id": f"p{k}", "assetId": a} for k, a in
                             enumerate(("floor02", "mudhutintstairs", "landing"))]}
    return bundle, mesh, owner


def test_a_stair_foot_sunk_under_its_floor_lands_and_one_in_the_air_does_not():
    # KeebaHouseSnailMinder: the plugin sinks the stringer 0.83 m through floor02
    assert ia.stair_rows(*_stair_cell(-0.8)) == []
    rows = ia.stair_rows(*_stair_cell(0.4))
    assert len(rows) == 1 and rows[0]["bottomGapM"] > 0.3
