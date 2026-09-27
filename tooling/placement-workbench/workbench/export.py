"""Export the scene's poses into a blueprint record the compile realises
unchanged. Only POSE fields are written; everything authored around them
(prose, districts, doors, routes' ids) stays as the author wrote it, and
the derived fields (footprints, door thresholds, district hulls) are
re-derived afterwards by the settlement-build passes, never here.

A piece's `role` (set with `wb.py bind`) says where its pose goes:

* ``parcel <id>``: one-asset parcel: `assetRef`, `centreUV`, `yawDeg`, and
  `pad` {datumM, apronM, floorMinM?} when the piece declares one (0101: the
  datum resolved here; the compile seats on it, the bundle export writes
  its `settlement-pad` patch).
* ``run <id> --index n``: a `pieces` parcel whose members carry authored
  poses: the parcel's `centreUV`/`yawDeg` are piece 0's pivot and yaw; each
  member is ``{asset, atM: [x, z], yaw}`` in the parcel's own frame (x
  east, z south at the parcel's yaw 0; `yaw` relative to the parcel's
  `yawDeg`), so `blueprint_footprints.lay_pieces` places it exactly (the
  `atM` member field; without it a run is laid by the mined abuts pairs).
* ``landmark <id>``: `position` UV and `yawDeg` (a mounted child keeps its
  parent binding; the compile seats it by the mined pair).
* ``assembly <shell parcel id>``: a member of that shell's `assembly`
  (`blueprint.assembly_failures`): `atM` in the shell's frame, `yaw` and
  `pitch` relative to it, `upM` above its pivot when hung `on: parent`,
  its `layer` and `evidence`. Roll and mirror are refused: the runtime
  turns a piece by yaw and pitch only. A piece mounted by `mount` or a yard
  set carries its `role.mountPair` as the member's own `mountPair` field
  (`mount_pair`: kind, the piece it is mounted on, and the mined pair's n,
  the yard set, or the unmined mount's approving render round), which the
  compile copies into the placement row's provenance (0102 decision 5).

`--write` also writes `walkRoutes` (`rules.walk_routes`: per walkRule
target the route's polyline in metres, its length, steepest grade, largest
step and deepest water; planner ruling 1, the walk grid is never written);
the bundle export copies it onto the place (`walk_routes_field`).

`--write` also records `authoredOn` (0100 decision 6): the sha256 of the
ground window's source chunk files, of every kit manifest a piece comes
from, of the layout file `apply` built the scene from, and the workbench
schemaVersion, so a later change to the ground or a kit under an authored
place is detected, never silent.

Scene paths whose id matches a blueprint route write its `via` (UV);
`street_router --apply` derives its `points` from them. A blueprint door on a bound shell takes the threshold and
facing of the doorway `wb.py doors` measures nearest a path (`door_poses`).
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

from .assembly import _rel
from .scene import SCHEMA_VERSION, Scene

UV_ROUND = 9


def _uv(x: float, z: float, extent: float) -> list[float]:
    return [round(x / extent, UV_ROUND), round(z / extent, UV_ROUND)]


def _slug(uid: str) -> str:
    """A scene uid as a stable assembly member id (lower-case slug)."""
    return re.sub(r"[^a-z0-9-]+", "-", uid.lower()).strip("-") or "piece"


def _local(dx: float, dz: float, yaw_deg: float) -> list[float]:
    """Province offset -> the parcel frame (inverse of the compile's turn)."""
    t = math.radians(yaw_deg)
    return [round(dx * math.cos(t) + dz * math.sin(t), 4),
            round(-dx * math.sin(t) + dz * math.cos(t), 4)]


def _has_median(cat, asset: str) -> bool:
    try:
        value = cat.row(asset).get("placedScaleMedian")
    except (KeyError, ValueError):
        return False
    return isinstance(value, (int, float)) and value > 0


def poses(scene: Scene, extent: float) -> dict:
    """{'parcels': {id: fields}, 'landmarks': {id: fields}, 'routes': {id: fields}}."""
    out: dict[str, dict] = {"parcels": {}, "landmarks": {}, "routes": {}}
    runs: dict[str, list] = {}
    assemblies: dict[str, list] = {}
    cat = None                          # built once, on the first padded piece
    for p in scene.pieces:
        kind, rid = p.role.get("kind"), p.role.get("id")
        if not kind or kind == "ring":
            # a ring piece is the compile's own dressing (16k r8 rule 5)
            continue
        if p.roll or p.mirror:
            raise ValueError(f"{p.uid}: roll {p.roll} / mirror {p.mirror}: the runtime draws "
                             f"neither (placementQuaternion is yaw + pitch), so the record "
                             f"cannot carry this pose")
        yaw = round(p.yaw % 360.0, 3)
        if kind == "assembly":
            assemblies.setdefault(rid, []).append(p)
            continue
        if p.pitch:
            raise ValueError(f"{p.uid}: pitch is exported only for assembly pieces")
        if kind == "parcel":
            fields = {"assetRef": p.asset, "centreUV": _uv(p.x, p.z, extent), "yawDeg": yaw}
            if cat is None:
                from .kits import Catalogue
                cat = Catalogue()               # one catalogue for every parcel
            if p.scale != 1.0 or _has_median(cat, p.asset):
                # a manifest median is the default the compile would not know
                # to take, so its scale is written whatever it is (16k r8)
                fields["scale"] = p.scale
            if p.pad is not None:
                fields["pad"] = _pad_record(cat, scene, p)
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
    for rid, pieces in assemblies.items():
        shell = next((q for q in scene.pieces if q.role.get("kind") == "parcel"
                      and q.role.get("id") == rid), None)
        if shell is None or rid not in out["parcels"]:
            raise ValueError(f"assembly pieces {[q.uid for q in pieces]} name parcel {rid}, "
                             f"which no scene piece is bound to as its shell")
        rows = []
        members = {q.uid for q in pieces}
        for q in sorted(pieces, key=lambda q: q.uid):
            host = mount_host(scene, q, shell, members)
            frame = host or shell
            rel = _rel(frame, q)
            if q.role["on"] == "parent" and not math.isclose(q.scale, frame.scale):
                raise ValueError(f"{q.uid}: scale {q.scale} on {frame.uid} at "
                                 f"{frame.scale}: the runtime draws a hung piece at its "
                                 f"parent's scale; seat it on the ground or use scale "
                                 f"{frame.scale}")
            row = {"id": _slug(q.uid), "asset": q.asset,
                   "atM": [round(v, 4) for v in rel["atM"]],
                   "yaw": round(rel["yaw"], 3), "on": q.role["on"],
                   "layer": q.role["layer"], "evidence": q.role["evidence"]}
            pair = mount_pair(q.role)
            if pair:
                row["mountPair"] = pair
            if q.role["on"] == "parent":
                if rel["upM"] is None:
                    raise ValueError(f"{q.uid}: a piece on its shell needs a height")
                row["upM"] = round(rel["upM"], 4)
                if host is not None:
                    row["host"] = _slug(host.uid)
            if q.pitch:
                row["pitch"] = round(q.pitch, 3)
            if q.scale != 1.0 and q.role["on"] == "ground":
                row["scale"] = q.scale
            rows.append(row)
        out["parcels"][rid]["assembly"] = rows
    for path in scene.paths:
        pts = [_uv(x, z, extent) for x, z in path["pointsM"]]
        out["routes"][path["id"]] = {"via": pts}     # points: street_router derives them
    return out


def mount_host(scene: Scene, q, shell, members: set[str]):
    """The member a hung assembly piece is mounted on (16k walk 2 P4/D7): the
    piece its mount, template or lift names (`scene.hung_on`) when that is
    another member of the same assembly, so the compile parents it THERE with
    the mined offset, never on the shell. None when it hangs on the shell or
    stands on the ground; a host outside the assembly is refused by name."""
    from .scene import hung_on
    if q.role.get("on") != "parent":
        return None
    uid = hung_on(q)
    if uid is None or uid == shell.uid:
        return None
    if uid not in members:
        raise ValueError(f"{q.uid}: mounted on {uid}, which is not a member of assembly "
                         f"{q.role.get('id')} (bind it to the parcel its host is bound to)")
    return scene.piece(uid)


def mount_pair(role: dict) -> dict | None:
    """A bound piece's mount as its assembly member's `mountPair` field
    (blueprint.MOUNT_PAIR_KINDS): {kind, mountedOn, and n (a mined band or
    points pair), yardSet (a mined yard-set member) or unmined (the render
    round that approved an unmined mount, 'reader-approved rN')}; None when
    the piece was not mounted."""
    pair = role.get("mountPair")
    if not pair:
        return None
    out = {"kind": pair["kind"]}
    if role.get("mountedOn"):
        out["mountedOn"] = role["mountedOn"]
    for key in ("n", "yardSet", "unmined"):
        if pair.get(key) is not None:
            out[key] = pair[key]
    return out


def _pad_record(cat, scene: Scene, p) -> dict:
    """A building's declared pad as the record the compile reads (0101): the
    datum resolved on this pose (never re-solved downstream), the apron, the
    flood floor when authored. A pad the compile would refuse is refused here
    (`pads.refusal`, the compile's own judge)."""
    from . import pads
    g = scene.ground()
    got = pads.resolve(cat, g, p)
    why = pads.refusal(cat, g, p, got)
    if why:
        raise ValueError(f"{p.uid}: {why}")
    rec = {"datumM": got["datumM"], "apronM": got["apronM"]}
    if "floorMinM" in p.pad:
        rec["floorMinM"] = float(p.pad["floorMinM"])
    return rec


def place_catalogue(place_id: str):
    """The catalogue with the place's own culture kits first, the order
    `check` and the compile resolve shared asset ids in (wb.place_catalogue)."""
    from .kits import Catalogue
    cat = Catalogue()
    if place_id:
        from . import paths as wbpaths
        wbpaths.bridge()
        from worldgen import compile_settlement as cs
        cat.shelf.preferred_kits = cs.place_kit_preference(place_id)
    return cat


def tag_door_routes(walk_routes: dict, doors: list[dict]) -> dict:
    """Name on each bound-door route the blueprint doors it reaches: every
    door of the route's parcel, which `door_poses` stands at that bound
    doorway. The compile's door-reach gate reads these ids (r4 review)."""
    by_parcel: dict[str, list[str]] = {}
    for d in doors:
        by_parcel.setdefault(d.get("parcelId"), []).append(d["id"])
    for route in (walk_routes.get("routes") or {}).values():
        ids = by_parcel.get(route.get("parcelId"))
        if ids:
            route["doorIds"] = sorted(ids)
    return walk_routes


def door_poses(scene: Scene, extent: float) -> dict[str, dict]:
    """{parcel id: {thresholdUV, facingDeg}} for every shell bound to a
    parcel: the measured doorway `wb.py doors` reports as `best` (the one
    nearest a scene path), with the facing its record gives, which is what
    the validator matches (`blueprint_integration.match_entrance`: a radial
    entrance's facing is its bearing on the ring). A door is a pose: it
    moves with its building, so it is exported with it."""
    from . import measure
    from .kits import Catalogue
    cat = Catalogue()
    out = {}
    for p in scene.pieces:
        if p.role.get("kind") != "parcel":
            continue
        report = measure.door_report(cat, scene, p)
        if not report or report["best"]["facingDeg"] is None:
            continue
        best = report["best"]
        out[p.role["id"]] = {"thresholdUV": _uv(*best["thresholdM"], extent),
                             "facingDeg": best["facingDeg"]}
    return out


def _sha256(path: Path) -> str:
    import hashlib
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def authored_on(scene: Scene) -> dict:
    """What the poses were authored on: the ground window's chunk files,
    the kit manifests of every piece, the layout file and the workbench
    schema (0100 decision 6)."""
    from . import paths
    from .kits import Catalogue
    cat = Catalogue()
    ground = scene.ground()
    kits = sorted({cat.row(p.asset)["kit"] for p in scene.pieces})
    return {"wbSchemaVersion": SCHEMA_VERSION,
            "ground": {"centreM": ground.meta["centreM"], "halfM": ground.meta["halfM"],
                       **ground.provenance()},
            "kits": {k: _sha256(paths.PUBLISHED_KITS / f"{k}.kit.json") for k in kits},
            "layout": scene.layout}


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
        if "assembly" not in fields:
            parcel.pop("assembly", None)    # the scene holds no assembly for it now
        if "pad" not in fields:
            parcel.pop("pad", None)         # the piece declares no pad now
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
    doors = door_poses(scene, extent)          # one pass over the shells
    for door in bp.get("doors", []) or []:
        fields = doors.get(door.get("parcelId"))
        if fields:
            door.update(fields)
            changed.append(door["id"])
    if write:
        from . import rules
        from .kits import Catalogue
        bp["authoredOn"] = authored_on(scene)
        bp.pop("walkGraph", None)               # the grid is never written (ruling 1)
        bp["walkRoutes"] = tag_door_routes(rules.walk_routes(place_catalogue(scene.placeId), scene),
                                           bp.get("doors", []) or [])
        # the settlement passes' own writer convention (blueprint_footprints)
        blueprint.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    return {"blueprint": str(blueprint), "written": write, "changed": changed,
            "createdSkeletons": created, "landmarksNotInBlueprint": unknown,
            "next": "cd tooling/world-generation && python3 -m worldgen.blueprint_footprints "
                    "--apply <bp> && --areas --doors <bp> && python3 -m worldgen.street_router "
                    "--apply <bp> && python3 -m worldgen.blueprint --check"}
