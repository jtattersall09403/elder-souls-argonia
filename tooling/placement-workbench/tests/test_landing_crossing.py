"""landingRule on crossing runs (audit10 c4, pub-crossings): a run whose two
ends are both dry is judged at each dry end by LANDING_FOOT_M (or a step),
and fails where the ground stands over a member's deck (floors zM)."""
from __future__ import annotations

from pathlib import Path

import pytest

import wb
from workbench import seat_rules

LAYOUT = (Path(__file__).resolve().parents[3] / "world/sources/blueprints"
          / "border-road-greenspring-crossings.layout.json")
RIVER = "parcel.border-road-greenspring-crossings.river-bridge"
INLET = "parcel.border-road-greenspring-crossings.inlet-deck"


@pytest.fixture(scope="module")
def cx(applied_layout):
    return applied_layout(LAYOUT)


@pytest.fixture(scope="module")
def cat(cx):
    return wb.place_catalogue(cx.placeId)


@pytest.fixture(autouse=True)
def no_compile(monkeypatch):
    monkeypatch.setattr(seat_rules, "compiled_y", lambda s: {})


def test_the_published_crossings_pass(cx, cat):
    out = seat_rules.landing(cat, cx.view())
    assert out["failures"] == [], out["failures"]
    assert out["runs"][RIVER]["crossing"] and out["runs"][INLET]["crossing"]


def test_a_crossing_end_0_4_m_over_the_marsh_fails(cx, cat):
    scene = cx.view()
    for k in range(9):
        scene.piece(f"rb-0{k}").y += 0.2          # the pre-fix river run (deck 0.40 over -0.05)
    fails = seat_rules.landing(cat, scene)["failures"]
    assert sum(f.startswith(RIVER) and "dry end" in f for f in fails) == 2, fails


def test_a_deck_run_into_the_bank_fails(cx, cat):
    scene = cx.view()
    scene.piece("ib-00").y -= 1.39 + 1.04         # the pre-fix ib-00: ground 1.04 m over its deck
    fails = seat_rules.landing(cat, scene)["failures"]
    assert any(f.startswith(INLET) and "over the deck of ib-00" in f for f in fails), fails
