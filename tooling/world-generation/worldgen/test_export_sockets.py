"""The bundle carries a place's sockets as compiled (0103 decision 5) and
an `fx:*` effect placement mounted, with no mesh, footprint or collision
(fix2-effects-r3 rec 2)."""
from __future__ import annotations

import json

import pytest

from . import compile_settlement as cs
from . import export_settlement_bundle as ex
from .test_export_settlement_bundle import (_MetreSurvey, _fake_glb, _manifest_placement,
                                            _write)

SOCKET = {"id": "yard.barrel", "kind": "container", "positionM": [20, 4, 30], "yawDeg": 0,
          "parcelId": "parcel.a", "interiorCell": None, "host": "place.a.parcel.a.building",
          "why": "w", "containerClass": "barrel", "fillRule": "blanket.household-barrel"}


def _setup(tmp_path, monkeypatch, effect_row=True):
    monkeypatch.setattr(ex, "shared_survey", lambda: type("Survey", (), {
        "uv_to_m": staticmethod(lambda u, v: (u * 100, v * 100))})())
    bp = {"blueprint": {"id": "place.a", "boundary": [[0, 0], [1, 0], [1, 1]],
                        "parcels": [{"id": "parcel.a", "footprint": [[.1, .2], [.3, .2], [.2, .4]]}],
                        "variants": []}}
    _write(tmp_path / "bp/place.a.json", bp)
    house = {"id": "place.a.parcel.a.building", "parcelId": "parcel.a", "objectKind": "parcel",
             "assetId": "asset.house", "kit": "kit-a", "positionM": [20, 4, 30],
             "yawDeg": 17, "scale": 1, "groundFit": "plinth", "provenance": {}}
    smoke = {"id": "place.a.parcel.a.assembly.smoke", "parcelId": "parcel.a",
             "objectKind": "effect", "assetId": "fx:smoke-column", "kit": "kit-a",
             "anchorClass": "fx", "positionM": [20, 10, 30], "yawDeg": 0, "scale": 1,
             "groundFit": "direct", "parentPlacementId": house["id"],
             "mountOffsetM": [0, 6, 0], "footprintM": [], "provenance": {}}
    objects, errors = cs.compiled_blueprint_objects(bp["blueprint"], [house, smoke], [],
                                                    _MetreSurvey())
    assert errors == []
    _write(tmp_path / "sett/place.a.settlement.json",
           {"id": "place.a", "sourceBlueprintSha256": ex.blueprint_sha256(bp["blueprint"]),
            "errors": [], "warnings": [], "floodBandReport": {"warningCount": 0},
            "placements": [house, smoke], "doors": [], "budgetReport": {},
            "compiledObjects": objects, "socketsSchemaVersion": 1, "sockets": [SOCKET]})
    manifest = {"kit": "kit-a", "assets": [{
        "id": "asset.house", "sizeM": [4, 6, 8], "originOffsetM": [2, 3, 1], "triangles": 500,
        "collision": "mesh", "placement": _manifest_placement("plinth", mode="streamed-origin",
                                                              cap=.67)}]}
    if effect_row:
        manifest["effectTextures"] = {"fx:smoke-column": {"file": "kit-a-fx/smoke.png"}}
    _write(tmp_path / "kits/kit-a.kit.json", manifest)
    _fake_glb(tmp_path / "kits/kit-a.glb", {"asset.house": [2, 1, 1]})
    routes = tmp_path / "routes"
    routes.mkdir(exist_ok=True)
    source = tmp_path / "route-structures.json"
    source.write_text(json.dumps({"schemaVersion": 1, "structures": []}))
    return lambda: ex.build_bundle(tmp_path / "sett", routes, tmp_path / "bp",
                                   tmp_path / "kits", source, places=["place.a"])


def test_sockets_and_a_mounted_effect_reach_the_bundle(tmp_path, monkeypatch):
    bundle = _setup(tmp_path, monkeypatch)()
    entry = bundle["settlements"][0]
    assert entry["socketsSchemaVersion"] == 1 and entry["sockets"] == [SOCKET]
    fx = next(p for p in bundle["placements"] if p["kind"] == "effect")
    assert fx["anchorClass"] == "fx" and fx["parentPlacementId"] == "place.a.parcel.a.building"
    assert fx["footprintM"] == [] and fx["collision"]["kind"] == "none"
    assert len(bundle["groundTreatments"]) == 1          # the house only


def test_an_effect_whose_kit_publishes_no_texture_refuses(tmp_path, monkeypatch):
    build = _setup(tmp_path, monkeypatch, effect_row=False)
    with pytest.raises(ValueError, match="no effectTextures row"):
        build()
