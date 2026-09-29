"""Effect-shader materials (BSEffectShaderProperty) for every headless builder.

Skyrim draws flames, smoke, glow shells and similar cards with an effect
shader: an unlit texture blended additively (or alpha-blended) over the scene.
glTF cannot express additive blending, so the builders rebuild such a material
as an alpha surface (glTF BLEND) and flag it `additive` for the runtime. One
implementation, shared by `build_weapons.py` (the lights set's torch glow) and
`build_kit.py` (a kit piece whose config sets `"effect": "additive"`), so the
two never drift.

Imported inside Blender: the caller puts this directory on `sys.path`.
"""
import sys
from pathlib import Path


def is_effect_material(material):
    """PyNifly stamps the NIF shader block on the material it imports."""
    return material.get("BS_Shader_Block_Name") == "BSEffectShaderProperty"


#: The PyNifly material property naming the effect shader's greyscale
#: palette (BSEffectShaderProperty "Greyscale Texture").
GREYSCALE_SLOT = "BSShaderTextureSet_Greyscale"
#: The palette row and the bake are pipeline/effect_palette.py's, the same
#: implementation the flame sprites use (build_kit.bake_palette).
_PIPELINE_DIR = str(Path(__file__).resolve().parent.parent)
if _PIPELINE_DIR not in sys.path:
    sys.path.append(_PIPELINE_DIR)
from effect_palette import PALETTE_ROW, bake_palette  # noqa: E402


def _image_path(image):
    return (image.filepath or image.name).lower().replace("\\", "/")


def _slot_stem(material, key):
    named = str(material.get(key) or "").lower().replace("\\", "/").strip()
    return named.rsplit("/", 1)[-1].rsplit(".", 1)[0] if named else ""


def is_palette_image(material, image):
    """The image fills the material's greyscale palette slot: a lookup table,
    never the surface (Glow:3 shipped its palette FXGlowingEmbersPallet01,
    which lives in textures/effects/ not gradients/, as its base colour)."""
    stem = _slot_stem(material, GREYSCALE_SLOT)
    path = _image_path(image)
    name = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return bool(stem) and name == stem or "/gradients/" in path


def bake_palette_pixels(src, size, pal, palette_size, alpha_from_palette):
    """Blender `pixels` (floats, bottom row first) of a greyscale card through
    its palette's row PALETTE_ROW from the top, as a flat float32 array: the
    8-bit bake of effect_palette.bake_palette, back in Blender's float form."""
    import numpy as np
    w, h = size
    pw, ph = palette_size
    to_u8 = lambda px, width, height: np.rint(
        np.asarray(px, dtype=np.float32).reshape(height, width, 4) * 255.0).astype(np.uint8)
    grey = to_u8(src, w, h)
    # Blender rows run bottom first; bake_palette counts rows from the top.
    palette = to_u8(pal, pw, ph)[::-1]
    baked = bake_palette(grey, palette, PALETTE_ROW, alpha_from_palette)
    return (baked.astype(np.float32) / 255.0).ravel()


def bake_palette_image(source, palette, alpha_from_palette):
    """A greyscale card through its palette as a new packed image: rgb from
    the palette row PALETTE_ROW at u = the texel's grey, alpha the texel's
    (times the palette's with GREYSCALE_ALPHA). Same rule and code as the
    sprite textures (effect_palette.bake_palette), done here because the
    card ships in the GLB."""
    import bpy
    import numpy as np
    w, h = source.size
    pw, ph = palette.size
    if not (w and h and pw and ph):
        return source
    src = np.empty(w * h * 4, dtype=np.float32)
    source.pixels.foreach_get(src)
    pal = np.empty(pw * ph * 4, dtype=np.float32)
    palette.pixels.foreach_get(pal)
    out = bake_palette_pixels(src, (w, h), pal, (pw, ph), alpha_from_palette)
    baked = bpy.data.images.new(f"{source.name}+{palette.name}", w, h, alpha=True)
    baked.pixels.foreach_set(out)
    baked.pack()
    return baked


def rebuild_effect_material(material, images, is_diffuse):
    """An additive effect card (BSEffectShaderProperty) as a plain alpha material.

    The source texture keeps its alpha and exports as PNG; the caller marks
    the result additive (object or material extras) so the runtime draws it
    with additive blending, which glTF itself cannot express. The image in
    the material's greyscale palette slot (or under gradients/) is never the
    surface; where the shader sets GREYSCALE_COLOR the surface is baked
    through it (bake_palette_image). `is_diffuse` is the caller's
    support-map filter. Returns the source image (before any bake), or None.
    """
    # The surface: a diffuse-looking image that is not the palette, else any
    # image that is not the palette (campfire Glow:2/Glow:3 draw
    # WoodFires01_g, whose `_g` suffix the support-map filter rejects).
    surface = [i for i in images if not is_palette_image(material, i)]
    palettes = [i for i in images if is_palette_image(material, i)]
    diffuse = [i for i in surface if is_diffuse(i)]
    source = original = (diffuse or surface or [None])[0]
    flags = str((material.get("pyn_shader") or {}).get("Shader_Flags_1", "")) \
        if hasattr(material.get("pyn_shader"), "get") else ""
    if source is not None and palettes and "GREYSCALE_COLOR" in flags:
        source = bake_palette_image(source, palettes[0], "GREYSCALE_ALPHA" in flags)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = 1.0
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    if source is not None:
        source.colorspace_settings.name = "sRGB"
        texture = tree.nodes.new("ShaderNodeTexImage")
        texture.image = source
        tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
        tree.links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
    if hasattr(material, "blend_method"):
        try:
            material.blend_method = "BLEND"
        except TypeError:
            pass
    return original

