"""16k walk 6 (owner): the Riverwalk boardwalk turned by butting two
straights at a right angle (the rail of the piece you stood on barred the
turn), started on a steep bump beside flat ground, and a lantern hung in the
house doorway. `walkwayRule` (workbench/walkway.py) walks a capsule along
every run and door approach; `workbench/boardwalk.py` routes a boardwalk
(flat ends, the straight when clear, else one turn on a junction piece).
Synthetic cases always run; the layout case needs the raw kit builds."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import boardwalk, walkway  # noqa: E402


class Ground:
    """Water at 0 over a -1 m bed; dry pads 0.3 m up; an optional ridge
    (2 m high) and a bump (a 1.5 m cone) on the first pad."""

    def __init__(self, pads, ridge=None, bump=None):
        self.pads, self.ridge, self.bump = pads, ridge, bump

    def height(self, x, z, source="chunks"):
        if self.ridge and self.ridge[0] <= x <= self.ridge[1] and self.ridge[2] <= z <= self.ridge[3]:
            return 2.0
        for (cx, cz, r) in self.pads:
            if math.hypot(x - cx, z - cz) <= r:
                h = 0.3
                if self.bump and math.hypot(x - self.bump[0], z - self.bump[1]) <= 1.5:
                    h += 1.5 - math.hypot(x - self.bump[0], z - self.bump[1])
                return h
        return -1.0

    def water_level(self, x, z):
        return None if self.height(x, z) > 0 else 0.0


def test_straight_when_clear_and_ends_flat():
    g = Ground([(0, 0, 8), (0, 100, 8)], bump=(0, 7))
    r = boardwalk.plan(g, (0, 7), (0, 94), step_m=7.28, width_m=4.0, slope_fn=walkway._slope_deg,
                       junction_m=7.28)
    assert r["turns"] == [] and len(r["legs"]) == 1
    sx, sz = r["start"][:2]
    assert math.hypot(sx - 0, sz - 7) > 2.5, "the start must not sit on the bump"
    assert walkway._slope_deg(g, sx, sz) <= boardwalk.FLAT_PICK_DEG


def test_one_turn_on_a_junction_when_the_straight_is_blocked():
    g = Ground([(0, 0, 8), (60, 100, 8)], ridge=(-5, 45, 40, 60))
    r = boardwalk.plan(g, (0, 6), (60, 94), step_m=7.28, width_m=4.0, slope_fn=walkway._slope_deg,
                       junction_m=7.28)
    assert r["rejected"] and r["rejected"][0].startswith("straight")
    assert len(r["turns"]) == 1 and len(r["legs"]) == 2
    t = r["turns"][0]
    assert round((t["toBearing"] - t["fromBearing"]) % 360) in (90, 270)
    ops, binds = boardwalk.ops_for(r, "parcel.x.run", "vanilla:architecture/docks/dockstrent02",
                                   prefix="bw", step_m=7.28,
                                   junction="vanilla:architecture/docks/dockstr4way01")
    geo = [o for o in ops if o["op"] == "snap" and o["by"] == "geometry"]
    # the only face-to-face snaps are onto and off the junction: never straight to straight at an angle
    assert len(geo) == 2 and geo[0]["child"] == "bwj0" and geo[1]["parent"] == "bwj0"
    assert [b["index"] for b in binds] == list(range(len(binds)))


def _world(boxes):
    import trimesh
    w = walkway._World.__new__(walkway._World)
    parts = [(uid, trimesh.creation.box(bounds=[lo, hi])) for uid, (lo, hi) in boxes]
    w.mesh = trimesh.util.concatenate([b for _u, b in parts])
    w.face_uid = np.concatenate([np.full(len(b.faces), i) for i, (_u, b) in enumerate(parts)])
    w.uids = [u for u, _b in parts]
    return w


def test_a_rail_across_the_way_blocks_and_a_clear_deck_passes():
    g = Ground([(0, 0, 3), (0, -20, 3)])
    # wb frame: x east, y NORTH (= -z), z up; a deck from z 0 to z -20, top 0.35
    pts = [(0, -1), (0, -19)]
    deck = ("deck", ([-2, 0, 0.25], [2, 20, 0.35]))
    rail = ("rail", ([-2, 9.9, 0.35], [2, 10.1, 1.2]))
    clear = walkway.walk_line(_world([deck]), g, pts, 0.45, 0.3, start_y=0.35)
    assert clear["blocks"] == []
    blocked = walkway.walk_line(_world([deck, rail]), g, pts, 0.45, 0.3, start_y=0.35)
    assert blocked["blocks"] and blocked["blocks"][0]["uid"] == "rail"
    hole = walkway.walk_line(_world([("a", ([-2, 0, 0.25], [2, 9, 0.35])),
                                     ("b", ([-2, 10, 0.25], [2, 20, 0.35]))]), g, pts, 0.45, 0.3,
                             start_y=0.35)
    assert any(b["kind"] == "gap" for b in hole["blocks"])
    crack = walkway.walk_line(_world([("a", ([-2, 0, 0.25], [2, 9.95, 0.35])),
                                      ("b", ([-2, 10.0, 0.25], [2, 20, 0.35]))]), g, pts, 0.45, 0.3,
                              start_y=0.35)
    assert crack["blocks"] == [], "a crack narrower than the capsule never drops it"


def test_walkway_fails_on_the_walked_riverwalk_layout(tmp_path):
    """The layout the owner walked (HEAD 2026-09-30): the corner lw11>le00,
    the lantern in the doorway and the start on the bump are all named."""
    from workbench import paths
    if not (paths.RAW_KITS / "docks-v1.glb").exists():
        pytest.skip("raw kit builds absent (local only)")
    import wb
    fx = HERE.parent / "fixtures/riverwalk-walk6.layout.json"
    wb.main(["apply", str(fx), "--scene", str(tmp_path / "rw6.json"), "--no-compile",
             "--allow-stale-ground"])
    from workbench.kits import Catalogue
    from workbench.scene import Scene
    out = walkway.walkway(Catalogue(), Scene.load(tmp_path / "rw6.json"))
    text = "\n".join(out["failures"])
    assert "le00~lw11" in text                         # the right-angle butt joint
    assert "c-doorlamp" in text                        # the lantern in the doorway
    assert "the-long-walk not-flat" in text            # the start on the bump


def test_a_water_gap_before_the_door_does_not_hide_its_arrival():
    """Walk 6 publish: `door_arrival` read only blocks[0]; a water gap ahead
    of the door left the host's sill block standing as a false block."""
    g = Ground([(0, 0, 30)])
    world = _world([("house", ([-2, 0, 0.25], [2, 20, 0.35]))])
    reach = {"reachM": 1.5, "verticalM": 0.6}
    row = {"lengthM": 10.0, "blocks": [
        {"kind": "gap", "atM": 3.0, "toM": 5.0, "uid": "water", "why": "open water"},
        {"kind": "block", "atM": 9.6, "toM": 10.0, "uid": "house", "standY": 0.3, "why": "sill"}]}
    walkway.door_arrival(world, g, row, [(0, -1), (0, -10)], "house", reach)
    assert [b["kind"] for b in row["blocks"]] == ["gap"]
    assert row["arrival"]["stopM"] == 0.6


def test_a_probe_reads_wet_vertices_from_the_fine_depth_raster():
    from workbench import measure

    class G:
        def chunk_height(self, x, z): return 0.0
        def survey_height(self, x, z): return 0.0
        def wet(self, x, z): return False              # the coarse flag misses it
        def depth(self, x, z): return 1.3
        def footprint_max_slope_deg(self, poly): return 0.0

    class Cat:
        pass

    orig = measure.footprint_province
    measure.footprint_province = lambda cat, p: [(0, 0), (1, 0), (1, 1)]
    try:
        out = measure.ground_report(Cat(), G(), type("P", (), {"y": None, "role": None})())
    finally:
        measure.footprint_province = orig
    assert out["wetVertices"] == 3


def test_a_hollow_shells_every_doorway_is_judged_for_fixtures(monkeypatch):
    """Ruling R89: a lantern in ANY doorway opening is red, bound or not
    (a hollow shell has no bound cell; its second doorway is not `best`)."""
    from types import SimpleNamespace
    from workbench import measure
    shell = SimpleNamespace(uid="hollow-house")
    rows = [{"thresholdM": [0, 0], "facingDeg": 0.0, "source": "piece"},
            {"thresholdM": [5, 0], "facingDeg": 90.0, "source": "interiors/approach"},
            {"thresholdM": [9, 9], "facingDeg": 180.0, "source": "landing"}]
    monkeypatch.setattr(measure, "door_report",
                        lambda cat, scene, p: {"best": rows[0], "doorways": rows})
    got = walkway.door_openings(None, SimpleNamespace(pieces=[shell]))
    assert [t for _d, t in got] == [(0.0, 0.0), (5.0, 0.0)]
    monkeypatch.setattr(walkway, "door_fixtures",
                        lambda cat, scene, d, t: ["c-lamp"] if t == (5.0, 0.0) else [])
    seen = [u for d, t in got for u in walkway.door_fixtures(None, None, d, t)]
    assert seen == ["c-lamp"]


def test_a_bump_on_the_step_off_is_steep_and_a_bank_beside_the_deck_is_not():
    """Walk 6 (owner: the boardwalk started from the edge of a small steep
    bump beside flat ground): the ground a walker steps onto past a run's
    end is judged over STEP_OFF_M x ±STEP_OFF_HALF_M; a bank or bump beside
    the deck (not on the way on) is not (Claywater's landing stage, lead)."""
    # the end at (0, 0), the way on running -z (north); the pad is flat 0.3 m
    on_way = Ground([(0.0, 0.0, 20.0)], bump=(0.0, -2.0))
    deg, at = walkway._step_off_slope_deg(on_way, 0.0, 0.0, (0.0, -1.0))
    assert deg > walkway.FLAT_DEG, (deg, at)
    beside = Ground([(0.0, 0.0, 20.0)], bump=(4.0, 1.0))       # 4 m off, alongside the deck
    deg, _ = walkway._step_off_slope_deg(beside, 0.0, 0.0, (0.0, -1.0))
    assert deg <= walkway.FLAT_DEG, deg
    bank = Ground([(0.0, 0.0, 20.0)], ridge=(2.6, 6.0, -1.0, 8.0))   # a 2 m bank beside the deck
    deg, _ = walkway._step_off_slope_deg(bank, 0.0, 0.0, (0.0, -1.0))
    assert deg <= walkway.FLAT_DEG, deg
