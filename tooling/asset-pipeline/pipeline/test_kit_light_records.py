"""Kit `light` blocks (mined Skyrim LIGH records) for the Claywater light
layer, and the manifest refresh that carries them (walk 2 integrate-lighting).

Expected values were mined 2026-09-27 from the plugins with the kits2
brazier method (the LIGH ref nearest each ref of the fixture STAT, same
cell, < 200 units; per-axis median offset in the piece frame, glTF Y-up m):
- candlelanternwithcandle01: Skyrim.esm DefaultCandleLight01NSDesat 00088241, 246 of 1393 refs;
- argoniancandle01: ArgonianLakeHouse.esl, Skyrim.esm Alikr_OrangeFlicker 00094e65, 1 of 2 refs;
- impbrazier01: Skyrim.esm DefaultTorch01NS 00088243, 35 of 262 refs (re-mined: offset x -0.08).
"""
import json
from pathlib import Path

import pytest

from .placement_metadata import KIT_CONFIG_DIR, refresh_built_manifests

REPO = Path(__file__).resolve().parents[3]
PUBLISHED = REPO / "apps/world-studio/public/kits"

MINED = {
    ("settlement-imperial-v1", "vanilla:clutter/common/candlelanternwithcandle01"):
        ("00088241", 256, [242, 240, 223], [0.03, 0.63, 0.05], "lantern"),
    ("settlement-mud-v1", "mudmother:gv_meshes/argoniannest/argoniancandle01"):
        ("00094e65", 256, [142, 104, 79], [0.17, 1.7, -0.1], "candle"),
    ("works-v1", "vanilla:clutter/imperial/impbrazier01"):
        ("00088243", 256, [197, 156, 112], [-0.08, 1.3, -0.18], "brazier"),
}


def _light(document: dict, asset_id: str, key: str) -> dict:
    rows = [row for row in document["assets"] if row.get(key) == asset_id]
    assert len(rows) == 1, asset_id
    return rows[0].get("light")


@pytest.mark.parametrize("kit,asset", list(MINED))
def test_claywater_light_layer_carries_the_mined_ligh_record(kit, asset):
    form_id, radius, rgb, offset, kind = MINED[(kit, asset)]
    config = json.loads((KIT_CONFIG_DIR / f"{kit}.json").read_text())
    published = json.loads((PUBLISHED / f"{kit}.kit.json").read_text())
    for light in (_light(config, asset, "asset"), _light(published, asset, "id")):
        assert light is not None, f"{kit} {asset}: no light block"
        assert (light["formId"], light["radiusUnits"], light["colourRgb"], light["fixtureKind"]) \
            == (form_id, radius, rgb, kind)
        assert light["offsetM"] == pytest.approx(offset, abs=0.011)
        assert light["evidence"]


def test_the_lantern_flame_seats_on_its_candle_top():
    """Walk 2 round 5: the flame sits on the candle submesh top measured in the
    kit GLB (CandleLanternWithCandle:7, y 0.103), not on the LIGH offset (0.63)."""
    kit, asset = "settlement-imperial-v1", "vanilla:clutter/common/candlelanternwithcandle01"
    config = json.loads((KIT_CONFIG_DIR / f"{kit}.json").read_text())
    published = json.loads((PUBLISHED / f"{kit}.kit.json").read_text())
    for light in (_light(config, asset, "asset"), _light(published, asset, "id")):
        assert light["flameOffsetM"] == pytest.approx([0.0037, 0.103, -0.0015], abs=0.002)
        assert light["flameEvidence"]


def test_refresh_copies_the_kit_config_light_block_and_drops_a_stale_one(tmp_path):
    configs = tmp_path / "configs"
    configs.mkdir()
    block = {"formId": "00088241", "burnSeconds": -1, "radiusUnits": 256,
             "colourRgb": [242, 240, 223], "flags": [], "offsetM": [0.03, 0.63, 0.05]}
    (configs / "settlement-mud-v1.json").write_text(json.dumps({"assets": [
        {"asset": "mudmother:gv_meshes/argoniannest/mudhut01", "light": block},
        {"asset": "mudmother:gv_meshes/argoniannest/argoniancandle01"}]}))
    built = tmp_path / "built"
    built.mkdir()
    manifest = built / "settlement-mud-v1.kit.json"
    base = {"sizeM": [1.0, 1.0, 1.0], "originOffsetM": [0.5, 0.5, 0.02]}
    manifest.write_text(json.dumps({"kit": "settlement-mud-v1", "assets": [
        dict(base, id="mudmother:gv_meshes/argoniannest/mudhut01"),
        dict(base, id="mudmother:gv_meshes/argoniannest/argoniancandle01", light={"formId": "old"})]}))
    assert refresh_built_manifests(built, mined={}, anchors={}, kit_config_dir=configs) == [manifest]
    assets = {row["id"]: row for row in json.loads(manifest.read_text())["assets"]}
    assert assets["mudmother:gv_meshes/argoniannest/mudhut01"]["light"] == block
    assert "light" not in assets["mudmother:gv_meshes/argoniannest/argoniancandle01"]
