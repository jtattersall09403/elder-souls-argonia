"""anchor_landing_run on Claywater's numbers (16k walk 2, place-diag P3):
start (337, 3002) on the bank, berth (348, 3007.5) at the ferry raft, water
surface 35.24 (body.221-1650), depth 1.53 m at 1 m out, 3.03 at 2 m,
2.4-2.96 to 5 m, then 1.5-1.7 to the raft. Landward ground along the
bearing is the frozen survey sampled 2026-09-27 (/tmp/t3/claywater-profile.txt):
35.414 within 2 m of the start, 35.263 to 5 m, 35.043 to 9 m.
The pieces are laid at the plugins' placed scale (steps02 and bridge01 at 2.0,
`placedScaleMedian`; decision 0103): a 9.7 m pitch."""

import json
import math

import pytest

from worldgen.anchor_landing_run import DRY_MARGIN_M, kit_rows, lay_landing_run

STEP = "bmv:architecture/huts/exterior/steps02"
DECK = "bmv:architecture/huts/exterior/bridge01"
WATER = 35.24
START, BERTH = (337.0, 3002.0), (348.0, 3007.5)
SPAN = math.hypot(BERTH[0] - START[0], BERTH[1] - START[1])
DIR = ((BERTH[0] - START[0]) / SPAN, (BERTH[1] - START[1]) / SPAN)
WET = [(1.0, WATER - 1.53), (2.0, WATER - 3.03), (5.0, WATER - 2.7), (1e9, WATER - 1.6)]


def claywater_ground(landward):
    def ground(x, z):
        t = (x - START[0]) * DIR[0] + (z - START[1]) * DIR[1]
        if t <= 0.0:
            return landward(t)
        return next(h for edge, h in WET if t < edge)
    return ground


def today(t):
    return 35.414 if t > -2.0 else 35.263 if t > -5.0 else 35.043


def levelled(t):
    return WATER + 0.3


@pytest.fixture(scope="module")
def kit():
    return kit_rows(["route-spans-v1"])


def test_todays_bank_fails_the_dry_ground_gate(kit):
    """Today's frozen bank never stands 0.2 m over the water within reach:
    the gate refuses every piece count (captures the P3 defect)."""
    r = lay_landing_run(START, BERTH, STEP, DECK, claywater_ground(today), WATER, *kit)
    assert r["ok"] is False
    assert r["footMinGroundM"] < WATER + DRY_MARGIN_M
    assert "gate needs 35.44" in r["why"]


def test_steps02_and_two_bridge01_at_placed_scale_reach_the_berth_from_a_dry_bank(kit):
    r = lay_landing_run(START, BERTH, STEP, DECK, claywater_ground(levelled), WATER, *kit)
    assert r["ok"] is True, r["why"]
    assert r["scale"] == 2.0 and all(p["scale"] == 2.0 for p in r["pieces"])
    assert r["deckPieces"] == 2
    assert [p["asset"] for p in r["pieces"]] == [STEP] + [DECK] * 2
    # the mined pitch (4.85 m in the unit frame) times the placed scale
    (x0, z0), (x1, z1) = [(p["xM"], p["zM"]) for p in r["pieces"][1:3]]
    assert math.hypot(x1 - x0, z1 - z0) == pytest.approx(9.7, abs=0.02)
    assert r["endToBerthM"] <= 1.0
    assert r["openEnds"] == []
    assert r["tipGroundM"] >= WATER + DRY_MARGIN_M
    assert all(p["pair"].startswith("piece:") for p in r["pieces"][1:])
    # the run is shifted landward so the whole step piece stands on the bank
    assert r["shiftM"] == pytest.approx(-17.0, abs=0.1)
    assert all(p["deckOverWaterM"] > 0 for p in r["pieces"][1:])


def test_one_deck_piece_would_stand_the_step_piece_in_water(kit):
    r = lay_landing_run(START, BERTH, STEP, DECK, claywater_ground(levelled), WATER, *kit,
                        deck_counts=[1])
    assert r["ok"] is False
    assert r["footMinGroundM"] < WATER


def test_scale_override_lays_at_kit_scale(kit):
    """`scale=1.0` lays the kit-scale run (4.85 m pitch): steps02 + 3 bridge01."""
    r = lay_landing_run(START, BERTH, STEP, DECK, claywater_ground(levelled), WATER, *kit,
                        scale=1.0)
    assert r["ok"] is True, r["why"]
    assert r["deckPieces"] == 3
    assert r["shiftM"] == pytest.approx(-7.2, abs=0.1)


def test_sideways_pair_offsets_still_end_on_the_berth(kit):
    """A deck pair that steps 0.3 m sideways turns the run, never misses the berth."""
    from worldgen.blueprint_footprints import abuts_record
    abuts = json.loads(json.dumps(abuts_record()))
    for row in abuts["pairs"]:
        if row["parent"] == DECK and row["child"] == DECK and row["joint"] == "run":
            row["offsetM"][0] = 0.3
    r = lay_landing_run(START, BERTH, STEP, DECK, claywater_ground(levelled), WATER, *kit,
                        abuts=abuts)
    assert r["ok"] is True, r["why"]
    assert r["endToBerthM"] <= 0.1
