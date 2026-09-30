"""Building assemblies (building-depth-and-variety.md §2): groups saved and
placed as prefabs, variant swaps, the per-building front-face and openings
check, and the repetition signature of a place.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from . import paths
from .mesh_query import on_surface
from .kits import Catalogue
from .scene import Piece, Scene, plan_to_province

PREFABS = paths.SHARED_OUTPUT / "prefabs"
YARD_SETS = paths.REPO_ROOT / "world" / "sources" / "placement" / "yard-sets"
"""The tracked yard-set records (decision 0101): `group place` reads a set
from here first; the gitignored PREFABS hold only the yard fixtures' groups."""
BLOCK_M = 0.25
"""A piece whose surface comes this close to the line straight out of an
opening (0.2 m to `clear` m out) stands in front of it."""


def _rel(anchor: Piece, p: Piece) -> dict:
    """p in the anchor's plan frame (x east, z south at the anchor's yaw 0)."""
    t = math.radians(anchor.yaw)
    dx, dz = p.x - anchor.x, p.z - anchor.z
    return {"atM": [dx * math.cos(t) + dz * math.sin(t), -dx * math.sin(t) + dz * math.cos(t)],
            "upM": None if (p.y is None or anchor.y is None) else p.y - anchor.y,
            "yaw": (p.yaw - anchor.yaw) % 360.0}


def save_group(scene: Scene, name: str, uids: list[str], anchor_uid: str) -> dict:
    anchor = scene.piece(anchor_uid)
    members = []
    for uid in uids:
        p = scene.piece(uid)
        members.append({**_rel(anchor, p), "uid": uid, "asset": p.asset, "scale": p.scale,
                        "pitch": p.pitch, "roll": p.roll, "mirror": p.mirror,
                        "role": p.role, "settledBy": p.settledBy})
    PREFABS.mkdir(parents=True, exist_ok=True)
    out = {"schemaVersion": 1, "name": name, "anchor": {"uid": anchor.uid, "asset": anchor.asset},
           "members": members}
    (PREFABS / f"{name}.json").write_text(json.dumps(out, indent=1))
    return {"saved": name, "members": len(members), "anchor": anchor.uid}


MOUNTS_RECORD = paths.REPO_ROOT / "world" / "sources" / "placement" / "kit-mounts-mined.json"


def mined_mount_pairs(path: Path = MOUNTS_RECORD) -> set[tuple[str, str]]:
    """{(child asset, parent asset)} the plugins mount (kit-mounts-mined.json)."""
    return {(p["child"], p["parent"]) for p in json.loads(path.read_text())["pairs"]}


def unmined_mounts(st: dict, pairs: set[tuple[str, str]], cat=None) -> list[str]:
    """The members of yard set ``st`` whose `mount` names no mined
    child-on-parent pair (planner ruling 5, 2026-09-26: no height shortcut;
    a piece stands on the ground, on a post piece, or on a mined mount),
    unless the member carries `"unmined": "reader-approved rN"` and passes
    the small-mount bar (`snap.unmined_refusal`, 0102 decision 5 as amended;
    the bar is judged when ``cat`` is given, else the member is refused)."""
    from .snap import unmined_refusal
    piece = {m["uid"]: m["piece"] for m in st["members"]}
    out = []
    for m in st["members"]:
        if "mount" not in m or (m["piece"], piece.get(m["mount"].get("on"))) in pairs:
            continue
        if "unmined" in m and cat is not None and \
                unmined_refusal(cat, m["piece"], 1.0, m["unmined"]) is None:
            continue
        out.append(m["uid"])
    return out


def yard_sets() -> dict[str, dict]:
    """{set id: set} over every tracked yard-set record; a member mounted
    on a pair the plugins never mount is refused."""
    out = {}
    pairs = mined_mount_pairs()
    cat = None                  # built once, only when a set carries an unmined member
    for f in sorted(YARD_SETS.glob("*.json")):
        for st in json.loads(f.read_text())["sets"]:
            if st["id"] in out:
                raise ValueError(f"yard set {st['id']!r} is defined twice ({f.name})")
            if cat is None and any("unmined" in m for m in st["members"]):
                cat = Catalogue()
            bad = unmined_mounts(st, pairs, cat)
            if bad:
                raise ValueError(f"yard set {st['id']!r}: {bad} mount on no mined pair "
                                 f"({MOUNTS_RECORD.name}) and carry no approved small unmined "
                                 f"mount (\"unmined\": \"reader-approved rN\", plan side < 0.6 m, "
                                 f"height < 1.0 m); stand them on the ground or a post piece")
            out[st["id"]] = st
    return out


def group_names() -> list[str]:
    return sorted(set(yard_sets()) | {p.stem for p in PREFABS.glob("*.json")})


def load_group(name: str) -> dict:
    """A group in the saved-prefab shape: the tracked yard set of that id
    (members settled on the ground unless mounted `upM` above the anchor),
    else the gitignored prefab `save_group` wrote."""
    st = yard_sets().get(name)
    if st is None:
        path = PREFABS / f"{name}.json"
        if not path.exists():
            raise ValueError(f"no yard set or prefab named {name!r}")
        return json.loads(path.read_text())
    members = []
    for m in st["members"]:
        mount = m.get("mount")
        role = {"on": "ground"}
        if mount:
            # the mount's evidence travels with the piece to the export (0102)
            role = {"mountPair": {"kind": "unmined", "unmined": m["unmined"]} if "unmined" in m
                    else {"kind": "mined", "yardSet": st["id"]}}
        members.append({"uid": m["uid"], "asset": m["piece"], "atM": m["offsetM"],
                        "yaw": m["yaw"], "upM": mount["upM"] if mount else None,
                        "scale": 1.0, "pitch": 0.0, "roll": 0.0, "mirror": False,
                        "role": role, "settledBy": None,
                        "mountOn": mount["on"] if mount else None})
    return {"schemaVersion": 1, "name": name, "anchor": {"uid": st["anchor"]},
            "members": members}


def group_sockets(name: str, prefix: str, cat=None) -> list[dict]:
    """The socket ops a tracked yard set yields when placed with `prefix`
    (decision 0103 decision 6): its container members a `container` socket
    (class from the name family, the member's `fillRule` else the class
    default), its furniture members with an activity family an `idle`
    socket. One rule, `worldgen.sockets.yard_set_sockets`, which the compile
    also runs over the layout's `group place` ops; a saved prefab yields none."""
    st = yard_sets().get(name)
    if st is None:
        return []
    paths.bridge()
    from worldgen import sockets as sk
    cat = Catalogue() if cat is None else cat

    def category_of(asset: str) -> str | None:
        try:
            return cat.row(asset).get("category")
        except (KeyError, ValueError):
            return None
    return sk.yard_set_sockets(st, prefix, category_of, sk.load_vocabulary())


def place_group(scene: Scene, name: str, at, yaw: float, prefix: str,
                parcel: str | None, cat=None) -> list[Piece]:
    """Recreate a saved group with its anchor at `at`, turned to `yaw`;
    members keep their pose relative to the anchor (heights relative to the
    anchor's; settle the anchor first, then the ground members). A yard-set
    member that yields a socket carries it on its role (`socket`), so the
    scene shows what the compile will make of it."""
    group = load_group(name)
    yielded = {op["host"]: op for op in group_sockets(name, prefix, cat)}
    anchor_row = next(m for m in group["members"] if m["uid"] == group["anchor"]["uid"])
    made = []
    for m in group["members"]:
        yaw_m = (yaw + m["yaw"]) % 360.0
        x, z = plan_to_province(at, yaw, m["atM"])
        role = dict(m["role"] or {})
        if parcel and role.get("kind") in ("parcel", "assembly"):
            role["id"] = parcel
        if m.get("mountOn") and "mountPair" in role:
            role["mountedOn"] = prefix + m["mountOn"]
        if prefix + m["uid"] in yielded:
            role["socket"] = {k: v for k, v in yielded[prefix + m["uid"]].items()
                              if k not in ("op", "host")}
        p = Piece(uid=prefix + m["uid"], asset=m["asset"], x=x, z=z, yaw=yaw_m,
                  y=None, scale=m["scale"], role=role, pitch=m["pitch"], roll=m["roll"],
                  mirror=m["mirror"], settledBy=f"group:{name}")
        p.notes.append(f"from group {name}: upM {m['upM']}")
        made.append(scene.add(p))
    # heights: relative to the anchor once it is settled (the caller settles it)
    scene.log.append(f"group place {name}: anchor {prefix + anchor_row['uid']}")
    return made


def lift_group(scene: Scene, name: str, prefix: str) -> None:
    """After the anchor and the ground members are settled: give every other
    member its saved height above the member it is mounted on (a tracked
    yard set's `mount.on`), else above the anchor (a saved prefab)."""
    group = load_group(name)
    anchor_uid = group["anchor"]["uid"]
    for m in group["members"]:
        if m["uid"] == anchor_uid or m["upM"] is None or (m["role"] or {}).get("on") == "ground":
            continue
        base = scene.piece(prefix + (m.get("mountOn") or anchor_uid))
        member = scene.piece(prefix + m["uid"])
        # the host this height is measured from, so a later reseat of the
        # host carries the member with it (scene.hung_on; r4 review)
        member.role = {**(member.role or {}), "liftedOn": base.uid}
        if base.y is not None:
            member.y = base.y + m["upM"]


def swap(cat: Catalogue, piece: Piece, asset: str, keep: str = "base") -> dict:
    """Replace the piece's asset in place: same pivot and turn; with
    keep=base the new piece's base is where the old base was."""
    old, new = cat.row(piece.asset), cat.row(asset)
    before = piece.asset
    if keep == "base" and piece.y is not None:
        piece.y += (float(new["originOffsetM"][2]) - float(old["originOffsetM"][2])) * piece.scale
    piece.asset = asset
    piece.settledBy = f"swap:{keep}"
    return {"uid": piece.uid, "from": before, "to": asset, "y": piece.y}


def openings(cat: Catalogue, scene: Scene, uid: str, clear_m: float = 1.0) -> dict:
    """The front face and openings check of one building: each doorway's
    distance to a path (door_report) and, for every doorway and every window
    (the shell's own openings from `describe`, and the window pieces bound to
    it as assembly members), how close any other piece or the terrain comes
    within `clear_m` straight out from it."""
    from trimesh.proximity import ProximityQuery
    from . import describe, measure
    shell = scene.piece(uid)
    d = describe.describe(cat, shell.asset)
    points = []
    for door in d["doorways"]:
        points.append(("doorway", door["source"], door["planXZ"],
                       door.get("sideDeg"), 1.2 - float(d["pivotAboveBaseM"])))
    for o in d["openings"]:
        if o["kind"] == "window":
            points.append(("window", "mesh-opening", o["centrePlanXZ"], o["bearingDeg"],
                           o["centreKitM"][2]))
    for p in scene.pieces:
        role = p.role or {}
        if role.get("kind") == "assembly" and role.get("layer") in ("window", "shutter") \
                and _parcel_shell(scene, role["id"]) is shell:
            rel = _rel(shell, p)
            bearing = (p.yaw - shell.yaw) % 360.0
            points.append(("window", p.uid, rel["atM"], bearing,
                           (rel["upM"] or 0.0) / max(shell.scale, 1e-6)))
    ground = scene.ground()
    reach = clear_m + 1.0
    s_low, s_high = _world_bounds(cat, shell)
    others = [q for q in scene.pieces if q is not shell and q.y is not None
              and not ((q.role or {}).get("kind") == "assembly"
                       and _parcel_shell(scene, q.role["id"]) is shell)]
    # bounds are only the candidate filter: pieces that could reach the 1 m in front
    others = [q for q in others
              if np.all(_world_bounds(cat, q)[0] <= s_high + reach)
              and np.all(_world_bounds(cat, q)[1] >= s_low - reach)]
    queries = {q.uid: ProximityQuery(cat.mesh(q.asset)) for q in others}
    rows = []
    for kind, source, plan, bearing, z_kit in points:
        if bearing is None or shell.y is None:
            continue
        cx, cz = plan_to_province((shell.x, shell.z), shell.yaw,
                                  (plan[0] * shell.scale, plan[1] * shell.scale))
        b = math.radians(shell.yaw + bearing)
        out = np.array([math.sin(b), math.cos(b), 0.0])
        base = np.array([cx, -cz, shell.y + z_kit * shell.scale])
        samples = [base + out * t for t in np.linspace(0.2, clear_m, 5)]
        nearest, what = math.inf, None
        for q in others:
            a, t = q.matrix()
            local = (np.array(samples) - t) @ np.linalg.inv(a).T
            _c, dist, _tri = on_surface(queries[q.uid], local)
            if float(dist.min()) * q.scale < nearest:
                nearest, what = float(dist.min()) * q.scale, q.uid
        terrain = min(float(s[2]) - ground.chunk_height(s[0], -s[1]) for s in samples)
        rows.append({"kind": kind, "source": source, "facingDeg": round((shell.yaw + bearing) % 360, 1),
                     "nearestPieceM": None if what is None else round(nearest, 2),
                     "nearestPiece": what, "aboveTerrainM": round(terrain, 2),
                     "clear": (what is None or nearest >= BLOCK_M) and terrain > 0.0})
    doors = measure.door_report(cat, scene, shell)
    return {"uid": uid, "doorToPath": doors and doors["best"], "openings": rows,
            "blocked": [r for r in rows if not r["clear"]]}


def _world_bounds(cat: Catalogue, p: Piece) -> tuple[np.ndarray, np.ndarray]:
    m = cat.mesh(p.asset)
    corners = np.array([[x, y, z] for x in m.bounds[:, 0] for y in m.bounds[:, 1]
                        for z in m.bounds[:, 2]])
    w = p.world_points(corners)
    return w.min(axis=0), w.max(axis=0)


def _parcel_shell(scene: Scene, parcel_id: str) -> Piece | None:
    for p in scene.pieces:
        if (p.role or {}).get("kind") == "parcel" and p.role.get("id") == parcel_id:
            return p
    return None


def signature(scene: Scene) -> dict:
    """The repetition signature of every building in the scene: its shell
    plus the multiset of (layer, asset) of its assembly members. Two
    buildings with one signature read as copies (MP §3)."""
    sigs: dict[str, list[str]] = {}
    for shell in scene.pieces:
        role = shell.role or {}
        if role.get("kind") != "parcel":
            continue
        members = sorted(f"{q.role.get('layer')}:{q.asset.rsplit('/', 1)[-1]}"
                         for q in scene.pieces if (q.role or {}).get("kind") == "assembly"
                         and q.role.get("id") == role["id"])
        key = shell.asset.rsplit("/", 1)[-1] + " | " + ", ".join(members)
        sigs.setdefault(key, []).append(shell.uid)
    return {"buildings": sum(len(v) for v in sigs.values()), "distinct": len(sigs),
            "shared": {k: v for k, v in sigs.items() if len(v) > 1},
            "signatures": sigs}
