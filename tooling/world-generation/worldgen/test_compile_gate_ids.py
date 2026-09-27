"""compile_settlement emits the reader-checklist gate ids (16k S14).

Every `rule:compile.<gate>` tag in .claude/skills/place-build/references/
reader-checklist.md appears in the compile's `gateFailures` when a blueprint
trips that gate. The mire-landing fixture is mutated to trip the gates the
ground can trip (clearance, spacing, firstSeen, cultureKit); the three whose
trigger needs a kit the fixture lacks (an unlit door, a modular run, an open
modular end) have their rule's output stubbed, so the test proves the id is
emitted where that output is appended, not the rule itself (its own tests do).
"""
from __future__ import annotations

import copy
import re

import pytest

from . import blueprint as bp_mod
from . import blueprint_footprints as fp_mod
from . import compile_settlement as cs
from .ladder import requires_delivered
from .test_compile_settlement import (_blueprint, _corrected, compile_survey, shelf,  # noqa: F401
                                      survey)

CHECKLIST = (cs.REPO_ROOT / ".claude" / "skills" / "place-build" / "references"
             / "reader-checklist.md")


def _ids(result: dict) -> set[str]:
    return {row["gate"] for row in result["gateFailures"]}


def test_gate_ids_are_the_checklist_tags():
    tags = set(re.findall(r"rule:(compile\.[A-Za-z]+)", CHECKLIST.read_text(encoding="utf-8")))
    assert tags == set(cs.COMPILE_GATE_IDS)


@requires_delivered("16h")
def test_clean_compile_tags_only_its_warnings(compile_survey, shelf):  # noqa: F811
    """The corrected fixture compiles with no errors; its WARN rows (a fixture's
    unlit door, the unmeasured first-seen line) are tagged, each one a warning."""
    result = cs.compile_blueprint(_corrected(_blueprint()), compile_survey, shelf)
    assert result["errors"] == []
    assert result["gateFailures"]
    for row in result["gateFailures"]:
        assert row["grade"] == "warn" and row["message"] in result["warnings"]


@requires_delivered("16h")
def test_ground_gates_carry_their_ids(compile_survey, shelf):  # noqa: F811
    bp = _corrected(_blueprint())
    bp["clearance"]["hardClear"] = []                         # clearance
    hut1, hut2 = bp["parcels"][0], bp["parcels"][1]           # spacing: one on the other
    hut2["centreUV"], hut2["footprint"] = list(hut1["centreUV"]), copy.deepcopy(hut1["footprint"])
    bp["approaches"][0]["firstSeen"] = "landmark.mire-landing.nothing"   # firstSeen
    culture = "97 C1 — parcel x is a building built from y (imperial), but its district is argonian"
    result = cs.compile_blueprint(bp, compile_survey, shelf, [culture])
    got = {row["gate"]: row for row in result["gateFailures"]}
    assert {"compile.clearance", "compile.spacing", "compile.firstSeen",
            "compile.cultureKit"} <= set(got)
    assert got["compile.clearance"]["message"] in result["errors"]
    assert got["compile.spacing"]["message"] in result["errors"]
    assert got["compile.firstSeen"]["message"] in result["warnings"]
    assert got["compile.cultureKit"]["message"] == culture
    assert all(row["grade"] in ("error", "warn") for row in result["gateFailures"])


def test_culture_kit_mark_is_c1_only():
    assert cs._CULTURE_KIT_MARK.search("x: 97 C1 — parcel")
    assert not cs._CULTURE_KIT_MARK.search("fence f: 97 C10 — the wall line")


@requires_delivered("16h")
def test_stubbed_gates_carry_their_ids(compile_survey, shelf, monkeypatch):  # noqa: F811
    bp = _corrected(_blueprint())
    bp["id"] = "place.gate-ids.probe"            # a place, not a fixture: every gate is live
    monkeypatch.setattr(cs, "unlit_entrance_errors",
                        lambda *a, **k: ["door.x: unlit entrance (0102 decision 7)"])
    monkeypatch.setattr(cs, "open_modular_ends",
                        lambda *a, **k: [{"placementId": "run.x.0"}])
    monkeypatch.setattr(fp_mod, "lay_pieces", lambda parcel: ([], ["run.x: no mined pair"]))
    run = bp["parcels"][2]
    run["pieces"] = [{"asset": run.pop("assetRef")}]
    result = cs.compile_blueprint(bp, compile_survey, shelf)
    got = {row["gate"]: row for row in result["gateFailures"]}
    assert got["compile.litEntrance"] == {"gate": "compile.litEntrance", "grade": "error",
                                          "message": "door.x: unlit entrance (0102 decision 7)"}
    assert got["compile.modularRuns"]["message"] == "run.x: no mined pair"
    assert got["compile.openModularEnds"]["message"].startswith("16h K7 open modular ends: 1")
    assert not bp_mod.is_fixture(bp)
