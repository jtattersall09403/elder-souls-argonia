#!/usr/bin/env python3
"""The placement workbench CLI. One command per call; the scene file is the
whole state. Prints JSON on stdout and a timing line on stderr.

    wb.py SCENE window --centre-km E S --half 150
    wb.py SCENE place UID ASSET --at X Z [--km] [--yaw D] [--settle]
    wb.py SCENE move UID [--dx M] [--dz M] [--forward M] [--right M] [--dy M]
                         [--yaw D | --turn D] [--resettle]
    wb.py SCENE settle UID [--source chunks|survey]
    wb.py SCENE snap CHILD CHILD_FACE PARENT PARENT_FACE [--by geometry|evidence]
                     [--lateral M] [--keep-yaw] [--pick N]
    wb.py SCENE mount CHILD PARENT [--along M] [--point N]
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
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from workbench import measure, snap  # noqa: E402
from workbench.kits import Catalogue, fit_of  # noqa: E402
from workbench.scene import Piece, Scene, yaw_matrix  # noqa: E402

import numpy as np  # noqa: E402


def _emit(obj) -> None:
    print(json.dumps(obj, indent=1, default=lambda o: round(float(o), 4)))


def _settle(cat, scene, piece: Piece, source: str = "chunks") -> dict:
    """Seat the piece as the runtime does. A quay run is first slid along its
    own axis to the bank exactly as the compile slides it
    (`compile_settlement.anchor_quay_run`: the landward tip where the deck
    plane meets the ground), so the pose the workbench exports is the pose
    the compile places, not one it moves."""
    shift = _quay_anchor(cat, piece)
    if shift is not None:
        piece.x, piece.z = shift["x"], shift["z"]
    got = measure.seat(cat, scene.ground(), piece, source)
    piece.y = got["y"]
    piece.settledBy = f"settle:{got['mode']}:{source}"
    if shift is not None:
        got["quayShiftM"] = shift["shiftM"]
    return got


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
    x, z = (a.at[0] * 1000, a.at[1] * 1000) if a.km else a.at
    cat.row(a.asset)
    p = scene.add(Piece(uid=a.uid, asset=a.asset, x=x, z=z, yaw=a.yaw % 360.0, y=a.y,
                        scale=a.scale))
    out = {"placed": a.uid}
    if a.settle:
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
        return sorted(p.stem for p in assembly.PREFABS.glob("*.json"))
    if a.action == "save":
        return assembly.save_group(scene, a.name, a.uids, a.anchor or a.uids[0])
    made = assembly.place_group(scene, a.name, tuple(a.at), a.yaw, a.prefix, a.parcel)
    group = json.loads((assembly.PREFABS / f"{a.name}.json").read_text())
    anchor = scene.piece(a.prefix + group["anchor"]["uid"])
    _settle(cat, scene, anchor)
    assembly.lift_group(scene, a.name, a.prefix)
    for p in made:
        if p is not anchor and (p.role or {}).get("on") == "ground":
            _settle(cat, scene, p)
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
    g = scene.ground()
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
    poly = measure.footprint_province(cat, p)
    slope = g.footprint_max_slope_deg(poly)
    heights = [g.survey_height(x, z) for x, z in poly] + [g.survey_height(p.x, p.z)]
    delta = max(heights) - min(heights)
    fit = authored_fit or cs.record_ground_fit(row)
    slope_why = cs.fit_slope_failure({**row}, slope)
    if fit is None:
        limit = float("inf")
        delta_why = "no groundFit: the kit record names none, so the compile refuses the parcel"
    else:
        limit = cs.FIT_MAX[fit]
        delta_why = (None if delta <= limit else
                     f"survey delta {delta:.2f} m exceeds groundFit '{fit}' (max {limit:.2f} m)")
    out = {"maxSlopeDeg": round(slope, 2), "slopeRule": slope_why, "groundFit": fit,
           "surveyDeltaM": round(delta, 3),
           "deltaMaxM": None if math.isinf(limit) else limit, "deltaRule": delta_why}
    out.update(_sill(cat, g, p, row, cs))
    out["ok"] = slope_why is None and delta_why is None and out.get("sillRule") is None
    return out


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
    if fit == "stilt":
        sill = sum(max(0.0, g.depth(x, z)) for x, z in samples) / len(samples)
    else:
        heights = [g.survey_height(x, z) for x, z in samples]
        line = min(heights) if fit == "dug-in" else sum(heights) / len(heights)
        sill = abs(line - g.survey_height(p.x, p.z))
    return {"sillM": round(sill, 3), "sillMaxM": tpg.SILL_LIMIT_M,
            "sillRule": None if sill <= tpg.SILL_LIMIT_M else
            f"the ground line stands {sill:.2f} m off the ground at the pivot "
            f"(the yard gate allows {tpg.SILL_LIMIT_M} m)"}


def cmd_mount(a, scene, cat):
    child, parent = scene.piece(a.child), scene.piece(a.parent)
    got = snap.mount(child, parent, a.along, a.point)
    got["pose"] = {"x": child.x, "z": child.z, "yaw": child.yaw, "y": child.y}
    if child.y is not None:
        got["contact"] = measure.contact(cat, child, parent)
    return got


def cmd_measure(a, scene, cat):
    return measure.contact(cat, scene.piece(a.a), scene.piece(a.b))


def cmd_ground(a, scene, cat):
    g = scene.ground()
    if a.at:
        x, z = a.at
        return {"chunks": g.chunk_height(x, z), "survey": g.survey_height(x, z),
                "wet": g.wet(x, z), "waterLevelM": g.water_level(x, z)}
    return measure.ground_report(cat, g, scene.piece(a.uid))


def cmd_doors(a, scene, cat):
    reports = {p.uid: measure.door_report(cat, scene, p) for p in scene.pieces}
    return {uid: r for uid, r in reports.items() if r}


def cmd_check(a, scene, cat):
    """Every piece: seat vs its y, foot float, slope vs its fit's limit;
    every pair whose bounds come within 0.5 m: contact; every door: path."""
    from workbench import paths
    paths.bridge()
    from worldgen import compile_settlement as cs
    g = scene.ground()
    rows = {}
    for p in scene.pieces:
        row = cat.row(p.asset)
        r = {"asset": p.asset.rsplit("/", 1)[-1], "fit": fit_of(row),
             "anchorClass": row.get("anchorClass"), "settledBy": p.settledBy}
        mounted = ((p.settledBy or "").startswith(("mount:", "template:"))
                   or (p.role or {}).get("on") == "parent")
        if not mounted:
            seat = measure.seat(cat, g, p)
            r["runtimeY"] = round(seat["y"], 3)
            r["yOffRuntimeM"] = None if p.y is None else round(p.y - seat["y"], 3)
            if p.role.get("kind") != "run":
                # a run is judged by the compile on its union (`compile` command)
                r.update(_fit_rules(cat, g, p, cs, _authored_fit(scene, p)))
            if seat["mode"] != "water":
                poly = measure.footprint_province(cat, p)
                if p.role.get("kind") == "run":
                    slope = g.footprint_max_slope_deg(poly)
                    r["maxSlopeDeg"] = round(slope, 2)
                    r["slopeRule"] = cs.fit_slope_failure({**row}, slope)
                    r.update(_sill(cat, g, p, row, cs))
                r["deltaM"] = round(seat["deltaM"], 3)
                r["wetVertices"] = sum(g.wet(x, z) for x, z in poly)
        if p.y is not None and not mounted and (row.get("anchorClass") or "ground") != "water":
            r.update(measure.float_under(cat, g, p))
        if cs.is_quay_run(row):
            r["quayReach"] = _quay_reach(cat, scene, g, p, row, cs)
        elif (row.get("anchorClass") or "ground") == "water":
            r["hullWater"] = _hull_water(cat, g, p)
        if p.roll or p.mirror:
            r["notExportable"] = "roll / mirror: the runtime has neither"
        rows[p.uid] = r
    pairs = []
    boxes = {}
    for p in scene.pieces:
        if p.y is None:
            continue
        m = cat.mesh(p.asset)
        c = np.array([[x, y, z] for x in m.bounds[:, 0] for y in m.bounds[:, 1]
                      for z in m.bounds[:, 2]])
        w = p.world_points(c)
        boxes[p.uid] = (w.min(axis=0), w.max(axis=0))
    uids = list(boxes)
    for i, u in enumerate(uids):
        for v in uids[i + 1:]:
            (l1, h1), (l2, h2) = boxes[u], boxes[v]
            if np.all(l1 <= h2 + 0.5) and np.all(l2 <= h1 + 0.5):
                a_, b_ = scene.piece(u), scene.piece(v)
                got = measure.contact(cat, a_, b_)
                got.update(_pair_verdict(a_, b_, got))
                pairs.append(got)
    doors = cmd_doors(a, scene, cat)
    return {"pieces": rows, "nearPairs": pairs, "doors": doors}


JOINT_GAP_M = 0.03           # a run joint: the miner's contact (0097 rule 3)
JOINT_PENETRATION_M = 0.05


def _pair_verdict(a: Piece, b: Piece, got: dict) -> dict:
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
                    and (parent.role or {}).get("id") == role.get("id")))
    ra, rb = a.role or {}, b.role or {}
    if on(a, b) or on(b, a):
        return {"relation": "mounted", "ok": bool(got["contact"])}
    snapped = any((x.settledBy or "") in (f"evidence-snap:{y.uid}", f"geometry-snap:{y.uid}")
                  for x, y in ((a, b), (b, a)))
    if snapped or (ra.get("kind") == rb.get("kind") == "run" and ra.get("id") == rb.get("id")
                   and abs(int(ra.get("index", -9)) - int(rb.get("index", -9))) == 1):
        return {"relation": "run-joint",
                "ok": got["gapM"] <= JOINT_GAP_M and (got["penetrationM"] or 0.0) <= JOINT_PENETRATION_M}
    return {"relation": "unrelated", "ok": not got["intersecting"]}


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
    if "mountedOn" in p.role:
        role["mountedOn"] = p.role["mountedOn"]
        role["mountPair"] = p.role.get("mountPair")
    p.role = role
    return {"uid": p.uid, "role": role}


def cmd_render(a, scene, cat):
    from workbench import render
    return render.render(cat, scene, a.view, a.focus, a.res, a.out, a.span, a.bearing, a.cut,
                         a.samples, a.highlight)


def cmd_export(a, scene, cat):
    from workbench import export
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
    g = scene.ground()
    row = cat.row(a.asset)
    water = (row.get("anchorClass") or "ground") == "water"
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
            rules = _fit_rules(cat, g, p, cs)
            if not rules["ok"]:
                continue
            if water:
                ring = _hull_water(cat, g, p)
                if ring["ok"]:
                    found.append({"at": [round(x, 2), round(z, 2)], "minDepthM": ring["minDepthM"],
                                  "maxSlopeDeg": rules["maxSlopeDeg"]})
                continue
            if any(g.wet(vx, vz) for vx, vz in poly):
                continue
            found.append({"at": [round(x, 2), round(z, 2)], "maxSlopeDeg": rules["maxSlopeDeg"],
                          "surveyDeltaM": rules["surveyDeltaM"], "sillM": rules.get("sillM")})
    found.sort(key=lambda f: (f["maxSlopeDeg"], f.get("surveyDeltaM", 0.0),
                              -f.get("minDepthM", 0.0)))
    return {"asset": a.asset, "yaw": a.yaw, "fit": fit_of(row), "legal": len(found),
            "best": found[:a.limit]}


def cmd_compile(a, scene, cat):
    """The real compile on the scene as it stands, without touching the
    blueprint: export into a temporary copy, run the settlement-build derive
    passes on it (twice: they feed each other) and `compile_settlement`, and
    return its errors and warnings, each with the scene pieces bound to the
    parcels, landmarks and routes it names. `check` measures contacts; this
    is the compile's verdict on the same poses, so the two never disagree."""
    import re
    import shutil
    import subprocess
    import tempfile
    from workbench import export, paths as wbpaths
    src = Path(a.blueprint) if a.blueprint else wbpaths.BLUEPRINTS / f"{scene.placeId}.json"
    tmp = Path(tempfile.mkdtemp(prefix="wb-compile-"))
    try:
        bp = tmp / src.name
        shutil.copy(src, bp)
        export.export(scene, bp, write=True)
        run = lambda *args: subprocess.run(  # noqa: E731
            [sys.executable, "-m", *args], cwd=wbpaths.WORLDGEN, capture_output=True, text=True)
        for _ in range(2):
            for args in (("worldgen.rederive_terminals", "--apply", str(bp)),
                         ("worldgen.street_router", "--apply", str(bp)),
                         ("worldgen.blueprint_footprints", "--apply", str(bp)),
                         ("worldgen.blueprint_footprints", "--areas", "--doors", str(bp))):
                got = run(*args)
                if got.returncode:
                    return {"stage": args[0], "failed": (got.stdout + got.stderr)[-2000:]}
        got = run("worldgen.compile_settlement", "--blueprint", str(bp), "--out", str(tmp))
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
            "errors": errors, "warnings": warnings, "fixtureWaived": len(waived)}


def cmd_walktable(a, scene, cat):
    """The owner-walk table for one place, read from the PUBLISHED bundle
    (settlement-build step 8: every item, every time)."""
    from workbench import paths
    import os
    bundle = json.loads((paths.PROVINCE / "settlements.json").read_text())
    site = next(s for s in bundle["settlements"] if s["id"] == a.place)
    ids = set(site["placementIds"])
    base = os.environ.get("ES_TUNNEL_URL", "<ES_TUNNEL_URL>")
    url = lambda e, s: f"{base}?view=character&x={e:.3f}&z={s:.3f}&t=12"
    xs = [p[0] for p in site["boundaryM"]]
    zs = [p[1] for p in site["boundaryM"]]
    rows = [("place centre (boundary box)", (min(xs) + max(xs)) / 2000,
             (min(zs) + max(zs)) / 2000, "anchor", "-", "-")]
    for p in sorted((p for p in bundle["placements"] if p["id"] in ids), key=lambda p: p["id"]):
        rows.append((p["id"].removeprefix(site["id"] + "."), p["positionM"][0] / 1000,
                     p["positionM"][2] / 1000, p["kind"], p["assetId"].rsplit("/", 1)[-1],
                     (p.get("anchor") or {}).get("groundFit", "-")))
    for d in sorted((d for d in bundle["doors"] if d["settlementId"] == site["id"]),
                    key=lambda d: d["id"]):
        rows.append((d["id"] + " threshold", d["thresholdM"][0] / 1000, d["thresholdM"][1] / 1000,
                     "door", d["parcelId"].rsplit(".", 1)[-1], f"facing {d['facingDeg']:.1f}"))
    table = ["item | E km | S km | kind | piece | fit | studio URL"]
    table += [f"{r[0]} | {r[1]:.3f} | {r[2]:.3f} | {r[3]} | {r[4]} | {r[5]} | {url(r[1], r[2])}"
              for r in rows]
    print("\n".join(table))
    return {"place": a.place, "placements": len(ids), "rows": len(rows)}


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
    s.add_argument("--scale", type=float, default=1.0)
    s.add_argument("--settle", action="store_true")
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
    s = sub.add_parser("measure")
    s.add_argument("a")
    s.add_argument("b")
    s = sub.add_parser("ground")
    s.add_argument("uid", nargs="?")
    s.add_argument("--at", type=float, nargs=2)
    sub.add_parser("doors")
    sub.add_parser("check")
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
    s = sub.add_parser("render")
    s.add_argument("view", choices=("top", "front", "side", "back", "iso", "turntable",
                                    "cutaway"))
    s.add_argument("--focus", nargs="*", default=[])
    s.add_argument("--highlight", nargs="*", default=[])
    s.add_argument("--res", type=int, default=1024)
    s.add_argument("--span", type=float, default=None)
    s.add_argument("--bearing", type=float, default=None)
    s.add_argument("--cut", type=float, default=0.0)
    s.add_argument("--samples", type=int, default=12)
    s.add_argument("--out", default=None)
    s = sub.add_parser("export")
    s.add_argument("blueprint")
    s.add_argument("--write", action="store_true")
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
             "compile"}


def main(argv=None) -> int:
    a = parser().parse_args(argv)
    t0 = time.time()
    scene = Scene.load(Path(a.scene)) if a.scene != "-" else None
    cat = Catalogue()
    out = globals()[f"cmd_{a.cmd}"](a, scene, cat)
    if scene is not None and a.cmd not in READ_ONLY:
        scene.log.append(" ".join(sys.argv[2:]) if argv is None else " ".join(argv[1:]))
        scene.save()
    _emit(out)
    print(f"[wb] {a.cmd} {time.time() - t0:.2f} s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
