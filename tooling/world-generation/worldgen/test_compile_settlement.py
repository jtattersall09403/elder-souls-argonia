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


def _underdeclared(bp):
    """The fixture is a valid exemplar; this is the blind-to-terrain draft an
    authoring agent would have started from (everything 'direct', no clearing)."""
    bad = copy.deepcopy(bp)
    for p in bad["parcels"]:
        p["groundFit"] = "direct"
    bad["clearance"]["hardClear"] = []
    return bad


def test_ground_fit_ladder_rejects_underdeclared_fits(survey, shelf):
    result = cs.compile_blueprint(_underdeclared(_blueprint()), survey, shelf)
    assert any("exceeds groundFit 'direct'" in e for e in result["errors"])
    assert any("unreachable" in e for e in result["errors"])


def test_corrected_blueprint_compiles_clean(survey, shelf):
    result = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    assert result["errors"] == []
    assert all(d["reachable"] for d in result["doors"])
    assert result["budgetReport"]["withinBudget"]
    # every placement carries provenance, and sits at its parcel's AUTHORED
    # centre and yaw (no grid snap since 2026-09-05: the author states why the
    # building faces where it does, and snapping would overrule it)
    parcels = {p["id"]: p for p in _corrected(_blueprint())["parcels"]}
    for p in result["placements"]:
        assert p["provenance"]["sourceBlueprintId"] == result["id"]
        parcel = parcels.get(p.get("parcelId"))
        if parcel is None:
            continue
        cx, cz = survey.uv_to_m(*parcel["centreUV"])
        assert abs(p["positionM"][0] - cx) < 1e-3
        assert abs(p["positionM"][2] - cz) < 1e-3
        assert p["yawDeg"] == parcel["yawDeg"]


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


# --- `--out` resolution (review 2026-09-07) -------------------------------- #
def test_out_accepts_a_directory_and_keeps_the_ledger_beside_it(tmp_path):
    out, out_dir = cs.resolve_out(str(tmp_path / "run"), "place.stub.camp")
    assert out == tmp_path / "run" / "place.stub.camp.settlement.json"
    assert out_dir == tmp_path / "run"


def test_out_accepts_a_file_path_and_defaults_to_the_tree(tmp_path):
    out, out_dir = cs.resolve_out(str(tmp_path / "one.json"), "place.stub.camp")
    assert out == tmp_path / "one.json" and out_dir == tmp_path
    assert cs.resolve_out(None, "place.stub.camp") == (
        cs.OUT_DIR / "place.stub.camp.settlement.json", cs.OUT_DIR)


def test_dressing_prop_resolves_outside_the_district_kit_set(shelf):
    """97 C1a: a prop may come from the dressing pool, so the works notice
    board resolves in an Argonian quay. The resolver used to read the kit set
    directly and refused it, while the C1 warning already admitted it
    (review 2026-09-07, Lilmoth's dues board)."""
    board = next((a for a in shelf.assets_by_kit.get("works-v1", [])
                  if "board" in a["id"].lower()), None)
    assert board is not None, "the works kit ships no board to test with"
    assert shelf.find("argonian-stilt", board["id"], "prop") is not None
    assert shelf.find("argonian-stilt", board["id"], "building") is None
