"""16k walk 2 lane T1: the seat datum (place-diag P1), the mounted child's
host (P4, runtime-diag D7), the five new check rules and the propSeatRule
limits, the ownerGuided gate and the 0104 layout fields. Each rule is shown
FAILING on Claywater as exported at walk 2 (`fixtures/claywater-walk2.layout.json`,
the layout frozen before the fix lanes; the published bundle and the HEAD kit
manifests where the defect lived there), then passing on a corrected copy.
Local only: the scene needs the raw kit builds and the frozen ground window."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import export, paths, rules, snap  # noqa: E402
from workbench.scene import Scene  # noqa: E402

paths.bridge()
from worldgen import compile_settlement as cs  # noqa: E402

LAYOUT = HERE.parent / "fixtures" / "claywater-walk2.layout.json"
PLACE = "place.imperial-fringe.claywater-station"
PUBLISHED = paths.PROVINCE / "settlements.json"
WALK2_KITS_COMMIT = "bb5661d5~1"
"""The published kit manifests as walked at walk 2: lane RA's size-rule
rebuild (bb5661d5) gave the small props their colliders."""


@pytest.fixture(scope="module")
def scratch(tmp_path_factory):
    """A scratch output folder (the ground cache linked), never the live
    place's files."""
    real = paths.OUTPUT
    out = tmp_path_factory.mktemp("cw2-out")
    (real / "ground").mkdir(parents=True, exist_ok=True)
    (out / "ground").symlink_to(real / "ground")
    return out


@pytest.fixture(scope="module")
def base(applied_layout, cat):
    """The walk-2 scene (`conftest.applied_layout`: once per session, in a
    scratch output folder), its pads and padded ground warmed."""
    from workbench import pads
    s = applied_layout(LAYOUT)
    pads.ground_for(cat, s, None)
    return s


@pytest.fixture(scope="module")
def applied(base, scratch):
    """The walk-2 scene and the compile of its poses (`wb.compile_scene`)."""
    got = wb.compile_scene(base.view(), paths.BLUEPRINTS / f"{PLACE}.json",
                           keep_out=scratch / "compiled")
    assert got.get("settlement"), {k: got.get(k) for k in ("stage", "failed", "exitCode", "errors")}
    return base, json.loads(Path(got["settlement"]).read_text())


@pytest.fixture
def scene(base):
    return base.view()


@pytest.fixture(scope="module")
def cat():
    return wb.place_catalogue(PLACE)


def _row(compiled, tail):
    return next(r for r in compiled["placements"] if r["id"].endswith(tail))


# ---------------------------------------------------------------- item 1
def test_one_seat_a_048_m_ground_line_lands_the_floor_at_ground():
    """A kit whose ground line stands 0.48 m above its pivot (designedSinkM
    -0.48) and whose base is 0.48 m below the pivot: its base lands on the
    ground, flat or sloped, through the one function."""
    asset = {"sizeM": [4.0, 4.0, 3.0], "originOffsetM": [2.0, 2.0, 0.48],
             "designedSinkM": {"p50": -0.48}, "placement": {"anchorMode": "streamed-perimeter"}}

    class Flat:
        def height_at(self, x, z):
            return 10.0
    y = cs.seat_y(asset, Flat(), [0.0, 0.0, 0.0], 30.0, 1.0)
    assert y - 0.48 == pytest.approx(10.0)
    assert cs.placement_world_y([9.0, 11.0], -0.48) - 0.48 == pytest.approx(10.0)
    assert cs.placement_world_y([9.0, 11.0], -0.48, fit="dug-in") == pytest.approx(9.48)
    assert cs.placement_world_y([10.0], -0.48, explicit_sink_m=0.2) == pytest.approx(9.8)


def test_the_compiled_huts_stand_where_the_workbench_seats_them(applied):
    """Walk 2 published B5/B6 at 39.785/40.422 (the base on the pad, centred
    pivot) while the runtime seated them 3.8 m lower (sink -0.48); with the
    mudhut01 sink now its one plugin placement (-2.82) the seat moved again,
    and the compile writes the workbench's seat within 0.02 m."""
    s, compiled = applied
    pub = {p["id"]: p for p in json.loads(PUBLISHED.read_text())["placements"]}
    for uid, parcel in (("b5", "family-hut"), ("b6", "store-hut")):
        got = _row(compiled, f"{parcel}.building")["positionM"][1]
        was = pub[f"{PLACE}.parcel.claywater-station.{parcel}.building"]["positionM"][1]
        assert abs(was - got) > 1.0                     # the walk-2 record: failing first
        assert got == pytest.approx(s.piece(uid).y, abs=0.02)


def test_mudhut01_sink_is_its_one_plugin_placement():
    rec = json.loads((paths.PLACEMENT_RECORDS / "kit-designed-sink.json").read_text())
    row = rec["assets"]["kotm:argonia/mudhuts/mudhut01"]
    assert row["evidence"] == "plugin" and row["n"] == 1
    assert row["p50"] == pytest.approx(-2.83, abs=0.02)
    assert row["wholePopulation"]["n"] == 1 and row["plugins"] == ["King of the Murkmire.esp"]


# ---------------------------------------------------------------- item 2
def test_a_mounted_child_keeps_its_host_with_the_mined_offset(applied, cat):
    s, compiled = applied
    pub = {p["id"]: p for p in json.loads(PUBLISHED.read_text())["placements"]}
    board_was = pub[f"{PLACE}.parcel.claywater-station.the-well.assembly.p1-board"]
    assert board_was["parentPlacementId"].endswith("the-well.building")     # failing first
    board = _row(compiled, "the-well.assembly.p1-board")
    assert board["parentPlacementId"].endswith("the-well.assembly.p1")
    assert board["host"] == board["parentPlacementId"]
    assert board["mountOffsetM"][1] == pytest.approx(1.922, abs=0.01)
    lamp = _row(compiled, "station-house.assembly.b1-lamp")
    assert lamp["parentPlacementId"].endswith("station-house.assembly.b1-barrel")
    # the lamp's mount is unmined ('reader-approved r1', no mined pair for a
    # lantern on barrel02): the compiled offset is the workbench's own pose,
    # read in the host's frame (the two share one plan point, yaw 0)
    child, host = s.piece("b1-lamp"), s.piece("b1-barrel")
    assert not snap.mount_pairs(child.asset, host.asset)
    assert lamp["mountOffsetM"][1] == pytest.approx(child.y - host.y, abs=0.02)
    assert abs(lamp["mountOffsetM"][0]) <= 0.02 and abs(lamp["mountOffsetM"][2]) <= 0.02
    rows = export.poses(s, s.ground().extent_m)["parcels"]
    member = next(m for m in rows["parcel.claywater-station.the-well"]["assembly"]
                  if m["id"] == "p1-board")
    assert member["host"] == "p1"


def test_bind_host_must_name_the_piece_it_hangs_on(scene, cat):
    ap = wb.parser()
    ns = ap.parse_args(["-", "bind", "p1-board", "assembly", "parcel.claywater-station.the-well",
                        "--layer", "clutter", "--on", "parent", "--evidence", "measured",
                        "--host", "b1-barrel"])
    with pytest.raises(ValueError, match="hangs on 'p1'"):
        wb.cmd_bind(ns, scene, cat)
    ns.host = "p1"
    assert wb.cmd_bind(ns, scene, cat)["role"]["host"] == "p1"


def test_an_assembly_host_must_be_another_member():
    from worldgen import blueprint as bpm
    base = {"asset": "a", "atM": [0.0, 0.0], "layer": "light", "evidence": "measured"}
    parcel = {"id": "p", "assetRef": "s", "assembly": [
        {**base, "id": "post", "on": "ground"},
        {**base, "id": "board", "on": "parent", "upM": 1.9, "host": "post"}]}
    assert bpm.assembly_failures(parcel) == []
    parcel["assembly"][1]["host"] = "nobody"
    assert any("no other member" in f for f in bpm.assembly_failures(parcel))


# ---------------------------------------------------------------- item 3
def test_road_surface_fails_the_fence_and_the_huts(scene, cat):
    got = rules.road_surface(cat, scene)
    red = {f.split(":")[0] for f in got["failures"]}
    assert {"fw1", "fw2", "fw3", "b5", "b6"} <= red
    b1 = scene.piece("b1")                              # off the paint (it passes)
    assert "b1" not in red
    for uid in ("b5", "fw1"):
        scene.piece(uid).x, scene.piece(uid).z = b1.x, b1.z
    red = {f.split(":")[0] for f in rules.road_surface(cat, scene)["failures"]}
    assert not {"b5", "fw1"} & red


def test_sill_fails_b1_at_its_walk2_record_height(scene, cat):
    pub = {p["id"]: p for p in json.loads(PUBLISHED.read_text())["placements"]}
    assert "door:b1" not in {f.split(":")[0] + ":" + f.split(":")[1]
                             for f in rules.sill(cat, scene)["failures"]}
    scene.piece("b1").y = pub[f"{PLACE}.parcel.claywater-station.station-house.building"]["positionM"][1]
    got = rules.sill(cat, scene)
    assert any(f.startswith("door:b1:") for f in got["failures"])
    assert got["doors"]["door:b1"]["offM"] > 4.0


def test_sign_fails_the_board_across_the_road(scene, cat):
    got = rules.sign(cat, scene)
    assert any(f.startswith("p1-board: its arm") for f in got["failures"])
    assert any(f.startswith("p1: 1 board(s) and no sign socket") for f in got["failures"])
    wb.designer_yaw(scene.piece("p1-board"), scene.piece("p1"), 45.0)   # road 135 - 90
    got = rules.sign(cat, scene)
    assert not any(f.startswith("p1-board: its arm") for f in got["failures"])


def test_berth_reach_fails_the_raft_and_the_poler_in_water(scene, cat):
    got = rules.berth_reach(cat, scene)
    red = got["failures"]
    assert any(f.startswith("raft: no way or landing") for f in red)
    assert any("idle-poler-work: stands in" in f for f in red)
    assert not any("npc-well-keeper-station-house" in f for f in red)


def test_prop_seat_holds_1_cm_up_and_5_cm_down(scene, cat):
    lamp = scene.piece("isy-barrel1")
    base = lamp.y
    assert not any(f.startswith("isy-barrel1:") for f in rules.prop_seat(cat, scene)["failures"])
    lamp.y = base + 0.02                # passed the old flat 0.03 m bar
    assert any(f.startswith("isy-barrel1: stands +0.020") for f in rules.prop_seat(cat, scene)["failures"])
    lamp.y = base - 0.04                # failed it
    assert not any(f.startswith("isy-barrel1: stands") for f in rules.prop_seat(cat, scene)["failures"])


def test_collider_fails_on_the_walk2_manifests(scene, tmp_path):
    """The walk-2 manifests (before bb5661d5) gave the woodpiles, the cart, the crate,
    the troughs and the brazier no collider; the rule reads the manifest."""
    kits = paths.PUBLISHED_KITS
    for f in kits.glob("*.kit.json"):
        rel = f.relative_to(paths.REPO_ROOT).as_posix()
        got = subprocess.run(["git", "show", f"{WALK2_KITS_COMMIT}:{rel}"], cwd=paths.REPO_ROOT,
                             capture_output=True, text=True)
        (tmp_path / f.name).write_text(got.stdout if got.returncode == 0 else f.read_text())
    from workbench.kits import Catalogue
    head = Catalogue(tmp_path)
    head.shelf.preferred_kits = cs.place_kit_preference(PLACE)
    red = {f.split(":")[0] for f in rules.collider(head, scene)["failures"]}
    assert {"b1-wood", "sty-wood", "isy-fire"} <= red
    assert not {"b1-lamp", "isy-lamp", "p1-board"} & red           # under the size


# ---------------------------------------------------------------- item 4
def test_an_owner_guided_place_needs_the_owner_go_ahead(monkeypatch):
    from worldgen import blueprint as bpm
    monkeypatch.setattr(bpm, "catalogue_records", lambda: {PLACE: {"ownerGuided": True}})
    assert "ownerGuided" in wb.owner_guided_refusal(PLACE, None)
    assert wb.owner_guided_refusal(PLACE, "owner 2026-09-27: go ahead") is None
    got = wb.apply_layout(LAYOUT, "og-probe", compile_=False)
    assert "ownerGuided" in got["refused"]
    monkeypatch.setattr(bpm, "catalogue_records", lambda: {PLACE: {}})
    assert wb.owner_guided_refusal(PLACE, None) is None


# ---------------------------------------------------------------- item 5
def test_the_0104_fields_validate():
    from worldgen import blueprint as bpm
    from worldgen import sockets as sk
    vocab = sk.load_vocabulary()
    ok = {"op": "socket", "id": "s", "at": [1.0, 2.0], "fills": ["promise.claywater-station.ford"]}
    assert sk.op_errors({**ok, "kind": "sign", "pointsTo": ["route.road.a"]}, vocab) == []
    assert sk.op_errors({**ok, "kind": "station", "stationClass": "fish-rack"}, vocab) == []
    assert sk.op_errors({**ok, "kind": "sign"}, vocab)
    assert sk.op_errors({**ok, "kind": "idle", "activity": "sit", "fills": ["ford"]}, vocab)
    assert bpm.fills_failures({"fills": ["promise.claywater-station.ford"]}) == []
    assert bpm.fills_failures({"fills": []})
    assert "doorType" in "".join(
        f"doorType must be one of {sorted(bpm.DOOR_TYPES)}" for _ in [0]) and \
        bpm.DOOR_TYPES == {"load", "swing"}


# ------------------------------------------------ planner ruling yFinal
def _ground_rows(scene, compiled):
    """{scene uid: compiled placement} for every seated ground piece the
    export writes a yMeasured for: single-asset parcel shells, landmarks and
    assembly members on the ground."""
    by_id = {r["id"]: r for r in compiled["placements"]}
    shells = {}
    for p in scene.pieces:
        if p.role.get("kind") == "parcel" and not p.role.get("index"):
            shells.setdefault(p.role["id"], p)
    out = {}
    for p in scene.pieces:
        kind, rid = p.role.get("kind"), p.role.get("id")
        if p.y is None:
            continue
        if kind == "parcel" and shells.get(rid) is p:
            key = f"{PLACE}.{rid}.building"
        elif kind == "landmark":
            key = f"{PLACE}.{rid}"
        elif kind == "assembly" and p.role.get("on") == "ground":
            key = f"{PLACE}.{rid}.assembly.{export._slug(p.uid)}"
        else:
            continue
        if key in by_id:
            out[p.uid] = by_id[key]
    return out


def test_y_measured_is_compiled_verbatim_as_y_final(base, scratch, monkeypatch):
    """Planner ruling yFinal (T1 rec 1, option A): the compile seated ground
    pieces on its own padded survey, not the lod1 chunks + building and run
    pads the workbench and the runtime seat on, so 14 Claywater ground rows
    disagreed by up to 0.66 m (isy-trough +0.659). Failing first: the compile
    without yMeasured; then every ground row stands at the workbench's y
    within 0.02 m and carries yFinal."""
    s = base.view()
    with monkeypatch.context() as mp:
        mp.setattr(export, "_y_measured", lambda p: {})
        old = wb.compile_scene(s.view(), paths.BLUEPRINTS / f"{PLACE}.json",
                               keep_out=scratch / "compiled-no-y")
    old_rows = _ground_rows(s, json.loads(Path(old["settlement"]).read_text()))
    off = {u: r["positionM"][1] - s.piece(u).y for u, r in old_rows.items()
           if abs(r["positionM"][1] - s.piece(u).y) > 0.02}
    assert len(off) >= 10 and "isy-trough" in off, off           # the walk-2 defect
    new = wb.compile_scene(s.view(), paths.BLUEPRINTS / f"{PLACE}.json",
                           keep_out=scratch / "compiled-y")
    rows = _ground_rows(s, json.loads(Path(new["settlement"]).read_text()))
    assert set(off) <= set(rows)
    bad = {u: r["positionM"][1] - s.piece(u).y for u, r in rows.items()
           if abs(r["positionM"][1] - s.piece(u).y) > 0.02 or r.get("yFinal") is not True}
    assert not bad, bad


def test_the_live_export_stands_where_the_workbench_measured():
    """The live Claywater export (whatever the blueprint holds now): every
    ground row the export measured is compiled at that y within 0.02 m and
    marked yFinal. RED until the place lane re-exports and republishes
    Claywater with yMeasured (the walk-2 export predates the ruling)."""
    bp = json.loads((paths.BLUEPRINTS / f"{PLACE}.json").read_text())["blueprint"]
    measured = {}
    for parcel in bp.get("parcels", []):
        if "yMeasured" in parcel:
            measured[f"{PLACE}.{parcel['id']}.building"] = parcel["yMeasured"]
        for m in parcel.get("assembly", []):
            if "yMeasured" in m:
                measured[f"{PLACE}.{parcel['id']}.assembly.{m['id']}"] = m["yMeasured"]
    for lm in bp.get("landmarks", []):
        if "yMeasured" in lm:
            measured[f"{PLACE}.{lm['id']}"] = lm["yMeasured"]
    assert measured, "the live Claywater export carries no yMeasured: re-export the place"
    pub = {p["id"]: p for p in json.loads(PUBLISHED.read_text())["placements"]}
    bad = {k: (pub.get(k, {}).get("positionM", [None, None])[1], y) for k, y in measured.items()
           if k not in pub or pub[k].get("yFinal") is not True
           or abs(pub[k]["positionM"][1] - y) > 0.02}
    assert not bad, bad


def test_a_run_members_co_placed_door_is_not_its_threshold(scene, cat):
    """Planner ruling 2026-09-27 (lane P): BM&V bridge01 carries `assembly`
    doorways (the plugins' doorframe01 placed with it); on a run or assembly
    member they are the served building's doors, never the piece's own, so
    sillRule and walkRule do not judge them. A free-standing piece keeps them."""
    from workbench import measure
    from workbench.scene import Piece
    deck = Piece("t-deck", "bmv:architecture/huts/exterior/bridge01", 344.0, 3005.5, 116.7)
    deck.y = 35.56
    assert measure.door_report(cat, scene, deck)                # free-standing: listed
    deck.role = {"kind": "run", "id": "parcel.claywater-station.landing-stage", "index": 1}
    assert measure.door_report(cat, scene, deck) is None


def test_round4_scaled_pair_contact_and_piled_deck_seat(scene, cat):
    """Planner ruling 2026-09-27 (round 4, lessons L65): FCL drops a scale,
    so a scaled pair is measured on pre-scaled meshes (the BM&V landing at
    plugin scale 2.0 read 9.7 m run-joint gaps); a piled deck seats by its
    deck at the water surface + its deck rise."""
    from workbench import measure, pads
    from workbench.scene import Piece
    a = Piece("t-a", "bmv:architecture/huts/exterior/bridge01", 335.399, 3001.201, 116.721, scale=2.0)
    b = Piece("t-b", "bmv:architecture/huts/exterior/bridge01", 344.081, 3005.527, 116.721, scale=2.0)
    a.y = b.y = 35.53
    assert measure.contact(cat, a, b)["gapM"] <= 0.05
    dock = Piece("t-dock", "vanilla:architecture/docks/dockstrent02", 343.0, 3005.0, 116.7)
    g = pads.ground_for(cat, scene, None)
    seat = measure.seat(cat, g, dock)
    assert seat["mode"] == "piled"
    assert seat["y"] == pytest.approx(seat["waterLevelM"] + cat.row(dock.asset)["deckRiseM"], abs=0.01)


def test_round4_a_pods_door_is_judged_on_its_own_porch(scene, cat):
    """Planner ruling 2026-09-27 (round 4): a threshold is measured against
    its own assembly's walkable surface (the pod's porch deck) within 0.5 m,
    and the porch then must reach the ground by a step of at most 0.45 m.
    Round 5 (planner 2026-09-27) seats the pod by its porch (designedSinkM
    1.9922, `part:` evidence, was the shell's 1.647 with a 0.655 m step): the
    step at the porch's foot is now within the bar and the door passes."""
    got = rules.sill(cat, scene)
    row = got["doors"]["door:b4"]
    assert row["ownDeck"]["onDeck"] and row["ownDeck"]["offM"] <= rules.SILL_MAX_M
    assert row["ownDeck"]["footStepM"] is not None
    assert row["ownDeck"]["footStepM"] <= rules.PORCH_STEP_MAX_M
    assert not any(f.startswith("door:b4:") for f in got["failures"])
    # the bar still bites: a porch foot higher than the bar fails
    b4 = scene.piece("b4")
    b4.y += rules.PORCH_STEP_MAX_M
    raised = rules.sill(cat, scene)
    assert raised["doors"]["door:b4"]["ownDeck"]["footStepM"] > rules.PORCH_STEP_MAX_M
    assert any("door:b4: its own deck" in f for f in raised["failures"])


def test_round5_a_piled_deck_is_one_walk_surface_over_its_plan_box(scene, cat):
    """Planner ruling 2026-09-27 (round 5): a piled deck (dock, jetty) is
    one walk surface at its seated deck height across its whole plan box, so
    the gaps between its planks never read as water."""
    from shapely.geometry import Polygon
    from workbench import measure, pads
    from workbench.scene import Piece
    dock = Piece("t-dock", "vanilla:architecture/docks/dockstrent02", 343.0, 3005.0, 116.7)
    g = pads.ground_for(cat, scene, None)
    dock.y = measure.seat(cat, g, dock)["y"]
    dock.walkable = True
    deck = rules._piled_deck_y(cat, dock)
    box = Polygon(measure.footprint_province(cat, dock)).minimum_rotated_rectangle
    scene.add(dock)
    for x, z in list(box.exterior.coords)[:4]:
        cx, cz = (x + dock.x) / 2.0, (z + dock.z) / 2.0      # half-way to every corner
        assert rules._surface_m(cat, scene, g, cx, cz) == pytest.approx(deck, abs=1e-6)
