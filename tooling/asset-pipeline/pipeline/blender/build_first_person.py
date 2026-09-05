"""Headless Blender builder for the FIRST-PERSON bow rig (arms only).

Skyrim renders the player's own hands from a separate first-person skeleton
(`_1stperson/skeleton`), with its own arm meshes and a full first-person clip
set. This builds that rig for the bow only (owner 2026-09-05): the skeleton,
the male first-person body and hands, and the bow clips named in the plan,
exported as one GLB in armature units exactly as the character rig is. No
grounding, no hurtbox, no root-motion policy: an arms layer has none of those.

Env: BUILD_PLAN -> json with keys skeleton, rig_import, mesh_import, meshes[],
clips{semantic: hkx}, output_glb, summary_json.
"""

import bpy
import json
import os
from mathutils import Vector

PLAN = json.loads(open(os.environ["BUILD_PLAN"], "r", encoding="utf-8").read())
SUMMARY = {"warnings": []}
_MAP_SUFFIXES = ("_n", "_msn", "_s", "_sk", "_g", "_m", "_em", "_e", "_b")
FPS = 30


def log(message):
    print("[first-person] " + message)


def is_diffuse(image):
    base = os.path.splitext(os.path.basename(image.filepath or image.name))[0].lower()
    return not base.endswith(_MAP_SUFFIXES)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def rebuild_materials(objects):
    seen = set()
    for obj in objects:
        for slot in obj.material_slots:
            material = slot.material
            if not material or material.name in seen:
                continue
            seen.add(material.name)
            diffuse = None
            if material.use_nodes:
                images = [n.image for n in material.node_tree.nodes
                          if n.type == "TEX_IMAGE" and n.image]
                diffuse = next((i for i in images if is_diffuse(i)), None) or (
                    images[0] if images else None)
            material.use_nodes = True
            tree = material.node_tree
            tree.nodes.clear()
            output = tree.nodes.new("ShaderNodeOutputMaterial")
            shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
            shader.inputs["Metallic"].default_value = 0.0
            shader.inputs["Roughness"].default_value = 0.65
            tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
            if diffuse is not None:
                diffuse.colorspace_settings.name = "sRGB"
                texture = tree.nodes.new("ShaderNodeTexImage")
                texture.image = diffuse
                tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
            if hasattr(material, "blend_method"):
                try:
                    material.blend_method = "OPAQUE"
                except TypeError:
                    pass


def retime_to_native_duration(action, hkx_path):
    from io_scene_nifly.hkx import anim_skyrim

    native = anim_skyrim.load_skyrim_animation(hkx_path)
    native_span = native.duration * FPS
    current_span = action.frame_end - action.frame_start
    if native_span <= 0 or current_span <= 0:
        return native.duration
    scale = native_span / current_span
    if abs(scale - 1.0) >= 0.001:
        origin = action.frame_start
        for curve in action.fcurves:
            for point in curve.keyframe_points:
                point.co[0] = origin + (point.co[0] - origin) * scale
                point.handle_left[0] = origin + (point.handle_left[0] - origin) * scale
                point.handle_right[0] = origin + (point.handle_right[0] - origin) * scale
            curve.update()
    return native.duration


bpy.ops.preferences.addon_enable(module=PLAN.get("addon", "io_scene_nifly"))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.scene.render.fps = FPS
RIG = PLAN["rig_import"]
MESH_IMPORT = PLAN["mesh_import"]

log("importing first-person skeleton")
bpy.ops.import_scene.pynifly_hkx(filepath=PLAN["skeleton"], **RIG)
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
assert len(arms) == 1, "expected one armature"
arm = arms[0]
bones = [b.name for b in arm.data.bones]
log("bones=%d" % len(bones))
SUMMARY["bones"] = bones

meshes = []
for mesh in PLAN["meshes"]:
    before = {o.name for o in bpy.data.objects if o.type == "MESH"}
    select_only(arm)
    result = bpy.ops.import_scene.pynifly(filepath=mesh["file"], **MESH_IMPORT)
    if "FINISHED" not in result:
        raise RuntimeError("mesh import failed: %s" % mesh["file"])
    new = [o for o in bpy.data.objects if o.type == "MESH" and o.name not in before]
    for obj in new:
        obj["role"] = mesh["name"]
    meshes.extend(new)
for image in bpy.data.images:
    if image.source == "FILE" and image.filepath:
        try:
            image.reload()
        except RuntimeError:
            pass
for obj in meshes:
    for vg in obj.vertex_groups:
        if not vg.name.startswith("SBP_") and vg.name not in arm.data.bones:
            SUMMARY["warnings"].append("%s: skin group %s not in skeleton" % (obj.name, vg.name))
rebuild_materials(meshes)
bpy.ops.file.pack_all()
log("meshes=%s" % [o.name for o in meshes])

durations = {}
for semantic, hkx in PLAN["clips"].items():
    select_only(arm)
    bpy.ops.import_scene.pynifly_hkx(filepath=hkx, **RIG)
    action = arm.animation_data.action if arm.animation_data else None
    if action is None:
        SUMMARY["warnings"].append("no action for %s" % semantic)
        continue
    durations[semantic] = round(retime_to_native_duration(action, hkx), 4)
    action.name = semantic
    action.use_fake_user = True
    arm.animation_data.action = None
SUMMARY["durations"] = durations

# Rest-pose reference lengths so the runtime can scale this rig against the
# third-person one: the forearm and the camera bone's height off the root.
def bone_head(name):
    bone = arm.data.bones.get(name)
    return (arm.matrix_world @ bone.head_local) if bone else None


SUMMARY["restMeasures"] = {}
for label, a, b in (("forearmR", "NPC R Forearm [RLar]", "NPC R Hand [RHnd]"),
                    ("upperArmR", "NPC R UpperArm [RUar]", "NPC R Forearm [RLar]")):
    pa, pb = bone_head(a), bone_head(b)
    if pa is not None and pb is not None:
        SUMMARY["restMeasures"][label] = round((pb - pa).length, 5)
camera = bone_head("Camera1st [Cam1]")
root = bone_head("NPC Root [Root]")
if camera is not None and root is not None:
    SUMMARY["restMeasures"]["cameraAboveRoot"] = round((camera - root).z, 5)
    SUMMARY["restMeasures"]["cameraWorld"] = [round(v, 5) for v in camera]
SUMMARY["armatureScale"] = [round(s, 5) for s in arm.scale]

bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=PLAN["output_glb"],
    export_format="GLB",
    use_selection=True,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
    export_apply=False,
    export_skins=True,
    export_morph=False,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_nla_strips=False,
    export_bake_animation=False,
    export_optimize_animation_size=True,
    export_image_format="JPEG",
    export_jpeg_quality=88,
)
open(PLAN["summary_json"], "w", encoding="utf-8").write(json.dumps(SUMMARY, indent=2))
log("exported %s" % PLAN["output_glb"])
print("SUMMARY_WRITTEN")
