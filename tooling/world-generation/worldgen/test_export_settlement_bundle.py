import json

import pytest

from . import export_settlement_bundle as ex


def _write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


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
    _write(tmp_path / "sett/place.a.settlement.json",
           {"id": "place.a", "sourceBlueprintSha256": ex.blueprint_sha256(bp["blueprint"]),
            "errors": [], "placements": [placement], "doors": [], "budgetReport": {}})
    route = {"id": "route-piece", "assetId": "asset.bridge", "posM": [9, 2, 8],
             "yawDeg": 90, "provenance": {}}
    _write(tmp_path / "routes/a.json", {"wayId": "route.a", "placements": [route]})
    for kit, asset in (("kit-a", "asset.house"), ("route-structures-v1", "asset.bridge")):
        _write(tmp_path / f"kits/{kit}.kit.json", {"kit": kit, "assets": [{
            "id": asset, "sizeM": [4, 6, 8], "originOffsetM": [2, 3, 1],
            "triangles": 500, "collision": "mesh"}]})
    bundle = ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp", tmp_path / "kits")
    assert bundle["stats"] == {"settlements": 1, "settlementPlacements": 1,
                               "routeStructurePlacements": 1}
    house = next(p for p in bundle["placements"] if p["kind"] == "settlement")
    assert house["footprintM"][0] == [10.0, 20.0]
    assert house["anchor"]["mode"] == "streamed-perimeter"
    assert house["collision"]["frame"] == ex.COLLISION_FRAME
    assert len(bundle["groundTreatments"]) == len(bundle["navmeshCuts"]) == 1


def test_refuses_compiler_errors(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _write(tmp_path / "sett/place.a.settlement.json",
           {"id": "place.a", "errors": ["bad"], "placements": []})
    with pytest.raises(ValueError, match="refusing to publish"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp", tmp_path / "kits")


def test_refuses_stale_success_after_blueprint_mutation(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    original = {"id": "place.a", "boundary": [[0, 0], [1, 0], [1, 1]]}
    compiled = tmp_path / "sett/place.a.settlement.json"
    _write(compiled, {"id": "place.a", "sourceBlueprintSha256": ex.blueprint_sha256(original),
                      "errors": [], "placements": []})
    # A schema-failing recompile leaves the prior successful output in place;
    # a semantic source mutation must invalidate it regardless of mtimes.
    changed = {**original, "boundary": [[0, 0], [2, 0], [1, 1]]}
    _write(tmp_path / "bp/place.a.json", {"blueprint": changed})
    with pytest.raises(ValueError, match="sourceBlueprintSha256"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp", tmp_path / "kits")


def test_refuses_an_authored_exemplar_with_no_compiled_output(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "ProvinceSurvey", lambda: object())
    _write(tmp_path / "bp/place.a.json", {"blueprint": {"id": "place.a"}})
    with pytest.raises(ValueError, match="missing compiled blueprints: place.a"):
        ex.build_bundle(tmp_path / "sett", tmp_path / "routes", tmp_path / "bp", tmp_path / "kits")


def test_atomic_writer_replaces_complete_json(tmp_path):
    out = tmp_path / "bundle.json"
    ex._atomic_json(out, {"schemaVersion": 1, "value": "complete"})
    assert json.loads(out.read_text())["value"] == "complete"
    assert list(tmp_path.glob(".bundle.json.*")) == []
