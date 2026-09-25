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
    # A kit is only referenceable with its three measured sidecars beside it
    # (16h item 6), so every fixture kit gets them where the real publish step
    # (pipeline.kit_compress) would have put them.
    if path.name.endswith(".kit.json"):
        for asset in data.get("assets", []):
            asset.setdefault("designedSinkM", _sink())
        path.write_text(json.dumps(data))
        for part in ex.KIT_SIDECARS:
            side = path.with_name(path.name.replace(".kit.json", f".{part}.json"))
            if not side.exists():
                side.write_text(json.dumps({"schemaVersion": 1, "assets": {}}))


def _route_source(root, structures):
    path = root / "route-structures-source.json"
    _write(path, {"schemaVersion": 1, "structures": structures})
    return path


def _sink(p50=.31, evidence="plugin"):
    """A measured designed sink, the only thing that decides a piece's height
    (16h item 1). `buryM`/`slopeBuryPerM` no longer exist on a manifest."""
    return {"p25": p50, "p50": p50, "p75": p50, "n": 9, "evidence": evidence}


def _manifest_placement(policy, *, mode="streamed-origin", contact=1, cap=.72):
    return {
        "schemaVersion": 1,
        "anchorMode": mode,
        "groundContactOffsetM": contact,
        "buryCapM": cap,
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
    monkeypatch.setattr(ex, "shared_survey", lambda: type("Survey", (), {
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
            "plinth", mode="streamed-origin", cap=.67)),
        ("route-structures-v1", "asset.bridge", _manifest_placement(
            "route-structure", mode="streamed-perimeter", cap=.21)),
        # Crossings come from the second route kit (decision 0051); the bundle
        # must load both manifests and resolve each placement to the one that
        # holds it.
        ("route-spans-v1", "asset.viaduct", _manifest_placement(
            "route-structure", mode="streamed-perimeter", cap=.21)),
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
    assert house["anchor"]["buryCapM"] == .67
    assert house["anchor"]["designedSinkM"]["p50"] == .31
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
    assert route_placement["anchor"]["designedSinkM"]["p50"] == .31
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
    (lambda asset: asset.pop("designedSinkM"), "no designedSinkM"),
    (lambda asset: asset["designedSinkM"].update({"p50": "deep"}),
     "designedSinkM p50 is not finite"),
    (lambda asset: asset["designedSinkM"].pop("evidence"),
     "is not in placement_metadata.EVIDENCE_VOCABULARY"),
    (lambda asset: asset["designedSinkM"].update({"evidence": "guessed"}),
     "is not in placement_metadata.EVIDENCE_VOCABULARY"),
    (lambda asset: asset["placement"]["evidence"].update({"policyId": "floating"}),
     "is not in placement-policies.json"),
    (lambda asset: asset["placement"]["evidence"].update(
        {"fitPolicy": "authored placement-policies.json policy pad: x"}),
     "fitPolicy does not name policy"),
    (lambda asset: asset["placement"]["evidence"].update(
        {"groundContactOffsetM": "eyeballed"}), "placement evidence is malformed"),
    (lambda asset: asset["placement"].update({"anchorMode": "guessed"}),
     "invalid manifest anchorMode"),
    (lambda asset: asset["placement"].update({"evidence": {}}),
     "placement evidence is malformed"),
])
def test_manifest_placement_contract_fails_closed(mutation, expected):
    asset = {
        "id": "asset.house", "originOffsetM": [2, 3, 1],
        "designedSinkM": _sink(),
        "placement": _manifest_placement("plinth"),
    }
    mutation(asset)
    with pytest.raises(ValueError, match=expected):
        ex._validated_asset_placement("kit-a", asset)


def test_every_placement_policy_the_writer_can_emit_exports():
    """16h K11 B: the exporter's policy set is the inventory, not a copy; a
    policy with no ground fit here fails this test, not a live export. The
    Telvanni connector (`deck` by policy) exports as the manifest writes it."""
    from pipeline.placement_metadata import (apply_placement_metadata,
                                             load_inventory)

    policies = set(load_inventory()["policies"])
    assert policies <= set(ex.POLICY_GROUND_FIT), policies - set(ex.POLICY_GROUND_FIT)
    assert ex.known_policies() == policies
    manifest = {"assets": [{"id": "bmv:telvanni/tel_int_connector_01",
                            "originOffsetM": [1.95, 0.721, 0.296]}]}
    apply_placement_metadata(manifest, "bmv-treehouse-int")
    asset = manifest["assets"][0]
    assert asset["placement"]["evidence"]["policyId"] == "deck"
    anchor, policy_id = ex._validated_asset_placement("bmv-treehouse-int", asset)
    assert policy_id == "deck" and anchor["groundContactOffsetM"] == 0.296


def test_ground_fit_must_match_policy_or_an_explicit_asset_compatibility_rule():
    asset = {
        "id": "asset.house", "originOffsetM": [2, 3, 1],
        "designedSinkM": _sink(),
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
        _fake_glb(tmp_path / f"{kit}.glb", {"asset.shared": [1, 1, 1]})
        _write(tmp_path / f"{kit}.kit.json", {"kit": kit, "assets": [{
            "id": "asset.shared", "originOffsetM": [1, 1, .5],
            "designedSinkM": _sink(bury),
            "placement": _manifest_placement("direct", contact=.5, cap=.3),
        }]})

    _kits, assets = ex._kit_assets({"kit-a", "kit-b"}, tmp_path)
    assert assets[("kit-a", "asset.shared")]["_runtimeAnchor"]["designedSinkM"]["p50"] == .11
    assert assets[("kit-b", "asset.shared")]["_runtimeAnchor"]["designedSinkM"]["p50"] == .22


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
            # a parcel with no authored groundFit takes its record's (0085):
            # it cannot contradict the policy, so only overrides are checked
            record_decides = path[-1:] == ("parcels",) and "groundFit" not in value
            if (isinstance(ref, str) and (not path or path[-1] != "interior")
                    and not record_decides):
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
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
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
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
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
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
    _warned_settlement(tmp_path)
    with pytest.raises(ValueError, match="UNEXPLAINED WARNING"):
        _build(tmp_path)


def test_a_replay_compile_carries_its_warnings_as_waivers_not_as_blockers(tmp_path,
                                                                        monkeypatch):
    """A fixture replay moved every finding, WARN grade too, into
    `fixtureWaived`; its flood rows are recorded there, so they neither fail
    the warning ledger nor block as unexplained (16h round 3)."""
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
    _warned_settlement(tmp_path)
    doc = json.loads((tmp_path / "sett/place.a.settlement.json").read_text())
    doc["fixtureReplay"] = True
    doc["fixtureWaived"] = [{"ruleId": "97 B4/G8", "grade": "warn",
                             "message": doc["warnings"][0]}]
    doc["warnings"] = []
    _write(tmp_path / "sett/place.a.settlement.json", doc)
    published = ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                                tmp_path / "kits", _route_source(tmp_path, []),
                                fixtures_ok=True)
    assert published["settlements"][0]["fixtureWaived"] == doc["fixtureWaived"]
    # a replay doc that still carries a live warning is not a replay receipt
    doc["warnings"] = ["wet civic floor"]
    _write(tmp_path / "sett/place.a.settlement.json", doc)
    with pytest.raises(ValueError, match="warning"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []), fixtures_ok=True)


def test_a_fixture_compile_carries_its_warnings_as_waivers_not_as_blockers(tmp_path,
                                                                         monkeypatch):
    """The proving ground (fixture: true, never replayed) compiles with every
    WARN-grade finding in `fixtureWaived`; the export accepts it exactly as it
    accepts a replay receipt (16h part 1 round 4), and a live warning still
    refuses."""
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
    _warned_settlement(tmp_path)
    doc = json.loads((tmp_path / "sett/place.a.settlement.json").read_text())
    doc["fixture"] = True
    doc["fixtureWaived"] = [{"ruleId": "97 B4/G8", "grade": "warn",
                             "message": doc["warnings"][0]}]
    doc["warnings"] = []
    _write(tmp_path / "sett/place.a.settlement.json", doc)
    published = ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                                tmp_path / "kits", _route_source(tmp_path, []),
                                fixtures_ok=True)
    site = published["settlements"][0]
    assert site["fixtureWaived"] == doc["fixtureWaived"]
    assert "fixtureReplay" not in site
    doc["warnings"] = ["wet civic floor"]
    _write(tmp_path / "sett/place.a.settlement.json", doc)
    with pytest.raises(ValueError, match="warning"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []), fixtures_ok=True)


def test_a_replay_only_passes_a_re_derived_error_its_receipt_already_names():
    """The export re-derives the compiled-object and obligation checks; on a
    fixture replay an error passes only if the compile's receipt waived that
    exact finding, anything new still refuses."""
    doc = {"fixtureReplay": True,
           "fixtureWaived": [{"ruleId": "compile", "grade": "hard", "message": "a: gone"}]}
    assert ex._unwaived(doc, ["a: gone", "b: new"]) == ["b: new"]
    assert ex._unwaived({**doc, "fixtureReplay": False}, ["a: gone"]) == ["a: gone"]


def test_a_registered_warning_is_reported_by_name_and_does_not_block(tmp_path, monkeypatch,
                                                                     capsys):
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
    _warned_settlement(tmp_path)
    _register(tmp_path, monkeypatch, [{
        "placeId": "place.a", "subjectId": "parcel.a", "rule": "civic-sacred-dry",
        "owner": "water", "queuedIn": "docs/phases/P-polish/backlog.md",
        "why": "two water layers disagree",
    }])
    bundle = _build(tmp_path)
    assert bundle["knownRedWarnings"] == [{
        "placeId": "place.a", "subjectId": "parcel.a", "rule": "civic-sacred-dry",
        "owner": "water", "queuedIn": "docs/phases/P-polish/backlog.md",
        "why": "two water layers disagree",
    }]
    assert "KNOWN-RED settlement warning (water-owned" in capsys.readouterr().out


def test_a_register_row_that_has_started_passing_blocks(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
    _warned_settlement(tmp_path, conforms=True)
    _register(tmp_path, monkeypatch, [{
        "placeId": "place.a", "subjectId": "parcel.a", "rule": "civic-sacred-dry",
        "owner": "water", "queuedIn": "docs/phases/P-polish/backlog.md",
        "why": "two water layers disagree",
    }])
    with pytest.raises(ValueError, match="NO LONGER RED"):
        _build(tmp_path)


def test_a_register_row_whose_place_vanished_blocks(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
    _warned_settlement(tmp_path, conforms=True)
    _register(tmp_path, monkeypatch, [{
        "placeId": "place.gone", "subjectId": "parcel.x", "rule": "civic-sacred-dry",
        "owner": "water", "queuedIn": "docs/phases/P-polish/backlog.md",
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
    # Empty since the five 2026-09-09 blueprints were retired (owner
    # 2026-09-23): the only compiled place is the yard, a fixture whose
    # findings go to its fixtureWaived receipt (16h K14). The export refuses a
    # stale row, so an empty register is the current truth.
    rows = ex.load_warning_known_red(REAL_REGISTER)
    assert all(row["owner"] and row["queuedIn"] and row["why"] for row in rows.values())


def test_refuses_stale_success_after_blueprint_mutation(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
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
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
    _write(tmp_path / "bp/place.a.json", {"blueprint": {"id": "place.a"}})
    with pytest.raises(ValueError, match="missing compiled blueprints: place.a"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []))


def test_refuses_missing_route_output_and_missing_structure_placements(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
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
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
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
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
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


def test_copy_assets_ships_the_published_pair_never_a_raw_kit_build(tmp_path):
    """16h M19 ruling 5, K14: the GLB that ships is the published, compressed
    one; the raw `output/kits` build (no meshopt, no KTX2) never reaches
    public/kits. A raw GLB over the published one is refused, a stale
    published manifest is refused, and a kit with no published GLB is
    compressed through kit_compress.publish first."""
    import struct as _struct

    def glb(document: dict, pad: int) -> bytes:
        body = json.dumps(document).encode()
        body += b" " * (-len(body) % 4)
        chunk = _struct.pack("<II", len(body), 0x4E4F534A) + body + b"\0" * pad
        return b"glTF" + _struct.pack("<II", 2, 12 + len(chunk)) + chunk

    source, public = tmp_path / "source", tmp_path / "public"
    source.mkdir()
    public.mkdir()
    raw = glb({"meshes": [{}], "images": [{"mimeType": "image/png"}]}, 4000)
    packed = glb({"meshes": [{}], "images": [{"mimeType": "image/ktx2"}],
                  "extensionsUsed": ["KHR_texture_basisu", "EXT_meshopt_compression"]}, 0)
    manifest = json.dumps({"compression": {"bytesAfter": len(packed)}})
    (source / "k.glb").write_bytes(raw)
    (source / "k.kit.json").write_text(manifest)
    (source / "k.footprints.json").write_text("{}")

    # A raw build sitting in public/kits is refused and left untouched.
    (public / "k.glb").write_bytes(raw)
    (public / "k.kit.json").write_text(manifest)
    with pytest.raises(ValueError, match="kit_compress --check.*not KTX2.*meshopt"):
        ex.copy_assets({"kits": {"k": {}}}, source, public)
    assert (public / "k.glb").read_bytes() == raw

    # The published pair ships; the raw build beside it is ignored.
    (public / "k.glb").write_bytes(packed)
    ex.copy_assets({"kits": {"k": {}}}, source, public)
    assert (public / "k.glb").read_bytes() == packed
    assert (public / "k.footprints.json").read_text() == "{}"

    # A published manifest that is not the build's is a stale publish.
    (source / "k.kit.json").write_text(json.dumps(
        {"compression": {"bytesAfter": len(packed)}, "assets": []}))
    with pytest.raises(ValueError, match="stale publish"):
        ex.copy_assets({"kits": {"k": {}}}, source, public)
    (source / "k.kit.json").write_text(manifest)

    # No published GLB: the raw build is compressed through the publisher.
    (public / "k.glb").unlink()
    published: list[str] = []

    def publish_kit(name: str) -> None:
        published.append(name)
        (public / f"{name}.glb").write_bytes(packed)
        (public / f"{name}.kit.json").write_text(manifest)

    ex.copy_assets({"kits": {"k": {}}}, source, public, publish_kit)
    assert published == ["k"]
    assert (public / "k.glb").read_bytes() == packed


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
    monkeypatch.setattr(ex, "shared_survey", lambda: type("Survey", (), {
        "uv_to_m": staticmethod(lambda u, v: (u * 100, v * 100))})())
    record, _settlement, source, evidence = _obligation_bundle_fixture(tmp_path)
    bundle = ex.build_bundle(
        tmp_path / "sett", tmp_path / "routes", tmp_path / "bp", tmp_path / "kits",
        source, catalogue_records_by_id={record["id"]: record}, terrain_evidence=evidence)
    assert [row["placeId"] for row in bundle["phase11ObligationReceipts"]] == [record["id"]]
    assert {row["id"] for row in bundle["compiledObjects"]} == {
        row["id"] for row in json.loads(_settlement.read_text())["compiledObjects"]}


def test_bundle_rejects_omitted_non_rendered_compiled_object(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "shared_survey", _MetreSurvey)
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
    monkeypatch.setattr(ex, "shared_survey", _MetreSurvey)
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
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
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
    # Decision 0052's rule, re-applied to the measured worst resident case:
    # the budget is 1.55x it, so the biggest settlement can grow by half again.
    assert ex.COLLIDER_PART_BUDGET == round(max(totals.values()) * 1.55)
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


def test_a_pending_pad_is_reported_not_waived_and_does_not_block(tmp_path, monkeypatch):
    """16h item 6: the waiver is gone. A parcel that still wants a graded pad is
    a queued local terrain patch, reported in the receipt; the export proceeds."""
    monkeypatch.setattr(ex, "validate_applied_pad_grades",
                        lambda *a, **k: ["place.a/parcel.1: pad not graded"])
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
    # The parcel exists only to reach the pad branch; its object set is not
    # what this test is about.
    monkeypatch.setattr(ex, "compiled_blueprint_objects", lambda *a, **k: ([], []))
    _warned_settlement(tmp_path, conforms=True)
    bp = {"id": "place.a", "parcels": [{"id": "parcel.1", "groundFit": "pad"}]}
    _write(tmp_path / "bp/place.a.json", {"blueprint": bp})
    doc = json.loads((tmp_path / "sett/place.a.settlement.json").read_text())
    doc["sourceBlueprintSha256"] = ex.blueprint_sha256(bp)
    _write(tmp_path / "sett/place.a.settlement.json", doc)
    bundle = ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                             tmp_path / "kits", _route_source(tmp_path, []),
                             pad_grade_receipt={}, final_height=None)
    assert bundle["pendingPadGrades"] == ["place.a/parcel.1: pad not graded"]
    assert "shippedWithKnownErrors" not in bundle
    assert not hasattr(ex.build_bundle, "ship_with_errors")


def test_the_bundle_schema_version_moved_with_the_mount_fields(tmp_path):
    """The layer refuses a bundle it does not understand by version, so the
    version must move when the placement shape does (16h item 6: anchorClass,
    parentPlacementId, mountOffsetM, waterLevelM, waterEntityId)."""
    assert ex.SCHEMA_VERSION == 3
    _warned_settlement(tmp_path, conforms=True)
    bundle = ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                             tmp_path / "kits", _route_source(tmp_path, []))
    assert bundle["schemaVersion"] == 3


def test_the_shipped_build_refuses_a_fixture_record(tmp_path):
    """The proving ground is a fixture: it proves mechanisms, it is never
    played, and it must not reach the published bundle (16h items 6 and 9)."""
    _warned_settlement(tmp_path, conforms=True)
    doc = json.loads((tmp_path / "sett/place.a.settlement.json").read_text())
    doc["fixture"] = True
    _write(tmp_path / "sett/place.a.settlement.json", doc)
    with pytest.raises(ValueError, match="fixture"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []))
    published = ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                                tmp_path / "kits", _route_source(tmp_path, []),
                                fixtures_ok=True)
    assert published["stats"]["settlements"] == 1


def test_the_shipped_build_refuses_a_fixture_replay_compile_like_a_fixture(tmp_path):
    """A replay compile waived design rules (16h round 3): it is published to
    the studio with --fixtures-ok, carries the flag on its site, and the
    shipped build refuses it exactly as it refuses `fixture: true`."""
    _warned_settlement(tmp_path, conforms=True)
    doc = json.loads((tmp_path / "sett/place.a.settlement.json").read_text())
    doc["fixtureReplay"] = True
    doc["fixtureWaived"] = [{"ruleId": "97 C10", "grade": "hard",
                             "message": "fence crosses a way"}]
    _write(tmp_path / "sett/place.a.settlement.json", doc)
    with pytest.raises(ValueError, match="is a fixture record .*fixtureReplay: true"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []))
    published = ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                                tmp_path / "kits", _route_source(tmp_path, []),
                                fixtures_ok=True)
    site = published["settlements"][0]
    assert site["fixtureReplay"] is True
    assert site["fixtureWaived"] == doc["fixtureWaived"]


def test_a_truncated_kit_glb_fails_the_export(tmp_path):
    """The runtime's loader trusts the GLB header; a half-written kit fails in
    the browser with nothing to read. Parse it at export instead."""
    _fake_glb(tmp_path / "kits/kit-a.glb", {"asset.house": [1, 1, 1]})
    _write(tmp_path / "kits/kit-a.kit.json", {"kit": "kit-a", "assets": []})
    assert ex.glb_structure_errors(tmp_path / "kits/kit-a.glb") == []
    whole = (tmp_path / "kits/kit-a.glb").read_bytes()
    (tmp_path / "kits/kit-a.glb").write_bytes(whole[:len(whole) // 2])
    errors = ex.glb_structure_errors(tmp_path / "kits/kit-a.glb")
    assert errors and "B, file is" in errors[0]
    with pytest.raises(ValueError, match="readable glTF 2 binary"):
        ex._kit_assets({"kit-a"}, tmp_path / "kits")
    (tmp_path / "kits/kit-a.glb").write_bytes(b"NOPE" + whole[4:])
    assert "magic" in ex.glb_structure_errors(tmp_path / "kits/kit-a.glb")[0]


def test_a_kit_without_its_three_sidecars_cannot_be_referenced(tmp_path):
    """Kit data ships with the kit: the compile and the studio read connectors,
    footprints and interiors from the published build (16h item 6)."""
    _fake_glb(tmp_path / "kits/kit-a.glb", {"asset.house": [1, 1, 1]})
    _write(tmp_path / "kits/kit-a.kit.json", {"kit": "kit-a", "assets": []})
    assert ex.kit_sidecar_errors("kit-a", tmp_path / "kits") == []
    (tmp_path / "kits/kit-a.footprints.json").unlink()
    assert "footprints" in ex.kit_sidecar_errors("kit-a", tmp_path / "kits")[0]
    with pytest.raises(ValueError, match="not fully measured"):
        ex._kit_assets({"kit-a"}, tmp_path / "kits")
    # A kit the architecture measurements do not apply to records the exemption
    # in its own manifest (kit_compress.SIDECAR_EXEMPT), never by silence.
    _write(tmp_path / "kits/kit-a.kit.json", {
        "kit": "kit-a", "assets": [],
        "compression": {"sidecarsExempt": "vegetation atlas"}})
    (tmp_path / "kits/kit-a.footprints.json").unlink()
    assert ex.kit_sidecar_errors("kit-a", tmp_path / "kits") == []


def test_every_published_kit_ships_its_sidecars(tmp_path):
    """The shipped build, not a fixture: every kit the studio downloads."""
    missing = [problem for glb in sorted(ex.PUBLIC_KITS.glob("*.glb"))
               for problem in ex.kit_sidecar_errors(glb.stem, ex.PUBLIC_KITS)]
    assert not missing, "\n".join(missing)


def test_the_published_bundle_is_world_readable(tmp_path):
    """A shipped file was mode 0600 on 2026-09-22 because mkstemp creates 0600
    and the atomic write kept it. The export sets the mode it publishes with."""
    ex._atomic_json(tmp_path / "out.json", {"a": 1})
    assert oct((tmp_path / "out.json").stat().st_mode & 0o777) == "0o644"
    assert oct(ex.OUT.stat().st_mode & 0o777) == "0o644"


def test_the_bundle_carries_the_compiles_mount_and_water_fields():
    """SHARED CONTRACT (16h): anchorClass, parentPlacementId, mountOffsetM,
    waterLevelM, waterEntityId pass through untouched, and a field the compile
    did not emit is absent rather than defaulted."""
    raw = {"anchorClass": "wall", "parentPlacementId": "p.1",
           "mountOffsetM": [0.1, 0.2, 2.4], "yawDeg": 90}
    assert ex._mount_contract(raw) == {
        "anchorClass": "wall", "parentPlacementId": "p.1",
        "mountOffsetM": [0.1, 0.2, 2.4]}
    assert ex._mount_contract({}) == {}
    assert ex._mount_contract({"waterLevelM": -1.5, "waterEntityId": "body.1284-3448"}) == {
        "waterLevelM": -1.5, "waterEntityId": "body.1284-3448"}


def test_a_runtime_fatal_error_names_why_the_runtime_refuses():
    """The 2026-09-09 defect: a short LOD chain shipped and the studio drew
    nothing at all. The refusal says which runtime check does the refusing."""
    for error_class in sorted(ex.RUNTIME_FATAL_ERROR_CLASSES):
        with pytest.raises(ValueError) as raised:
            ex._refuse(error_class, ["some/asset: measured breach"],
                       f"{error_class} breach: some/asset: measured breach")
        assert ex.RUNTIME_FATAL_ERROR_CLASSES[error_class] in str(raised.value)
        assert "some/asset: measured breach" in str(raised.value)


def test_every_runtime_fatal_gate_is_registered():
    """The three gates that mirror a runtime refusal/throw, by name."""
    assert set(ex.RUNTIME_FATAL_ERROR_CLASSES) == {
        "lod contract", "collider budget", "texture cap"}


def test_a_runtime_fatal_breach_stops_a_whole_export(tmp_path, monkeypatch):
    """End to end: the gate is wired into build_bundle, not merely available."""
    monkeypatch.setattr(ex, "lod_contract_errors",
                        lambda *a, **k: ["kit-x/asset:short: LOD chain has 2 tier(s)"])
    monkeypatch.setattr(ex, "shared_survey", lambda: object())
    _warned_settlement(tmp_path, conforms=True)
    with pytest.raises(ValueError) as raised:
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp",
                        tmp_path / "kits", _route_source(tmp_path, []))
    assert "asset:short" in str(raised.value)


def test_the_kit_contract_is_scoped_to_the_placed_assets(tmp_path):
    """16h K14: a publish checks the assets its bundle places; an unplaced
    asset's broken contract is the miner lane's (``--all-kit-assets``)."""
    _fake_glb(tmp_path / "kit-a.glb", {"asset.placed": [1, 1, 1], "asset.broken": [1, 1, 1]})
    _write(tmp_path / "kit-a.kit.json", {"kit": "kit-a", "assets": [
        {"id": "asset.placed", "originOffsetM": [1, 1, .5], "designedSinkM": _sink(.1),
         "placement": _manifest_placement("direct", contact=.5, cap=.3)},
        {"id": "asset.broken", "originOffsetM": [1, 1, .5], "designedSinkM": _sink(.1)},
    ]})
    _kits, assets = ex._kit_assets({"kit-a"}, tmp_path, {("kit-a", "asset.placed")})
    assert set(assets) == {("kit-a", "asset.placed")}
    with pytest.raises(ValueError, match="asset.broken: manifest has no placement metadata"):
        ex._kit_assets({"kit-a"}, tmp_path)


# 16h check-in 3 §2: a run piece carries the run it belongs to and the
# cumulative mined rise the compile laid it at.
def test_a_run_piece_carries_its_run_id_index_and_mined_rise(monkeypatch):
    laid = [{"asset": "a", "riseM": 0.0}, {"asset": "b", "riseM": 0.12},
            {"asset": "c", "riseM": 0.3}]
    calls = []
    monkeypatch.setattr(ex.fp_mod, "lay_pieces", lambda parcel: (calls.append(1), (laid, []))[1])
    cache: dict = {}
    raw = {"id": "place.a.parcel.wall.piece.3", "parcelId": "parcel.wall", "assetId": "c",
           "run": {"index": 2, "length": 3, "pair": "family:x n8"}}
    assert ex._run_contract(raw, {"id": "parcel.wall"}, cache) == {
        "run": {"id": "place.a.parcel.wall", "index": 2, "riseM": 0.3}}
    ex._run_contract({**raw, "run": {"index": 0, "length": 3}}, {}, cache)
    assert len(calls) == 1  # laid once per parcel
    assert ex._run_contract({"id": "x", "parcelId": "p"}, {}, cache) == {}
    with pytest.raises(ValueError, match="does not match"):
        ex._run_contract({**raw, "run": {"index": 3, "length": 3}}, {}, cache)
    with pytest.raises(ValueError, match="does not match"):
        ex._run_contract({**raw, "run": {"index": 1, "length": 4}}, {}, cache)


# 16h check-in 3 §5: a stilt/deck fit whose deck clears the ground by more
# than 0.8 m is a deck treatment; everything else is a floor.
def test_treatment_kind_follows_the_deck_clearance():
    inventory = {"policies": {"stilt": {"deckClearanceM": 0.35}, "plinth": {}},
                 "assetPlacement": {"composite:stilt/stilthouse-with-door": {"deckClearanceM": 3.462}}}
    house = {"id": "composite:stilt/stilthouse-with-door", "_placementPolicyId": "stilt"}
    hut = {"id": "bamboohut01", "_placementPolicyId": "stilt"}
    barn = {"id": "barn", "_placementPolicyId": "plinth"}
    assert ex._treatment_kind(house, {}, "stilt", inventory) == "deck"
    assert ex._treatment_kind(hut, {}, "stilt", inventory) == "floor"  # 0.35 m deck
    assert ex._treatment_kind(house, {}, "plinth", inventory) == "floor"  # not a stilt fit
    assert ex._treatment_kind(barn, {"anchorClass": "deck"}, "plinth", inventory) == "floor"
    assert ex._treatment_kind({**barn, "id": "composite:stilt/stilthouse-with-door"},
                              {"anchorClass": "deck"}, "plinth", inventory) == "deck"


def test_every_door_threshold_gets_a_one_and_a_half_metre_apron():
    floor = {"id": "treatment.a", "kind": "floor", "footprintM": [[0, 0], [1, 0], [0, 1]]}
    ex._attach_door_apron({"id": "door.a", "parcelId": "parcel.a"}, 4.2, 5.25,
                          {"parcel.a": floor})
    assert floor["apronsM"] == [[4.2, 5.25, 1.5]]
    with pytest.raises(ValueError, match="no ground treatment"):
        ex._attach_door_apron({"id": "door.b", "parcelId": "parcel.b"}, 0, 0,
                              {"parcel.a": floor})
