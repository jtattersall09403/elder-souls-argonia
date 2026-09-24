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
    def _library(self):
        paths.bridge()
        from worldgen.mine_mounts import MeshLibrary
        return MeshLibrary(raw_kits=paths.RAW_KITS)

    def _glb_signature(self, asset_id: str) -> str:
        node = self._library._nodes.get(asset_id)
        if node is None:
            return "missing"
        stat = node[0].stat()
        return f"{node[0].name}|{stat.st_size}|{int(stat.st_mtime)}|{node[1]}"

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
            np.savez(cache, vertices=np.asarray(mesh.vertices, np.float64),
                     faces=np.asarray(mesh.faces, np.int64))
        self._meshes[asset_id] = mesh
        return mesh

    def raw_glb(self, asset_id: str) -> tuple[Path, str] | None:
        """(raw kit GLB, node name) holding the asset, for renders."""
        return self._library._nodes.get(asset_id)


def fit_of(row: dict) -> str | None:
    """The manifest's fit policy (`compile_settlement.asset_fit`)."""
    return ((row.get("placement") or {}).get("evidence") or {}).get("policyId")


def sink_of(row: dict) -> float:
    sink = row.get("designedSinkM") or {}
    if not isinstance(sink.get("p50"), (int, float)):
        raise ValueError(f"{row['id']}: no designedSinkM.p50 on its manifest (the export refuses it)")
    return float(sink["p50"])
