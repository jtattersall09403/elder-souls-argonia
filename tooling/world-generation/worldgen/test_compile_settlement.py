"""Settlement compiler walking-skeleton tests (Phase 11 Part 0 item 4)."""

import copy
import hashlib
import json
from pathlib import Path

import numpy as np
import pytest

from . import compile_settlement as cs
from . import blueprint as blueprint_schema
from . import place_obligations
from . import terrain_requests
from .site_fields import ProvinceSurvey

FIXTURE = Path(__file__).parent / "testdata" / "place.fixture.mire-landing.json"


@pytest.fixture(scope="module")
def survey():
    return ProvinceSurvey()


@pytest.fixture(scope="module")
def shelf():
    built = cs.KitShelf()
    # `tooling/asset-pipeline/output/kits` is build output from the asset
    # vault and is gitignored, so a clean CI checkout has no kits at all and
    # these tests can never pass there — they failed the Pages deploy for
    # everyone with "the works kit ships no board to test with". Skip when the
    # shelf is empty, the way the compiled-water invariants skip without the
    # vault; a machine that HAS built the kits still runs them in full.
    if not built.assets_by_kit:
        pytest.skip("built asset kits unavailable (asset-pipeline output is "
                    "build output from the vault, absent on a clean checkout)")
    # The Part-0 fixture predates the built landmark kit. Keep the fixture
    # independent of the live asset build while still exercising the hard rule
    # that its assetRef becomes a measured placement.
    asset = {"id": "histtree:hist/histshoot01", "sizeM": [4.0, 4.0, 12.0],
             "materials": [], "triangles": 10}
    built.assets_by_kit.setdefault("flora-province-v1", []).append(asset)
    built.by_asset[asset["id"]] = asset
    return built


@pytest.fixture(scope="module")
def compile_survey(survey):
    class StableSurvey:
        # The walking-skeleton fixture tests settlement compilation. Published
        # route stitching has dedicated synthetic tests and may be regenerating
        # concurrently, so it is deliberately not an input to this fixture.
        province = None

        def __getattr__(self, name):
            return getattr(survey, name)

    return StableSurvey()


def _blueprint():
    return json.loads(FIXTURE.read_text())["blueprint"]


def _terrain_evidence(record, *, passing=True):
    plan, errors = terrain_requests.build_plan([record])
    assert errors == []
    fulfillment_rows = []
    for request in plan["requests"]:
        operation = next(row for row in plan["operations"]
                         if row["requestId"] == request["id"])
        evidence = {
            "operationId": operation["id"],
            "deliverySha256": terrain_requests.delivery_digest(request["delivery"]),
            "coveredFields": sorted(request["delivery"]),
            "witnesses": [{"x": 1, "z": 2, "appliedDeltaM": -1.0}],
        }
        evidence["evidenceSha256"] = hashlib.sha256(
            terrain_requests._canonical(evidence).encode()).hexdigest()
        fulfillment_rows.append({
            "requestId": request["id"], "operationIds": request["operationIds"],
            "deliverySha256": terrain_requests.delivery_digest(request["delivery"]),
            "operationEvidence": [evidence],
            "evidenceRefs": [f"terrain-operation-evidence.{operation['id']}.sha256."
                             f"{evidence['evidenceSha256']}"],
        })
    fulfillment = {
        "schemaVersion": terrain_requests.FULFILLMENT_SCHEMA_VERSION,
        "kind": "terrain-request-fulfillments", "sourceDigest": plan["sourceDigest"],
        "planDigest": plan["planDigest"], "fulfillments": fulfillment_rows,
    }
    report_payload = {
        "planDigest": plan["planDigest"], "sourceDigest": plan["sourceDigest"],
        "globalFindings": [],
        "requests": [{"requestId": row["id"], "placeId": row["placeId"],
                      "deliverySha256": terrain_requests.delivery_digest(row["delivery"]),
                      "status": "pass" if passing else "fail", "findings": []}
                     for row in plan["requests"]],
    }
    postconditions = {
        "schemaVersion": 1, "kind": "terrain-request-postconditions",
        "status": "pass" if passing else "fail", **report_payload,
        "reportDigest": cs._canonical_sha256(report_payload),
    }
    return plan, fulfillment, postconditions


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


def test_corrected_blueprint_compiles_clean(compile_survey, shelf):
    result = cs.compile_blueprint(_corrected(_blueprint()), compile_survey, shelf)
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
        cx, cz = compile_survey.uv_to_m(*parcel["centreUV"])
        assert abs(p["positionM"][0] - cx) < 1e-3
        assert abs(p["positionM"][2] - cz) < 1e-3
        assert p["yawDeg"] == parcel["yawDeg"]
    landmark = [p for p in result["placements"] if p.get("landmarkId")]
    fence = [p for p in result["placements"] if p.get("fenceId")]
    assert [p["landmarkId"] for p in landmark] == ["landmark.mire-landing.hist-shoot"]
    assert fence and {p["fenceId"] for p in fence} == {"fence.mire-landing.yard"}
    compiled = {row["id"]: row for row in result["compiledObjects"]}
    assert compiled["landmark.mire-landing.hist-shoot"]["placementIds"]
    assert compiled["fence.mire-landing.yard"]["placementIds"]


def test_deterministic(survey, shelf):
    a = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    b = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert a["sourceBlueprintSha256"] == cs.blueprint_sha256(_corrected(_blueprint()))
    changed = _corrected(_blueprint())
    changed["seed"] = f"{changed['seed']}.changed"
    assert cs.blueprint_sha256(changed) != a["sourceBlueprintSha256"]


def test_landmark_carries_its_authored_ground_fit(compile_survey, shelf):
    bp = _corrected(_blueprint())
    bp["landmarks"][0]["groundFit"] = "dug-in"
    result = cs.compile_blueprint(bp, compile_survey, shelf)
    landmark = next(row for row in result["placements"] if row.get("landmarkId"))
    assert landmark["groundFit"] == "dug-in"


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
    class Survey:
        @staticmethod
        def uv_to_m(u, v):
            return u * 100, v * 100

    compiled, object_errors = cs.compiled_blueprint_objects(bp, [], [], Survey())
    terrain, terrain_errors = cs.compiled_terrain_objects(
        record, **dict(zip(("plan", "fulfillment", "postconditions"),
                           _terrain_evidence(record))))
    assert object_errors == terrain_errors == []
    receipt, errors = cs.phase11_obligation_receipt(bp, record, compiled + terrain)
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


def test_receipt_cannot_certify_an_authored_object_the_compiler_did_not_emit():
    record = {"id": "place.test.omission", "position": {"u": .5, "v": .5},
              "vibe": "A visibly worked landing with a guarded landward threshold."}
    bp = {"id": record["id"], "routes": [{"id": "route.omission.channel"}],
          "macroEvidence": [{"sourcePaths": ["vibe"],
                             "evidenceRefs": ["route.omission.channel"]}]}
    _receipt, errors = cs.phase11_obligation_receipt(bp, record, [])
    assert any("compiler did not emit" in error for error in errors)


def test_planned_but_unapplied_terrain_cannot_become_a_compiled_object():
    record = {"id": "place.test.unapplied", "position": {"u": .5, "v": .5},
              "terrainRequests": [{"kind": "cut", "radiusM": 10,
                                    "delivery": {"feature": "channel"}, "note": "real cut"}]}
    plan, fulfillment, postconditions = _terrain_evidence(record)
    fulfillment["fulfillments"] = []
    objects, errors = cs.compiled_terrain_objects(
        record, plan=plan, fulfillment=fulfillment, postconditions=postconditions)
    assert objects == []
    assert any("missing fulfillment" in error for error in errors)


def test_applied_terrain_with_failed_final_postcondition_cannot_be_certified():
    record = {"id": "place.test.failed-final", "position": {"u": .5, "v": .5},
              "terrainRequests": [{"kind": "pool", "radiusM": 10,
                                    "delivery": {"feature": "pool"}, "note": "real pool"}]}
    plan, fulfillment, postconditions = _terrain_evidence(record, passing=False)
    objects, errors = cs.compiled_terrain_objects(
        record, plan=plan, fulfillment=fulfillment, postconditions=postconditions)
    assert objects == []
    assert any("postconditions have not passed" in error for error in errors)


@pytest.mark.parametrize(("key", "source"), [
    ("landmarks", {"id": "landmark.omission.beacon", "assetRef": "asset.beacon",
                   "position": [.2, .3]}),
    ("fences", {"id": "fence.omission.wall", "assetRef": "asset.wall",
                "points": [[.1, .1], [.2, .1]]}),
])
def test_asset_bearing_object_is_not_compiled_without_a_physical_placement(key, source):
    class Survey:
        @staticmethod
        def uv_to_m(u, v):
            return u * 100, v * 100

    objects, errors = cs.compiled_blueprint_objects(
        {"id": "place.test.omission", key: [source]}, [], [], Survey())
    assert source["id"] not in {row["id"] for row in objects}
    assert any("no matching physical placement" in error for error in errors)


def test_dock_without_a_built_asset_cannot_emit_a_placeholder(compile_survey, shelf):
    bp = _corrected(_blueprint())
    bp["docks"] = [{
        "id": "dock.mire-landing.missing",
        "position": [0.15, 0.15],
        "assetRef": "asset.missing-dock",
    }]
    result = cs.compile_blueprint(bp, compile_survey, shelf)
    assert not [row for row in result["placements"] if row.get("dockId")]
    assert any("physical dock assetRef" in error for error in result["errors"])


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


def test_pad_grade_carries_the_authored_tilt_axis(compile_survey, shelf):
    bp = _corrected(_blueprint())
    parcel = bp["parcels"][0]
    parcel["groundFit"] = "pad"
    result = cs.compile_blueprint(bp, compile_survey, shelf)
    grade = next(row for row in result["grades"] if row["parcelId"] == parcel["id"])
    assert grade["residualTiltDeg"] == cs.PAD_RESIDUAL_TILT_DEG
    assert grade["tiltBearingDeg"] == parcel["yawDeg"]


def test_physical_dock_asset_ref_becomes_runtime_geometry(compile_survey, shelf):
    bp = _corrected(_blueprint())
    dock = bp["docks"][0]
    dock["assetRef"] = "vanilla:architecture/docks/dockstrsol01"
    dock["yawDeg"] = 35.0
    result = cs.compile_blueprint(bp, compile_survey, shelf)
    placement = next(row for row in result["placements"] if row.get("dockId") == dock["id"])
    assert placement["kit"] == "docks-v1"
    assert placement["assetId"] == dock["assetRef"]
    assert placement["yawDeg"] == 35.0
    compiled = next(row for row in result["compiledObjects"] if row["id"] == dock["id"])
    assert compiled["placementIds"] == [placement["id"]]


def test_dock_asset_ref_schema_rejects_empty_values(compile_survey):
    bp = _corrected(_blueprint())
    bp["docks"][0]["assetRef"] = ""
    errors = blueprint_schema.validate_blueprint(bp, None, compile_survey)
    assert any("assetRef must be a non-empty built asset id" in error for error in errors)


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
