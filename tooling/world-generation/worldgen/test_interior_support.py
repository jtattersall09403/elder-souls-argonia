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
