"""Export the scene's poses into a blueprint record the compile realises
unchanged. Only POSE fields are written; everything authored around them
(prose, districts, doors, routes' ids) stays as the author wrote it, and
the derived fields (footprints, door thresholds, district hulls) are
re-derived afterwards by the settlement-build passes, never here.

A piece's `role` (set with `wb.py bind`) says where its pose goes:

* ``parcel <id>``: one-asset parcel: `assetRef`, `centreUV`, `yawDeg`.
* ``run <id> --index n``: a `pieces` parcel whose members carry authored
  poses: the parcel's `centreUV`/`yawDeg` are piece 0's pivot and yaw; each
  member is ``{asset, atM: [x, z], yaw}`` in the parcel's own frame (x
  east, z south at the parcel's yaw 0; `yaw` relative to the parcel's
  `yawDeg`), so `blueprint_footprints.lay_pieces` places it exactly (the
  `atM` member field; without it a run is laid by the mined abuts pairs).
* ``landmark <id>``: `position` UV and `yawDeg` (a mounted child keeps its
  parent binding; the compile seats it by the mined pair).

Scene paths whose id matches a blueprint route write its `via` and
`points` (UV).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from .scene import Scene

UV_ROUND = 9


def _uv(x: float, z: float, extent: float) -> list[float]:
    return [round(x / extent, UV_ROUND), round(z / extent, UV_ROUND)]


def _local(dx: float, dz: float, yaw_deg: float) -> list[float]:
    """Province offset -> the parcel frame (inverse of the compile's turn)."""
    t = math.radians(yaw_deg)
    return [round(dx * math.cos(t) + dz * math.sin(t), 4),
            round(-dx * math.sin(t) + dz * math.cos(t), 4)]


def poses(scene: Scene, extent: float) -> dict:
    """{'parcels': {id: fields}, 'landmarks': {id: fields}, 'routes': {id: fields}}."""
    out: dict[str, dict] = {"parcels": {}, "landmarks": {}, "routes": {}}
    runs: dict[str, list] = {}
    for p in scene.pieces:
        kind, rid = p.role.get("kind"), p.role.get("id")
        if not kind:
            continue
        yaw = round(p.yaw % 360.0, 3)
        if kind == "parcel":
            fields = {"assetRef": p.asset, "centreUV": _uv(p.x, p.z, extent), "yawDeg": yaw}
            if p.scale != 1.0:
                fields["scale"] = p.scale
            out["parcels"][rid] = fields
        elif kind == "landmark":
            out["landmarks"][rid] = {"assetRef": p.asset, "position": _uv(p.x, p.z, extent),
                                     "yawDeg": yaw}
        elif kind == "run":
            runs.setdefault(rid, []).append((int(p.role.get("index", 0)), p))
    for rid, members in runs.items():
        members.sort(key=lambda m: m[0])
        first = members[0][1]
        base = first.yaw % 360.0
        pieces = []
        for _i, p in members:
            rel = ((p.yaw - base + 180.0) % 360.0) - 180.0
            pieces.append({"asset": p.asset, "atM": _local(p.x - first.x, p.z - first.z, base),
                           "yaw": round(rel, 3)})
        out["parcels"][rid] = {"pieces": pieces, "centreUV": _uv(first.x, first.z, extent),
                               "yawDeg": round(base, 3)}
    for path in scene.paths:
        pts = [_uv(x, z, extent) for x, z in path["pointsM"]]
        out["routes"][path["id"]] = {"via": pts, "points": pts}
    return out


def export(scene: Scene, blueprint: Path, write: bool = False) -> dict:
    doc = json.loads(blueprint.read_text())
    bp = doc["blueprint"]
    extent = scene.ground().extent_m
    got = poses(scene, extent)
    changed, created, unknown = [], [], []
    parcels = {p["id"]: p for p in bp.get("parcels", [])}
    for pid, fields in got["parcels"].items():
        parcel = parcels.get(pid)
        if parcel is None:
            parcel = {"id": pid}
            bp.setdefault("parcels", []).append(parcel)
            created.append(pid)
        if "pieces" in fields:
            parcel.pop("assetRef", None)
        else:
            parcel.pop("pieces", None)
        if "scale" not in fields:
            parcel.pop("scale", None)       # scale 1.0 is written as no scale
        parcel.update(fields)
        changed.append(pid)
    marks = {m["id"]: m for m in bp.get("landmarks", [])}
    for lid, fields in got["landmarks"].items():
        mark = marks.get(lid)
        if mark is None:
            unknown.append(lid)
            continue
        mark.update({"position": fields["position"], "yawDeg": fields["yawDeg"]})
        changed.append(lid)
    routes = {r["id"]: r for r in bp.get("routes", [])}
    for rid, fields in got["routes"].items():
        if rid in routes:
            routes[rid].update(fields)
            changed.append(rid)
    if write:
        # the settlement passes' own writer convention (blueprint_footprints)
        blueprint.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    return {"blueprint": str(blueprint), "written": write, "changed": changed,
            "createdSkeletons": created, "landmarksNotInBlueprint": unknown,
            "next": "cd tooling/world-generation && python3 -m worldgen.blueprint_footprints "
                    "--apply <bp> && --areas --doors <bp> && python3 -m worldgen.street_router "
                    "--apply <bp> && python3 -m worldgen.blueprint --check"}
