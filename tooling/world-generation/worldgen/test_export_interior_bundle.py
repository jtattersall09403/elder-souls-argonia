"""Tier A interior bundles (decision 0103 decision 3): every reference in the
cell is a placement or a listed drop, every placement names a published kit
asset, and the export is reproducible from the plugin."""

from __future__ import annotations

import copy
import json

import pytest

from . import export_interior_bundle as ex


def test_interior_light_record_has_a_row_per_published_cell():
    """export_interior_bundle publishes and refreshes interiorLight.json in one step (0112 §6)."""
    record = ex.REPO_ROOT / "packages" / "game-core" / "src" / "air" / "volumetrics" / "interiorLight.json"
    cells = json.loads(record.read_text())["cells"]
    assert sorted(cells) == sorted(p.stem for p in ex.OUT_DIR.glob("*.json"))


def test_publishing_refreshes_the_interior_light_record(monkeypatch):
    import subprocess
    seen = []
    monkeypatch.setattr(subprocess, "run", lambda cmd, **kw: seen.append(cmd) or subprocess.CompletedProcess(cmd, 0))
    assert ex.refresh_interior_light_record(["B", "A"]) == 0
    assert seen[0][1:] == [str(ex.INTERIOR_LIGHT_RECORD), "--cells", "A,B", "--merge"]

BUNDLES = sorted(ex.OUT_DIR.glob("*.json")) if ex.OUT_DIR.exists() else []


def _load(path):
    return json.loads(path.read_text())


@pytest.mark.parametrize("path", BUNDLES, ids=[p.stem for p in BUNDLES])
def test_bundle_accounts_for_every_reference(path):
    bundle = _load(path)
    assert bundle["schemaVersion"] == ex.SCHEMA_VERSION
    assert ex.check(bundle) == []
    swings = [d for d in bundle["doors"] if d["doorType"] == "swing"]
    plugin = [p for p in bundle["placements"] if p.get("source") != "addition"]  # 0109: outside the sum
    assert (len(plugin) + len(bundle["drops"])
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
        (lambda b: b["doors"][0].pop("loadDoor"), "bad doors entry"),
        (lambda b: b["doors"][0].update(exteriorDoorId="door.x"), "per-place field"),
        (lambda b: b["doors"][0].update(closed=True), "per-place field"),
        (lambda b: b.update(shellAssetId="composite:mud/kotm-house-pod"), "shellAssetId is per place"),
        (lambda b: b.update(schemaVersion=1), "schemaVersion"),
        (lambda b: b["doors"][0].pop("doorType"), "doorType must be load or swing"),
    ):
        b = copy.deepcopy(fixture)
        mutate(b)
        assert any(expect in m for m in ex.validate_bundle(b)), expect


@pytest.mark.parametrize("path", BUNDLES, ids=[p.stem for p in BUNDLES])
def test_published_bundles_pass_the_contract(path):
    assert ex.validate_bundle(_load(path)) == []


@pytest.mark.parametrize("path", BUNDLES, ids=[p.stem for p in BUNDLES])
def test_shared_cell_file_carries_no_per_place_field(path):
    """0104: a cell file is shared by every place claiming the cell; the
    pairing lives in the place's door record, never here."""
    bundle = _load(path)
    assert bundle["shellAssetId"] is None
    for d in bundle["doors"]:
        if d["doorType"] == "load":
            assert set(d) == {"doorType", "interiorLoadDoorRef", "loadDoor"}


def test_rotation_is_the_runtime_euler():
    import math
    # a compass turn stays a compass turn (Skyrim's z is clockwise from above)
    assert ex.game_rotation_deg((0.0, 0.0, math.radians(30))) == [0.0, 30.0, 0.0]
    # z is applied first, then the tilt about the WORLD axes (Gamebryo Rx Ry Rz):
    # a 20 deg tilt about north after a quarter turn tips the piece's face down
    assert ex.game_rotation_deg((0.0, math.radians(20), math.radians(90))) == [20.0, 90.0, 0.0]


def test_a_rolled_floor_board_lies_flat():
    """16k walk 6: KotM plankwall01b 088B26E8 in LilmothPlantationStorehouse,
    plugin rotation (90, 90, 0) deg, is a board of the upper floor. Its thin
    NIF axis (y, 0.177 m) must end up vertical; the old X-then-Z order stood
    it on edge ("vertical planks hanging in the air")."""
    import math
    import numpy as np
    from worldgen.interior_walk import euler_matrix
    for raw in ((90.0, 90.0, 0.0), (-90.0, -89.972, 180.0)):   # 088B26E8, 088B2739
        m = euler_matrix(ex.game_rotation_deg([math.radians(v) for v in raw]))
        thin = m @ np.array([0.0, 0.0, -1.0])      # NIF +y (north) is game -z
        assert abs(abs(thin[1]) - 1.0) < 1e-6, (raw, thin)
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


@pytest.fixture(scope="module")
def kit_geo():
    """One kit-triangle cache for every export in this file (each kit loads once)."""
    from worldgen.coplanar import KitGeometry
    return KitGeometry()


_FISHER = ("King of the Murkmire.esp", "KeebaHouseFisher")   # the smallest shared cell


@pytest.fixture(scope="module")
def fisher_export(plugin_cache, kit_geo):
    """One KeebaHouseFisher export (no claims) for the two tests that read it."""
    try:
        env = ex._environment()
    except Exception as exc:  # pragma: no cover - no vault on the runner
        pytest.skip(f"vault not available: {exc}")
    if _FISHER[0] not in env[0]:
        pytest.skip(f"{_FISHER[0]} not in the local vault")
    from worldgen.interior_light import kit_lights
    kits, lights = ex.published_kit_assets(), kit_lights(ex.KITS_DIR)
    bundle = ex.export_bundle(*_FISHER, env, kits, lights, None, plugin_cache, kit_geo)
    return json.loads(json.dumps(bundle)), env, kits, lights


def test_reexport_matches_the_published_bundle(fisher_export):
    path = ex.OUT_DIR / f"{_FISHER[1]}.json"
    if not path.exists():
        pytest.skip("no bundles published")
    assert fisher_export[0] == _load(path)


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
        assert ex.is_hearth_fire(s) or (s["class"] in ex.SUBSTITUTABLE_CLASSES
                                        and s["standInCategory"] == s["class"])


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


def test_the_plugin_hearth_fire_effect_stands_in_as_the_kit_fire_bed_and_no_other_effect_does():
    """16k walk 6: the Lilmoth hearths burned nothing (FXfireWithEmbersLogs01 was a listed drop)."""
    fire = {"id": "X.2", "refId": "2", "class": "effect", "standInCategory": "clutter",
            "standInAsset": ex.HEARTH_FIRE_STAND_INS["FXfireWithEmbersLogs01"], "why": ex.HEARTH_FIRE_WHY}
    assert not any("only clutter or furniture" in p for p in ex.check(_gate_bundle(substitutions=[fire])))
    steam = dict(fire, standInAsset="vanilla:a", why="steam")
    assert any("only clutter or furniture" in p for p in ex.check(_gate_bundle(substitutions=[steam])))


def test_piece_class_reads_the_base_record_then_the_sourced_absent_master_row():
    absent = {"cc.esm:00000001": {"class": "clutter", "source": "UESP"}}
    assert ex.piece_class(None, "cc.esm:00000001", None, absent) == ("clutter", "UESP")
    assert ex.piece_class(None, "cc.esm:00000002", None, absent)[0] == "unclassed"
    assert ex.piece_class({"type": "FURN"}, None, "x.nif", {})[0] == "furniture"
    assert ex.piece_class({"type": "MISC"}, None, "x.nif", {})[0] == "clutter"
    assert ex.piece_class({"type": "STAT"}, None,
                          "architecture/whiterun/wrbuildings/wrhouse01.nif", {})[0] == "architecture"


def test_a_kit_folder_clutter_mesh_is_clutter_and_the_kit_pieces_stay_architecture():
    # 16k walk 9 (type-5 slice): Creation Club's root clusters sit in the root
    # kit's clutter folder; the cave walls beside them stay the kit's pieces
    cc = "creationclub/_shared/dungeons/root/clutter/rootclusterlarge01.nif"
    assert ex.piece_class({"type": "STAT"}, None, cc, {})[0] == "clutter"
    wall = "dungeons/caves/green/largeroom/caveglroomwall01.nif"
    assert ex.piece_class({"type": "STAT"}, None, wall, {})[0] in ex.ARCHITECTURE_CLASSES


def test_a_piece_resting_on_a_listed_gap_is_a_gap_too_and_must_name_it(tmp_path):
    # MugsumpHollowInt01 (16k walk 9): stalagmites stood on resource-pack boulders
    row = {"refId": "B", "reason": "rests-on-a-gap", "restsOn": "A", "why": "stood on A"}
    gap = {"refId": "A", "reason": "asset-exists-nowhere", "search": "no copy anywhere"}
    (tmp_path / "C.json").write_text(json.dumps({"gaps": [gap, row]}))
    assert set(ex.load_gaps("C", tmp_path)) == {"A", "B"}
    (tmp_path / "C.json").write_text(json.dumps({"gaps": [dict(row, restsOn="Z"), gap]}))
    with pytest.raises(ValueError):
        ex.load_gaps("C", tmp_path)


def test_an_autoload_marker_is_an_invisible_load_door():
    # AutoLoadDoor01 at a cave mouth (King of the Murkmire's MugsumpHollowInt01)
    assert ex.is_invisible_load_door("autoloadmarker01.nif")
    assert ex.is_invisible_load_door("Meshes\\AutoLoadMarker01.nif")
    assert not ex.is_invisible_load_door("argonia/mudhuts/door01.nif")


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
def test_bundle_lighting_matches_the_plugin_bytes(vault_env, plugin_cache, plugin, cell):
    import struct
    paths, pools, registry = vault_env
    if plugin not in paths:
        pytest.skip(f"{plugin} not in the local vault")
    bundle = ex.export_cell(plugin, cell, paths, registry, ex.published_kit_assets(),
                            lambda n: pools.get(n), cache=plugin_cache)
    pset = ex.plugin_set(paths[plugin], paths, plugin_cache)
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
        if not inherits & 1:  # the Ambient Colors block, X+ X- Y+ Y- Z+ Z- at 40 (UESP CELL XCLL)
            sky = {k: list(xcll[40 + 4 * i:43 + 4 * i]) for i, k in enumerate(("xp", "xn", "yp", "yn", "zp", "zn"))}
            assert lighting["raw"]["ambientCubeSkyrimRGB"] == sky
    assert set(lighting["ambientCube"]) == {"px", "nx", "py", "ny", "pz", "nz"}


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


def test_tropical_skyrims_wolfpelt_override_wins(vault_env, plugin_cache):
    """The real case: Tropical Skyrim.esp overrides Skyrim.esm:03AD74 WolfPelt
    to the slaughterfish scale mesh; an export must draw the override."""
    paths, _pools, _registry = vault_env
    if "Tropical Skyrim.esp" not in paths or "Skyrim.esm" not in paths:
        pytest.skip("Tropical Skyrim.esp not in the local vault")
    pset = ex.plugin_set(paths["Tropical Skyrim.esp"], paths, plugin_cache)
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


# --------------------------------------------------------------------------- #
# One cell, many places (2026-09-29): Riverwalk, Greenspring and Claywater
# Station share KeebaHouseCrafter; the second export used to overwrite the
# first place's exteriorDoorId in the shared file.
# --------------------------------------------------------------------------- #
BLUEPRINTS = ex.REPO_ROOT / "world" / "sources" / "blueprints"


def _two_places():
    a = json.loads((BLUEPRINTS / "place.hist-heartland.greenspring.json").read_text())
    b = json.loads((BLUEPRINTS / "place.imperial-fringe.claywater-station.json").read_text())
    return a, b


def test_each_place_door_record_holds_its_own_pairing():
    """The pairing's home is the place's door: its own id, the cell and the
    load door ref; two places claiming one cell each keep their own door."""
    a, b = _two_places()
    ca, cb = ex.blueprint_claims(a), ex.blueprint_claims(b)
    shared = set(ca) & set(cb)
    assert shared, "Greenspring and Claywater Station share a claimed cell"
    for bp in (a, b):
        rec = bp.get("blueprint", bp)
        prefix = "door." + rec["id"].split("place.", 1)[1] + "."
        for d in rec["doors"]:
            claim = d.get("interiorClaim") or {}
            if claim.get("tier") == "A" and (claim["plugin"], claim["cellId"]) in shared:
                assert d["id"].startswith(prefix)
                assert isinstance(claim["interiorLoadDoorRef"], str) and "exteriorDoorId" not in claim


def test_two_places_export_one_cell_file_in_either_order(fisher_export, plugin_cache, kit_geo):
    """Export the shared cells for place A then B, and B then A: the file is
    identical whichever order and whichever place, and names no place."""
    base, env, kits, lights = fisher_export
    a, b = _two_places()
    ca, cb = ex.blueprint_claims(a), ex.blueprint_claims(b)
    key = _FISHER
    assert key in set(ca) & set(cb)
    # A, then B after A, then A after B: the claim-free export covers both orders
    out = [json.dumps(base, sort_keys=True)] + [
        json.dumps(ex.export_bundle(*key, env, kits, lights, claims[key], plugin_cache, kit_geo),
                   sort_keys=True) for claims in (ca, cb)]
    assert out[0] == out[1] == out[2]
    bundle = json.loads(out[1])
    assert ex.validate_bundle(bundle) == []
    assert "door.hist-heartland" not in out[1] and "door.imperial-fringe" not in out[1]


# --------------------------------------------------------------------------- #
# Additions (decision 0109): kit pieces a builder adds to a tier A cell.
# --------------------------------------------------------------------------- #
_ADD_KITS = {"wall": ("k", "architecture"), "lantern": ("k", "light")}
_ADD_BOUNDS = {"wall": ([6.0, 6.0, 3.0], [0.0, 0.0, 0.0])}
_ADD_PLUGIN = [{"id": "C.00000001", "assetId": "wall", "kit": "k", "positionM": [0.0, 0.0, 0.0],
                "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0, "category": "architecture"}]


def _additions(tmp_path, rows):
    (tmp_path / "C.json").write_text(json.dumps({"schemaVersion": 1, "cellId": "C", "additions": rows}))
    return ex.load_additions("C", _ADD_PLUGIN, _ADD_KITS, _ADD_BOUNDS, directory=tmp_path)


def _row(slug="table-candle", asset="lantern", pos=(1.0, 0.8, 1.0)):
    return {"id": f"C:add:{slug}", "assetId": asset, "pos": list(pos), "rotZDeg": 90,
            "zone": "table", "why": "The fisher mends nets here after dark."}


def test_an_addition_is_appended_and_lit_by_the_rule(tmp_path):
    from worldgen.interior_light import apply_light_rule
    added = _additions(tmp_path, [_row("z-door", pos=(-2.0, 1.0, 2.0)), _row()])
    assert [a["id"] for a in added] == ["C:add:table-candle", "C:add:z-door"]  # sorted by id
    assert added[0]["source"] == "addition" and added[0]["kit"] == "k" and added[0]["zone"] == "table"
    assert added[0]["rotationDeg"][1] == 90.0
    bundle = {"cellId": "C", "refCount": 1, "drops": [], "placements": _ADD_PLUGIN + added,
              "ambient": {"colorRGB": [44, 33, 27], "intensity": 1.0}, "lights": [],
              "lighting": {"directionalRGB": [77, 62, 55]}}
    assert ex.check(bundle) == []  # additions stand outside the refCount sum
    did = apply_light_rule(bundle, {"lantern": {"radiusUnits": 256, "colourRgb": [242, 240, 223],
                                                "offsetM": [0.0, 0.6, 0.0]}})
    assert did["fixtureLights"] == 2
    assert {lt["refId"] for lt in bundle["lights"]} == {"fixture:C:add:table-candle", "fixture:C:add:z-door"}


@pytest.mark.parametrize("rows, why", [
    ([_row(asset="nowhere")], "in no published kit"),
    ([_row(), _row()], "duplicate id"),
    ([_row(pos=(40.0, 0.0, 0.0))], "outside the cell"),
    ([{**_row(), "id": "Other:add:x"}], "is not C:add:"),
    ([{**_row(), "zone": "roof"}], "zone"),
])
def test_a_bad_addition_is_an_export_error(tmp_path, rows, why):
    with pytest.raises(ValueError, match=why):
        _additions(tmp_path, rows)


def test_a_cell_with_a_substitution_and_an_addition_exports(tmp_path):
    # a substitution names its asset as standInAsset, never assetId
    sub = {"id": "C.00000002", "refId": "C.00000002", "standInAsset": "wall", "kit": "k",
           "positionM": [4.0, 0.0, 0.0], "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0}
    lo, hi = ex.cell_extent(_ADD_PLUGIN + [sub], _ADD_BOUNDS)
    assert hi[0] > 4.0 + 3.0  # the stand-in's own bounds widen the cell
    (tmp_path / "C.json").write_text(json.dumps({"schemaVersion": 1, "cellId": "C",
                                                 "additions": [_row(pos=(7.5, 0.8, 1.0))]}))
    added = ex.load_additions("C", _ADD_PLUGIN + [sub], _ADD_KITS, _ADD_BOUNDS, directory=tmp_path)
    assert [a["id"] for a in added] == ["C:add:table-candle"]


def test_no_additions_file_adds_nothing(tmp_path):
    assert ex.load_additions("C", _ADD_PLUGIN, _ADD_KITS, _ADD_BOUNDS, directory=tmp_path) == []


def test_xrds_override_only_when_plausible():
    """XRDS overrides the LIGH radius only when positive and at least a quarter of
    the base; KotM's negative (-65.3, KeebaHouseElder) and sliver (26.5 units,
    Lilmoth hearths) values fall back to the base record's radius."""
    assert ex.light_radius_units(None, 384) == 384
    assert ex.light_radius_units(0.0, 384) == 384
    assert ex.light_radius_units(-65.265, 384) == 384
    assert ex.light_radius_units(26.533, 384) == 384
    assert ex.light_radius_units(float("nan"), 256) == 256
    assert ex.light_radius_units(325.075, 256) == 325.075
    assert ex.light_radius_units(104.169, 384) == 104.169


def _xcll(ambient=(10, 20, 30), cube=((1, 1, 1),) * 6, fade=(256.0, 512.0), inherits=0):
    import struct
    head = struct.pack("<4B4B4Bff ii fff", *ambient, 0, 50, 50, 50, 0, 9, 9, 9, 0,
                       64.0, 6400.0, 0, 0, 1.0, 0.0, 1.0)
    block = b"".join(struct.pack("<4B", *c, 0) for c in cube) + struct.pack("<4Bf", 5, 6, 7, 0, 0.5)
    tail = struct.pack("<4Bf ff I", 3, 3, 3, 0, 1.0, *fade, inherits)
    return head + block + tail


def test_the_ambient_cube_is_read_in_game_axes():
    # Skyrim X+ X- Y+(north) Y-(south) Z+(up) Z-(down)
    cube = ((255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 255, 255), (0, 0, 0))
    got = ex.resolve_lighting(_xcll(cube=cube), None, None, None)
    c = got["ambientCube"]
    assert c["px"] == [1.0, 0.0, 0.0] and c["nx"] == [0.0, 1.0, 0.0]
    assert c["py"] == [1.0, 1.0, 1.0] and c["ny"] == [0.0, 0.0, 0.0]   # game up = Skyrim Z+
    assert c["nz"] == [0.0, 0.0, 1.0] and c["pz"] == [1.0, 1.0, 0.0]   # game -z = north = Skyrim Y+
    assert got["raw"]["ambientCubeSkyrimRGB"]["zp"] == [255, 255, 255]
    assert got["specularRGB"] == [5, 6, 7] and got["fresnelPower"] == 0.5
    assert (got["lightFadeBeginM"], got["lightFadeEndM"]) == (round(256 / ex.UNITS_PER_METRE, 3),
                                                             round(512 / ex.UNITS_PER_METRE, 3))
    assert abs(ex.ambient_cube({k: [128, 128, 128] for k in ex._CUBE_KEYS})["py"][0] - 0.21586) < 1e-4  # sRGB -> linear


def test_the_ambient_cube_and_light_fade_inherit_from_the_template_dalc():
    import struct
    tdata = _xcll(fade=(1000.0, 2000.0))[:40] + b"\0" * 32 + _xcll(fade=(1000.0, 2000.0))[72:]
    dalc = b"".join(struct.pack("<4B", 100, 100, 100, 0) for _ in range(6)) + struct.pack("<4Bf", 1, 2, 3, 0, 1.0)
    own = _xcll(cube=((200, 200, 200),) * 6, inherits=0)
    kept = ex.resolve_lighting(own, tdata, dalc, "T")
    assert kept["raw"]["ambientCubeSkyrimRGB"]["xp"] == [200, 200, 200] and kept["template"] == "T"
    both = ex.resolve_lighting(_xcll(cube=((200, 200, 200),) * 6, inherits=1 | (1 << 10)), tdata, dalc, "T")
    assert both["raw"]["ambientCubeSkyrimRGB"]["xp"] == [100, 100, 100] and both["specularRGB"] == [1, 2, 3]
    assert both["lightFadeEndM"] == round(2000 / ex.UNITS_PER_METRE, 3)
    none = ex.resolve_lighting(None, tdata, dalc, "T")  # no XCLL: everything from the template
    assert none["ambientCube"]["py"] == ex.ambient_cube({k: [100, 100, 100] for k in ex._CUBE_KEYS})["py"]
    assert "ambientCube" not in ex.resolve_lighting(None, None, None, None)


def test_separate_takes_two_coplanar_pieces_apart_by_five_mm():
    """16k walk 6: two plugin pieces on one plane z-fight; the export moves
    the later one 5 mm along the shared normal and records the row."""
    import numpy as np
    from worldgen import coplanar as cp
    quad = np.array([[[-.5, 0, -.5], [.5, 0, -.5], [.5, 0, .5]], [[-.5, 0, -.5], [.5, 0, .5], [-.5, 0, .5]]])

    class Geo:
        def load(self, kit, assets):
            pass

        def get(self, kit, asset):
            return quad, np.zeros(2, np.uint8)

    bundle = {"placements": [{"id": f"C.{i}", "kit": "k", "assetId": "floor", "positionM": [0.0, 0.0, 0.0],
                              "rotationDeg": [0, 0, 0]} for i in (2, 1)]}
    rows = cp.separate(bundle, Geo())
    assert [(r["id"], r["against"], r["overlapM2"]) for r in rows] == [("C.2", "C.1", 1.0)]
    assert abs(bundle["placements"][0]["positionM"][1]) == 0.005 == abs(rows[0]["nudgeM"][1])
    assert cp.separate(bundle, Geo()) == []


def test_export_keeps_the_ambient_cube_lift(monkeypatch):
    """export_bundle hands the floor nodes to the light rule, so a dark cube cell
    (MugsumpHollowInt01, plugin cube 95 % dark) is re-exported lifted (vol10 chunk 3)."""
    from worldgen import interior_light as il
    path = ex.OUT_DIR / "MugsumpHollowInt01.json"
    if not path.exists():
        pytest.skip("no bundles published")
    bundle = _load(path)
    bundle["ambient"] = {"colorRGB": bundle["ambient"]["colorRGB"], "intensity": 1.0, "rule": "ambient-cube"}
    try:
        nodes = il.floor_nodes(bundle)
    except FileNotFoundError as exc:  # pragma: no cover - no kit build on the runner
        pytest.skip(f"raw kits not built: {exc}")
    seen = []
    real = il.apply_light_rule
    monkeypatch.setattr(il, "apply_light_rule", lambda b, lights, n=None: seen.append(n) or real(b, lights, n))
    monkeypatch.setattr(il, "floor_nodes", lambda b: nodes)
    monkeypatch.setattr(ex, "export_cell", lambda *a, **k: bundle)
    monkeypatch.setattr("worldgen.interior_cells.profile_cell", lambda *a, **k: {})
    monkeypatch.setattr("worldgen.interior_cells.world_for", lambda *a, **k: None)
    monkeypatch.setattr("worldgen.coplanar.drop_duplicates", lambda b: [])
    monkeypatch.setattr("worldgen.coplanar.separate", lambda b, g: [])
    monkeypatch.setattr("worldgen.coplanar.bundle_mesh", lambda p: (None, None))
    monkeypatch.setattr("worldgen.coplanar.pieces_from_bundle", lambda *a: [])
    monkeypatch.setattr("worldgen.interior_support.settle", lambda *a: [])
    out = ex.export_bundle("x.esp", "MugsumpHollowInt01", ({}, {}, {}), {}, {}, None, None, object())
    assert seen and seen[0] is nodes
    assert out["ambient"]["rule"] == "ambient-cube-lifted"
    assert out["ambient"]["intensity"] == pytest.approx(2.858, abs=1e-3)
