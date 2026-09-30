"""landingRule's wade-step end (16k walk 6, Riverwalk's west boards): a run
whose both ends stand in water is closed only where it ends in a step piece
posed by a mined pair, its foot in wadeable water, where a way arrives.
Pure fakes: no kit build, no ground window."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import rules, seat_rules  # noqa: E402

END = (0.0, 0.0)


class Ground:
    def __init__(self, depth):
        self.depth = depth

    def water_level(self, x, z):
        return 0.0

    def chunk_height(self, x, z):
        return -self.depth


def piece(uid, asset, settled):
    return SimpleNamespace(uid=uid, asset=asset, settledBy=settled)


def scene(path_end=(1.0, 0.5)):
    return SimpleNamespace(paths=[{"id": "route.x.track", "pointsM": [[-20.0, 0.0], list(path_end)]}])


def run(monkeypatch, *, depth=0.57, settled="evidence-snap:wb01",
        asset="vanilla:architecture/docks/dockstepsdown01", path_end=(1.0, 0.5)):
    monkeypatch.setattr(rules, "_ends", lambda cat, q: [(0.2, 0.0), (7.0, 0.0)])
    members = [piece("wb00", "vanilla:architecture/docks/dockstrent02", "settle:piled:chunks"),
               piece("wb02", asset, settled)]
    return seat_rules.wade_step_end(None, scene(path_end), Ground(depth), members, (END, (30.0, 0.0)))


def test_closes_on_a_paired_step_in_wadeable_water_where_a_way_ends(monkeypatch):
    got = run(monkeypatch)
    assert got == {"step": "wb02", "end": [0.0, 0.0], "depthM": 0.57, "way": "route.x.track"}


def test_stays_open_too_deep(monkeypatch):
    assert run(monkeypatch, depth=1.2) is None


def test_stays_open_on_a_hand_placed_step(monkeypatch):
    assert run(monkeypatch, settled="settle:piled:chunks") is None


def test_stays_open_with_no_step_piece(monkeypatch):
    assert run(monkeypatch, asset="vanilla:architecture/docks/dockstrsol01") is None


def test_stays_open_where_no_way_arrives(monkeypatch):
    assert run(monkeypatch, path_end=(12.0, 5.0)) is None


# ---- the step's own pose: its `double` pair is the design (R90)

import wb  # noqa: E402

GOT = {"gapM": 0.0, "penetrationM": 0.195, "contact": True, "intersecting": True}


def pair(monkeypatch, joint):
    monkeypatch.setattr(wb.snap, "evidence_steps", lambda pa, ca: [{"joint": joint}])
    sol = SimpleNamespace(uid="wb01", asset="vanilla:architecture/docks/dockstrsol01",
                          settledBy="evidence-snap:wb00", role={})
    stair = SimpleNamespace(uid="wb02", asset="vanilla:architecture/docks/dockstepsdown01",
                            settledBy="evidence-snap:wb01", role={})
    return wb._pair_verdict(sol, stair, GOT)


def test_a_double_pair_in_its_plugin_pose_is_judged_on_contact(monkeypatch):
    assert pair(monkeypatch, "double") == {"relation": "designed-abut", "ok": True}


def test_a_run_pair_keeps_the_run_joint_bar(monkeypatch):
    got = pair(monkeypatch, "run")
    assert got["relation"] == "run-joint" and got["ok"] is False


def test_the_sill_skips_a_wet_step_posed_by_its_pair_only():
    cs = SimpleNamespace(asset_fit=lambda row: "stilt", retaining_sill=lambda *a: None)
    row = {"anchorClass": "ground"}
    wet = SimpleNamespace(wet=True, settledBy="evidence-snap:wb01")
    assert wb._sill(None, None, wet, row, cs) == {}
    hand = SimpleNamespace(wet=True, settledBy="settle:chunks", y=None, x=0.0, z=0.0, scale=1.0)
    g = SimpleNamespace(depth=lambda x, z: 0.66, survey_height=lambda x, z: -0.6, pad_index=None)
    row["placement"] = {"anchorMode": "pivot"}
    assert wb._sill(None, g, hand, row, cs)["sillRule"]
