"""The fire layer (16k walk 4): flames mined from the NIF blocks, glow discs as
sprites, palette-baked flame textures, additive COLOR_0.

Expected answers, written before the first run (orient-fire.md, NIF dumps
2026-09-28; glTF Y-up metres from the pivot, METRES_PER_UNIT 0.014224):
- candlelanternwithcandle01: 2 flames (the two AddOnNode49) at
  (0.009, 0.093, 0.024) and (-0.012, 0.065, -0.037), fx:candleflame01;
- candlehornfloor01: 4 flames, 1.806 m up, 0.305 m from the centre;
- ArgonianCandle01 (Mud Mother, bsVersion 100): 1 at (-0.002, 1.837, 0.338);
- impwallsconcecandle01: 1;
- campfire01burning: FlamesSmall03 at (0, 0.114, 0), fxfireatlas02 through
  gradfireexplosion; plus Firearticles (the flame-column loop, its
  BSPSysSubTexModifier 64 frames over 1 s) at the pivot; Glow02:0 is a
  billboard glow; smoke02 is no flame;
- torchsconce01: 1 at pFireballCore04 (0, 0.457, -0.247); AddOnNode07
  (MPSTorchEmbers01) is no flame;
- impbrazier01: 0 (its flame is a separately placed fxfirewithembers01).
"""
import json
from pathlib import Path

import numpy as np
import pytest

from . import build_kit as bk
from . import nif_blocks as nb

REPO = Path(__file__).resolve().parents[3]
PUBLISHED = REPO / "apps/world-studio/public/kits"
DATA = bk.DEFAULT_VAULT / "skyrim-source/Data"
MUD = (bk.DEFAULT_VAULT / "skyrim-source/mod-sources/mud-mother-grove-146557/extracted"
       / "Meshes/GV_Meshes/ArgonianNest/ArgonianCandle01.nif")
needs_vault = pytest.mark.skipif(not (DATA / "Skyrim.esm").is_file(), reason="vault absent")

SAMPLE = {
    "meshes/clutter/common/candlelanternwithcandle01.nif":
        [((0.009, 0.093, 0.024), "fx:candleflame01"), ((-0.012, 0.065, -0.037), "fx:candleflame01")],
    "meshes/clutter/imperial/impwallsconcecandle01.nif": [(None, "fx:candleflame01")],
    str(MUD): [((-0.002, 1.837, 0.338), "fx:candleflame01")],
    "meshes/clutter/woodfires/campfire01burning.nif":
        [((0.0, 0.114, 0.0), "fx:fxfireatlas02-gradfireexplosion"),
         ((0.0, 0.0, 0.0), "fx:fxfirecolumnanimloop-gradfireexplosion")],
    "meshes/clutter/common/torchsconce01.nif": [((0.0, 0.457, -0.247), "fx:fxfireatlas04-gradflame01")],
    "meshes/clutter/imperial/impbrazier01.nif": [],
}


@pytest.fixture(scope="module")
def mesh_reader():
    from .bsa import BSAArchive
    archive = BSAArchive(DATA / "Skyrim - Meshes.bsa")
    return lambda path: Path(path).read_bytes() if path.startswith("/") else archive.read(path)


@pytest.fixture(scope="module")
def addn():
    return nb.read_addn((DATA / "Skyrim.esm").read_bytes())


@needs_vault
@pytest.mark.parametrize("nif", list(SAMPLE))
def test_the_sample_mines_the_expected_flames(nif, mesh_reader, addn):
    layer = bk.mine_fire_layer(mesh_reader(nif), addn, mesh_reader)
    want = SAMPLE[nif]
    got = layer["flames"]
    assert len(got) == len(want), [f["source"] for f in got]
    for flame, (at, texture) in zip(got, want):
        assert bk.flame_texture_id(flame["texturePath"], flame["palette"]) == texture
        if at is not None:
            assert flame["offsetM"] == pytest.approx(at, abs=0.004)


@needs_vault
def test_the_horn_candelabrum_has_four_wicks_on_a_ring(mesh_reader, addn):
    flames = bk.mine_fire_layer(mesh_reader("meshes/clutter/candles/candlehornfloor01.nif"),
                                addn, mesh_reader)["flames"]
    assert len(flames) == 4
    for f in flames:
        x, y, z = f["offsetM"]
        assert y == pytest.approx(1.806, abs=0.004)
        assert (x * x + z * z) ** 0.5 == pytest.approx(0.305, abs=0.004)


@needs_vault
def test_campfire_glow_disc_is_a_billboard_glow_and_the_column_loop_plays_its_frames(mesh_reader, addn):
    layer = bk.mine_fire_layer(mesh_reader("meshes/clutter/woodfires/campfire01burning.nif"),
                               addn, mesh_reader)
    assert [g["shape"] for g in layer["glowShapes"]] == ["Glow02:0"]
    column = bk.flame_record(layer["flames"][1], lambda _: (8, 8))
    assert (column["atlas"], column["fps"]) == ([8, 8], 64.0)
    small = bk.flame_record(layer["flames"][0], lambda _: (4, 2))
    assert small["atlas"] == [4, 2] and small["fps"] == pytest.approx(1 / 0.4667, abs=0.01)


@needs_vault
@pytest.mark.parametrize("texture,grid", [("candleflame01", [2, 2]), ("fxfireatlas02", [4, 2]),
                                          ("fxfireatlas04", [1, 8]), ("fxfirecolumnanimloop", [8, 8]),
                                          ("glowslightflash", [1, 1])])
def test_atlas_grids_are_measured_from_the_gutters(texture, grid):
    image, _, _ = bk.effect_texture_rgba(f"textures/effects/{texture}.dds", bk.DEFAULT_VAULT, True)
    assert bk.atlas_from_gutters(image) == grid


def test_atlas_from_gutters_on_a_drawn_grid():
    img = np.zeros((8, 16, 4), dtype=np.uint8)
    for cx in range(4):
        for cy in range(2):
            img[cy * 4 + 1:cy * 4 + 4, cx * 4 + 1:cx * 4 + 4] = 255
    assert bk.atlas_from_gutters(img) == [4, 2]
    assert bk.atlas_from_gutters(np.full((8, 8, 4), 255, dtype=np.uint8)) == [1, 1]


def test_bake_palette_maps_grey_through_the_row_and_multiplies_alpha():
    grey = np.array([[[0, 0, 0, 255], [255, 255, 255, 128]]], dtype=np.uint8)
    palette = np.zeros((64, 2, 4), dtype=np.uint8)
    palette[bk.PALETTE_ROW] = [[10, 20, 30, 0], [200, 100, 50, 255]]
    out = bk.bake_palette(grey, palette)
    assert out[0, 0].tolist() == [10, 20, 30, 0]
    assert out[0, 1].tolist() == [200, 100, 50, 128]


def _blender_pixels(image) -> list[float]:
    """An RGBA PIL image as Blender's `image.pixels`: floats, bottom row first."""
    arr = np.asarray(image, dtype=np.uint8)[::-1]
    return (arr.astype(np.float64) / 255.0).ravel().tolist()


def _per_texel_bake(src, pal, pw, ph, alpha_from_palette):
    """The per-texel loop effect_materials.bake_palette_image ran before the
    review 5536a1d9 fix: the reference its numpy path must match byte for byte."""
    prow = max(0, ph - 1 - min(bk.PALETTE_ROW, ph - 1))
    base = prow * pw * 4
    out = [0.0] * len(src)
    for i in range(0, len(src), 4):
        grey = (src[i] + src[i + 1] + src[i + 2]) / 3.0
        u = min(pw - 1, max(0, int(round(grey * (pw - 1)))))
        p = base + u * 4
        out[i] = pal[p]; out[i + 1] = pal[p + 1]; out[i + 2] = pal[p + 2]
        out[i + 3] = src[i + 3] * (pal[p + 3] if alpha_from_palette else 1.0)
    return out


@needs_vault
@pytest.mark.parametrize("alpha_from_palette", [True, False])
def test_card_palette_bake_is_byte_identical_to_the_per_texel_loop(alpha_from_palette):
    import sys
    sys.path.insert(0, str(Path(__file__).parent / "blender"))
    from effect_materials import bake_palette_pixels
    grey, _, _ = bk.effect_texture_rgba("textures/effects/candleflame01.dds", bk.DEFAULT_VAULT, True)
    palette, _, _ = bk.effect_texture_rgba("textures/effects/gradients/gradflame01.dds",
                                           bk.DEFAULT_VAULT, True)
    src, pal = _blender_pixels(grey), _blender_pixels(palette)
    before = _per_texel_bake(src, pal, palette.size[0], palette.size[1], alpha_from_palette)
    after = bake_palette_pixels(src, grey.size, pal, palette.size, alpha_from_palette)
    to_bytes = lambda px: np.rint(np.asarray(px, dtype=np.float64) * 255.0).astype(np.uint8).tobytes()
    assert len(after) == len(before)
    assert to_bytes(after) == to_bytes(before)


def test_additive_primitives_take_the_real_vertex_colour_as_color_0():
    gltf = {"materials": [{"name": "flame"}, {"name": "wood"}], "meshes": [{"primitives": [
        {"material": 0, "attributes": {"POSITION": 0, "COLOR_0": 1, "COLOR_1": 2}},
        {"material": 1, "attributes": {"POSITION": 3, "COLOR_0": 4, "COLOR_1": 5}}]}]}
    assert bk.remap_additive_vertex_colours(gltf, {"flame"}) == 1
    first, second = gltf["meshes"][0]["primitives"]
    assert first["attributes"] == {"POSITION": 0, "COLOR_0": 2}
    assert second["attributes"] == {"POSITION": 3, "COLOR_0": 4, "COLOR_1": 5}


FIRE_PIECES = {
    ("settlement-imperial-v1", "vanilla:clutter/common/candlelanternwithcandle01"): 2,
    ("settlement-imperial-v1", "vanilla:clutter/imperial/impwallsconcecandle01"): 1,
    ("settlement-mud-v1", "mudmother:gv_meshes/argoniannest/argoniancandle01"): 1,
    ("works-v1", "vanilla:clutter/woodfires/campfire01burning"): 2,
    ("works-v1", "vanilla:clutter/imperial/impbrazier01"): 0,
}


@pytest.mark.parametrize("kit,asset", list(FIRE_PIECES))
def test_published_fire_pieces_carry_their_flames(kit, asset):
    manifest = json.loads((PUBLISHED / f"{kit}.kit.json").read_text())
    row = next(r for r in manifest["assets"] if r["id"] == asset)
    assert len(row.get("flames", [])) == FIRE_PIECES[(kit, asset)]
    rows = json.loads((PUBLISHED / f"{bk.FLAME_TEXTURE_KIT}.kit.json").read_text())["effectTextures"]
    for item in row.get("flames", []) + row.get("glows", []):
        assert item["texture"] in rows, item["texture"]


def test_the_campfire_glow_disc_ships_as_a_sprite_not_a_card():
    manifest = json.loads((PUBLISHED / "works-v1.kit.json").read_text())
    row = next(r for r in manifest["assets"] if r["id"] == "vanilla:clutter/woodfires/campfire01burning")
    assert [g["texture"] for g in row.get("glows", [])] == ["fx:glowslightflash"]
    assert not any(m.startswith("Glow02") for m in row.get("additiveMaterials", []))


def test_a_glow_disc_offset_along_its_thin_axis_faces_the_viewer():
    # campfire Glow02:0 as the Blender half measures it (works-v1, 2026-09-28)
    shape = {"centreM": [0.0, 0.831, 0.841], "edgeM": 3.701, "extentM": [3.701, 2.16, 0.0]}
    assert bk.glow_record(shape, "fx:glowslightflash") == {
        "offsetM": [0.0, 0.831, 0.0], "sizeM": 3.701, "texture": "fx:glowslightflash",
        "towardCameraM": 0.841}


def test_the_palette_slot_is_never_the_surface():
    import sys
    sys.path.insert(0, str(Path(__file__).parent / "blender"))
    from effect_materials import is_palette_image

    class Image:
        def __init__(self, path):
            self.filepath, self.name = path, path.rsplit("/", 1)[-1]

    glow3 = {"BSShaderTextureSet_Greyscale": "textures\\effects\\FXGlowingEmbersPallet01.dds"}
    assert is_palette_image(glow3, Image("//data/textures/effects/FXGlowingEmbersPallet01.dds"))
    assert not is_palette_image(glow3, Image("//data/textures/clutter/woodfires/WoodFires01_g.dds"))
    assert is_palette_image({}, Image("//data/textures/effects/gradients/GradFlame01.dds"))


# The additive gain (walk 4 FIRE rec 2). Expected answers, written before the
# first run (NIF dumps 2026-09-28): fxfirewithembers01's flame card
# Flames02grant01:0 carries emissive multiple 1.6; campfire01burning's log
# overlays Glow:2 2.5 and Glow:3 1.6. Every additive material maps to a shape.
@needs_vault
@pytest.mark.parametrize("nif,expected", [
    ("meshes/effects/fxfirewithembers01.nif",
     {"Flames02grant01:0.Mat": 1.6, "L2_Flames02grant:0.Mat": None, "L2_Flames02grant:1.Mat": None,
      "L2_qhcoal04:0 - L2_CoalsBase:0.Mat": None}),
    ("meshes/clutter/woodfires/campfire01burning.nif", {"Glow:2.Mat": 2.5, "Glow:3.Mat": 1.6}),
])
def test_additive_gains_are_the_nif_shapes_emissive_multiple(nif, expected, mesh_reader):
    shaders = nb.effect_shape_shaders(nb.parse(mesh_reader(nif)))
    gains = bk.additive_gains(list(expected), shaders)
    assert set(gains) == set(expected)
    for name, value in expected.items():
        assert gains[name] > 0
        if value is not None:
            assert gains[name] == value


def test_an_additive_material_with_no_shape_refuses():
    with pytest.raises(RuntimeError, match="Nowhere:0.Mat"):
        bk.additive_gains(["Nowhere:0.Mat"], {"Glow:2": {"emissiveMultiple": 2.5}})


def test_blender_numeric_suffixes_resolve_to_the_same_shape():
    # Blender renames a repeated material `X.Mat.001` (imperial-keep ships them)
    shaders = {"Glow:2": {"emissiveMultiple": 2.5}}
    gains = bk.additive_gains(["Glow:2.Mat", "Glow:2.Mat.001", "Glow:2.Mat.012"], shaders)
    assert gains == {"Glow:2.Mat": 2.5, "Glow:2.Mat.001": 2.5, "Glow:2.Mat.012": 2.5}
    # a shape whose own NIF name ends in digits after a dot is not stripped
    assert bk.additive_gains(["Glow.2.Mat"], {"Glow.2": {"emissiveMultiple": 1.0}}) == {"Glow.2.Mat": 1.0}


def test_published_flame_cards_carry_their_gain():
    import struct
    data = (PUBLISHED / "works-v1.glb").read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    materials = {m["name"]: m for m in json.loads(data[20:20 + length])["materials"]}
    assert materials["Flames02grant01:0.Mat"]["extras"]["gain"] == 1.6
    assert materials["Glow:2.Mat"]["extras"]["gain"] == 2.5


def test_a_coloured_glow_disc_keeps_its_nif_colour_a_white_one_takes_the_fire_colour():
    # Expected before the run: the evil welkynd cluster's GlowMesh07 emissive
    # (0.5, 0, 0) ships as tintRgb; the campfire's white Glow02 ships none.
    shape = {"centreM": [0.0, 0.34, 0.0], "edgeM": 0.5, "extentM": [0.5, 0.5, 0.0]}
    assert bk.glow_record(shape, "fx:glowsoft01", [0.5, 0.0, 0.0, 1.0])["tintRgb"] == [0.5, 0.0, 0.0]
    assert "tintRgb" not in bk.glow_record(shape, "fx:glowslightflash", [1.0, 1.0, 1.0, 0.75])


def test_a_flame_above_its_piece_is_seated_on_the_top():
    # impcandle01: AddOnNode49 at 0.3234 m over a 0.272 m candle (walk 6)
    record = {"sizeM": [0.145, 0.148, 0.272], "originOffsetM": [0.072, 0.074, 0.0],
              "flames": [{"offsetM": [0.0009, 0.3234, 0.0002]}, {"offsetM": [0.0, 0.2, 0.0]}]}
    assert bk.seat_flames_on_geometry(record) == 1
    assert record["flames"][0] == {"offsetM": [0.0009, 0.272, 0.0002], "seatedFromM": 0.3234}
    assert record["flames"][1] == {"offsetM": [0.0, 0.2, 0.0]}
    assert bk.seat_flames_on_geometry(record) == 0
