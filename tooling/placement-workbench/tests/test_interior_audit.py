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
    assert ia.support_gaps(mesh, owner, 2)[1] <= ia.SUPPORT_M
    mesh, owner = _cell(0.3)
    assert ia.support_gaps(mesh, owner, 2)[1] > ia.SUPPORT_M


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


def test_a_dropped_plugin_hearth_fire_is_red():
    k = _Kits("x")
    bundle = {"placements": [], "drops": [{"refId": "1", "base": "FXfireWithEmbersLogs01"}]}
    assert ia.hearth_rows(bundle, k)
    assert not ia.hearth_rows({"placements": [], "drops": []}, k)
