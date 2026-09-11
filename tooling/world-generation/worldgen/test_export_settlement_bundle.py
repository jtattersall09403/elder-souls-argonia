import json
import hashlib
import struct

import pytest
import numpy as np

from . import export_settlement_bundle as ex
from . import compile_settlement as cs
from . import terrain_requests
from . import grade_settlement_pads as pad_grades


REAL_REGISTER = ex.WARNING_KNOWN_RED


@pytest.fixture(autouse=True)
def _no_register(tmp_path, monkeypatch):
    """Fixture places are not in the real known-red register; start empty."""
    monkeypatch.setattr(ex, "WARNING_KNOWN_RED", tmp_path / "absent-register.json")


def _register(tmp_path, monkeypatch, rows):
    path = tmp_path / "register.json"
    _write(path, {"schemaVersion": 1, "kind": "settlement-warning-known-red", "warnings": rows})
    monkeypatch.setattr(ex, "WARNING_KNOWN_RED", path)
    return path


def _write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


def _route_source(root, structures):
    path = root / "route-structures-source.json"
    _write(path, {"schemaVersion": 1, "structures": structures})
    return path


def _manifest_placement(policy, *, mode="streamed-origin", contact=1,
                        bury=.31, cap=.72, slope=.04):
    return {
        "schemaVersion": 1,
        "anchorMode": mode,
        "groundContactOffsetM": contact,
        "buryM": bury,
        "buryCapM": cap,
        "slopeBuryPerM": slope,
        "evidence": {
            "groundContactOffsetM": "measured transformed LOD0 bounds: originOffsetM[2]",
            "policyId": policy,
            "fitPolicy": f"authored placement-policies.json policy {policy}: test evidence",
        },
    }


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
    span = {"id": "structure.a.1.p2", "assetId": "asset.viaduct", "posM": [9, 3, 9],
            "fromM": 20, "toM": 30,
            "yawDeg": 90, "provenance": {"sourceStructureId": "structure.a.1"}}
    _write(tmp_path / "routes/a.json", {"wayId": "route.a", "structures": [structure],
                                         "placements": [route, span]})
    manifests = (
        ("kit-a", "asset.house", _manifest_placement(
            "plinth", mode="streamed-origin", bury=.41, cap=.67, slope=.03)),
        ("route-structures-v1", "asset.bridge", _manifest_placement(
            "route-structure", mode="streamed-perimeter", bury=.09, cap=.21, slope=.02)),
        # Crossings come from the second route kit (decision 0051); the bundle
        # must load both manifests and resolve each placement to the one that
        # holds it.
        ("route-spans-v1", "asset.viaduct", _manifest_placement(
            "route-structure", mode="streamed-perimeter", bury=.09, cap=.21, slope=.02)),
    )
    for kit, asset, placement_policy in manifests:
        _write(tmp_path / f"kits/{kit}.kit.json", {"kit": kit, "assets": [{
            "id": asset, "sizeM": [4, 6, 8], "originOffsetM": [2, 3, 1],
            "triangles": 500, "collision": "mesh", "placement": placement_policy}]})
        # The collider-budget gate counts real LOD0 parts, so the kit GLB is an
        # input to the export, not just an asset copied at publication time.
        _fake_glb(tmp_path / f"kits/{kit}.glb", {asset: [2, 1, 1]})
    bundle = ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                             tmp_path / "kits", _route_source(tmp_path, [structure]))
    assert bundle["stats"] == {"settlements": 1, "settlementPlacements": 1,
                               "routeStructurePlacements": 2}
    house = next(p for p in bundle["placements"] if p["kind"] == "settlement")
    assert house["footprintM"][0] == [10.0, 20.0]
    assert house["anchor"]["mode"] == "streamed-origin"
    assert house["anchor"]["groundContactOffsetM"] == 1
    assert house["anchor"]["originOffsetM"] == [2, 3, 1]
    assert (house["anchor"]["buryM"], house["anchor"]["buryCapM"],
            house["anchor"]["slopeBuryPerM"]) == (.41, .67, .03)
    assert house["anchor"]["evidence"]["fitPolicy"].startswith(
        "authored placement-policies.json policy plinth:")
    assert house["collision"]["frame"] == ex.COLLISION_FRAME
    route_placement = next(p for p in bundle["placements"]
                           if p["kind"] == "route-structure"
                           and p["assetId"] == "asset.bridge")
    # Each route placement resolves to whichever of the two route kits holds it:
    # a climb from route-structures-v1, a crossing from route-spans-v1. A single
    # hard-coded kit name silently loses every span piece (decision 0051).
    assert route_placement["kit"] == "route-structures-v1"
    span_placement = next(p for p in bundle["placements"]
                          if p["assetId"] == "asset.viaduct")
    assert span_placement["kit"] == "route-spans-v1"
    assert route_placement["anchor"]["mode"] == "streamed-perimeter"
    assert route_placement["anchor"]["buryM"] == .09
    assert len(route_placement["footprintM"]) == 4
    assert len(bundle["groundTreatments"]) == len(bundle["navmeshCuts"]) == 1
    assert bundle["settlements"][0]["floodBandReport"] == {"warningCount": 0}

    compiled_path = tmp_path / "sett/place.a.settlement.json"
    compiled = json.loads(compiled_path.read_text())
    compiled["placements"][0].pop("kit")
    compiled["compiledObjects"], errors = cs.compiled_blueprint_objects(
        bp["blueprint"], compiled["placements"], [], _MetreSurvey())
    assert errors == []
    _write(compiled_path, compiled)
    with pytest.raises(ValueError, match="physical placement has no built kit"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, [structure]))


@pytest.mark.parametrize("mutation, expected", [
    (lambda asset: asset.pop("placement"), "no placement metadata"),
    (lambda asset: asset["placement"].pop("buryCapM"), "metadata missing"),
    (lambda asset: asset["placement"].update({"groundContactOffsetM": 2}),
     "disagrees with measured"),
    (lambda asset: asset["placement"].update({"buryM": 2}), "exceeds buryCapM"),
    (lambda asset: asset["placement"].update({"anchorMode": "guessed"}),
     "invalid manifest anchorMode"),
    (lambda asset: asset["placement"].update({"evidence": {}}),
     "placement evidence is malformed"),
])
def test_manifest_placement_contract_fails_closed(mutation, expected):
    asset = {
        "id": "asset.house", "originOffsetM": [2, 3, 1],
        "placement": _manifest_placement("plinth"),
    }
    mutation(asset)
    with pytest.raises(ValueError, match=expected):
        ex._validated_asset_placement("kit-a", asset)


def test_ground_fit_must_match_policy_or_an_explicit_asset_compatibility_rule():
    asset = {
        "id": "asset.house", "originOffsetM": [2, 3, 1],
        "placement": _manifest_placement("plinth"),
    }
    anchor, policy_id = ex._validated_asset_placement("kit-a", asset)
    runtime_asset = {**asset, "_runtimeAnchor": anchor,
                     "_placementPolicyId": policy_id}
    with pytest.raises(ValueError, match="contradicts reviewed manifest policy"):
        ex._anchor_contract(runtime_asset, "pad")

    compatible = {
        **runtime_asset,
        "id": "mudmother:gv_meshes/argoniannest/fishracksmall",
        "placement": _manifest_placement("direct"),
    }
    anchor, policy_id = ex._validated_asset_placement("kit-a", compatible)
    compatible.update(_runtimeAnchor=anchor, _placementPolicyId=policy_id)
    assert ex._anchor_contract(compatible, "pad")["groundFit"] == "pad"


def test_same_asset_id_in_two_kits_keeps_each_manifest_policy(tmp_path):
    for kit, bury in (("kit-a", .11), ("kit-b", .22)):
        _write(tmp_path / f"{kit}.kit.json", {"kit": kit, "assets": [{
            "id": "asset.shared", "originOffsetM": [1, 1, .5],
            "placement": _manifest_placement(
                "direct", contact=.5, bury=bury, cap=.3, slope=0),
        }]})

    _kits, assets = ex._kit_assets({"kit-a", "kit-b"}, tmp_path)
    assert assets[("kit-a", "asset.shared")]["_runtimeAnchor"]["buryM"] == .11
    assert assets[("kit-b", "asset.shared")]["_runtimeAnchor"]["buryM"] == .22


def test_every_current_multi_fit_use_has_an_explicit_compatibility_rule():
    inventory = json.loads((
        ex.REPO_ROOT / "tooling/asset-pipeline/pipeline/config/placement-policies.json"
    ).read_text())
    # Route compilation measures one ground point per chained piece; a full
    # deck sample would contradict the route policy's intentionally small cap.
    assert inventory["policies"]["route-structure"]["anchorMode"] == "streamed-origin"
    uses = []

    def walk(value, path=()):
        if isinstance(value, dict):
            ref = value.get("assetRef")
            if isinstance(ref, str) and (not path or path[-1] != "interior"):
                uses.append((ref, value.get("groundFit", "direct")))
            for key, child in value.items():
                walk(child, path + (key,))
        elif isinstance(value, list):
            for child in value:
                walk(child, path)

    for path in sorted((ex.REPO_ROOT / "world/sources/blueprints").glob("place.*.json")):
        walk(json.loads(path.read_text()).get("blueprint", {}))
    route_source = json.loads(ex.ROUTE_STRUCTURES_SOURCE.read_text())
    uses.extend((row["pieceRef"], "direct") for row in route_source["structures"])

    for asset_id, fit in uses:
        key = asset_id.strip().replace("\\", "/").casefold()
        policy = inventory["assetPolicies"].get(key)
        if policy is not None:  # unresolved physical refs fail the separate coverage gate
            ex._validate_ground_fit(key, fit, policy)


def test_refuses_compiler_errors(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _write(tmp_path / "sett/place.a.settlement.json",
           {"id": "place.a", "errors": ["bad"], "placements": []})
    with pytest.raises(ValueError, match="refusing to publish"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []))


def _warned_settlement(tmp_path, *, conforms=False):
    _write(tmp_path / "kits/route-structures-v1.kit.json",
           {"kit": "route-structures-v1", "assets": []})
    _write(tmp_path / "kits/route-spans-v1.kit.json",
           {"kit": "route-spans-v1", "assets": []})
    for empty_kit in ("route-structures-v1", "route-spans-v1"):
        _glb_with_images(tmp_path / f"kits/{empty_kit}.glb", [])
    bp = {"id": "place.a"}
    _write(tmp_path / "bp/place.a.json", {"blueprint": bp})
    _write(tmp_path / "sett/place.a.settlement.json", {
        "id": "place.a", "sourceBlueprintSha256": ex.blueprint_sha256(bp),
        "errors": [], "warnings": ["wet civic floor"] if not conforms else [],
        "floodBandReport": {
            "warningCount": 0 if conforms else 1,
            "sectionRules": [{"parcelId": "parcel.a", "rule": "civic-sacred-dry",
                              "conforms": conforms}],
        },
        "placements": [], "compiledObjects": [], "doors": [], "budgetReport": {},
    })


def _build(tmp_path):
    return ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                           tmp_path / "kits", _route_source(tmp_path, []))


def test_refuses_a_warning_with_no_structured_row(tmp_path, monkeypatch):
    """An unattributable warning cannot be explained, so it still blocks."""
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    bp = {"id": "place.a"}
    _write(tmp_path / "bp/place.a.json", {"blueprint": bp})
    _write(tmp_path / "sett/place.a.settlement.json", {
        "id": "place.a", "sourceBlueprintSha256": ex.blueprint_sha256(bp),
        "errors": [], "warnings": ["wet civic floor"],
        "floodBandReport": {"warningCount": 1}, "placements": [],
    })
    with pytest.raises(ValueError, match="unattributable"):
        _build(tmp_path)


def test_refuses_an_unregistered_flood_warning(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _warned_settlement(tmp_path)
    with pytest.raises(ValueError, match="UNEXPLAINED WARNING"):
        _build(tmp_path)


def test_a_registered_warning_is_reported_by_name_and_does_not_block(tmp_path, monkeypatch,
                                                                     capsys):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _warned_settlement(tmp_path)
    _register(tmp_path, monkeypatch, [{
        "placeId": "place.a", "subjectId": "parcel.a", "rule": "civic-sacred-dry",
        "owner": "water", "queuedIn": "docs/research/archive/water-round-2-2026-09/water-handoff.md",
        "why": "two water layers disagree",
    }])
    bundle = _build(tmp_path)
    assert bundle["knownRedWarnings"] == [{
        "placeId": "place.a", "subjectId": "parcel.a", "rule": "civic-sacred-dry",
        "owner": "water", "queuedIn": "docs/research/archive/water-round-2-2026-09/water-handoff.md",
        "why": "two water layers disagree",
    }]
    assert "KNOWN-RED settlement warning (water-owned" in capsys.readouterr().out


def test_a_register_row_that_has_started_passing_blocks(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _warned_settlement(tmp_path, conforms=True)
    _register(tmp_path, monkeypatch, [{
        "placeId": "place.a", "subjectId": "parcel.a", "rule": "civic-sacred-dry",
        "owner": "water", "queuedIn": "docs/research/archive/water-round-2-2026-09/water-handoff.md",
        "why": "two water layers disagree",
    }])
    with pytest.raises(ValueError, match="NO LONGER RED"):
        _build(tmp_path)


def test_a_register_row_whose_place_vanished_blocks(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _warned_settlement(tmp_path, conforms=True)
    _register(tmp_path, monkeypatch, [{
        "placeId": "place.gone", "subjectId": "parcel.x", "rule": "civic-sacred-dry",
        "owner": "water", "queuedIn": "docs/research/archive/water-round-2-2026-09/water-handoff.md",
        "why": "two water layers disagree",
    }])
    with pytest.raises(ValueError, match="NOT IN THE COMPILED SET"):
        _build(tmp_path)


def test_a_register_row_must_name_its_owner_and_where_it_is_queued(tmp_path, monkeypatch):
    path = _register(tmp_path, monkeypatch, [{
        "placeId": "place.a", "subjectId": "parcel.a", "rule": "civic-sacred-dry",
        "owner": "water", "why": "no queuedIn",
    }])
    with pytest.raises(ValueError, match="queuedIn"):
        ex.load_warning_known_red(path)


def test_the_shipped_register_rows_are_well_formed():
    rows = ex.load_warning_known_red(REAL_REGISTER)
    assert rows, "the shipped register should carry the current known-red warnings"
    assert all(row["owner"] and row["queuedIn"] and row["why"] for row in rows.values())


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
    _write(tmp_path / "kits/route-spans-v1.kit.json",
           {"kit": "route-spans-v1", "assets": []})
    for empty_kit in ("route-structures-v1", "route-spans-v1"):
        _glb_with_images(tmp_path / f"kits/{empty_kit}.glb", [])
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


def test_pad_delivery_binds_current_blueprint_to_final_height():
    document = {"schemaVersion": 1, "blueprint": {
        "id": "place.test.pad", "parcels": [{
            "id": "parcel.test.pad", "groundFit": "pad", "yawDeg": 12,
            "footprint": [[0.2, 0.2], [0.3, 0.2], [0.3, 0.3], [0.2, 0.3]],
        }],
    }}
    height = np.linspace(0.0, 0.2, 101, dtype=np.float32)[None, :].repeat(101, 0)
    specs = pad_grades.pad_specs([document], extent_m=100.0)
    result, rows = pad_grades.apply_pad_grades(height, specs, metres_per_sample=1.0)
    receipt = pad_grades.build_receipt(height, result, rows)
    assert ex.validate_applied_pad_grades(receipt, [document], result) == []

    changed = json.loads(json.dumps(document))
    changed["blueprint"]["parcels"][0]["yawDeg"] = 30
    assert any("does not match" in error for error in
               ex.validate_applied_pad_grades(receipt, [changed], result))
    moved = result.copy()
    moved[0, 0] += 0.1
    assert any("does not match" in error for error in
               ex.validate_applied_pad_grades(receipt, [document], moved))
    assert ex.validate_applied_pad_grades(None, [document], result)


def _fake_glb(path, assets, triangles=None):
    """Minimal GLB carrying the node/mesh graph the export's kit readers walk.

    `assets` maps an asset id to its per-tier primitive count; `triangles` maps
    it to per-tier triangle totals (a generous default that clears the floor).
    """
    nodes = []
    meshes = []
    accessors = []
    roots = []
    for asset_id, primitives_per_lod in assets.items():
        children = []
        tiers = (triangles or {}).get(asset_id) or [4000, 1400, 480][:len(primitives_per_lod)]
        for lod, primitives in enumerate(primitives_per_lod):
            per_primitive = tiers[lod] // max(1, primitives)
            indices = []
            for _ in range(primitives):
                accessors.append({"count": per_primitive * 3})
                indices.append({"indices": len(accessors) - 1})
            meshes.append({"primitives": indices})
            nodes.append({"mesh": len(meshes) - 1, "extras": {"lod": lod}})
            children.append(len(nodes) - 1)
        nodes.append({"extras": {"assetId": asset_id}, "children": children})
        roots.append(len(nodes) - 1)
    document = {"asset": {"version": "2.0"}, "scene": 0, "accessors": accessors,
                "scenes": [{"nodes": roots}], "nodes": nodes, "meshes": meshes}
    chunk = json.dumps(document).encode("utf-8")
    chunk += b" " * (-len(chunk) % 4)
    body = struct.pack("<II", len(chunk), 0x4E4F534A) + chunk
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)


def test_lod0_part_counts_reads_only_level_zero_primitives(tmp_path):
    _fake_glb(tmp_path / "kit-a.glb", {"asset:big": [7, 3, 2], "asset:small": [1, 1, 1]})
    assert ex.lod0_part_counts("kit-a", tmp_path) == {"asset:big": 7, "asset:small": 1}


def _budget_fixture(tmp_path):
    _fake_glb(tmp_path / "kit-a.glb", {"asset:big": [7, 3, 2], "asset:small": [1, 1, 1]})
    placements = [
        {"id": "p.big", "kit": "kit-a", "assetId": "asset:big",
         "collision": {"kind": "mesh"}},
        {"id": "p.small", "kit": "kit-a", "assetId": "asset:small",
         "collision": {"kind": "mesh"}},
        {"id": "p.proxy", "kit": "kit-a", "assetId": "asset:big",
         "collision": {"kind": "convex", "parts": [{}, {}]}},
        {"id": "p.none", "kit": "kit-a", "assetId": "asset:big",
         "collision": {"kind": "none"}},
    ]
    settlements = [{"id": "place.test.big",
                    "placementIds": ["p.big", "p.small", "p.proxy", "p.none"]}]
    return settlements, placements


def test_resident_collision_parts_counts_real_parts_not_placements(tmp_path):
    settlements, placements = _budget_fixture(tmp_path)
    # 7 (mesh LOD0) + 1 (mesh LOD0) + 2 (measured proxy) + 0 (no collision).
    assert ex.resident_collision_parts(settlements, placements, tmp_path) == {
        "place.test.big": 10}


def test_collider_budget_gate_fails_below_the_requirement_and_passes_above(tmp_path):
    settlements, placements = _budget_fixture(tmp_path)
    errors = ex.collider_budget_errors(settlements, placements, 9, tmp_path)
    assert len(errors) == 1
    assert "place.test.big" in errors[0] and "10" in errors[0] and "9" in errors[0]
    assert ex.collider_budget_errors(settlements, placements, 10, tmp_path) == []


def test_shipped_bundle_settlements_fit_the_shipped_collider_budget():
    """The gate on the real data: Lilmoth is the settlement that broke this."""
    bundle = json.loads(ex.OUT.read_text())
    totals = ex.resident_collision_parts(
        bundle["settlements"], bundle["placements"], ex.PUBLIC_KITS)
    assert totals, "published bundle has no settlements"
    assert bundle["lod"]["colliderPartBudget"] == ex.COLLIDER_PART_BUDGET
    over = {name: parts for name, parts in totals.items()
            if parts > ex.COLLIDER_PART_BUDGET}
    assert not over, f"published settlements exceed the collider budget: {over}"


_LOD_CONTRACT = {"tiers": 3, "absoluteTriangleFloor": [120, 80]}


def test_lod_gate_refuses_a_two_tier_asset(tmp_path):
    """The exact shipped defect: probe kits were built with one lodRatio, so
    their assets reached the bundle with a two-tier chain and the runtime's
    validateLodTriangles threw in the browser (2026-09-09)."""
    _fake_glb(tmp_path / "probe-kit.glb", {"asset:short": [1, 1]},
              triangles={"asset:short": [1084, 382]})
    placements = [{"id": "p.1", "kit": "probe-kit", "assetId": "asset:short"}]
    errors = ex.lod_contract_errors(placements, _LOD_CONTRACT, tmp_path)
    assert len(errors) == 1
    assert "asset:short" in errors[0] and "2 tier(s)" in errors[0] and "p.1" in errors[0]


def test_lod_gate_refuses_a_tier_below_the_absolute_triangle_floor(tmp_path):
    _fake_glb(tmp_path / "kit-b.glb", {"asset:thin": [1, 1, 1]},
              triangles={"asset:thin": [4000, 90, 480]})
    errors = ex.lod_contract_errors(
        [{"id": "p.2", "kit": "kit-b", "assetId": "asset:thin"}], _LOD_CONTRACT, tmp_path)
    assert len(errors) == 1 and "absolute floor" in errors[0]


def test_lod_gate_refuses_a_placement_whose_asset_is_not_in_the_glb(tmp_path):
    _fake_glb(tmp_path / "kit-c.glb", {"asset:present": [1, 1, 1]})
    errors = ex.lod_contract_errors(
        [{"id": "p.3", "kit": "kit-c", "assetId": "asset:absent"}], _LOD_CONTRACT, tmp_path)
    assert len(errors) == 1 and "not in the built kit GLB" in errors[0]


def test_lod_gate_passes_a_real_three_tier_chain(tmp_path):
    _fake_glb(tmp_path / "kit-d.glb", {"asset:good": [2, 1, 1]},
              triangles={"asset:good": [1084, 382, 304]})
    assert ex.lod_contract_errors(
        [{"id": "p.4", "kit": "kit-d", "assetId": "asset:good"}], _LOD_CONTRACT, tmp_path) == []


def test_shipped_bundle_assets_all_satisfy_the_runtime_lod_contract():
    """Every placed asset in the published bundle, measured from the shipped GLBs."""
    bundle = json.loads(ex.OUT.read_text())
    assert ex.lod_contract_errors(
        bundle["placements"], bundle["lod"], ex.PUBLIC_KITS) == []


def _png(width, height):
    """A PNG header only — the gate reads dimensions, never pixels."""
    import zlib
    ihdr = struct.pack(">II", width, height) + b"\x08\x06\x00\x00\x00"
    block = b"IHDR" + ihdr
    return (b"\x89PNG\r\n\x1a\n" + struct.pack(">I", len(ihdr)) + block
            + struct.pack(">I", zlib.crc32(block)))


def _glb_with_images(path, images):
    binary = b""
    views = []
    rows = []
    for blob in images:
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(blob)})
        rows.append({"bufferView": len(views) - 1, "mimeType": "image/png"})
        binary += blob + b"\x00" * (-len(blob) % 4)
    document = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": []}],
                "nodes": [], "meshes": [], "accessors": [],
                "bufferViews": views, "images": rows,
                "buffers": [{"byteLength": len(binary)}]}
    chunk = json.dumps(document).encode("utf-8")
    chunk += b" " * (-len(chunk) % 4)
    body = (struct.pack("<II", len(chunk), 0x4E4F534A) + chunk
            + struct.pack("<II", len(binary), 0x004E4942) + binary)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)


def test_texture_cap_gate_measures_the_published_image_not_a_manifest_claim(tmp_path):
    _glb_with_images(tmp_path / "kit-t.glb", [_png(1024, 1024), _png(8192, 512)])
    errors = ex.texture_cap_errors({"kit-t": {}}, {"atlasMaxSize": 4096}, tmp_path)
    assert len(errors) == 1 and "8192x512" in errors[0] and "4096" in errors[0]
    assert ex.texture_cap_errors({"kit-t": {}}, {"atlasMaxSize": 8192}, tmp_path) == []


def test_shipped_kit_textures_are_inside_the_runtime_cap():
    bundle = json.loads(ex.OUT.read_text())
    assert ex.texture_cap_errors(bundle["kits"], bundle["lod"], ex.PUBLIC_KITS) == []


def test_the_owner_override_ships_a_waivable_error_and_records_it_by_name():
    overridden = []
    ex._refuse_or_override("pad delivery", ["a hut sits 0.3 m proud"],
                           "settlement pad delivery is incomplete",
                           "owner wants to walk the province", overridden)
    assert overridden == ["pad delivery: a hut sits 0.3 m proud"]


def test_the_owner_override_cannot_ship_an_error_that_is_fatal_at_runtime():
    """The 2026-09-09 defect: a short LOD chain went out under the override and
    the studio drew nothing at all. The override buys a defective world, never
    a blank one."""
    for error_class in sorted(ex.NON_WAIVABLE_ERROR_CLASSES):
        overridden = []
        with pytest.raises(ValueError) as raised:
            ex._refuse_or_override(error_class, ["some/asset: measured breach"],
                                   f"{error_class} breach: some/asset: measured breach",
                                   "owner wants to see it", overridden)
        assert "NON-WAIVABLE" in str(raised.value)
        assert ex.NON_WAIVABLE_ERROR_CLASSES[error_class] in str(raised.value)
        assert "some/asset: measured breach" in str(raised.value)
        assert overridden == []


def test_every_runtime_fatal_gate_is_registered_as_non_waivable():
    """The three gates that mirror a runtime refusal/throw, by name. A new gate
    of that kind must be added here as well, or the override could waive it."""
    assert set(ex.NON_WAIVABLE_ERROR_CLASSES) == {
        "lod contract", "collider budget", "texture cap"}


def test_a_non_waivable_breach_stops_a_whole_export_even_under_the_override(
        tmp_path, monkeypatch):
    """End to end: the gate is wired into build_bundle, not merely available."""
    monkeypatch.setattr(ex, "lod_contract_errors",
                        lambda *a, **k: ["kit-x/asset:short: LOD chain has 2 tier(s)"])
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _warned_settlement(tmp_path, conforms=True)
    with pytest.raises(ValueError) as raised:
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []),
                        ship_with_errors="owner insists on seeing it")
    assert "NON-WAIVABLE" in str(raised.value)
    assert "asset:short" in str(raised.value)
