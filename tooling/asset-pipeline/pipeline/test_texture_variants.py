"""Texture variants: the recipe is deterministic, local and shared by content."""

import numpy as np
import pytest
from PIL import Image

from . import build_kit, texture_variants as tv


def _leaf_card(size=64):
    """A green RGBA card: an opaque disc on transparent ground."""
    yy, xx = np.mgrid[:size, :size]
    disc = (xx - size / 2) ** 2 + (yy - size / 2) ** 2 < (size * 0.4) ** 2
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 1] = 120
    rgba[..., 0] = 40
    rgba[..., 3] = np.where(disc, 255, 0)
    return rgba, disc


def test_same_input_same_output():
    rgba, _ = _leaf_card()
    recipe = {"desaturate": 0.3, "patches": {"colour": [0.5, 0.5, 0.2], "amount": 0.6,
                                             "cover": 0.3, "sizePx": 16}}
    assert np.array_equal(tv.apply_recipe(rgba, recipe, "k"), tv.apply_recipe(rgba, recipe, "k"))


def test_tips_brown_the_edge_not_the_middle():
    rgba, disc = _leaf_card()
    out = tv.apply_recipe(rgba, {"tipColour": {"colour": [0.5, 0.3, 0.1], "widthPx": 4,
                                               "amount": 1.0}}, "k")
    centre, edge = out[32, 32], out[32, 32 - 25]   # 25 px from centre: within 4 px of the rim
    assert disc[32, 32 - 25]
    assert tuple(centre[:3]) == (40, 120, 0)        # the blade is untouched
    assert edge[0] > 40 and edge[1] < 120           # the rim moved toward brown


def test_tip_cover_limits_the_share():
    rgba, disc = _leaf_card(128)
    tip = {"colour": [0.5, 0.3, 0.1], "widthPx": 64, "amount": 1.0}
    full = tv.apply_recipe(rgba, {"tipColour": tip}, "k")
    part = tv.apply_recipe(rgba, {"tipColour": {**tip, "cover": 0.3, "sizePx": 24}}, "k")
    changed = lambda out: (out[..., :3] != rgba[..., :3]).any(axis=2)[disc].mean()
    assert changed(part) < 0.6 * changed(full)


def test_drop_clears_alpha_on_its_cover_and_alpha_is_otherwise_kept():
    rgba, disc = _leaf_card(128)
    out = tv.apply_recipe(rgba, {"drop": {"cover": 0.2, "sizePx": 16}}, "k")
    cleared = (out[..., 3] == 0)[disc].mean()
    assert 0.1 < cleared < 0.3
    kept = tv.apply_recipe(rgba, {"desaturate": 1.0}, "k")
    assert np.array_equal(kept[..., 3], rgba[..., 3])


def test_gain_dims():
    rgba, disc = _leaf_card()
    out = tv.apply_recipe(rgba, {"gain": 0.25}, "k")
    assert out[32, 32, 1] == 30


def test_unknown_key_is_refused():
    assert tv.validate("a:b", {"t.dds": {"blur": 2}})
    assert tv.validate("a:b", {})
    assert not tv.validate("a:b", {"t.dds": {"gain": 0.5}})


def test_equal_derivations_share_one_file(tmp_path):
    rgba, _ = _leaf_card()
    src = tmp_path / "textures" / "x" / "leaf.dds"
    src.parent.mkdir(parents=True)
    Image.fromarray(rgba, "RGBA").save(src.with_suffix(".png"))
    src.with_suffix(".png").rename(src)          # Pillow reads by content
    recipe = {"gain": 0.5}
    a = tv.derive_for_entry({"asset": "p:a-sick", "variantOf": "p:a",
                             "textureVariants": {"textures/x/Leaf.dds": recipe}}, tmp_path)
    b = tv.derive_for_entry({"asset": "p:b-sick", "variantOf": "p:b",
                             "textureVariants": {"textures\\x\\leaf.dds": recipe}}, tmp_path)
    assert a == b == {"textures/x/leaf.dds": tv.variant_path("textures/x/leaf.dds", recipe)}
    assert (tmp_path / a["textures/x/leaf.dds"]).is_file()
    other = tv.variant_path("textures/x/leaf.dds", {"gain": 0.6})
    assert other != a["textures/x/leaf.dds"]


def test_missing_source_texture_fails(tmp_path):
    with pytest.raises(FileNotFoundError):
        tv.derive_for_entry({"asset": "p:a-sick", "variantOf": "p:a",
                             "textureVariants": {"textures/none.dds": {"gain": 0.5}}}, tmp_path)


def test_a_variant_is_its_base_mesh():
    entry = {"asset": "p:tree-sick", "variantOf": "p:tree", "textureVariants": {}}
    assert build_kit._part_specs(entry) == [{"asset": "p:tree"}]


def test_the_sick_hist_variants_are_configured():
    """The mud kit ships the sick Hist and its dimmed flowers (16k walk 3 L5)."""
    import json
    kit = json.loads((build_kit.CONFIG / "settlement-mud-v1.json").read_text())
    variants = {e["asset"]: e for e in kit["assets"] if e.get("variantOf")}
    base = "histtree:skyfall/sleeping tree overhaul/"
    for name, of in (("ancient-sleeping-tree-sick", "ancient sleeping tree"),
                     ("histflower01-sick", "histflower01"), ("histflower02-sick", "histflower02")):
        entry = variants[base + name]
        assert entry["variantOf"] == base + of
        assert not tv.validate(entry["asset"], entry["textureVariants"])


def test_a_published_manifest_names_textures_by_source_never_a_shipped_file_name():
    """A variant's derived PNG ships only as KTX2 inside the GLB: its manifest
    row names the texture by its source, as every other row does, so the
    site's dangling-reference gate never looks for a file that is not there."""
    import json
    import re
    shipped = re.compile(r"\.(glb|gltf|ktx2|png|jpe?g|webp|bin|json)$", re.I)
    kits = build_kit.REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
    mud = json.loads((kits / "settlement-mud-v1.kit.json").read_text())
    rows = {a["id"]: a for a in mud["assets"]}
    sick = rows["histtree:skyfall/sleeping tree overhaul/ancient-sleeping-tree-sick"]
    assert sick["textures"] == rows["histtree:skyfall/sleeping tree overhaul/ancient sleeping tree"]["textures"]
    for path in sorted(kits.glob("*.kit.json")):
        for row in json.loads(path.read_text()).get("assets") or []:
            named = [t for t in row.get("textures") or [] if isinstance(t, str) and shipped.search(t)]
            assert not named, f"{path.name} {row['id']} names {named}"
