"""Where a kit mesh's own geometry says the ground line is (the "mesh tell").

Phase 16h item 2. ``worldgen/mine_designed_sink.py`` measures designed ground
contact from the makers' own placements; most kit assets were never placed in
any plugin we hold. For those the mesh itself carries the evidence, because a
model is authored around the surface it stands on: a floor plate, the foot of
its posts, or the top of a foundation block that is meant to be buried.

Measured quantity, same sign and frame as the shared contract:

    designedSinkM = groundZ - pivotZ = the tell's z in the asset's local frame

(the kit frame is z-up with the pivot at the origin; ``originOffsetM = -bboxMin``).

**The tell rule, per asset shape** (applied in this order; the chosen tell is
recorded on the manifest as ``groundLineTell``):

* ``floor-plane``     — the lowest broad horizontal level of the mesh is within
  ``FLUSH_TOLERANCE_M`` of the mesh bottom: the piece stands on its own base.
  Tell z = the mesh bottom.
* ``bottom-step``     — as above for a stair asset (``category`` or id naming a
  stair/step): the bottom tread is what meets the ground.
* ``door-sill``       — as above for a door, gate or arch asset: the sill plate.
* ``deck-top``        — (16h round 13, owner 2026-09-23: a stilt or quay fit is
  seated by its DECK, never its leg tips; the legs bury as deep as they need)
  checked FIRST, for an asset whose ground-fit policy is ``stilt`` (its asset
  row, or its kit row where the asset row is absent or only sets the anchor,
  ``water-zero``) and whose mesh has a walkable deck on legs: the lowest
  0.1 m band of UP-FACING triangles (normal z >= 0.9) above the leg tips
  holding at least ``DECK_AREA_SHARE`` of the footprint, standing at least
  ``DECK_MIN_RISE_M`` above the mesh bottom, spanning at least
  ``DECK_MIN_EXTENT_M`` in both horizontal axes. Deck top = the highest vertex
  of that band and the bands right above it holding ``DECK_RUN_SHARE`` each.
  Tell z = deck top - ``deckClearanceM`` (the stilt policy's deck height above
  the support surface, 0.35 m). The thresholds were read off the 212 stilt-
  policy assets: the tallest raft or furniture piece rises 1.08 m (a plank
  ferry), the lowest real deck 1.52 m (Bosmer walkway balconies); tables,
  chests and posts span under 1.5 m.
* ``stilt-foot`` / ``post-foot`` — a broad level stands clear above the bottom
  and only a slender minority of the geometry (< ``SLENDER_VERTEX_SHARE``)
  reaches below it: piles or posts. Tell z = the mesh bottom (the feet).
  ``stilt-foot`` when the asset is a stilt/dock/deck piece, ``post-foot``
  otherwise. Ships, hall pieces and walls land here too, so this family is
  NOT re-seated by its deck unless the stilt policy and the deck test hold.
* ``foundation-top``  — a broad level stands clear above the bottom and a large
  share of the geometry sits below it: a foundation block the makers bury.
  Tell z = that broad level.
* ``hull-waterline``  — never measured here: a hull's line is water, not
  ground, and comes from the mined ``designedWaterlineM``.

Tell names are matched on the mesh NAME and the category as whole words (the
category ``architecture`` used to contain "arch" and made every architecture
piece a ``door-sill``; the value was the mesh bottom either way).

A "broad" level is a 2 cm z-band whose vertices span at least
``BROAD_EXTENT_SHARE`` of the asset's footprint in both horizontal axes with at
least ``BROAD_MIN_VERTICES`` vertices, so a single pile tip or a finial can
never be mistaken for a floor.

Geometry is read from the raw kit GLB under ``output/kits`` (plain float
POSITION accessors; the published kits are meshopt-compressed and are not read
here). LOD meshes are skipped: LOD0 is the authored surface.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any

import numpy as np

BIN_M = 0.02
BROAD_EXTENT_SHARE = 0.35
BROAD_MIN_VERTICES = 12
FLUSH_TOLERANCE_M = 0.15
SLENDER_VERTEX_SHARE = 0.15
DECK_BIN_M = 0.1
DECK_UP_NORMAL_Z = 0.9
DECK_AREA_SHARE = 0.15
DECK_RUN_SHARE = 0.05
DECK_MIN_RISE_M = 1.2
DECK_MIN_EXTENT_M = 1.5
DECK_CLEARANCE_M = 0.35
"""Default deck height above the support surface; the stilt policy row's
``deckClearanceM`` is what ``measure_mesh_tells`` passes."""

STAIR_WORDS = ("stair", "steps", "step")
DOOR_WORDS = ("door", "gate", "arch", "portal")
STILT_WORDS = ("stilt", "dock", "deck", "pier", "jetty", "quay", "pont", "passerelle")


class KitGeometry:
    """LOD0 vertex positions per asset node of one raw kit GLB, in kit frame."""

    def __init__(self, glb_path: Path) -> None:
        raw = glb_path.read_bytes()
        json_length = struct.unpack("<I", raw[12:16])[0]
        self._doc: dict[str, Any] = json.loads(raw[20:20 + json_length])
        self._bin_offset = 20 + json_length + 8
        self._raw = raw
        self._nodes = {node.get("name"): index
                       for index, node in enumerate(self._doc.get("nodes", []))}

    def _positions(self, accessor_index: int) -> np.ndarray:
        accessor = self._doc["accessors"][accessor_index]
        view = self._doc["bufferViews"][accessor["bufferView"]]
        offset = (self._bin_offset + view.get("byteOffset", 0)
                  + accessor.get("byteOffset", 0))
        stride = view.get("byteStride") or 12
        count = accessor["count"]
        flat = np.frombuffer(self._raw, dtype="<f4", count=count * stride // 4,
                             offset=offset)
        return flat.reshape(count, stride // 4)[:, :3]

    def _gather(self, index: int, out: list[np.ndarray]) -> None:
        node = self._doc["nodes"][index]
        name = node.get("name") or ""
        if "__lod" in name:
            return
        if "mesh" in node:
            for primitive in self._doc["meshes"][node["mesh"]]["primitives"]:
                out.append(self._positions(primitive["attributes"]["POSITION"]))
        for child in node.get("children", []):
            self._gather(child, out)

    def _indices(self, accessor_index: int) -> np.ndarray:
        accessor = self._doc["accessors"][accessor_index]
        view = self._doc["bufferViews"][accessor["bufferView"]]
        offset = (self._bin_offset + view.get("byteOffset", 0)
                  + accessor.get("byteOffset", 0))
        dtype = {5121: "<u1", 5123: "<u2", 5125: "<u4"}[accessor["componentType"]]
        return np.frombuffer(self._raw, dtype=dtype, count=accessor["count"],
                             offset=offset).astype(np.int64)

    def _gather_triangles(self, index: int, out: list) -> None:
        node = self._doc["nodes"][index]
        if "__lod" in (node.get("name") or ""):
            return
        if "mesh" in node:
            for primitive in self._doc["meshes"][node["mesh"]]["primitives"]:
                if primitive.get("mode", 4) != 4:
                    continue
                points = self._positions(primitive["attributes"]["POSITION"])
                if "indices" in primitive:
                    faces = self._indices(primitive["indices"]).reshape(-1, 3)
                else:
                    faces = np.arange(len(points)).reshape(-1, 3)
                out.append((points, faces))
        for child in node.get("children", []):
            self._gather_triangles(child, out)

    def triangles(self, node_name: str) -> tuple[np.ndarray, np.ndarray] | None:
        """``(vertices (n, 3), faces (m, 3))`` in the kit's z-up frame (the
        frame ``vertices`` uses), or None when the node is absent or empty."""
        index = self._nodes.get(node_name)
        if index is None:
            return None
        parts: list = []
        self._gather_triangles(index, parts)
        if not parts:
            return None
        vertices, faces, base = [], [], 0
        for points, tri in parts:
            vertices.append(points)
            faces.append(tri + base)
            base += len(points)
        gltf = np.vstack(vertices)
        # glTF is y-up with -z forward: kit (x, y, z) = glTF (x, -z, y), a
        # rotation (checked against the manifest bounds of signwrstables01,
        # whose y runs 0..1.4 m), so the winding and normals keep their sense.
        return (np.column_stack((gltf[:, 0], -gltf[:, 2], gltf[:, 1])),
                np.vstack(faces))

    def vertices(self, node_name: str) -> np.ndarray | None:
        """``(n, 3)`` in the kit's z-up frame, or None when the node is absent."""
        index = self._nodes.get(node_name)
        if index is None:
            return None
        parts: list[np.ndarray] = []
        self._gather(index, parts)
        if not parts:
            return None
        gltf = np.vstack(parts)
        # glTF is y-up with -z forward: kit (x, y, z) = glTF (x, -z, y).
        return np.column_stack((gltf[:, 0], -gltf[:, 2], gltf[:, 1]))


def _shape_words(asset: dict[str, Any]) -> str:
    """The asset's own mesh name (substring matches).

    The mesh NAME only, never the whole id or the category: every vanilla id
    begins ``architecture/`` and most categories are ``architecture``, which
    contain "arch" and made every fence piece a door sill.
    """
    return str(asset.get("id", "")).rsplit("/", 1)[-1].lower()


def _has_word(asset: dict[str, Any], words: tuple[str, ...]) -> bool:
    """A shape word in the mesh name, or the category IS one of the words."""
    name = _shape_words(asset)
    category = str(asset.get("category", "")).lower()
    return any(word in name for word in words) or category in words


def walkable_deck(vertices: np.ndarray, faces: np.ndarray) -> dict[str, float] | None:
    """``{topM, riseM, extentM}`` of the lowest large up-facing band above the
    leg tips (the rule in this module's docstring), or None."""
    tris = vertices[faces]
    normal = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    length = np.linalg.norm(normal, axis=1)
    area = length / 2
    up_z = normal[:, 2] / np.maximum(length, 1e-12)
    span = vertices[:, :2].max(axis=0) - vertices[:, :2].min(axis=0)
    footprint = float(span[0] * span[1])
    if footprint <= 0:
        return None
    bottom = float(vertices[:, 2].min())
    centre_z = tris[:, :, 2].mean(axis=1)
    up = (up_z >= DECK_UP_NORMAL_Z) & (centre_z > bottom + FLUSH_TOLERANCE_M)
    if not np.any(up):
        return None
    bins = np.floor((centre_z - bottom) / DECK_BIN_M).astype(np.int64)
    share = {int(b): float(area[up & (bins == b)].sum()) / footprint
             for b in np.unique(bins[up])}
    first = next((b for b in sorted(share) if share[b] >= DECK_AREA_SHARE), None)
    if first is None:
        return None
    run = [first]
    while share.get(run[-1] + 1, 0.0) >= DECK_RUN_SHARE:
        run.append(run[-1] + 1)
    band = tris[up & np.isin(bins, run)].reshape(-1, 3)
    top = float(band[:, 2].max())
    extent = band[:, :2].max(axis=0) - band[:, :2].min(axis=0)
    return {"topM": top, "riseM": top - bottom, "extentM": float(extent.min())}


def is_deck_on_legs(deck: dict[str, float] | None) -> bool:
    return (deck is not None and deck["riseM"] >= DECK_MIN_RISE_M
            and deck["extentM"] >= DECK_MIN_EXTENT_M)


def broad_level(points: np.ndarray) -> float | None:
    """Lowest z of a band wide enough to be a floor, sill or tread."""
    span_x = points[:, 0].max() - points[:, 0].min()
    span_y = points[:, 1].max() - points[:, 1].min()
    if span_x <= 0 or span_y <= 0:
        return None
    z = points[:, 2]
    bins = np.floor((z - z.min()) / BIN_M).astype(np.int64)
    for bin_index in np.unique(bins):
        band = points[bins == bin_index]
        if len(band) < BROAD_MIN_VERTICES:
            continue
        wide_x = (band[:, 0].max() - band[:, 0].min()) >= BROAD_EXTENT_SHARE * span_x
        wide_y = (band[:, 1].max() - band[:, 1].min()) >= BROAD_EXTENT_SHARE * span_y
        if wide_x and wide_y:
            return float(band[:, 2].min())
    return None


def ground_line_tell(points: np.ndarray, asset: dict[str, Any], stilt: bool = False,
                     triangles: tuple[np.ndarray, np.ndarray] | None = None,
                     clearance_m: float = DECK_CLEARANCE_M) -> dict[str, Any] | None:
    """``{type, tell, valueM}`` per the rule in this module's docstring.
    ``stilt``: the asset's ground-fit policy is stilt; ``triangles`` its LOD0
    ``(vertices, faces)`` for the deck test."""
    if points is None or len(points) < BROAD_MIN_VERTICES:
        return None
    if stilt and triangles is not None:
        deck = walkable_deck(*triangles)
        if is_deck_on_legs(deck):
            return {"type": "mesh", "tell": "deck-top",
                    "valueM": round(deck["topM"] - clearance_m, 4),
                    "deckTopM": round(deck["topM"], 4),
                    "deckClearanceM": clearance_m}
    bottom = float(points[:, 2].min())
    level = broad_level(points)
    if level is None:
        return None
    if level - bottom <= FLUSH_TOLERANCE_M:
        if _has_word(asset, STAIR_WORDS):
            tell = "bottom-step"
        elif _has_word(asset, DOOR_WORDS):
            tell = "door-sill"
        else:
            tell = "floor-plane"
        return {"type": "mesh", "tell": tell, "valueM": round(bottom, 4)}
    below_share = float((points[:, 2] < level - 1e-6).mean())
    if below_share < SLENDER_VERTEX_SHARE:
        tell = "stilt-foot" if _has_word(asset, STILT_WORDS) else "post-foot"
        return {"type": "mesh", "tell": tell, "valueM": round(bottom, 4)}
    return {"type": "mesh", "tell": "foundation-top", "valueM": round(level, 4)}


STILT_POLICY = "stilt"
ANCHOR_ONLY_POLICIES = ("water-zero", "deck")
"""Asset rows that set the anchor class only (16h round 12), so the kit row
still names the ground fit."""


def stilt_fit(asset_id: str, kit_ids: set[str], inventory: dict[str, Any]) -> bool:
    """The asset's ground-fit policy is stilt: its asset row, or, where it has
    none or one that only sets its anchor, one of its kits' rows."""
    key = asset_id.strip().replace("\\", "/").casefold()
    row = inventory.get("assetPolicies", {}).get(key)
    if row is not None and row not in ANCHOR_ONLY_POLICIES:
        return row == STILT_POLICY
    kit_rows = inventory.get("kitPolicies", {})
    return any(kit_rows.get(kit) == STILT_POLICY for kit in kit_ids)


def measure_mesh_tells(output_dir: Path,
                       inventory: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    """``assetId -> groundLineTell`` from the raw kit GLBs in ``output_dir``
    (first kit that carries the asset wins; kits are read in name order).
    Read by ``worldgen.mine_designed_sink``, which writes the answer into the
    sink record: no manifest writer measures tells itself (16h round 6)."""
    if inventory is None:
        from .placement_metadata import load_inventory
        inventory = load_inventory()
    clearance = float(inventory.get("policies", {}).get(STILT_POLICY, {})
                      .get("deckClearanceM", DECK_CLEARANCE_M))
    manifests = sorted(output_dir.glob("*.kit.json"))
    kits_of: dict[str, set[str]] = {}
    for path in manifests:
        document = json.loads(path.read_text())
        for asset in document.get("assets", []):
            kits_of.setdefault(asset.get("id"), set()).add(
                document.get("kit", path.name.removesuffix(".kit.json")))
    tells: dict[str, dict[str, Any]] = {}
    for path in manifests:
        glb = path.with_name(path.name.removesuffix(".kit.json") + ".glb")
        if not glb.exists():
            continue
        geometry = KitGeometry(glb)
        for asset in json.loads(path.read_text()).get("assets", []):
            node = asset.get("node")
            if not isinstance(node, str) or asset["id"] in tells:
                continue
            points = geometry.vertices(node)
            stilt = stilt_fit(asset["id"], kits_of.get(asset["id"], set()), inventory)
            tell = None if points is None else ground_line_tell(
                points, asset, stilt=stilt,
                triangles=geometry.triangles(node) if stilt else None,
                clearance_m=clearance)
            if tell is not None:
                tells[asset["id"]] = tell
        del geometry
    return tells
