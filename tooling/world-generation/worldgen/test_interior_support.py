import numpy as np
import trimesh

from .interior_support import settle


def _scene(boxes):
    meshes, owner = [], []
    for i, (lo, hi) in enumerate(boxes):
        m = trimesh.creation.box(bounds=[lo, hi])
        meshes.append(m)
        owner.append(np.full(len(m.faces), i))
    return trimesh.util.concatenate(meshes), np.concatenate(owner)


def test_a_plate_on_a_settled_table_drops_with_it():
    boxes = [([-2, -0.1, -2], [2, 0.0, 2]),          # floor
             ([-0.5, 0.08, -0.5], [0.5, 0.8, 0.5]),  # table stored 8 cm up
             ([-0.1, 0.8, -0.1], [0.1, 0.82, 0.1])]  # plate touching the table
    mesh, owner = _scene(boxes)
    pl = [{"id": "floor", "category": "static", "positionM": [0, 0, 0]},
          {"id": "table", "category": "furniture", "positionM": [0, 0.08, 0]},
          {"id": "plate", "category": "clutter", "positionM": [0, 0.8, 0]}]
    rows = settle({"placements": pl}, mesh, owner)
    assert {r["id"] for r in rows} == {"table", "plate"}
    assert abs(pl[1]["positionM"][1] - 0.0) < 1e-3
    assert abs(pl[2]["positionM"][1] - 0.72) < 1e-3


def test_a_plant_over_a_slat_gap_settles_onto_the_slats():
    """16k walk 9 (CIPHTBMHutInterior01): a plugin plant's stem stands over
    the gap between two shelf slats 6 cm below; the slats under its wider body
    hold it. With no support within the band it stays where the plugin put it."""
    boxes = [([-2, -0.1, -2], [2, 0.0, 2]),                 # floor
             ([-0.14, 0.7, -0.2], [-0.05, 0.8, 0.2]),       # slat
             ([0.05, 0.7, -0.2], [0.14, 0.8, 0.2]),         # slat
             ([-0.01, 0.86, -0.01], [0.01, 0.95, 0.01]),    # stem (plant)
             ([-0.15, 0.95, -0.15], [0.15, 1.05, 0.15]),    # leaves (plant)
             ([1.0, 0.5, 1.0], [1.2, 0.6, 1.2])]            # loose: nothing within the band
    mesh, owner = _scene(boxes)
    owner[owner == 4] = 3
    owner[owner == 5] = 4
    pl = [{"id": "floor", "category": "static", "positionM": [0, 0, 0]},
          {"id": "s1", "category": "static", "positionM": [0, 0.7, 0]},
          {"id": "s2", "category": "static", "positionM": [0, 0.7, 0]},
          {"id": "plant", "category": "item", "positionM": [0, 0.86, 0]},
          {"id": "loose", "category": "item", "positionM": [1.1, 0.5, 1.1]}]
    rows = settle({"placements": pl}, mesh, owner)
    assert [r["id"] for r in rows] == ["plant"]
    assert abs(pl[3]["positionM"][1] - 0.80) < 1e-3
    assert pl[4]["positionM"][1] == 0.5
