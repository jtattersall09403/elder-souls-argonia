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


def is_effect_material(material):
    """PyNifly stamps the NIF shader block on the material it imports."""
    return material.get("BS_Shader_Block_Name") == "BSEffectShaderProperty"


#: The PyNifly material property naming the effect shader's greyscale
#: palette (BSEffectShaderProperty "Greyscale Texture").
GREYSCALE_SLOT = "BSShaderTextureSet_Greyscale"
#: The palette row a greyscale card is baked through: the same row, for the
#: same reason, as pipeline/build_kit.py PALETTE_ROW (the flame sprites).
PALETTE_ROW = 48


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


def bake_palette_image(source, palette, alpha_from_palette):
    """A greyscale card through its palette as a new packed image: rgb from
    the palette row PALETTE_ROW at u = the texel's grey, alpha the texel's
    (times the palette's with GREYSCALE_ALPHA). Same rule as the sprite
    textures (build_kit.bake_palette), done here because the card ships in
    the GLB."""
    import bpy
    w, h = source.size
    pw, ph = palette.size
    if not (w and h and pw and ph):
        return source
    src = list(source.pixels[:])
    pal = list(palette.pixels[:])
    # Blender pixels run bottom row first: row PALETTE_ROW from the top.
    prow = max(0, ph - 1 - min(PALETTE_ROW, ph - 1))
    base = prow * pw * 4
    out = [0.0] * len(src)
    for i in range(0, len(src), 4):
        grey = (src[i] + src[i + 1] + src[i + 2]) / 3.0
        u = min(pw - 1, max(0, int(round(grey * (pw - 1)))))
        p = base + u * 4
        out[i] = pal[p]; out[i + 1] = pal[p + 1]; out[i + 2] = pal[p + 2]
        out[i + 3] = src[i + 3] * (pal[p + 3] if alpha_from_palette else 1.0)
    baked = bpy.data.images.new(f"{source.name}+{palette.name}", w, h, alpha=True)
    baked.pixels[:] = out
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

