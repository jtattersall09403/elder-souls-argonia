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


def rebuild_effect_material(material, images, is_diffuse):
    """An additive effect card (BSEffectShaderProperty) as a plain alpha material.

    The source texture keeps its alpha and exports as PNG; the caller marks
    the result additive (object or material extras) so the runtime draws it
    with additive blending, which glTF itself cannot express. Greyscale
    palette gradients are not the surface and are skipped when anything else
    is present. `is_diffuse` is the caller's support-map filter. Returns the
    source image, or None.
    """
    surface = [i for i in images if is_diffuse(i) and "gradients" not in (
        i.filepath or i.name).lower().replace("\\", "/")]
    source = surface[0] if surface else (images[0] if images else None)
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
    return source

