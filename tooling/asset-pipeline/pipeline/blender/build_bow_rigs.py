"""Headless Blender batch builder for RIGGED Skyrim bows.

A vanilla bow is not a static mesh: it is skinned to its own seven-bone
skeleton (Bow_MidBone, Bow_Up/LoBone1-2, Bow_StringBone1-2) and the game
drives that skeleton with the bow's own clips (draw, drawn, release) alongside
the archer's. The static arsenal build flattened all of that, which is why a
drawn bow's string never moved. This builder keeps the skin and bakes the
four clips in, one GLB per bow, in the same metres-and-native-origin frame the
static bows use so the runtime mounts them identically.

Env: BUILD_PLAN -> json with keys skeleton, rig_import, mesh_import, clips{},
items[], drop[], summary_json.
"""

import bpy
import json
import os
from mathutils import Matrix, Vector

PLAN = json.loads(open(os.environ["BUILD_PLAN"], "r", encoding="utf-8").read())
SUMMARY = {"items": {}, "warnings": []}
_MAP_SUFFIXES = ("_n", "_msn", "_s", "_sk", "_g", "_m", "_em", "_e", "_b")
FPS = 30


def log(message):
    print("[bow-rigs] " + message)


def is_diffuse(image):
    base = os.path.splitext(os.path.basename(image.filepath or image.name))[0].lower()
    return not base.endswith(_MAP_SUFFIXES)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                  bpy.data.armatures, bpy.data.actions):
        for datablock in list(block):
            if datablock.users == 0:
                block.remove(datablock)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def drop_shapes(objects, drop_terms):
    kept = []
    for obj in objects:
        haystack = obj.name.lower()
        for slot in obj.material_slots:
            if slot.material:
                haystack += " " + slot.material.name.lower()
        if any(term in haystack for term in drop_terms):
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return kept


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
            shader.inputs["Metallic"].default_value = 0.55
            shader.inputs["Roughness"].default_value = 0.4
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


def world_bounds(objects):
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    bpy.context.view_layer.update()
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


def retime_to_native_duration(action, hkx_path):
    """Honor the HKX sample rate instead of assuming every clip is 30 fps."""
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
bpy.context.scene.render.fps = FPS
RIG = PLAN["rig_import"]
MESH_IMPORT = PLAN["mesh_import"]
drop_terms = [term.lower() for term in PLAN.get("drop", [])]

for item in PLAN["items"]:
    clear_scene()
    bpy.ops.import_scene.pynifly_hkx(filepath=PLAN["skeleton"], **RIG)
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if len(arms) != 1:
        SUMMARY["warnings"].append("%s: expected one armature, got %d" % (item["id"], len(arms)))
        continue
    arm = arms[0]
    bones = [b.name for b in arm.data.bones]
    log("%s: bow skeleton bones=%s" % (item["id"], bones))

    before = {o.name for o in bpy.data.objects if o.type == "MESH"}
    select_only(arm)
    result = bpy.ops.import_scene.pynifly(filepath=item["nif"], **MESH_IMPORT)
    if "FINISHED" not in result:
        SUMMARY["warnings"].append("%s: mesh import failed %s" % (item["id"], result))
        continue
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name not in before]
    for image in bpy.data.images:
        if image.source == "FILE" and image.filepath:
            try:
                image.reload()
            except RuntimeError:
                pass
    kept = drop_shapes(meshes, drop_terms)
    if not kept:
        SUMMARY["warnings"].append("%s: every shape was dropped" % item["id"])
        continue
    unbound = [o.name for o in kept if not any(m.type == "ARMATURE" for m in o.modifiers)]
    if unbound:
        SUMMARY["warnings"].append("%s: shapes not skinned to the bow skeleton: %s" % (item["id"], unbound))
    groups = sorted({vg.name for o in kept for vg in o.vertex_groups})
    missing = [g for g in groups if g not in arm.data.bones]
    if missing:
        SUMMARY["warnings"].append("%s: skin groups missing from skeleton: %s" % (item["id"], missing))
    rebuild_materials(kept)
    bpy.ops.file.pack_all()

    # Clips onto the bow skeleton, at their native timing.
    clip_durations = {}
    for semantic, hkx in PLAN["clips"].items():
        select_only(arm)
        bpy.ops.import_scene.pynifly_hkx(filepath=hkx, **RIG)
        action = arm.animation_data.action if arm.animation_data else None
        if action is None:
            SUMMARY["warnings"].append("%s: no action for clip %s" % (item["id"], semantic))
            continue
        duration = retime_to_native_duration(action, hkx)
        action.name = semantic
        action.use_fake_user = True
        clip_durations[semantic] = round(duration, 4)
        arm.animation_data.action = None

    # The GLB stays in the skeleton's own units, exactly as the character rig
    # does (a skinned mesh renders where its joints put it, and its vertices
    # are authored in the armature's frame); the runtime applies `scale` to
    # bring the bow to its class length in metres, measured on the mesh data.
    local_low = Vector((1e9, 1e9, 1e9))
    local_high = Vector((-1e9, -1e9, -1e9))
    for obj in kept:
        for vertex in obj.data.vertices:
            for axis in range(3):
                local_low[axis] = min(local_low[axis], vertex.co[axis])
                local_high[axis] = max(local_high[axis], vertex.co[axis])
    local_size = local_high - local_low
    longest = max(local_size.x, local_size.y, local_size.z)
    scale = item["target_length"] / longest if longest else 1.0

    # When the string actually starts to move in each draw clip: the vanilla
    # draws hold the rest pose for a while before the pull, and the runtime
    # scrubs the pull by the archer's draw fraction, so it needs the onset.
    string_bone = arm.pose.bones.get("Bow_StringBone1")
    draw_onsets = {}
    if string_bone is not None:
        for semantic in ("BOW_RIG_DRAW", "BOW_RIG_DRAW_HEAVY"):
            action = bpy.data.actions.get(semantic)
            if action is None:
                continue
            arm.animation_data.action = action
            start, end = action.frame_range
            bpy.context.scene.frame_set(int(start))
            rest = (arm.matrix_world @ string_bone.head).copy()
            onset = None
            for frame in range(int(start), int(end) + 1):
                bpy.context.scene.frame_set(frame)
                moved = (arm.matrix_world @ string_bone.head) - rest
                if moved.length > longest * arm.scale[0] * 0.01:
                    onset = (frame - start) / FPS
                    break
            arm.animation_data.action = None
            draw_onsets[semantic] = round(onset if onset is not None else 0.0, 4)
    bpy.context.scene.frame_set(0)
    low, high = world_bounds(kept)

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for obj in kept:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=item["output_glb"],
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
        export_jpeg_quality=85,
    )
    SUMMARY["items"][item["id"]] = {
        "keptMeshes": [o.name for o in kept],
        "bones": bones,
        "scale": round(scale, 5),
        "targetLength": item["target_length"],
        "clipDurations": clip_durations,
        "drawOnsets": draw_onsets,
        "localLongest": round(longest, 5),
        # Metres, in the exported Y-up frame, once `scale` is applied.
        "sizeMeters": [round(local_size[0] * scale, 5), round(local_size[2] * scale, 5), round(local_size[1] * scale, 5)],
    }
    log("%s scale=%.5f clips=%s" % (item["id"], scale, clip_durations))

open(PLAN["summary_json"], "w", encoding="utf-8").write(json.dumps(SUMMARY, indent=2))
log("built %d rigged bows" % len(SUMMARY["items"]))
print("SUMMARY_WRITTEN")
