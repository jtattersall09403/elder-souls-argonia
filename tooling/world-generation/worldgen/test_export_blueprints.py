"""blueprints.json is a metre-space, byte-stable projection of the blueprints."""

import json
from pathlib import Path

import pytest

from .blueprint import BLUEPRINT_DIR
from .export_blueprints import (
    LAYERS, OUT_PATH, PAD_M, SCHEMA_VERSION, WHY_KEYS_AREA, WHY_KEYS_FULL,
    build_bundle, context_box, export, project, render,
)
from .render_blueprint import PROVINCE_EXTENT_M, crop_box

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
    bundle = build_bundle(_fixture_dir(tmp_path))
    assert bundle["schemaVersion"] == SCHEMA_VERSION
    assert bundle["layers"] == LAYERS
    (entry,) = bundle["blueprints"]
    assert entry["id"] == json.loads(FIXTURE.read_text(encoding="utf-8"))["blueprint"]["id"]
    assert "terrain" not in entry            # no hillshade backdrop is exported
    s = entry["summary"]
    assert s["parcels"] == len(entry["parcels"]) and s["parcels"] > 0
    assert s["doors"] == len(entry["doors"])
    assert s["sitingCandidates"] >= 2        # the Part 6 deliberation rule
    assert set(entry["contextM"]) == {"x0", "z0", "x1", "z1"}
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
    export(out, src_dir=src)
    first = out.read_bytes()
    export(out, src_dir=src)
    assert out.read_bytes() == first
    assert first.endswith(b"\n")
    assert render(build_bundle(src)).encode("utf-8") == first


@pytest.mark.skipif(not OUT_PATH.exists(), reason="blueprints.json not exported yet")
def test_committed_export_is_current():
    """Fails when a blueprint changed and nobody re-ran the exporter."""
    on_disk = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    fresh = build_bundle()
    assert on_disk == fresh, "run python3 -m worldgen.export_blueprints"


# --------------------------------------------------------------------------- #
# round 2 (owner 2026-09-05): whys, approaches, fences, context
# --------------------------------------------------------------------------- #
def _doc(**blueprint) -> dict:
    base = {
        "id": "place.test.round-two",
        "boundary": [[0.10, 0.10], [0.11, 0.10], [0.11, 0.11], [0.10, 0.11]],
    }
    base.update(blueprint)
    return {"schemaVersion": 1, "blueprint": base}


def test_new_fields_are_carried_through():
    why_full = {k: f"{k} sentence" for k in WHY_KEYS_FULL}
    why_area = {k: f"{k} sentence" for k in WHY_KEYS_AREA}
    entry = project(_doc(
        districts=[{"id": "district.t.a", "boundary": [[0.10, 0.10], [0.11, 0.11]], "why": why_area}],
        parcels=[{"id": "parcel.t.gate", "districtId": "district.t.a", "centreUV": [0.105, 0.105],
                  "why": why_full, "spans": "route.t.road",
                  "interior": {"kind": "hall", "assetRef": "kit:hall01"}}],
        landmarks=[{"id": "landmark.t.post", "position": [0.106, 0.106], "why": why_full}],
        docks=[{"id": "dock.t.landing", "position": [0.104, 0.107], "why": why_area}],
        routes=[{"id": "route.t.road", "kind": "road", "widthM": 4.0, "routing": "terrain",
                 "why": "it is the only dry line off the ridge",
                 "via": [[0.100, 0.100], [0.110, 0.110]],
                 "points": [[0.100, 0.100], [0.105, 0.104], [0.110, 0.110]],
                 "endsAt": ["parcel.t.gate"]}],
        fences=[{"id": "fence.t.palisade", "kind": "palisade", "widthM": 0.4, "routing": "straight",
                 "assetRef": "kit:palisade01", "why": "it keeps the pens in",
                 "via": [[0.101, 0.101], [0.103, 0.101]], "points": [[0.101, 0.101], [0.103, 0.101]]}],
        combatSpaces=[{"id": "combat.t.yard", "boundary": [[0.102, 0.102], [0.103, 0.103]],
                       "clearanceClass": "open", "why": "the night attack in the local quest"}],
        approaches=[{"id": "approach.t.south", "mode": "walk", "fromRouteId": "route.t.road",
                     "firstSeen": "landmark.t.post", "sequence": "the post, then the roofs",
                     "wayfinding": "keep the post on your left to the gate"}],
        scaleGrounding={"loreSource": "UESP", "population": "60-80", "households": 18,
                        "buildingsPlanned": 1, "npcsPlanned": 30, "why": "a small landing"},
    ), PROVINCE_EXTENT_M)

    assert entry["districts"][0]["why"]["whyHere"] == "whyHere sentence"
    parcel = entry["parcels"][0]
    assert parcel["why"]["whySpot"] == "whySpot sentence"
    assert parcel["spans"] == "route.t.road"
    assert parcel["interior"]["kind"] == "hall"
    assert entry["landmarks"][0]["why"]["microGeography"]
    assert entry["docks"][0]["why"]["playerPurpose"]
    assert entry["combatSpaces"][0]["why"].startswith("the night attack")
    assert entry["scaleGrounding"]["households"] == 18
    (approach,) = entry["approaches"]
    assert approach["firstSeen"] == "landmark.t.post" and approach["wayfinding"]

    by_group = {w["group"]: w for w in entry["ways"]}
    assert set(by_group) == {"routes", "fences"}
    road = by_group["routes"]
    assert road["routing"] == "terrain" and road["endsAt"] == ["parcel.t.gate"]
    assert road["why"] and len(road["via"]) == 2 and len(road["points"]) == 3
    assert by_group["fences"]["assetRef"] == "kit:palisade01"
    assert entry["summary"]["fences"] == 1 and entry["summary"]["approaches"] == 1


def test_missing_new_fields_export_as_null():
    """The live blueprints are being re-authored: absence must never fail the
    export, and must land as an explicit null the viewer can flag in red."""
    entry = project(_doc(
        districts=[{"id": "district.t.a", "boundary": [[0.10, 0.10], [0.11, 0.11]]}],
        parcels=[{"id": "parcel.t.hut", "districtId": "district.t.a", "centreUV": [0.105, 0.105]}],
        routes=[{"id": "route.t.road", "kind": "road", "widthM": 4.0,
                 "points": [[0.100, 0.100], [0.110, 0.110]]}],
    ), PROVINCE_EXTENT_M)
    assert entry["districts"][0]["why"] is None
    assert entry["parcels"][0]["why"] is None and entry["parcels"][0]["spans"] is None
    assert entry["approaches"] == [] and entry["scaleGrounding"] is None
    assert entry["ways"][0]["why"] is None and entry["ways"][0]["via"] is None


def test_partial_why_keeps_the_written_keys_and_nulls_the_rest():
    entry = project(_doc(parcels=[{"id": "parcel.t.hut", "centreUV": [0.105, 0.105],
                                   "why": {"what": "a fisher's hut"}}]), PROVINCE_EXTENT_M)
    why = entry["parcels"][0]["why"]
    assert why["what"] == "a fisher's hut"
    assert why["whySpot"] is None and set(why) == set(WHY_KEYS_FULL)


def test_way_without_points_falls_back_to_its_waypoints():
    """`points` is derived by the street router; an un-routed way still draws."""
    entry = project(_doc(canals=[{"id": "canal.t.cut", "kind": "channel", "widthM": 3.0,
                                  "via": [[0.10, 0.10], [0.11, 0.11]]}]), PROVINCE_EXTENT_M)
    (way,) = entry["ways"]
    assert way["kind"] == "channel" and way["points"] == way["via"]


def test_context_box_contains_the_crop_and_is_deterministic():
    doc = _doc()
    box = context_box(doc["blueprint"], PROVINCE_EXTENT_M)
    crop = crop_box(doc["blueprint"], PROVINCE_EXTENT_M, PAD_M)
    assert box["x0"] < crop[0] and box["z0"] < crop[1]
    assert box["x1"] > crop[2] and box["z1"] > crop[3]
    assert box == context_box(doc["blueprint"], PROVINCE_EXTENT_M)
    assert all(isinstance(v, float) for v in box.values())   # JSON-serialisable
