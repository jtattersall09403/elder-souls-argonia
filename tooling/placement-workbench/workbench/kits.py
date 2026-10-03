"""Kit pieces: the published manifest row (what the runtime ships: fit,
sink, anchor class, collision), the kit's sidecars (footprints, interiors,
connectors) and the real mesh.

Meshes come from the RAW kit builds through `mine_mounts.MeshLibrary` (the
published GLBs are meshopt-compressed; the raw build is the same geometry,
uncompressed). Each mesh is cached once as npz under
`output/meshes/`, keyed on the raw GLB's size and mtime, so a command after
the first loads in milliseconds.
"""
from __future__ import annotations

import hashlib
import json
import os
from functools import cached_property
from pathlib import Path

import numpy as np

from . import paths


def _safe(asset_id: str) -> str:
    return hashlib.sha1(asset_id.encode()).hexdigest()[:16]


class Catalogue:
    """Asset id -> published manifest row (+ `kit`), sidecars, mesh."""

    def __init__(self, kits_dir: Path = paths.PUBLISHED_KITS):
        paths.bridge()
        from worldgen import compile_settlement as cs
        self.kits_dir = kits_dir
        self.shelf = cs.KitShelf(kits_dir)
        self._sidecars: dict[tuple[str, str], dict] = {}
        self._meshes: dict[str, object] = {}

    def row(self, asset_id: str) -> dict:
        row = self.shelf.locate(asset_id)
        if row is None:
            raise KeyError(f"{asset_id}: in no published kit manifest under {self.kits_dir}")
        return row

    def sidecar(self, kit: str, kind: str) -> dict:
        key = (kit, kind)
        if key not in self._sidecars:
            path = self.kits_dir / f"{kit}.{kind}.json"
            self._sidecars[key] = json.loads(path.read_text()) if path.exists() else {}
        return self._sidecars[key]

    def placed_scale(self, asset_id: str) -> float:
        """The scale a `place` op sets when it names none (planner ruling 1,
        interiors round 4): the shell's plugin median placed scale from its
        manifest, else 1."""
        return default_scale(self.row(asset_id))

    def footprint(self, asset_id: str) -> list | None:
        """The measured plan outline (x east, z south, pivot origin), or None."""
        row = self.row(asset_id)
        data = self.sidecar(row["kit"], "footprints")
        entry = data.get(asset_id) or (data.get("assets") or {}).get(asset_id)
        return (entry or {}).get("footprintM")

    def interiors(self, asset_id: str) -> dict:
        row = self.row(asset_id)
        data = self.sidecar(row["kit"], "interiors")
        return data.get(asset_id) or (data.get("assets") or {}).get(asset_id) or {}

    def connectors(self, asset_id: str) -> list:
        row = self.row(asset_id)
        data = self.sidecar(row["kit"], "connectors")
        got = data.get(asset_id) or (data.get("assets") or {}).get(asset_id) or []
        return got if isinstance(got, list) else [got]

    @cached_property
    def _doorway_records(self) -> tuple[dict, dict]:
        paths.bridge()
        from worldgen import compile_settlement as cs
        return cs.kit_interiors(self.kits_dir), cs.assembly_doorways()

    def doorways(self, asset_id: str) -> list[dict]:
        """Every measured doorway of the piece, exactly as the compile binds
        doors to them (`compile_settlement.piece_doorways`: interiors entrance
        and provenance, probe centre, mined assembly doorways; plan frame x
        east / z south on the pivot)."""
        paths.bridge()
        from worldgen import compile_settlement as cs
        interiors, assemblies = self._doorway_records
        return cs.piece_doorways(asset_id, interiors, assemblies)

    @cached_property
    def _library(self):
        paths.bridge()
        from worldgen.mine_mounts import MeshLibrary
        return MeshLibrary(raw_kits=paths.RAW_KITS)

    def _glb_signature(self, asset_id: str) -> str:
        node = self._library._nodes.get(asset_id)
        if node is None:
            return "missing"
        return f"{glb_file_signature(node[0])}|{node[1]}"

    def mesh(self, asset_id: str):
        """trimesh.Trimesh in the kit frame (z up, pivot at the origin)."""
        if asset_id in self._meshes:
            return self._meshes[asset_id]
        import trimesh
        sig = self._glb_signature(asset_id)
        cache = paths.MESH_CACHE / f"{_safe(asset_id + sig)}.npz"
        if cache.exists():
            data = np.load(cache)
            mesh = trimesh.Trimesh(data["vertices"], data["faces"], process=False)
        else:
            mesh = self._library(asset_id)
            if mesh is None:
                raise KeyError(f"{asset_id}: no mesh in the raw kit builds ({paths.RAW_KITS})")
            cache.parent.mkdir(parents=True, exist_ok=True)
            tmp = cache.with_name(f"{cache.stem}.{os.getpid()}.tmp.npz")
            np.savez(tmp, vertices=np.asarray(mesh.vertices, np.float64),
                     faces=np.asarray(mesh.faces, np.int64))
            os.replace(tmp, cache)       # atomic: a parallel reader never sees half a file
        self._meshes[asset_id] = mesh
        return mesh

    def raw_glb(self, asset_id: str) -> tuple[Path, str] | None:
        """(raw kit GLB, node name) holding the asset, for renders."""
        return self._library._nodes.get(asset_id)


def glb_file_signature(glb: Path) -> str:
    """The raw kit GLB's identity for every cache keyed on it (mesh npz per
    asset, render .blend per kit): name, size and whole-second mtime."""
    stat = Path(glb).stat()
    return f"{Path(glb).name}|{stat.st_size}|{int(stat.st_mtime)}"


def default_scale(row: dict) -> float:
    """A manifest row's `placedScaleMedian` (the makers' median placed scale,
    `placement_metadata.apply_placed_scale`), else 1.0."""
    value = row.get("placedScaleMedian")
    return float(value) if isinstance(value, (int, float)) and value > 0 else 1.0


def fit_of(row: dict) -> str | None:
    """The manifest's fit policy (`compile_settlement.asset_fit`)."""
    return ((row.get("placement") or {}).get("evidence") or {}).get("policyId")


def sink_of(row: dict) -> float:
    sink = row.get("designedSinkM") or {}
    if not isinstance(sink.get("p50"), (int, float)):
        raise ValueError(f"{row['id']}: no designedSinkM.p50 on its manifest (the export refuses it)")
    return float(sink["p50"])
