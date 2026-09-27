"""Tier A interior bundles (decision 0103 decision 3): every reference in the
cell is a placement or a listed drop, every placement names a published kit
asset, and the export is reproducible from the plugin."""

from __future__ import annotations

import copy
import json

import pytest

from . import export_interior_bundle as ex

BUNDLES = sorted(ex.OUT_DIR.glob("*.json")) if ex.OUT_DIR.exists() else []


def _load(path):
    return json.loads(path.read_text())


@pytest.mark.parametrize("path", BUNDLES, ids=[p.stem for p in BUNDLES])
def test_bundle_accounts_for_every_reference(path):
    bundle = _load(path)
    assert bundle["schemaVersion"] == ex.SCHEMA_VERSION
    assert ex.check(bundle) == []
    assert len(bundle["placements"]) + len(bundle["drops"]) == bundle["refCount"]
    assert not [d for d in bundle["drops"] if d["reason"] == "no-kit-asset"], \
        "a tier A cell ships with every mesh in a published kit"


@pytest.mark.parametrize("path", BUNDLES, ids=[p.stem for p in BUNDLES])
def test_placements_name_published_kit_assets(path):
    kit_assets = ex.published_kit_assets()
    bundle = _load(path)
    missing = [p["assetId"] for p in bundle["placements"] if p["assetId"] not in kit_assets]
    assert missing == []
    assert bundle["exitDoor"] and bundle["arrivalMarker"]
    kinds = {s["kind"] for s in bundle["sockets"]}
    assert kinds <= {"container", "idle", "item"}
    for s in bundle["sockets"]:
        if s["kind"] == "container":
            assert s["fillRule"] and s["containerClass"]
        if s["kind"] == "item" and s["itemClass"] == "book":
            assert s["contentPending"] is True


def test_shared_fixture_passes_the_contract():
    """The one fixture both suites read (interior.test.ts parses it too)."""
    fixture = json.loads(ex.FIXTURE.read_text())
    assert ex.validate_bundle(fixture) == []


def test_contract_refuses_what_the_runtime_refuses():
    fixture = json.loads(ex.FIXTURE.read_text())
    for mutate, expect in (
        (lambda b: b["placements"][0].update(kit="nope"), "is not in the bundle's kits"),
        (lambda b: b["lights"][0].update(colorRGB=[1.0, 0.5, 0.2, 9]), "light 0 malformed"),
        (lambda b: b["lights"][0].pop("raw"), "light 0 raw malformed"),
        (lambda b: b["doors"][0].pop("arrivalMarker"), "bad doors entry"),
        (lambda b: b["doors"].append({"interiorLoadDoorRef": "X", "closed": True}), "bad doors entry"),
        (lambda b: b.update(schemaVersion=2), "schemaVersion"),
    ):
        b = copy.deepcopy(fixture)
        mutate(b)
        assert any(expect in m for m in ex.validate_bundle(b)), expect


@pytest.mark.parametrize("path", BUNDLES, ids=[p.stem for p in BUNDLES])
def test_published_bundles_pass_the_contract(path):
    assert ex.validate_bundle(_load(path)) == []


def test_closed_door_entry_passes_the_contract():
    """Ruling 3 (round 3): an unpaired load door ships closed, with no exterior
    door and no arrival marker."""
    b = json.loads(ex.FIXTURE.read_text())
    b["doors"].append({"interiorLoadDoorRef": "00000A02", "closed": True,
                       "loadDoor": {"positionM": [3.0, 3.4, 0.0], "yawDeg": 90.0}})
    assert ex.validate_bundle(b) == []


def test_rotation_is_the_runtime_euler():
    import math
    # a compass turn stays a compass turn (Skyrim's z is clockwise from above)
    assert ex.game_rotation_deg((0.0, 0.0, math.radians(30))) == [0.0, 30.0, 0.0]
    # plugin y (north) is game -z: a roll about north is a roll about game z
    assert ex.game_rotation_deg((0.0, math.radians(20), math.radians(90))) == [0.0, 90.0, 20.0]
    # plugin (x east, y north, z up) -> game (x east, y up, z south)
    u = ex.UNITS_PER_METRE
    assert ex._game_pos((1.0 * u, 2.0 * u, 3.0 * u)) == [1.0, 3.0, -2.0]


def test_gate_fails_on_an_unlisted_reference():
    bundle = {"cellId": "X", "refCount": 3, "drops": [{"refId": "1", "reason": "actor"}],
              "placements": [{"id": "X.2"}]}
    assert ex.check(bundle)
    fixed = copy.deepcopy(bundle)
    fixed["placements"].append({"id": "X.3"})
    assert ex.check(fixed) == []


def test_reexport_matches_the_published_bundle():
    try:
        paths, pools, registry = ex._environment()
    except Exception as exc:  # pragma: no cover - no vault on the runner
        pytest.skip(f"vault not available: {exc}")
    if not BUNDLES:
        pytest.skip("no bundles published")
    bundle = _load(BUNDLES[0])
    if bundle["plugin"] not in paths:
        pytest.skip(f"{bundle['plugin']} not in the local vault")
    doors = [{k: d[k] for k in ("exteriorDoorId", "interiorLoadDoorRef", "arrivalMarker")}
             for d in bundle["doors"] if not d.get("closed")]
    again = ex.export_cell(bundle["plugin"], bundle["cellId"], paths, registry,
                           ex.published_kit_assets(), lambda n: pools.get(n), doors=doors)
    if not doors:
        again["arrivalMarker"] = bundle["arrivalMarker"]
    again["shellAssetId"] = bundle["shellAssetId"]
    assert json.loads(json.dumps(again)) == bundle
