"""Settlement compiler walking-skeleton tests (Phase 11 Part 0 item 4)."""

import copy
import json
from pathlib import Path

import pytest

from . import compile_settlement as cs
from .site_fields import ProvinceSurvey

FIXTURE = Path(__file__).parent / "testdata" / "place.fixture.mire-landing.json"


@pytest.fixture(scope="module")
def survey():
    return ProvinceSurvey()


@pytest.fixture(scope="module")
def shelf():
    return cs.KitShelf()


def _blueprint():
    return json.loads(FIXTURE.read_text())["blueprint"]


def _corrected(bp):
    """The fixture was authored blind to terrain; correct it the way an
    authoring agent would after reading the compile errors."""
    fixed = copy.deepcopy(bp)
    for p in fixed["parcels"]:
        p["groundFit"] = "stilt"
    # hard-clear the whole boundary so doors sit in cleared ground
    fixed["clearance"]["hardClear"] = [fixed["boundary"]]
    return fixed


def test_ground_fit_ladder_rejects_underdeclared_fits(survey, shelf):
    result = cs.compile_blueprint(_blueprint(), survey, shelf)
    assert any("exceeds groundFit 'direct'" in e for e in result["errors"])
    assert any("unreachable" in e for e in result["errors"])


def test_corrected_blueprint_compiles_clean(survey, shelf):
    result = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    assert result["errors"] == []
    assert all(d["reachable"] for d in result["doors"])
    assert result["budgetReport"]["withinBudget"]
    # every placement carries provenance and a grid-snapped position
    for p in result["placements"]:
        assert p["provenance"]["sourceBlueprintId"] == result["id"]
        if p["kit"]:
            for coord in (p["positionM"][0], p["positionM"][2]):
                mod = coord % cs.GRID_M
                assert min(mod, cs.GRID_M - mod) < 1e-6


def test_deterministic(survey, shelf):
    a = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    b = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_budget_enforced(survey, shelf):
    bp = _corrected(_blueprint())
    bp["budget"]["maxInstances"] = 0
    result = cs.compile_blueprint(bp, survey, shelf)
    assert not result["budgetReport"]["withinBudget"]
    assert any("budget exceeded" in e for e in result["errors"])


def test_pad_grades_emitted_only_for_pad(survey, shelf):
    bp = _corrected(_blueprint())
    result = cs.compile_blueprint(bp, survey, shelf)
    assert result["grades"] == []  # all-stilt blueprint grades nothing
    assert result["clearance"]["affectedChunks"]  # clearing touches chunks
