"""Headless Blender builder for a static Skyrim weapon GLB (Wine Blender 4.4.3).

Imports a weapon NIF via PyNifly, drops the sheathed scabbard shape, rebuilds
materials as clean diffuse Principled BSDF (same fix as the character), and
normalises scale to real metres while PRESERVING the NIF's native origin and
orientation (authored for the hand `WEAPON` node) so the game can attach it with
an identity transform. Env: BUILD_PLAN -> json with keys nif, drop, target_length,
output_glb, summary_json.
"""

import bpy
import json
import os
from mathutils import Vector, Matrix

PLAN = json.loads(open(os.environ["BUILD_PLAN"], "r", encoding="utf-8").read())
SUMMARY = {}

bpy.ops.preferences.addon_enable(module="io_scene_nifly")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

bpy.ops.import_scene.pynifly(
    filepath=PLAN["nif"],
    create_bones=False,
    import_tris=False,
    import_animations=False,
    import_collisions=False,
    blender_xf=True,
    rotate_bones_pretty=False,
)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]

# Drop the sheathed scabbard geometry (keep only the drawn sword).
drop = [d.lower() for d in PLAN.get("drop", [])]


def _sheath(obj):
    hay = obj.name.lower()
    for slot in obj.material_slots:
        if slot.material:
            hay += " " + slot.material.name.lower()
            if slot.material.use_nodes:
                for n in slot.material.node_tree.nodes:
                    if n.type == "TEX_IMAGE" and n.image:
                        hay += " " + os.path.basename(n.image.filepath or n.image.name).lower()
    return any(d in hay for d in drop)


kept = []
for obj in meshes:
    if _sheath(obj):
        bpy.data.objects.remove(obj, do_unlink=True)
    else:
        kept.append(obj)
print("[weapon] kept meshes:", [o.name for o in kept])

# Clean materials (diffuse-only Principled) so textures survive glTF export.
_MAP_SUFFIXES = ("_n", "_msn", "_s", "_sk", "_g", "_m", "_em", "_e")


def _is_diffuse(img):
    base = os.path.splitext(os.path.basename(img.filepath or img.name))[0].lower()
    return not base.endswith(_MAP_SUFFIXES)


for img in bpy.data.images:
    if img.source == "FILE" and img.filepath:
        try:
            img.reload()
        except RuntimeError:
            pass

seen = set()
for obj in kept:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or mat.name in seen:
            continue
        seen.add(mat.name)
        diffuse = None
        if mat.use_nodes:
            imgs = [n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
            diffuse = next((im for im in imgs if _is_diffuse(im)), None) or (imgs[0] if imgs else None)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Metallic"].default_value = 0.55
        bsdf.inputs["Roughness"].default_value = 0.4
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        if diffuse is not None:
            diffuse.colorspace_settings.name = "sRGB"
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = diffuse
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if hasattr(mat, "blend_method"):
            try:
                mat.blend_method = "OPAQUE"
            except TypeError:
                pass

bpy.ops.file.pack_all()

# Normalise scale to metres about the native origin (grip), preserving orientation.
bpy.context.view_layer.update()
mn = Vector((1e9, 1e9, 1e9))
mx = Vector((-1e9, -1e9, -1e9))
for obj in kept:
    for c in obj.bound_box:
        w = obj.matrix_world @ Vector(c)
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
size = mx - mn
longest = max(size.x, size.y, size.z)
scale = PLAN["target_length"] / longest if longest else 1.0

# Bake each mesh's world transform into its geometry, then scale to target
# metres about the native origin (the WEAPON-node attach point / grip). Done via
# mesh-data transforms to avoid headless operator/context quirks.
scale_matrix = Matrix.Scale(scale, 4)
for obj in kept:
    world = obj.matrix_world.copy()
    obj.data.transform(scale_matrix @ world)
    obj.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()

SUMMARY["keptMeshes"] = [o.name for o in kept]
SUMMARY["nativeSize"] = [round(size.x, 4), round(size.y, 4), round(size.z, 4)]
SUMMARY["scale"] = round(scale, 5)
SUMMARY["targetLength"] = PLAN["target_length"]

bpy.ops.object.select_all(action="DESELECT")
for obj in kept:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=PLAN["output_glb"],
    export_format="GLB",
    use_selection=True,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
    export_animations=False,
    export_morph=False,
)
SUMMARY["outputGlb"] = PLAN["output_glb"]
open(PLAN["summary_json"], "w", encoding="utf-8").write(json.dumps(SUMMARY, indent=2))
print("[weapon] scale", scale, "native", tuple(round(v, 3) for v in size))
print("SUMMARY_WRITTEN")
