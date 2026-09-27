"""16k r8 rulings on the r7 and remine-r2 recommendations (miner side).

(1) a full `mine_mounts` write keeps what `mine_effect_sockets --merge`
    wrote (the record's `effectSockets` and the blank-board pairs);
(2) a child hung from a hook or arm parent is sourced `hook`;
(3) the designed-sink spread check and floor tell (genericwell01), clutter
    out of the abuts family pairs, and route-structure template citations.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from . import mine_mounts as mm

REPO = Path(__file__).resolve().parents[3]

BOARD_PAIR = {"kind": "points", "child": "bmv:roadsignlarge01l",
              "parent": "vanilla:clutter/signage/roadsigns/roadsignpost", "parentScale": 1.0,
              "n": 4, "evidence": "plugin", "mountClass": "wall", "twinOf": "vanilla:clutter/signage/roadsigns/x",
              "twinMaxDiffM": 0.0005,
              "points": [{"offsetM": [0.0, 0.0, 2.0], "n": 4, "yawDeg": 90.0}],
              "offsetM": [0.0, 0.0, 2.0], "yawDeg": 90.0}
MINED_PAIR = {"kind": "points", "child": "vanilla:clutter/lantern", "parent": "vanilla:post",
              "parentScale": 1.0, "n": 5, "evidence": "plugin",
              "points": [{"offsetM": [0.0, 0.1, 1.0], "n": 5}], "offsetM": [0.0, 0.1, 1.0]}


def _fresh_document() -> dict:
    return {"schemaVersion": 1, "anchors": {}, "pairs": [dict(MINED_PAIR)],
            "pairKindCounts": {"points": 1}, "distinctPoses": 1, "candidatePairs": 1,
            "anchorClassCounts": {}}


def test_a_full_mounts_run_keeps_the_effect_sockets_and_board_pairs(tmp_path, monkeypatch):
    out = tmp_path / "kit-mounts-mined.json"
    sockets = {"sockets": {"fire": {"vanilla:clutter/imperial/impbrazier01": {"n": 7}}}}
    out.write_text(json.dumps({"schemaVersion": 1, "anchors": {}, "effectSockets": sockets,
                               "pairs": [dict(MINED_PAIR), dict(BOARD_PAIR)]}))
    monkeypatch.setattr(mm, "kit_assets", lambda *a: {})
    monkeypatch.setattr(mm, "build_document", lambda *a, **k: _fresh_document())
    assert mm.main(["--out", str(out), "--quiet"]) == 0
    got = json.loads(out.read_text())
    assert got["effectSockets"] == sockets
    assert [p["child"] for p in got["pairs"]] == [BOARD_PAIR["child"], MINED_PAIR["child"]]
    assert got["pairKindCounts"] == {"points": 2}


def test_a_per_asset_merge_keeps_the_board_pairs():
    record = {"anchors": {BOARD_PAIR["parent"]: {"anchorClass": "ground", "anchorClassEvidence": "plugin", "n": 58}},
              "effectSockets": {"sockets": {}},
              "pairs": [dict(MINED_PAIR), dict(BOARD_PAIR)]}
    doc = {"anchors": {}, "pairs": []}
    merged = mm.merge_assets(record, doc, {BOARD_PAIR["child"], MINED_PAIR["child"]})
    assert [p["child"] for p in merged["pairs"]] == [BOARD_PAIR["child"]]
    assert merged["effectSockets"] == {"sockets": {}}


def test_a_board_pair_takes_its_yaw_from_the_designer():
    from . import mine_effect_sockets as mes
    row = {"boards": {"roadsign01.nif": {"offsetM": [0.0, 0.0, 2.1], "n": 9, "yawDeg": 211.0}}}
    pair, = mes.board_pairs({"bmv:b": {"twinOf": "roadsign01.nif", "maxDiffM": 0.001,
                                       "withinTol": True}}, row)
    assert pair["yawBy"] == "designer" and pair["mountClass"] == "wall"
    assert "yaw" in pair["evidenceNote"] and "designer" in pair["evidenceNote"]
    assert pair["offsetM"] == [0.0, 0.0, 2.1]


# --------------------------------------------------------------------------- #
# (2) hook ruling
# --------------------------------------------------------------------------- #
def test_hook_and_arm_parents_are_the_hook_family():
    for pid in ("plugin-static:clutter/hook01.nif", "vanilla:clutter/hook01",
                "plugin-static:clutter/tf_morrowclutter/lhook02.nif",
                "plugin-static:dungeons/chains/chainhook01.nif",
                "bmv:architecture/phitt/aldredanyia/signpost"):
        assert mm.is_hook_parent(pid), pid
    for pid in ("vanilla:dungeons/mines/clutter/minewoodbeam02",
                "vanilla:clutter/signage/roadsigns/roadsignpost",
                "plugin-static:dungeons/ship/questitems/shipanchorchain01.nif"):
        assert not mm.is_hook_parent(pid), pid


def test_a_child_hangs_from_a_hook_by_its_top_fifth():
    child = np.array([[0, 0, 0.0], [0.2, 0.2, 1.0]])
    assert mm.hangs_by_top_share(np.array([[0.1, 0.1, 0.85]]), child)
    assert not mm.hangs_by_top_share(np.array([[0.1, 0.1, 0.5]]), child)


def test_a_hook_patch_makes_the_reference_hanging_from_a_hook():
    from types import SimpleNamespace
    hook = "plugin-static:clutter/hook01.nif"
    child = SimpleNamespace(door=False, on_water=False, below_land=False, interior=False,
                            shell=False, floor=None, water_column=False, land=None,
                            origin_m=np.zeros(3), rotation=np.eye(3), scale=1.0,
                            links=[("k", hook, False, ((0, 0, 0), 0, 1), False, False, False,
                                    False)])
    got = mm.classify_reference(child, {"k": ("hook", 12, "side")},
                                np.array([[0, 0, 0.0], [0.2, 0.2, 1.0]]))
    assert got[0] == "hanging" and got[3] == "hook"
    assert [p for p, _row in got[1]] == [hook]


def test_a_pair_on_a_hook_parent_is_marked_hook():
    pairs = [{"child": "a", "parent": "bmv:architecture/phitt/aldredanyia/signpost"},
             {"child": "a", "parent": "vanilla:dungeons/mines/clutter/minewoodbeam02"}]
    mm.mark_hook_pairs(pairs)
    assert [p.get("hangingFrom") for p in pairs] == ["hook", None]


# --------------------------------------------------------------------------- #
# (3) genericwell01: the spread check and the floor tell
# --------------------------------------------------------------------------- #
WELL = "vanilla:dungeons/mines/clutter/genericwell01"
WELL_KIT = {"category": "dungeon-kit", "sizeM": [4.599, 4.599, 4.668],
            "originOffsetM": [2.3, 2.3, 3.986]}
WELL_SHAFT_TELL = {"type": "mesh", "tell": "floor-plane", "valueM": -3.9857}


def test_a_reference_clear_of_the_ground_does_not_make_the_well_a_spread_row():
    """Valenwood.esp 0x60c82b7 stands the well 0.07 m into its ground; the one
    Skyrim.esm reference (0x5a646) stands 10.77 m above LAND and must not
    turn the row into plugin-spread (whose tell read the shaft bottom)."""
    from . import mine_designed_sink as ds
    entry = ds.AssetSamples(sink=[-10.7742, -0.0732, -0.0067], slope_deg=[5.0, 3.0, 2.0])
    assets = ds.summarise({WELL: entry})
    ds.complete_record(assets, {WELL: WELL_KIT}, {WELL: dict(WELL_SHAFT_TELL)}, bases={})
    row = assets[WELL]
    assert row["evidence"] == "plugin"
    assert abs(row["p50"] - (-0.0732)) < 1e-6


def test_the_tracked_record_seats_the_well_on_its_head():
    rec = json.loads((REPO / "world/sources/placement/kit-designed-sink.json").read_text())
    row = rec["assets"][WELL]
    assert row["evidence"] == "plugin" and abs(row["p50"] - (-0.07)) < 0.05, row


def test_a_thin_floor_plane_tell_is_kept(monkeypatch):
    """Planner ruling (16k fix 2 layout pre-step): the 4 % floor-tell rule is
    dropped. It rejected five real pieces (two walkway spans, the ferry raft,
    the cart canopy); the grounded-spread fix alone seated the well."""
    import sys
    from . import mine_designed_sink as ds
    sys.path.insert(0, str(ds.RAW_KITS_DIR.parents[1]))
    import pipeline.mesh_ground_line as mgl
    thin = {"bmv:passl128d01": {"type": "mesh", "tell": "floor-plane", "valueM": -0.2}}
    monkeypatch.setattr(mgl, "measure_mesh_tells", lambda raw: dict(thin))
    monkeypatch.setattr(ds, "floor_shares", lambda raw, assets: {a: 0.0081 for a in assets},
                        raising=False)
    assert ds.raw_mesh_tells() == thin


def test_loose_clutter_leaves_the_abuts_family_pairs():
    from . import mine_abuts as ab
    kits = {"vanilla:clutter/barrel01": {"category": "container"},
            "vanilla:clutter/barrel02": {"category": "clutter"},
            "vanilla:clutter/stockade/stockadescaffoldtop0sided": {"category": "clutter"},
            "vanilla:architecture/wall01": {"category": "architecture"}}
    fam = [{"parent": ab.family_of(a), "child": ab.family_of(a)} for a in sorted(kits)]
    kept = ab.drop_loose_clutter(fam, kits)
    assert sorted(p["parent"] for p in kept) == sorted(
        ab.family_of(a) for a in kits if "barrel" not in a)


def test_the_record_has_no_loose_clutter_family_pair():
    from . import mine_abuts as ab
    rec = json.loads((REPO / "world/sources/placement/kit-assemblies-mined.json").read_text())
    fam = rec["abuts"]["familyPairs"]
    assert ab.drop_loose_clutter(fam, ab.kit_rows()) == fam


def test_every_template_id_the_route_structures_cite_is_in_the_record():
    import re
    src = (Path(__file__).parent / "compile_route_structures.py").read_text()
    cited = set(re.findall(r'"([a-z-]+:t\d{4})"', src))
    rec = json.loads((REPO / "world/sources/placement/kit-assemblies-mined.json").read_text())
    ids = {t["id"] for s in rec["sets"].values() for t in s.get("templates", [])}
    assert cited and not cited - ids, sorted(cited - ids)
