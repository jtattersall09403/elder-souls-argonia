#!/usr/bin/env python3
"""The placement workbench CLI. One command per call; the scene file is the
whole state. Prints JSON on stdout and a timing line on stderr.

    wb.py SCENE window --centre-km E S --half 150
    wb.py SCENE place UID ASSET --at X Z [--km] [--yaw D] [--settle]
                     [--pad [apronM=M] [datumM=M] [floorMinM=M]]   (a building pad, 0101)
                     [--beached] [--walkable]      (R5 craft; a walkable deck, 0102)
    wb.py SCENE move UID [--dx M] [--dz M] [--forward M] [--right M] [--dy M]
                         [--yaw D | --turn D] [--resettle]
    wb.py SCENE settle UID [--source chunks|survey]
    wb.py SCENE snap CHILD CHILD_FACE PARENT PARENT_FACE [--by geometry|evidence]
                     [--lateral M] [--keep-yaw] [--pick N]
    wb.py SCENE mount CHILD PARENT [--along M] [--point N] [--unmined "reader-approved rN"]
    wb.py SCENE measure A B
    wb.py SCENE ground UID | --at X Z
    wb.py SCENE doors
    wb.py SCENE check
    wb.py SCENE path add ID --points X Z X Z ... [--width M] [--kind road]
    wb.py SCENE path remove ID
    wb.py SCENE bind UID parcel|run|landmark ID [--index N]
    wb.py SCENE render VIEW [--focus UID ...] [--res PX] [--span M] [--bearing D]
                            [--cut M] [--highlight UID ...] [--out PNG]
    wb.py SCENE export BLUEPRINT [--write]
    wb.py SCENE list | remove UID | note UID TEXT
    wb.py SCENE map [--half M] [--heights] (ASCII slope / water map, or ground heights)
    wb.py SCENE site ASSET [--yaw D] [--step M] [--centre X Z] [--half M]
                                          (every pose that passes the fit's slope rule)
    wb.py SCENE compile [BLUEPRINT]       (the real derive passes + compile on the scene's
                                          poses, in a temporary copy; errors by piece)
    wb.py SCENE render --shots auto|LIST  (one Blender launch: top, a front per building,
                                          two isos; output/renders/<scene>/round-N/)
    wb.py apply LAYOUT.json [--scene NAME] [--no-compile] [--allow-stale-ground]
                                          (a fresh scene from the layout's window, every op
                                          in one process, then check + compile; one summary
                                          in output/apply/<placeId>.json)
    wb.py replay --scene NAME --out LAYOUT.json   (a scene's command log as a layout)
    wb.py - walktable PLACE_ID            (owner-walk table from the published bundle)
    wb.py - describe ASSET [--refresh]
    wb.py - evidence PARENT_ASSET CHILD_ASSET

Coordinates are province metres, x east / z south (the studio's km x 1000);
`--km` takes km. Faces: east, west, north, south (= +x, -x, +y, -y) in the
piece's own frame at yaw 0 (the abuts record names them +x..-y); `any` = either.
"""
from __future__ import annotations

import argparse
import json
from functools import lru_cache
import math
import os
import shlex
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from workbench import measure, snap  # noqa: E402
from workbench.kits import Catalogue, fit_of  # noqa: E402
from workbench.scene import Piece, Scene, yaw_matrix  # noqa: E402

import numpy as np  # noqa: E402


def place_catalogue(place_id: str) -> Catalogue:
    """The catalogue with the place's own culture kits tried first when an
    asset id sits in several kits (`compile_settlement.place_kit_preference`,
    the order the compile resolves the same ids in); one definition, in
    `workbench.export`, shared with the walkRoutes export."""
    from workbench import export
    return export.place_catalogue(place_id)


def _emit(obj) -> None:
    print(json.dumps(obj, indent=1, default=lambda o: round(float(o), 4)))


def _settle(cat, scene, piece: Piece, source: str = "chunks", declared_pads: dict | None = None) -> dict:
    """Seat the piece as the runtime does. A quay run is first slid along its
    own axis to the bank exactly as the compile slides it
    (`compile_settlement.anchor_quay_run`: the landward tip where the deck
    plane meets the ground), so the pose the workbench exports is the pose
    the compile places, not one it moves. ``declared_pads`` is the scene's
    already-resolved pads (`pads.scene_pads`) for a caller settling several
    pieces in one call (e.g. `cmd_group`): passing it once avoids re-resolving
    every pad in the scene for every piece it settles (N x P otherwise).
    Omit it for a single-piece settle — it is resolved fresh in that case, so
    a pad added since is always read live (0101)."""
    from workbench import pads
    shift = _quay_anchor(cat, piece)
    if shift is not None:
        piece.x, piece.z = shift["x"], shift["z"]
    # a piece that declares a pad is seated on the patched ground (0101)
    ground = pads.ground_for(cat, scene, piece, declared_pads)
    # a dressing prop takes the seat propSeatRule judges it on (one helper)
    seat = measure.prop_seat if measure.is_prop(cat, piece) else measure.seat
    got = seat(cat, ground, piece, source)
    piece.y = got["y"]
    piece.settledBy = f"settle:{got['mode']}:{source}"
    if shift is not None:
        got["quayShiftM"] = shift["shiftM"]
    return got


def reseat_after_pads(cat, scene) -> list[dict]:
    """Planner ruling 1 (16k fix 2 round 5): every pad the runtime applies,
    building AND run, exists only once the whole layout is laid (a run's pad
    is measured from its posed members), so a piece settled before a run was
    laid sits on ground the runtime never shows. Once every op has run, each
    ground-settled piece that owns no pad (props, dressing, yard-set members;
    round 6: buildings, runs and retaining walls keep their pad seat) is settled again on the
    final padded ground, and every piece hung on a moved piece (mount,
    template, snap) follows its parent by the same rise. Returns the moves."""
    from workbench import pads
    resolved = pads.scene_pads(cat, scene)
    moved: dict[str, float] = {}
    out = []
    for p in scene.pieces:
        by = p.settledBy or ""
        # planner ruling 1 (round 6): only a piece that owns no pad is re-seated;
        # a building, a run member or a retaining wall keeps its pad seat
        if (not by.startswith("settle:") or p.pad is not None
                or (p.role or {}).get("kind") == "run"):
            continue
        before = p.y
        _settle(cat, scene, p, by.rsplit(":", 1)[-1], declared_pads=resolved)
        dy = float(p.y - before) if before is not None else 0.0
        if abs(dy) > 1e-6:
            moved[p.uid] = dy
            out.append({"uid": p.uid, "dyM": round(dy, 4), "by": "settle"})
    from workbench.scene import hung_on
    parent_of = {p.uid: hung_on(p) for p in scene.pieces if hung_on(p)}
    changed = True
    while changed:                      # a chain of hung pieces follows in order
        changed = False
        for p in scene.pieces:
            parent = parent_of.get(p.uid)
            if parent in moved and p.uid not in moved and p.y is not None:
                p.y += moved[parent]
                moved[p.uid] = moved[parent]
                out.append({"uid": p.uid, "dyM": round(moved[parent], 4), "by": f"follows:{parent}"})
                changed = True
    return out


def _quay_anchor(cat, piece: Piece) -> dict | None:
    """The compile's slide for a quay run at this pose ({x, z, shiftM}), or
    None for any other piece. Raises when the compile would find no bank."""
    from workbench import paths as wbpaths
    wbpaths.bridge()
    from worldgen import compile_settlement as cs
    row = cat.row(piece.asset)
    if not cs.is_quay_run(row):
        return None
    from worldgen.site_fields import shared_survey
    got = cs.anchor_quay_run(row, (piece.x, piece.z), piece.yaw, piece.scale, shared_survey())
    if got is None:
        raise ValueError(f"{piece.uid}: the compile finds no bank (deck plane meets ground) "
                         f"within {cs.QUAY_SHORE_SEARCH_M:.0f} m of its landward end")
    return {"x": got[0], "z": got[1], "shiftM": got[2]}


def cmd_window(a, scene, cat):
    from workbench import ground, paths
    cx, cz = a.centre_km[0] * 1000, a.centre_km[1] * 1000
    stem = paths.OUTPUT / "ground" / f"{Path(scene.path).stem}-{int(cx)}-{int(cz)}-{int(a.half)}"
    meta = ground.extract((cx, cz), a.half, stem)
    scene.groundStem = str(stem)
    if a.place_id:
        scene.placeId = a.place_id
    return {"groundStem": str(stem), "chunks": [c["key"] for c in meta["chunks"]],
            "centreM": meta["centreM"], "halfM": meta["halfM"]}


def cmd_place(a, scene, cat):
    from workbench import pads
    x, z = (a.at[0] * 1000, a.at[1] * 1000) if a.km else a.at
    if cat.row(a.asset).get("placeUse") == "ruin-only" and not getattr(a, "ruin", False):
        raise ValueError(f"{a.asset} is ruin-only (its placement-policies assetPlacement "
                         f"row): place it in a ruin with --ruin, or its living form")
    if cat.row(a.asset).get("placeUse") == "hanging-only" and a.settle:
        raise ValueError(f"{a.asset} is hanging-only (its placement-policies assetPlacement "
                         f"row): place it and `mount` it on its mined parent, never settle "
                         f"it on the ground")
    scale = cat.placed_scale(a.asset) if a.scale is None else a.scale
    p = scene.add(Piece(uid=a.uid, asset=a.asset, x=x, z=z, yaw=a.yaw % 360.0, y=a.y,
                        scale=scale, pad=pads.parse(a.pad), beached=a.beached,
                        walkable=a.walkable))
    out = {"placed": a.uid}
    if a.settle or (p.pad is not None and a.y is None):
        # a building on a pad is always settled on it (16k walk 4, WB rec 2):
        # the Claywater stable's op carried a pad and no `settle`, so it had
        # no height, every rule skipped it and the compile seated it 2.57 m
        # under its pad datum
        out["settle"] = _settle(cat, scene, p)
    return out


def cmd_move(a, scene, cat):
    p = scene.piece(a.uid)
    d = yaw_matrix(p.yaw) @ np.array([a.right, a.forward, 0.0])
    p.x += a.dx + float(d[0])
    p.z += a.dz - float(d[1])
    if a.yaw is not None:
        p.yaw = a.yaw % 360.0
    p.yaw = (p.yaw + a.turn) % 360.0
    if a.pitch is not None:
        p.pitch = a.pitch
    if a.roll is not None:
        p.roll = a.roll
    if a.dy and p.y is not None:
        p.y += a.dy
    out = {"uid": p.uid, "x": p.x, "z": p.z, "yaw": p.yaw, "y": p.y}
    if a.resettle:
        out["settle"] = _settle(cat, scene, p)
    return out


def cmd_settle(a, scene, cat):
    return _settle(cat, scene, scene.piece(a.uid), a.source)


def cmd_snap(a, scene, cat):
    child, parent = scene.piece(a.child), scene.piece(a.parent)
    cf, pf = snap.face(a.child_face), snap.face(a.parent_face)
    if a.by == "evidence":
        got = snap.snap_evidence(child, parent, cf, pf, a.pick, a.allow_terminal)
    else:
        if cf is None or pf is None:
            raise ValueError("a geometric snap needs both faces")
        got = snap.snap_geometry(cat, child, parent, cf, pf, a.lateral, a.keep_yaw)
    if a.settle:
        # the runtime seats every ground piece of a run on its OWN outline
        got["settle"] = _settle(cat, scene, child)
    got["pose"] = {"x": child.x, "z": child.z, "yaw": child.yaw, "y": child.y}
    if child.y is not None and parent.y is not None:
        got["contact"] = measure.contact(cat, child, parent)
    return got


def cmd_attach(a, scene, cat):
    child, parent = scene.piece(a.child), scene.piece(a.parent)
    got = snap.attach(child, parent, a.template, a.pick)
    got["pose"] = {"x": child.x, "z": child.z, "yaw": child.yaw, "y": child.y,
                   "scale": child.scale}
    if child.y is not None:
        got["contact"] = measure.contact(cat, child, parent)
    return got


def cmd_mirror(a, scene, cat):
    p = scene.piece(a.uid)
    p.mirror = not p.mirror
    return {"uid": p.uid, "mirror": p.mirror,
            "note": "the runtime cannot draw a mirrored piece: export refuses it"}


def cmd_swap(a, scene, cat):
    from workbench import assembly
    got = assembly.swap(cat, scene.piece(a.uid), a.asset, a.keep)
    if a.resettle:
        got["settle"] = _settle(cat, scene, scene.piece(a.uid))
    return got


def cmd_group(a, scene, cat):
    from workbench import assembly
    if a.action == "list":
        return assembly.group_names()
    if a.action == "save":
        return assembly.save_group(scene, a.name, a.uids, a.anchor or a.uids[0])
    from workbench import pads
    made = assembly.place_group(scene, a.name, tuple(a.at), a.yaw, a.prefix, a.parcel)
    group = assembly.load_group(a.name)
    anchor = scene.piece(a.prefix + group["anchor"]["uid"])
    # one pad snapshot for the whole group settle (positions are fixed by
    # place_group before any of this runs; only y moves below, and pad
    # resolution never reads y) instead of re-resolving every scene pad once
    # per ground member.
    declared = pads.scene_pads(cat, scene)
    _settle(cat, scene, anchor, declared_pads=declared)
    for p in made:
        if p is not anchor and (p.role or {}).get("on") == "ground":
            _settle(cat, scene, p, declared_pads=declared)
    assembly.lift_group(scene, a.name, a.prefix)     # mounts stand on settled members
    return {"placed": [p.uid for p in made], "anchor": anchor.uid}


def cmd_openings(a, scene, cat):
    from workbench import assembly
    return assembly.openings(cat, scene, a.uid, a.clear)


def cmd_signature(a, scene, cat):
    from workbench import assembly
    return assembly.signature(scene)


def cmd_probe(a, scene, cat):
    """A pose tried without adding it: the runtime seat, the ground under
    its footprint, the compile's slope rule for its fit."""
    from workbench import paths
    paths.bridge()
    from worldgen import compile_settlement as cs
    from workbench import pads
    g = pads.ground_for(cat, scene, None)      # the patched ground check reads (0101)
    p = Piece("probe", a.asset, a.at[0], a.at[1], a.yaw % 360.0)
    seat = measure.seat(cat, g, p)
    p.y = seat["y"]
    out = {"seat": seat}
    if seat["mode"] != "water":
        out["ground"] = measure.ground_report(cat, g, p)
    out["rules"] = _fit_rules(cat, g, p, cs)
    return out


def _authored_fit(scene, p: Piece) -> str | None:
    """The `groundFit` the blueprint authors on the parcel this piece is
    bound to (an override the compile keeps as written), else None."""
    if (p.role or {}).get("kind") != "parcel" or not scene.placeId:
        return None
    from workbench import paths as wbpaths
    path = wbpaths.BLUEPRINTS / f"{scene.placeId}.json"
    if not path.exists():
        return None
    parcels = json.loads(path.read_text())["blueprint"].get("parcels", [])
    return next((q.get("groundFit") for q in parcels if q.get("id") == p.role["id"]), None)


def _fit_rules(cat, g, p, cs, authored_fit: str | None = None) -> dict:
    """The compile's own per-parcel ground rules on this pose
    (`compile_settlement.compile_blueprint`): the 97 B3 slope limit of the
    asset's fit over every touched survey cell (water pieces too: the compile
    judges a hull's seabed like any parcel's ground), and the ground delta
    over the outline's vertices and centre on the survey against the
    parcel's `groundFit` (`authored_fit`, the blueprint's override, else the
    manifest policy's, `with_record_ground_fits`), plus the yard gate's sill.
    `ok` is False exactly when the compile or the gate would refuse the pose."""
    row = cat.row(p.asset)
    slope = measure.footing_slope_deg(g, p, measure.footprint_province(cat, p))
    slope_why = cs.fit_slope_failure({**row}, slope)
    out = {"maxSlopeDeg": round(slope, 2), "slopeRule": slope_why,
           **measure.ground_delta(cat, g, p, cs, authored_fit)}
    out.update(_sill(cat, g, p, row, cs))
    out["ok"] = slope_why is None and out["deltaRule"] is None and out.get("sillRule") is None
    return out


def judge_fit(cat, scene, p, cs, declared: dict | None = None) -> dict:
    """`_fit_rules` on the ground the piece stands on in its scene
    (`pads.fit_ground`: an assembly member on its parcel's pad reads the
    pad), with the blueprint's authored fit: `check` and `scan.verify`."""
    from workbench import pads
    return _fit_rules(cat, pads.fit_ground(cat, scene, p, declared), p, cs,
                      _authored_fit(scene, p))


BEACHED_FLOAT_MAX_M = 0.3     # R5 (planner 2026-09-26): the keel or base rests on the bank
BEACHED_SLOPE_MAX_DEG = 20.0
BEACHED_WATER_REACH_M = 1.5   # ... and stands within this of the water line


def _beached(cat, g, p) -> dict:
    """R5 (planner ruling 2026-09-26): a hull or cleat placed `beached` is
    judged on its base contact with the bank (foot float <= 0.3 m), the
    bank's slope under it (<= 20 deg) and its reach to the water line (a wet
    depth cell within 1.5 m of its outline), in place of 97 B3, the fit
    delta and the sill."""
    from shapely.geometry import Polygon
    poly = measure.footprint_province(cat, p)
    slope = g.footprint_max_slope_deg(poly)
    fl = measure.float_under(cat, g, p)["footFloatMaxM"] if p.y is not None else None
    ring = Polygon(poly).buffer(BEACHED_WATER_REACH_M).exterior
    n = max(8, int(ring.length / 0.5))
    reach = any(g.depth(pt.x, pt.y) > 0.0
                for pt in (ring.interpolate(i / n, normalized=True) for i in range(n)))
    why = []
    if fl is None:
        why.append("it is not seated (no y): place it with --settle")
    elif fl > BEACHED_FLOAT_MAX_M:
        why.append(f"its base stands {fl:.2f} m off the bank (> {BEACHED_FLOAT_MAX_M})")
    if slope > BEACHED_SLOPE_MAX_DEG:
        why.append(f"the bank under it is {slope:.1f} deg (> {BEACHED_SLOPE_MAX_DEG})")
    if not reach:
        why.append(f"no water within {BEACHED_WATER_REACH_M} m of its outline")
    return {"beached": True, "maxSlopeDeg": round(slope, 2), "footFloatMaxM": fl,
            "waterWithinReach": reach,
            "beachedRule": ("beached: " + "; ".join(why)) if why else None,
            "ok": not why}


def _sill(cat, g, p, row, cs) -> dict:
    """The yard gate's sill (`worldgen.test_proving_ground.ground_audit`) on
    this pose: how far the designed ground line (the mean of the anchor's
    survey samples, the lowest for `dug-in`) stands from the ground at the
    pivot, where the doorway meets the ground. Stilt, water and deck pieces
    A stilt fit is judged on its support line: the mean depth of the water
    that covers its samples (the gate's `support_at`); water pieces are not
    judged."""
    from workbench import paths as wbpaths
    wbpaths.bridge()
    from worldgen import test_proving_ground as tpg
    klass = row.get("anchorClass") or "ground"
    fit = cs.asset_fit(row)
    if klass not in ("ground", "deck"):
        return {}
    mode = (row.get("placement") or {}).get("anchorMode", "streamed-perimeter")
    samples = (measure.footprint_province(cat, p) if mode == "streamed-perimeter"
               else [(p.x, p.z)])
    retained = (None if p.y is None else
                cs.retaining_sill(row, g.survey_height, getattr(g, "pad_index", None),
                                  samples, (p.x, p.z),
                                  p.y + (float(row["sizeM"][2]) - float(row["originOffsetM"][2])) * p.scale))
    if retained is not None:
        sill = retained              # a retaining wall meets its pad (0101 rule 4)
    elif fit == "stilt":
        sill = sum(max(0.0, g.depth(x, z)) for x, z in samples) / len(samples)
    else:
        heights = [g.survey_height(x, z) for x, z in samples]
        line = min(heights) if fit == "dug-in" else sum(heights) / len(heights)
        sill = abs(line - g.survey_height(p.x, p.z))
    return {"sillM": round(sill, 3), "sillMaxM": tpg.SILL_LIMIT_M,
            "sillRule": None if sill <= tpg.SILL_LIMIT_M else
            f"the ground line stands {sill:.2f} m off the ground at the pivot "
            f"(the yard gate allows {tpg.SILL_LIMIT_M} m)"}


def designer_yaw(child, parent, world_yaw: float) -> None:
    """16k r8 rule 1: a pair recorded ``yawBy: designer`` (a road board on its
    post) gives height and face only; the child turns about the parent's axis
    to the designer's world yaw (the road's bearing), its offset turning with it."""
    pair = next((p for p in snap.mount_pairs(child.asset, parent.asset)
                 if p.get("yawBy") == "designer"), None)
    if pair is None:
        raise ValueError(f"--yaw: no mined pair of {child.asset} on {parent.asset} leaves the "
                         "yaw to the designer (yawBy: designer); the mined yaw stands")
    role = child.role["mountPair"]
    rel = (world_yaw - parent.yaw) % 360.0
    # the offset turns with the child about the parent's vertical axis
    off = [float(v) for v in yaw_matrix(rel - float(role["yawDeg"])) @ np.array(role["offsetM"])]
    d = yaw_matrix(parent.yaw) @ np.array(off) * parent.scale
    child.x, child.z = parent.x + float(d[0]), parent.z - float(d[1])
    child.yaw = world_yaw % 360.0
    child.role = {**child.role, "mountPair": {**role, "offsetM": [round(v, 4) for v in off],
                                              "yawDeg": round(rel, 3), "yawBy": "designer"}}


def _at_height(cat, scene, child, height: float) -> None:
    """Lift or lower ``child`` so its centre stands ``height`` over the padded
    ground under it (mount --height, walk 2 round 4)."""
    from workbench import pads, rules
    g = pads.ground_for(cat, scene, None)
    mesh = rules._world_mesh(cat, child)
    cx, cy, cz = (mesh.bounds[0] + mesh.bounds[1]) / 2.0     # (x, -z, up)
    child.y += float(height) - (float(cz) - float(g.chunk_height(float(cx), float(-cy))))


def cmd_mount(a, scene, cat):
    child, parent = scene.piece(a.child), scene.piece(a.parent)
    if getattr(a, "hang", False):
        # R53: hang from the parent's own mesh (a branch underside) by the
        # child's hang point; --along/--bearing pick the spot from the trunk
        got = snap.hang_mount(cat, scene, child, parent, getattr(a, "unmined", None),
                              min_h=a.min_h, max_h=a.max_h, along_m=a.along,
                              bearing_deg=getattr(a, "bearing", None))
        got["pose"] = {"x": child.x, "z": child.z, "yaw": child.yaw, "y": child.y}
        got["contact"] = measure.contact(cat, child, parent)
        return got
    wall = bool(getattr(a, "wall", False))
    if wall and snap.mount_pairs(child.asset, parent.asset):
        raise ValueError(f"mount --wall is for an unmined child: a mined pair hangs "
                         f"{child.asset} on {parent.asset}; mount it by the pair")
    if wall and getattr(a, "height", None) is not None:
        if child.y is None:
            raise ValueError(f"{child.uid}: settle it before a wall mount at a height")
        _at_height(cat, scene, child, a.height)            # the height first, then onto the wall
    got = snap.mount(child, parent, a.along, a.point, unmined=getattr(a, "unmined", None), cat=cat,
                     wall=bool(getattr(a, "wall", False)))
    if getattr(a, "yaw", None) is not None:
        designer_yaw(child, parent, a.yaw)
        got["pair"]["yawBy"] = "designer"
    if getattr(a, "height", None) is not None and child.y is not None:
        if not wall:
            _at_height(cat, scene, child, a.height)
        got["pair"] = {**got["pair"], "heightBy": "designer", "centreOverGroundM": float(a.height)}
        child.role = {**child.role, "mountPair": {**(child.role.get("mountPair") or {}),
                                                   "heightBy": "designer",
                                                   "centreOverGroundM": float(a.height)}}
    got["pose"] = {"x": child.x, "z": child.z, "yaw": child.yaw, "y": child.y}
    if child.y is not None:
        got["contact"] = measure.contact(cat, child, parent)
    return got


def cmd_measure(a, scene, cat):
    return measure.contact(cat, scene.piece(a.a), scene.piece(a.b))


def cmd_ground(a, scene, cat):
    from workbench import pads
    g = pads.ground_for(cat, scene, None)      # the patched ground check reads (0101)
    if a.at:
        x, z = a.at
        return {"chunks": g.chunk_height(x, z), "survey": g.survey_height(x, z),
                "wet": g.wet(x, z), "waterLevelM": g.water_level(x, z)}
    return measure.ground_report(cat, g, scene.piece(a.uid))


def cmd_doors(a, scene, cat):
    reports = {p.uid: measure.door_report(cat, scene, p) for p in scene.pieces}
    return {uid: r for uid, r in reports.items() if r}


def _check_row(cat, scene, p, declared, cs) -> dict:
    """One piece's `check` row: seat vs its y, foot float, slope vs its fit's
    limit, quay reach or hull water, the pad fit (0101)."""
    from workbench import pads, rules
    # every piece is judged on the ground the scene's pads patch (0101)
    g = pads.ground_for(cat, scene, p, declared)
    row = cat.row(p.asset)
    r = {"asset": p.asset.rsplit("/", 1)[-1], "fit": fit_of(row),
         "anchorClass": row.get("anchorClass"), "settledBy": p.settledBy,
         "piled": bool(row.get("piled"))}
    mounted = ((p.settledBy or "").startswith(("mount:", "template:"))
               or (p.role or {}).get("on") == "parent")
    if not mounted:
        seat = measure.seat(cat, g, p)
        r["runtimeY"] = round(seat["y"], 3)
        r["yOffRuntimeM"] = None if p.y is None else round(p.y - seat["y"], 3)
        if p.beached:
            r.update(_beached(cat, g, p))
            if p.y is not None:
                r["beachedProfile"] = rules.beached_profile(cat, g, p)
        elif p.role.get("kind") != "run":
            # a run is judged by the compile on its union (`compile` command)
            r.update(judge_fit(cat, scene, p, cs, declared))
        if seat["mode"] != "water":
            poly = measure.footprint_province(cat, p)
            if p.role.get("kind") == "run":
                slope = g.footprint_max_slope_deg(poly)
                r["maxSlopeDeg"] = round(slope, 2)
                r["slopeRule"] = cs.fit_slope_failure({**row}, slope)
                r.update(_sill(cat, g, p, row, cs))
            r["deltaM"] = round(seat["deltaM"], 3)
            r["wetVertices"] = sum(g.wet(x, z) for x, z in poly)
            if not p.beached and not row.get("piled") and (row.get("anchorClass") or "ground") != "water":
                r.update(_submerged(g, p, row))
    if p.y is not None and not mounted and (row.get("anchorClass") or "ground") != "water":
        r.update(measure.float_under(cat, g, p))
    if cs.is_quay_run(row):
        r["quayReach"] = _quay_reach(cat, scene, g, p, row, cs)
    elif (row.get("anchorClass") or "ground") == "water" and not row.get("piled"):
        # a piled deck is no hull: its piles stand in the bed (lessons L65)
        r["hullWater"] = _hull_water(cat, g, p)
    if p.roll or p.mirror:
        r["notExportable"] = "roll / mirror: the runtime has neither"
    if p.uid in declared:
        r["pad"] = pads.pad_fit(cat, scene, p, declared[p.uid])
        r["padRule"] = r["pad"].pop("padRule")
        r["ok"] = r.get("ok", True) and r["padRule"] is None
    return r


#: a ground piece whose origin stands in more than this depth of the fine
#: water raster (the runtime's water surface over the ground) is in the water.
#: The analysis grid's `wet` cells are 5.48 m and read a sub-cell pond as
#: dry (Claywater walk 5: the well stood in 1.08 m of the tarn, wetVertices 0).
SUBMERGED_DEPTH_M = 0.15


def _submerged(g, p, row) -> dict:
    """submergedRule: the fine water depth and level at the piece's origin
    and how far its top stands over the water; fails a ground piece standing
    in more than SUBMERGED_DEPTH_M of water."""
    depth, level = float(g.depth(p.x, p.z)), g.water_level(p.x, p.z)
    out = {"waterDepthM": round(depth, 3)}
    if level is None or depth <= SUBMERGED_DEPTH_M:
        return out
    top = None if p.y is None else p.y + (float(row["sizeM"][2]) - float(row["originOffsetM"][2])) * p.scale
    out["topOverWaterM"] = None if top is None else round(top - level, 3)
    out["submergedRule"] = (f"stands in {depth:.2f} m of water (level {level:.2f} m)"
                            + ("" if top is None else f", top {top - level:+.2f} m over it")
                            + f" (> {SUBMERGED_DEPTH_M} m for a ground piece)")
    return out


def _check_rows(cat, scene, uids: list) -> list[tuple[str, dict]]:
    from workbench import pads, paths
    paths.bridge()
    from worldgen import compile_settlement as cs
    declared = pads.scene_pads(cat, scene)
    return [(u, _check_row(cat, scene, scene.piece(u), declared, cs)) for u in uids]


def _near_pairs(cat, scene) -> list[tuple[str, str]]:
    """Every pair whose world bounds come within 0.5 m, in scene order."""
    boxes = {}
    for p in scene.pieces:
        if p.y is None:
            continue
        m = cat.mesh(p.asset)
        c = np.array([[x, y, z] for x in m.bounds[:, 0] for y in m.bounds[:, 1]
                      for z in m.bounds[:, 2]])
        w = p.world_points(c)
        boxes[p.uid] = (w.min(axis=0), w.max(axis=0))
    uids, out = list(boxes), []
    for i, u in enumerate(uids):
        for v in uids[i + 1:]:
            (l1, h1), (l2, h2) = boxes[u], boxes[v]
            if np.all(l1 <= h2 + 0.5) and np.all(l2 <= h1 + 0.5):
                out.append((u, v))
    return out


def _check_pairs(cat, scene, pairs: list) -> list[dict]:
    out = []
    for u, v in pairs:
        a_, b_ = scene.piece(u), scene.piece(v)
        got = measure.contact(cat, a_, b_)
        got.update(_pair_verdict(a_, b_, got, cat))
        out.append(got)
    return out


def _pair_key(cat, gkey: str, a: Piece, b: Piece) -> str:
    from workbench import opcache
    return opcache._sha([gkey, opcache.state(a), opcache.state(b),
                         opcache.asset_key(cat, a.asset), opcache.asset_key(cat, b.asset)])


def _rule_task(cat, scene, key: str):
    """One scene-level (graph) `check` rule (0102 decision 2, 16k walk 2)."""
    from workbench import rules
    if key == "doors":
        return cmd_doors(None, scene, cat)
    from workbench import seat_rules
    fn = {"walk": rules.walk, "pathReach": rules.path_reach,
          "berthReach": rules.berth_reach, "landing": seat_rules.landing}[key]
    return fn(cat, scene)


def _piece_rule_task(cat, scene, key: str, uids: list):
    """A per-piece `check` rule over a run of its targets (`rules.piece_part`)."""
    from workbench import paths, rules
    fit_for = None
    if key == "floorEdge":
        paths.bridge()
        from worldgen import compile_settlement as cs
        fit_for = lambda p: _authored_fit(scene, p) or cs.record_ground_fit(cat.row(p.asset))  # noqa: E731
    return rules.piece_part(key, cat, scene, uids, fit_for)


# the rules, in the order `check` writes them (after doors); the graph rules
# judge the scene whole, the per-piece ones (`rules.PIECE_RULES`) run split
# by piece across the pool and scoped by `--only`
CHECK_RULES = ("walk", "floorEdge", "pathReach", "propSeat", "roadSurface", "sill", "sign",
               "berthReach", "collider", "burial", "hanging", "fixtureSeat", "archway", "rockSeat",
               "padClear", "landing")
GRAPH_RULES = ("walk", "pathReach", "berthReach", "landing")


def cmd_check(a, scene, cat):
    """Every piece: seat vs its y, foot float, slope vs its fit's limit;
    every pair whose bounds come within 0.5 m: contact; every door: path;
    the walk-packet rules. Rows, pairs and rules run across the fork pool
    (`workbench.parallel`), the per-piece rules split by piece; a near pair
    whose two pieces are unchanged since the last check of this scene is
    restored from the scene's pair cache (`workbench.opcache`). `--only
    UID,..` judges those pieces only: their rows, their near pairs
    (re-measured even on a cache hit) and the per-piece rules over them;
    the graph rules (walk, pathReach, berthReach) and doors still judge the
    whole scene. `--serial` runs in-process; `--full` ignores the cache.
    The result is the serial loop's, key for key."""
    return check_scene(cat, scene, only=getattr(a, "only", None),
                       serial=bool(getattr(a, "serial", False)),
                       use_cache=not getattr(a, "full", False))


def check_scene(cat, scene, only=None, serial: bool = False, use_cache: bool = True,
                stats: dict | None = None) -> dict:
    from workbench import opcache, parallel, paths, rules
    paths.bridge()
    from worldgen import compile_settlement as cs  # noqa: F401 - warm before the fork
    from workbench import pads
    t0 = time.time()
    pads.scene_pads(cat, scene)                     # resolve once, before the fork
    for p in scene.pieces:
        pads.ground_for(cat, scene, p)
        break
    rules.warm()                                    # read-only records, before the fork
    only = set(only.split(",") if isinstance(only, str) else (only or []))
    missing = sorted(only - {p.uid for p in scene.pieces})
    if missing:
        raise ValueError(f"check --only: no piece {', '.join(missing)} in the scene")
    store = opcache.Store(opcache.cache_dir(scene.path) / "pairs.json", enabled=use_cache)
    gkey = opcache.global_key(scene.placeId, scene.groundStem)
    pairs = _near_pairs(cat, scene)
    if only:
        pairs = [(u, v) for u, v in pairs if u in only or v in only]
        store.keep_all()                # a scoped run never drops the other pairs
    keys = [_pair_key(cat, gkey, scene.piece(u), scene.piece(v)) for u, v in pairs]
    cached = [None if (u in only or v in only) else store.get(k)
              for (u, v), k in zip(pairs, keys)]
    todo = [i for i, c in enumerate(cached) if c is None]
    n = 1 if serial else parallel.workers()
    uids = [p.uid for p in scene.pieces if not only or p.uid in only]
    row_chunks = parallel.chunks(uids, n)
    # one pair per task: a composite's pair costs seconds, a prop's
    # milliseconds, and the pool hands tasks out one at a time
    pair_chunks = [[i] for i in todo] if n > 1 else parallel.chunks(todo, 1)
    piece_chunks = []
    for key in rules.PIECE_RULES:
        targets = rules.piece_targets(key, cat, scene)
        if only:
            targets = [u for u in targets if u in only]
        piece_chunks.append((key, parallel.chunks(targets, 2 * n) or [[]]))
    tasks = ([(_check_pairs, (cat, scene, [pairs[i] for i in c])) for c in pair_chunks]
             + [(_rule_task, (cat, scene, k)) for k in GRAPH_RULES]
             + [(_piece_rule_task, (cat, scene, key, c)) for key, cs_ in piece_chunks for c in cs_]
             + [(_rule_task, (cat, scene, "doors"))]
             + [(_check_rows, (cat, scene, c)) for c in row_chunks])
    got = parallel.run(tasks, n)
    k = 0
    for c in pair_chunks:
        for i, res in zip(c, got[k]):
            cached[i] = res
            store.put(keys[i], res)
        k += 1
    rules_out = dict(zip(GRAPH_RULES, got[k:k + len(GRAPH_RULES)]))
    k += len(GRAPH_RULES)
    for key, cs_ in piece_chunks:
        rules_out[key] = rules.piece_merge(key, cat, scene, got[k:k + len(cs_)],
                                           sorted(only) if only else None)
        k += len(cs_)
    doors = got[k]
    rows = dict(pair for chunk in got[k + 1:] for pair in chunk)
    store.save()                       # a --full run refreshes the cache
    out = {"pieces": {u: rows[u] for u in uids}, "nearPairs": cached, "doors": doors}
    out.update({key: rules_out[key] for key in CHECK_RULES})
    if only:
        out["only"] = sorted(only)
    # 0102 decision 5: every unmined mount is listed (the render round must shoot it)
    out["info"] = [f"{p.uid}: unmined mount on {p.role.get('mountedOn')} "
                   f"({p.role['mountPair'].get('unmined')})" for p in scene.pieces
                   if ((p.role or {}).get("mountPair") or {}).get("kind") == "unmined"
                   and (not only or p.uid in only)]
    if stats is not None:
        stats.update({"workers": n, "pairs": len(pairs), "pairsRestored": len(pairs) - len(todo),
                      "pairsMeasured": len(todo), "s": round(time.time() - t0, 2)})
    return out


JOINT_GAP_M = 0.03           # a run joint: the miner's contact (0097 rule 3)
JOINT_PENETRATION_M = 0.05   # the bar for a piece with no plugin-measured one below

# Run-joint bars (16k fix 2 round 6 ruling K3): the abuts record's
# `runJointBars`, which `mine_abuts.run_joint_bars` writes per piece from the
# plugin's own joints of the piece with itself (count-weighted p90 of
# `worldgen.slide_penetration`'s slide penetration and along-run overlap, the
# metric `measure.contact` uses; it reproduced the round-2 fence bars:
# fencewoven01 0.165 / 0.338, fencewoven02 0.118 / 0.236). The overlap catches
# what the slide metric cannot see: a 4.1 m panel stepped 2.09 m doubles half
# its length yet slides clear sideways in 0.1 m. A pair of two different
# pieces takes the stricter of the two bars; a piece with no row keeps
# JOINT_PENETRATION_M and no overlap bar.
def _run_joint_rows() -> dict:
    from workbench import paths as wbpaths
    wbpaths.bridge()
    from worldgen import blueprint_footprints as fp
    return fp.abuts_record().get("runJointBars") or {}


def run_joint_bars(a: Piece, b: Piece) -> tuple[float, float | None]:
    """(penetration bar, along-run overlap bar or None) for a run joint."""
    table = _run_joint_rows()
    rows = [table.get(p.asset) for p in (a, b)]
    if not all(rows):
        return JOINT_PENETRATION_M, None
    return (min(r["penetrationM"] for r in rows),
            min(r["alongRunOverlapM"] for r in rows))


def along_run_overlap(cat, a: Piece, b: Piece) -> float:
    """How far the two pieces' bounds overlap along the plan line joining
    their pivots (metres; negative = a gap): a collinear double-up
    (`worldgen.slide_penetration.along_run_overlap`)."""
    from workbench import paths as wbpaths
    wbpaths.bridge()
    from worldgen import slide_penetration as sp
    return sp.along_run_overlap(cat.mesh(a.asset), measure._transform4(a),
                                cat.mesh(b.asset), measure._transform4(b))


def _pair_verdict(a: Piece, b: Piece, got: dict, cat=None) -> dict:
    """What the pair is and the bar it is judged on: a mounted child on its
    parent (the mined pair or template IS the pose, so only contact is
    required: its designed overlap is not a defect), neighbours in one run
    or a piece snapped onto the other by evidence (gap <= 0.03 m,
    penetration <= 0.05 m), anything else (must not cross)."""
    def on(child, parent):
        by, role = child.settledBy or "", child.role or {}
        return (by == f"mount:{parent.uid}"
                or (by.startswith("template:") and by.endswith(f":{parent.uid}"))
                or role.get("mountedOn") == parent.uid
                or (role.get("kind") == "assembly" and role.get("on") == "parent"
                    and not role.get("mountedOn")
                    and (parent.role or {}).get("id") == role.get("id")))
    ra, rb = a.role or {}, b.role or {}
    if on(a, b) or on(b, a):
        return {"relation": "mounted", "ok": bool(got["contact"])}
    snapped = any((x.settledBy or "") in (f"evidence-snap:{y.uid}", f"geometry-snap:{y.uid}")
                  for x, y in ((a, b), (b, a)))
    if snapped or (ra.get("kind") == rb.get("kind") == "run" and ra.get("id") == rb.get("id")
                   and abs(int(ra.get("index", -9)) - int(rb.get("index", -9))) == 1):
        bar, overlap_bar = run_joint_bars(a, b)
        out = {"relation": "run-joint",
               "ok": got["gapM"] <= JOINT_GAP_M and (got["penetrationM"] or 0.0) <= bar}
        if overlap_bar is not None and cat is not None:
            overlap = along_run_overlap(cat, a, b)
            out.update(penetrationBarM=bar, alongRunOverlapM=round(overlap, 3),
                       alongRunOverlapBarM=overlap_bar)
            out["ok"] = out["ok"] and overlap <= overlap_bar
        return out
    n = plugin_abut_n(a.asset, b.asset)
    if n:
        # the makers place these two touching (kit-mounts-mined anchor
        # `abuts`): the cooking stand straddling its cook fire (planner
        # ruling 3, CLAYWATER2 2026-09-28); their crossing is designed
        return {"relation": "plugin-abut", "abutN": n, "ok": True}
    return {"relation": "unrelated", "ok": not got["intersecting"]}


def plugin_abut_n(a_asset: str, b_asset: str) -> int:
    """References in which the plugins place ``a`` touching ``b`` (either
    way round), from the mounts record's anchor `abuts` (0 when none)."""
    anchors = _mounts_anchors()
    return max(int(((anchors.get(x) or {}).get("abuts") or {}).get(y, 0))
               for x, y in ((a_asset, b_asset), (b_asset, a_asset)))


@lru_cache(maxsize=1)
def _mounts_anchors() -> dict:
    from workbench import paths as wbpaths
    return json.loads((wbpaths.PLACEMENT_RECORDS / "kit-mounts-mined.json").read_text()).get("anchors", {})


def _quay_reach(cat, scene, g, p, row, cs) -> dict:
    """A quay run's two tips (`compile_settlement.quay_run_ends_local`): the
    compile's slide to the bank from this pose (`compileShiftM`, 0 after
    `settle`), the landward tip on the ground/water line (dry 0.5 m inland,
    wet 0.5 m out), the seaward tip within 0.5 m of a hull's outline, and
    the stage's outline 97 C5's `worksWith` clearance from the hull's."""
    from shapely.geometry import Point, Polygon
    from workbench.scene import plan_to_province
    landward, seaward = cs.quay_run_ends_local(row, p.scale)
    tip = lambda t: plan_to_province((p.x, p.z), p.yaw, (0.0, t))
    hulls = [Polygon(measure.footprint_province(cat, q)) for q in scene.pieces
             if q is not p and (cat.row(q.asset).get("anchorClass") == "water")]
    sea = Point(tip(seaward))
    from worldgen import blueprint_integration as bi
    try:
        anchored = _quay_anchor(cat, p)
    except ValueError as err:            # no bank: report it, never abort `check`
        return {"bankError": str(err)}
    pub = Point(plan_to_province((anchored["x"], anchored["z"]), p.yaw, (0.0, seaward)))
    stage = Polygon(measure.footprint_province(cat, p))
    clear = None if not hulls else min(stage.distance(h) for h in hulls)
    return {"compileShiftM": anchored["shiftM"],     # 0 = the compile places it here
            "hullClearM": None if clear is None else round(clear, 2),
            # 97 C5: a hull that `worksWith` its stage keeps this clear of it
            "hullClearMinM": bi.WORKS_WITH_CLEAR_M,
            "landwardTip": [round(v, 2) for v in tip(landward)],
            "dryInland": not g.wet(*tip(landward - 0.5)), "wetOut": g.wet(*tip(landward + 0.5)),
            "seawardTip": [round(v, 2) for v in tip(seaward)],
            "tipToHullM": None if not hulls else round(min(
                0.0 if h.contains(sea) else h.exterior.distance(sea) for h in hulls), 2),
            # the compile never keeps a quay pose exactly: `anchor_quay_run`
            # always slides it by half a search step (QUAY_SHORE_STEP_M / 2)
            # at least, so the published tip is judged here too
            "publishedTipToHullM": None if not hulls else round(min(
                0.0 if h.contains(pub) else h.exterior.distance(pub) for h in hulls), 2)}


def _hull_bars() -> tuple[float, float]:
    """The yard gate's own hull bars (`worldgen.test_proving_ground`): the
    halo round the outline and the least depth in it."""
    from workbench import paths as wbpaths
    wbpaths.bridge()
    from worldgen import test_proving_ground as tpg
    return tpg.HULL_HALO_M, tpg.HULL_MIN_DEPTH_M


def _hull_water(cat, g, p) -> dict:
    """The depth ring round a floating piece: the shallowest depth-grid cell
    whose centre lies within the gate's halo of its outline (the yard gate's
    test, on the same grid)."""
    from shapely.geometry import Point, Polygon
    halo_m, least_m = _hull_bars()
    halo = Polygon(measure.footprint_province(cat, p)).buffer(halo_m)
    px = g.meta["depth"]["pxM"]
    x0, z0, x1, z1 = halo.bounds
    cells = [g.depth((c + .5) * px, (r + .5) * px)
             for r in range(int(z0 // px), int(z1 // px) + 1)
             for c in range(int(x0 // px), int(x1 // px) + 1)
             if halo.contains(Point((c + .5) * px, (r + .5) * px))]
    least = min(cells) if cells else None
    return {"haloM": halo_m, "cells": len(cells),
            "minDepthM": None if least is None else round(float(least), 2),
            "ok": least is not None and least >= least_m}


def cmd_path(a, scene, cat):
    if a.action == "remove":
        scene.paths = [p for p in scene.paths if p["id"] != a.id]
        return {"removed": a.id}
    pts = [[a.points[i], a.points[i + 1]] for i in range(0, len(a.points), 2)]
    scene.paths = [p for p in scene.paths if p["id"] != a.id]
    scene.paths.append({"id": a.id, "kind": a.kind, "widthM": a.width, "pointsM": pts})
    return {"path": a.id, "points": len(pts)}


def cmd_bind(a, scene, cat):
    p = scene.piece(a.uid)
    role = {"kind": a.kind, "id": a.id}
    if a.kind == "run":
        role["index"] = a.index
    if a.kind == "assembly":
        if not (a.layer and a.on and a.evidence):
            raise ValueError("an assembly binding needs --layer, --on and --evidence")
        role.update({"layer": a.layer, "on": a.on, "evidence": a.evidence})
    for key in ("mountedOn", "mountPair", "liftedOn"):
        if key in p.role:
            role[key] = p.role[key]
    if getattr(a, "host", None) is not None:
        # 16k walk 2 P4/D7: the op names the host the child hangs on; the
        # export parents it there (`export.mount_host`), so a bind that names
        # another piece than the one it was mounted on is refused here
        from workbench.scene import hung_on
        if a.on != "parent" or hung_on(p) != a.host:
            raise ValueError(f"bind {p.uid} --host {a.host}: it hangs on {hung_on(p)!r} "
                             f"(on {a.on!r}); mount it on {a.host} first, on parent")
        role["host"] = a.host
    p.role = role
    return {"uid": p.uid, "role": role}


def cmd_render(a, scene, cat):
    from workbench import render
    if a.shots:
        return render.render_round(cat, scene, a.shots, a.res, a.samples,
                                   labels=getattr(a, "labels", False))
    if a.view is None:
        raise ValueError("render needs a VIEW or --shots auto|LIST")
    return render.render(cat, scene, a.view, a.focus, a.res, a.out, a.span, a.bearing, a.cut,
                         a.samples, a.highlight, night=a.night, labels=a.labels)


def owner_guided_refusal(place_id: str, reason: str | None) -> str | None:
    """16k walk 2 T1 item 4: a place whose catalogue record is `ownerGuided`
    (the owner is hands-on there, catalogue.py) is applied or exported only
    with `--owner-guided REASON`; None when it may go ahead."""
    wbpaths_bridge()
    from worldgen import blueprint as bp_mod
    record = bp_mod.catalogue_records().get(place_id) or {}
    if record.get("ownerGuided") is not True:
        return None
    if reason and reason.strip():
        return None
    return (f"{place_id} is ownerGuided in its catalogue record (the owner is hands-on "
            f"here): pass --owner-guided REASON naming the owner's go-ahead")


def wbpaths_bridge() -> None:
    from workbench import paths as wbpaths
    wbpaths.bridge()


def cache_staleness_refusal(scene) -> str | None:
    """`export --write` publishes a scene only when its last `apply` derived
    every op (`--full`): a scene restored from the op cache is re-derived
    once before it becomes a record (method review r2, 2026-09-27). A scene
    no `apply` built (single commands) has no sidecar and is not refused."""
    from workbench import opcache
    side = opcache.cache_dir(scene.path).parent / "derived.json"
    if not side.exists():
        return None
    got = json.loads(side.read_text())
    if got.get("full"):
        return None
    return (f"{Path(scene.path).name} was last applied from the op cache: run "
            f"`wb.py apply <layout> --full` (or `wb.py round ... --full`) before export --write")


def cmd_export(a, scene, cat):
    from workbench import export
    why = owner_guided_refusal(scene.placeId, getattr(a, "owner_guided", None))
    if why:
        raise ValueError(why)
    why = cache_staleness_refusal(scene) if a.write else None
    if why:
        raise ValueError(why)
    return export.export(scene, Path(a.blueprint), write=a.write)


def cmd_list(a, scene, cat):
    return [{"uid": p.uid, "asset": p.asset, "x": round(p.x, 3), "z": round(p.z, 3),
             "km": [round(p.x / 1000, 4), round(p.z / 1000, 4)], "yaw": round(p.yaw, 2),
             "y": None if p.y is None else round(p.y, 3), "settledBy": p.settledBy,
             "role": p.role} for p in scene.pieces]


def cmd_remove(a, scene, cat):
    scene.remove(a.uid)
    return {"removed": a.uid}


def cmd_note(a, scene, cat):
    scene.piece(a.uid).notes.append(a.text)
    return {"uid": a.uid, "notes": scene.piece(a.uid).notes}


def cmd_map(a, scene, cat):
    """ASCII map of the ground window for siting: one character per cell of
    the compile's slope grid (5.48 m): `.` < 2 deg (direct/pad limit, 97 B3),
    `+` < 3 deg (stilt), `o` < 6, `#` steeper, `~` wet (deep >= 1 m: `W`);
    pieces' pivots as the first letter of their uid, paths as `=`, province
    roads `R` and tracks `r` (routes.json / routes-minor.json)."""
    g = scene.ground()
    m = g.meta["grid"]
    px = m["pxM"]
    cx, cz = g.meta["centreM"]
    half = min(a.half or g.meta["halfM"], g.meta["halfM"])
    marks = {}
    for p in scene.pieces:
        marks[(int(p.z // px), int(p.x // px))] = p.uid[0]
    from workbench import paths as wbpaths
    for name, key, ch in (("routes.json", "routes", "R"), ("routes-minor.json", "tracks", "r")):
        for route in json.loads((wbpaths.PROVINCE / name).read_text()).get(key, []):
            for col, row in route.get("px") or []:          # the 5.48 m analysis grid
                marks.setdefault((int(row), int(col)), ch)
    for path in scene.paths:
        pts = path["pointsM"]
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            n = max(2, int(math.hypot(x1 - x0, z1 - z0) / (px / 2)))
            for k in range(n + 1):
                cell = (int((z0 + (z1 - z0) * k / n) // px), int((x0 + (x1 - x0) * k / n) // px))
                marks.setdefault(cell, "=")
    legend = ("heights: whole metres of the survey ground at the cell centre, 0-9 then a-z "
              "for 10-35, - below 0" if a.heights else
              ". <2 + <3 o <6 # steeper ~ wet W deep>=1m")
    lines = [f"x from {cx - half:.0f} to {cx + half:.0f} m east, {px:.2f} m per char; "
             f"rows z (south) from {cz - half:.0f}; {legend}"]
    for r in range(int((cz - half) // px), int((cz + half) // px)):
        row = []
        for c in range(int((cx - half) // px), int((cx + half) // px)):
            x, z = (c + 0.5) * px, (r + 0.5) * px
            if a.heights:
                h = g.survey_height(x, z)
                row.append("-" if h < 0 else HEIGHT_CHARS[min(int(h), len(HEIGHT_CHARS) - 1)])
            elif (r, c) in marks:
                row.append(marks[(r, c)])
            elif g.wet(x, z):
                row.append("W" if g.depth(x, z) >= 1.0 else "~")
            else:
                s = float(g._grid("slope", "grid", x, z))
                row.append("." if s < 2 else "+" if s < 3 else "o" if s < 6 else "#")
        lines.append(f"{r * px:7.0f} " + "".join(row))
    print("\n".join(lines))
    return {"rows": len(lines) - 1}


HEIGHT_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz"


def cmd_site(a, scene, cat):
    """Every pose in the window (a grid of --step metres, at --yaw) where the
    asset passes the compile's own ground rules (`_fit_rules`: the fit's
    slope limit and ground delta), with no wet footprint vertex (ground
    pieces) and no province road or scene path within --clear metres of its
    outline, inside the ground window; best (least slope, then least delta)
    first. Only roads and tracks that reach the window are read. Water pieces: also
    the yard gate's halo round the outline on at least its least depth
    (`_hull_water`)."""
    from shapely.geometry import LineString, Polygon
    from workbench import paths as wbpaths
    wbpaths.bridge()
    from worldgen import compile_settlement as cs
    from workbench import pads
    g = pads.ground_for(cat, scene, None)      # the patched ground check reads (0101)
    row = cat.row(a.asset)
    water = (row.get("anchorClass") or "ground") == "water"
    taken = ([Polygon(measure.footprint_province(cat, q)).buffer(0.15) for q in scene.pieces
              if q.uid not in (getattr(a, "skip", None) or [])] if getattr(a, "free", False) else [])
    cx, cz = (a.centre if a.centre else g.meta["centreM"])
    half = min(a.half or g.meta["halfM"], g.meta["halfM"])
    from shapely.geometry import box
    wx, wz = g.meta["centreM"]
    window = box(wx - g.meta["halfM"], wz - g.meta["halfM"], wx + g.meta["halfM"], wz + g.meta["halfM"])
    reach = window.buffer(a.clear)
    ways = [LineString(p["pointsM"]) for p in scene.paths if len(p["pointsM"]) >= 2]
    px = g.meta["grid"]["pxM"]
    for name, key in (("routes.json", "routes"), ("routes-minor.json", "tracks")):
        for route in json.loads((wbpaths.PROVINCE / name).read_text()).get(key, []):
            pts = [((c + .5) * px, (r + .5) * px) for c, r in route.get("px") or []]
            if len(pts) >= 2 and LineString(pts).intersects(reach):
                ways.append(LineString(pts).intersection(reach))
    halo = _hull_bars()[0] if water else 0.0
    found = []
    steps = int(2 * half // a.step)
    for i in range(steps + 1):
        for j in range(steps + 1):
            x, z = cx - half + j * a.step, cz - half + i * a.step
            p = Piece("site", a.asset, x, z, a.yaw % 360.0)
            poly = measure.footprint_province(cat, p)
            outline = Polygon(poly)
            if not window.contains(outline.buffer(halo + 1.0)):
                continue                    # the window's samplers refuse what lies outside it
            if any(w.distance(outline) < a.clear for w in ways):
                continue
            if any(outline.intersects(t) for t in taken):
                continue
            try:
                if getattr(a, "beached", False):
                    p.y = measure.seat(cat, g, p)["y"]
                    rules = _beached(cat, g, p)
                else:
                    rules = _fit_rules(cat, g, p, cs)
                    if rules["ok"] and not water and getattr(a, "free", False):
                        p.y = measure.seat(cat, g, p)["y"]
                        if measure.float_under(cat, g, p)["footFloatMaxM"] > 0.3:
                            continue
            except ValueError:                  # a sample outside the ground window
                continue
            if not rules["ok"]:
                continue
            if water:
                ring = _hull_water(cat, g, p)
                if ring["ok"]:
                    found.append({"at": [round(x, 2), round(z, 2)], "minDepthM": ring["minDepthM"],
                                  "maxSlopeDeg": rules["maxSlopeDeg"],
                                  "fromCentreM": round(math.hypot(x - cx, z - cz), 2)})
                continue
            if any(g.wet(vx, vz) for vx, vz in poly):
                continue
            found.append({"at": [round(x, 2), round(z, 2)], "maxSlopeDeg": rules["maxSlopeDeg"],
                          "surveyDeltaM": rules.get("surveyDeltaM", 0.0), "sillM": rules.get("sillM"),
                          "fromCentreM": round(math.hypot(x - cx, z - cz), 2)})
    if getattr(a, "nearest", False):
        found.sort(key=lambda f: (f.get("fromCentreM", 0.0), f["maxSlopeDeg"]))
    else:
        found.sort(key=lambda f: (f["maxSlopeDeg"], f.get("surveyDeltaM", 0.0),
                                  -f.get("minDepthM", 0.0)))
    return {"asset": a.asset, "yaw": a.yaw, "fit": fit_of(row), "legal": len(found),
            "best": found[:a.limit]}


def cmd_scan(a, scene, cat):
    """Site feasibility before editing (`workbench.scan`): every candidate
    pose of every building in the spec, ranked, the best placed and judged."""
    from workbench import paths as wbpaths, scan
    wbpaths.bridge()
    from worldgen import compile_settlement as cs
    doc = json.loads(Path(a.spec).read_text())
    got = scan.scan(cat, scene, doc, lambda c, g, p: _fit_rules(c, g, p, cs, None),
                    serial=a.serial, judge=lambda c, s, p: judge_fit(c, s, p, cs))
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(json.dumps(got, indent=1, default=lambda o: round(float(o), 4)) + "\n")
    return {"buildings": [{k: b[k] for k in ("id", "poses", "measured", "legal")}
                          | {"best": b["top"][:3], "verified": b["verified"][:1]}
                          for b in got["buildings"]], "out": a.out}


def cmd_compile(a, scene, cat):
    """The real compile on the scene as it stands, without touching the
    blueprint (`compile_scene`)."""
    from workbench import paths as wbpaths
    src = Path(a.blueprint) if a.blueprint else wbpaths.BLUEPRINTS / f"{scene.placeId}.json"
    return compile_scene(scene, src, cat=cat)


RING_KIND = "ring"


def load_ring(scene, settlement: dict) -> list[str]:
    """16k r8 rule 5: the compiled dressing ring as scene pieces (role kind
    ``ring``, uid ``ring:<placement id past the place id>``) at the compile's
    pose, replacing any ring an earlier apply loaded. `check` and walkRule
    judge them; `export` never writes them back (the compile lays the ring)."""
    for q in [q for q in scene.pieces if (q.role or {}).get("kind") == RING_KIND]:
        scene.remove(q.uid)
    bp_id, added = settlement["id"], []
    for pl in sorted(settlement.get("placements") or [], key=lambda p: p["id"]):
        if pl.get("objectKind") != "dressing":
            continue
        x, y, z = (float(v) for v in pl["positionM"])
        p = scene.add(Piece(uid=f"ring:{pl['id'].removeprefix(bp_id + '.')}", asset=pl["assetId"],
                            x=x, z=z, yaw=float(pl.get("yawDeg", 0.0)) % 360.0, y=y,
                            scale=float(pl.get("scale", 1.0)), settledBy="ring",
                            role={"kind": RING_KIND, "placementId": pl["id"],
                                  "parcel": pl.get("parcelId")}))
        added.append(p.uid)
    return added


def _run_module(name: str, *args: str):
    """`python -m NAME ARGS` in this process (the derive passes and the
    compile): the modules, the survey and the kit records are imported and
    loaded once per process instead of once per pass (nine interpreter
    starts per compile before). Same argv, same working directory, stdout
    and stderr captured; `WB_COMPILE_SUBPROCESS=1` restores the subprocesses."""
    import contextlib
    import importlib
    import io
    import subprocess
    from workbench import paths as wbpaths
    wbpaths.bridge()
    out, err = io.StringIO(), io.StringIO()
    old_argv, old_cwd = sys.argv, os.getcwd()
    code = 0
    try:
        mod = importlib.import_module(name)
        sys.argv = [name, *args]
        os.chdir(wbpaths.WORLDGEN)
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                got = mod.main()
                code = int(got or 0)
            except SystemExit as stop:
                code = stop.code if isinstance(stop.code, int) else (0 if stop.code is None else 1)
                if stop.code is not None and not isinstance(stop.code, int):
                    print(stop.code, file=sys.stderr)
            except Exception:                  # noqa: BLE001 - a crash is the pass's exit 1
                import traceback
                traceback.print_exc()
                code = 1
    finally:
        sys.argv = old_argv
        os.chdir(old_cwd)
    return subprocess.CompletedProcess([name, *args], code, out.getvalue(), err.getvalue())


def compile_scene(scene, src: Path, keep: Path | None = None,
                  keep_out: Path | None = None, cat=None, use_cache: bool = True) -> dict:
    """Export into a temporary copy of the blueprint, run the settlement-build
    derive passes on it (twice: they feed each other) and `compile_settlement`,
    and return its errors and warnings, each with the scene pieces bound to
    the parcels, landmarks and routes it names. `check` measures contacts;
    this is the compile's verdict on the same poses, so the two never
    disagree. `keep`: where to leave the derived copy (the plan render reads
    it after `apply`); `keep_out`: the directory the compiled settlement is
    written to and left in (``settlement`` in the result; 16k r8 rule 5:
    `apply` loads its ring), else a temporary one.

    With ``cat`` (and ``use_cache``, and `WB_COMPILE_CACHE` not "0"), the
    result is kept in the scene's cache (`compile.json`) under
    `opcache.compile_key` (the exported blueprint's bytes, the code, the
    ground, the records and the placed assets); an unchanged export restores
    the derived blueprint, the compiled settlement and the compile's output
    instead of running the passes (``cached`` in the result)."""
    import re
    import shutil
    import subprocess
    import tempfile
    from workbench import export, opcache, paths as wbpaths
    tmp = Path(tempfile.mkdtemp(prefix="wb-compile-"))
    store, key, entry = None, None, None
    try:
        bp = tmp / src.name
        shutil.copy(src, bp)
        export.export(scene, bp, write=True)
        if cat is not None and os.environ.get("WB_COMPILE_CACHE") != "0" \
                and os.environ.get("WB_COMPILE_SUBPROCESS") != "1":
            key = opcache.compile_key(cat, scene, bp.read_bytes())
            store = opcache.Store(opcache.cache_dir(scene.path) / "compile.json", enabled=use_cache)
            entry = store.get(key)
        if entry is not None:
            if "stage" in entry:
                store.save()
                return {"stage": entry["stage"], "failed": entry["failed"], "cached": True}
            bp.write_text(entry["blueprint"])
        run = (_run_module if os.environ.get("WB_COMPILE_SUBPROCESS") != "1" else
               lambda *args: subprocess.run(  # noqa: E731
                   [sys.executable, "-m", *args], cwd=wbpaths.WORLDGEN, capture_output=True,
                   text=True))
        for _ in range(2 if entry is None else 0):
            # the passes `export` prints as `next`, one list (export.PASSES)
            from workbench import export as export_mod
            for args in (tuple(str(bp) if a == "<bp>" else a for a in step)
                         for step in export_mod.PASSES):
                got = run(*args)
                if got.returncode:
                    failed = {"stage": args[0], "failed": (got.stdout + got.stderr)[-2000:]}
                    if store is not None:
                        store.put(key, failed)
                        store.save()
                    return failed
        if keep is not None:
            keep.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(bp, keep)
        out_dir = tmp if keep_out is None else keep_out
        out_dir.mkdir(parents=True, exist_ok=True)
        for stale in out_dir.glob("*.settlement.json"):
            stale.unlink()                  # never a ring from an earlier compile
        if entry is None:
            derived_bp = bp.read_text()
            got = run("worldgen.compile_settlement", "--blueprint", str(bp), "--out", str(out_dir))
            compiled = sorted(out_dir.glob("*.settlement.json"))
            if store is not None:
                store.put(key, {"blueprint": derived_bp, "stdout": got.stdout, "stderr": got.stderr,
                                "returncode": got.returncode,
                                "settlements": {f.name: f.read_text() for f in compiled}})
                store.save()
        else:
            for name, text in entry["settlements"].items():
                (out_dir / name).write_text(text)
            got = subprocess.CompletedProcess(["worldgen.compile_settlement"], entry["returncode"],
                                              entry["stdout"], entry["stderr"])
            store.save()
            compiled = sorted(out_dir.glob("*.settlement.json"))
        settlement = str(compiled[0]) if keep_out is not None and compiled else None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    ids = {}
    for p in scene.pieces:
        rid = p.role.get("id")
        if rid:
            ids.setdefault(rid, []).append(p.uid)
    for path in scene.paths:
        ids.setdefault(path["id"], []).append(f"path:{path['id']}")
    errors, warnings, waived, summary = [], [], [], None
    for line in (got.stdout + got.stderr).splitlines():
        if not line.startswith("compile_settlement: "):
            continue
        msg = line[len("compile_settlement: "):]
        uids = sorted({u for rid, us in ids.items()
                       if re.search(re.escape(rid) + r"(?![\w-])", msg) for u in us})
        if msg.startswith("WARN: "):
            warnings.append({"msg": msg[6:], "uids": uids})
        elif msg.startswith("FIXTURE-WAIVED"):
            waived.append(msg)
        elif " placements, " in msg:
            summary = msg.split(" — ", 1)[-1]
        elif not msg.startswith("promise ledger"):
            errors.append({"msg": msg, "uids": uids})
    return {"blueprint": str(src), "exitCode": got.returncode, "summary": summary,
            "errors": errors, "warnings": warnings, "fixtureWaived": len(waived),
            "settlement": settlement, **({"cached": True} if entry is not None else {})}


# The deployed studio, the only link the owner can open on the phone after the
# session (method review r3 F12: the ES_TUNNEL_URL tunnel dies with the
# session). TODO(lane 3A): delete this fallback once worldgen/site_urls.py
# (S18, lane 3A's report) is committed; `walktable_base_url` reads it first.
WALKTABLE_DEPLOYED_URL = "https://jtattersall09403.github.io/elder-souls-argonia/studio/"


def walktable_base_url() -> str:
    """The studio URL the walk table links: the deployed studio
    (`worldgen.site_urls.studio_url(local=False)`), never the dev tunnel."""
    from workbench import paths as wbpaths
    wbpaths.bridge()
    try:
        from worldgen.site_urls import studio_url
    except ImportError:
        return WALKTABLE_DEPLOYED_URL
    return studio_url(local=False)


def cmd_walktable(a, scene, cat):
    """The owner-walk table for one place, read from the PUBLISHED bundle
    (every item, every time), with a `measured` column: the 0102 rule
    numbers per item from the place's last `apply` (output/apply/<place>.json);
    each row links the deployed studio (`walktable_base_url`)."""
    from workbench import paths, rules
    paths.bridge()
    from worldgen import settlement_bundles
    bundle = settlement_bundles.read_published(paths.PROVINCE)
    site = next(s for s in bundle["settlements"] if s["id"] == a.place)
    ids = set(site["placementIds"])
    summary_path = paths.OUTPUT / "apply" / f"{a.place}.json"
    cells, applied, full = {}, None, {}
    if summary_path.exists():
        summary = json.loads(summary_path.read_text())
        full = (summary.get("check") or {}).get("full") or {}
        cells = rules.measured(full)
        applied = Scene.load(Path(summary["scene"])) if summary.get("scene") else None
    base = walktable_base_url()
    url = lambda e, s: f"{base}?view=character&x={e:.3f}&z={s:.3f}&t=12"
    xs = [p[0] for p in site["boundaryM"]]
    zs = [p[1] for p in site["boundaryM"]]
    rows = [("place centre (boundary box)", (min(xs) + max(xs)) / 2000,
             (min(zs) + max(zs)) / 2000, "anchor", "-", "-", "-")]
    by_parcel = {}
    if applied is not None:
        by_parcel = {(p.role or {}).get("id"): p.uid for p in applied.pieces
                     if (p.role or {}).get("kind") == "parcel"}
    for p in sorted((p for p in bundle["placements"] if p["id"] in ids), key=lambda p: p["id"]):
        uid = rules.bundle_uid(applied, p["id"], site["id"]) if applied is not None else None
        rows.append((p["id"].removeprefix(site["id"] + "."), p["positionM"][0] / 1000,
                     p["positionM"][2] / 1000, p["kind"], p["assetId"].rsplit("/", 1)[-1],
                     (p.get("anchor") or {}).get("groundFit", "-"), cells.get(uid, "-")))
    for d in sorted((d for d in bundle["doors"] if d["settlementId"] == site["id"]),
                    key=lambda d: d["id"]):
        uid = by_parcel.get(d["parcelId"])
        walk = rules.door_walk(full, uid) if uid else "-"
        rows.append((d["id"] + " threshold", d["thresholdM"][0] / 1000, d["thresholdM"][1] / 1000,
                     "door", d["parcelId"].rsplit(".", 1)[-1], f"facing {d['facingDeg']:.1f}", walk))
    table = ["item | E km | S km | kind | piece | fit | measured | studio URL"]
    table += [f"{r[0]} | {r[1]:.3f} | {r[2]:.3f} | {r[3]} | {r[4]} | {r[5]} | {r[6]} | "
              f"{url(r[1], r[2])}" for r in rows]
    print("\n".join(table))
    return {"place": a.place, "placements": len(ids), "rows": len(rows),
            "measuredFrom": str(summary_path) if applied is not None else
            f"no apply summary at {summary_path}: run `wb.py apply` first"}


def cmd_describe(a, scene, cat):
    from workbench import describe
    return describe.describe(cat, a.asset, refresh=a.refresh)


def cmd_evidence(a, scene, cat):
    return {"abutsSteps": snap.evidence_steps(a.parent_asset, a.child_asset)[:12],
            "mountPairs": snap.mount_pairs(a.child_asset, a.parent_asset)}


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("scene", help="scene JSON path, or - for scene-free commands")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("window")
    s.add_argument("--centre-km", type=float, nargs=2, required=True)
    s.add_argument("--half", type=float, default=150.0)
    s.add_argument("--place-id", default="")
    s = sub.add_parser("place")
    s.add_argument("uid")
    s.add_argument("asset")
    s.add_argument("--at", type=float, nargs=2, required=True)
    s.add_argument("--km", action="store_true")
    s.add_argument("--yaw", type=float, default=0.0)
    s.add_argument("--y", type=float, default=None)
    s.add_argument("--scale", type=float, default=None,
                   help="default: the manifest's placed scale (cat.placed_scale)")
    s.add_argument("--settle", action="store_true")
    s.add_argument("--pad", nargs="*", default=None, metavar="KEY=VALUE",
                   help="declare a building pad (0101): apronM, datumM, floorMinM")
    s.add_argument("--beached", action="store_true",
                   help="a hull or cleat drawn up on the bank (R5): judged on its base "
                        "contact, bank slope and reach to the water line, not 97 B3")
    s.add_argument("--walkable", action="store_true",
                   help="a walkable deck (ramp, stair, boardwalk, bridge): walkRule walks its "
                        "top instead of routing round it (0102)")
    s.add_argument("--ruin", action="store_true",
                   help="allow a ruin-only piece (manifest placeUse, placement-policies)")
    s = sub.add_parser("move")
    s.add_argument("uid")
    for k in ("dx", "dz", "dy", "forward", "right", "turn"):
        s.add_argument(f"--{k}", type=float, default=0.0)
    s.add_argument("--yaw", type=float, default=None)
    s.add_argument("--pitch", type=float, default=None, help="absolute, degrees")
    s.add_argument("--roll", type=float, default=None, help="absolute, degrees (not exportable)")
    s.add_argument("--resettle", action="store_true")
    s = sub.add_parser("settle")
    s.add_argument("uid")
    s.add_argument("--source", choices=("chunks", "survey"), default="chunks")
    s = sub.add_parser("snap")
    for k in ("child", "child_face", "parent", "parent_face"):
        s.add_argument(k)
    s.add_argument("--by", choices=("geometry", "evidence"), default="geometry")
    s.add_argument("--lateral", type=float, default=0.0)
    s.add_argument("--keep-yaw", action="store_true")
    s.add_argument("--pick", type=int, default=0)
    s.add_argument("--settle", action="store_true",
                   help="re-seat the child on its own ground afterwards (the runtime's seat)")
    s.add_argument("--allow-terminal", action="store_true",
                   help="use a step on a face the plugins end the run on")
    s = sub.add_parser("attach")
    s.add_argument("child")
    s.add_argument("parent")
    s.add_argument("--template", default=None)
    s.add_argument("--pick", type=int, default=0)
    s = sub.add_parser("mirror")
    s.add_argument("uid")
    s = sub.add_parser("swap")
    s.add_argument("uid")
    s.add_argument("asset")
    s.add_argument("--keep", choices=("base", "pivot"), default="base")
    s.add_argument("--resettle", action="store_true")
    s = sub.add_parser("group")
    s.add_argument("action", choices=("save", "place", "list"))
    s.add_argument("name", nargs="?")
    s.add_argument("--uids", nargs="*", default=[])
    s.add_argument("--anchor", default=None, help="save: the member the group is relative to")
    s.add_argument("--at", type=float, nargs=2)
    s.add_argument("--yaw", type=float, default=0.0)
    s.add_argument("--prefix", default="")
    s.add_argument("--parcel", default=None, help="place: rebind members' parcel/assembly ids")
    s = sub.add_parser("openings")
    s.add_argument("uid")
    s.add_argument("--clear", type=float, default=1.0)
    sub.add_parser("signature")
    s = sub.add_parser("probe")
    s.add_argument("asset")
    s.add_argument("--at", type=float, nargs=2, required=True)
    s.add_argument("--yaw", type=float, default=0.0)
    s = sub.add_parser("mount")
    s.add_argument("child")
    s.add_argument("parent")
    s.add_argument("--along", type=float, default=None)
    s.add_argument("--point", type=int, default=0)
    s.add_argument("--unmined", default=None, metavar="reader-approved rN",
                   help="0102 decision 5: mount a child under 0.6 m on a parent with no mined "
                        "pair, naming the render round that approved it")
    s.add_argument("--yaw", type=float, default=None,
                   help="world yaw for a pair recorded yawBy: designer (a road board: height "
                        "and face mined, the bearing is the road's)")
    s.add_argument("--wall", action="store_true",
                   help="with --unmined: hang the child on the parent's nearest wall face where "
                        "it is placed (its height kept), not on its top (walk 2 round 4)")
    s.add_argument("--hang", action="store_true",
                   help="R53: hang the child from the parent's mesh (a branch underside) by "
                        "its hang point (highest vertex on its pivot axis); needs --unmined; "
                        "--along M / --bearing D from the parent's pivot pick the spot")
    s.add_argument("--min-h", type=float, default=snap.HANG_MIN_H_M,
                   help="--hang: the branch hit at least this high over the ground")
    s.add_argument("--max-h", type=float, default=snap.HANG_MAX_H_M,
                   help="--hang: the branch hit at most this high over the ground")
    s.add_argument("--bearing", type=float, default=None,
                   help="--hang: compass bearing from the parent's pivot to look along")
    s.add_argument("--height", type=float, default=None,
                   help="the child's centre this high over the padded ground under it (a road "
                        "board at hand height: 1.9 m, walk 2 round 4); the pair's face and "
                        "bearing stay mined, its height is the designer's")
    s = sub.add_parser("measure")
    s.add_argument("a")
    s.add_argument("b")
    s = sub.add_parser("ground")
    s.add_argument("uid", nargs="?")
    s.add_argument("--at", type=float, nargs=2)
    sub.add_parser("doors")
    s = sub.add_parser("check")
    s.add_argument("--only", default=None, metavar="UID,..",
                   help="judge these pieces only: their rows, near pairs (re-measured) and "
                        "per-piece rules; the graph rules still judge the whole scene")
    s.add_argument("--serial", action="store_true", help="no fork pool (the reference run)")
    s.add_argument("--full", action="store_true", help="ignore the scene's pair cache")
    s = sub.add_parser("path")
    s.add_argument("action", choices=("add", "remove"))
    s.add_argument("id")
    s.add_argument("--points", type=float, nargs="*", default=[])
    s.add_argument("--width", type=float, default=3.0)
    s.add_argument("--kind", default="footpath")
    s = sub.add_parser("bind")
    s.add_argument("uid")
    s.add_argument("kind", choices=("parcel", "run", "landmark", "assembly"))
    s.add_argument("id", help="parcel / landmark id; for assembly, the SHELL's parcel id")
    s.add_argument("--index", type=int, default=0)
    s.add_argument("--layer", default=None, help="assembly: door porch steps window shutter "
                                                  "roof chimney annex light clutter wear")
    s.add_argument("--on", choices=("parent", "ground"), default=None,
                   help="assembly: hung on the shell, or seated on the terrain")
    s.add_argument("--evidence", default=None,
                   help="assembly: the template id, mount pair or 'measured'")
    s.add_argument("--host", default=None,
                   help="assembly on parent: the piece it is mounted on (a lantern's "
                        "barrel, a board's post); exported as the member's host")
    s = sub.add_parser("render")
    s.add_argument("view", nargs="?", default=None,
                   choices=("top", "front", "side", "back", "iso", "turntable", "cutaway"))
    s.add_argument("--shots", default=None,
                   help="one Blender launch for a whole round: 'auto' (top, a front per "
                        "parcel on its door side, isos at two opposite bearings) or a comma "
                        "list of top | iso | iso:BEARING | front:UID")
    s.add_argument("--focus", nargs="*", default=[])
    s.add_argument("--highlight", nargs="*", default=[])
    s.add_argument("--res", type=int, default=1024)
    s.add_argument("--span", type=float, default=None)
    s.add_argument("--bearing", type=float, default=None)
    s.add_argument("--cut", type=float, default=0.0)
    s.add_argument("--samples", type=int, default=12)
    s.add_argument("--night", action="store_true",
                   help="dark sky, a warm light at every light-layer piece (single view; "
                        "in --shots, end a token in @night)")
    s.add_argument("--labels", action="store_true",
                   help="piece ids, caption (view, bearing, span, night) and px/m on the "
                        "pictures; default none but the scale bar and north arrow (R8)")
    s.add_argument("--out", default=None)
    s = sub.add_parser("export")
    s.add_argument("blueprint")
    s.add_argument("--write", action="store_true")
    s.add_argument("--owner-guided", default=None, metavar="REASON",
                   help="an ownerGuided place: the owner's go-ahead, named")
    sub.add_parser("list")
    s = sub.add_parser("remove")
    s.add_argument("uid")
    s = sub.add_parser("note")
    s.add_argument("uid")
    s.add_argument("text")
    s = sub.add_parser("map")
    s.add_argument("--half", type=float, default=None)
    s.add_argument("--heights", action="store_true", help="ground heights instead of slope")
    s = sub.add_parser("site")
    s.add_argument("asset")
    s.add_argument("--yaw", type=float, default=0.0)
    s.add_argument("--step", type=float, default=4.0)
    s.add_argument("--half", type=float, default=None)
    s.add_argument("--centre", type=float, nargs=2, default=None, help="province metres")
    s.add_argument("--clear", type=float, default=3.0, help="metres from any way")
    s.add_argument("--limit", type=int, default=12)
    s.add_argument("--free", action="store_true",
                   help="only poses clear of every scene piece's outline (0.15 m), with the "
                        "foot seated within the float bar: dressing siting")
    s.add_argument("--skip", nargs="*", default=[], help="piece uids --free ignores (the piece being moved)")
    s.add_argument("--beached", action="store_true", help="judge the pose on R5 (beached hull or cleat)")
    s.add_argument("--nearest", action="store_true", help="order by distance from --centre")
    s = sub.add_parser("scan")
    s.add_argument("spec", help="scan spec JSON: {buildings: [{id, asset | group, centre, "
                                "radius, step, yaws | yawStep, pad?, landingBearing?, skip?, "
                                "pair? {asset, childFace, parentFace, by, pick?}, "
                                "parcel?, limit?, verify?}]}")
    s.add_argument("--out", default=None, help="write the whole ranked result here")
    s.add_argument("--serial", action="store_true", help="no fork pool")
    s = sub.add_parser("compile")
    s.add_argument("blueprint", nargs="?", default=None,
                   help="default world/sources/blueprints/<scene placeId>.json")
    s = sub.add_parser("walktable")
    s.add_argument("place")
    s = sub.add_parser("describe")
    s.add_argument("asset")
    s.add_argument("--refresh", action="store_true")
    s = sub.add_parser("evidence")
    s.add_argument("parent_asset")
    s.add_argument("child_asset")
    return ap


READ_ONLY = {"measure", "ground", "doors", "check", "render", "export", "list", "describe",
             "evidence", "map", "walktable", "openings", "signature", "probe", "site",
             "compile", "scan"}


def apply_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="wb.py apply", description="build a scene from a layout")
    ap.add_argument("layout", type=Path)
    ap.add_argument("--scene", default=None, help="scene name or .json path "
                                                  "(default <place slug>-layout); rebuilt fresh")
    ap.add_argument("--no-compile", action="store_true")
    ap.add_argument("--allow-stale-ground", action="store_true",
                    help="build even when the blueprint was authored on other chunk files")
    ap.add_argument("--owner-guided", default=None, metavar="REASON",
                    help="an ownerGuided place (catalogue record): the owner's go-ahead, named")
    ap.add_argument("--full", action="store_true",
                    help="re-derive every op and every near pair (ignore the scene's cache)")
    ap.add_argument("--cache", action="store_true",
                    help="restore unchanged ops and near pairs from the scene's cache")
    return ap


# Whether apply and round restore from the op cache when neither --full nor
# --cache is given (the A/B of 2026-09-27 decides it; see the README).
APPLY_CACHE_DEFAULT = True


def use_full(a) -> bool:
    if getattr(a, "full", False):
        return True
    if getattr(a, "cache", False):
        return False
    return not APPLY_CACHE_DEFAULT


def replay_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="wb.py replay", description="a scene's log as a layout")
    ap.add_argument("--scene", required=True, help="scene name or .json path")
    ap.add_argument("--out", type=Path, required=True)
    return ap


def run_replay(argv) -> int:
    from workbench import layout
    a = replay_parser().parse_args(argv)
    scene = open_scene(a.scene)
    doc = layout.replay(scene, parser())
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(doc, indent=1) + "\n")
    _emit({"layout": str(a.out), "placeId": doc["placeId"], "ops": len(doc["ops"])})
    return 0


#: layout-only keys on an op (method review r3 finding G): never CLI arguments.
#: `ownerOk` (true, or the walk that accepted it, "walk-3") marks an op the
#: owner called right on a walk; `cause` says why an accepted op changed.
LAYOUT_META_KEYS = ("ownerOk", "cause")


def strip_op_meta(op: dict) -> dict:
    """The op as its command reads it (and as the op cache keys it): the
    layout-only keys dropped, so marking an op ownerOk re-derives nothing."""
    return {k: v for k, v in op.items() if k not in LAYOUT_META_KEYS}


def _ops_by_identity(ops: list) -> dict:
    """{(op, action, name, nth): op}: an op's identity across two versions
    of one layout (the nth op of that kind naming that piece)."""
    seen, out = {}, {}
    for op in ops:
        if not isinstance(op, dict):
            continue
        base = (str(op.get("op")), str(op.get("action") or ""),
                str(op.get("uid") or op.get("child") or op.get("id") or op.get("name") or ""))
        n = seen.get(base, 0)
        seen[base] = n + 1
        out[(*base, n)] = op
    return out


def owner_ok_failures(head_ops: list, ops: list) -> list[str]:
    """Every op the owner accepted in `head_ops` (`ownerOk` set) that `ops`
    changed (the layout-only keys aside), removed, or stripped of `ownerOk`
    without a new `cause` (one differing from the op's cause at HEAD)."""
    now = _ops_by_identity(ops)
    out = []
    for key, old in _ops_by_identity(head_ops).items():
        if not old.get("ownerOk"):
            continue
        kind, action, name, _ = key
        label = f"{kind}{' ' + action if action else ''} {name}".strip()
        new = now.get(key)
        if new is None:
            out.append(f"{label}: accepted by the owner (ownerOk {old['ownerOk']!r}) and removed "
                       "since HEAD; keep the op with a `cause` and remove the piece with a later "
                       "`remove` op")
            continue
        # a change, or the acceptance withdrawn, needs a cause written for
        # it: one left over from an earlier change (the same string as at
        # HEAD) is no cause (L12 review 2026-09-28)
        cause = str(new.get("cause") or "").strip()
        fresh = bool(cause) and cause != str(old.get("cause") or "").strip()
        changed = strip_op_meta(new) != strip_op_meta(old)
        if (changed or not new.get("ownerOk")) and not fresh:
            keys = sorted(k for k in set(strip_op_meta(new)) | set(strip_op_meta(old))
                          if new.get(k) != old.get(k)) or ["ownerOk"]
            what = "changed" if changed else "had its acceptance dropped"
            out.append(f"{label}: accepted by the owner (ownerOk {old['ownerOk']!r}) and {what} "
                       f"since HEAD ({', '.join(keys)}) without a new `cause`")
    return out


def owner_ok_rule(layout_path: Path) -> dict:
    """The `ownerOkRule` check (method review r3 finding G, deliver-L8 rec 4):
    the layout's ops against the same file at git HEAD, the last committed
    version the owner walked; skipped (no failures) when the layout lies
    outside the repo or HEAD has no copy of it."""
    import subprocess
    from workbench import layout, paths as wbpaths
    rel = layout.repo_path(layout_path)
    if Path(rel).is_absolute():
        return {"failures": [], "skipped": "the layout lies outside the repo"}
    got = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=wbpaths.REPO_ROOT,
                         capture_output=True, text=True)
    if got.returncode != 0:
        return {"failures": [], "skipped": f"HEAD has no {rel}"}
    try:
        head_ops = json.loads(got.stdout).get("ops") or []
    except ValueError:
        return {"failures": [], "skipped": f"HEAD's {rel} is not JSON"}
    ops = json.loads(Path(layout_path).read_text()).get("ops") or []
    return {"failures": owner_ok_failures(head_ops, ops), "baseline": "HEAD",
            "accepted": sum(1 for op in head_ops if isinstance(op, dict) and op.get("ownerOk"))}


#: 0105 R31: the op fields a site scan vouches for; a building op whose
#: fields differ from HEAD's needs a scan newer than HEAD covering its pose
SCAN_FIELDS = ("asset", "at", "yaw", "pad")


def _yaw_off(a: float, b: float) -> float:
    d = abs(float(a) - float(b)) % 360.0
    return min(d, 360.0 - d)


def scan_covers(building: dict, op: dict) -> bool:
    """Does one scan output building's grid hold the op's pose: the same
    asset, the op's plan point within the grid's radius (plus half a step)
    of its centre, its yaw within half the scanned yaw spacing of a scanned
    yaw."""
    if building.get("asset") != op.get("asset") or not building.get("centre"):
        return False
    (cx, cz), (x, z) = building["centre"], op["at"]
    reach = float(building.get("radius", 4.0)) + float(building.get("step", 1.0)) / 2.0
    if math.hypot(float(x) - cx, float(z) - cz) > reach + 1e-6:
        return False
    yaws = sorted(float(y) % 360.0 for y in (building.get("yaws") or []))
    if not yaws:
        return False                        # no grid recorded: no evidence of a yaw
    gaps = [(yaws[(i + 1) % len(yaws)] - yaws[i]) % 360.0 or 360.0 for i in range(len(yaws))]
    tol = max(0.5, min(gaps) / 2.0) if len(yaws) > 1 else 0.5
    return any(_yaw_off(op.get("yaw", 0.0), y) <= tol + 1e-6 for y in yaws)


def scan_fresh_failures(head_ops: list, ops: list, scans: list[dict], since: str | None) -> list[str]:
    """0105 R31 (method review r5 finding B): every building (a piece placed
    with a `pad`: it claims a site) whose end state (`whatchanged.piece_states`:
    the `place` op folded with every later `move` and `swap`) is new, or whose
    asset, pose or pad changed since HEAD, must lie on a site scan recorded
    after `since` (HEAD's commit of the layout; None when HEAD has no copy).
    `scans` are scan outputs ({at, buildings[]}); a brief names the need,
    the scan finds the site."""
    from workbench.whatchanged import piece_states
    old = piece_states(head_ops)
    fresh = [sc for sc in scans if since is None or str(sc.get("at") or "") > since]
    out = []
    for uid, st in piece_states(ops).items():
        if st["kind"] != "place" or st.get("pad") is None or not st.get("at"):
            continue
        prev = old.get(uid)
        if prev is not None and all(prev.get(k) == st.get(k) for k in ("asset", "at", "yaw", "pad")):
            continue
        pose = {"asset": st["asset"], "at": st["at"], "yaw": st["yaw"]}
        if any(scan_covers(b, pose) for sc in fresh for b in sc.get("buildings") or []):
            continue
        x, z = st["at"]
        out.append(f"{uid}: {'new' if prev is None else 'changed'} since HEAD "
                   f"({st['asset']} at [{x:.2f}, {z:.2f}] yaw {st['yaw']:.1f}) and no site scan "
                   f"newer than {since or 'the op'} covers that pose; scan it first "
                   f"(`wb.py <scene> scan`, 0105 R31)")
    return out


def scan_outputs(root: Path, place_id: str) -> list[dict]:
    """The place's site scan outputs: `scan*.json` under `<root>/<placeId>/`
    that `wb.py scan` wrote since R31 (they carry `at`, `placeId` and each
    building's grid); an older scan (no `at`, no yaws) is no evidence."""
    out = []
    base = Path(root) / place_id
    for path in sorted(base.rglob("scan*.json")) if base.is_dir() else []:
        try:
            doc = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if isinstance(doc, dict) and doc.get("at") and doc.get("placeId") == place_id:
            doc["_path"] = str(path)
            out.append(doc)
    return out


def scan_fresh_rule(layout_path: Path, root: Path | None = None) -> dict:
    """The `scanFreshRule` check: the layout's building ops against the same
    file at git HEAD, and the scans under the reports root."""
    import subprocess
    from workbench import layout, paths as wbpaths
    rel = layout.repo_path(layout_path)
    head_ops, since = [], None
    if not Path(rel).is_absolute():
        got = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=wbpaths.REPO_ROOT,
                             capture_output=True, text=True)
        if got.returncode == 0:
            try:
                head_ops = json.loads(got.stdout).get("ops") or []
            except ValueError:
                head_ops = []
            when = subprocess.run(["git", "log", "-1", "--format=%ct", "HEAD", "--", rel],
                                  cwd=wbpaths.REPO_ROOT, capture_output=True, text=True).stdout.strip()
            if when:
                since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(when)))
    doc = json.loads(Path(layout_path).read_text())
    ops = doc.get("ops") or []
    # the lane's own root and the place folders (a gates or trial run sets
    # WB_OUTPUT, yet the builder's scans live in the real round folders)
    roots = [root] if root else list(dict.fromkeys(
        [reports_root(), wbpaths.REPO_ROOT / "tooling" / ".reports" / "16k"]))
    scans = [sc for r in roots for sc in scan_outputs(r, doc.get("placeId") or "")]
    return {"failures": scan_fresh_failures(head_ops, ops, scans, since), "baseline": since or "none",
            "scans": len(scans)}


def apply_layout(layout_path: Path, scene_name: str | None = None, compile_: bool = True,
                 allow_stale_ground: bool = False, owner_guided: str | None = None,
                 full: bool = False, cat=None) -> dict:
    """`apply`: a fresh scene from the layout (0100 decision 2). Returns the
    summary, also written to output/apply/<placeId>.json. Each op whose
    inputs are unchanged since the last apply of this scene is restored from
    the scene's op cache (`workbench.opcache`) instead of re-derived;
    `full` re-derives every op. `cat`: a catalogue already loaded for this
    place (`wb.py round` loads it once)."""
    from workbench import ground, layout, opcache, paths as wbpaths
    t0 = time.time()
    doc = layout.load(layout_path)
    place_id, window = doc["placeId"], doc["window"]
    summary = {"schemaVersion": 1, "placeId": place_id, "layout": layout.repo_path(layout_path),
               "layoutSha256": layout.sha256(layout_path)}
    why = (owner_guided_refusal(place_id, owner_guided)
           or (None if allow_stale_ground else layout.stale_ground(place_id, window)))
    if why:
        summary.update({"refused": why, "elapsedS": round(time.time() - t0, 2)})
        return summary
    spath = layout.scene_path(scene_name or layout.default_scene_name(place_id))
    derived = wbpaths.OUTPUT / "apply" / f"{place_id}.blueprint.json"
    for stale in (spath, derived):      # derived state: never outlives its layout
        if stale.exists():
            stale.unlink()
    scene = Scene(path=spath, placeId=place_id,
                  layout={"path": layout.repo_path(layout_path),
                          "sha256": summary["layoutSha256"]})
    cat = place_catalogue(place_id) if cat is None else cat
    ap = parser()
    cx, cz = window["centreKm"][0] * 1000, window["centreKm"][1] * 1000
    half = float(window["halfM"])
    stem = wbpaths.OUTPUT / "ground" / f"{spath.stem}-{int(cx)}-{int(cz)}-{int(half)}"
    reused = layout._reusable_ground(stem, (cx, cz), half)
    if not reused:
        ground.extract((cx, cz), half, stem)
    scene.groundStem = str(stem)
    scene.log.append(shlex.join(["window", "--centre-km", repr(float(window["centreKm"][0])),
                                 repr(float(window["centreKm"][1])), "--half", repr(half),
                                 "--place-id", place_id]))
    summary.update({"scene": str(spath), "groundReused": reused,
                    "groundS": round(time.time() - t0, 2)})
    ops, failed = [], None
    store = opcache.Store(opcache.cache_dir(spath) / "ops.json", enabled=not full)
    gkey = opcache.global_key(place_id, scene.groundStem)
    t_ops = time.time()
    env = None                      # the pad/run overlay key, recomputed only when touched
    # WB_OPCACHE_VERIFY=1: every hit is also run fresh and compared with the
    # stored entry; a difference fails the apply (the op cache's assumption
    # that an op changes only the pieces it names or adds, broken)
    verify = os.environ.get("WB_OPCACHE_VERIFY") == "1"
    verified = 0
    for i, op in enumerate(doc["ops"]):
        t1 = time.time()
        op = strip_op_meta(op)
        if env is None and op.get("op") not in opcache.GROUNDLESS:
            env = opcache.env_key(cat, scene)
        key = opcache.op_key(cat, scene, op, gkey, env)
        hit = store.get(key)
        if hit is not None and not verify:
            opcache.restore(scene, hit["diff"])
            if opcache.touches_env(scene, hit["diff"]):
                env = None
            scene.log.extend(hit["log"])
            ops.append({"index": i, "op": hit["cmd"], "uid": op.get("uid") or op.get("child")
                        or op.get("id") or op.get("name"), "s": round(time.time() - t1, 3),
                        "warnings": hit["warnings"], "cached": True})
            continue
        before_order = [p.uid for p in scene.pieces]
        before = opcache.touched(scene, op)
        before_paths = json.loads(json.dumps(scene.paths)) if op.get("op") == "path" else scene.paths
        log_at = len(scene.log)
        try:
            argv = layout.op_to_argv(op, ap)
            ns = ap.parse_args(["-", *argv])
            out = globals()[f"cmd_{ns.cmd}"](ns, scene, cat)
        except (Exception, SystemExit) as err:    # argparse exits on a bad value
            failed = {"index": i, "op": op, "error": f"{type(err).__name__}: {err}"}
            break
        scene.log.append(shlex.join(argv))
        warnings = layout._warnings(out)
        delta = opcache.diff(before_order, before, scene, before_paths)
        if hit is not None:
            fresh = {"cmd": ns.cmd, "log": scene.log[log_at:], "warnings": warnings, "diff": delta}
            if opcache.plain(fresh) != opcache.plain({k: hit.get(k) for k in fresh}):
                failed = {"index": i, "op": op, "error": "WB_OPCACHE_VERIFY: the op cache's entry "
                          "differs from the op run fresh (" + ", ".join(
                              k for k in fresh if opcache.plain(fresh[k]) != opcache.plain(hit.get(k)))
                          + "); run apply --full and report the op"}
                break
            verified += 1
        if delta is None or opcache.touches_env(scene, delta):
            env = None
        if delta is not None:
            store.put(key, {"uid": op.get("uid") or op.get("child"), "cmd": ns.cmd,
                            "log": scene.log[log_at:], "warnings": warnings, "diff": delta})
        ops.append({"index": i, "op": ns.cmd, "uid": op.get("uid") or op.get("child")
                    or op.get("id") or op.get("name"), "s": round(time.time() - t1, 3),
                    "warnings": warnings})
    store.save()
    summary["opCache"] = {"restored": sum(1 for o in ops if o.get("cached")),
                          "derived": sum(1 for o in ops if not o.get("cached")),
                          "full": full, "s": round(time.time() - t_ops, 2),
                          **({"verified": verified} if verify else {})}
    if failed is None:
        t1 = time.time()
        moves = reseat_after_pads(cat, scene)
        summary["reseat"] = {"moved": len(moves), "maxAbsDyM": round(max(
            (abs(m["dyM"]) for m in moves), default=0.0), 4), "s": round(time.time() - t1, 2),
            "moves": moves}
    scene.save()
    summary.update({"opsRun": len(ops), "opsTotal": len(doc["ops"]), "ops": ops,
                    "failed": failed})
    if failed is None:
        # 16k r8 rule 5: compile first, then the compiled ring joins the scene
        # so check and walkRule judge it with everything else
        src = wbpaths.BLUEPRINTS / f"{place_id}.json"
        if compile_ and src.exists():
            t1 = time.time()
            got = compile_scene(scene, src, keep=derived,
                                keep_out=wbpaths.OUTPUT / "apply" / f"{place_id}.compiled",
                                cat=cat, use_cache=not full)
            got["s"] = round(time.time() - t1, 2)
            summary["compile"] = got
            if got.get("settlement"):
                ring = load_ring(scene, json.loads(Path(got["settlement"]).read_text()))
                summary["ring"] = {"pieces": len(ring), "settlement": got["settlement"]}
                scene.save()
            else:
                summary["ring"] = {"skipped": "the compile wrote no settlement "
                                              f"({got.get('stage') or 'exit ' + str(got.get('exitCode'))})"}
        elif compile_:
            summary["compile"] = {"skipped": f"no blueprint {src}"}
        t1 = time.time()
        stats = {}
        check = check_scene(cat, scene, use_cache=not full, stats=stats)
        check["ownerOk"] = owner_ok_rule(layout_path)
        check["scanFresh"] = scan_fresh_rule(layout_path)
        summary["check"] = {"failures": layout.check_failures(check),
                            "pieces": len(check["pieces"]), "nearPairs": len(check["nearPairs"]),
                            "doors": len(check["doors"]), "s": round(time.time() - t1, 2),
                            "pool": stats, "full": check}
    summary["elapsedS"] = round(time.time() - t0, 2)
    # the cache-staleness guard `export --write` reads (`derived_by_full`)
    side = opcache.cache_dir(spath).parent / "derived.json"
    side.parent.mkdir(parents=True, exist_ok=True)
    restored = (summary.get("opCache") or {}).get("restored", 0)
    side.write_text(json.dumps({"full": bool(full) or restored == 0,
                                "opsRestored": restored, "layoutSha256": summary["layoutSha256"],
                                "failed": failed is not None}) + "\n")
    out = wbpaths.OUTPUT / "apply" / f"{place_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=1, default=lambda o: round(float(o), 4)) + "\n")
    summary["summaryPath"] = str(out)
    return summary


def digest(summary: dict) -> list[str]:
    """At most 20 lines for the agent; the file holds everything."""
    if summary.get("refused"):
        return [f"apply {summary['placeId']}: REFUSED", summary["refused"]]
    oc = summary.get("opCache") or {}
    lines = [f"apply {summary['placeId']}: {summary['opsRun']}/{summary['opsTotal']} ops "
             f"({oc.get('restored', 0)} restored from the op cache), "
             f"{summary['elapsedS']} s (ground {'reused' if summary['groundReused'] else 'extracted'}"
             f" {summary['groundS']} s); scene {summary['scene']}"]
    f = summary.get("failed")
    if f:
        lines.append(f"FAILED at op {f['index']} ({f['op'].get('op')} "
                     f"{f['op'].get('uid') or f['op'].get('child') or ''}): {f['error']}"[:300])
    warned = [(o["index"], w) for o in summary["ops"] for w in o["warnings"]]
    if warned:
        lines.append(f"op warnings: {len(warned)}")
        lines += [f"  op {i}: {w}"[:200] for i, w in warned[:3]]
    c = summary.get("check")
    if c:
        lines.append(f"check: {c['pieces']} pieces, {c['nearPairs']} near pairs, {c['doors']} "
                     f"doors; {len(c['failures'])} failures"
                     + (f"; {len(c['full']['info'])} info" if (c.get("full") or {}).get("info") else ""))
        lines += [f"  {x}"[:200] for x in c["failures"][:5]]
    comp = summary.get("compile")
    if comp:
        if "skipped" in comp or "stage" in comp:
            lines.append(f"compile: {comp.get('skipped') or comp['stage'] + ' failed'}")
        else:
            lines.append(f"compile: exit {comp['exitCode']}, {len(comp['errors'])} errors, "
                         f"{len(comp['warnings'])} warnings, {comp['s']} s; {comp['summary']}")
            lines += [f"  {e['msg']}"[:200] for e in comp["errors"][:3]]
    lines.append(f"summary: {summary['summaryPath']}")
    return lines[:20]


def run_apply(argv) -> int:
    a = apply_parser().parse_args(argv)
    summary = apply_layout(a.layout, a.scene, not a.no_compile, a.allow_stale_ground,
                           a.owner_guided, full=use_full(a))
    if "summaryPath" not in summary:
        summary["summaryPath"] = "(not written: refused)"
    print("\n".join(digest(summary)))
    if summary.get("refused"):
        return 2
    comp = summary.get("compile") or {}
    return 1 if summary.get("failed") or comp.get("exitCode") or comp.get("stage") else 0


def round_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="wb.py round", description="apply + check + compile + walktable + render "
        "--shots auto in ONE process; one summary JSON (output/apply/<scene>/summary.json)")
    ap.add_argument("args", nargs="+", metavar="[SCENE] LAYOUT",
                    help="the layout file, optionally after a scene name")
    ap.add_argument("--no-shots", action="store_true", help="skip the render round")
    ap.add_argument("--plan", action="store_true",
                    help="the 2D plan render only (worldgen.render_blueprint --layout), no Blender")
    ap.add_argument("--labels", action="store_true",
                    help="text on the plan and the shots (ids, bearings, ground deltas, "
                         "captions); default none but the scale bar and north arrow (R8)")
    ap.add_argument("--walktable", action="store_true",
                    help="also print the owner-walk table (read from the PUBLISHED bundle: "
                         "only after the place is published)")
    ap.add_argument("--shots", default="auto", help="the render round's list (default auto)")
    ap.add_argument("--res", type=int, default=1024)
    ap.add_argument("--samples", type=int, default=12)
    ap.add_argument("--no-compile", action="store_true")
    ap.add_argument("--full", action="store_true", help="re-derive every op and pair")
    ap.add_argument("--cache", action="store_true", help="restore unchanged ops from the op cache")
    ap.add_argument("--allow-stale-ground", action="store_true")
    ap.add_argument("--owner-guided", default=None, metavar="REASON")
    ap.add_argument("--report-dir", type=Path, default=None,
                    help="the round's folder: summary.json and this round's rounds.jsonl row "
                         "are copied here (default: the place's current round folder, "
                         "`default_report_dir`)")
    ap.add_argument("--waiting-on", nargs="+", default=None, metavar="TASK[=RULE]",
                    help="the tooling-lane tasks this round waits on, each with the rule it "
                         "will add: written to waiting-on.json in the report folder (merged "
                         "with the rows already there)")
    return ap


def reports_root() -> Path:
    """Where the place folders live: `WB_REPORTS`; else, in a lane with its
    own `WB_OUTPUT`, `<WB_OUTPUT>/reports` (a trial never writes the place's
    real round folders); else tooling/.reports/16k."""
    from workbench import paths as wbpaths
    if os.environ.get("WB_REPORTS"):
        return Path(os.environ["WB_REPORTS"])
    if os.environ.get("WB_OUTPUT"):
        return Path(os.environ["WB_OUTPUT"]) / "reports"
    return wbpaths.REPO_ROOT / "tooling" / ".reports" / "16k"


def default_report_dir(place_id: str, root: Path | None = None) -> Path:
    """The place's current round folder, `<root>/<placeId>/round-N/`: the
    highest round-N that holds no summary.json yet (the builder may have put
    the scan output or the fix list there first), else round-(N+1)."""
    base = (root or reports_root()) / place_id
    rounds = sorted((int(d.name.split("-", 1)[1]), d) for d in base.glob("round-*")
                    if d.is_dir() and d.name.split("-", 1)[1].isdigit())
    if rounds and not (rounds[-1][1] / "summary.json").exists():
        return rounds[-1][1]
    return base / f"round-{rounds[-1][0] + 1 if rounds else 1}"


def write_waiting_on(report_dir: Path, place_id: str, tasks: list[str]) -> Path:
    """waiting-on.json in the round folder (schemaVersion 1, place, waitingOn
    [{task, rule?, file?}], and any hand-written keys kept): a task named
    again replaces its row's rule only when one is given; `file` is the
    task's report `<task>.md` when the place folder holds one."""
    path = report_dir / "waiting-on.json"
    doc = json.loads(path.read_text()) if path.exists() else {}
    doc = {"schemaVersion": 1, "place": place_id, **doc}
    rows = list(doc.get("waitingOn") or [])
    for item in tasks:
        task, _, rule = item.partition("=")
        task = task.strip()
        row = next((r for r in rows if r.get("task") == task), None)
        if row is None:
            row = {"task": task}
            rows.append(row)
        if rule.strip():
            row["rule"] = rule.strip()
        report = report_dir.parent / f"{task}.md"
        if report.exists() and "file" not in row:
            row["file"] = report.name
    doc["waitingOn"] = rows
    report_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    return path


def round_summary(apply: dict) -> dict:
    """What the reader or editor acts on, from an apply summary: every check
    failure grouped by rule (count, the rule's fix hint, the uids) and by uid
    (its failures), the compile's errors and warnings."""
    from workbench import layout, rules
    c = apply.get("check") or {}
    rows = layout.check_failure_rows(c["full"]) if c.get("full") else []
    by_rule, by_uid = {}, {}
    for r in rows:
        g = by_rule.setdefault(r["rule"], {"count": 0, "fixHint": rules.FIX_HINTS.get(r["rule"]),
                                           "uids": [], "failures": []})
        g["count"] += 1
        g["failures"].append(r["text"])
        for u in r["uids"] or ["(place)"]:
            if u not in g["uids"]:
                g["uids"].append(u)
            by_uid.setdefault(u, []).append({"rule": r["rule"], "text": r["text"]})
    comp = apply.get("compile") or {}
    return {"failures": len(rows),
            "byRule": dict(sorted(by_rule.items(), key=lambda kv: -kv[1]["count"])),
            "byUid": dict(sorted(by_uid.items(), key=lambda kv: (-len(kv[1]), kv[0]))),
            "info": (c.get("full") or {}).get("info", []),
            "compile": {k: comp.get(k) for k in ("exitCode", "summary", "errors", "warnings",
                                                  "stage", "failed", "skipped", "s")
                        if k in comp}}


def write_ledger(path: Path, out: dict, report_dir: Path | None = None) -> None:
    """A round's ledger row: appended to the scene's `rounds.jsonl` beside
    its summary (`path`), and with `report_dir`, the summary copied there
    and the same ONE row appended to that folder's own `rounds.jsonl`."""
    t = out["timings"]
    row = json.dumps({
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "placeId": out.get("placeId"),
        "layoutSha256": out.get("layoutSha256"), "failures": out.get("failures"),
        "compileErrors": len((out.get("compile") or {}).get("errors") or []),
        "loadS": t.get("loadS"), "applyOpsS": (t.get("ops") or {}).get("s"),
        "opsRestored": (t.get("ops") or {}).get("restored"), "checkS": t.get("checkS"),
        "compileS": t.get("compileS"), "planS": t.get("planS"), "shotsS": t.get("shotsS"),
        "totalS": t.get("totalS")}) + "\n"
    with (path.parent / "rounds.jsonl").open("a") as log:      # one line per round
        log.write(row)
    if report_dir is not None:
        # the report folder gets THIS round's summary and THIS round's ledger
        # row only (a copy of the scene's whole rounds.jsonl repeated every
        # earlier round, so a ledger over report folders double counted)
        import shutil
        report_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy(path, report_dir / path.name)
        with (report_dir / "rounds.jsonl").open("a") as log:
            log.write(row)


def run_round(argv) -> int:
    """`wb.py round [SCENE] LAYOUT`: one process, the catalogue, ground,
    survey, road paint and kit records loaded once; writes
    output/apply/<scene>/summary.json and prints a digest."""
    import contextlib
    import io
    from workbench import layout, paths as wbpaths
    a = round_parser().parse_args(argv)
    if len(a.args) > 2:
        raise SystemExit("wb.py round [SCENE] LAYOUT")
    scene_name, layout_path = (a.args if len(a.args) == 2 else (None, a.args[0]))
    t0 = time.time()
    doc = layout.load(Path(layout_path))
    cat = place_catalogue(doc["placeId"])
    t_load = round(time.time() - t0, 2)
    applied = apply_layout(Path(layout_path), scene_name, not a.no_compile, a.allow_stale_ground,
                           a.owner_guided, full=use_full(a), cat=cat)
    spath = Path(applied.get("scene") or layout.scene_path(
        scene_name or layout.default_scene_name(doc["placeId"])))
    out = {"schemaVersion": 1, "placeId": doc["placeId"], "layout": applied.get("layout"),
           "layoutSha256": applied.get("layoutSha256"), "scene": applied.get("scene"),
           "applySummary": applied.get("summaryPath")}
    if applied.get("refused"):
        out["refused"] = applied["refused"]
    out["timings"] = {"loadS": t_load, "groundS": applied.get("groundS"),
                      "ops": applied.get("opCache"), "reseatS": (applied.get("reseat") or {}).get("s"),
                      "compileS": (applied.get("compile") or {}).get("s"),
                      "checkS": (applied.get("check") or {}).get("s"),
                      "checkPool": (applied.get("check") or {}).get("pool")}
    out["failedOp"] = applied.get("failed")
    out["opWarnings"] = [{"index": o["index"], "uid": o["uid"], "warnings": o["warnings"]}
                         for o in applied.get("ops", []) if o["warnings"]]
    out.update(round_summary(applied))
    if not applied.get("refused") and not applied.get("failed"):
        if a.walktable:
            t1 = time.time()
            buf = io.StringIO()
            try:
                with contextlib.redirect_stdout(buf):
                    meta = cmd_walktable(argparse.Namespace(place=doc["placeId"]), None, cat)
                out["walktable"] = {**meta, "table": buf.getvalue().splitlines()}
            except StopIteration:
                out["walktable"] = {"skipped": f"{doc['placeId']} is not in the published "
                                               "bundle (publish the place first)"}
            out["timings"]["walktableS"] = round(time.time() - t1, 2)
        else:
            out["walktable"] = {"skipped": "not asked (--walktable, after publish)"}
        if a.plan:
            t1 = time.time()
            plan_dir = wbpaths.OUTPUT / "plan" / spath.stem
            # the blueprint this apply derived (what `--layout` resolves to,
            # read from this run's OUTPUT so WB_OUTPUT lanes see their own)
            derived = wbpaths.OUTPUT / "apply" / f"{doc['placeId']}.blueprint.json"
            got = _run_module("worldgen.render_blueprint", "--blueprint", str(derived), "--plan",
                              "--out", str(plan_dir), *(["--labels"] if a.labels else []))
            out["plan"] = {"exitCode": got.returncode, "dir": str(plan_dir),
                           "pngs": sorted(str(f) for f in plan_dir.glob("*.png")),
                           "log": (got.stdout + got.stderr).strip().splitlines()[-5:]}
            out["timings"]["planS"] = round(time.time() - t1, 2)
            out["shots"] = {"skipped": "--plan"}
        elif not a.no_shots:
            t1 = time.time()
            scene = Scene.load(spath)
            try:
                got = cmd_render(argparse.Namespace(shots=a.shots, res=a.res, samples=a.samples,
                                                    labels=a.labels),
                                 scene, cat)
                out["shots"] = got
            except Exception as err:          # noqa: BLE001 - the summary names it
                out["shots"] = {"error": f"{type(err).__name__}: {err}"}
            out["timings"]["shotsS"] = round(time.time() - t1, 2)
        else:
            out["shots"] = {"skipped": "--no-shots"}
    out["timings"]["totalS"] = round(time.time() - t0, 2)
    path = wbpaths.OUTPUT / "apply" / spath.stem / "summary.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=1, default=lambda o: round(float(o), 4)) + "\n")
    report_dir = a.report_dir or default_report_dir(doc["placeId"])
    write_ledger(path, out, report_dir)
    if a.waiting_on:
        write_waiting_on(report_dir, doc["placeId"], a.waiting_on)
    lines = digest(applied) if "summaryPath" in applied else [f"round: REFUSED {out.get('refused')}"]
    lines = [x for x in lines if not x.startswith("summary:")]
    lines.append("by rule: " + ", ".join(f"{k} {v['count']}" for k, v in out["byRule"].items()))
    if isinstance(out.get("shots"), dict) and out["shots"].get("error"):
        lines.append(f"shots: {out['shots']['error']}"[:200])
    lines.append(f"round summary: {path} (copied to {report_dir})")
    print("\n".join(lines))
    comp = applied.get("compile") or {}
    if applied.get("refused"):
        return 2
    return 1 if applied.get("failed") or comp.get("exitCode") or comp.get("stage") else 0


def open_scene(name: str, cmd: str | None = None) -> Scene:
    """The scene a command names: a bare NAME is output/scenes/NAME.json
    (`layout.scene_path`, as `round` and `apply` resolve it), a .json or a
    path is taken as given. A missing scene is an error (a bare name once
    opened an empty scene in the cwd and wrote stray files there); only
    `window`, which starts a scene, may name a new one."""
    from workbench import layout
    path = layout.scene_path(name)
    if not path.exists() and cmd != "window":
        raise SystemExit(f"wb.py: no scene {name!r} (looked for {path}); start one with "
                         f"`wb.py {name} window ...` or `wb.py apply LAYOUT --scene {name}`")
    return Scene.load(path)


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args and args[0] == "-" and len(args) > 1 and args[1] in TOP_LEVEL:
        args = args[1:]
    if args and args[0] in TOP_LEVEL:
        t0 = time.time()
        code = TOP_LEVEL[args[0]](args[1:])
        print(f"[wb] {args[0]} {time.time() - t0:.2f} s", file=sys.stderr)
        return code
    a = parser().parse_args(argv)
    t0 = time.time()
    scene = open_scene(a.scene, a.cmd) if a.scene != "-" else None
    cat = place_catalogue(scene.placeId if scene is not None else "")
    out = globals()[f"cmd_{a.cmd}"](a, scene, cat)
    if scene is not None and a.cmd not in READ_ONLY:
        scene.log.append(shlex.join(sys.argv[2:] if argv is None else argv[1:]))
        scene.save()
    _emit(out)
    print(f"[wb] {a.cmd} {time.time() - t0:.2f} s", file=sys.stderr)
    return 0


def bpy_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="wb.py bpy", description=(
        "headless Blender with the whole scene loaded (pieces named by uid, 'ground', "
        "'water'), running SCRIPT with workbench/bpy_api.py importable; api.RESULT -> --out"))
    ap.add_argument("scene")
    ap.add_argument("script")
    ap.add_argument("--out", required=True, help="the JSON the script's api.RESULT is written to")
    ap.add_argument("--only", default=None, help="load only these uids (comma list)")
    ap.add_argument("--args", nargs=argparse.REMAINDER, default=[],
                    help="everything after is the script's api.ARGS")
    return ap


def run_bpy(argv) -> int:
    from workbench import bpy_run
    a = bpy_parser().parse_args(argv)
    scene = open_scene(a.scene)
    cat = place_catalogue(scene.placeId)
    only = set(a.only.split(",")) if a.only else None
    _emit(bpy_run.run(cat, scene, Path(a.script), Path(a.out), a.args, only))
    return 0


def edit_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="wb.py edit", description="edit a layout op by piece id (no inline python): "
        "the first op naming UID (as uid, child or name), or the --op kind's")
    ap.add_argument("layout", type=Path)
    ap.add_argument("--uid", required=True)
    ap.add_argument("--op", default=None, help="the op kind to edit (place, move, snap, bind..)")
    ap.add_argument("--set", nargs="*", default=[], metavar="KEY=VALUE",
                    help="VALUE is JSON when it parses (at=[1,2], yaw=90, settle=true), else a "
                         "string; a dotted KEY reaches into a dict (pad.apronM=1.5)")
    ap.add_argument("--unset", nargs="*", default=[], metavar="KEY")
    return ap


def edit_layout(path: Path, uid: str, op_kind: str | None, sets: list, unsets: list) -> dict:
    text = path.read_text()
    doc = json.loads(text)
    hits = [k for k, o in enumerate(doc["ops"])
            if uid in (o.get("uid"), o.get("child"), o.get("name"))
            and (op_kind is None or o.get("op") == op_kind)]
    if not hits:
        raise ValueError(f"no op names {uid!r}" + (f" as a {op_kind}" if op_kind else ""))
    k = hits[0]
    op, before = doc["ops"][k], json.loads(json.dumps(doc["ops"][k]))

    def walk(key: str, create: bool):
        parts, node = key.split("."), op
        for part in parts[:-1]:
            if not isinstance(node.get(part), dict):
                if not create:
                    return None, parts[-1]
                node[part] = {}
            node = node[part]
        return node, parts[-1]
    for item in sets:
        if "=" not in item:
            raise ValueError(f"--set {item!r}: KEY=VALUE")
        key, raw = item.split("=", 1)
        try:
            value = json.loads(raw)
        except ValueError:
            value = raw
        node, leaf = walk(key, True)
        node[leaf] = value
    for key in unsets:
        node, leaf = walk(key, False)
        if node is not None:
            node.pop(leaf, None)
    ensure_ascii = text.isascii()                      # keep the file's own form
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=ensure_ascii)
                    + ("\n" if text.endswith("\n") else ""))
    return {"layout": str(path), "index": k, "otherOpsNamingIt": hits[1:], "before": before,
            "after": op}


def run_edit(argv) -> int:
    a = edit_parser().parse_args(argv)
    _emit(edit_layout(a.layout, a.uid, a.op, a.set, a.unset))
    return 0


def run_whatchanged(argv) -> int:
    """`wb.py whatchanged LAYOUT [--base REV]`: the packet's "What changed"
    lines from the layout diff, named from the kit manifests (0105 R35)."""
    from workbench import paths as wbpaths, whatchanged as wc
    ap = argparse.ArgumentParser(prog="wb.py whatchanged")
    ap.add_argument("layout", type=Path)
    ap.add_argument("--base", default="HEAD", help="the revision the owner walked (default HEAD)")
    a = ap.parse_args(argv)
    ops = json.loads(a.layout.read_text()).get("ops") or []
    names = wc.manifest_names(wbpaths.REPO_ROOT / "apps" / "world-studio" / "public" / "kits")
    got = wc.changes(wc.head_ops(a.layout, wbpaths.REPO_ROOT, a.base), ops, names)
    for line in got["lines"]:
        print(f"- {line}")
    if got["unnamed"]:
        print(f"unnamed (no manifest displayName; name them before the packet): {len(got['unnamed'])}",
              file=sys.stderr)
    return 0


TOP_LEVEL = {"apply": run_apply, "replay": run_replay, "round": run_round, "edit": run_edit,
             "bpy": run_bpy,
             "whatchanged": run_whatchanged}


if __name__ == "__main__":
    raise SystemExit(main())
