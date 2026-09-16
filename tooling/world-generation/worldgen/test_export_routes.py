"""routes-index.json is a faithful, byte-stable projection of the route registry."""

import json
from pathlib import Path

import pytest

from . import export_routes, route_registry
from .export_routes import OUT_PATH, SCHEMA_VERSION, build_bundle, export, render


def test_bundle_keys_every_registry_route_by_id():
    bundle = build_bundle()
    ids = [r["id"] for r in route_registry.load()]
    assert bundle["schemaVersion"] == SCHEMA_VERSION
    assert sorted(bundle["routes"]) == sorted(ids)
    for rid, r in bundle["routes"].items():
        assert rid.startswith("route.")
        assert r["mode"] and r["class"] and r["from"] and r["to"]
        assert isinstance(r["sources"], list) and isinstance(r["aliases"], list)


@pytest.mark.skipif(not OUT_PATH.exists(), reason="routes-index.json not exported")
def test_committed_export_matches_registry(tmp_path: Path):
    fresh = tmp_path / "routes-index.json"
    export(fresh)
    assert fresh.read_bytes() == OUT_PATH.read_bytes(), (
        "apps/world-studio/public/province/routes-index.json is stale — run "
        "`python3 -m worldgen.export_routes` from tooling/world-generation")


def test_render_is_byte_stable():
    out = render({"schemaVersion": SCHEMA_VERSION, "routes": {}})
    assert out.endswith("\n") and render({"schemaVersion": SCHEMA_VERSION, "routes": {}}) == out


# --- the three map records (16e deliverable 8) -------------------------------

GRADE_DOC = {
    "schemaVersion": 1,
    "patches": [
        {"id": "patch.route-grade.x.000", "kind": "route-grade", "maxDeltaM": 0.95,
         "source": {"way": "route.road.x", "class": "road", "fromM": 21.0, "toM": 41.5,
                    "worstDegBefore": 8.08, "capDeg": 8.0},
         # 3 samples: 10 m at 1 m rise (5.71 deg), then 10 m at 2 m (11.31 deg)
         "params": {"flatWidthM": 5.0, "shoulderM": 2.0,
                    "profile": [[0.0, 0.0, 0.0], [10.0, 0.0, 1.0], [20.0, 0.0, 3.0]]},
         "why": "because the ground ran over the cap"},
        {"id": "patch.other.000", "kind": "something-else", "source": {}, "params": {}},
    ],
}
CROSSING_DOC = {"_": "prose", "schemaVersion": 2, "crossings": [{"id": "crossing.major.001", "band": "ferry"}]}
SERVICES_DOC = {
    "_": "prose", "operatorModel": {"canon": []}, "policy": {"ford": "x"}, "schemaVersion": 1,
    "stations": [{"id": "station.a"}], "services": [{"id": "boat.a"}], "rootways": [{"id": "rootway.a"}],
    "craft": {"_": "prose", "dugout-canoe": {"hullClass": "canoe"}},
}


def _write(tmp_path: Path, name: str, doc: dict) -> Path:
    p = tmp_path / name
    p.write_text(json.dumps(doc), encoding="utf-8")
    return p


def test_grades_project_each_patch_and_recompute_the_gradient(tmp_path: Path):
    src = _write(tmp_path, "route-grade-patches.json", GRADE_DOC)
    out = tmp_path / "route-grades.json"
    doc = export_routes.export_grades(out, src, receipts={"patch.route-grade.x.000": 0.57})
    assert out.exists() and json.loads(out.read_text()) == doc
    assert [p["id"] for p in doc["patches"]] == ["patch.route-grade.x.000"]  # non-route-grade dropped
    row = doc["patches"][0]
    assert row["wayId"] == "route.road.x" and row["lengthM"] == 20.5
    assert row["worstDegBefore"] == 8.08 and row["capDeg"] == 8.0
    assert row["maxDeltaM"] == 0.95 and row["maxAbsDeltaM"] == 0.57 and row["shoulderM"] == 2.0
    assert row["lineM"] == [[0.0, 0.0], [10.0, 0.0], [20.0, 0.0]]
    assert row["gradientAfterDeg"] == pytest.approx(11.31, abs=0.01)   # steepest of the two


def test_grades_publish_null_delta_when_the_vault_receipt_is_absent(tmp_path: Path):
    src = _write(tmp_path, "route-grade-patches.json", GRADE_DOC)
    doc = export_routes.export_grades(tmp_path / "g.json", src, receipts={})
    assert doc["patches"][0]["maxAbsDeltaM"] is None


def test_crossings_and_services_copy_the_record_without_the_prose(tmp_path: Path):
    c = export_routes.export_crossings(tmp_path / "crossings.json",
                                       _write(tmp_path, "water-crossings.json", CROSSING_DOC))
    assert "_" not in c and c["schemaVersion"] == 2 and c["crossings"][0]["id"] == "crossing.major.001"

    s = export_routes.export_services(tmp_path / "travel-services.json",
                                      _write(tmp_path, "travel-services.json", SERVICES_DOC))
    assert not {"_", "policy", "operatorModel"} & set(s)
    assert [x["id"] for x in s["stations"]] == ["station.a"]
    assert [x["id"] for x in s["services"]] == ["boat.a"]
    assert [x["id"] for x in s["rootways"]] == ["rootway.a"]
    assert "_" not in s["craft"] and "dugout-canoe" in s["craft"]


def test_missing_inputs_export_empty_records(tmp_path: Path):
    missing = tmp_path / "nope.json"
    assert export_routes.export_grades(tmp_path / "g.json", missing, receipts={})["patches"] == []
    assert export_routes.export_crossings(tmp_path / "c.json", missing)["crossings"] == []
    assert export_routes.export_services(tmp_path / "s.json", missing)["stations"] == []


@pytest.mark.parametrize("out,builder,key", [
    (export_routes.GRADES_OUT, export_routes.build_grades, "patches"),
    (export_routes.CROSSINGS_OUT, export_routes.build_crossings, "crossings"),
    (export_routes.SERVICES_OUT, export_routes.build_services, "stations"),
])
def test_committed_map_records_are_fresh(out: Path, builder, key: str):
    if not out.exists():
        pytest.skip(f"{out.name} not exported")
    assert out.read_text(encoding="utf-8") == render(builder()), (
        f"{out.name} is stale — run `python3 -m worldgen.export_routes`")
    assert json.loads(out.read_text())[key] is not None
