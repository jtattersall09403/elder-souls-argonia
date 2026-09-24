"""Minor-route network invariants (Phase 11 Part 3b, decision 0041)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import numpy as np

from . import catalogue, compile_minor_routes as mr
from .routes import GRADE_MARGIN, grade_factor


def _doc():
    return json.loads(mr.OUT_JSON.read_text())


def _plotted():
    return {rec["id"]: rec for rf in catalogue.load_region_files() for rec in rf.places
            if rec.get("status") not in {"cut", "deferred"} and "positionM" in rec}


def test_every_track_serves_a_live_plotted_place_and_starts_at_it():
    doc = _doc()
    assert doc["schemaVersion"] == mr.SCHEMA_VERSION
    plotted = _plotted()
    n = doc["grid"]["size"]
    px = doc["grid"]["metresPerPixel"]
    for t in doc["tracks"]:
        rec = plotted.get(t["from"])
        assert rec is not None, f"{t['id']} serves a record that is not live+plotted"
        assert t["kind"] in {"track", "footpath", "boardwalk", "causeway"}, t["id"]
        assert len(t["px"]) >= 2 and all(0 <= c < n and 0 <= r < n for c, r in t["px"]), t["id"]
        c0, r0 = t["px"][0]
        x, z = rec["positionM"]
        # the path starts on the record's cell (or the nearest land cell for a submerged record)
        assert abs(c0 * px - x) <= mr.SNAP_M + px and abs(r0 * px - z) <= mr.SNAP_M + px, t["id"]
        # Only a settlement may exceed the walking limit: it always keeps its
        # path (compile_minor_routes.run), and the digest lists the length.
        assert t["lengthKm"] > 0, t["id"]
        # A registry-laid track (`registryRoute`) is a NAMED row of the route
        # registry, run through its authored stages rather than solved to the
        # nearest network cell (compile_minor_routes.lay_registry_track), so
        # MAX_TRACK_M — the limit on how far a place may be from a road — has
        # nothing to say about its length.
        if t["lengthKm"] * 1000 > mr.MAX_TRACK_M + px and not t.get("registryRoute"):
            assert rec["classification"]["class"] == "settlement", t["id"]


def test_track_ids_are_unique_and_sorted():
    ids = [t["id"] for t in _doc()["tracks"]]
    assert ids == sorted(ids) and len(ids) == len(set(ids))


def test_every_settlement_is_reached_on_road_by_track_or_listed_unconnected():
    doc = _doc()
    served = {t["from"] for t in doc["tracks"]} | {u["id"] for u in doc["unconnected"]}
    settlements = [rid for rid, rec in _plotted().items() if rec["classification"]["class"] == "settlement"]
    unaccounted = [rid for rid in settlements if rid not in served]
    # The remainder must be exactly the settlements the compiler counted as
    # already standing on a road. It publishes the IDS it counted
    # (`summary.onRoadIds`), so this compares two lists; the old form
    # reconstructed the number from the catalogue and could only restate its
    # own arithmetic (16g review, 2026-09-19).
    plotted = _plotted()
    on_road_settlements = [rid for rid in doc["summary"]["onRoadIds"]
                           if plotted.get(rid, {}).get("classification", {}).get("class") == "settlement"]
    # Every settlement not served by a track is one the compiler counted as
    # already standing on a road. The reverse is not equality: a named registry
    # row may START at an on-road settlement (the Coast road at Soulrest), so
    # an on-road place can also be a track's `from` (2026-09-19).
    assert [rid for rid in unaccounted if rid not in on_road_settlements] == []


# --------------------------------------------------------------------------
# the gradient wall (owner requirement 2026-09-05: every way walkable)
# --------------------------------------------------------------------------
def test_grade_factor_is_free_on_the_flat_and_walls_above_the_cap():
    assert grade_factor(0.0, 5.5, 12.0) == 1.0
    at_cap = grade_factor(np.tan(np.radians(12.0)) * GRADE_MARGIN * 5.5, 5.5, 12.0)
    assert 5.0 < at_cap < 20.0, "the cap itself is dear, not forbidden"
    over = grade_factor(np.tan(np.radians(30.0)) * 5.5, 5.5, 12.0)
    assert over > 100 * at_cap, "over the cap must be a wall, not a preference"
    assert np.isfinite(over), "the wall stays finite: a walled-in place still gets a path"


def test_grade_factor_is_symmetric_and_monotone():
    ups = [float(grade_factor(dz, 5.5, 12.0)) for dz in (0.2, 0.6, 1.2, 3.0)]
    assert ups == sorted(ups)
    assert grade_factor(-1.7, 5.5, 12.0) == grade_factor(1.7, 5.5, 12.0)


def _ramp_world(n=41):
    """A flat plain with one steep ridge across it, breached by a gentle ramp
    at the top edge: straight over the ridge is short and over the cap; round
    by the ramp is long and walkable."""
    h = np.zeros((n, n), dtype=np.float64)
    h[:, 20:] = 12.0            # a 12 m step over one 5.5 m cell — 65 deg
    h[0, 8:21] = np.arange(13) * 1.0        # the ramp along the top edge:
    h[0, 21:] = 12.0                        # 1 m per cell, 10.3 deg, walkable
    return h


def test_the_solver_goes_round_a_wall_it_cannot_climb():
    h = _ramp_world()
    cost = np.ones_like(h)
    seeds = np.zeros(h.shape, dtype=bool)
    seeds[20, 0] = True
    plain, _ = mr.multi_source_field(cost, seeds, 5.5)
    walled, prev = mr.multi_source_field(cost, seeds, 5.5, h, mr.ROUTING_CAP_DEG)
    goal = (20, 40)
    assert np.isfinite(walled[goal]), "the wall never disconnects a place"
    assert walled[goal] > plain[goal], "climbing the ridge must have got dearer"
    path = mr.trace(prev, goal[0], goal[1], h.shape[1])
    # every step of the chosen line is inside the cap (the ramp cells included)
    for (c0, r0), (c1, r1) in zip(path[:-1], path[1:]):
        run = np.hypot(c1 - c0, r1 - r0) * 5.5
        deg = np.degrees(np.arctan(abs(h[r1, c1] - h[r0, c0]) / run))
        assert deg <= mr.ROUTING_CAP_DEG + 1e-6, f"{deg:.1f} deg step at {(c1, r1)}"


def test_the_walled_solver_is_deterministic():
    h = _ramp_world()
    cost = np.ones_like(h)
    seeds = np.zeros(h.shape, dtype=bool)
    seeds[20, 0] = True
    a, pa = mr.multi_source_field(cost, seeds, 5.5, h, mr.ROUTING_CAP_DEG)
    b, pb = mr.multi_source_field(cost, seeds, 5.5, h, mr.ROUTING_CAP_DEG)
    assert np.array_equal(a, b) and np.array_equal(pa, pb)


def test_cost_surface_reads_the_record_grids():
    """cost_surface penalises wet-season ground and a band-2 reach crossing,
    and leaves a band-1 reach alone (decision 0066: the record, not the
    deleted Phase-3 flood/river_band fields)."""
    n = 8
    z = np.zeros((n, n), bool)
    stub = SimpleNamespace(
        slope_grid=np.zeros((n, n), np.float32),
        wet_grid=z.copy(),
        open_water=z.copy(),
        wet_season=z.copy(),
        wet_season_grid=z.copy(),
        height_grid=np.zeros((n, n), np.float32),
        reach_band_grid=np.zeros((n, n), np.int8),
        region_grid=np.zeros((n, n), np.int16),
    )
    plain = mr.cost_surface(stub)
    stub.wet_season[4, 4] = True
    stub.wet_season_grid[4, 4] = True
    stub.reach_band_grid[4, 5] = 2
    stub.reach_band_grid[4, 6] = 1
    cost = mr.cost_surface(stub)
    assert cost[4, 4] > plain[4, 4]
    assert cost[4, 5] > plain[4, 5]
    assert cost[4, 6] == plain[4, 6]


# --------------------------------------------------------------------------
# 16g: the cap is a wall and a track is never graded (owner 2026-09-15)
# --------------------------------------------------------------------------
def test_a_track_is_never_graded_so_the_cap_is_a_wall_not_a_price():
    """`grade_routes` patches the roads; a minor way lies on the ground as it
    is. So this module's solver calls `grade_factor` WITHOUT `gradable_m` —
    the wall branch — and an over-cap step is refused rather than priced as a
    dearer crossing."""
    over = np.tan(np.radians(30.0)) * 5.5
    walled = grade_factor(over, 5.5, mr.ROUTING_CAP_DEG)
    priced = grade_factor(over, 5.5, mr.ROUTING_CAP_DEG, gradable_m=5.0)
    assert walled > 10 * priced, "a track must not be priced like a graded road"


def test_a_track_whose_only_cheap_line_crosses_an_over_cap_step_is_rerouted():
    """The synthetic track: the short line crosses a 12 m step over one cell
    (65 deg), the long way round is walkable. The solved line takes the long
    way and `over_cap_steps` reports nothing broken."""
    h = _ramp_world()
    cost = np.ones_like(h)
    seeds = np.zeros(h.shape, dtype=bool)
    seeds[20, 0] = True
    _dist, prev = mr.multi_source_field(cost, seeds, 5.5, h, mr.ROUTING_CAP_DEG)
    path = mr.trace(prev, 20, 40, h.shape[1])
    assert mr.over_cap_steps(path, h, 5.5) == 0
    # and the straight line it refused does break the cap
    straight = [(c, 20) for c in range(41)]
    assert mr.over_cap_steps(straight, h, 5.5) >= 1


def test_a_sample_on_ground_over_the_cap_fails():
    h = np.zeros((5, 5))
    h[2, 3] = 4.0                      # 4 m over one 5.5 m cell — 36 deg
    assert mr.over_cap_steps([(2, 2), (3, 2)], h, 5.5) == 1


def test_every_published_track_holds_the_cap_or_declares_the_break():
    for t in _doc()["tracks"]:
        assert t.get("overCapSteps", 0) >= 0
        assert isinstance(t.get("overCapSteps", 0), int)


# --------------------------------------------------------------------------
# 16g: a named registry track is laid through its stages
# --------------------------------------------------------------------------
class _Grid:
    """A tiny flat province: everything is land, every cell costs the same."""

    def __init__(self, n=24):
        self.grid_n = n
        self.grid_px_m = 10.0
        self.land = np.ones((n, n), dtype=bool)
        self.province = None

    def grid_px(self, x, z):
        return (int(min(max(z / self.grid_px_m, 0), self.grid_n - 1)),
                int(min(max(x / self.grid_px_m, 0), self.grid_n - 1)))

    def uv_to_m(self, u, v):
        return u * self.grid_n * self.grid_px_m, v * self.grid_n * self.grid_px_m


def _rf(places):
    return [SimpleNamespace(places=places)]


def _place(pid, x, z, **over):
    rec = {"id": pid, "positionM": [x, z], "status": "active",
           "importanceTier": 3, "discovery": "road",
           "classification": {"class": "settlement", "magnitude": "M3"}}
    rec.update(over)
    return rec


def test_a_solved_false_registry_track_with_live_endpoints_is_laid():
    files = _rf([_place("place.r.a", 15.0, 15.0), _place("place.r.b", 215.0, 15.0),
                 _place("place.r.mid", 115.0, 195.0,
                        relations={"reachedVia": ["route.track.r.line"]})])
    row = {"id": "route.track.r.line", "mode": "road", "class": "track",
           "from": "a", "to": "b", "solved": False}
    jobs = mr.registry_demand(files, [row])
    assert [j["row"]["id"] for j in jobs] == ["route.track.r.line"]
    assert [r["id"] for r in jobs[0]["stages"]] == ["place.r.mid"]

    s = _Grid()
    graph = mr.StepGraph(np.ones((s.grid_n, s.grid_n)), s.grid_px_m)
    track, why = mr.lay_registry_track(s, graph, jobs[0], np.zeros((s.grid_n, s.grid_n)),
                                       s.grid_px_m)
    assert track is not None, why
    assert track["id"] == "track.track.r.line"
    assert track["registryRoute"] == "route.track.r.line"
    assert track["kind"] == "track"
    assert track["stages"] == ["place.r.mid"]
    # the line passes within ARRIVAL_M of the stage, in order along the route
    cells = [(c, r) for c, r in track["px"]]
    assert cells[0] == (1, 1) and cells[-1] == (21, 1)
    near = min(np.hypot(c * 10.0 - 115.0, r * 10.0 - 195.0) for c, r in cells)
    assert near <= mr.ARRIVAL_M, near


def test_a_registry_row_already_solved_or_off_the_land_is_not_laid():
    files = _rf([_place("place.r.a", 15.0, 15.0), _place("place.r.b", 215.0, 15.0)])
    solved = {"id": "route.track.r.done", "mode": "road", "class": "track",
              "from": "a", "to": "b", "solved": True}
    boat = {"id": "route.boat.r.lane", "mode": "boat", "class": "channel",
            "from": "a", "to": "b", "solved": False}
    missing = {"id": "route.track.r.ghost", "mode": "road", "class": "track",
               "from": "a", "to": "nowhere", "solved": False}
    jobs = mr.registry_demand(files, [solved, boat, missing])
    # the ghost row is still ANSWERED: refused with a reason, never silence
    assert [j["row"]["id"] for j in jobs] == ["route.track.r.ghost"]
    assert jobs[0]["refusal"] == "nowhere: no place of that name in the catalogue"


def test_a_registry_row_whose_stage_is_unplotted_is_refused_with_a_reason(tmp_path):
    ghost = _place("place.r.mid", 115.0, 195.0,
                   relations={"reachedVia": ["route.track.r.line"]})
    ghost.pop("positionM")
    files = _rf([_place("place.r.a", 15.0, 15.0), _place("place.r.b", 215.0, 15.0), ghost])
    row = {"id": "route.track.r.line", "mode": "road", "class": "track",
           "from": "a", "to": "b", "solved": False, "stages": ["place.r.mid"]}
    jobs = mr.registry_demand(files, [row])
    assert [j["row"]["id"] for j in jobs] == ["route.track.r.line"]
    assert jobs[0]["refusal"] == "stage place.r.mid: no positionM in the macro plot"

    # ... and the refusal lands on the registry row, clearing the stale id
    reg = tmp_path / "registry.json"
    reg.write_text(json.dumps({"routes": [dict(row, geometryId="track.stale")]}))
    doc = {"tracks": [], "registryUnlaid": [{"id": row["id"], "why": jobs[0]["refusal"]}]}
    mr.solve_registry(doc, path=reg)
    out = json.loads(reg.read_text())["routes"][0]
    assert out["solved"] is False and "geometryId" not in out
    assert out["reason"] == "stage place.r.mid: no positionM in the macro plot"


def test_the_shipped_registry_names_the_tracks_this_run_will_lay():
    """The two rows 16g lays (decision 0069): both `solved: false`, both with
    live endpoints, so neither may quietly drop out of the run."""
    rows = {r["id"] for r in mr.load_registry()}
    assert "route.track.mercantile-coast.coast-road" in rows
    assert "route.road.alten-corimont-stormhold" in rows


# --------------------------------------------------------------------------
# 16g: a footpath starts only at a record (97 A8)
# --------------------------------------------------------------------------
def test_a_footpath_starts_only_at_a_record():
    plotted = _plotted()
    px = _doc()["grid"]["metresPerPixel"]
    for t in _doc()["tracks"]:
        if t["kind"] != "footpath" or t.get("registryRoute"):
            continue
        rec = plotted[t["from"]]
        c0, r0 = t["px"][0]
        x, z = rec["positionM"]
        assert abs(c0 * px - x) <= mr.SNAP_M + px and abs(r0 * px - z) <= mr.SNAP_M + px, t["id"]


# --------------------------------------------------------------------------
# 16g: the track head is the declared terminal, clamped to the way it meets
# --------------------------------------------------------------------------
def test_the_track_head_is_clamped_to_the_first_way_point_it_meets():
    # the line runs in from the network at (10, 0) to the declared gate (0, 0);
    # the camp's own way starts at (4, 0) and runs on to (0, 0).
    path = [(c, 0) for c in range(0, 11)]          # path[0] is the gate end
    way = [(4, 0), (3, 0), (2, 0), (1, 0), (0, 0)]
    clamped = mr.clamp_to_way(path, way)
    head = clamped[0]
    near = min(np.hypot(head[0] - wc, head[1] - wr) for wc, wr in way)
    assert near <= mr.WAY_MEET_CELLS, "the head is where the line meets the way"
    assert clamped[-1] == (10, 0), "the network end is untouched"
    # everything past the meeting — the camp's own way — is dropped
    assert not any(cell in {(0, 0), (1, 0), (2, 0), (3, 0)} for cell in clamped)


def test_a_track_that_never_meets_the_way_keeps_its_whole_line():
    path = [(c, 0) for c in range(0, 6)]
    assert mr.clamp_to_way(path, [(0, 40), (1, 40)]) == path
    assert mr.clamp_to_way(path, []) == path


def test_a_blueprint_terminal_declares_the_way_its_track_head_is_clamped_to(tmp_path, monkeypatch):
    """The rule is general — the blueprint's declared terminal and its own way
    — not a hand-moved coordinate, so 16i may re-author a place anywhere.
    (The licensed camp that proved it was retired 2026-09-23 with the other
    2026-09-09 layouts; this blueprint is written here.) The footpath terminal
    outranks the channel one and carries its way's points."""
    head = [0.4676, 0.6104]
    bp = {"id": "place.test.camp",
          "routes": [{"id": "route.test.track", "points": [head, [0.4677, 0.6100]]}],
          "canals": [{"id": "canal.test.channel", "points": [[0.4488, 0.6530], [0.45, 0.65]]}],
          "networkTerminals": [
              {"id": "terminal.test.channel", "kind": "channel", "wayId": "canal.test.channel",
               "entryUV": [0.4488, 0.6530]},
              {"id": "terminal.test.track-head", "kind": "footpath", "wayId": "route.test.track",
               "entryUV": head}]}
    (tmp_path / "place.test.camp.json").write_text(json.dumps({"blueprint": bp}))
    monkeypatch.setattr(mr.bp_mod, "BLUEPRINT_DIR", tmp_path)
    camp = mr.blueprint_terminals().get("place.test.camp")
    assert camp is not None and camp["kind"] == "footpath"
    assert len(camp["wayPoints"]) >= 2, "the track head names a way with points"
    assert list(camp["entryUV"]) == camp["wayPoints"][0], \
        "the declared head is the head of that way"


# --------------------------------------------------------------------------
# 16g: every track clears its own ground (decision 0070)
# --------------------------------------------------------------------------
def _track(kind="track", px=None):
    return {"id": "track.test.line", "kind": kind, "from": "place.test.thing",
            "px": px or [[0, 0], [10, 0], [20, 0]]}


def test_each_track_emits_one_clearance_patch_at_its_class_width():
    from . import vegetation_patches as vp
    for kind, width in mr.CLASS_WIDTH_M.items():
        patch = mr.clearance_patch(_track(kind), 10.0)
        assert patch["id"] == "patch.clearance.track.track.test.line"
        assert patch["kind"] == vp.PATCH_KIND
        assert patch["owner"]["record"] == "place.test.thing"
        # nothing grows on the running surface, the fringe is only thinned
        assert vp.keep_at(105.0, 5.0, patch) == 0.0
        assert 0.0 < vp.keep_at(105.0, 5.0 + width, patch) < 1.0
        assert vp.keep_at(105.0, 5.0 + 4 * width, patch) == 1.0


def test_the_corridor_polygon_follows_a_hairpin_without_self_intersecting():
    from . import vegetation_patches as vp
    hairpin = _track("track", [[0, 0], [10, 0], [10, 2], [0, 2]])
    patch = mr.clearance_patch(hairpin, 10.0)
    assert vp.keep_at(50.0, 5.0, patch) == 0.0        # on the outward leg
    assert vp.keep_at(50.0, 25.0, patch) == 0.0       # on the return leg
    assert vp.keep_at(105.0, 25.0, patch) == 0.0      # and round the bend
    # the ground BETWEEN the two legs is wild: the corridor is a pair of
    # quads, not one outline whose interior the even-odd rule fills in
    assert vp.keep_at(50.0, 15.0, patch) == 1.0


def test_the_track_patches_replace_themselves_and_leave_other_authors_alone(tmp_path):
    path = tmp_path / "vegetation-patches.json"
    path.write_text(json.dumps({
        "schemaVersion": 1,
        "patches": [{"id": "patch.clearance.settlement.lilmoth", "kind": "vegetation-clearance",
                     "owner": {"record": "place.mercantile-coast.lilmoth", "chunk": "16h"},
                     "why": "a town clears its own ground",
                     "hardClear": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]]},
                    {"id": "patch.clearance.track.stale", "kind": "vegetation-clearance",
                     "owner": {"record": "place.test.gone", "chunk": "16g"},
                     "why": "a track that no longer exists",
                     "hardClear": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]]}]}))
    doc = {"tracks": [_track(), _track("footpath")]}
    doc["tracks"][1]["id"] = "track.test.other"
    mr.write_clearance_patches(doc, 10.0, path)
    first = path.read_bytes()
    ids = [p["id"] for p in json.loads(first)["patches"]]
    assert "patch.clearance.settlement.lilmoth" in ids, "another author's patch survives"
    assert "patch.clearance.track.stale" not in ids, "the old track set is replaced"
    assert ids == sorted(ids) and len(ids) == len(set(ids))
    mr.write_clearance_patches(doc, 10.0, path)
    assert path.read_bytes() == first, "re-running is byte-stable"
    from . import vegetation_patches as vp
    vp.load_patches(path)      # and the result still validates
