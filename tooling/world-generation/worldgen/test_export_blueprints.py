"""blueprints.json is a metre-space, byte-stable projection of the blueprints."""

import json
from pathlib import Path

import pytest

from .blueprint import BLUEPRINT_DIR
from .export_blueprints import (
    LAYERS, OUT_PATH, SCHEMA_VERSION, build_bundle, export, project, render,
)
from .render_blueprint import PROVINCE_EXTENT_M

FIXTURE = BLUEPRINT_DIR / "place.hist-heartland.nine-trunks.json"
HAVE_FIXTURE = FIXTURE.exists()


def _fixture_dir(tmp_path: Path) -> Path:
    src = tmp_path / "blueprints"
    src.mkdir()
    (src / FIXTURE.name).write_text(FIXTURE.read_text(encoding="utf-8"), encoding="utf-8")
    return src


@pytest.mark.skipif(not HAVE_FIXTURE, reason="no blueprint committed")
def test_uv_becomes_metres(tmp_path):
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    entry = project(doc, PROVINCE_EXTENT_M)
    bp = doc["blueprint"]
    # boundary, district and parcel geometry are u/v × extent, to the millimetre
    assert entry["boundary"][0] == [round(bp["boundary"][0][0] * PROVINCE_EXTENT_M, 3),
                                    round(bp["boundary"][0][1] * PROVINCE_EXTENT_M, 3)]
    for p in entry["parcels"]:
        for x, z in p["polygon"] or []:
            assert 0.0 <= x <= PROVINCE_EXTENT_M and 0.0 <= z <= PROVINCE_EXTENT_M
    # a parcel polygon spans a building, not a province: tens of metres
    poly = next(p["polygon"] for p in entry["parcels"] if p["polygon"])
    span = max(x for x, _ in poly) - min(x for x, _ in poly)
    assert 0.5 < span < 200.0, span
    # siting candidates are ALREADY metres in the blueprint — never rescaled
    chosen = next(c for c in entry["siting"]["candidates"] if c["chosen"])
    src = next(c for c in bp["siting"]["candidates"] if c.get("chosen"))
    assert chosen["positionM"] == [round(src["positionM"][0], 3), round(src["positionM"][1], 3)]
    assert chosen["why"]


@pytest.mark.skipif(not HAVE_FIXTURE, reason="no blueprint committed")
def test_bundle_shape_and_counts(tmp_path):
    bundle = build_bundle(_fixture_dir(tmp_path), terrain=False)
    assert bundle["schemaVersion"] == SCHEMA_VERSION
    assert bundle["layers"] == LAYERS
    (entry,) = bundle["blueprints"]
    assert entry["id"] == json.loads(FIXTURE.read_text(encoding="utf-8"))["blueprint"]["id"]
    assert entry["terrain"] is None          # --no-terrain writes no backdrop
    s = entry["summary"]
    assert s["parcels"] == len(entry["parcels"]) and s["parcels"] > 0
    assert s["doors"] == len(entry["doors"])
    assert s["sitingCandidates"] >= 2        # the Part 6 deliberation rule
    for key in ("districts", "parcels", "ways", "doors", "questSockets"):
        ids = [o["id"] for o in entry[key]]
        assert ids == sorted(ids), key
    # every parcel names a district that exists (the viewer tints by kit set)
    district_ids = {d["id"] for d in entry["districts"]}
    for p in entry["parcels"]:
        assert p["districtId"] in district_ids, p["id"]


@pytest.mark.skipif(not HAVE_FIXTURE, reason="no blueprint committed")
def test_export_is_deterministic(tmp_path):
    src = _fixture_dir(tmp_path)
    out = tmp_path / "blueprints.json"
    export(out, terrain=False, src_dir=src, crop_dir=tmp_path / "crops")
    first = out.read_bytes()
    export(out, terrain=False, src_dir=src, crop_dir=tmp_path / "crops")
    assert out.read_bytes() == first
    assert first.endswith(b"\n")
    assert render(build_bundle(src, terrain=False)).encode("utf-8") == first


@pytest.mark.skipif(not OUT_PATH.exists(), reason="blueprints.json not exported yet")
def test_committed_export_is_current():
    """Fails when a blueprint changed and nobody re-ran the exporter."""
    on_disk = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    fresh = build_bundle(terrain=False)
    # terrain records are only written by a full (raster) run; compare the rest.
    for e in on_disk["blueprints"]:
        e["terrain"] = None
    assert on_disk == fresh, "run python3 -m worldgen.export_blueprints"
