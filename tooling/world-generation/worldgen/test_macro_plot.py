"""Macro plot invariants (Phase 11 Part 3, decision 0041).

Fast tests read the committed catalogue; the one slow test re-solves the plot
(~25 s) and proves the committed positions are what the solver produces —
the determinism standard (6) applied to the plot.
"""

from __future__ import annotations

import json
import math

import pytest

from . import catalogue, macro_plot
from .site_fields import ProvinceSurvey

ANCHORS = json.loads(macro_plot.REPO_ROOT.joinpath("world/sources/anchors/settlement-anchors.json").read_text())


def _live():
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            if rec.get("status") not in {"cut", "deferred"}:
                yield rf.region, rec


def test_every_live_record_is_plotted_with_a_why():
    missing = [rec["id"] for _z, rec in _live()
               if rec.get("workflow") not in {"plotted", "authored", "frozen"}
               or "position" not in rec or not rec.get("whySiteWon")]
    assert not missing, f"unplotted live records: {missing[:10]} (+{max(0, len(missing) - 10)})"


def test_deferred_and_cut_records_carry_no_position():
    stray = [rec["id"] for rf in catalogue.load_region_files() for rec in rf.places
             if rec.get("status") in {"cut", "deferred"} and "position" in rec]
    assert not stray


def test_settlement_anchors_keep_their_owner_approved_positions():
    by_slug = {a["id"]: a for a in ANCHORS["anchors"]}
    seen = set()
    for _z, rec in _live():
        slug = rec["id"].rsplit(".", 1)[-1]
        if rec["importanceTier"] == 0 and slug in by_slug:
            a = by_slug[slug]
            assert abs(rec["position"]["u"] - a["u"]) < 1e-6 and abs(rec["position"]["v"] - a["v"]) < 1e-6, rec["id"]
            seen.add(slug)
    assert seen == set(by_slug), f"anchors without a tier-0 catalogue record: {set(by_slug) - seen}"


def test_positions_are_inside_the_province_and_in_the_report():
    rep = json.loads(macro_plot.REPORT_JSON.read_text())
    assert rep["schemaVersion"] == macro_plot.SCHEMA_VERSION
    n = 0
    for _z, rec in _live():
        u, v = rec["position"]["u"], rec["position"]["v"]
        assert 0.0 <= u <= 1.0 and 0.0 <= v <= 1.0, rec["id"]
        n += 1
    assert rep["demand"]["plotted"] == n
    assert rep["demand"]["homelessUnresolved"] == 0, "the homeless batch must be resolved or recorded as cut/deferred"


def test_no_two_live_places_share_ground():
    """Two dots closer than the tightest relaxed spacing is a solver bug."""
    pts = [(rec["id"], rec["positionM"]) for _z, rec in _live()]
    floor = macro_plot.RELATED_MIN_M * 0.5 - 1e-6
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            d = math.hypot(pts[i][1][0] - pts[j][1][0], pts[i][1][1] - pts[j][1][1])
            assert d >= floor, f"{pts[i][0]} and {pts[j][0]} are {d:.0f} m apart"


def test_places_stay_within_spill_distance_of_their_zone():
    rep = json.loads(macro_plot.REPORT_JSON.read_text())
    for zone, z in rep["byZone"].items():
        assert z["plotted"] == z["live"], zone


def test_resolve_reproduces_the_committed_plot():
    """Determinism: a fresh solve lands every record exactly where the
    catalogue says it is. Slow (~25 s); the whole point of the seed."""
    s = ProvinceSurvey()
    recipes = macro_plot.load_recipes()
    demands, _files = macro_plot.build_demand(recipes)
    cands = macro_plot.load_scour(s) + macro_plot.free_ground(s, macro_plot.DEFAULT_SEED) \
        + macro_plot.roadside_ground(s, macro_plot.DEFAULT_SEED)
    macro_plot.attach_zone_distances(s, cands)
    result, unresolved = macro_plot.assign(demands, cands, s, s.anchor_points_m)
    assert not unresolved
    committed = {rec["id"]: rec["positionM"] for _z, rec in _live()}
    for did, r in result.items():
        c = r["candidate"]
        assert committed[did] == [round(c.x, 1), round(c.z, 1)], did
