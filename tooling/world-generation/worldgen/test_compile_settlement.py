"""Settlement compiler walking-skeleton tests (Phase 11 Part 0 item 4)."""

import copy
import json
from pathlib import Path

import numpy as np
import pytest

from . import compile_settlement as cs
from . import place_obligations
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
        if parcel is None or "dressingFor" in p:
            continue
        cx, cz = survey.uv_to_m(*parcel["centreUV"])
        assert abs(p["positionM"][0] - cx) < 1e-3
        assert abs(p["positionM"][2] - cz) < 1e-3
        assert p["yawDeg"] == parcel["yawDeg"]


def test_deterministic(survey, shelf):
    a = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    b = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert a["sourceBlueprintSha256"] == cs.blueprint_sha256(_corrected(_blueprint()))
    changed = _corrected(_blueprint())
    changed["seed"] = f"{changed['seed']}.changed"
    assert cs.blueprint_sha256(changed) != a["sourceBlueprintSha256"]


def test_phase11_receipt_names_validated_objects_and_compiled_terrain_operation():
    record = {
        "id": "place.test.receipt", "position": {"u": 0.5, "v": 0.5},
        "culture": "argonian",
        "terrainRequests": [{
            "kind": "cut", "radiusM": 30,
            "delivery": {"feature": "landing-cut", "depthClass": "navigable"},
            "note": "The landing needs a real cut.",
        }],
    }
    bp = {
        "id": record["id"],
        "districts": [{"id": "district.receipt.landing"}],
        "routes": [{"id": "route.receipt.landing"}],
        "macroEvidence": [{
            "sourcePaths": ["terrainRequests"],
            "evidenceRefs": ["route.receipt.landing"],
        }],
    }
    receipt, errors = cs.phase11_obligation_receipt(bp, record)
    assert errors == []
    assert receipt["receiptSha256"] == cs._canonical_sha256({
        key: receipt[key] for key in ("placeId", "objectRegistry", "manifest")
    })
    obligations, _ = place_obligations.build_obligations(record, bp)
    by_id = {row.id: row for row in obligations}
    terrain_refs = {
        ref for delivery in receipt["manifest"]["deliveries"]
        if by_id[delivery["obligationId"]].sourcePath.startswith("terrainRequests[")
        for ref in delivery["objectRefs"]
    }
    assert terrain_refs
    assert all(receipt["objectRegistry"][ref]["kind"] == "terrain-operation"
               for ref in terrain_refs)


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


@pytest.mark.parametrize(("use", "bounds"), [
    ("dwelling", (3, 6)),
    ("work", (6, 12)),
    ("kiln", (6, 12)),
])
def test_use_drives_dressing_count_in_the_decided_band(use, bounds):
    parcel = {"id": f"parcel.fixture.{use}", "use": use}
    count = cs.dressing_count("fixed-seed", parcel)
    assert bounds[0] <= count <= bounds[1]
    assert count == cs.dressing_count("fixed-seed", parcel)


def test_non_dwelling_non_works_parcel_gets_no_automatic_dressing():
    assert cs.dressing_count("fixed-seed", {"id": "parcel.x", "use": "gate"}) == 0


def test_only_stilt_door_near_authored_boardwalk_gets_wet_access():
    class MetreSurvey:
        @staticmethod
        def uv_to_m(u, v):
            return u, v

    door = {"parcelId": "hut", "thresholdUV": [2.5, 3.0]}
    bp = {
        "parcels": [{"id": "hut", "groundFit": "stilt"}],
        "boardwalks": [{"points": [[0.0, 0.0], [5.0, 0.0]]}],
    }
    assert cs._door_has_boardwalk_access(door, bp, MetreSurvey())
    bp["parcels"][0]["groundFit"] = "direct"
    assert not cs._door_has_boardwalk_access(door, bp, MetreSurvey())
    bp["parcels"][0]["groundFit"] = "stilt"
    door["thresholdUV"] = [2.5, 4.01]
    assert not cs._door_has_boardwalk_access(door, bp, MetreSurvey())


class FloodSurvey:
    """Small aligned fields: each UV tenth is one survey cell."""

    def __init__(self):
        self.extent_m = 100.0
        self.grid_n = 10
        self.grid_px_m = 10.0
        self.open_water = np.zeros((10, 10), dtype=bool)
        self.flood = np.zeros((10, 10), dtype=np.uint8)
        self.wet_season = np.zeros((20, 20), dtype=bool)

    def uv_to_m(self, u, v):
        return u * self.extent_m, v * self.extent_m

    def grid_px(self, x, z):
        return min(int(z / 10.0), 9), min(int(x / 10.0), 9)


def _flood_parcel(pid, district, use, centre, footprint):
    return {
        "id": pid,
        "districtId": district,
        "use": use,
        "kind": "building",
        "centreUV": centre,
        "footprint": footprint,
    }


def test_flood_report_samples_real_footprint_and_accepts_stilt_share_and_sections():
    survey = FloodSurvey()
    # One corner of `over` reaches cell (8, 8), although its centre stays dry.
    survey.open_water[8, 8] = True
    survey.flood[5, 5] = 2
    bp = {
        "id": "place.fixture.flood-pass",
        "districts": [{"id": "stilt", "cultureKit": "argonian-stilt"}],
        "parcels": [
            _flood_parcel("civic", "stilt", "civic", [0.15, 0.15],
                          [[0.14, 0.14], [0.16, 0.14], [0.16, 0.16], [0.14, 0.16]]),
            _flood_parcel("home", "stilt", "dwelling", [0.35, 0.35],
                          [[0.34, 0.34], [0.36, 0.34], [0.36, 0.36], [0.34, 0.36]]),
            _flood_parcel("works", "stilt", "work", [0.55, 0.55],
                          [[0.54, 0.54], [0.56, 0.54], [0.56, 0.56], [0.54, 0.56]]),
            _flood_parcel("over", "stilt", "dwelling", [0.75, 0.75],
                          [[0.74, 0.74], [0.84, 0.74], [0.84, 0.84], [0.74, 0.84]])
            | {"groundFit": "stilt"},
        ],
    }
    report, warnings = cs.flood_band_report(bp, survey)
    assert warnings == []
    district = report["districts"][0]
    assert district["overOpenWaterBuildingShare"] == 0.25
    assert district["conforms"] is True
    over = next(p for p in report["parcels"] if p["parcelId"] == "over")
    assert over["centre"]["openWater"] is False
    assert over["overOpenWater"] is True
    assert over["sampleCount"] > 9  # authored controls plus interior raster cells
    assert all(r["conforms"] for r in report["sectionRules"])
    over_rule = next(r for r in report["sectionRules"] if r["parcelId"] == "over")
    assert over_rule["rule"] == "argonian-stilt-dwelling-water-section"
    assert report["limits"]["floorHeightAboveHighestWaterMeasured"] is False


def test_flood_report_warns_without_failing_and_holds_root_and_section_rules():
    survey = FloodSurvey()
    survey.open_water[2, 2] = True
    survey.wet_season[12, 12] = True
    square = lambda u, v: [[u - .01, v - .01], [u + .01, v - .01],
                           [u + .01, v + .01], [u - .01, v + .01]]
    bp = {
        "id": "place.fixture.flood-warn",
        "districts": [{"id": "root", "cultureKit": "argonian-root"}],
        "parcels": [
            _flood_parcel("root-home", "root", "dwelling", [0.25, 0.25], square(.25, .25)),
            _flood_parcel("wet-shrine", "root", "shrine", [0.625, 0.625], square(.625, .625)),
            _flood_parcel("dry-work", "root", "work", [0.75, 0.75], square(.75, .75)),
        ],
    }
    report, warnings = cs.flood_band_report(bp, survey)
    assert report["warningCount"] == 4
    assert len(warnings) == 4
    assert any("argonian-root" in warning for warning in warnings)
    assert any("dwelling-dry-levee-or-bench" in warning for warning in warnings)
    assert any("civic-sacred-dry" in warning for warning in warnings)
    assert any("works-quays-flood-section" in warning for warning in warnings)
    assert report["districts"][0]["conforms"] is False


def test_flood_report_covers_raster_cells_inside_large_footprint():
    survey = FloodSurvey()
    # This wet cell is inside the footprint but is neither its centre, a
    # vertex, nor an edge midpoint: the old nine-point sample missed it.
    survey.open_water[3, 3] = True
    bp = {
        "id": "place.fixture.full-raster-footprint",
        "districts": [{"id": "root", "cultureKit": "argonian-root"}],
        "parcels": [_flood_parcel(
            "large", "root", "dwelling", [0.5, 0.5],
            [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]])],
    }
    report, warnings = cs.flood_band_report(bp, survey)
    evidence = report["parcels"][0]
    assert evidence["sampleCount"] > 9
    assert evidence["overOpenWater"] is True
    assert warnings
