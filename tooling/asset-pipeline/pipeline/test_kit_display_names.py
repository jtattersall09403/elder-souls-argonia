"""Manifest `displayName` rule: authored kit-config name wins, else the NIF stem."""
from pipeline.build_kit import apply_display_names, display_name_from_id

EXPECTED = {
    "kotm:argonia/mudhuts/mudhut02": "Mudhut 02",
    "vanilla:architecture/farmhouse/interior/farmintwall01": "Farmintwall 01",
    "mudmother:gv_meshes/argoniannest/fxhistmist01": "Fxhistmist 01",
    "bmv:architecture/citebosmer/trees/treegiantbranche3": "Treegiantbranche 3",
    "kotm:argonia/blackwood/housepartionwallwide": "Housepartionwallwide",
    "kotm:argonia/clutter/vase03": "Vase 03",
    "vanilla:clutter/wallbasketlarge01": "Wallbasketlarge 01",
    "vanilla:clutter/hay/hayscatter06": "Hayscatter 06",
    "kotm:argonia/clutter/WoodPlank_Long": "Wood plank long",
    "ayleidcc:sarthesarai/dungeons/ayleidruins/interior/arplatmid01": "Arplatmid 01",
}


def test_stem_rule():
    for asset_id, name in EXPECTED.items():
        assert display_name_from_id(asset_id, edid="") == name, asset_id


EDIDS = {
    "ExteriorWoodenTable01": "Exterior wooden table 01",
    "HayScatter06": "Hay scatter 06",
    "MudHut02": "Mud hut 02",
    "WRFenceBase4Way01": "WR fence base 4 way 01",
    "CampTentLarge": "Camp tent large",
    "ImpWallSconceCandle01": "Imp wall sconce candle 01",
}


def test_edid_rule():
    for edid, name in EDIDS.items():
        assert display_name_from_id("x:any/stem", edid=edid) == name, edid


def test_authored_name_wins_and_rerun_is_stable():
    summary = {"assets": [{"id": "test:none/hayscatter06"},
                          {"id": "test:none/vase03"}]}
    kit = {"assets": [{"asset": "test:none/vase03", "displayName": "Clay vase"}]}
    assert apply_display_names(summary, kit) == 2
    assert [r["displayName"] for r in summary["assets"]] == ["Hayscatter 06", "Clay vase"]
    assert apply_display_names(summary, kit) == 0


def test_unreadable_edid_falls_back_to_stem():
    for edid in ("01tree4", "00GVFxHistTreeMist", "01tropicalshrub_DUPLICATE001",
                 "CIPHTBMVillKothPlanks6", "BSKArgMudHut01", "BMSwampHouse",
                 "ccBGSSSE025ClutterTub", "ALPAClutterBasket01"):
        assert display_name_from_id("x:a/cedartree3", edid=edid) == "Cedartree 3", edid
    assert display_name_from_id("x:a/cedartree3", edid="OldImpSewerGrate") == "Old imp sewer grate"
