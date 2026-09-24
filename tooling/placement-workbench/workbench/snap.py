"""Snapping: by the mined evidence (a plugin's own pose for the pair), by
geometry (face to face until the meshes touch), and mounting a child on its
mined parent pair. The records are evidence the agent chooses to use; the
pose that results is the agent's, recorded on the piece with how it was got.

Faces are the kit frame's bounds faces, named as the abuts record names
them: ``+x`` (east at yaw 0), ``-x``, ``+y`` (north at yaw 0), ``-y``.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache

import numpy as np

from . import paths
from .kits import Catalogue
from .scene import Piece, yaw_matrix

FACE_BEARING = {"+y": 0.0, "+x": 90.0, "-y": 180.0, "-x": 270.0}
FACE_AXIS = {"+x": (0, 1.0), "-x": (0, -1.0), "+y": (1, 1.0), "-y": (1, -1.0)}
FACE_ALIAS = {"east": "+x", "west": "-x", "north": "+y", "south": "-y"}
"""Word names for the piece-frame faces (a leading dash reads as a CLI flag)."""
REFINE_TOL_M = 1e-4


def face(name: str | None) -> str | None:
    if name is None or name == "any":
        return None
    got = FACE_ALIAS.get(name, name)
    if got not in FACE_AXIS:
        raise ValueError(f"face {name!r}: use east/west/north/south (piece frame) or +x/-x/+y/-y")
    return got
REFINE_REACH_M = 3.0


def _fp():
    paths.bridge()
    from worldgen import blueprint_footprints
    return blueprint_footprints


def _set_from_parent(child: Piece, parent: Piece, offset, rise: float, rel_yaw: float) -> None:
    """Child pose = parent pose + offset (parent unit frame, x east / y north
    at yaw 0, metres) turned by the parent's yaw and scale."""
    d = yaw_matrix(parent.yaw) @ np.array([offset[0], offset[1], rise]) * parent.scale
    child.x = parent.x + float(d[0])
    child.z = parent.z - float(d[1])
    child.yaw = (parent.yaw + rel_yaw) % 360.0
    child.y = None if parent.y is None else parent.y + float(d[2])


def evidence_steps(parent_asset: str, child_asset: str) -> list[dict]:
    """Every mined abuts pair joining the two (piece pairs, then family
    pairs; either as the record's parent), as a step for the child in the
    parent's unit frame with the faces named from the parent's side."""
    fp = _fp()
    abuts = fp.abuts_record()
    fam_p, fam_c = fp.family_key(parent_asset), fp.family_key(child_asset)
    out = []
    for kind, rows, a, b in (("piece", abuts.get("pairs") or [], parent_asset, child_asset),
                             ("family", abuts.get("familyPairs") or [], fam_p, fam_c)):
        for pair in rows:
            if float(pair.get("relScale", 1.0)) != 1.0:
                continue
            ox, oy, rise = pair["offsetM"]
            for flip in (False, True):
                if (pair["parent"], pair["child"]) != ((b, a) if flip else (a, b)):
                    continue
                if flip:
                    ox2, oy2, rise2, yaw = fp.invert_pair(ox, oy, rise, float(pair["yawDeg"]))
                    faces = (pair["childFace"], pair["parentFace"])
                else:
                    ox2, oy2, rise2, yaw = ox, oy, rise, float(pair["yawDeg"])
                    faces = (pair["parentFace"], pair["childFace"])
                out.append({"offsetM": [ox2, oy2], "riseM": rise2, "yawDeg": yaw,
                            "parentFace": faces[0], "childFace": faces[1],
                            "joint": pair.get("joint"), "count": pair["count"],
                            "offsetSpreadM": pair.get("offsetSpreadM"), "kind": kind,
                            "sourceSet": pair.get("sourceSet")})
    out.sort(key=lambda s: (-s["count"], s["kind"] != "piece"))
    return out


def face_use(asset: str) -> dict[str, dict]:
    """Per face of the piece: how often the plugins END a run on it bare
    (`terminates`) and how often they CONTINUE it there (every run pair on
    that face, whichever piece the record names as parent). Piece level
    when the piece has its own `terminates` row, else its family's."""
    fp = _fp()
    abuts = fp.abuts_record()
    fam = fp.family_key(asset)
    own = (abuts.get("terminates") or {}).get(asset)
    key, ends, rows = ((asset, own, abuts.get("pairs") or []) if own else
                       (fam, (abuts.get("familyTerminates") or {}).get(fam) or {},
                        abuts.get("familyPairs") or []))
    out = {face: {"ended": int(n), "continued": 0} for face, n in ends.items()}
    for pair in rows:
        if pair.get("joint") != "run":
            continue
        for who, face in ((pair["parent"], pair["parentFace"]), (pair["child"], pair["childFace"])):
            if who == key:
                out.setdefault(face, {"ended": 0, "continued": 0})["continued"] += pair["count"]
    return out


def terminal_faces(asset: str) -> set[str]:
    """Faces on which the plugins end a run of this piece at least as often
    as they continue it (a broken wall end is an end, not a joint)."""
    return {face for face, use in face_use(asset).items()
            if use["ended"] and use["ended"] >= use["continued"]}


def snap_evidence(child: Piece, parent: Piece, child_face: str | None = None,
                  parent_face: str | None = None, pick: int = 0,
                  allow_terminal: bool = False) -> dict:
    """Place the child where the plugins put it against the parent: the
    mined abuts step with the most evidence (or `pick`). A step from one of
    the parent's `terminal_faces` is skipped unless `allow_terminal`."""
    ends = terminal_faces(parent.asset)
    steps = [s for s in evidence_steps(parent.asset, child.asset)
             if (parent_face is None or s["parentFace"] == parent_face)
             and (child_face is None or s["childFace"] == child_face)]
    skipped = [s for s in steps if s["parentFace"] in ends]
    if not allow_terminal:
        steps = [s for s in steps if s not in skipped]
    if not steps:
        raise ValueError(f"no mined abuts pair joins {child.asset} to {parent.asset}"
                         + (f" on {parent_face}>{child_face}" if parent_face or child_face else "")
                         + (f" (skipped {len(skipped)} on faces the plugins end the run on: "
                            f"{sorted(ends)}; --allow-terminal to use them)" if skipped else ""))
    step = steps[min(pick, len(steps) - 1)]
    _set_from_parent(child, parent, step["offsetM"], step["riseM"], step["yawDeg"])
    child.settledBy = f"evidence-snap:{parent.uid}"
    return {"used": step, "alternatives": len(steps) - 1,
            "skippedTerminalSteps": len(skipped) if not allow_terminal else 0,
            "parentTerminalFaces": sorted(ends)}


def _face_plane(row: dict, face: str) -> float:
    """The bounds face's offset from the pivot along its axis (kit frame)."""
    size, off = row["sizeM"], row["originOffsetM"]
    axis, sign = FACE_AXIS[face]
    return (size[axis] - off[axis]) if sign > 0 else -off[axis]


def _face_centre_lateral(row: dict, face: str) -> float:
    size, off = row["sizeM"], row["originOffsetM"]
    axis, _ = FACE_AXIS[face]
    other = 1 - axis
    return size[other] / 2 - off[other]


def snap_geometry(cat: Catalogue, child: Piece, parent: Piece, child_face: str,
                  parent_face: str, lateral_m: float = 0.0, keep_yaw: bool = False) -> dict:
    """Face to face: turn the child so its face opposes the parent's, put the
    bounds planes together with the face centres aligned (plus `lateral_m`
    along the parent's face), bases level, then slide along the parent's
    face normal to the exact touching distance (FCL, to 0.1 mm)."""
    import trimesh
    prow, crow = cat.row(parent.asset), cat.row(child.asset)
    if not keep_yaw:
        child.yaw = (parent.yaw + FACE_BEARING[parent_face] + 180.0
                     - FACE_BEARING[child_face]) % 360.0
    pa, psign = FACE_AXIS[parent_face]
    n_local = np.zeros(3)
    n_local[pa] = psign
    n = yaw_matrix(parent.yaw) @ n_local                     # wb, outward from parent
    lat_local = np.zeros(3)
    lat_local[1 - pa] = 1.0
    lat = yaw_matrix(parent.yaw) @ lat_local
    # the child's face point (plane + lateral centre) in wb, relative to its pivot
    ca, csign = FACE_AXIS[child_face]
    c_local = np.zeros(3)
    c_local[ca] = _face_plane(crow, child_face)
    c_local[1 - ca] = _face_centre_lateral(crow, child_face)
    c_face = yaw_matrix(child.yaw) @ c_local * child.scale
    p_local = np.zeros(3)
    p_local[pa] = _face_plane(prow, parent_face)
    p_local[1 - pa] = _face_centre_lateral(prow, parent_face)
    p_face = yaw_matrix(parent.yaw) @ p_local * parent.scale
    parent_wb = np.array([parent.x, -parent.z, 0.0])
    target = parent_wb + p_face + lat * lateral_m
    pivot = target - c_face
    child.x, child.z = float(pivot[0]), -float(pivot[1])
    if parent.y is None:
        raise ValueError(f"{parent.uid} has no height: settle it first")
    child.y = (parent.y - float(prow["originOffsetM"][2]) * parent.scale
               + float(crow["originOffsetM"][2]) * child.scale)
    # refine along n to the touching distance
    manager = trimesh.collision.CollisionManager()
    manager.add_object("p", cat.mesh(parent.asset), transform=_t4(parent))
    manager.add_object("c", cat.mesh(child.asset), transform=_t4(child))
    base = np.array([child.x, -child.z, child.y])

    def crossing(t: float) -> bool:
        moved = base + n * t
        manager.set_transform("c", _t4_at(child, moved))
        return bool(manager.in_collision_internal())

    lo, hi = None, 0.0
    if crossing(0.0):
        step = 0.05
        while crossing(hi):
            lo = hi
            hi += step
            if hi > REFINE_REACH_M:
                raise ValueError("the child still crosses the parent 3 m out: wrong faces?")
    else:
        t = 0.0
        while not crossing(t):
            hi = t
            t -= 0.05
            if t < -REFINE_REACH_M:
                t, hi = None, 0.0
                break
        lo = t
    if lo is not None:
        while hi - lo > REFINE_TOL_M:
            mid = (lo + hi) / 2
            if crossing(mid):
                lo = mid
            else:
                hi = mid
    final = base + n * hi
    child.x, child.z, child.y = float(final[0]), -float(final[1]), float(final[2])
    child.settledBy = f"geometry-snap:{parent.uid}"
    return {"slidM": round(hi, 4), "touching": lo is not None,
            "note": None if lo is not None else "no crossing within 3 m: the bounds planes meet "
                                                "but the meshes never touch along the normal"}


def _t4(piece: Piece) -> np.ndarray:
    a, b = piece.matrix()
    t = np.eye(4)
    t[:3, :3], t[:3, 3] = a, b
    return t


def _t4_at(piece: Piece, pos_wb) -> np.ndarray:
    t = _t4(piece)
    t[:3, 3] = pos_wb
    return t


@lru_cache(maxsize=1)
def _assemblies_record() -> dict:
    """kit-assemblies-mined.json, read once per process (read-only data, as
    `blueprint_footprints.abuts_record` reads its abuts section)."""
    return json.loads(_fp().ABUTS_RECORD.read_text())


def templates(anchor_asset: str, part_asset: str | None = None) -> list[dict]:
    """The mined co-placement templates on an anchor (kit-assemblies-mined
    `sets.*.templates`): part, count, offsetM in the anchor's UNIT frame,
    yawDeg (clockwise), partScaleInAnchor, isDoor."""
    out = [t for s in _assemblies_record().get("sets", {}).values() for t in s.get("templates", [])
           if t.get("anchor") == anchor_asset and (part_asset is None or t.get("part") == part_asset)]
    return sorted(out, key=lambda t: (-(t.get("count") or 0), t.get("id", "")))


def attach(child: Piece, parent: Piece, template_id: str | None = None, pick: int = 0) -> dict:
    """Place the child where the plugins place that part on that anchor: a
    mined template's offset (anchor unit frame, times the parent's scale),
    its relative yaw and the part's scale in the anchor."""
    rows = templates(parent.asset, child.asset)
    if template_id:
        rows = [t for t in rows if t["id"] == template_id]
    if not rows:
        raise ValueError(f"no mined template places {child.asset} on {parent.asset}"
                         + (f" with id {template_id}" if template_id else ""))
    t = rows[min(pick, len(rows) - 1)]
    ox, oy, oz = t["offsetM"]
    _set_from_parent(child, parent, (ox, oy), oz, float(t["yawDeg"]))
    child.scale = parent.scale * float(t.get("partScaleInAnchor") or 1.0)
    child.settledBy = f"template:{t['id']}:{parent.uid}"
    return {"template": {k: t.get(k) for k in ("id", "count", "offsetM", "yawDeg",
                                               "partScaleInAnchor", "isDoor", "anchorScale")},
            "alternatives": len(rows) - 1}


def mount_pairs(child_asset: str, parent_asset: str | None = None) -> list[dict]:
    record = json.loads((paths.PLACEMENT_RECORDS / "kit-mounts-mined.json").read_text())
    return [p for p in record.get("pairs", [])
            if p["child"] == child_asset and (parent_asset is None or p["parent"] == parent_asset)]


def mount(child: Piece, parent: Piece, along_m: float | None = None, point: int = 0) -> dict:
    """Seat a wall / hanging child on its parent by the mined mount pair:
    a band at its recorded out/up offset (anywhere along its axis between
    the mined extremes; `along_m` picks where), or one of the mined points."""
    pairs = mount_pairs(child.asset, parent.asset)
    if not pairs:
        raise ValueError(f"no mined mount pair hangs {child.asset} on {parent.asset}")
    pair = max(pairs, key=lambda p: p.get("n", 0))
    if pair["kind"] == "band":
        offset = list(pair["offsetM"])
        if along_m is not None:
            axis = 0 if pair.get("alongAxis", "x") == "x" else 1
            lo, hi = pair.get("alongMinM"), pair.get("alongMaxM")
            if lo is not None and not (lo <= along_m <= hi):
                raise ValueError(f"along {along_m} is outside the mined band [{lo}, {hi}]")
            offset[axis] = along_m
        yaw = float(pair["yawDeg"])
    else:
        pt = pair["points"][min(point, len(pair["points"]) - 1)]
        offset, yaw = list(pt["offsetM"]), float(pt.get("yawDeg", 0.0))
    _set_from_parent(child, parent, offset[:2], offset[2], yaw)
    child.settledBy = f"mount:{parent.uid}"
    child.role = {**child.role, "mountedOn": parent.uid, "mountPair": {
        "kind": pair["kind"], "n": pair.get("n"), "offsetM": offset, "yawDeg": yaw}}
    return {"pair": {k: pair.get(k) for k in ("kind", "n", "offsetM", "yawDeg", "alongAxis",
                                              "alongMinM", "alongMaxM", "evidence")}}


def runtime_mounted_pose(parent: Piece, mount_offset_m, child_yaw_deg: float) -> dict:
    """Where the RUNTIME puts a mounted child (anchoring.ts `mountedTransform`:
    parent matrix x translate(mountOffsetM) x rotate(placementQuaternion(
    child.yawDeg))), in province metres, for comparison with `mount`."""
    t = math.radians(-parent.yaw)
    # three.js rotation about +Y by -yaw on (x, up, z)
    ox, oy, oz = (v * parent.scale for v in mount_offset_m)
    x = parent.x + ox * math.cos(t) + oz * math.sin(t)
    z = parent.z - ox * math.sin(t) + oz * math.cos(t)
    return {"x": x, "z": z, "y": None if parent.y is None else parent.y + oy,
            "worldYawDeg": (parent.yaw + child_yaw_deg) % 360.0}
