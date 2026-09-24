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
from .ladder import requires_delivered

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


# compile_settlement.py still reads the survey's deleted Phase 3 `flood` field
# (record-reads-allowlist.json: ported by 16h); until then these tests would
# execute a consumer of a field 16d removed (decision 0066).
@requires_delivered("16h")
def test_ground_fit_ladder_rejects_underdeclared_fits(survey, shelf):
    result = cs.compile_blueprint(_underdeclared(_blueprint()), survey, shelf)
    assert any("exceeds groundFit 'direct'" in e for e in result["errors"])
    assert any("unreachable" in e for e in result["errors"])


@requires_delivered("16h")
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


@requires_delivered("16h")
def test_deterministic(survey, shelf):
    a = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    b = cs.compile_blueprint(_corrected(_blueprint()), survey, shelf)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert a["sourceBlueprintSha256"] == cs.blueprint_sha256(_corrected(_blueprint()))
    changed = _corrected(_blueprint())
    changed["seed"] = f"{changed['seed']}.changed"
    assert cs.blueprint_sha256(changed) != a["sourceBlueprintSha256"]


@requires_delivered("16h")
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


def _known_red_case(monkeypatch, register):
    """A failing final postcondition, judged against a stubbed known-red register."""
    record = {"id": "place.test.known-red", "position": {"u": .5, "v": .5},
              "terrainRequests": [{"kind": "pool", "radiusM": 10,
                                   "delivery": {"feature": "pool"}, "note": "real pool"}]}
    plan, fulfillment, postconditions = _terrain_evidence(record, passing=False)
    request_id = plan["requests"][0]["id"]
    from . import terrain_request_postconditions as trp
    monkeypatch.setattr(trp, "load_known_red",
                        lambda *a, **k: ({request_id: register} if register else {}))
    notes: list[str] = []
    objects, errors = cs.compiled_terrain_objects(
        record, plan=plan, fulfillment=fulfillment, postconditions=postconditions,
        notes=notes)
    return request_id, objects, errors, notes


def test_registered_water_owned_known_red_is_reported_by_name_not_failed(monkeypatch):
    """A REGISTERED water debt has one owner: it is named, never silent, and it
    does not fail the settlement compiler, which cannot fix it."""
    request_id, objects, errors, notes = _known_red_case(
        monkeypatch, {"failingFields": ["depthClass", "current"]})
    assert errors == []
    assert objects, "the compiled terrain object must still be emitted"
    assert len(notes) == 1
    assert "KNOWN-RED" in notes[0] and request_id in notes[0]
    assert "depthClass, current" in notes[0]


def test_unregistered_failed_final_postcondition_is_still_a_hard_error(monkeypatch):
    """The mutation that would matter: an unregistered failure must not be
    quietly absorbed by the known-red path."""
    _request_id, objects, errors, notes = _known_red_case(monkeypatch, None)
    assert objects == []
    assert notes == []
    assert any("no passing final postcondition" in error for error in errors)
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


@requires_delivered("16h")
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


@requires_delivered("16h")
def test_budget_enforced(survey, shelf):
    bp = _corrected(_blueprint())
    bp["budget"]["maxInstances"] = 0
    result = cs.compile_blueprint(bp, survey, shelf)
    assert not result["budgetReport"]["withinBudget"]
    assert any("budget exceeded" in e for e in result["errors"])


@requires_delivered("16h")
def test_pad_grades_emitted_only_for_pad(survey, shelf):
    bp = _corrected(_blueprint())
    result = cs.compile_blueprint(bp, survey, shelf)
    assert result["grades"] == []  # all-stilt blueprint grades nothing
    assert result["clearance"]["affectedChunks"]  # clearing touches chunks


@requires_delivered("16h")
def test_pad_grade_carries_the_authored_tilt_axis(compile_survey, shelf):
    bp = _corrected(_blueprint())
    parcel = bp["parcels"][0]
    parcel["groundFit"] = "pad"
    result = cs.compile_blueprint(bp, compile_survey, shelf)
    grade = next(row for row in result["grades"] if row["parcelId"] == parcel["id"])
    assert grade["residualTiltDeg"] == cs.PAD_RESIDUAL_TILT_DEG
    assert grade["tiltBearingDeg"] == parcel["yawDeg"]


@requires_delivered("16h")
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
    """Small aligned fields: each UV tenth is one survey cell.

    Water is a RECORD here, as it is in the province survey (0066): a cell
    carries the id of the body or reach under it, and the flood band is the
    band of the reach that id names. There is no `flood` raster to set.
    """

    def __init__(self):
        self.extent_m = 100.0
        self.grid_n = 10
        self.grid_px_m = 10.0
        self.open_water = np.zeros((10, 10), dtype=bool)
        self.wet_season = np.zeros((20, 20), dtype=bool)
        self.entity_grid: dict[tuple[int, int], str] = {}
        self.reaches: dict[str, dict] = {}
        self.bodies: dict[str, dict] = {}

    def put_reach(self, row, col, entity_id="reach.test", band=2, kind="horizontal-channel"):
        self.entity_grid[(row, col)] = entity_id
        self.reaches[entity_id] = {"id": entity_id, "kind": kind, "band": band,
                                   "levelM": 1.0}

    def put_body(self, row, col, entity_id="body.test", kind="lake"):
        self.entity_grid[(row, col)] = entity_id
        self.bodies[entity_id] = {"id": entity_id, "kind": kind, "levelM": 1.0}

    def uv_to_m(self, u, v):
        return u * self.extent_m, v * self.extent_m

    def grid_px(self, x, z):
        return min(int(z / 10.0), 9), min(int(x / 10.0), 9)

    def water_entity_at(self, x, z):
        entity_id = self.entity_grid.get(self.grid_px(x, z))
        if entity_id is None:
            return None
        record = self.reaches.get(entity_id) or self.bodies.get(entity_id)
        return {"entityId": entity_id, "kind": record.get("kind"),
                "levelM": record.get("levelM"), "season": None}

    def reach(self, entity_id):
        return self.reaches.get(entity_id)

    def body(self, entity_id):
        return self.bodies.get(entity_id)


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
    survey.put_body(8, 8, "body.test")
    survey.put_reach(5, 5, "reach.test", band=2)
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
    survey.put_body(2, 2, "body.test")
    survey.wet_season[12, 12] = True
    survey.put_body(6, 6, "body.shrine-pool")
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
    assert report["warningCount"] == 3
    assert len(warnings) == 3
    assert any("argonian-root" in warning for warning in warnings)
    assert any("dwelling-dry-levee-or-bench" in warning for warning in warnings)
    assert any("civic-sacred-dry" in warning for warning in warnings)
    assert report["districts"][0]["conforms"] is False
    # SCOPE BY ID (16g): `dry-work` stands on no recorded body or reach, so the
    # quay rule is out of scope for it and says so by name rather than failing
    # an inland works parcel (the sap-tapping camp's four known-red rows).
    dry_work = next(r for r in report["sectionRules"] if r["parcelId"] == "dry-work")
    assert dry_work["rule"] == "works-quays-flood-section"
    assert dry_work["applicable"] is False and dry_work["waterEntityIds"] == []
    assert not any("works-quays-flood-section" in warning for warning in warnings)


def test_a_works_parcel_on_a_recorded_body_is_still_judged_by_the_quay_rule():
    """The scope rule must not swallow the finding it was written around.

    A works parcel that DOES stand on a recorded body is in scope: it is
    judged, it names the body by id, and if it fails it warns.
    """
    survey = FloodSurvey()
    survey.put_body(7, 7, "body.test")            # under the parcel, but dry
    square = lambda u, v: [[u - .01, v - .01], [u + .01, v - .01],
                           [u + .01, v + .01], [u - .01, v + .01]]
    bp = {
        "id": "place.fixture.quay-in-scope",
        "districts": [{"id": "root", "cultureKit": "argonian-root"}],
        "parcels": [_flood_parcel("quay", "root", "work", [0.75, 0.75], square(.75, .75))],
    }
    report, warnings = cs.flood_band_report(bp, survey)
    rule = next(r for r in report["sectionRules"] if r["parcelId"] == "quay")
    assert rule["waterEntityIds"] == ["body.test"]
    assert rule.get("applicable") is not False
    assert rule["conforms"] is False
    assert any("works-quays-flood-section" in w and "body.test" in w for w in warnings)


def test_a_water_fact_that_names_no_entity_fails_the_compile():
    """0066 — the gate the five shipped blueprints failed on 2026-09-22.

    Before the flood-section audit joined through the record, three parcels
    (two at Lilmoth, one at Mazzatun) measured wet and named no water: a water
    fact nobody could argue with. A fact with no id, an id the graph does not
    hold, and an id whose kind has moved are all hard errors.
    """
    survey = FloodSurvey()
    survey.put_body(4, 4, "body.test", kind="lake")
    report = {"parcels": [
        {"parcelId": "parcel.nameless", "touchesFloodSection": True,
         "waterEntityIds": [], "waterEntities": [],
         "openWaterSamples": 3, "floodBandSamples": 0, "wetSeasonInundatedSamples": 0},
        {"parcelId": "parcel.unknown", "touchesFloodSection": True,
         "waterEntityIds": ["body.ghost"],
         "waterEntities": [{"entityId": "body.ghost", "kind": "lake"}],
         "openWaterSamples": 1, "floodBandSamples": 0, "wetSeasonInundatedSamples": 0},
        {"parcelId": "parcel.moved", "touchesFloodSection": True,
         "waterEntityIds": ["body.test"],
         "waterEntities": [{"entityId": "body.test", "kind": "ocean"}],
         "openWaterSamples": 1, "floodBandSamples": 0, "wetSeasonInundatedSamples": 0},
        {"parcelId": "parcel.good", "touchesFloodSection": True,
         "waterEntityIds": ["body.test"],
         "waterEntities": [{"entityId": "body.test", "kind": "lake"}],
         "openWaterSamples": 1, "floodBandSamples": 0, "wetSeasonInundatedSamples": 0},
    ]}
    errors = cs.water_fact_errors(report, [], survey)
    assert any("parcel.nameless" in e and "no water entity id" in e for e in errors)
    assert any("parcel.unknown" in e and "neither a reach nor a body" in e for e in errors)
    assert any("parcel.moved" in e and "graph records it as 'lake'" in e for e in errors)
    assert not any("parcel.good" in e for e in errors)


def test_a_door_standing_on_water_joins_to_the_record():
    survey = FloodSurvey()
    survey.put_reach(4, 4, "reach.test", band=2)
    doors = [{"id": "door.over-water", "waterEntityId": "reach.test",
              "waterEntityKind": "horizontal-channel"},
             {"id": "door.mislabelled", "waterEntityId": "reach.test",
              "waterEntityKind": "lake"}]
    errors = cs.water_fact_errors({"parcels": []}, doors, survey)
    assert not any("door.over-water" in e for e in errors)
    assert any("door.mislabelled" in e for e in errors)


def test_flood_report_covers_raster_cells_inside_large_footprint():
    survey = FloodSurvey()
    # This wet cell is inside the footprint but is neither its centre, a
    # vertex, nor an edge midpoint: the old nine-point sample missed it.
    survey.open_water[3, 3] = True
    survey.put_body(3, 3, "body.test")
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


# --- the stilt share rule is scoped by measured ground, not by culture label --

def _stilt_district_report(*, touches_water: bool):
    """One `argonian-stilt` district of four buildings, none over open water.

    `touches_water` decides only whether the ground under them is in the flood
    band at all — which is the difference between Lilmoth's shore quarter and
    its hilltop hist court.
    """
    bp = {
        "id": "place.test.stilt",
        "districts": [{"id": "district.test.d", "cultureKit": "argonian-stilt"}],
        "parcels": [{"id": f"parcel.test.b{i}", "districtId": "district.test.d",
                     "use": "dwelling"} for i in range(4)],
    }
    kinds = {p["id"]: "building" for p in bp["parcels"]}

    class Survey:
        pass

    def evidence(parcel, _survey):
        return {"parcelId": parcel["id"], "districtId": parcel["districtId"],
                "use": parcel["use"], "sampleCount": 40,
                "openWaterSamples": 0,
                "floodBandSamples": 12 if touches_water else 0,
                "wetSeasonInundatedSamples": 0, "maxFloodBand": 1 if touches_water else 0,
                "centre": {"openWater": False, "floodBand": 0,
                           "wetSeasonInundated": False},
                "overOpenWater": False,
                "touchesFloodSection": touches_water,
                "entireFootprintDryInSurvey": not touches_water,
                "waterEntities": ([{"entityId": "reach.test", "kind": "horizontal-channel",
                                    "levelM": 1.0, "samples": 12, "why": ["flood-band"]}]
                                  if touches_water else []),
                "waterEntityIds": ["reach.test"] if touches_water else []}

    import worldgen.compile_settlement as cs
    original = cs._parcel_flood_evidence
    cs._parcel_flood_evidence = evidence
    try:
        return cs.flood_band_report(bp, Survey(), kinds)
    finally:
        cs._parcel_flood_evidence = original


def test_the_stilt_share_rule_only_judges_a_district_that_reaches_the_water():
    """MUTATION: drop the `touches_water` scope — red on the second case.

    Lilmoth's `council-crown` and `hist-court` are `argonian-stilt` by culture
    kit and stand on the 11-13 m bench and the 19-23 m crest; every building in
    them measures 0 open-water, 0 flood-band and 0 wet-season samples. The rule
    was being applied by LABEL where it must be applied by measured ground.
    """
    report, warnings = _stilt_district_report(touches_water=True)
    row = report["districts"][0]
    assert row["cultureRule"]["id"] == "argonian-stilt-open-water-share"
    assert row["cultureRule"].get("applicable") is not False
    assert row["conforms"] is False and warnings, (
        "a stilt district ON the water with no building over it must still fail")

    report, warnings = _stilt_district_report(touches_water=False)
    row = report["districts"][0]
    assert row["cultureRule"]["applicable"] is False, row["cultureRule"]
    assert "why" in row["cultureRule"], "a rule declared inapplicable must say why"
    assert row["conforms"] is None
    assert not warnings, (
        f"a district that reaches no water is not built over water and has "
        f"nothing to measure, yet it warned: {warnings}")


# --- mounts and doorways on the compiled transforms (16h item 7) ------------ #
# A lantern on a post, a sign on a wall: the child does not stand on the
# ground, it hangs off a parent at the offset the MAKERS used (the mined
# pair), and the runtime positions it from the parent's final transform.

class MountShelf:
    """Just the part of KitShelf `mount_children` reads: measured assets."""

    def __init__(self, assets):
        self.by_asset = {a["id"]: a for a in assets}


MOUNT_FIXTURE = {
    "schemaVersion": 1,
    "pairs": [{"child": "kit:lantern", "parent": "kit:post",
               "offsetM": [0.0, 0.0, 2.4], "yawDeg": 90.0, "n": 31,
               "spreadM": 0.04, "evidence": "plugin"}],
}


def _mount_placements():
    return [
        {"id": "p.post.near", "assetId": "kit:post", "positionM": [10.0, 0.0, 0.0],
         "yawDeg": 30.0},
        {"id": "p.post.far", "assetId": "kit:post", "positionM": [80.0, 0.0, 0.0],
         "yawDeg": 0.0},
        {"id": "p.lantern", "assetId": "kit:lantern", "positionM": [11.0, 0.0, 0.0],
         "yawDeg": 0.0},
    ]


def _mount_shelf():
    return MountShelf([{"id": "kit:post", "anchorClass": "ground"},
                       {"id": "kit:lantern", "anchorClass": "wall"}])


def test_a_mounted_child_hangs_off_the_nearest_mined_parent():
    placements = _mount_placements()
    errors = cs.mount_children("place.fixture.mounts", placements, _mount_shelf(),
                               {"kit:lantern": MOUNT_FIXTURE["pairs"]})
    child = next(row for row in placements if row["id"] == "p.lantern")
    assert errors == []
    assert child["parentPlacementId"] == "p.post.near"       # not the far post
    # the mined offset is (east, north, UP); the runtime frame is (x, UP, z),
    # so the axes swap here and the lantern is 2.4 m ABOVE the post, not 2.4 m
    # to the south of it.
    assert child["mountOffsetM"] == [0.0, 2.4, 0.0]
    assert child["anchorClass"] == "wall"
    assert child["mountEvidence"] == "plugin"
    # the child turns WITH its parent: parent yaw + the mined yaw
    assert child["yawDeg"] == 120.0


def test_a_mounted_child_with_no_mined_pair_is_a_named_compile_error():
    """The defect this was written on: a wall-class asset silently dropped onto
    the terrain because nothing said what it hangs from."""
    placements = _mount_placements()
    errors = cs.mount_children("place.fixture.mounts", placements, _mount_shelf(), {})
    child = next(row for row in placements if row["id"] == "p.lantern")
    assert "parentPlacementId" not in child
    assert len(errors) == 1
    assert "p.lantern" in errors[0] and "kit:lantern" in errors[0]
    assert "kit:post" in errors[0]          # the parents that ARE present


def test_a_mounted_child_whose_mined_parent_is_not_placed_here_is_an_error():
    placements = [row for row in _mount_placements() if row["assetId"] != "kit:post"]
    errors = cs.mount_children("place.fixture.mounts", placements, _mount_shelf(),
                               {"kit:lantern": MOUNT_FIXTURE["pairs"]})
    assert len(errors) == 1 and "p.lantern" in errors[0]


def _deck_shelf():
    """A raised platform and a deck piece that may stand on it."""
    return MountShelf([
        {"id": "kit:platform", "anchorClass": "ground",
         "sizeM": [6.0, 6.0, 3.0], "originOffsetM": [3.0, 3.0, 0.5]},
        {"id": "kit:crate", "anchorClass": "deck",
         "sizeM": [1.0, 1.0, 1.0], "originOffsetM": [0.5, 0.5, 0.0],
         "designedSinkM": {"p25": 0.1, "p50": 0.1, "p75": 0.1, "n": 4,
                           "evidence": "plugin"}},
    ])


def _deck_placements(crate_x: float):
    return [
        {"id": "p.platform", "assetId": "kit:platform", "positionM": [10.0, 4.0, 0.0],
         "yawDeg": 0.0, "scale": 1.0},
        {"id": "p.crate", "assetId": "kit:crate", "positionM": [crate_x, 0.0, 1.0],
         "yawDeg": 0.0, "scale": 1.0},
    ]


def test_a_deck_child_seats_on_the_top_face_of_the_parcel_it_stands_on():
    """The defect: `deck` was treated like `wall` and a crate standing on a
    platform with no mined pair became a compile error instead of standing."""
    placements = _deck_placements(crate_x=11.0)
    errors = cs.mount_children("place.fixture.deck", placements, _deck_shelf(), {})
    crate = next(row for row in placements if row["id"] == "p.crate")
    assert errors == []
    assert crate["anchorClass"] == "deck"
    assert crate["parentPlacementId"] == "p.platform"
    # top face above the parent pivot = sizeM.z - originOffsetM.z = 2.5;
    # the crate's own designed sink (0.1) drops its pivot into that face.
    assert crate["mountOffsetM"] == [1.0, 2.4, 1.0]
    assert crate["mountEvidence"] == "footprint-containment"


def test_a_deck_child_with_nothing_under_it_is_grounded_on_the_terrain():
    placements = _deck_placements(crate_x=40.0)
    errors = cs.mount_children("place.fixture.deck", placements, _deck_shelf(), {})
    crate = next(row for row in placements if row["id"] == "p.crate")
    assert errors == []
    assert crate["anchorClass"] == "deck"
    assert crate["parentPlacementId"] is None
    assert "mountOffsetM" not in crate


class DoorwaySurvey:
    extent_m = 100.0

    def uv_to_m(self, u, v):
        return u * self.extent_m, v * self.extent_m


def _door_bp():
    return {"id": "place.fixture.doorway"}


def test_a_door_binds_to_the_doorway_of_the_piece_it_opens():
    interiors = {"kit:hut": {"provenance": [{"kind": "assembly", "offsetM": [-2.45, -1.4],
                                             "sideDeg": 300.0}]}}
    placements = [{"id": "p.hut", "objectKind": "parcel", "parcelId": "parcel.hut",
                   "assetId": "kit:hut", "positionM": [50.0, 0.0, 50.0], "yawDeg": 0.0}]
    doors = [{"id": "door.1", "parcelId": "parcel.hut",
              "thresholdUV": [(50.0 - 2.45) / 100.0, (50.0 - 1.4) / 100.0]}]
    errors = cs.bind_doors_to_doorways(_door_bp(), doors, placements, DoorwaySurvey(),
                                       interiors, {})
    assert errors == []
    assert doors[0]["thresholdM"] == [47.55, 48.6]
    assert doors[0]["facingDeg"] == 300.0
    assert doors[0]["doorwaySource"] == "interiors/assembly"


def test_a_door_further_than_half_a_metre_from_any_doorway_fails():
    """The door was authored on the parcel polygon, so it opened a wall."""
    interiors = {"kit:hut": {"provenance": [{"kind": "assembly", "offsetM": [-2.45, -1.4],
                                             "sideDeg": 300.0}]}}
    placements = [{"id": "p.hut", "objectKind": "parcel", "parcelId": "parcel.hut",
                   "assetId": "kit:hut", "positionM": [50.0, 0.0, 50.0], "yawDeg": 0.0}]
    doors = [{"id": "door.1", "parcelId": "parcel.hut", "thresholdUV": [0.52, 0.50]}]
    errors = cs.bind_doors_to_doorways(_door_bp(), doors, placements, DoorwaySurvey(),
                                       interiors, {})
    assert len(errors) == 1 and "door.1" in errors[0] and "kit:hut" in errors[0]
    assert "thresholdM" not in doors[0]


def test_a_fixture_blueprint_records_its_warnings_as_waivers_and_keeps_its_errors():
    """16h part 1 round 4: the proving ground is a test yard (fixture: true);
    its WARN-grade findings (density, why-duplicate, no catalogue, flood rows)
    judge a layout nobody plays. They move into `fixtureWaived` with grade
    "warn" automatically; errors stay fatal and the doc is not a replay."""
    result = {"errors": ["a: broken"], "warnings": ["97 C6: density 7.2/ha", "no catalogue"]}
    cs.waive_fixture_warnings(result, {"id": "place.fixture.proving-ground", "fixture": True})
    assert result["warnings"] == []
    assert result["errors"] == ["a: broken"]
    assert [row["grade"] for row in result["fixtureWaived"]] == ["warn", "warn"]
    assert [row["message"] for row in result["fixtureWaived"]] == [
        "97 C6: density 7.2/ha", "no catalogue"]
    assert "fixtureReplay" not in result
    # A played place keeps its warnings live.
    played = {"errors": [], "warnings": ["97 C6: density"]}
    cs.waive_fixture_warnings(played, {"id": "place.a"})
    assert played == {"errors": [], "warnings": ["97 C6: density"]}


# --- 16h K9: modular runs laid on the mined abuts pairs ----------------------

_KEEP = "mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/walls/"
_K9_ABUTS = {
    "familyPairs": [{"parent": _KEEP + "mwimparchwall", "child": _KEEP + "mwimparchwall",
                     "parentPiece": "mwimparchwall", "childPiece": "mwimparchwall",
                     "parentFace": "+x", "childFace": "-x", "relScale": 1.0,
                     "offsetM": [7.27, 0.0, 0.0], "riseMinM": 0.0, "riseMaxM": 0.0,
                     "yawDeg": 0.0, "count": 8},
                    {"parent": _KEEP + "mwimparchwall", "child": _KEEP + "mwimparchwall",
                     "parentPiece": "mwimparchwall", "childPiece": "mwimparchwall",
                     "parentFace": "+y", "childFace": "+y", "relScale": 1.0,
                     "offsetM": [0.0, 2.81, 0.0], "riseMinM": 0.0, "riseMaxM": 0.0,
                     "yawDeg": 180.0, "count": 4}],
}


def test_family_key_joins_the_keep_curtain_variants():
    from .mine_abuts import family_of
    keys = {family_of(_KEEP + n) for n in ("mwimparchwall01", "mwimparchwall01destroyed02",
                                           "mwimparchwallgate01destroyed01",
                                           "mwimparchwalltower01")}
    assert keys == {_KEEP + "mwimparchwall"}
    assert family_of(_KEEP + "mwimparchwallcorin01") != _KEEP + "mwimparchwall"


def test_a_pieces_run_steps_along_the_family_pair_and_names_a_missing_pair():
    from . import blueprint_footprints as fp
    parcel = {"id": "p", "yawDeg": 90.0, "centreUV": [0.5, 0.5],
              "pieces": [{"asset": _KEEP + "mwimparchwall01destroyed01"},
                         {"asset": _KEEP + "mwimparchwallgate01"},
                         {"asset": _KEEP + "mwimparchwall01destroyed02"}]}
    laid, errors = fp.lay_pieces(parcel, _K9_ABUTS)
    assert errors == []
    # yaw 90: local +x runs south (+z); never the back-to-back +y pair
    assert [(round(r["xM"], 2), round(r["zM"], 2)) for r in laid] == \
        [(0.0, 0.0), (0.0, 7.27), (0.0, 14.54)]
    parcel["pieces"][1] = {"asset": "vanilla:architecture/farmhouse/farmhouse01"}
    _, errors = fp.lay_pieces(parcel, _K9_ABUTS)
    assert len(errors) == 1 and "farmhouse01" in errors[0] and "destroyed01" in errors[0]
