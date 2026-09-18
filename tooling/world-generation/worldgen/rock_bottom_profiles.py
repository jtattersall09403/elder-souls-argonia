"""Mine each rock's BOTTOM PROFILE from its own mesh (16f round 5).

The burial rule used to seat a rock by a flat base plane through its pivot;
a rock pile or cliff shell has a lumpy, hollow underside, and the plane
census passed 18 % of rocks that showed a gap under one side by their real
mesh (`rock_mesh_census.py`). This writes, per rock species, the lowest LOD0
`BASE_BAND` of its vertices, one per `VOXEL_M` voxel (model space, the
glb's y-up frame the renderer draws in), so `scatter.burial` can demand
ground under the rim the mesh actually has. Run it whenever the flora kit is
rebuilt::

    python3 -m worldgen.rock_bottom_profiles

Output: world/sources/placement/rock-bottom-profiles.json (schemaVersion 1).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from .rock_census import is_rock
from .rock_mesh_census import BASE_BAND, lod0_vertices, underside

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT = REPO_ROOT / "world" / "sources" / "placement" / "rock-bottom-profiles.json"
#: The underside vertex set is thinned to one vertex per model-space voxel
#: of this size (the lowest in it): the burial rule poses the WHOLE set and
#: finds the underside per ground cell after tilting — which vertex is
#: lowest over a given patch of ground depends on the pose, so a profile
#: taken before posing (per-cell lowest in the rock's own frame, the first
#: attempt) let a leaning cliff slab hang 2.9 m over falling ground.
VOXEL_M = 0.25


def profile(verts: np.ndarray) -> list[list[float]]:
    """The lower `BASE_BAND` of the mesh, one vertex per voxel. Where a side
    of the rock ends above the ground that is a hole, whatever its height on
    the mesh (the owner's pile: a side boulder 1.28 m off the ground at 40 %
    of the pile's height); an undercut on flat ground is met by the mined
    base sink (`composition.finalise_anchors`) or the piece is refused."""
    verts = underside(verts)
    key = np.floor(verts / VOXEL_M).astype(np.int64)
    key = key[:, 0] * 4_000_000 + key[:, 1] * 2_000 + key[:, 2]
    points: list[list[float]] = []
    for k in np.unique(key):
        sel = np.nonzero(key == k)[0]
        low = sel[np.argmin(verts[sel, 1])]
        points.append([round(float(v), 3) for v in verts[low]])
    return points


def build() -> dict:
    species = {}
    for aid, verts in lod0_vertices().items():
        if not is_rock(aid) and "/rocks/" not in aid:
            continue
        species[aid] = {"points": profile(verts), "vertices": int(len(verts))}
    return {"schemaVersion": 2, "voxelM": VOXEL_M, "baseBand": BASE_BAND,
            "frame": "glb y-up model space, metres, as the renderer draws it",
            "species": dict(sorted(species.items()))}


def main() -> None:
    doc = build()
    OUT.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    print(f"{len(doc['species'])} rock species → {OUT.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
