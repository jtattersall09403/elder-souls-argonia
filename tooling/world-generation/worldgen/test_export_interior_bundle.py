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
    swings = [d for d in bundle["doors"] if d["doorType"] == "swing"]
    assert (len(bundle["placements"]) + len(bundle["drops"])
            + len(bundle.get("substitutions") or []) + len(swings)) == bundle["refCount"]
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
        (lambda b: b.update(schemaVersion=1), "schemaVersion"),
        (lambda b: b["doors"][0].pop("doorType"), "doorType must be load or swing"),
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
    b["doors"].append({"doorType": "load", "interiorLoadDoorRef": "00000A02", "closed": True,
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
             for d in bundle["doors"] if d["doorType"] == "load" and not d.get("closed")]
    again = ex.export_cell(bundle["plugin"], bundle["cellId"], paths, registry,
                           ex.published_kit_assets(), lambda n: pools.get(n), doors=doors)
    if not doors:
        again["arrivalMarker"] = bundle["arrivalMarker"]
    again["shellAssetId"] = bundle["shellAssetId"]
    from worldgen.interior_light import apply_light_rule, kit_lights
    apply_light_rule(again, kit_lights(ex.KITS_DIR))  # as main() does before it writes
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


def test_a_tree_base_is_vegetation_and_every_crate_is_clutter():
    # R46: a TREE base is vegetation whatever its mesh folder says
    assert ex.piece_class({"type": "TREE"}, None, "argonia/trees/undergrowth01.nif", {})[0] == "vegetation"
    # R47: crates are clutter, as their published kit category is; a CONT keeps its record type
    assert ex.piece_class({"type": "STAT"}, None, "argonia/furniture/crateopen01.nif", {})[0] == "clutter"
    assert ex.piece_class({"type": "STAT"}, None, "furniture/noble/noblecrate02.nif", {})[0] == "clutter"
    assert ex.piece_class({"type": "CONT"}, None, "clutter/common/cratesmall01.nif", {})[0] == "container"
    assert ex.piece_class({"type": "CONT"}, None,
                          "clutter/deadsoldiers/desecratedimperial.nif", {})[0] == "container"


# R45 geometry: a 1 m table (top at 0.9 m) at the origin, facing north; a
# chair beside it on the same floor. Game frame: y up, z south.
_BOUNDS = {"t": ([1.0, 1.0, 0.9], [0.5, 0.5, 0.0]), "c": ([0.5, 0.5, 1.0], [0.25, 0.25, 0.0])}
_PIECES = [
    {"id": "T", "assetId": "t", "category": "clutter", "positionM": [0.0, 0.0, 0.0],
     "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0},
    {"id": "C", "assetId": "c", "category": "furniture", "positionM": [2.0, 0.0, 0.0],
     "rotationDeg": [0.0, 90.0, 0.0], "scale": 1.0},
]


@pytest.mark.parametrize("q, verdict", [
    ([0.2, 0.92, -0.1], "surface"),   # on the table top
    ([3.0, 0.05, 1.0], "floor"),      # on the floor by the chair
    ([3.0, 1.6, 1.0], "loose"),       # R49: nothing under it and no wall within 0.3 m
    ([0.2, 1.2, -0.1], "loose"),      # 0.3 m over the table top: not resting on it, no wall
])
def test_support_of_reads_where_a_reference_sits(q, verdict):
    assert ex.support_of(q, _PIECES, _BOUNDS)[0] == verdict


def test_support_of_reads_a_room_shell_floor_and_never_a_door_top():
    bounds = {"shell": ([10.0, 10.0, 4.0], [5.0, 5.0, 0.8]), "door": ([1.2, 0.3, 2.2], [0.6, 0.15, 0.0])}
    shell = {"id": "S", "assetId": "shell", "category": "misc", "positionM": [20.0, 0.0, 0.0],
             "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0}
    door = dict(shell, id="D", assetId="door", category="door", positionM=[40.0, 0.0, 0.0])
    # standing on the shell's floor, near the bottom of its box, no furniture near
    assert ex.support_of([21.0, -0.7, 1.0], [shell], bounds)[0] == "floor"
    # just over a door's lintel: a door is no wall to hang from (R49)
    assert ex.support_of([40.0, 2.25, 0.0], [door], bounds)[0] == "loose"
    # hung 2 m up inside the room shell, 0.2 m off its east side: a wall (R49)
    assert ex.support_of([24.8, 1.2, 0.0], [shell], bounds)[0] == "wall"
    # hung 2 m up in the middle of the room, 5 m from every side: loose (R49)
    assert ex.support_of([20.0, 1.2, 0.0], [shell], bounds)[0] == "loose"
    # standing on the ground 0.2 m outside the shell's wall, nothing near: not hung (R49)
    assert ex.support_of([25.2, -0.75, 0.0], [shell], bounds)[0] == "loose"
    # 0.28 m above a floor slab's top, past the resting band: not hung from the slab (R49)
    slab = {"id": "F", "assetId": "slab", "category": "architecture", "positionM": [60.0, 0.0, 0.0],
            "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0}
    b2 = {"slab": ([4.0, 4.0, 0.2], [2.0, 2.0, 0.2])}
    assert ex.support_of([60.0, 0.28, 0.0], [slab], b2)[0] == "loose"


def test_class_by_placement_support_from_below_wins():
    assert ex.class_by_placement({"surface": 1, "wall": 3}, 0.0) == "clutter"
    assert ex.class_by_placement({"floor": 2}, 0.0) == "clutter"
    assert ex.class_by_placement({"floor": 2, "wall": 1}, 0.75) == "furniture"
    assert ex.class_by_placement({"wall": 2}, 0.0) == "fixture"
    # R49: one reference hung from no wall makes the form loose clutter
    assert ex.class_by_placement({"wall": 2, "loose": 1}, 0.0) == "clutter"
    # R50: a floor form with nothing on it is clutter
    assert ex.class_by_placement({"floor": 3}, 0.0) == "clutter"


def test_placement_rows_class_unclassed_absent_forms_only():
    drops = [
        {"refId": "1", "reason": "unresolved-base", "baseForm": "cc.esm:00000001",
         "class": "unclassed", "positionM": [0.2, 0.92, -0.1]},
        {"refId": "2", "reason": "unresolved-base", "baseForm": "cc.esm:00000002",
         "class": "clutter", "positionM": [3.0, 1.6, 1.0]},
        {"refId": "3", "reason": "unresolved-base", "baseForm": "cc.esm:00000003",
         "class": "unclassed", "positionM": [3.0, 0.05, 1.0]},
        {"refId": "4", "reason": "no-kit-asset", "class": "clutter", "positionM": [3.0, 0.85, 1.0]},
    ]
    rows = ex.placement_rows([{"cellId": "X", "placements": _PIECES, "drops": drops}], _BOUNDS)
    assert set(rows) == {"cc.esm:00000001", "cc.esm:00000003"}
    assert rows["cc.esm:00000001"]["class"] == "clutter"
    # the author set a piece 0.8 m above the floor form: its bounds pass 0.6 m
    assert rows["cc.esm:00000003"] == {**rows["cc.esm:00000003"], "class": "furniture",
                                       "classedBy": "placement", "carriedM": 0.8}


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
    pset = ex.plugin_set(paths[plugin], paths)
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


def test_an_armour_ground_model_is_a_wearable_and_effects_and_wearables_are_listed_drops():
    """Planner ruling 2026-09-27 (lane P): an effect (fxdwesteam01) and a
    wearable (the dlc01 sandals in KeebaHouseSnailMinder) are listed drops,
    not substitutions, so they neither ship undrawn nor keep the cell unfit."""
    cls, _ = ex.piece_class({"type": "ARMO"}, None, "dlc01/clothes/x/sandalsgnd.nif", {})
    assert cls == "wearable"
    assert {"effect", "wearable"} <= ex.LISTED_DROP_CLASSES
    assert not ex.LISTED_DROP_CLASSES & ex.SUBSTITUTABLE_CLASSES
    assert "listed-drop" not in ex.MISSING_REASONS


# --------------------------------------------------------------------------- #
# read_records answers from the PluginSet's record index (lane 3A E, S5d):
# exactly what the old full walk returned, on a synthetic main + master pair.
# --------------------------------------------------------------------------- #
def _sub(tag: bytes, payload: bytes) -> bytes:
    import struct
    return struct.pack("<4sH", tag, len(payload)) + payload


def _rec(rtype: bytes, form_id: int, data: bytes) -> bytes:
    import struct
    return struct.pack("<4sIIIIHH", rtype, len(data), 0, form_id, 0, 44, 0) + data


def _grup(label: bytes, gtype: int, body: bytes) -> bytes:
    import struct
    return struct.pack("<4sI4siIHH", b"GRUP", 24 + len(body), label, gtype, 0, 0, 0) + body


def _old_read_records(pset, wanted):
    """The pre-index read_records body, kept here as the reference."""
    import struct
    found, quest_refs = {}, set()
    for _name, plugin in pset.plugins.items():
        for rec, _stack in plugin.records():
            key = (plugin.source_of(rec.form_id), rec.form_id & 0xFFFFFF)
            if key in wanted:
                found[key] = rec
            if rec.type == b"QUST":
                for st, payload in rec.subrecords():
                    if st == b"ALFR" and len(payload) >= 4:
                        fid = struct.unpack_from("<I", payload)[0]
                        quest_refs.add((plugin.source_of(fid), fid & 0xFFFFFF))
    return found, quest_refs


def test_read_records_index_matches_the_full_walk(tmp_path):
    import struct
    master = _rec(b"TES4", 0, _sub(b"HEDR", b"\0" * 12)) + _grup(b"STAT", 0, (
        _rec(b"STAT", 0x000010, _sub(b"EDID", b"Base\0") + _sub(b"MODL", b"a.nif\0"))
        + _rec(b"STAT", 0x000011, _sub(b"EDID", b"Other\0")))) + _grup(b"QUST", 0, (
        _rec(b"QUST", 0x000020, _sub(b"ALFR", struct.pack("<I", 0x000030)))))
    main = _rec(b"TES4", 0, _sub(b"HEDR", b"\0" * 12) + _sub(b"MAST", b"M.esm\0")) + _grup(b"STAT", 0, (
        _rec(b"STAT", 0x000010, _sub(b"EDID", b"Base\0") + _sub(b"MODL", b"override.nif\0"))
        + _grup(b"\0\0\0\0", 6, _rec(b"STAT", 0x01000040, _sub(b"EDID", b"Own\0")))))
    (tmp_path / "M.esm").write_bytes(master)
    (tmp_path / "P.esp").write_bytes(main)
    paths = {"M.esm": tmp_path / "M.esm", "P.esp": tmp_path / "P.esp"}
    wanted = {("M.esm", 0x10), ("M.esm", 0x11), ("P.esp", 0x40), ("M.esm", 0x99)}
    new = ex.read_records(ex.PluginSet(paths["P.esp"], paths), wanted)
    old = _old_read_records(ex.PluginSet(paths["P.esp"], paths), wanted)
    assert list(new[0]) == list(old[0])                  # same keys, same order
    assert [(r.type, r.form_id, r.data) for r in new[0].values()] == \
        [(r.type, r.form_id, r.data) for r in old[0].values()]
    assert new[1] == old[1] == {("M.esm", 0x30)}
    # load order: the main plugin's override beats its master's original
    assert b"override.nif" in new[0][("M.esm", 0x10)].data


def test_the_latest_plugin_in_load_order_owns_an_overridden_record(tmp_path):
    """Masters load in MAST order, the main plugin last; the last to define a
    record owns it (closeout B; lane 3A E found a master's original beating
    the main plugin's override). U.esm overrides M.esm's 0x10 and 0x11; the
    main plugin overrides 0x10 again."""
    m = _rec(b"TES4", 0, _sub(b"HEDR", b"\0" * 12)) + _grup(b"STAT", 0, (
        _rec(b"STAT", 0x10, _sub(b"MODL", b"m10.nif\0")) + _rec(b"STAT", 0x11, _sub(b"MODL", b"m11.nif\0"))
        + _rec(b"STAT", 0x12, _sub(b"MODL", b"m12.nif\0"))))
    u = _rec(b"TES4", 0, _sub(b"HEDR", b"\0" * 12) + _sub(b"MAST", b"M.esm\0")) + _grup(b"STAT", 0, (
        _rec(b"STAT", 0x10, _sub(b"MODL", b"u10.nif\0")) + _rec(b"STAT", 0x11, _sub(b"MODL", b"u11.nif\0"))))
    p = _rec(b"TES4", 0, _sub(b"HEDR", b"\0" * 12) + _sub(b"MAST", b"M.esm\0")
             + _sub(b"MAST", b"U.esm\0")) + _grup(b"STAT", 0, _rec(b"STAT", 0x10, _sub(b"MODL", b"p10.nif\0")))
    for name, data in (("M.esm", m), ("U.esm", u), ("P.esp", p)):
        (tmp_path / name).write_bytes(data)
    paths = {n: tmp_path / n for n in ("M.esm", "U.esm", "P.esp")}
    got, _ = ex.read_records(ex.PluginSet(paths["P.esp"], paths), {("M.esm", k) for k in (0x10, 0x11, 0x12)})
    models = {k[1]: ex._base_info(r)["model"] for k, r in got.items()}
    assert models == {0x10: "p10.nif", 0x11: "u11.nif", 0x12: "m12.nif"}


def test_tropical_skyrims_wolfpelt_override_wins(vault_env):
    """The real case: Tropical Skyrim.esp overrides Skyrim.esm:03AD74 WolfPelt
    to the slaughterfish scale mesh; an export must draw the override."""
    paths, _pools, _registry = vault_env
    if "Tropical Skyrim.esp" not in paths or "Skyrim.esm" not in paths:
        pytest.skip("Tropical Skyrim.esp not in the local vault")
    pset = ex.plugin_set(paths["Tropical Skyrim.esp"], paths)
    got, _ = ex.read_records(pset, {("Skyrim.esm", 0x03AD74)})
    info = ex._base_info(got[("Skyrim.esm", 0x03AD74)])
    assert info["editorId"] == "WolfPelt"
    assert "slaughterfishscale" in info["model"], info["model"]


# --------------------------------------------------------------------------- #
# Swing doors (16k walk 4, owner 2026-09-28): a DOOR reference with no XTEL is
# a `swing` doors[] entry, its hinge read from the door NIF.
# --------------------------------------------------------------------------- #
def test_swing_entry_counts_as_a_reference_and_passes_the_contract():
    fixture = json.loads(ex.FIXTURE.read_text())
    swings = [d for d in fixture["doors"] if d["doorType"] == "swing"]
    assert len(swings) == 1 and ex.validate_bundle(fixture) == []
    counted = {"cellId": "X", "refCount": 2, "drops": [], "placements": [{"id": "X.1"}], "doors": swings}
    assert ex.check(counted) == []
    for mutate, expect in (
        (lambda d: d["hinge"].update(axis=[0, 2, 0]), "bad swing door"),
        (lambda d: d["hinge"].update(leafBoundsM=[[0, 0]]), "bad swing door"),
        (lambda d: d.update(kit="nope"), "is not in the bundle's kits"),
    ):
        b = copy.deepcopy(fixture)
        mutate(next(d for d in b["doors"] if d["doorType"] == "swing"))
        assert any(expect in m for m in ex.validate_bundle(b)), expect


def test_hinge_from_bounds_is_the_minus_x_edge_mid_thickness():
    h = ex.hinge_from_bounds([1.366, 0.185, 2.503], [0.683, 0.128, 0.0])
    assert h["pivotM"] == [-0.683, 0.0, 0.0355] and h["axis"] == [0.0, 1.0, 0.0]
    assert h["openAngleDeg"] == ex.SWING_DEFAULT_OPEN_DEG


@pytest.mark.parametrize("asset,model,pivot,axis,angle,leaf", [
    # the NIF root is mid-width (kit originOffsetM x 0.683 of 1.366); the hinge is the Door01 node
    ("vanilla:architecture/farmhouse/farmhouseanimdoor01", "meshes/architecture/farmhouse/farmhouseanimdoor01.nif",
     [0.6828, 1.2517, -0.0569], [0.0, 1.0, 0.0], -92.0, False),
    ("kotm:argonia/mudhuts/door01", "meshes/argonia/mudhuts/door01.nif",
     [0.6828, 1.2517, -0.0569], [0.0, 1.0, 0.0], -18.0, False),
    # a wall around the leaf that does not turn: the leaf's box is carried
    ("vanilla:dungeons/imperial/door/impwooddoorsingle01", "meshes/dungeons/imperial/door/impwooddoorsingle01.nif",
     [1.0154, 1.8374, -0.0778], [0.0, 1.0, 0.0], -87.0, True),
    # a trapdoor lifts about x
    ("vanilla:architecture/farmhouse/interior/basement/farmbtrapdoor02",
     "meshes/architecture/farmhouse/interior/basement/farmbtrapdoor02.nif",
     [0.0, 0.1991, 0.3698], [1.0, 0.0, 0.0], 15.0, True),
])
def test_swing_hinge_is_read_from_the_door_nif(asset, model, pivot, axis, angle, leaf):
    try:
        data = ex.door_nif_bytes(asset, model)
    except Exception as exc:  # pragma: no cover - no vault on the runner
        pytest.skip(f"vault not available: {exc}")
    if data is None:
        pytest.skip(f"{model} not in the local vault")
    h = ex.door_hinge(data)
    assert h["pivotM"] == pivot and h["axis"] == axis and h["openAngleDeg"] == angle
    assert ("leafBoundsM" in h) is leaf


def test_a_static_door_nif_has_no_hinge_sequence():
    try:
        data = ex.door_nif_bytes("vanilla:architecture/farmhouse/farmhousedoor01",
                                 "meshes/architecture/farmhouse/farmhousedoor01.nif")
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"vault not available: {exc}")
    if data is None:
        pytest.skip("farmhousedoor01 not in the local vault")
    assert ex.door_hinge(data) is None
