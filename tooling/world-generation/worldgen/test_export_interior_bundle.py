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
    assert (len(bundle["placements"]) + len(bundle["drops"])
            + len(bundle.get("substitutions") or [])) == bundle["refCount"]
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


# --------------------------------------------------------------------------- #
# Missing pieces and stand-ins (planner ruling 2026-09-27, 16k walk 2 lane I;
# place-diag P9: KeebaHouseFisher shipped 13 Creation Club references as
# silent `unresolved-base` drops, nothing drawn and nothing classed).
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("path", BUNDLES, ids=[p.stem for p in BUNDLES])
def test_every_missing_piece_is_classed_clutter_and_drawn_by_a_stand_in(path):
    bundle = _load(path)
    missing = [d for d in bundle["drops"] if d["reason"] in ex.MISSING_REASONS]
    assert missing == [], (
        f"{len(missing)} missing pieces ship undrawn; each needs a class and a same-class "
        f"stand-in in kit-interiors/substitutions/{bundle['cellId']}.json")
    for s in bundle.get("substitutions") or []:
        assert s["class"] in ex.SUBSTITUTABLE_CLASSES and s["standInCategory"] == s["class"]


def _gate_bundle(**more):
    b = {"cellId": "X", "refCount": 2, "placements": [{"id": "X.1"}], "drops": [],
         "substitutions": []}
    b.update(more)
    return b


def test_gate_fails_on_a_missing_architecture_piece():
    b = _gate_bundle(drops=[{"refId": "2", "reason": "unresolved-base",
                             "baseForm": "HearthFires.esm:00000001", "class": "architecture"}])
    assert any("missing architecture" in p for p in ex.check(b))
    b["drops"][0]["class"] = "clutter"
    assert ex.check(b) == []


def test_gate_counts_substitutions_and_checks_their_class():
    sub = {"id": "X.2", "refId": "2", "class": "clutter", "standInCategory": "clutter",
           "standInAsset": "vanilla:a"}
    assert ex.check(_gate_bundle(substitutions=[sub])) == []
    assert ex.check(_gate_bundle())  # the stand-in is a reference: without it the count is short
    wrong = dict(sub, standInCategory="misc")
    assert any("the missing piece is 'clutter'" in p for p in ex.check(_gate_bundle(substitutions=[wrong])))
    arch = dict(sub, **{"class": "architecture", "standInCategory": "architecture"})
    assert any("only clutter or furniture" in p for p in ex.check(_gate_bundle(substitutions=[arch])))


def test_piece_class_reads_the_base_record_then_the_sourced_absent_master_row():
    absent = {"cc.esm:00000001": {"class": "clutter", "source": "UESP"}}
    assert ex.piece_class(None, "cc.esm:00000001", None, absent) == ("clutter", "UESP")
    assert ex.piece_class(None, "cc.esm:00000002", None, absent)[0] == "unclassed"
    assert ex.piece_class({"type": "FURN"}, None, "x.nif", {})[0] == "furniture"
    assert ex.piece_class({"type": "MISC"}, None, "x.nif", {})[0] == "clutter"
    assert ex.piece_class({"type": "STAT"}, None,
                          "architecture/whiterun/wrbuildings/wrhouse01.nif", {})[0] == "architecture"


# Interior lighting from the plugin (runtime-diag D2 "flat"; restored 16i
# item 5): the bundle's lights and the cell's ambient and directional match
# the plugin's own bytes, read here without the exporter's decoder. Two
# claimed cells (all that are claimed on 2026-09-27) and ten others.
LIGHT_CELLS = (
    ("Skyrim.esm", "DawnstarBrinasHouse"), ("King of the Murkmire.esp", "KeebaHouseFisher"),
    ("King of the Murkmire.esp", "KeebaHouseCrafter"), ("King of the Murkmire.esp", "KeebaHouseSnailMinder"),
    ("King of the Murkmire.esp", "KeebaHouseElder"), ("King of the Murkmire.esp", "KeebaHouseTreeminder"),
    ("King of the Murkmire.esp", "LilmothStablesInt"), ("King of the Murkmire.esp", "LilmothStablemasterHouseInt"),
    ("Here There Be Monsters - Curse of Cipactli.esp", "CIPHTBMHutInteriorGreatHouse"),
    ("Here There Be Monsters - Curse of Cipactli.esp", "CIPHTBMHutInterior04"),
    ("Skyrim.esm", "WhiterunStables"), ("Skyrim.esm", "RiftenStables"),
)


@pytest.fixture(scope="module")
def vault_env():
    try:
        return ex._environment()
    except Exception as exc:  # pragma: no cover - no vault on the runner
        pytest.skip(f"vault not available: {exc}")


@pytest.mark.parametrize("plugin,cell", LIGHT_CELLS, ids=[c for _, c in LIGHT_CELLS])
def test_bundle_lighting_matches_the_plugin_bytes(vault_env, plugin, cell):
    import struct
    paths, pools, registry = vault_env
    if plugin not in paths:
        pytest.skip(f"{plugin} not in the local vault")
    bundle = ex.export_cell(plugin, cell, paths, registry, ex.published_kit_assets(),
                            lambda n: pools.get(n))
    pset = ex.PluginSet(paths[plugin], paths)
    cell_rec, refs = ex.read_cell(pset.main, cell)
    base_of = {}
    for rec in refs:
        for st, payload in rec.subrecords():
            if st == b"NAME":
                base_of[f"{rec.form_id:08X}"] = pset.key(pset.main, struct.unpack_from("<I", payload)[0])
    records, _ = ex.read_records(pset, set(base_of.values()))
    want = {}
    for rid, key in base_of.items():
        rec = records.get(key)
        if rec is None or rec.type != b"LIGH":
            continue
        data = next(p for st, p in rec.subrecords() if st == b"DATA")
        want[rid] = list(data[8:11])
    got = {lt["refId"]: lt["colorRGB"] for lt in bundle["lights"]}
    assert got == want, f"{cell}: {len(got)} lights in the bundle, the plugin places {len(want)}"
    for lt in bundle["lights"]:
        assert lt["radiusM"] > 0 and lt["falloffExponent"] is not None
    xcll = next((p for st, p in cell_rec.subrecords() if st == b"XCLL"), None)
    lighting = bundle["lighting"]
    assert {"ambientRGB", "directionalRGB", "directionalRotXYDeg", "directionalRotZDeg"} <= set(lighting)
    if xcll is not None and len(xcll) >= 92:
        inherits = struct.unpack_from("<I", xcll, 88)[0]
        if not inherits & 1:
            assert lighting["ambientRGB"] == list(xcll[0:3])
        if not inherits & 2:
            assert lighting["directionalRGB"] == list(xcll[4:7])
