"""Place sockets (0103 decisions 5 and 6): the vocabulary, the yard-set
yield, the compile's resolution and each gate failing, then passing."""
from __future__ import annotations

import json

import pytest

from . import sockets as sk
from . import blueprint_promises as bpr

VOCAB = sk.load_vocabulary()
BP = "place.test.sockets"
CATEGORY = {"vanilla:clutter/barrel01": "container", "vanilla:clutter/strongbox01": "container",
            "mud:paintedurn01": "container",
            "vanilla:furniture/common/commonchair01": "furniture",
            "vanilla:furniture/orcfurniture/orcshelf01": "furniture",
            "vanilla:clutter/bucket01": "clutter"}.get


def _placement(pid, asset, x, z, parcel="parcel.a"):
    return {"id": f"{BP}.{parcel}.assembly.{pid}", "parcelId": parcel, "assetId": asset,
            "positionM": [x, 10.0, z], "yawDeg": 30.0}


PLACEMENTS = [_placement("barrel", "vanilla:clutter/barrel01", 0.0, 0.0),
              _placement("box", "vanilla:clutter/strongbox01", 5.0, 0.0),
              _placement("chair", "vanilla:furniture/common/commonchair01", 2.0, 2.0)]
YARD = {"id": "test-yard", "anchor": "barrel", "members": [
    {"uid": "barrel", "piece": "vanilla:clutter/barrel01", "offsetM": [0, 0], "yaw": 0},
    {"uid": "box", "piece": "vanilla:clutter/strongbox01", "offsetM": [5, 0], "yaw": 0},
    {"uid": "chair", "piece": "vanilla:furniture/common/commonchair01", "offsetM": [2, 2], "yaw": 0},
    {"uid": "shelf", "piece": "vanilla:furniture/orcfurniture/orcshelf01", "offsetM": [3, 3], "yaw": 0},
    {"uid": "bucket", "piece": "vanilla:clutter/bucket01", "offsetM": [4, 4], "yaw": 0}]}
REC = {"id": BP, "services": ["trader"], "notableNpcSlots": [{"slotId": "keeper", "role": "k"}],
       "contents": {"npcs": []}}
SERVICE_PARCELS = {"trader": [{"id": "parcel.a"}]}


def test_vocabulary_is_one_record_with_every_part():
    for key in ("socketKinds", "itemClasses", "containerClasses", "fillRules", "dayPhases",
                "activities", "valueBands"):
        assert VOCAB[key], key
    assert VOCAB["fillRules"]["blanket.household-barrel"]["hiddenGemChance"] == 0.05
    assert VOCAB["fillRules"]["blanket.water-barrel"]["itemClasses"] == []
    for cls, row in VOCAB["itemClasses"].items():
        assert row["assetSource"] and row["valueBand"] in VOCAB["valueBands"], cls
    for cls, row in VOCAB["containerClasses"].items():
        assert row["defaultFillRule"] in (None, *VOCAB["fillRules"]), cls
    assert {"stand", "sit", "sleep", "lean", "work-at", "fish", "tend", "cook", "pole"} \
        <= set(VOCAB["activities"])


def test_day_phases_are_world_time_day_phases():
    clock = (sk.REPO_ROOT / "packages" / "world-time" / "src" / "clock.ts").read_text()
    block = clock.split("export type DayPhase =", 1)[1].split(";", 1)[0]
    assert [w.strip(' "|\n') for w in block.split("|") if w.strip(' "|\n')] == VOCAB["dayPhases"]


def test_a_yard_set_yields_containers_and_furniture_with_an_activity_only():
    got = sk.yard_set_sockets(YARD, "p-", CATEGORY, VOCAB)
    by = {op["host"]: op for op in got}
    assert set(by) == {"p-barrel", "p-box", "p-chair"}          # no shelf, no clutter
    assert by["p-barrel"]["containerClass"] == "barrel"
    assert by["p-barrel"]["fillRule"] == "blanket.household-barrel"
    assert by["p-box"]["fillRule"] is None                       # strongbox has no default
    assert by["p-chair"] == {**by["p-chair"], "kind": "idle", "activity": "sit"}
    over = {**YARD, "members": [{**YARD["members"][1], "fillRule": "blanket.water-barrel"}]}
    assert sk.yard_set_sockets(over, "", CATEGORY, VOCAB)[0]["fillRule"] == "blanket.water-barrel"


def _compile(ops, walk=None, placements=PLACEMENTS):
    bp = {"id": BP, "walkRoutes": walk or {"routes": {"door:a": {"points": [[0.0, 10.0, 1.0]]}}}}
    socks, errors = sk.compile_sockets(bp, placements, lambda x, z: 7.0, ops, VOCAB, CATEGORY)
    gates = sk.socket_gate_errors(bp, REC, socks, placements, CATEGORY, SERVICE_PARCELS, VOCAB)
    return socks, errors, gates


def _walked(*socket_ids):
    """walkRoutes as `wb.py export --write` writes them once walkRule reached
    each socket (route id `socket:<id>`)."""
    return {"routes": {"door:a": {"points": [[0.0, 10.0, 1.0]]},
                       **{f"socket:{i}": {"points": [[0.0, 10.0, 1.0]]} for i in socket_ids}}}


EVERY = ("idle.work", "idle.home", "npc.keeper", "box", "yard.barrel", "yard.chair")


def _rules(gates):
    return sorted({g.split(":", 1)[0] for g in gates})


LAYOUT = {"ops": [{"op": "group", "action": "place", "name": "test-yard", "at": [0, 0]}]}


def test_each_gate_fails_on_a_place_with_only_its_yard_set():
    ops = sk.socket_ops(LAYOUT, CATEGORY, VOCAB, {"test-yard": YARD})
    socks, errors, gates = _compile(ops)
    # the shelf and bucket were never compiled placements; box/chair/barrel were
    assert errors == []
    assert _rules(gates) == ["sockets.container-fill", "sockets.reach", "sockets.roster",
                             "sockets.service"]
    assert not [s for s in socks if s["id"].startswith(sk.FILL_PREFIX)]   # yard-hosted
    assert any("box" in g and "no fill rule" in g for g in gates)
    assert any("chair" in g and "sockets.reach" in g for g in gates)
    hosted = {s["host"]: s for s in socks}
    assert hosted[PLACEMENTS[0]["id"]]["positionM"] == [0.0, 10.0, 0.0]   # on the host


GOOD = [
    {"op": "socket", "id": "idle.work", "kind": "idle", "at": [0.5, 1.0], "activity": "work-at"},
    {"op": "socket", "id": "idle.home", "kind": "idle", "at": [0.0, 1.5], "activity": "sleep"},
    {"op": "socket", "id": "npc.keeper", "kind": "npc", "at": [0.0, 0.5], "parcel": "parcel.a",
     "rosterSlotId": "keeper", "schedule": [
         {"dayPhase": "morning", "socketId": "idle.work", "purpose": "work"},
         {"dayPhase": "night", "socketId": "idle.home", "purpose": "home"}]},
    {"op": "socket", "id": "box", "kind": "container", "host": "box", "containerClass": "strongbox",
     "fillRule": "authored", "lootTable": {"itemClasses": ["coin", "gem"], "valueBand": "high",
                                           "storyNote": "the keeper's savings"}},
    {"op": "socket", "id": "note", "kind": "item", "at": [0.0, 1.0], "itemClass": "note"},
]


def test_the_gates_pass_when_every_promise_is_placed():
    ops = sk.socket_ops({**LAYOUT, "sockets": GOOD}, CATEGORY, VOCAB, {"test-yard": YARD})
    socks, errors, gates = _compile(ops, _walked(*EVERY))
    assert errors == [] and gates == []
    ids = [s["id"] for s in socks]
    assert "box" in ids and "yard.box" not in ids           # authored replaces the yard's
    note = next(s for s in socks if s["id"] == "note")
    assert note["contentPending"] is True and note["valueBand"] == "trivial"
    assert next(s for s in socks if s["id"] == "idle.work")["positionM"][1] == 7.0   # ground


@pytest.mark.parametrize("change, rule", [
    (lambda ops: [o for o in ops if o["id"] != "npc.keeper"], "sockets.roster"),
    (lambda ops: [{**o, "schedule": o["schedule"][:1]} if o["id"] == "npc.keeper" else o
                  for o in ops], "sockets.roster"),
    (lambda ops: [{**o, "parcel": "parcel.b"} if o["id"] == "npc.keeper" else o for o in ops],
     "sockets.service"),
    (lambda ops: [{**o, "itemClass": "relic"} if o["id"] == "note" else o for o in ops],
     "sockets.item-class"),
    (lambda ops: [{**o, "lootTable": {**o["lootTable"], "itemClasses": ["relic"]}}
                  if o["id"] == "box" else o for o in ops], "sockets.item-class"),
])
def test_one_defect_fires_its_gate(change, rule):
    ops = sk.socket_ops({**LAYOUT, "sockets": change(GOOD)}, CATEGORY, VOCAB,
                        {"test-yard": YARD})
    _socks, _errors, gates = _compile(ops, _walked(*EVERY))
    assert rule in _rules(gates)


@pytest.mark.parametrize("socket_id", ["idle.home", "npc.keeper", "box", "yard.chair"])
def test_reach_is_a_walk_rule_target_that_passed(socket_id):
    """Planner ruling 1 (16k round 5): an npc, idle or container socket is
    reachable when walkRule targeted it and reached it (its `socket:<id>`
    route), never by its distance to another target's route."""
    ops = sk.socket_ops({**LAYOUT, "sockets": GOOD}, CATEGORY, VOCAB, {"test-yard": YARD})
    _s, _e, gates = _compile(ops, _walked(*(i for i in EVERY if i != socket_id)))
    assert [g for g in gates if g.startswith("sockets.reach")] == [
        g for g in gates if f"socket {socket_id} " in g]
    assert len([g for g in gates if g.startswith("sockets.reach")]) == 1


def test_a_socket_far_from_every_route_passes_once_walk_rule_reached_it():
    op = {"op": "socket", "id": "far", "kind": "idle", "at": [90.0, 90.0], "activity": "stand"}
    _s, _e, gates = _compile([op], _walked("far"))
    assert not [g for g in gates if g.startswith("sockets.reach") and " far " in g]
    near = {**op, "at": [0.2, 1.0]}                   # 0.2 m from a route point, never targeted
    _s, _e, gates = _compile([near], _walked())
    assert [g for g in gates if g.startswith("sockets.reach") and " far " in g]


def test_a_container_outside_a_yard_set_gets_its_class_default_fill():
    """Planner ruling 5 (16k round 5): a container the dressing ring or a
    loose `place` op laid gets the class default at compile; only yard-set
    overrides are authored. A class with no default (strongbox) still fails."""
    ring = {**_placement("x", "vanilla:clutter/barrel01", 9.0, 9.0),
            "id": f"{BP}.parcel.a.dressing.1", "objectKind": "dressing"}
    urn = {**_placement("urn", "mud:paintedurn01", 7.0, 9.0)}
    placements = PLACEMENTS + [ring, urn]
    socks, errors, gates = _compile([], _walked("fill.barrel", "fill.box", "fill.urn", "yard.chair"),
                                    placements)
    assert errors == []
    by = {s["id"]: s for s in socks}
    assert by["fill.barrel"]["fillRule"] == "blanket.household-barrel"
    assert by["fill.barrel"]["host"] == PLACEMENTS[0]["id"]
    assert by["fill.parcel.a.dressing.1"]["containerClass"] == "barrel"
    assert by["fill.urn"]["fillRule"] == "blanket.household-urn"      # ruling 1, round 6
    fill = [g for g in gates if g.startswith("sockets.container-fill")]
    assert len(fill) == 1 and "fill.box" in fill[0] and "no fill rule" in fill[0]
    # 16k r8 rule 5: the workbench scene holds the ring, so the ring's socket
    # is a walkRule target like any other; unwalked, the reach gate names it
    reach = [g for g in gates if g.startswith("sockets.reach")]
    assert len(reach) == 1 and "fill.parcel.a.dressing.1" in reach[0]
    _s, _e, gates = _compile([], _walked("fill.barrel", "fill.box", "fill.urn", "yard.chair",
                                         "fill.parcel.a.dressing.1"), placements)
    assert not [g for g in gates if g.startswith("sockets.reach")]


def test_malformed_ops_and_unplaced_hosts_are_named():
    bad = [{"op": "socket", "id": "x", "kind": "loot", "at": [0, 0]},
           {"op": "socket", "id": "y", "kind": "idle", "activity": "sit"},
           {"op": "socket", "id": "z", "kind": "idle", "host": "nowhere", "activity": "sit"},
           {"op": "socket", "id": "w", "kind": "idle", "at": [0, 0], "itemClass": "coin"}]
    _s, errors, _g = _compile(bad)
    assert any("kind 'loot'" in e for e in errors)
    assert any("needs `at`" in e for e in errors)
    assert any("host 'nowhere'" in e for e in errors)
    assert any("belongs to kind 'item'" in e for e in errors)


def test_the_layout_named_by_the_blueprint_must_be_the_exported_bytes(tmp_path):
    path = tmp_path / "x.layout.json"
    path.write_text(json.dumps({"ops": []}))
    doc, err = sk.layout_of({"authoredOn": {"layout": {"path": str(path), "sha256": "0" * 64}}})
    assert doc is None and "changed since" in err


def test_the_promise_ledger_names_the_socket_kinds_that_satisfy_each_promise():
    for kind in ("service", "npc-role", "named-npc", "travel", "socket", "reward", "entrance"):
        p = bpr.Promise("x", kind, "p", "s", "r")
        assert set(bpr.socket_kinds(p)) <= set(VOCAB["socketKinds"]) and bpr.socket_kinds(p)
    assert bpr.socket_kinds(bpr.Promise("x", "provision", "BOSS q", "s", "r")) == ["encounter"]


def test_compiled_sockets_must_cover_every_promise_rows_socket_kinds():
    """Planner ruling 4 (16k round 5): the ledger's Socket kinds column is
    what a place's compiled sockets are checked against."""
    ledger = [bpr.Promise("promise.service.trader", "service", "trader", "s", "r",
                          socketKinds=["npc"], parcels=["parcel.a"]),
              bpr.Promise("promise.provision.q", "provision", "BOSS q", "s", "r",
                          socketKinds=["encounter"])]
    errs = bpr.socket_promise_errors(ledger, [{"id": "i", "kind": "idle"}])
    assert len(errs) == 2 and all(e.startswith("sockets.promise:") for e in errs)
    assert bpr.socket_promise_errors(ledger, [{"id": "n", "kind": "npc", "parcelId": "parcel.a"},
                                              {"id": "q", "kind": "encounter"}]) == []


def test_a_socket_meets_its_promise_row_only_from_the_rows_parcel_or_by_its_id():
    """Planner ruling 3 (16k round 6): a promise row names its parcel(s); a
    socket of the right kind in another parcel does not meet it; one that
    carries the row's id does, wherever it stands."""
    row = bpr.Promise("promise.service.trader", "service", "trader", "s", "r",
                      socketKinds=["npc"], parcels=["parcel.shop"])
    wrong = [{"id": "npc.x", "kind": "npc", "parcelId": "parcel.hut"}]
    errs = bpr.socket_promise_errors([row], wrong)
    assert len(errs) == 1 and "parcel.shop" in errs[0]
    assert bpr.socket_promise_errors([row], [{**wrong[0], "parcelId": "parcel.shop"}]) == []
    for sid in ("promise.service.trader", "trader"):     # the row's id, or its subject
        assert bpr.socket_promise_errors([row], [{**wrong[0], "id": sid}]) == []
    # a row with no parcel (a catalogue socket, a ferry) is met by its id only
    sock = bpr.Promise("promise.socket.post.p.keeper", "socket", "post socket", "s", "r",
                       socketKinds=["marker"])
    assert bpr.socket_promise_errors([sock], [{"id": "m", "kind": "marker", "parcelId": "x"}])
    assert bpr.socket_promise_errors([sock], [{"id": "post.p.keeper", "kind": "marker"}]) == []


def test_the_urn_class_fills_by_its_household_default():
    """Planner ruling 1 (16k round 6)."""
    assert VOCAB["containerClasses"]["urn"]["defaultFillRule"] == "blanket.household-urn"
    rule = VOCAB["fillRules"]["blanket.household-urn"]
    assert rule["itemClasses"] == ["food", "drink", "misc-household"]
    assert rule["valueBand"] == "low"
    assert rule["hiddenGemChance"] == 0.02          # r7 rule 8


def test_a_quest_socket_realising_a_catalogue_socket_puts_the_promise_in_its_parcel():
    """16k walk 2 lane P: the ledger's realiser for a catalogue socket is the
    quest socket's `socketRef`; `_row_parcels` mapped only its `id`, so the
    row had no parcel and no compiled marker could meet it."""
    bp = {"parcels": [{"id": "parcel.p.well"}],
          "questSockets": [{"id": "socket.p.keeper", "kind": "post", "socketRef": "post.p.keeper",
                            "parcel": "parcel.p.well"}]}
    assert bpr._row_parcels(bp)["post.p.keeper"] == ["parcel.p.well"]


def test_a_post_catalogue_socket_id_is_a_legal_quest_socket_id():
    from worldgen import blueprint as bpm
    assert bpm.CATALOGUE_SOCKET_RE.match("post.claywater-station.poler")


def test_a_socket_that_fills_a_promise_realises_it_wherever_it_stands():
    """Planner ruling 2026-09-27 (walk 2 round 3): `fills` names the 0104 row;
    that socket meets the build-ledger row with the same subject in any
    parcel (the poler's npc socket on the landing deck fills the ferry)."""
    row = bpr.Promise("promise.service.ferry", "service", "ferry", "s", "r",
                      socketKinds=["npc"], parcels=["parcel.p.raft"])
    record = {"promises": [{"id": "promise.p.service-ferry",
                            "source": {"path": "places[place.x.p].services[ferry]"}}]}
    subjects = bpr.fill_subjects(record)
    deck = {"id": "socket.p.npc-poler", "kind": "npc", "parcelId": "parcel.p.landing",
            "fills": ["promise.p.service-ferry"]}
    assert bpr.socket_promise_errors([row], [deck]) != []           # no fills map: parcel rule
    assert bpr.socket_promise_errors([row], [deck], subjects) == []
    assert bpr.socket_promise_errors([row], [{**deck, "kind": "idle"}], subjects) != []


def test_a_socket_on_a_deck_stands_on_the_deck_top_never_the_terrain():
    """16k walk 4 defect 5: Claywater's npc-poler compiled at the terrain
    under the landing deck (32.77 m, the channel bed) with the deck top at
    35.59 m. Every socket takes its y from the highest walkable placed
    surface under it (a deck, a hull), else its host's pivot or the ground."""
    deck = [[-2.0, -2.0], [2.0, -2.0], [2.0, 2.0], [-2.0, 2.0]]
    surface_at = sk.walkable_surface_at([(deck, 9.5, "deck-a"), (deck, 8.0, "deck-low")])
    ops = [{"id": "socket.t.on-deck", "kind": "marker", "at": [1.0, 1.0], "zone": "scene",
            "parcel": "parcel.a", "why": "on the deck"},
           {"id": "socket.t.off-deck", "kind": "marker", "at": [9.0, 9.0], "zone": "scene",
            "parcel": "parcel.a", "why": "on the ground"},
           {"id": "socket.t.hosted", "kind": "container", "host": "barrel",
            "containerClass": "barrel", "fillRule": "authored",
            "lootTable": {"itemClasses": ["food"], "valueBand": "low"},
            "parcel": "parcel.a", "why": "at its host"}]
    bp = {"id": BP}
    socks, errors = sk.compile_sockets(bp, PLACEMENTS, lambda x, z: 7.0, ops, VOCAB,
                                       surface_at=surface_at)
    assert not errors, errors
    y = {s["id"]: s["positionM"][1] for s in socks}
    assert y["socket.t.on-deck"] == 9.5           # the highest deck, not the 7.0 terrain
    assert y["socket.t.off-deck"] == 7.0          # no deck: the padded ground
    assert y["socket.t.hosted"] == 10.0           # the barrel at (0, 0) is on the deck
    # ... whose top (9.5) is below the barrel's pivot: a host above the deck keeps its pivot


CELL_BUNDLE = {"placements": [
    {"id": "TestCell.0001", "positionM": [3.0, 0.5, -2.0], "rotationDeg": [0.0, 90.0, 0.0]},
    {"id": "TestCell.0002", "positionM": [1.0, 0.0, 1.0], "rotationDeg": [0.0, 0.0, 0.0]}],
    "sockets": [{"id": "socket.TestCell.0001", "kind": "idle", "host": "TestCell.0001"}]}
SHELL = {"id": f"{BP}.parcel.a.building", "parcelId": "parcel.a", "assetId": "x:house",
         "positionM": [9.0, 10.0, 9.0], "yawDeg": 0.0}


def _compile_interior(ops):
    bp = {"id": BP, "walkRoutes": {"routes": {}}, "doors": [
        {"id": "door.a", "parcelId": "parcel.a", "interiorClaim": {"tier": "A", "cellId": "TestCell"}}]}
    placements = [PLACEMENTS[2], SHELL]      # the chair and the shell: no container
    socks, errors = sk.compile_sockets(bp, placements, lambda x, z: 7.0, ops, VOCAB,
                                       bundle_of={"TestCell": CELL_BUNDLE}.get)
    gates = sk.socket_gate_errors(bp, None, socks, placements, CATEGORY, {}, VOCAB)
    return {s["id"]: s for s in socks}, errors, gates


def test_an_interior_socket_stands_in_its_cell_frame_and_is_reached_by_its_bundle():
    """F2 (16k walk 5): a home bed is authored in the tier A cell, never on the shell."""
    by, errors, gates = _compile_interior([
        {"op": "socket", "id": "bed", "kind": "idle", "activity": "sleep",
         "interiorCell": "TestCell", "host": "TestCell.0001"}])
    assert not errors and not gates, (errors, gates)
    assert by["bed"]["interiorCell"] == "TestCell" and by["bed"]["parcelId"] == "parcel.a"
    assert by["bed"]["positionM"] == [3.0, 0.5, -2.0] and by["bed"]["yawDeg"] == 90.0


def test_interior_socket_defects_are_named():
    _, errors, gates = _compile_interior([
        {"op": "socket", "id": "a", "kind": "idle", "activity": "sleep",
         "interiorCell": "OtherCell", "host": "OtherCell.1"},
        {"op": "socket", "id": "b", "kind": "idle", "activity": "sleep",
         "interiorCell": "TestCell", "host": "TestCell.9999"},
        {"op": "socket", "id": "c", "kind": "idle", "activity": "stand",
         "interiorCell": "TestCell", "host": "TestCell.0002"},
        {"op": "socket", "id": "d", "kind": "item", "itemClass": "book", "host": "parcel.a"}])
    assert any("no door of this place claims" in e for e in errors)
    assert any("no placement of bundle TestCell" in e for e in errors)
    assert any(g.startswith("sockets.reach") and " c " in g for g in gates)   # no reached host
    assert any(g.startswith("sockets.interior") and " d " in g for g in gates)  # on the shell


# Decision 0113: the interact point of a work socket. Expected answers first:
# a worker at the pivot of a 2 m deep counter (1 m either side along its
# local y, north), facing north (0 deg), puts the customer 1 m + 0.6 m north,
# facing south; a worker on the counter's south edge the same point; a forge
# is used where the worker stands.
COUNTER = "vanilla:furniture/shopcounter01"
FORGE = "vanilla:clutter/blacksmith/blacksmithforge01/blacksmithforge01"
BOUNDS = {COUNTER: ([3.0, 2.0, 1.0], [1.5, 1.0, 0.0]), FORGE: ([2.0, 2.0, 2.0], [1.0, 1.0, 0.0])}


def _work(pos, yaw, host=None, kind="idle"):
    row = {"id": "socket.p.w", "kind": kind, "positionM": pos, "yawDeg": yaw, "host": host}
    return {**row, "activity": "work-at"} if kind == "idle" else {**row, "stationClass": "forge"}


@pytest.mark.parametrize("worker, yaw, host_yaw, want, facing", [
    ([10.0, 2.0, 20.0], 0.0, 0.0, [10.0, 2.0, 18.4], 180.0),   # at the pivot, north
    ([10.0, 2.0, 21.0], 0.0, 0.0, [10.0, 2.0, 18.4], 180.0),   # on the south edge
    ([10.0, 2.0, 20.0], 90.0, 90.0, [11.6, 2.0, 20.0], 270.0),  # counter and worker turned east
    ([10.0, 2.0, 20.0], 90.0, 0.0, [12.1, 2.0, 20.0], 270.0),   # across the counter's long side
])
def test_a_service_surface_is_served_across_the_host(worker, yaw, host_yaw, want, facing):
    host = {"id": "h", "assetId": COUNTER, "positionM": [10.0, 2.0, 20.0], "scale": 1.0}
    got = sk.interact_point(_work(worker, yaw, "h"), host, BOUNDS, sk.load_vocabulary(), host_yaw)
    assert got["kind"] == "customer"
    assert got["position"] == pytest.approx(want, abs=1e-3)
    assert got["facing"] == facing


def test_a_crafting_host_or_a_free_work_spot_is_used_where_the_worker_stands():
    vocab = sk.load_vocabulary()
    forge = {"id": "f", "assetId": FORGE, "positionM": [0.0, 0.0, 0.0], "scale": 1.0}
    for row, host in ((_work([1.0, 0.0, 2.0], 45.0, "f"), forge),
                      (_work([1.0, 0.0, 2.0], 45.0, "f", kind="station"), forge),
                      (_work([1.0, 0.0, 2.0], 45.0), None)):
        assert sk.interact_point(row, host, BOUNDS, vocab) == {
            "kind": "station", "position": [1.0, 0.0, 2.0], "facing": 45.0}
    assert sk.needs_interact(_work([0, 0, 0], 0)) and sk.needs_interact(_work([0, 0, 0], 0, kind="station"))
    assert not sk.needs_interact({"kind": "idle", "activity": "sit"})
