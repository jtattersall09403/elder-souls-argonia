"""Headless Blender + PyNifly character builder (runs inside Wine Blender 4.4.3).

Consumes the Windows-path plan written by pipeline/build.py (env BUILD_PLAN) and
deterministically regenerates a game-ready GLB from Skyrim source:

    skeleton.hkx -> 99-bone rig
    body/head/hands/feet/eyes/mouth NIFs onto the same rig
    DarkElfRace TRI morph, baked
    filled Skyrim textures + race material overrides
    every manifest animation, imported and renamed to its SEMANTIC name
    root motion stripped (visual == physical; no drift), net delta recorded
    -> GLB with no cameras/lights/debug helpers

All diagnostics are written to summary_json for host-side validation.
"""

import bpy
import json
import os

PLAN = json.loads(open(os.environ["BUILD_PLAN"], "r", encoding="utf-8").read())
SUMMARY = {"warnings": []}


def log(msg):
    print("[build] " + msg)


def warn(msg):
    SUMMARY["warnings"].append(msg)
    print("[build] WARNING " + msg)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# ---------------------------------------------------------------------------
# Scene reset
# ---------------------------------------------------------------------------
bpy.ops.preferences.addon_enable(module=PLAN["addon"])
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.scene.render.fps = 30

RIG = PLAN["rig_import"]

# ---------------------------------------------------------------------------
# 1. Skeleton
# ---------------------------------------------------------------------------
log("importing skeleton")
bpy.ops.import_scene.pynifly_hkx(filepath=PLAN["skeleton"], **RIG)
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
assert len(arms) == 1, "expected exactly one armature after skeleton import"
arm = arms[0]
bone_count = len(arm.data.bones)
log("armature=%s bones=%d scale=%s" % (arm.name, bone_count, tuple(round(s, 3) for s in arm.scale)))
if bone_count != PLAN["expected_bones"]:
    warn("bone count %d != expected %d" % (bone_count, PLAN["expected_bones"]))

# ---------------------------------------------------------------------------
# 2. Geometry
# ---------------------------------------------------------------------------
MESH_IMPORT = PLAN["mesh_import"]
for mesh in PLAN["meshes"]:
    select_only(arm)
    result = bpy.ops.import_scene.pynifly(filepath=mesh["file"], **MESH_IMPORT)
    if "FINISHED" not in result:
        raise RuntimeError("mesh import failed: %s -> %s" % (mesh["name"], result))
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
log("meshes=%d" % len(meshes))

# validate skin binding
for obj in meshes:
    for vg in obj.vertex_groups:
        if vg.name.startswith("SBP_"):
            continue
        if vg.name not in arm.data.bones:
            warn("%s: skin group %s not in skeleton" % (obj.name, vg.name))

# ---------------------------------------------------------------------------
# 3. Race head morph (baked)
# ---------------------------------------------------------------------------
morph = PLAN["morph"]
head = bpy.data.objects.get(morph["targetMesh"])
if head is None:
    warn("morph target %s not found; skipping morph" % morph["targetMesh"])
else:
    select_only(head)
    bpy.ops.import_scene.pyniflytri(filepath=morph["tri"], do_apply_active=True)
    keys = head.data.shape_keys.key_blocks if head.data.shape_keys else None
    if not keys or morph["shapeKey"] not in keys:
        warn("shape key %s not created" % morph["shapeKey"])
    else:
        for kb in keys:
            if kb.name != "Basis":
                kb.value = 0.0
        keys[morph["shapeKey"]].value = float(morph.get("value", 1.0))
        SUMMARY["morphValue"] = keys[morph["shapeKey"]].value
        # Bake the mix into the mesh and drop all shape keys (no morph targets in GLB).
        select_only(head)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
        log("baked %s morph" % morph["shapeKey"])

# ---------------------------------------------------------------------------
# 4. Materials: fill + race overrides; rebuild as clean glTF-friendly Principled
# ---------------------------------------------------------------------------
# Suffixes marking a support map (never the base-colour diffuse).
_MAP_SUFFIXES = ("_n", "_msn", "_s", "_sk", "_g", "_m", "_em", "_e")


def _is_diffuse(img):
    base = os.path.splitext(os.path.basename(img.filepath or img.name))[0].lower()
    return not base.endswith(_MAP_SUFFIXES)


def reload_all_images():
    missing = []
    for img in bpy.data.images:
        if img.source != "FILE" or not img.filepath:
            continue
        try:
            img.reload()
        except RuntimeError:
            pass
        if img.size[0] == 0 or img.size[1] == 0:
            missing.append(os.path.basename(img.filepath))
    return missing


for override in PLAN["material_overrides"]:
    match = override["matchTextureContains"].lower()
    replacement = override["replaceWith"]
    swapped = 0
    for img in bpy.data.images:
        base = os.path.basename(img.filepath).lower()
        # Only override the diffuse, never its normal/specular companions.
        if match in base and _is_diffuse(img):
            img.filepath = replacement
            img.source = "FILE"
            swapped += 1
    log("material override '%s' -> %s (%d image(s))" % (match, os.path.basename(replacement), swapped))

missing_images = reload_all_images()


def rebuild_materials():
    # PyNifly's Skyrim skin shader exports to glTF with white emission and BLEND
    # alpha, washing the body out. Rebuild every material as a plain diffuse
    # Principled BSDF so the real textures survive export intact.
    rebuilt = []
    seen = set()
    for obj in meshes:
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or mat.name in seen:
                continue
            seen.add(mat.name)
            diffuse = None
            if mat.use_nodes:
                images = [n.image for n in mat.node_tree.nodes
                          if n.type == "TEX_IMAGE" and n.image]
                diffuse = next((im for im in images if _is_diffuse(im)), None)
                if diffuse is None and images:
                    diffuse = images[0]
            mat.use_nodes = True
            nt = mat.node_tree
            nt.nodes.clear()
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = 0.62
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
            rebuilt.append((mat.name, diffuse.name if diffuse else None))
    return rebuilt


for name, diff in rebuild_materials():
    log("material %s -> diffuse %s" % (name, diff))
SUMMARY["missingImages"] = missing_images
if missing_images:
    warn("missing/failed images: %s" % ", ".join(sorted(set(missing_images))))

# Pack images so the GLB is self-contained (DDS -> PNG on export).
bpy.ops.file.pack_all()

# ---------------------------------------------------------------------------
# 5. Animations: import, rename to semantic, strip root motion
# ---------------------------------------------------------------------------
root_bones = [b.name for b in arm.data.bones if b.parent is None]
com_bones = [b.name for b in arm.data.bones if b.parent and b.parent.name in root_bones]
root_motion_bones = set(root_bones) | set(com_bones)
SUMMARY["rootBones"] = root_bones
SUMMARY["comBones"] = com_bones
log("root-motion bones: %s" % ", ".join(sorted(root_motion_bones)))


def strip_root_motion(action, primary):
    """Remove location f-curves for the root chain; return net translation delta."""
    delta = None
    remove = []
    for fc in action.fcurves:
        path = fc.data_path  # pose.bones["Name"].location
        if not path.endswith(".location"):
            continue
        try:
            bone_name = path.split('"')[1]
        except IndexError:
            continue
        if bone_name not in root_motion_bones:
            continue
        if bone_name == primary and len(fc.keyframe_points) >= 2:
            first = fc.keyframe_points[0].co[1]
            last = fc.keyframe_points[-1].co[1]
            axis = fc.array_index
            if delta is None:
                delta = [0.0, 0.0, 0.0]
            delta[axis] = round(last - first, 5)
        remove.append(fc)
    for fc in remove:
        action.fcurves.remove(fc)
    return delta


durations = {}
root_deltas = {}
primary_root = PLAN["root_bone"] if PLAN["root_bone"] in {b.name for b in arm.data.bones} else (root_bones[0] if root_bones else None)
for spec in PLAN["animations"]:
    semantic = spec["semantic"]
    arm.animation_data_clear() if arm.animation_data else None
    select_only(arm)
    # PyNifly's HKX operator returns an empty set on success, so verify by action.
    bpy.ops.import_scene.pynifly_hkx(filepath=spec["hkx"], **RIG)
    action = arm.animation_data.action if arm.animation_data else None
    if action is None:
        raise RuntimeError("no action produced for %s (%s)" % (semantic, spec["hkx"]))
    delta = strip_root_motion(action, primary_root)
    action.name = semantic
    action.use_fake_user = True
    fr = action.frame_range
    durations[semantic] = round((fr[1] - fr[0]) / 30.0, 4)
    if delta is not None:
        root_deltas[semantic] = delta
    arm.animation_data.action = None

SUMMARY["durations"] = durations
SUMMARY["rootMotionDeltas"] = root_deltas
SUMMARY["animationNames"] = [s["semantic"] for s in PLAN["animations"]]
log("imported %d animations" % len(durations))

# ---------------------------------------------------------------------------
# 6. Diagnostics: sockets, bbox
# ---------------------------------------------------------------------------
SUMMARY["armature"] = arm.name
SUMMARY["boneCount"] = bone_count
SUMMARY["boneNames"] = [b.name for b in arm.data.bones]
SUMMARY["meshNames"] = [m.name for m in meshes]
SUMMARY["sockets"] = {}
for key, bone_name in PLAN["sockets"].items():
    SUMMARY["sockets"][key] = bone_name in arm.data.bones

bpy.context.view_layer.update()
mins = [1e9, 1e9, 1e9]
maxs = [-1e9, -1e9, -1e9]
for obj in meshes:
    for corner in obj.bound_box:
        world = obj.matrix_world @ __import__("mathutils").Vector(corner)
        for i in range(3):
            mins[i] = min(mins[i], world[i])
            maxs[i] = max(maxs[i], world[i])
SUMMARY["bboxSize"] = [round(maxs[i] - mins[i], 4) for i in range(3)]

# ---------------------------------------------------------------------------
# 7. Export GLB (no cameras/lights)
# ---------------------------------------------------------------------------
out = PLAN["output_glb"]
log("exporting GLB -> %s" % out)
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    use_selection=False,
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
)

SUMMARY["outputGlb"] = out
open(os.environ.get("SUMMARY_JSON", PLAN["summary_json"]), "w", encoding="utf-8").write(
    json.dumps(SUMMARY, indent=2)
)
print("SUMMARY_WRITTEN")
