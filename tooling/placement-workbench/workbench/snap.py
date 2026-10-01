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
import re
from functools import lru_cache

import numpy as np

from . import paths
from .mesh_query import cast_rays
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
    base = lambda asset: asset.rsplit("/", 1)[-1]
    own_pair = {f"{base(parent_asset)}>{base(child_asset)}",
                f"{base(child_asset)}>{base(parent_asset)}"}
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
                            "sourceSet": pair.get("sourceSet"),
                            # a family pair none of whose members is this
                            # piece pair carries another piece's step (fix
                            # round 2: fencewoven02's 2.05 m outranked
                            # fencewoven01's own 3.88 m on count alone)
                            "foreign": kind == "family" and not (
                                own_pair & set(pair.get("members") or {}))})
    # 16k fix 2 r3 ruling 6: the piece's own plugin says how its pieces join,
    # so its pairs outrank another mod's reuse of the same mesh (vanilla's
    # fencewoven02 2.14 m step over BM&V Valenwood's 2.00 m)
    owner = child_asset.split(":", 1)[0]
    own_plugin = lambda s: s.get("sourceSet") in (owner,) or str(
        s.get("sourceSet") or "").startswith(owner + "-")
    out.sort(key=lambda s: (s["foreign"], not own_plugin(s), -s["count"], s["kind"] != "piece"))
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
    mined abuts step with the most evidence (or `pick`). A step joining on
    one of EITHER piece's `terminal_faces` (a face the plugins end runs on,
    such as a broken wall end) is skipped unless `allow_terminal`."""
    ends = terminal_faces(parent.asset)
    child_ends = terminal_faces(child.asset)
    steps = [s for s in evidence_steps(parent.asset, child.asset)
             if (parent_face is None or s["parentFace"] == parent_face)
             and (child_face is None or s["childFace"] == child_face)]
    skipped = [s for s in steps if s["parentFace"] in ends or s["childFace"] in child_ends]
    if not allow_terminal:
        steps = [s for s in steps if s not in skipped]
    if not steps:
        raise ValueError(f"no mined abuts pair joins {child.asset} to {parent.asset}"
                         + (f" on {parent_face}>{child_face}" if parent_face or child_face else "")
                         + (f" (skipped {len(skipped)} on faces the plugins end the run on: "
                            f"parent {sorted(ends)}, child {sorted(child_ends)}; "
                            f"--allow-terminal to use them)" if skipped else ""))
    step = steps[min(pick, len(steps) - 1)]
    _set_from_parent(child, parent, step["offsetM"], step["riseM"], step["yawDeg"])
    child.settledBy = f"evidence-snap:{parent.uid}"
    return {"used": step, "alternatives": len(steps) - 1,
            "skippedTerminalSteps": len(skipped) if not allow_terminal else 0,
            "parentTerminalFaces": sorted(ends), "childTerminalFaces": sorted(child_ends)}


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
    # FCL takes a rigid transform: scaled pieces go in as pre-scaled meshes
    # (the one rule of `measure._rigid4` / `_fcl_mesh`, walk 2 round 4)
    from .measure import _fcl_mesh, _rigid4
    manager.add_object("p", _fcl_mesh(cat, parent), transform=_rigid4(parent))
    manager.add_object("c", _fcl_mesh(cat, child), transform=_rigid4(child))
    base = np.array([child.x, -child.z, child.y])

    def crossing(t: float) -> bool:
        moved = base + n * t
        t = _rigid4(child)
        t[:3, 3] = moved
        manager.set_transform("c", t)
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


UNMINED_MAX_PLAN_M = 0.6
UNMINED_MAX_HEIGHT_M = 1.0
"""0102 decision 5 as amended (planner ruling 5, 2026-09-26): a child whose
longest PLAN side is under 0.6 m and whose height is under 1.0 m may mount on
a parent with no mined pair when the op names the render round that
approved it."""
UNMINED_RE = re.compile(r"^reader-approved r[0-9]+$")


def unmined_refusal(cat, asset: str, scale: float, approval: str | None,
                    hanging: bool = False) -> str | None:
    """Why a small unmined mount of ``asset`` at ``scale`` is refused, or
    None: the approval must read 'reader-approved rN', the longest plan side
    be under UNMINED_MAX_PLAN_M and the height under UNMINED_MAX_HEIGHT_M.
    Shared by `mount --unmined` and the yard sets' `unmined` member field;
    ``hanging`` (`mount --hang`, R53) drops the size caps."""
    if not UNMINED_RE.match(approval or ""):
        return (f"an unmined mount must name the render round that approved it "
                f"('reader-approved rN'), got {approval!r}")
    size = [float(v) * scale for v in cat.row(asset)["sizeM"]]
    plan, height = max(size[0], size[1]), size[2]
    if (cat.row(asset).get("anchorClass") or "") == "fx":
        # an effect (a flame in its brazier bowl) is exempt from the size caps
        # (planner ruling 2, CLAYWATER2 2026-09-28); the approval stands
        return None
    if hanging:
        # R53: a hanging piece is exempt from the size caps (histflower01's
        # strand is 1.16 m across and 3.46 m long; planner confirmed the plan
        # cap's exemption, walk 4 lane COMPILE); the approval stands
        return None
    if plan >= UNMINED_MAX_PLAN_M or height >= UNMINED_MAX_HEIGHT_M:
        return (f"no mined mount pair hangs {asset}, and its longest plan side {plan:.3f} m / "
                f"height {height:.3f} m is not under {UNMINED_MAX_PLAN_M} m / "
                f"{UNMINED_MAX_HEIGHT_M} m (0102 decision 5)")
    return None


def unmined_wall_mount(cat, child: Piece, parent: Piece, approval: str) -> dict:
    """A small unmined child hung on its parent's WALL where it is placed
    (planner ruling 2026-09-27 walk 2 round 4: a sconce or lantern 0.3 m
    beside a door frame at hand height): its height kept, it is slid
    horizontally onto the parent's nearest wall face until its bounds touch
    it. Refused by `unmined_refusal`, like the top mount."""
    if cat is None:
        raise ValueError("an unmined mount needs the catalogue (the child's size, the parent's mesh)")
    why = unmined_refusal(cat, child.asset, child.scale, approval)
    if why:
        raise ValueError(f"unmined mount {child.uid} on {parent.uid}: {why}")
    if parent.y is None or child.y is None:
        raise ValueError(f"unmined wall mount: {parent.uid} and {child.uid} need a height first")
    from trimesh.proximity import closest_point
    pmesh = cat.mesh(parent.asset).copy().apply_transform(_t4(parent))
    cmesh = cat.mesh(child.asset).copy().apply_transform(_t4(child))
    centre = (cmesh.bounds[0] + cmesh.bounds[1]) / 2.0
    near, dist, _tri = closest_point(pmesh, np.array([centre]))
    d = np.array([centre[0] - near[0][0], centre[1] - near[0][1]])
    n = float(np.linalg.norm(d))
    if n < 1e-6:
        raise ValueError(f"unmined wall mount: {child.uid} stands inside {parent.uid}")
    u = d / n
    half = float(np.max(np.abs((cmesh.vertices[:, :2] - centre[:2]) @ u)))
    shift = (n - half) * u                                  # slide back onto the face
    child.x -= float(shift[0])
    child.z += float(shift[1])                              # mesh y is -z
    child.settledBy = f"mount:{parent.uid}"
    prov = {"kind": "unmined", "unmined": approval, "on": "wall",
            "longestPlanSideM": round(max(float(v) * child.scale for v in cat.row(child.asset)["sizeM"][:2]), 3),
            "heightM": round(float(cat.row(child.asset)["sizeM"][2]) * child.scale, 3),
            "yawDeg": (child.yaw - parent.yaw) % 360.0}
    child.role = {**child.role, "mountedOn": parent.uid, "mountPair": prov}
    child.notes.append(f"unmined wall mount on {parent.uid}: {approval}")
    return {"pair": prov}


def _like_parent_mesh(cat, asset: str):
    """The mined pair's parent mesh: the kit's, else the mount miner's own
    triangle cache of the plugin static (`mine_mounts.MESH_CACHE`, metres,
    z up, the NIF's frame)."""
    try:
        return cat.mesh(asset)
    except Exception:  # noqa: BLE001 - not kitted: the miner's cache
        import trimesh
        cache = paths.REPO_ROOT / "tooling" / "world-generation" / "output" / "mesh-cache"
        row = json.loads((cache / "index.json").read_text()).get(asset)
        if not row:
            raise ValueError(f"mount --like: {asset} is neither kitted nor in the mount miner's "
                             f"mesh cache ({cache}); mine it with --assets ... --merge")
        z = np.load(cache / row["npz"])
        return trimesh.Trimesh(z["vertices"], z["faces"], process=False)


def _wall_normal(mesh, point) -> tuple[np.ndarray, float]:
    """(horizontal unit normal out of the mesh's nearest face toward
    `point`, the horizontal distance to it)."""
    from trimesh.proximity import closest_point
    near, _d, tri = closest_point(mesh, np.array([point]))
    d = np.asarray(point[:2]) - near[0][:2]
    n = float(np.linalg.norm(d))
    if n < 1e-6:
        fn = mesh.face_normals[int(tri[0])][:2]
        return fn / max(float(np.linalg.norm(fn)), 1e-9), 0.0
    return d / n, n


TWIN_TOL_M = 0.01
"""R98: a re-textured NIF is its vanilla twin's geometry when its bounds and
its hook (the centre of its top 10 % of height) match within this."""


def twin_refusal(cat, child_asset: str, twin: str) -> str | None:
    """Why `child_asset` is not `twin`'s geometric twin (R98), or None."""
    a, b = (np.asarray(cat.mesh(x).vertices) for x in (child_asset, twin))

    def hook(v):
        z = v[:, 2]
        return v[z >= z.max() - 0.1 * (z.max() - z.min())].mean(0)
    for what, x, y in (("bounds min", a.min(0), b.min(0)), ("bounds max", a.max(0), b.max(0)),
                       ("hook", hook(a), hook(b))):
        off = float(np.max(np.abs(x - y)))
        if off > TWIN_TOL_M:
            return f"{child_asset} is not {twin}'s twin: {what} differ by {off:.3f} m (> {TWIN_TOL_M})"
    return None


def like_wall_mount(cat, scene, child: Piece, parent: Piece, like: str,
                    twin: str | None = None) -> dict:
    """R97: hang a child on the WALL of a host it has no mined pair with,
    by the mined wall pair it does have (`like` = that pair's parent asset):
    the pair's distance off its wall plane, its height and its yaw relative
    to the wall normal, all measured on the mined parent's mesh, applied to
    the host's wall face nearest where the child is placed (the host's
    actual mesh). The 0102 cap for unmined mounts is untouched: this needs a
    mined pair."""
    if twin:
        why = twin_refusal(cat, child.asset, twin)
        if why:
            raise ValueError(f"mount --twin: {why}")
    pairs = mount_pairs(twin or child.asset, like)
    if not pairs:
        raise ValueError(f"mount --like: no mined pair hangs {twin or child.asset} on {like}")
    pair = max(pairs, key=lambda q: q.get("n", 0))
    if pair["kind"] == "band":
        off, ryaw = list(pair["offsetM"]), float(pair["yawDeg"])
    else:
        pt = pair["points"][0]
        off, ryaw = list(pt["offsetM"]), float(pt.get("yawDeg", 0.0))
    lmesh = _like_parent_mesh(cat, like)
    cverts = np.asarray(cat.mesh(child.asset).vertices) * child.scale
    ck = (cverts.min(0) + cverts.max(0)) / 2.0                  # the child's centre, kit frame
    c = yaw_matrix(ryaw) @ ck + np.array(off, dtype=float)     # in the mined parent's frame
    ln, ld = _wall_normal(lmesh, c)                             # out of the wall through the centre
    wall_bearing = math.degrees(math.atan2(ln[0], ln[1])) % 360.0
    rel = (ryaw - wall_bearing) % 360.0
    from . import pads
    g = pads.ground_for(cat, scene, None)
    base = float(g.chunk_height(child.x, child.z))
    hmesh = cat.mesh(parent.asset).copy().apply_transform(_t4(parent))
    probe = np.array([child.x, -child.z, base + float(c[2])])
    hn, _hd = _wall_normal(hmesh, probe)
    from trimesh.proximity import closest_point
    q = closest_point(hmesh, np.array([probe]))[0][0]
    child.yaw = (math.degrees(math.atan2(hn[0], hn[1])) + rel) % 360.0
    v = yaw_matrix(child.yaw) @ ck
    child.x = float(q[0] + ld * hn[0] - v[0])
    child.z = float(-(q[1] + ld * hn[1] - v[1]))
    child.y = base + float(off[2])
    # the mined pair stands its child touching the wall (`ld` is the centre's
    # clearance, ~0 for a bracket board): bisect along the host normal to the
    # spot where it touches (gap and penetration both under 2 cm)
    from . import measure
    x0, z0 = child.x, child.z

    def at(t):
        child.x, child.z = x0 + float(hn[0]) * t, z0 - float(hn[1]) * t
        c = measure.contact(cat, child, parent)
        pen = c.get("penetrationM")
        if pen is None:
            pen = 1.0 if c.get("intersecting") else 0.0      # crossing, depth unmeasured
        return float(pen), float(c.get("gapM") or 0.0)

    lo, hi = -0.5, 1.5
    for _ in range(14):
        mid = (lo + hi) / 2.0
        pen, gap = at(mid)
        if pen > 0.02:
            lo = mid
        elif gap > 0.008:
            hi = mid
        else:
            break
    child.settledBy = f"mount:{parent.uid}"
    prov = {"kind": "like", "like": like, "n": int(pair.get("n", 0)),
            **({"evidence": f"twin:{twin}"} if twin else {}),
            "offWallM": round(ld, 3), "heightM": round(float(off[2]), 3), "yawOffNormalDeg": round(rel, 1)}
    child.role = {**child.role, "mountedOn": parent.uid, "mountPair": prov}
    child.notes.append(f"wall mount on {parent.uid} like {like} (R97)"
                       + (f", twin {twin} (R98)" if twin else ""))
    return {"pair": prov}


def unmined_mount(cat, child: Piece, parent: Piece, approval: str) -> dict:
    """Stand a small child on its parent's top where it is placed (plan
    position and yaw kept): the parent's highest surface straight under the
    child's pivot, the child's base on it. Refused by `unmined_refusal`."""
    if cat is None:
        raise ValueError("an unmined mount needs the catalogue (the child's size, the parent's mesh)")
    why = unmined_refusal(cat, child.asset, child.scale, approval)
    if why:
        raise ValueError(f"unmined mount {child.uid} on {parent.uid}: {why}")
    row = cat.row(child.asset)
    size = [float(v) * child.scale for v in row["sizeM"]]
    side = max(size[0], size[1])
    if parent.y is None:
        raise ValueError(f"{parent.uid} has no height: settle it first")
    mesh = cat.mesh(parent.asset).copy().apply_transform(_t4(parent))
    top = float(mesh.bounds[1][2]) + 1.0
    locs, _r, _t = mesh.ray.intersects_location(np.array([[child.x, -child.z, top]]),
                                                np.array([[0.0, 0.0, -1.0]]),
                                                multiple_hits=False)
    if not len(locs):
        raise ValueError(f"unmined mount: {child.uid} at ({child.x:.2f}, {child.z:.2f}) is not "
                         f"over {parent.uid}: place it over the parent first")
    surface = float(locs[0][2])
    child.y = surface + float(row["originOffsetM"][2]) * child.scale
    child.settledBy = f"mount:{parent.uid}"
    prov = {"kind": "unmined", "unmined": approval, "longestPlanSideM": round(side, 3),
            "heightM": round(size[2], 3),
            "surfaceM": round(surface, 3), "yawDeg": (child.yaw - parent.yaw) % 360.0}
    child.role = {**child.role, "mountedOn": parent.uid, "mountPair": prov}
    child.notes.append(f"unmined mount on {parent.uid}: {approval}")
    return {"pair": prov}


HANG_AXIS_M = 0.05
"""A hanging child's attachment point: its highest vertex within this of its
pivot's vertical axis (R53, walk 4 lane WB)."""
HANG_MIN_H_M, HANG_MAX_H_M = 1.8, 4.0
"""`mount --hang` defaults: the branch hit this high over the ground under it."""
HANG_SEARCH_M = 3.0          # rings of upward rays out to this radius from the target
HANG_RING_M = 0.02           # ring spacing (and the ray spacing along a ring) out to 1 m,
HANG_RING_FAR_M = 0.1        # ... then this
HANG_NORMAL_Z = -0.2         # a branch underside: the hit face's normal z at most this
HANG_THICK_M = 0.6           # ... and its top (the ray's exit) at most this above it


HANG_HOOK_M = 0.15
"""A hanging child's hook: its mesh within this below its hang point wraps
the branch it hangs on and may cross it; the body below may not (walk 7:
Riverwalk's lantern hung on the eave with its body inside the wall)."""


class HostClearance:
    """Does a mounted child's BODY cross its host's mesh? The host's FCL
    mesh is built once; each pose is one exact triangle-crossing query. For a
    hanging child (`hook=True`) the hook (`HANG_HOOK_M` under the hang point)
    is cut off first: it is meant to wrap the branch."""

    def __init__(self, cat, child: Piece, parent: Piece, hook: bool):
        import trimesh
        from .measure import _fcl_mesh, _rigid4
        self._rigid4 = _rigid4
        self.manager = trimesh.collision.CollisionManager()
        self.manager.add_object("host", _fcl_mesh(cat, parent), transform=_rigid4(parent))
        m = cat.mesh(child.asset)
        if hook:
            cut = float(hang_point(cat, child.asset)[0][2]) - HANG_HOOK_M
            keep = np.all(np.asarray(m.vertices)[np.asarray(m.faces)][:, :, 2] < cut, axis=1)
            m = m.submesh([np.nonzero(keep)[0]], append=True) if keep.any() else None
        self.body = None if m is None else (
            m if float(child.scale or 1.0) == 1.0 else m.copy().apply_scale(float(child.scale)))

    def crosses(self, child: Piece) -> bool:
        if self.body is None or not len(self.body.faces):
            return False
        return bool(self.manager.in_collision_single(self.body, transform=self._rigid4(child)))


def hang_point(cat, asset: str) -> tuple[np.ndarray, str]:
    """(kit-frame point, how) a hanging child hangs by: its highest vertex
    within HANG_AXIS_M of its pivot axis (a lantern's hook, a flower strand's
    top); else the top centre of its bounds. No kit manifest carries a mined
    attachment node yet (walk 4 lane WB: `node` is the GLB node name)."""
    v = np.asarray(cat.mesh(asset).vertices)
    near = np.hypot(v[:, 0], v[:, 1]) <= HANG_AXIS_M
    if near.any():
        k = int(np.argmax(np.where(near, v[:, 2], -np.inf)))
        return v[k].copy(), "axis-top-vertex"
    lo, hi = cat.mesh(asset).bounds
    return np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2]]), "bounds-top"


def hang_mount(cat, scene, child: Piece, parent: Piece, approval: str | None,
               min_h: float = HANG_MIN_H_M, max_h: float = HANG_MAX_H_M,
               along_m: float | None = None, bearing_deg: float | None = None,
               search_m: float = HANG_SEARCH_M) -> dict:
    """R53 branch-hang: rays straight up from rings round a target plan point
    (the child where it stands, or ``along_m`` out from the parent's pivot on
    ``bearing_deg``) onto the parent's own mesh (trimesh, exact on the mesh
    the workbench measures). A ray counts when the first surface over the
    child is a branch: closed (a downward-facing underside, then the branch's
    top where the ray leaves it) or open (an upward top first, a one-sided
    mesh); the hook rests on that top, which must stand ``min_h`` .. ``max_h``
    over the padded ground under it; the nearest such seat to the
    target wins and the child's hang point (`hang_point`) is put on it. The
    mined Mud Mother lanterns on their Hist tree (kit-mounts-mined, 3 points)
    come back within 0.1 m (tests/test_walk4_wb.py).
    Hanging pieces are exempt from the unmined size caps; the render-round
    approval stands (0102 decision 5)."""
    from . import pads
    if cat is None:
        raise ValueError("mount --hang needs the catalogue")
    if parent.y is None:
        raise ValueError(f"{parent.uid} has no height: settle it first")
    why = unmined_refusal(cat, child.asset, child.scale, approval, hanging=True)
    if why:
        raise ValueError(f"hang {child.uid} on {parent.uid}: {why}")
    g = pads.ground_for(cat, scene, None)
    hp, how = hang_point(cat, child.asset)
    a = np.asarray(child.matrix()[0])
    d = a @ hp                                          # pivot -> hang point (wb frame)
    if along_m is not None or bearing_deg is not None:
        b = math.radians(float(bearing_deg if bearing_deg is not None else child.yaw))
        r = float(along_m if along_m is not None else 0.0)
        tx, tn = parent.x + r * math.sin(b), -parent.z + r * math.cos(b)
    else:
        tx, tn = child.x + float(d[0]), -child.z + float(d[1])
    mesh = cat.mesh(parent.asset).copy().apply_transform(_t4(parent))
    normals = np.asarray(mesh.face_normals)
    rays, crossed, best, clear = 0, 0, None, None
    pose0 = (child.x, child.y, child.z)
    rings = np.concatenate([np.arange(0.0, min(1.0, search_m) + 1e-9, HANG_RING_M),
                            np.arange(1.0 + HANG_RING_FAR_M, search_m + 1e-9, HANG_RING_FAR_M)])
    for ring in rings:
        step = HANG_RING_M if ring <= 1.0 else HANG_RING_FAR_M
        n = 1 if ring == 0 else max(6, int(2 * math.pi * ring / step))
        ang = np.linspace(0.0, 2 * math.pi, n, endpoint=False)
        xs, ns = tx + ring * np.sin(ang), tn + ring * np.cos(ang)
        grounds = np.array([float(g.chunk_height(float(x), float(-y))) for x, y in zip(xs, ns)])
        origins = np.column_stack([xs, ns, grounds + 0.05])
        rays += n
        locs, idx, tri = cast_rays(mesh, origins, [0.0, 0.0, 1.0], multiple_hits=True)
        per = {}
        for loc, i, t in zip(locs, idx, tri):
            per.setdefault(int(i), []).append((float(loc[2]), loc, t))
        cands = []
        for i, hits in per.items():
            hits.sort(key=lambda h: h[0])
            # the first surface over the child must be a branch: a closed one
            # (a downward underside, then its top where the ray leaves it,
            # within HANG_THICK_M) or an open one (an upward top first); the
            # hook rests on that top, nothing of the parent hangs below it
            z0, first, t = hits[0]
            nz0 = normals[t][2]
            if nz0 <= HANG_NORMAL_Z:
                top = hits[1] if len(hits) > 1 else None
                if top is None or normals[top[2]][2] < -HANG_NORMAL_Z or top[0] - z0 > HANG_THICK_M:
                    continue
                loc, under, kind = top[1], first, "closed"
            elif nz0 >= -HANG_NORMAL_Z:
                loc, under, kind = first, first, "open"
            else:
                continue                            # a vertical face: a trunk side
            over = float(loc[2]) - float(grounds[i])
            if not (min_h <= over <= max_h):
                continue
            off = math.hypot(float(loc[0]) - tx, float(loc[1]) - tn)
            cands.append((off, i, loc, over, kind, round(float(loc[2]) - float(under[2]), 3)))
        # the nearest seat whose body clears the host (a hook on an eave
        # beside the wall must not put the lantern inside the wall)
        for off, _i, loc, over, kind, thick in sorted(cands, key=lambda c: (c[0], c[1])):
            child.x, child.z, child.y = (float(loc[0]) - float(d[0]), -(float(loc[1]) - float(d[1])),
                                         float(loc[2]) - float(d[2]))
            if clear is None:
                clear = HostClearance(cat, child, parent, hook=True)
            if clear.crosses(child):
                crossed += 1
                continue
            best = (off, loc, over, kind, thick)
            break
        if best is not None:
            break
    else:
        child.x, child.y, child.z = pose0
        raise ValueError(f"hang {child.uid}: no downward-facing surface of {parent.uid} "
                         f"{min_h}-{max_h} m over the ground within {search_m} m of "
                         f"({tx:.2f}, {-tn:.2f}) leaves its body clear of {parent.uid} "
                         f"({rays} rays, {crossed} seats refused: body inside the host)")
    off, hit, over, kind, thick = best
    child.x = float(hit[0]) - float(d[0])
    child.z = -(float(hit[1]) - float(d[1]))
    child.y = float(hit[2]) - float(d[2])
    child.settledBy = f"mount:{parent.uid}"
    prov = {"kind": "unmined", "unmined": approval, "on": "branch", "hangPoint": how,
            "hitM": [round(float(hit[0]), 3), round(-float(hit[1]), 3), round(float(hit[2]), 3)],
            "hitOverGroundM": round(over, 3), "branch": kind, "branchThicknessM": thick,
            "offTargetM": round(off, 3), "rays": rays,
            "yawDeg": (child.yaw - parent.yaw) % 360.0}
    child.role = {**child.role, "mountedOn": parent.uid, "mountPair": prov}
    child.notes.append(f"hung on {parent.uid} at {over:.2f} m over the ground: {approval}")
    return {"pair": prov}


def mount(child: Piece, parent: Piece, along_m: float | None = None, point: int = 0,
          unmined: str | None = None, cat=None, wall: bool = False) -> dict:
    """Seat a wall / hanging child on its parent by the mined mount pair:
    a band at its recorded out/up offset (anywhere along its axis between
    the mined extremes; `along_m` picks where), or one of the mined points.
    With no mined pair, `unmined` ('reader-approved rN') stands a small
    child (plan side < 0.6 m, height < 1.0 m) on the parent's top (0102
    decision 5 as amended)."""
    pairs = mount_pairs(child.asset, parent.asset)
    if not pairs and unmined is not None:
        return (unmined_wall_mount if wall else unmined_mount)(cat, child, parent, unmined)
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
    # the child's own scale over its parent's, as the plugin placed it (an
    # effect scaled into its host, CLAYWATER2 ruling 2); a pair without it
    # keeps the child's scale as authored
    if pair.get("childScaleInParent") is not None:
        child.scale = parent.scale * float(pair["childScaleInParent"])
    child.settledBy = f"mount:{parent.uid}"
    child.role = {**child.role, "mountedOn": parent.uid, "mountPair": {
        "kind": pair["kind"], "n": pair.get("n"), "offsetM": offset, "yawDeg": yaw}}
    return {"pair": {k: pair.get(k) for k in ("kind", "n", "offsetM", "yawDeg", "alongAxis",
                                              "alongMinM", "alongMaxM", "evidence",
                                              "childScaleInParent")}}


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
