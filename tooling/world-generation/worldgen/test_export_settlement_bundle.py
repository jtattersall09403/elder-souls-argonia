import json
import hashlib

import pytest

from . import export_settlement_bundle as ex
from . import compile_settlement as cs
from . import terrain_requests


def _write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


def _route_source(root, structures):
    path = root / "route-structures-source.json"
    _write(path, {"schemaVersion": 1, "structures": structures})
    return path


class _MetreSurvey:
    @staticmethod
    def uv_to_m(u, v):
        return u * 100, v * 100


def _terrain_evidence(record):
    plan, errors = terrain_requests.build_plan([record])
    assert errors == []
    rows = []
    results = []
    for request in plan["requests"]:
        operation = next(row for row in plan["operations"] if row["requestId"] == request["id"])
        evidence = {"operationId": operation["id"],
                    "deliverySha256": terrain_requests.delivery_digest(request["delivery"]),
                    "coveredFields": sorted(request["delivery"]),
                    "witnesses": [{"x": 1, "z": 2, "appliedDeltaM": -1.0}]}
        evidence["evidenceSha256"] = hashlib.sha256(
            terrain_requests._canonical(evidence).encode()).hexdigest()
        rows.append({"requestId": request["id"], "operationIds": request["operationIds"],
                     "deliverySha256": terrain_requests.delivery_digest(request["delivery"]),
                     "operationEvidence": [evidence],
                     "evidenceRefs": [f"terrain-operation-evidence.{operation['id']}.sha256."
                                      f"{evidence['evidenceSha256']}"]})
        results.append({"requestId": request["id"], "placeId": request["placeId"],
                        "deliverySha256": terrain_requests.delivery_digest(request["delivery"]),
                        "status": "pass", "findings": []})
    fulfillment = {"schemaVersion": terrain_requests.FULFILLMENT_SCHEMA_VERSION,
                   "kind": "terrain-request-fulfillments", "sourceDigest": plan["sourceDigest"],
                   "planDigest": plan["planDigest"], "fulfillments": rows}
    payload = {"planDigest": plan["planDigest"], "sourceDigest": plan["sourceDigest"],
               "globalFindings": [], "requests": results}
    postconditions = {"schemaVersion": 1, "kind": "terrain-request-postconditions",
                      "status": "pass", **payload,
                      "reportDigest": cs._canonical_sha256(payload)}
    return plan, fulfillment, postconditions


def test_bundle_joins_compiler_geometry_and_routes(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: type("Survey", (), {
        "uv_to_m": staticmethod(lambda u, v: (u * 100, v * 100))})())
    bp = {"blueprint": {"id": "place.a", "boundary": [[0, 0], [1, 0], [1, 1]],
                        "parcels": [{"id": "parcel.a", "footprint": [[.1, .2], [.3, .2], [.2, .4]]}],
                        "variants": []}}
    _write(tmp_path / "bp/place.a.json", bp)
    placement = {"id": "place.a.parcel.a.building", "parcelId": "parcel.a",
                 "assetId": "asset.house", "kit": "kit-a", "positionM": [20, 4, 30],
                 "yawDeg": 17, "scale": 1, "groundFit": "plinth", "provenance": {}}
    compiled_objects, errors = cs.compiled_blueprint_objects(
        bp["blueprint"], [placement], [], _MetreSurvey())
    assert errors == []
    _write(tmp_path / "sett/place.a.settlement.json",
           {"id": "place.a", "sourceBlueprintSha256": ex.blueprint_sha256(bp["blueprint"]),
            "errors": [], "warnings": [], "floodBandReport": {"warningCount": 0},
            "placements": [placement], "doors": [], "budgetReport": {},
            "compiledObjects": compiled_objects})
    structure = {"id": "structure.a.1", "wayId": "route.a", "kind": "bridge",
                 "fromM": 10, "toM": 20}
    route = {"id": "structure.a.1.p1", "assetId": "asset.bridge", "posM": [9, 2, 8],
             "fromM": 10, "toM": 20,
             "yawDeg": 90, "provenance": {"sourceStructureId": "structure.a.1"}}
    _write(tmp_path / "routes/a.json", {"wayId": "route.a", "structures": [structure],
                                         "placements": [route]})
    for kit, asset in (("kit-a", "asset.house"), ("route-structures-v1", "asset.bridge")):
        _write(tmp_path / f"kits/{kit}.kit.json", {"kit": kit, "assets": [{
            "id": asset, "sizeM": [4, 6, 8], "originOffsetM": [2, 3, 1],
            "triangles": 500, "collision": "mesh"}]})
    bundle = ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                             tmp_path / "kits", _route_source(tmp_path, [structure]))
    assert bundle["stats"] == {"settlements": 1, "settlementPlacements": 1,
                               "routeStructurePlacements": 1}
    house = next(p for p in bundle["placements"] if p["kind"] == "settlement")
    assert house["footprintM"][0] == [10.0, 20.0]
    assert house["anchor"]["mode"] == "streamed-perimeter"
    assert house["collision"]["frame"] == ex.COLLISION_FRAME
    assert len(bundle["groundTreatments"]) == len(bundle["navmeshCuts"]) == 1
    assert bundle["settlements"][0]["floodBandReport"] == {"warningCount": 0}


def test_refuses_compiler_errors(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _write(tmp_path / "sett/place.a.settlement.json",
           {"id": "place.a", "errors": ["bad"], "placements": []})
    with pytest.raises(ValueError, match="refusing to publish"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []))


def test_refuses_unclosed_flood_warning_before_runtime_export(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    bp = {"id": "place.a"}
    _write(tmp_path / "bp/place.a.json", {"blueprint": bp})
    _write(tmp_path / "sett/place.a.settlement.json", {
        "id": "place.a", "sourceBlueprintSha256": ex.blueprint_sha256(bp),
        "errors": [], "warnings": ["wet civic floor"],
        "floodBandReport": {"warningCount": 1}, "placements": [],
    })
    with pytest.raises(ValueError, match="unclosed placement warnings"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []))


def test_refuses_stale_success_after_blueprint_mutation(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    original = {"id": "place.a", "boundary": [[0, 0], [1, 0], [1, 1]]}
    compiled = tmp_path / "sett/place.a.settlement.json"
    _write(compiled, {"id": "place.a", "sourceBlueprintSha256": ex.blueprint_sha256(original),
                      "errors": [], "warnings": [], "floodBandReport": {"warningCount": 0},
                      "placements": []})
    # A schema-failing recompile leaves the prior successful output in place;
    # a semantic source mutation must invalidate it regardless of mtimes.
    changed = {**original, "boundary": [[0, 0], [2, 0], [1, 1]]}
    _write(tmp_path / "bp/place.a.json", {"blueprint": changed})
    with pytest.raises(ValueError, match="sourceBlueprintSha256"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []))


def test_refuses_an_authored_exemplar_with_no_compiled_output(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _write(tmp_path / "bp/place.a.json", {"blueprint": {"id": "place.a"}})
    with pytest.raises(ValueError, match="missing compiled blueprints: place.a"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []))


def test_refuses_missing_route_output_and_missing_structure_placements(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    source_row = {"id": "structure.a.1", "wayId": "route.a", "kind": "bridge",
                  "fromM": 10, "toM": 20}
    source = _route_source(tmp_path, [source_row])
    with pytest.raises(ValueError, match="missing route structure outputs: a.json"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", source)

    _write(tmp_path / "routes/a.json", {"wayId": "route.a", "structures": [source_row],
                                         "placements": []})
    with pytest.raises(ValueError, match="authored structures have no placements"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", source)


def test_refuses_route_output_with_stale_embedded_authored_row(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    source_row = {"id": "structure.a.1", "wayId": "route.a", "kind": "bridge",
                  "fromM": 10, "toM": 20}
    stale_row = {**source_row, "kind": "deck"}
    placement = {"id": "structure.a.1.p1", "fromM": 10, "toM": 20,
                 "provenance": {"sourceStructureId": source_row["id"]}}
    _write(tmp_path / "routes/a.json", {"wayId": "route.a", "structures": [stale_row],
                                         "placements": [placement]})
    with pytest.raises(ValueError, match="differs from authored source"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, [source_row]))


def test_refuses_a_gap_in_a_route_structure_placement_set(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    source_row = {"id": "structure.a.1", "wayId": "route.a", "kind": "bridge",
                  "fromM": 10, "toM": 30}
    placements = [
        {"id": "structure.a.1.p1", "fromM": 10, "toM": 15,
         "provenance": {"sourceStructureId": source_row["id"]}},
        {"id": "structure.a.1.p3", "fromM": 20, "toM": 30,
         "provenance": {"sourceStructureId": source_row["id"]}},
    ]
    _write(tmp_path / "routes/a.json", {"wayId": "route.a", "structures": [source_row],
                                         "placements": placements})
    with pytest.raises(ValueError, match="placement id set is not contiguous"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, [source_row]))


def test_copy_assets_validates_every_input_before_touching_publication(tmp_path):
    bundle = {"kits": {"a": {}, "b": {}}}
    for name in ("a.glb", "a.kit.json", "b.kit.json"):
        (tmp_path / "source" / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / "source" / name).write_bytes(b"present")
    public = tmp_path / "public"
    public.mkdir()
    (public / "a.glb").write_bytes(b"old")
    with pytest.raises(ValueError, match="b.glb"):
        ex.copy_assets(bundle, tmp_path / "source", public)
    assert (public / "a.glb").read_bytes() == b"old"
    assert sorted(path.name for path in public.iterdir()) == ["a.glb"]


def test_measured_manifest_box_is_exported_as_the_collision_proxy():
    contract = ex._collision_contract({
        "collision": "mesh", "collisionFrame": "pivot-yup-v3",
        "collisionBox": {"halfExtentsM": [1, 2, 3], "centreOffsetM": [4, 5, 6]},
    })
    assert contract["proxySource"] == "measured-manifest-box"
    assert contract["parts"] == [{"halfExtentsM": [1, 2, 3], "offsetM": [4, 5, 6]}]


def _obligation_bundle_fixture(tmp_path):
    record = {
        "id": "place.test.receipt", "position": {"u": 0.5, "v": 0.5},
        "terrainRequests": [{
            "kind": "cut", "radiusM": 30,
            "delivery": {"feature": "landing-cut", "depthClass": "navigable"},
            "note": "The landing needs a real cut.",
        }],
    }
    bp = {
        "id": record["id"], "boundary": [[0, 0], [1, 0], [1, 1]],
        "routes": [{"id": "route.receipt.landing"}],
        "macroEvidence": [{"sourcePaths": ["terrainRequests"],
                            "evidenceRefs": ["route.receipt.landing"]}],
    }
    evidence = _terrain_evidence(record)
    compiled, compiled_errors = cs.compiled_blueprint_objects(bp, [], [], _MetreSurvey())
    terrain, terrain_errors = cs.compiled_terrain_objects(
        record, **dict(zip(("plan", "fulfillment", "postconditions"), evidence)))
    assert compiled_errors == terrain_errors == []
    compiled += terrain
    compiled.sort(key=lambda row: row["id"])
    receipt, errors = cs.phase11_obligation_receipt(bp, record, compiled)
    assert errors == []
    _write(tmp_path / "bp/place.test.receipt.json", {"blueprint": bp})
    settlement_path = tmp_path / "sett/place.test.receipt.settlement.json"
    _write(settlement_path, {
        "id": record["id"], "sourceBlueprintSha256": ex.blueprint_sha256(bp),
        "errors": [], "warnings": [], "floodBandReport": {"warningCount": 0},
        "placements": [], "doors": [], "budgetReport": {},
        "compiledObjects": compiled,
        "phase11ObligationReceipt": receipt,
    })
    _write(tmp_path / "kits/route-structures-v1.kit.json",
           {"kit": "route-structures-v1", "assets": []})
    source = _route_source(tmp_path, [])
    return record, settlement_path, source, evidence


def test_bundle_verifies_and_carries_phase11_compiled_receipt(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: type("Survey", (), {
        "uv_to_m": staticmethod(lambda u, v: (u * 100, v * 100))})())
    record, _settlement, source, evidence = _obligation_bundle_fixture(tmp_path)
    bundle = ex.build_bundle(
        tmp_path / "sett", tmp_path / "routes", tmp_path / "bp", tmp_path / "kits",
        source, catalogue_records_by_id={record["id"]: record}, terrain_evidence=evidence)
    assert [row["placeId"] for row in bundle["phase11ObligationReceipts"]] == [record["id"]]
    assert {row["id"] for row in bundle["compiledObjects"]} == {
        row["id"] for row in json.loads(_settlement.read_text())["compiledObjects"]}


def test_bundle_rejects_omitted_non_rendered_compiled_object(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", _MetreSurvey)
    record, settlement_path, source, evidence = _obligation_bundle_fixture(tmp_path)
    document = json.loads(settlement_path.read_text())
    document["compiledObjects"] = [row for row in document["compiledObjects"]
                                   if row["id"] != "route.receipt.landing"]
    _write(settlement_path, document)
    with pytest.raises(ValueError, match="compiledObjects do not match"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", source,
                        catalogue_records_by_id={record["id"]: record},
                        terrain_evidence=evidence)


def test_bundle_rejects_receipt_hash_not_bound_to_compiled_object(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", _MetreSurvey)
    record, settlement_path, source, evidence = _obligation_bundle_fixture(tmp_path)
    document = json.loads(settlement_path.read_text())
    receipt = document["phase11ObligationReceipt"]
    ref = next(iter(receipt["objectRegistry"]))
    receipt["objectRegistry"][ref]["compiledObjectSha256"] = "0" * 64
    receipt["manifest"]["objectRegistrySha256"] = (
        ex.place_obligations.compiled_object_registry_sha256(receipt["objectRegistry"]))
    payload = {key: receipt[key] for key in ("placeId", "objectRegistry", "manifest")}
    receipt["receiptSha256"] = cs._canonical_sha256(payload)
    _write(settlement_path, document)
    with pytest.raises(ValueError, match="receipt hash does not match compiled object"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", source,
                        catalogue_records_by_id={record["id"]: record},
                        terrain_evidence=evidence)


@pytest.mark.parametrize("mutation, expected", [
    ("missing", "no phase-11-compiled obligation receipt"),
    ("stale", "exact current requests"),
    ("wrong-kind", "type does not match compiled object"),
])
def test_bundle_fails_closed_on_bad_phase11_compiled_receipt(
        tmp_path, monkeypatch, mutation, expected):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    record, settlement_path, source, evidence = _obligation_bundle_fixture(tmp_path)
    document = json.loads(settlement_path.read_text())
    if mutation == "missing":
        document.pop("phase11ObligationReceipt")
    elif mutation == "stale":
        record["terrainRequests"][0]["delivery"]["depthClass"] = "swimming"
    else:
        receipt = document["phase11ObligationReceipt"]
        ref = next(iter(receipt["objectRegistry"]))
        receipt["objectRegistry"][ref]["kind"] = "parcel"
        receipt["manifest"]["objectRegistrySha256"] = (
            ex.place_obligations.compiled_object_registry_sha256(receipt["objectRegistry"]))
        payload = {key: receipt[key] for key in ("placeId", "objectRegistry", "manifest")}
        receipt["receiptSha256"] = cs._canonical_sha256(payload)
    _write(settlement_path, document)
    with pytest.raises(ValueError, match=expected):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", source,
                        catalogue_records_by_id={record["id"]: record}, terrain_evidence=evidence)


def test_atomic_writer_replaces_complete_json(tmp_path):
    out = tmp_path / "bundle.json"
    ex._atomic_json(out, {"schemaVersion": 1, "value": "complete"})
    assert json.loads(out.read_text())["value"] == "complete"
    assert list(tmp_path.glob(".bundle.json.*")) == []
