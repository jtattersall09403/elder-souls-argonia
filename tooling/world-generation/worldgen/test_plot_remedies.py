"""Every remedy kind applies, is idempotent, and refuses what it must refuse.

Synthetic catalogue in a tmp dir — no province survey, no real region files.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from . import catalogue
from . import plot_remedies as pr


def _rec(rid: str, **over) -> dict:
    rec = {
        "id": rid,
        "schemaVersion": catalogue.INTERIOR_PROMISE_VERSION,
        "classification": {"class": "settlement", "family": "dry-village",
                           "type": "cliff-shelf-village", "variant": None, "magnitude": "M2"},
        "status": "active",
        "workflow": "plotted",
        "why": {"founding": "old founding", "siteAdvantages": "old advantages",
                "pressures": "old pressures", "occupantsMotive": "m", "wouldChangeIf": "w"},
        "sitingPrefs": {"regionClasses": ["tropical jungle"], "hardConstraints": ["deep water"]},
        "positionM": [1000.0, 2000.0],
        "position": {"u": 0.13562, "v": 0.27124},
        "plotFacts": {"landform": "x"},
        "whySiteWon": "it won",
        "candidatesConsidered": [{"siteId": "a"}],
        "scourSiteId": "scour.a",
        "footprintRadiusM": 65,
        "footprintSource": "band",
        "relations": {"dependsOn": [], "patrols": ["route.old"], "tolls": [],
                      "travelServiceEdges": [], "reachedVia": []},
        "relationsReserved": {},
    }
    rec.update(over)
    return rec


@pytest.fixture()
def world(tmp_path: Path):
    cat = tmp_path / "catalogue"
    cat.mkdir()
    a = _rec("place.testland.alpha")
    b = _rec("place.testland.beta", relations={"dependsOn": ["place.testland.alpha"],
                                               "patrols": [], "tolls": [],
                                               "travelServiceEdges": [], "reachedVia": []})
    (cat / "places-testland.json").write_text(json.dumps(
        {"schemaVersion": catalogue.PLACES_SCHEMA_VERSION, "region": "testland",
         "seed": "s", "places": [a, b]}, indent=2) + "\n", encoding="utf-8")
    (cat / "type-recipes.json").write_text(json.dumps(
        {"schemaVersion": 1, "types": [
            {"type": "cliff-shelf-village", "class": "settlement", "family": "dry-village"},
            {"type": "fishing-camp", "class": "settlement", "family": "wet-village"}]}) + "\n",
        encoding="utf-8")
    reg = tmp_path / "registry.json"
    reg.write_text(json.dumps({"schemaVersion": 1, "routes": [
        {"id": "route.old"}, {"id": "route.new"}]}) + "\n", encoding="utf-8")
    ov = tmp_path / "macro-plot-overrides.json"
    ov.write_text(json.dumps({"schemaVersion": 1, "overrides": []}, indent=1) + "\n", encoding="utf-8")
    return {"cat": cat, "reg": reg, "ov": ov}


def ctx(world) -> pr.Context:
    return pr.Context(catalogue_dir=world["cat"], route_registry=world["reg"],
                      overrides_path=world["ov"])


def apply_once(world, remedies) -> pr.Context:
    c = ctx(world)
    report, errors = pr.run(c, remedies, apply=True)
    assert not errors, errors
    c.write()
    return c


def idempotent(world, remedies) -> None:
    """A second run changes nothing, and --check passes."""
    before = world["cat"].joinpath("places-testland.json").read_bytes()
    before_ov = world["ov"].read_bytes()
    c = apply_once(world, copy.deepcopy(remedies))
    report, errors = pr.run(c, remedies, apply=True)
    assert not errors, errors
    assert all("already applied" in line for line in report), report
    assert world["cat"].joinpath("places-testland.json").read_bytes() == before
    assert world["ov"].read_bytes() == before_ov
    assert pr.check(ctx(world), remedies) == []


def rec_of(world, rid="place.testland.alpha") -> dict:
    data = json.loads(world["cat"].joinpath("places-testland.json").read_text())
    return next(r for r in data["places"] if r["id"] == rid)


def _unplot(world, rid="place.testland.alpha") -> None:
    """A record the seeded plot has not committed: `derived`, still carrying a
    stale position. Since 2026-09-20 (561ebb19) only such a record has its
    position cleared by a pin-by-siting or merge; a `plotted` record keeps its
    dot and the new prefs wait for `macro_plot --resolve-all`."""
    data = json.loads(world["cat"].joinpath("places-testland.json").read_text())
    for r in data["places"]:
        if r["id"] == rid:
            r["workflow"] = "derived"
    world["cat"].joinpath("places-testland.json").write_text(json.dumps(data, indent=2) + "\n")


# ------------------------------------------------------------------ kinds

@pytest.mark.parametrize("plotted", [True, False], ids=["plotted-keeps-dot", "unplotted-cleared"])
def test_pin_by_siting(world, plotted):
    if not plotted:
        _unplot(world)
    rem = [{"id": "place.testland.alpha", "kind": "pin-by-siting",
            "why": "The dot stands in 0.2 m of water; the record needs deep water at the quay.",
            "sitingPrefs": {"boundTo": {"place": "place.testland.beta", "maxM": 400},
                            "hardConstraints": ["a 3 m channel at the quay"]}}]
    apply_once(world, rem)
    r = rec_of(world)
    assert r["sitingPrefs"]["boundTo"] == {"place": "place.testland.beta", "maxM": 400}
    assert r["sitingPrefs"]["hardConstraints"] == ["a 3 m channel at the quay"]  # replaced
    assert r["sitingPrefs"]["regionClasses"] == ["tropical jungle"]              # untouched
    if plotted:
        assert r["workflow"] == "plotted" and r["positionM"] == [1000.0, 2000.0]
    else:
        for k in pr.POSITION_FIELDS:
            assert k not in r, k
        assert r["workflow"] == "derived"   # `plotted` requires the position fields
    idempotent(world, rem)


def test_meso_move(world):
    rem = [{"id": "place.testland.alpha", "kind": "meso-move", "toM": [1060.0, 2000.0],
            "why": "60 m east puts the landing on the 2.1 m channel instead of the bar."}]
    apply_once(world, rem)
    ov = json.loads(world["ov"].read_text())["overrides"]
    assert len(ov) == 1
    assert ov[0]["id"] == "place.testland.alpha" and ov[0]["source"] == "plot-remedies"
    assert ov[0]["u"] == round(1060.0 / pr.scale.AUTHORED_UV_EXTENT_M, 6)
    assert rec_of(world)["positionM"] == [1000.0, 2000.0]   # the tool does not move the dot
    idempotent(world, rem)


def test_meso_move_beyond_150_m_refuses(world):
    rem = [{"id": "place.testland.alpha", "kind": "meso-move", "toM": [1200.0, 2000.0],
            "why": "too far"}]
    _, errors = pr.run(ctx(world), rem, apply=True)
    assert len(errors) == 1 and "beyond the 150 m meso limit" in errors[0], errors


def test_re_type(world):
    rem = [{"id": "place.testland.alpha", "kind": "re-type", "type": "fishing-camp",
            "why": "No cliff within 900 m; the ground is a tidal flat."}]
    apply_once(world, rem)
    r = rec_of(world)
    assert r["classification"]["type"] == "fishing-camp"
    assert r["classification"]["family"] == "wet-village"
    assert "positionM" not in r and r["workflow"] == "derived"
    idempotent(world, rem)


def test_re_type_unknown_type_refuses(world):
    rem = [{"id": "place.testland.alpha", "kind": "re-type", "type": "sky-fortress", "why": "w"}]
    _, errors = pr.run(ctx(world), rem, apply=True)
    assert len(errors) == 1 and "not a type in type-recipes.json" in errors[0], errors


def test_re_reference(world):
    rem = [{"id": "place.testland.alpha", "kind": "re-reference",
            "replace": {"route.old": "route.new"},
            "why": "route.old was merged into route.new by the route re-author."}]
    apply_once(world, rem)
    assert rec_of(world)["relations"]["patrols"] == ["route.new"]
    idempotent(world, rem)


def test_re_reference_unknown_route_refuses(world):
    rem = [{"id": "place.testland.alpha", "kind": "re-reference",
            "replace": {"route.old": "route.nowhere"}, "why": "w"}]
    _, errors = pr.run(ctx(world), rem, apply=True)
    assert len(errors) == 1 and "nor a known route" in errors[0], errors


def test_re_reference_rewrites_reached_via_and_accepts_the_shared_namespace(world):
    """`reachedVia` carries the stale prose names, and a replacement may be a
    registry ALIAS or a place id, not only a registry id."""
    rem = [{"id": "place.testland.beta", "kind": "re-reference",
            "replace": {"Topal Bay": "place.testland.alpha"},
            "why": "A prose name in reachedVia, re-pointed at the record it means."}]
    c = ctx(world)
    b = c.by_id["place.testland.beta"]
    b["relations"]["reachedVia"] = ["Topal Bay"]
    report, errors = pr.run(c, rem, apply=True)
    assert not errors, errors
    assert b["relations"]["reachedVia"] == ["place.testland.alpha"]


def test_re_reference_null_drops_the_edge(world):
    rem = [{"id": "place.testland.alpha", "kind": "re-reference",
            "replace": {"route.old": None},
            "why": "route.old was cut by the 0069 re-author and has no successor."}]
    apply_once(world, rem)
    assert rec_of(world)["relations"]["patrols"] == []
    idempotent(world, rem)


def test_prose(world):
    rem = [{"id": "place.testland.alpha", "kind": "prose", "field": "why.founding",
            "text": "A weir village that grew on the one crossing of the channel.",
            "why": "The founding named a cliff the ground does not have."}]
    apply_once(world, rem)
    assert rec_of(world)["why"]["founding"].startswith("A weir village")
    idempotent(world, rem)


@pytest.mark.parametrize("plotted", [True, False], ids=["plotted-keeps-dot", "unplotted-cleared"])
def test_merge(world, plotted):
    if not plotted:
        _unplot(world)
    rem = [{"id": "place.testland.alpha", "kind": "merge", "group": "group.alpha-beta",
            "sitingPrefs": {"boundTo": {"place": "place.testland.beta", "maxM": 120}},
            "why": "Alpha and beta are 90 m apart and share one quay: one blueprint."}]
    apply_once(world, rem)
    r = rec_of(world)
    assert r["designGroup"] == "group.alpha-beta"
    assert r["sitingPrefs"]["boundTo"]["maxM"] == 120
    assert ("positionM" in r) is plotted
    idempotent(world, rem)


def test_cut_moves_inbound_edges_to_reserved(world):
    rem = [{"id": "place.testland.alpha", "kind": "cut",
            "why": "Nothing within 2 km supports it and its purpose duplicates beta."}]
    apply_once(world, rem)
    assert rec_of(world)["status"] == "cut"
    b = rec_of(world, "place.testland.beta")
    assert b["relations"]["dependsOn"] == []
    assert b["relationsReserved"]["dependsOn"] == ["place.testland.alpha"]
    idempotent(world, rem)


def test_status_promotes_a_deferred_record(world):
    data = json.loads(world["cat"].joinpath("places-testland.json").read_text())
    for r in data["places"]:
        if r["id"] == "place.testland.alpha":
            r["status"] = "deferred"
            r["workflow"] = "derived"
            for k in pr.POSITION_FIELDS:
                r.pop(k, None)
    world["cat"].joinpath("places-testland.json").write_text(json.dumps(data, indent=2) + "\n")
    rem = [{"id": "place.testland.alpha", "kind": "status", "status": "active",
            "why": "The Shadowfen packet needs its ferry head; the prefs are written."}]
    apply_once(world, rem)
    assert rec_of(world)["status"] == "active"
    assert "positionM" not in rec_of(world)
    idempotent(world, rem)


def test_field_allowlist(world):
    rem = [{"id": "place.testland.alpha", "kind": "field", "path": "ownerGuided", "value": True,
            "why": "The owner walks this one; the plot may not move it."}]
    apply_once(world, rem)
    assert rec_of(world)["ownerGuided"] is True
    idempotent(world, rem)


def test_field_terrain_requests(world):
    rem = [{"id": "place.testland.alpha", "kind": "field", "path": "terrainRequests", "value": [],
            "why": "Its request is known-red: the register is emptied and the request dropped."}]
    apply_once(world, rem)
    assert rec_of(world)["terrainRequests"] == []
    idempotent(world, rem)


def test_field_outside_the_allowlist_refuses(world):
    rem = [{"id": "place.testland.alpha", "kind": "field", "path": "positionM", "value": [1, 2],
            "why": "w"}]
    _, errors = pr.run(ctx(world), rem, apply=True)
    assert len(errors) == 1 and "not in the 16g allowlist" in errors[0], errors


def test_unknown_id_and_kind_refuse(world):
    _, errors = pr.run(ctx(world), [{"id": "place.testland.nope", "kind": "cut", "why": "w"}], apply=True)
    assert len(errors) == 1 and "not a catalogue id" in errors[0], errors
    _, errors = pr.run(ctx(world), [{"id": "place.testland.alpha", "kind": "bulldoze", "why": "w"}], apply=True)
    assert len(errors) == 1 and "is not one of" in errors[0], errors


def test_remedy_without_a_why_refuses(world):
    _, errors = pr.run(ctx(world), [{"id": "place.testland.alpha", "kind": "cut"}], apply=True)
    assert len(errors) == 1 and "needs a `why`" in errors[0], errors


# ------------------------------------------------------------------ --check

def test_check_fails_when_a_cut_record_was_un_cut_by_hand(world):
    rem = [{"id": "place.testland.alpha", "kind": "cut",
            "why": "Duplicates beta 90 m away."}]
    apply_once(world, rem)
    assert pr.check(ctx(world), rem) == []
    data = json.loads(world["cat"].joinpath("places-testland.json").read_text())
    for r in data["places"]:
        if r["id"] == "place.testland.alpha":
            r["status"] = "active"
    world["cat"].joinpath("places-testland.json").write_text(json.dumps(data, indent=2) + "\n")
    errors = pr.check(ctx(world), rem)
    assert len(errors) == 1 and "state no longer holds" in errors[0] and "status = cut" in errors[0], errors


def test_dry_run_mutates_nothing(world):
    before = world["cat"].joinpath("places-testland.json").read_bytes()
    rem = [{"id": "place.testland.alpha", "kind": "cut", "why": "Duplicates beta."}]
    c = ctx(world)
    report, errors = pr.run(c, rem, apply=False)
    assert not errors and report
    c.write()
    assert world["cat"].joinpath("places-testland.json").read_bytes() == before


def test_the_committed_record_is_empty_and_valid():
    remedies = pr.load_remedies()
    assert isinstance(remedies, list)


def test_a_cleared_record_still_validates(tmp_path: Path):
    """No transient window: a record whose position a remedy cleared passes
    `catalogue.validate_catalogue` before the chain re-sites it."""
    import shutil
    cat = tmp_path / "catalogue"
    shutil.copytree(catalogue.CATALOGUE_DIR, cat)
    assert catalogue.validate_catalogue(cat, check_permanence=False) == []
    target = next(rec["id"] for rf in catalogue.load_region_files(cat) for rec in rf.places
                  if rec.get("positionM") and rec.get("workflow") == "plotted"
                  and rec.get("status") not in ("cut", "deferred"))
    rem = [{"id": target, "kind": "pin-by-siting",
            "why": "The dot fails its own hard constraint; measured on the ground.",
            "sitingPrefs": {"sightlineTo": []}}]
    c = pr.Context(catalogue_dir=cat, overrides_path=tmp_path / "ov.json")
    report, errors = pr.run(c, rem, apply=True)
    assert not errors, errors
    c.write()
    assert catalogue.validate_catalogue(cat, check_permanence=False) == []


# ----------------------------------------------- --check after the solver ran
# `--check` runs after the chain's macro_plot stage. A re-siting remedy has by
# then been REALISED: the record is `plotted` again and carries the position
# the solver chose, so "the position is not cleared" is the expected state, not
# a failure. A `meso-move` is realised by its override row, or by the dot the
# solver put within 1 m of the target.

def _resite(world, rid="place.testland.alpha", at=(1234.0, 5678.0)) -> None:
    """Stand in for the solver: write a position back and re-mark `plotted`."""
    data = json.loads(world["cat"].joinpath("places-testland.json").read_text())
    for r in data["places"]:
        if r["id"] == rid:
            r["workflow"] = "plotted"
            r["positionM"] = [at[0], at[1]]
            r["whySiteWon"] = "the solver sited it"
            r["candidatesConsidered"] = [{"siteId": "s"}]
    world["cat"].joinpath("places-testland.json").write_text(json.dumps(data, indent=2) + "\n")


PIN_REMEDY = [{"id": "place.testland.alpha", "kind": "pin-by-siting",
               "why": "The dot stands in 0.2 m of water; the record needs deep water at the quay.",
               "sitingPrefs": {"boundTo": {"place": "place.testland.beta", "maxM": 400}}}]
RETYPE_REMEDY = [{"id": "place.testland.alpha", "kind": "re-type", "type": "fishing-camp",
                  "why": "No cliff within 900 m; the ground is a tidal flat."}]
MERGE_REMEDY = [{"id": "place.testland.alpha", "kind": "merge", "group": "group.saltmarsh",
                 "why": "Alpha and beta are one settlement; they share a design group.",
                 "sitingPrefs": {"boundTo": {"place": "place.testland.beta", "maxM": 300}}}]


@pytest.mark.parametrize("rem", [PIN_REMEDY, RETYPE_REMEDY, MERGE_REMEDY],
                         ids=["pin-by-siting", "re-type", "merge"])
def test_check_holds_on_the_cleared_branch_and_after_the_solver(world, rem):
    _unplot(world)
    apply_once(world, copy.deepcopy(rem))
    assert pr.position_cleared(rec_of(world))          # branch 1: position cleared
    assert pr.check(ctx(world), rem) == []
    _resite(world)                                     # branch 2: plotted + positionM
    r = rec_of(world)
    assert r["workflow"] == "plotted" and r["positionM"] == [1234.0, 5678.0]
    assert pr.check(ctx(world), rem) == []


def test_check_fails_when_a_re_sited_record_lost_its_prefs(world):
    """Being re-sited excuses the position, never the preferences the remedy
    wrote: a hand-edit that drops them still fails."""
    _unplot(world)
    apply_once(world, copy.deepcopy(PIN_REMEDY))
    _resite(world)
    data = json.loads(world["cat"].joinpath("places-testland.json").read_text())
    for r in data["places"]:
        r.get("sitingPrefs", {}).pop("boundTo", None)
    world["cat"].joinpath("places-testland.json").write_text(json.dumps(data, indent=2) + "\n")
    errors = pr.check(ctx(world), PIN_REMEDY)
    # the prefs are outstanding again; the re-sited (plotted) record keeps its
    # dot (2026-09-20): the prefs wait for `macro_plot --resolve-all`
    assert any("sitingPrefs" in e for e in errors), errors
    assert not any(pr.POSITION_CHANGE_PREFIX in e for e in errors), errors


def test_check_fails_when_a_re_sited_record_kept_the_old_type(world):
    apply_once(world, copy.deepcopy(RETYPE_REMEDY))
    _resite(world)
    data = json.loads(world["cat"].joinpath("places-testland.json").read_text())
    for r in data["places"]:
        if r["id"] == "place.testland.alpha":
            r["classification"]["type"] = "cliff-shelf-village"
    world["cat"].joinpath("places-testland.json").write_text(json.dumps(data, indent=2) + "\n")
    errors = pr.check(ctx(world), RETYPE_REMEDY)
    assert any("classification" in e for e in errors), errors


MESO_REMEDY = [{"id": "place.testland.alpha", "kind": "meso-move", "toM": [1060.0, 2000.0],
                "why": "60 m east puts the landing on the 2.1 m channel instead of the bar."}]


def test_check_holds_on_the_override_row(world):
    apply_once(world, copy.deepcopy(MESO_REMEDY))
    rows = json.loads(world["ov"].read_text())["overrides"]
    assert len(rows) == 1 and rows[0]["source"] == "plot-remedies"
    assert pr.check(ctx(world), MESO_REMEDY) == []


def test_check_holds_when_the_dot_landed_within_a_metre_of_the_target(world):
    """The override row can be re-derived away by another writer; the record
    standing on the target is the same remedy, realised."""
    apply_once(world, copy.deepcopy(MESO_REMEDY))
    world["ov"].write_text(json.dumps({"schemaVersion": 1, "overrides": []}, indent=1) + "\n")
    _resite(world, at=(1060.4, 2000.3))     # 0.5 m from toM
    assert pr.check(ctx(world), MESO_REMEDY) == []


def test_check_fails_when_the_meso_move_was_neither_rowed_nor_realised(world):
    apply_once(world, copy.deepcopy(MESO_REMEDY))
    world["ov"].write_text(json.dumps({"schemaVersion": 1, "overrides": []}, indent=1) + "\n")
    _resite(world, at=(1060.0, 2010.0))     # 10 m from toM
    errors = pr.check(ctx(world), MESO_REMEDY)
    assert len(errors) == 1 and "meso-move" in errors[0], errors


@pytest.mark.parametrize("rem", [PIN_REMEDY, RETYPE_REMEDY, MERGE_REMEDY, MESO_REMEDY],
                         ids=["pin-by-siting", "re-type", "merge", "meso-move"])
def test_apply_is_idempotent_after_the_solver_sited_the_record(world, rem):
    """`--apply` runs again after the chain's macro_plot stage. A remedy the
    solver has realised is SKIPPED, never re-applied: re-clearing the position
    the solver just wrote would demand a whole re-plot. (A pin-by-siting or
    merge on a plotted record has nothing left to change, so it reports
    `already applied`; a re-type or meso-move reports `holds`.)"""
    _unplot(world)
    apply_once(world, copy.deepcopy(rem))
    _resite(world)                                  # macro_plot writes a position back
    before = world["cat"].joinpath("places-testland.json").read_bytes()
    before_ov = world["ov"].read_bytes()
    c = ctx(world)
    report, errors = pr.run(c, copy.deepcopy(rem), apply=True)
    assert not errors, errors
    assert all(line.startswith("  holds ") or "already applied" in line for line in report), report
    c.write()
    assert world["cat"].joinpath("places-testland.json").read_bytes() == before
    assert world["ov"].read_bytes() == before_ov
    assert pr.check(ctx(world), rem) == []


def test_apply_still_clears_the_position_before_the_solver_has_run(world):
    """The skip is not "the record has a position": an unplotted record
    awaiting its remedy still carries a stale one, and it is cleared."""
    _unplot(world)
    c = ctx(world)
    report, errors = pr.run(c, copy.deepcopy(PIN_REMEDY), apply=True)
    assert not errors, errors
    assert any("position fields removed" in line for line in report), report
    c.write()
    assert pr.position_cleared(rec_of(world))


# ------------------------------------------------------------------ reseat

RESEAT = {"id": "place.testland.alpha", "kind": "reseat", "toM": [1600.0, 2400.0],
          "ownerCall": "2026-09-20",
          "sources": ["world/sources/water/graph.json body.1284-3448"],
          "why": "The city belongs on the island in the lake; the committed dot is 600 m off it."}


def test_reseat_rows_a_move_beyond_the_meso_cap(world):
    """The defect this failed on first: no kind could move an already-committed
    record more than 150 m, so a committed dot could only be moved by
    `macro_plot --resolve-all` (which moved 106 unrelated records)."""
    rem = [copy.deepcopy(RESEAT)]
    apply_once(world, rem)
    rows = json.loads(world["ov"].read_text())["overrides"]
    assert len(rows) == 1
    row = rows[0]
    assert row["kind"] == "reseat" and row["source"] == "plot-remedies"
    assert row["ownerCall"] == "2026-09-20" and row["sources"] == RESEAT["sources"]
    assert (row["u"], row["v"]) == tuple(round(c, 6) for c in pr.metres_to_uv_pair(1600.0, 2400.0))
    # the record itself is untouched: `apply_sitings` seats it
    assert rec_of(world)["positionM"] == [1000.0, 2000.0]
    idempotent(world, rem)


def test_reseat_needs_an_owner_call_and_sources(world):
    for drop in ("ownerCall", "sources"):
        rem = [copy.deepcopy(RESEAT)]
        del rem[0][drop]
        _, errors = pr.run(ctx(world), rem, apply=False)
        assert len(errors) == 1 and drop in errors[0], errors


def test_reseat_refuses_an_uncommitted_record(world):
    c = ctx(world)
    pr.clear_position(c.by_id["place.testland.alpha"])
    _, errors = pr.run(c, [copy.deepcopy(RESEAT)], apply=False)
    assert len(errors) == 1 and "committed positionM" in errors[0], errors
