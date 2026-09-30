"""16k fix 2 layout pre-step (interiors r8 (a)): a piece whose kit manifest
row carries ``placeUse: ruin-only`` (the upright KotM pod) is refused by the
``place`` op unless the op says ``--ruin``."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench.scene import Scene  # noqa: E402

POD = "kotm:argonia/mudhuts/smpodext02"


class _Cat:
    def __init__(self, row):
        self._row = row

    def row(self, asset_id):
        return self._row

    def placed_scale(self, asset_id):
        return 1.0


def test_a_ruin_only_piece_is_refused_outside_a_ruin(tmp_path):
    scene = Scene(path=tmp_path / "s.json", placeId="place.x")
    cat = _Cat({"id": POD, "placeUse": "ruin-only"})
    ns = wb.parser().parse_args(["-", "place", "pod", POD, "--at", "10", "20"])
    with pytest.raises(ValueError, match="ruin-only"):
        wb.cmd_place(ns, scene, cat)
    ns = wb.parser().parse_args(["-", "place", "pod", POD, "--at", "10", "20", "--ruin"])
    assert wb.cmd_place(ns, scene, cat) == {"placed": "pod"}
    plain = _Cat({"id": POD})
    ns = wb.parser().parse_args(["-", "place", "pod2", POD, "--at", "10", "20"])
    assert wb.cmd_place(ns, scene, plain) == {"placed": "pod2"}


def test_a_child_mounted_on_a_barrel_is_not_judged_as_mounted_on_its_shell():
    """16k fix 2 layout: a lantern bound to the barn's assembly `on: parent`
    but mounted on a barrel (`mountedOn`) is the barrel's child; beside the
    barn it is an unrelated neighbour, never a child of the barn with a gap."""
    from workbench.scene import Piece
    barn = Piece("b2", "x:barn", 0.0, 0.0, role={"kind": "parcel", "id": "p.barn"})
    barrel = Piece("b2-barrel", "x:barrel", 2.0, 0.0,
                   role={"kind": "assembly", "id": "p.barn", "on": "ground"})
    lamp = Piece("b2-lamp", "x:lamp", 2.0, 0.0,
                 role={"kind": "assembly", "id": "p.barn", "on": "parent", "mountedOn": "b2-barrel"})
    far = {"contact": False, "gapM": 0.5, "penetrationM": 0.0, "intersecting": False}
    assert wb._pair_verdict(barn, lamp, far) == {"relation": "unrelated", "ok": True}
    assert wb._pair_verdict(barrel, lamp, dict(far, contact=True))["relation"] == "mounted"


def test_the_house_pod_is_solid_at_its_ground_ring():
    """16k fix 2 ruling 3: the pod's footprint is its ring at the designed-
    sink plane (measure_footprints `groundPlaneM`), so a point 5 m from its
    pivot lies inside it and the free-pose search and walkRule cannot put a
    prop or a route there (r1: `site --free` offered poses inside the pod)."""
    from shapely.geometry import Point, Polygon
    from workbench import measure
    from workbench.kits import Catalogue
    from workbench.scene import Piece
    cat = Catalogue()
    try:
        cat.row("composite:mud/kotm-house-pod")
    except KeyError:
        pytest.skip("settlement-mud-v1 is not published")
    pod = Piece("b4", "composite:mud/kotm-house-pod", 100.0, 200.0)
    poly = Polygon(measure.footprint_province(cat, pod))
    assert poly.area > 100.0
    for dx, dz in ((5.0, 0.0), (0.0, 5.0), (-5.0, 0.0), (0.0, -5.0)):
        assert poly.contains(Point(100.0 + dx, 200.0 + dz))


def test_walk_routes_name_the_parcel_a_bound_door_opens(monkeypatch):
    """16k fix 2 ruling 4: the compile finds a door's route by its parcel."""
    from workbench import rules
    from workbench.scene import Piece
    scene = Scene(path=Path("/tmp/none.json"), placeId="place.x")
    scene.add(Piece("b2", "x:barn", 0.0, 0.0, role={"kind": "parcel", "id": "parcel.x.barn"}))
    monkeypatch.setattr(rules, "walk", lambda cat, sc, keep_points=True: {
        "stepM": 0.18, "targets": [
            {"id": "door:b2", "uid": "b2", "kind": "door", "bound": True, "ok": True,
             "points": [[0, 0, 0], [1, 0, 0]], "routeM": 1.0, "steepestDeg": 0.0,
             "largestStepM": 0.0, "deepestWadeM": 0.0},
            {"id": "door:b2.1", "uid": "b2", "kind": "door", "bound": False, "ok": True,
             "points": [[0, 0, 0], [1, 0, 0]], "routeM": 1.0, "steepestDeg": 0.0,
             "largestStepM": 0.0, "deepestWadeM": 0.0}]})
    monkeypatch.setattr(rules, "_polyline", lambda pts: pts)
    got = rules.walk_routes(None, scene)["routes"]
    assert got["door:b2"]["parcelId"] == "parcel.x.barn"
    assert "parcelId" not in got["door:b2.1"]


def test_a_pieces_own_plugin_pair_outranks_another_mods():
    """16k fix 2 r3 ruling 6: vanilla's fencewoven02 run step (2.14 m, 8
    placements) outranks BM&V Valenwood's reuse of the same piece (2.00 m,
    10 placements): the piece's own plugin says how its pieces join."""
    from workbench import snap
    fw2 = "vanilla:architecture/farmhouse/fencewoven02"
    steps = [s for s in snap.evidence_steps(fw2, fw2)
             if s["kind"] == "piece" and not s["foreign"] and s["joint"] == "run"
             and s["parentFace"] == "-x" and s["childFace"] == "+x"]
    assert steps and steps[0]["sourceSet"] == "vanilla"


def test_a_night_shot_carries_a_light_at_every_light_layer_piece():
    """16k fix 2 r3 ruling 3: `front:UID@night` renders the shot with a dark
    sky and a warm point light at every light-layer piece."""
    from workbench import render
    from workbench.scene import Piece
    scene = Scene(path=Path("/tmp/none.json"), placeId="place.x")
    scene.add(Piece("lamp", "x:lamp", 10.0, 20.0, 0.0, 5.0,
                    role={"kind": "assembly", "id": "p", "layer": "light"}))
    scene.add(Piece("sack", "x:sack", 11.0, 20.0, 0.0, 5.0,
                    role={"kind": "assembly", "id": "p", "layer": "clutter"}))

    class _C:
        def row(self, asset):
            return {"sizeM": [0.3, 0.3, 1.0], "originOffsetM": [0.15, 0.15, 0.0]}
    lights = render.night_lights(_C(), scene)
    assert len(lights) == 1
    x, y, z = lights[0]
    assert (x, y) == (10.0, -20.0) and 5.5 < z < 6.0
    class _H(_C):
        def row(self, asset):
            return {**super().row(asset), "anchorClass": "hanging"}
    (hx, hy, hz), = render.night_lights(_H(), scene)
    assert 5.2 < hz < 5.3            # the cage: the lower half's centre (r4 ruling 2)
    got = render.round_shots(_C(), scene, "top@night")
    assert got[0]["view"] == "top" and got[0]["night"] is True


def test_a_hanging_only_piece_is_never_stood_on_the_ground(tmp_path):
    """16k fix 2 r4 ruling 1: `argonianlanterns02` is a hanging cage lantern
    (its policy row `placeUse: hanging-only`); `place --settle` refuses it,
    a plain `place` (then `mount`) is allowed."""
    lamp = "mudmother:gv_meshes/argoniannest/argonianlanterns02"
    scene = Scene(path=tmp_path / "s.json", placeId="place.x")
    cat = _Cat({"id": lamp, "placeUse": "hanging-only"})
    ns = wb.parser().parse_args(["-", "place", "l", lamp, "--at", "10", "20", "--settle"])
    with pytest.raises(ValueError, match="hanging-only"):
        wb.cmd_place(ns, scene, cat)
    ns = wb.parser().parse_args(["-", "place", "l", lamp, "--at", "10", "20"])
    assert wb.cmd_place(ns, scene, cat) == {"placed": "l"}
    import json as _j
    pol = _j.loads((HERE.parents[1] / "asset-pipeline/pipeline/config/placement-policies.json")
                   .read_text())["assetPlacement"][lamp]
    assert pol["placeUse"] == "hanging-only"


def test_a_lifted_yard_member_follows_its_reseated_host_exactly_once(monkeypatch):
    """r4 review (CONFIRMED): `lift_group` members keep `group:<name>` and
    never followed their host when the pads reseated it; a lantern on a
    raised barrel ended buried. It follows once, never twice."""
    from workbench import pads
    from workbench.scene import Piece
    scene = Scene(path=Path("/tmp/none.json"), placeId="place.x")
    barrel = scene.add(Piece("b-barrel", "x:barrel", 0.0, 0.0, 0.0, 1.0,
                             settledBy="settle:streamed-origin:chunks"))
    lamp = scene.add(Piece("b-lamp", "x:lamp", 0.0, 0.0, 0.0, 2.0, settledBy="group:yard",
                           role={"kind": "assembly", "liftedOn": "b-barrel"}))
    monkeypatch.setattr(pads, "scene_pads", lambda cat, sc: {})

    def rise(cat, sc, p, source="chunks", declared_pads=None):
        p.y += 0.2
    monkeypatch.setattr(wb, "_settle", rise)
    out = wb.reseat_after_pads(None, scene)
    assert barrel.y == pytest.approx(1.2) and lamp.y == pytest.approx(2.2)
    assert [r["uid"] for r in out] == ["b-barrel", "b-lamp"]


def test_a_malformed_yard_set_fails_the_seat_rule_loudly(monkeypatch):
    """r4 review (CONFIRMED): `_set_members` swallowed every error and the
    spacing check passed on nothing."""
    from workbench import assembly, rules

    def broken():
        raise ValueError("yard set x: bad key")
    monkeypatch.setattr(assembly, "yard_sets", broken)
    with pytest.raises(ValueError, match="bad key"):
        rules._set_members(Scene(path=Path("/tmp/none.json")))


def test_a_set_member_matches_its_longest_uid(monkeypatch):
    """r4 review (PLAUSIBLE, fixed): members `pot` and `spit-pot` placed with
    prefix `b5-`: `b5-spit-pot` is `spit-pot`, not `pot`."""
    from workbench import assembly, rules
    from workbench.scene import Piece
    st = {"id": "s", "anchor": "pot", "members": [
        {"uid": "pot", "offsetM": [0, 0]}, {"uid": "spit-pot", "offsetM": [1, 0]}]}
    monkeypatch.setattr(assembly, "yard_sets", lambda: {"s": st})
    scene = Scene(path=Path("/tmp/none.json"))
    for uid in ("b5-pot", "b5-spit-pot"):
        p = scene.add(Piece(uid, "x:a", 0.0, 0.0, 0.0, 0.0))
        p.notes.append("from group s: upM None")
    got = rules._set_members(scene)
    assert got["b5-spit-pot"][1]["uid"] == "spit-pot" and got["b5-spit-pot"][2].uid == "b5-pot"


def test_the_walk_grid_arrays_equal_the_pointwise_samplers():
    """r4 review (CONFIRMED): WalkGrid filled its arrays with three scalar
    ground calls per 0.5 m cell. The vectorised samplers give the same
    numbers (pads included) and the grid uses them."""
    import numpy as np
    from workbench import pads
    from workbench.kits import Catalogue
    live = HERE.parent / "output" / "scenes" / "imperial-fringe-claywater-station-layout.json"
    if not live.exists():
        pytest.skip("the Claywater scene is not built here")
    scene = Scene.load(live)
    g = pads.ground_for(Catalogue(), scene, None)
    cx, cz = 300.0, 3005.0
    gx, gz = cx + np.arange(-40, 40) * 0.5, cz + np.arange(-40, 40) * 0.5
    X, Z = np.meshgrid(gx, gz)
    H = np.array([[g.chunk_height(x, z) for x in gx] for z in gz])
    L = np.array([[(g.water_level(x, z) if g.depth(x, z) > 0.0 else None) for x in gx]
                  for z in gz], dtype=float)
    assert np.allclose(g.chunk_heights(X, Z), H, atol=1e-9)
    assert np.allclose(g.water_levels_where_wet(X, Z), L, equal_nan=True)


def test_a_ring_piece_has_its_walktable_row():
    """r4 review (CONFIRMED): the compile's ring dressing is judged in the
    scene as `ring:<id>` pieces, but `bundle_uid` gave them no row, so a
    measured failure showed `-` in the owner's walktable."""
    from workbench import rules
    from workbench.scene import Piece
    scene = Scene(path=Path("/tmp/none.json"))
    scene.add(Piece("ring:parcel.a.dressing.1", "x:barrel", 0.0, 0.0, 0.0, 0.0,
                    role={"kind": "ring", "placementId": "place.x.parcel.a.dressing.1"}))
    assert rules.bundle_uid(scene, "place.x.parcel.a.dressing.1", "place.x") == \
        "ring:parcel.a.dressing.1"


def test_export_names_the_doors_each_route_reaches():
    """r4 review (planner ruling): every bound-door route carries the ids of
    the blueprint doors posed at that doorway (`export.tag_door_routes`)."""
    from workbench import export
    routes = {"routes": {"door:b2": {"parcelId": "parcel.x.barn"}, "door:b2.1": {},
                         "opening:well": {}}}
    doors = [{"id": "door.x.4", "parcelId": "parcel.x.barn"},
             {"id": "door.x.1", "parcelId": "parcel.x.house"}]
    export.tag_door_routes(routes, doors)
    assert routes["routes"]["door:b2"]["doorIds"] == ["door.x.4"]
    assert "doorIds" not in routes["routes"]["door:b2.1"]


def test_export_walks_on_the_places_catalogue(monkeypatch):
    """r5 review (CONFIRMED): `export --write` built walkRoutes on a plain
    Catalogue while `check` used the place's kit order."""
    from workbench import export
    cat = export.place_catalogue("place.imperial-fringe.claywater-station")
    assert cat.shelf.preferred_kits


def test_a_night_light_takes_its_fixtures_mined_light_record():
    """16k slice 2 round 5 (planner 2026-09-27): a light piece whose kit row
    carries a mined `light` record burns at that record's flame offset (piece
    frame, glTF Y-up) in the LIGH colour, at the runtime's night factor 1."""
    from workbench import render
    from workbench.scene import Piece
    scene = Scene(path=Path("/tmp/none.json"), placeId="place.x")
    scene.add(Piece("c", "x:candle", 10.0, 20.0, 90.0, 5.0,
                    role={"kind": "assembly", "id": "p", "layer": "light"}))

    class _L:
        def row(self, asset):
            return {"sizeM": [0.8, 0.6, 2.2], "originOffsetM": [0.4, 0.4, 0.0],
                    "light": {"offsetM": [0.0, 1.7, -1.0], "colourRgb": [142, 104, 79]}}
    (x, y, z, r, g, b, f), = render.night_lights(_L(), scene)
    assert abs(x - 11.0) < 1e-6 and abs(y + 20.0) < 1e-6 and abs(z - 6.7) < 1e-6
    assert (r, g, b) == (round(142 / 255, 4), round(104 / 255, 4), round(79 / 255, 4)) and f == 1.0


def test_a_front_token_can_carry_a_span_and_a_bearing():
    """16k slice 2 round 5: `front:UID/SPAN/BEARING` frames one piece closer
    or from another side in the same launch."""
    from workbench import render
    from workbench.scene import Piece
    scene = Scene(path=Path("/tmp/none.json"), placeId="place.x")
    scene.add(Piece("c", "x:candle", 10.0, 20.0, 0.0, 5.0,
                    role={"kind": "assembly", "id": "p", "layer": "light"}))
    (w,) = render.round_shots(None, scene, "front:c/3.5/90")
    assert (w["focus"], w["span"], w["bearing"]) == (["c"], 3.5, 90.0)


def test_a_night_light_follows_the_pieces_pitch():
    """Review 2026-09-27: the flame offset takes the piece's whole pose, as
    the runtime's matrix does (lighting.ts applyMatrix4), not the yaw alone."""
    from workbench import render
    from workbench.scene import Piece
    scene = Scene(path=Path("/tmp/none.json"), placeId="place.x")
    p = Piece("c", "x:candle", 10.0, 20.0, 0.0, 5.0,
              role={"kind": "assembly", "id": "p", "layer": "light"})
    p.pitch = 90.0
    scene.add(p)

    class _L:
        def row(self, asset):
            return {"sizeM": [0.8, 0.6, 2.2], "originOffsetM": [0.4, 0.4, 0.0],
                    "light": {"offsetM": [0.0, 1.0, 0.0], "colourRgb": [255, 255, 255]}}
    (x, y, z, *_), = render.night_lights(_L(), scene)
    # pitched 90 about its own x: the flame 1 m up now points 1 m south
    assert abs(x - 10.0) < 1e-6 and abs(y + 21.0) < 1e-6 and abs(z - 5.0) < 1e-6


def test_a_shot_draws_the_levelled_pad_not_the_raw_terrain(applied_layout):
    """16k slice 2 round 6 (planner 2026-09-27): a render draws the ground the
    runtime shows, the frozen ground patched by the scene's pads, so a piece
    seated on a cut pad stands on the drawn slab, never below it."""
    from workbench import pads, render
    from workbench.kits import Catalogue
    scene = applied_layout(Path(__file__).resolve().parent.parent / "fixtures"
                           / "claywater-walk2.layout.json")
    cat = Catalogue()
    resolved = {u: r for u, r in pads.scene_pads(cat, scene).items() if r["error"] is None}
    raw, drawn = scene.ground(), render.render_ground(cat, scene)
    cut = []
    for uid, r in resolved.items():
        p = scene.piece(uid)
        if abs(raw.chunk_height(p.x, p.z) - r["datumM"]) > 0.1:
            cut.append((p, r))
    assert cut, "the fixture holds a pad that cuts or fills the frozen ground"
    # the pad grades PAD_FLOOR_CLEARANCE_M under its datum (R75, 017b4cf4) so
    # the floor stands clear of the drawn slab; the shot draws that graded top
    from worldgen.pad_overlay import PAD_FLOOR_CLEARANCE_M
    for p, r in cut:
        assert abs(drawn.chunk_height(p.x, p.z) - (r["datumM"] - PAD_FLOOR_CLEARANCE_M)) < 0.01


def test_a_landmarks_pad_is_exported_like_a_parcels(applied_layout):
    """16k slice 2 round 6 (planner 2026-09-27): export writes a padded
    landmark's pad (datum resolved on its pose) into the blueprint's landmark
    record, as it does a parcel's, so the compile seats it and the bundle
    ships its ground overlay."""
    from workbench import export
    scene = applied_layout(Path(__file__).resolve().parent.parent / "fixtures"
                           / "claywater-walk2.layout.json").view()
    padded = next(p for p in scene.pieces if p.pad is not None and (p.role or {}).get("kind") == "parcel")
    rid = padded.role["id"]
    # the landmark alone: its assembly members bound to nothing else here
    scene.pieces = [q for q in scene.pieces if (q.role or {}).get("id") != rid or q is padded]
    padded.role = {"kind": "landmark", "id": "landmark.t.mound"}
    got = export.poses(scene, 7373.50656)["landmarks"]["landmark.t.mound"]
    assert isinstance(got.get("pad"), dict) and isinstance(got["pad"]["datumM"], float)
