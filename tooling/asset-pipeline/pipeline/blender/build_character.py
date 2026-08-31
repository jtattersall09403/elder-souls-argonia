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
import copy
import json
import math
import os
import re
import numpy as np
from mathutils import Matrix, Vector

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


def reset_armature_pose(armature):
    """Restore the unanimated pose used by glTF for unkeyed channels.

    Assigning another Blender Action does not reset properties that the new
    action does not key. Sampling actions successively without this reset made
    support envelopes depend on manifest order and disagree with the exported
    GLB, whose mixer starts every action from the scene's default pose.
    """
    if armature.animation_data is not None:
        armature.animation_data.action = None
    armature.data.pose_position = "POSE"
    for pose_bone in armature.pose.bones:
        pose_bone.matrix_basis.identity()
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()


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
# 1b. Auxiliary bone chains (the beast tail)
# ---------------------------------------------------------------------------
# Skyrim animates a tail on its own five-bone skeleton, in parallel with the
# body clip and under the same filename. The tail mesh, though, is skinned to
# both those bones *and* the pelvis, spine and thighs, so it can only deform
# correctly inside one armature. Graft the chain onto the rig and keep its
# source armature alive to import the paired clips against, because an HKX
# carries track indices rather than bone names and only lines up with the
# skeleton it was authored for.
aux_armatures = {}


def graft_auxiliary_chain(aux_id, aux):
    parent_name = aux["parent"]
    parent_bone = arm.data.bones.get(parent_name)
    if parent_bone is None:
        warn("auxiliary chain %s: parent bone %s is missing" % (aux_id, parent_name))
        return None
    before = set(bpy.data.objects)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.import_scene.pynifly_hkx(filepath=aux["skeleton"], **RIG)
    source = next((o for o in bpy.data.objects
                   if o not in before and o.type == "ARMATURE"), None)
    if source is None:
        warn("auxiliary chain %s: no armature imported" % aux_id)
        return None

    # The chain's own coordinates are relative to its attach bone's head, which
    # is what lands it in character space with no hand-measured offset.
    offset = Matrix.Translation(parent_bone.head_local)
    chain = [(b.name, b.parent.name if b.parent else None, b.matrix_local.copy())
             for b in source.data.bones]
    select_only(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        for name, source_parent, matrix in chain:
            if name in arm.data.edit_bones:
                continue
            bone = arm.data.edit_bones.new(name)
            bone.head = (0, 0, 0)
            bone.tail = (0, 1, 0)
            bone.matrix = offset @ matrix
            bone.parent = arm.data.edit_bones.get(source_parent or parent_name)
            bone.use_connect = False
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
    log("auxiliary chain %s: grafted %d bone(s) onto %s"
        % (aux_id, len(chain), parent_name))
    return source


for aux_id, aux in (PLAN.get("auxiliary_bones") or {}).items():
    grafted = graft_auxiliary_chain(aux_id, aux)
    if grafted is not None:
        aux_armatures[aux_id] = grafted
bone_count = len(arm.data.bones)
SUMMARY["boneCountWithAuxiliary"] = bone_count

# ---------------------------------------------------------------------------
# 2. Geometry
# ---------------------------------------------------------------------------
MESH_IMPORT = PLAN["mesh_import"]
# Which mesh came from which part of the body. The game tints skin and hair at
# runtime — a race is a tint, not a texture set — and it can only do that if
# something tells it which meshes are which.
MESH_ROLES = {}
for mesh in PLAN["meshes"]:
    before = {o.name for o in bpy.data.objects if o.type == "MESH"}
    select_only(arm)
    result = bpy.ops.import_scene.pynifly(filepath=mesh["file"], **MESH_IMPORT)
    if "FINISHED" not in result:
        raise RuntimeError("mesh import failed: %s -> %s" % (mesh["name"], result))
    for name in {o.name for o in bpy.data.objects if o.type == "MESH"} - before:
        MESH_ROLES[name] = mesh["name"]
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
# The body proper: everything the character *is*, without the hairstyle.
#
# Hair is skinned to the head bone, so anything that measures the character from
# its skin — its height, its hurtbox — will happily take a long braid as part of
# the skull. Height decides the scale every actor is built to, and the hurtbox
# decides what a sword can touch; neither should move when someone changes their
# hair.
BODY_MESHES = [o for o in meshes if MESH_ROLES.get(o.name, "body") != "hair"]
log("meshes=%d (body=%d)" % (len(meshes), len(BODY_MESHES)))

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
head = bpy.data.objects.get(morph["targetMesh"]) if morph else None
if not morph:
    # Beast races carry their own head mesh rather than a morph of the shared
    # human one, so there is nothing to blend.
    log("no head morph for this race; using the authored head mesh")
elif head is None:
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


#: Skin tint applies to bare flesh, not to eyes or worn things: tinting an iris
#: or a loincloth with the body colour is how a tinted character stops looking
#: like a person.
_SKIN_TEXTURES = ("malebody", "malehands", "malefeet", "malehead", "mouth", "orctusks",
                  "bodymale", "handsmale", "argonianmalebody", "argonianmalehands",
                  "argonianmalehead", "khajiitmalehead")
SKIN_TINT = tuple(PLAN.get("skin_tint") or (1.0, 1.0, 1.0))


def _is_skin(img):
    base = os.path.splitext(os.path.basename(img.filepath or img.name))[0].lower()
    return any(base.startswith(name) for name in _SKIN_TEXTURES)


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
                # No tint node here on purpose.
                #
                # Skyrim colours a race by tinting shared skin textures rather
                # than shipping a diffuse per race, and that is still what
                # happens — but at *runtime*, not here. A multiply node between
                # a texture and Base Color is not a shape the glTF exporter
                # knows how to write, so it was silently dropped and every race
                # shipped at full white. Tinting in the game also happens to be
                # what a character creator needs.
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


# Skyrim's humanoid COM translations use local X/Y for planar travel and local
# Z for height. This is verified from the native HKX tracks and from final
# deformed-mesh sampling: retaining local Y discarded BACKSTEP/GET_UP height
# while preserving planar travel. Exceptional rigs can still declare explicit
# local indices per action.
SKYRIM_VERTICAL_LOCAL_AXIS = 2

# Default root-motion policy: the controller owns planar travel, but the
# authored vertical COM channel is *part of the pose*, not travel. Stripping it
# pins the torso at the rest height while the legs keep their authored crouch,
# lunge or stagger, so the feet lift off the support plane for the whole clip
# (measured: +0.27 m through the guard entry, +0.23 m through the parry, and
# +0.03..0.08 m through every walk/strafe cycle). Only a clip whose height is
# genuinely owned by the physics controller — the jump arc — opts out.
DEFAULT_KEEP_AXES = (SKYRIM_VERTICAL_LOCAL_AXIS,)


def strip_root_motion(action, primary, keep_axes=()):
    """Remove location f-curves for the root chain (except `keep_axes` local
    array indices); return net translation delta for the removed axes."""
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
        axis = fc.array_index
        if axis in keep_axes:
            continue
        if bone_name == primary and len(fc.keyframe_points) >= 2:
            first = fc.keyframe_points[0].co[1]
            last = fc.keyframe_points[-1].co[1]
            if delta is None:
                delta = [0.0, 0.0, 0.0]
            delta[axis] = round(last - first, 5)
        remove.append(fc)
    for fc in remove:
        action.fcurves.remove(fc)
    return delta


def merge_auxiliary_animation(semantic, action):
    """Fold the paired auxiliary-bone clip into this semantic action.

    Skyrim authors a tail clip alongside the body clip of the same name and
    plays both from one behaviour state, so they share a clock but not
    necessarily a key count — the tail is often keyed more sparsely. The merge
    therefore maps the tail onto the body's frame range rather than demanding
    equal lengths, which is what "the same clip" actually means here. Keys are
    laid down linearly: their Bezier handles belong to the source's timing and
    would be wrong once remapped, and at 30 Hz the difference is not visible.
    """
    merged = 0
    for aux_id, aux in (PLAN.get("auxiliary_bones") or {}).items():
        source_path = (aux.get("animations") or {}).get(semantic)
        source_armature = aux_armatures.get(aux_id)
        if not source_path or source_armature is None:
            continue
        known = set(bpy.data.actions.keys())
        select_only(source_armature)
        bpy.ops.import_scene.pynifly_hkx(filepath=source_path, **RIG)
        imported = [a for a in bpy.data.actions if a.name not in known]
        if not imported:
            warn("%s: auxiliary %s produced no action" % (semantic, aux_id))
            continue
        aux_action = imported[0]
        retime_to_native_duration(aux_action, source_path)
        body_start, body_end = action.frame_range
        aux_start, aux_end = aux_action.frame_range
        aux_span = aux_end - aux_start
        scale = (body_end - body_start) / aux_span if aux_span > 1e-6 else 1.0
        for source_curve in aux_action.fcurves:
            curve = action.fcurves.new(source_curve.data_path,
                                       index=source_curve.array_index)
            curve.keyframe_points.add(len(source_curve.keyframe_points))
            for target, origin in zip(curve.keyframe_points,
                                      source_curve.keyframe_points):
                target.co = (body_start + (origin.co[0] - aux_start) * scale,
                             origin.co[1])
                target.interpolation = "LINEAR"
            curve.update()
            merged += 1
        log("%s: merged %s over %.0f->%.0f frames (%.2fx)"
            % (semantic, aux_id, aux_span, body_end - body_start, scale))
        bpy.data.actions.remove(aux_action)
        if source_armature.animation_data:
            source_armature.animation_data.action = None
    return merged


durations = {}
root_deltas = {}
auxiliary_merges = {}
primary_root = PLAN["root_bone"] if PLAN["root_bone"] in {b.name for b in arm.data.bones} else (root_bones[0] if root_bones else None)


def import_paired_actor(spec):
    """Import one actor from a two-actor Skyrim ``PairedRoot`` HKX.

    Paired killmoves contain two complete 99-track humanoid animations.  The
    second actor's bone names are prefixed ``2_``; the first actor follows an
    otherwise-unanimated ``NPC`` group marker.  PyNifly correctly parses the
    file, but a normal import can only bind the unprefixed tracks to one rig.
    Filter one track set and normalise its names before applying it.
    """
    from io_scene_nifly.hkx import anim_skyrim
    from io_scene_nifly.hkx.import_hkx import apply_fo4_animation
    from io_scene_nifly.pyn.niflytools import skyrimDict

    prefix = spec["paired_track_prefix"]
    parsed = anim_skyrim.load_skyrim_animation(spec["hkx"])
    selected = []
    for index, name in enumerate(parsed.bone_names):
        if prefix:
            if name.startswith(prefix) and name != prefix:
                selected.append((index, name[len(prefix):]))
        elif not name.startswith("2_") and name not in {"PairedRoot", "NPC"}:
            selected.append((index, name))

    if len(selected) != PLAN["expected_bones"]:
        raise RuntimeError(
            "%s: paired prefix %r selected %d tracks, expected %d"
            % (spec["semantic"], prefix, len(selected), PLAN["expected_bones"])
        )

    actor = copy.copy(parsed)
    actor.bone_names = [name for _, name in selected]
    actor.tracks = [parsed.tracks[index] for index, _ in selected]
    actor.num_tracks = len(actor.tracks)
    actor.track_to_bone_indices = []
    apply_fo4_animation(
        arm,
        actor,
        actor.bone_names,
        spec["semantic"],
        bpy.context.scene.render.fps,
        rename_bones=RIG.get("rename_bones", False),
        rename_bones_niftools=RIG.get("rename_bones_niftools", False),
        bone_dict=skyrimDict,
    )
    log("%s: imported paired actor prefix %r (%d tracks)" % (
        spec["semantic"], prefix, len(selected)))


def retime_to_native_duration(action, hkx_path):
    """Honor the HKX sample rate instead of assuming every clip is 30 fps."""
    from io_scene_nifly.hkx import anim_skyrim

    native = anim_skyrim.load_skyrim_animation(hkx_path)
    native_span = native.duration * bpy.context.scene.render.fps
    current_span = action.frame_end - action.frame_start
    if native_span <= 0 or current_span <= 0:
        return
    scale = native_span / current_span
    if abs(scale - 1.0) < 0.001:
        return
    origin = action.frame_start
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.co.x = origin + (point.co.x - origin) * scale
            point.handle_left.x = origin + (point.handle_left.x - origin) * scale
            point.handle_right.x = origin + (point.handle_right.x - origin) * scale
    action.frame_end = origin + native_span
    log("retimed %s from %.4fs to native %.4fs" % (
        action.name, current_span / bpy.context.scene.render.fps, native.duration))


def remove_declared_quaternion_keys(action, removals):
    """Apply narrowly declared cleanup to the imported source curve.

    Declared times are on the imported HKX clock, so this runs before native
    retiming and any loop rebase rescale the timeline; those later transforms
    move the already-conditioned curve as a unit. Authoring against the source
    clock keeps a declaration readable (a whole frame index) and stable when a
    clip's measured native duration changes. Removals are interior-only, so
    they cannot alter the span retiming is fitted to. Every quaternion component
    must own exactly one matching point so a typo or partially keyed rotation
    fails the build instead of silently producing a malformed quaternion.
    """
    removed = []
    fps = bpy.context.scene.render.fps
    frame_tolerance = 1e-4 * fps
    for removal in removals:
        bone_name = removal["bone"]
        source_time = float(removal["source_time"])
        pose_bone = arm.pose.bones.get(bone_name)
        if pose_bone is None:
            raise RuntimeError(
                "%s: quaternion key conditioning names missing bone %r"
                % (action.name, bone_name)
            )
        target_frame = source_time * fps
        if (target_frame <= action.frame_start + frame_tolerance
                or target_frame >= action.frame_end - frame_tolerance):
            raise RuntimeError(
                "%s: refusing to remove boundary quaternion key for %s at %.7fs"
                % (action.name, bone_name, source_time)
            )
        data_path = pose_bone.path_from_id("rotation_quaternion")
        curves = [curve for curve in action.fcurves if curve.data_path == data_path]
        curve_indices = {curve.array_index for curve in curves}
        if len(curves) != 4 or curve_indices != {0, 1, 2, 3}:
            raise RuntimeError(
                "%s: %s needs four quaternion component curves, got %s"
                % (action.name, bone_name, sorted(curve_indices))
            )
        matches = []
        for curve in curves:
            points = [
                point for point in curve.keyframe_points
                if abs(point.co.x - target_frame) <= frame_tolerance
            ]
            if len(points) != 1:
                raise RuntimeError(
                    "%s: %s quaternion component %d has %d keys at %.7fs"
                    % (action.name, bone_name, curve.array_index, len(points), source_time)
                )
            matches.append((curve, points[0]))
        for curve, point in matches:
            curve.keyframe_points.remove(point)
            curve.update()
        removed.append({"bone": bone_name, "sourceTime": source_time})
        log("%s: removed %s quaternion key at source %.7fs" % (
            action.name, bone_name, source_time))
    return removed


def rebase_loop_to_zero(action):
    """Remove PyNifly's one-frame export lead-in from a looping action.

    Imported Skyrim actions normally occupy frames 1..N, and the final frame
    duplicates the first pose to close the cycle.  Exporting those absolute
    frame numbers makes the glTF clip N/30 seconds long instead of (N-1)/30:
    Three.js renders the duplicate endpoint and then holds that same pose until
    the first key at frame 1 after every wrap.  The resulting one-frame hitch is
    especially obvious in RUN.  Rebasing only declared loops preserves their
    authored span and key values while making frame 1 runtime t=0, so the
    duplicate endpoint is the loop boundary rather than an extra displayed
    frame.  One-shot source timestamps remain untouched.
    """
    origin = action.frame_start
    if abs(origin) < 1e-6:
        return
    span = action.frame_end - origin
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.co.x -= origin
            point.handle_left.x -= origin
            point.handle_right.x -= origin
    action.frame_start = 0
    action.frame_end = span
    log("rebased looping action %s from frame %.4f to zero" % (action.name, origin))


curve_conditioning = {}
for spec in PLAN["animations"]:
    semantic = spec["semantic"]
    arm.animation_data_clear() if arm.animation_data else None
    select_only(arm)
    # PyNifly's HKX operator returns an empty set on success, so verify by action.
    if spec.get("paired_track_prefix") is not None:
        import_paired_actor(spec)
    else:
        bpy.ops.import_scene.pynifly_hkx(filepath=spec["hkx"], **RIG)
    action = arm.animation_data.action if arm.animation_data else None
    if action is None:
        raise RuntimeError("no action produced for %s (%s)" % (semantic, spec["hkx"]))
    removed_keys = remove_declared_quaternion_keys(
        action,
        spec.get("remove_quaternion_keys", []),
    )
    retime_to_native_duration(action, spec["hkx"])
    if removed_keys:
        curve_conditioning[semantic] = {"removedQuaternionKeys": removed_keys}
    if spec.get("looping"):
        rebase_loop_to_zero(action)
    # Stationary loops (idle/guard) are authored with a subtle, net-zero root
    # sway that keeps the feet planted; stripping it anyway freezes the torso
    # but leaves the (unchanged) leg curves to visibly slide the feet. Only
    # strip clips that need the controller to own 100% of the translation.
    if spec.get("preserve_root_motion"):
        delta = None
    elif spec.get("preserve_root_motion_axes"):
        delta = strip_root_motion(
            action,
            primary_root,
            keep_axes=tuple(spec["preserve_root_motion_axes"]),
        )
    elif spec.get("strip_vertical_root_motion"):
        # The physics controller owns this clip's height (jump arc). Strip the
        # authored vertical COM so the two do not add.
        delta = strip_root_motion(action, primary_root)
    else:
        delta = strip_root_motion(action, primary_root, keep_axes=DEFAULT_KEEP_AXES)
    merged = merge_auxiliary_animation(semantic, action)
    if merged:
        auxiliary_merges[semantic] = merged
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
SUMMARY["curveConditioning"] = curve_conditioning
SUMMARY["auxiliaryMerges"] = auxiliary_merges
log("imported %d animations" % len(durations))

# ---------------------------------------------------------------------------
# 6. Runtime support envelopes
# ---------------------------------------------------------------------------
# Runtime must know where the final *visible surface* is, rather than treating
# a foot-bone origin as the sole. Sample the already-normalised actions and
# final evaluated/skinned meshes once at build time. The game interpolates this
# compact curve; it never performs full-mesh skinning/bounds work per frame.


def evaluated_world_coordinates(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    deformed = evaluated.to_mesh()
    try:
        count = len(deformed.vertices)
        if count == 0:
            return None
        coordinates = np.empty(count * 3, dtype=np.float64)
        deformed.vertices.foreach_get("co", coordinates)
        coordinates.shape = (count, 3)
        matrix = evaluated.matrix_world
        world = np.empty_like(coordinates)
        for axis in range(3):
            world[:, axis] = (
                coordinates[:, 0] * matrix[axis][0]
                + coordinates[:, 1] * matrix[axis][1]
                + coordinates[:, 2] * matrix[axis][2]
                + matrix[axis][3]
            )
        return world
    finally:
        evaluated.to_mesh_clear()


support_envelopes = {}
animation_specs_by_semantic = {
    spec["semantic"]: spec for spec in PLAN["animations"]
}
depsgraph = bpy.context.evaluated_depsgraph_get()
sole_marker_bones = (
    ("footL", "NPC Foot [ft ].L"),
    ("footR", "NPC Foot [ft ].R"),
    ("toeL", "NPC Toe0 [Toe].L"),
    ("toeR", "NPC Toe0 [Toe].R"),
)
missing_sole_markers = [name for _, name in sole_marker_bones if arm.pose.bones.get(name) is None]
if missing_sole_markers:
    raise RuntimeError("support-envelope sole markers missing: %s" % ", ".join(missing_sole_markers))
sole_marker_vertex_indices = {}
for marker_id, bone_name in sole_marker_bones:
    marker_mesh_indices = []
    for obj in meshes:
        group = obj.vertex_groups.get(bone_name)
        if group is None:
            continue
        indices = np.array([
            vertex.index
            for vertex in obj.data.vertices
            if any(
                membership.group == group.index and membership.weight > 0.01
                for membership in vertex.groups
            )
        ], dtype=np.int32)
        if len(indices):
            marker_mesh_indices.append((obj, indices))
    if not marker_mesh_indices:
        raise RuntimeError("support-envelope marker %s has no weighted visible vertices" % bone_name)
    sole_marker_vertex_indices[marker_id] = marker_mesh_indices
    log("support marker %s: %d weighted vertices" % (
        marker_id,
        sum(len(indices) for _, indices in marker_mesh_indices),
    ))
#: Fraction of a clip's foot-height range that still counts as planted. Wide
#: enough to survive a heel-strike/toe-off roll, tight enough to exclude swing.
STANCE_HEIGHT_BAND = 0.18


def measure_authored_ground_speed(planar_by_id, height_by_id, sample_rate):
    """Median planar speed of a planted sole marker, in armature units/second."""
    speeds = []
    for marker_id, planar in planar_by_id.items():
        heights = height_by_id[marker_id]
        if len(planar) < 3:
            continue
        lowest, highest = min(heights), max(heights)
        threshold = lowest + (highest - lowest) * STANCE_HEIGHT_BAND
        for index in range(1, len(planar) - 1):
            if heights[index] > threshold:
                continue
            previous, following = planar[index - 1], planar[index + 1]
            speeds.append(math.hypot(
                (following[0] - previous[0]) * sample_rate / 2.0,
                (following[1] - previous[1]) * sample_rate / 2.0,
            ))
    if not speeds:
        return 0.0
    speeds.sort()
    middle = len(speeds) // 2
    median = (speeds[middle] if len(speeds) % 2
              else (speeds[middle - 1] + speeds[middle]) / 2.0)
    return round(float(median), 6)


for semantic in SUMMARY["animationNames"]:
    action = bpy.data.actions.get(semantic)
    if action is None:
        raise RuntimeError("cannot sample missing action %s" % semantic)
    if arm.animation_data is None:
        arm.animation_data_create()
    reset_armature_pose(arm)
    arm.animation_data.action = action
    frame_start, frame_end = action.frame_range
    source_duration = (frame_end - frame_start) / bpy.context.scene.render.fps
    animation_spec = animation_specs_by_semantic[semantic]
    support_sample_rate = int(animation_spec.get(
        "support_sample_rate",
        bpy.context.scene.render.fps,
    ))
    sample_count = max(
        2,
        int(round(source_duration * support_sample_rate)) + 1,
    )
    surface_min_z = []
    sole_marker_min_z = []
    sole_marker_z_by_id = {marker_id: [] for marker_id, _ in sole_marker_bones}
    sole_marker_clearance_z_by_id = {marker_id: [] for marker_id, _ in sole_marker_bones}
    sole_marker_point_bone_local_by_id = {marker_id: [] for marker_id, _ in sole_marker_bones}
    sole_marker_planar_by_id = {marker_id: [] for marker_id, _ in sole_marker_bones}
    contact_meshes = []
    for sample in range(sample_count):
        source_time = min(source_duration, sample / support_sample_rate)
        frame = frame_start + source_time * bpy.context.scene.render.fps
        whole_frame = math.floor(frame)
        bpy.context.scene.frame_set(whole_frame, subframe=frame - whole_frame)
        bpy.context.view_layer.update()
        minimum = None
        contact_mesh = None
        world_coordinates = {}
        for obj in meshes:
            coordinates = evaluated_world_coordinates(obj, depsgraph)
            world_coordinates[obj.name] = coordinates
            value = None if coordinates is None else float(np.min(coordinates[:, 2]))
            if value is not None and (minimum is None or value < minimum):
                minimum = value
                contact_mesh = obj.name
        if minimum is None:
            raise RuntimeError("%s: no visible mesh vertices for support envelope" % semantic)
        surface_min_z.append(round(minimum, 6))
        marker_translation = {
            marker_id: (arm.matrix_world @ arm.pose.bones[name].matrix).translation
            for marker_id, name in sole_marker_bones
        }
        for marker_id, translation in marker_translation.items():
            sole_marker_planar_by_id[marker_id].append(
                (float(translation.x), float(translation.y))
            )
        marker_z = {
            marker_id: translation.z
            for marker_id, translation in marker_translation.items()
        }
        sole_marker_min_z.append(round(min(marker_z.values()), 6))
        for marker_id, value in marker_z.items():
            sole_marker_z_by_id[marker_id].append(round(value, 6))
            local_surface = None
            local_surface_point = None
            for obj, indices in sole_marker_vertex_indices[marker_id]:
                coordinates = world_coordinates[obj.name][indices]
                candidate_index = int(np.argmin(coordinates[:, 2]))
                candidate_point = coordinates[candidate_index]
                if local_surface is None or candidate_point[2] < local_surface:
                    local_surface = float(candidate_point[2])
                    local_surface_point = candidate_point
            if local_surface is None or local_surface_point is None:
                raise RuntimeError("support-envelope marker %s has no evaluated vertices" % marker_id)
            sole_marker_clearance_z_by_id[marker_id].append(
                round(max(0.0, value - local_surface), 6)
            )
            bone_name = next(name for candidate_id, name in sole_marker_bones if candidate_id == marker_id)
            bone_world = arm.matrix_world @ arm.pose.bones[bone_name].matrix
            bone_local_point = bone_world.inverted() @ Vector(tuple(local_surface_point))
            sole_marker_point_bone_local_by_id[marker_id].append([
                round(float(bone_local_point.x), 6),
                round(float(bone_local_point.y), 6),
                round(float(bone_local_point.z), 6),
            ])
        contact_meshes.append(contact_mesh)
    support_envelopes[semantic] = {
        # Speed at which this clip's authored stride wants the world to move
        # under it (armature units per second, pre runtime scale). A locomotion
        # clip played at any other ground speed skates; the runtime divides the
        # actor's real speed by this to time-scale the cycle. Measured, never
        # authored: while a foot is planted its planar velocity relative to the
        # in-place root *is* the intended ground speed, so take the median of
        # that over every stance sample. Non-locomotion actions measure ~0 and
        # the runtime ignores them.
        "authoredGroundSpeed": measure_authored_ground_speed(
            sole_marker_planar_by_id,
            sole_marker_z_by_id,
            support_sample_rate,
        ),
        # Blender's glTF exporter preserves absolute action-frame time. PyNifly
        # actions begin on frame 1, so the exported clip holds its first pose
        # from runtime t=0 until this timestamp. Preserve the actual sample
        # origin instead of silently treating the second pose as t=1/30.
        "sampleStartTimeSeconds": round(frame_start / bpy.context.scene.render.fps, 7),
        "sampleIntervalSeconds": round(1.0 / support_sample_rate, 7),
        "surfaceMinZ": surface_min_z,
        # Runtime uses the actual blended foot/toe origins plus this baked
        # marker-to-visible-surface clearance during penetration-mode fades.
        # That catches a cross-faded foot arc without per-frame mesh skinning.
        "soleMarkerMinZ": sole_marker_min_z,
        # Preserve marker identity across blends. Taking min(marker) separately
        # in each endpoint can silently pair a left-toe sample with a right-heel
        # runtime pose and either miss penetration or lift a clear transition.
        "soleMarkerZById": sole_marker_z_by_id,
        # Per-marker clearance to vertices actually weighted by that bone. A
        # global surface can belong to the opposite foot; using it for every
        # marker badly over-lifts ordinary crossfades.
        "soleMarkerClearanceZById": sole_marker_clearance_z_by_id,
        # A scalar vertical clearance loses the heel/toe point's horizontal
        # offset when a crossfade rotates the foot. Preserve the actual lowest
        # nearby visible point in that marker bone's local 3D frame so runtime
        # can transform it through the real blended bone pose in O(1).
        "soleMarkerPointBoneLocalById": sole_marker_point_bone_local_by_id,
        # Diagnostic-only provenance for identifying whether a hand, foot, or
        # body surface owns contact. The runtime manifest omits this array.
        "contactMeshes": contact_meshes,
    }
    log("%s: sampled %d visible-surface support poses" % (semantic, sample_count))

if arm.animation_data is not None:
    arm.animation_data.action = None
bpy.context.scene.frame_set(0)
bpy.context.view_layer.update()
SUMMARY["supportEnvelopes"] = support_envelopes

# ---------------------------------------------------------------------------
# 6b. Skeleton-fitted hurtbox
# ---------------------------------------------------------------------------
# A generic capsule is a poor hurtbox: it misses an outstretched limb and
# swallows the gap under a raised arm. Fit the actual body instead, and fit it
# *automatically* so an arbitrary new skeleton and silhouette needs no hand
# authoring: every bone claims the vertices it dominates, small claims are
# folded into their parent (which folds fingers into the hand and twist bones
# into the forearm without naming any of them), and each surviving group gets
# the capsule that encloses its own skin in bind pose.

#: A bone earns its own capsule only if it spans a real length of body between
#: its head and its children. As a fraction of actor height this is
#: skeleton-agnostic: it keeps spine, limb and neck segments and folds finger,
#: twist, eye and toe bones into their parent without naming any of them.
HURTBOX_MIN_LENGTH_FRACTION = 0.03
#: A fitted capsule must own at least this much skin once its merged children
#: are included. Drops helper and root bones, which own none.
HURTBOX_MIN_VERTICES = 8
#: Percentile of perpendicular distance used as the capsule radius. A hurtbox
#: is a *bounding* volume, not an inscribed one - a weapon that visibly crosses
#: the silhouette must connect - so this sits just below 100, high enough to
#: enclose the skin and low enough that one stray vertex cannot inflate a limb.
HURTBOX_RADIUS_PERCENTILE = 98
#: Capsules thinner than this fraction of actor height are noise, not body.
HURTBOX_MIN_RADIUS_FRACTION = 0.01


def _bone_span(bone):
    """Anatomical head->children span in world space, or None for a leaf.

    A leaf bone has no span: PyNifly gives every bone the same arbitrary tail
    length, so a leaf's "length" says nothing about the body it covers.
    """
    if not bone.children:
        return None
    head = arm.matrix_world @ bone.head_local
    # Farthest child, not the average of them: twist and helper bones start at
    # their parent's head, so averaging collapses a real limb to nothing.
    end, reach = None, 0.0
    for child in bone.children:
        point = arm.matrix_world @ child.head_local
        distance = (point - head).length
        if distance > reach:
            end, reach = point, distance
    return (head, end) if end is not None and reach > 1e-6 else None


#: A vertex belongs to every bone that moves a meaningful share of it, not
#: only the single highest. Dominant-weight-only claiming starves any bone that
#: shares its skin with a twist or helper partner - which is most limb bones -
#: and leaves whole arms out of the fitted volume.
HURTBOX_CLAIM_WEIGHT = 0.3


def _bind_pose_vertices_by_bone():
    """Bind-pose world coordinates grouped by the bones that move them."""
    claims = {}
    for obj in BODY_MESHES:
        index_to_bone = {group.index: group.name for group in obj.vertex_groups}
        matrix = obj.matrix_world
        for vertex in obj.data.vertices:
            position = matrix @ vertex.co
            claimed = False
            best_group, best_weight = None, 0.0
            for membership in vertex.groups:
                bone_name = index_to_bone.get(membership.group)
                if bone_name is None or bone_name not in arm.data.bones:
                    continue
                if membership.weight > best_weight:
                    best_group, best_weight = bone_name, membership.weight
                if membership.weight >= HURTBOX_CLAIM_WEIGHT:
                    claims.setdefault(bone_name, []).append(position)
                    claimed = True
            # A vertex smeared across many bones still belongs to its strongest.
            if not claimed and best_group is not None:
                claims.setdefault(best_group, []).append(position)
    return claims


def _merge_into_body_parts(claims, spans):
    """Fold every bone that is not its own body part into its kept ancestor."""
    merged = {name: [] for name in spans}
    for name, points in claims.items():
        target = name if name in spans else None
        if target is None:
            ancestor = arm.data.bones[name].parent
            while ancestor is not None and ancestor.name not in spans:
                ancestor = ancestor.parent
            target = ancestor.name if ancestor is not None else None
        if target is not None:
            merged[target].extend(points)
    return merged


def _fit_capsule(bone, span, points, min_radius):
    """Capsule enclosing `points` around a bone's bind-pose anatomical span."""
    head, end = span
    direction = (end - head).normalized()
    along, perpendicular = [], []
    for point in points:
        offset = point - head
        projection = offset.dot(direction)
        along.append(projection)
        perpendicular.append((offset - direction * projection).length)
    perpendicular.sort()
    rank = min(len(perpendicular) - 1,
               int(round((HURTBOX_RADIUS_PERCENTILE / 100.0) * (len(perpendicular) - 1))))
    radius = float(perpendicular[rank])
    if radius < min_radius:
        return None
    # Span the full extent of the skin this bone claims. The hemispherical caps
    # reach a further `radius` beyond each end, which is the intended slight
    # generosity: an inscribed capsule leaves gaps between body parts that an
    # attack visibly crossing the silhouette can pass straight through.
    low, high = min(along), max(along)
    # World -> bone-local, exactly as the sole markers do: both the point and
    # the bone carry the same Blender->glTF axis conversion, so the resulting
    # coordinates survive export and can be pushed through the live animated
    # bone at runtime. They stay in unscaled bone units for the same reason.
    to_bone_local = (arm.matrix_world @ bone.matrix_local).inverted()
    return {
        "bone": bone.name,
        "from": [round(float(v), 6) for v in (to_bone_local @ (head + direction * low))],
        "to": [round(float(v), 6) for v in (to_bone_local @ (head + direction * high))],
        "radius": round(radius, 6),
        # World-space half-length of the cylinder between the caps, so the
        # runtime never has to re-derive the actor's scale to size a collider.
        "halfLength": round(max(0.0, (high - low) / 2.0), 6),
        "vertices": len(points),
    }


_bind_bounds = [
    (obj.matrix_world @ vertex.co).z
    for obj in meshes
    for vertex in obj.data.vertices
]
_actor_height = max(1e-6, max(_bind_bounds) - min(_bind_bounds))
_min_span = _actor_height * HURTBOX_MIN_LENGTH_FRACTION
_spans = {}
for _bone in arm.data.bones:
    _span = _bone_span(_bone)
    if _span is not None and (_span[1] - _span[0]).length >= _min_span:
        _spans[_bone.name] = _span
hurtbox_segments = []
for _bone_name, _points in sorted(
    _merge_into_body_parts(_bind_pose_vertices_by_bone(), _spans).items()
):
    if len(_points) < HURTBOX_MIN_VERTICES:
        continue
    _fitted = _fit_capsule(
        arm.data.bones[_bone_name],
        _spans[_bone_name],
        _points,
        _actor_height * HURTBOX_MIN_RADIUS_FRACTION,
    )
    if _fitted is not None:
        hurtbox_segments.append(_fitted)
if not hurtbox_segments:
    raise RuntimeError("hurtbox fitting produced no segments")
SUMMARY["hurtboxSegments"] = hurtbox_segments
log("hurtbox: %d capsules over a %.3f-unit bind pose" % (len(hurtbox_segments), _actor_height))
for _segment in hurtbox_segments:
    log("  hurtbox %-28s r=%.3f verts=%d" % (_segment["bone"], _segment["radius"], _segment["vertices"]))

# ---------------------------------------------------------------------------
# 7. Diagnostics: sockets, bbox
# ---------------------------------------------------------------------------
SUMMARY["armature"] = arm.name
SUMMARY["boneCount"] = bone_count
SUMMARY["boneNames"] = [b.name for b in arm.data.bones]
SUMMARY["meshNames"] = [m.name for m in meshes]
SUMMARY["meshRoles"] = {m.name: MESH_ROLES.get(m.name, "body") for m in meshes}
SUMMARY["skinMeshes"] = sorted(
    m.name for m in meshes
    if any(_is_skin(s.material.node_tree.nodes[n].image)
           for s in m.material_slots if s.material and s.material.use_nodes
           for n in [nd.name for nd in s.material.node_tree.nodes
                     if nd.type == "TEX_IMAGE" and nd.image])
)
SUMMARY["hairMeshes"] = sorted(
    m.name for m in meshes if MESH_ROLES.get(m.name) == "hair"
)
# Which biped slot each body mesh occupies, read from the NIF's own dismember
# partitions. Armour reports the slots it covers the same way, so "does this
# cuirass hide the torso" is answered by two pieces of art agreeing rather than
# by a hand-written table of mesh names.
_BIPED_SLOT = re.compile(r"^SBP_(\d+)_", re.IGNORECASE)
SUMMARY["meshBipedSlots"] = {
    mesh.name: sorted({
        int(match.group(1)) % 100
        for group in mesh.vertex_groups
        for match in [_BIPED_SLOT.match(group.name)] if match
    })
    for mesh in meshes
}
SUMMARY["sockets"] = {}
for key, bone_name in PLAN["sockets"].items():
    SUMMARY["sockets"][key] = bone_name in arm.data.bones

# Measure a declared neutral standing pose, not whichever action happened to be
# sampled last. The old object.bound_box read after animation import made the
# runtime scale depend on manifest ordering (an audition ending in JUMP_LAND
# produced a radically different scale from one ending in DEATH). Isolated
# audition plans may omit the production reference action; only those fall back
# to the rig's stable bind pose.
scale_reference = PLAN.get("scale_reference") or {}
scale_semantic = scale_reference.get("semantic")
scale_source_time = float(scale_reference.get("sourceTime", 0))
scale_action = bpy.data.actions.get(scale_semantic) if scale_semantic else None
if scale_action is not None:
    scale_duration = (scale_action.frame_range[1] - scale_action.frame_range[0]) / bpy.context.scene.render.fps
    if scale_source_time < 0 or scale_source_time > scale_duration:
        raise RuntimeError(
            "scale reference %s time %.4f outside duration %.4f"
            % (scale_semantic, scale_source_time, scale_duration)
        )
    reset_armature_pose(arm)
    arm.animation_data.action = scale_action
    scale_frame = scale_action.frame_range[0] + scale_source_time * bpy.context.scene.render.fps
    whole_scale_frame = math.floor(scale_frame)
    bpy.context.scene.frame_set(
        whole_scale_frame,
        subframe=scale_frame - whole_scale_frame,
    )
    SUMMARY["bboxReference"] = {
        "mode": "animation",
        "semantic": scale_semantic,
        "sourceTime": scale_source_time,
    }
else:
    if arm.animation_data is not None:
        arm.animation_data.action = None
    arm.data.pose_position = "REST"
    SUMMARY["bboxReference"] = {"mode": "bind-pose"}
    if scale_semantic:
        log("scale reference %s absent from audition; using bind pose" % scale_semantic)
bpy.context.view_layer.update()
mins = [1e9, 1e9, 1e9]
maxs = [-1e9, -1e9, -1e9]
depsgraph = bpy.context.evaluated_depsgraph_get()
for obj in BODY_MESHES:
    evaluated = obj.evaluated_get(depsgraph)
    deformed = evaluated.to_mesh()
    try:
        coordinates = np.empty(len(deformed.vertices) * 3, dtype=np.float64)
        deformed.vertices.foreach_get("co", coordinates)
        coordinates.shape = (-1, 3)
        matrix = evaluated.matrix_world
        for axis in range(3):
            values = (
                coordinates[:, 0] * matrix[axis][0]
                + coordinates[:, 1] * matrix[axis][1]
                + coordinates[:, 2] * matrix[axis][2]
                + matrix[axis][3]
            )
            mins[axis] = min(mins[axis], float(np.min(values)))
            maxs[axis] = max(maxs[axis], float(np.max(values)))
    finally:
        evaluated.to_mesh_clear()
SUMMARY["bboxSize"] = [round(maxs[i] - mins[i], 4) for i in range(3)]
SUMMARY["bboxExcludes"] = sorted(m.name for m in meshes if m not in BODY_MESHES)
reset_armature_pose(arm)

# ---------------------------------------------------------------------------
# 8. Export GLB (no cameras/lights)
# ---------------------------------------------------------------------------
def set_action_allowlist(kept):
    """Restrict the next glTF export to `kept` action names, or all if None.

    The exporter has no "these actions only" argument. What it does have is the
    Scene-level filter its UI checkbox list is backed by, consulted on every
    path that can contribute an action — the active action, NLA strips, and the
    single-armature "include everything" sweep this build relies on. Registering
    the property here rather than letting the operator do it is what lets the
    collection be *populated* before the export runs; the operator only creates
    it when it is absent, so it will not clobber ours.
    """
    scene = bpy.data.scenes[0]
    if not hasattr(bpy.types.Scene, "gltf_action_filter"):
        from io_scene_gltf2 import GLTF2_filter_action
        bpy.types.Scene.gltf_action_filter = bpy.props.CollectionProperty(type=GLTF2_filter_action)
        bpy.types.Scene.gltf_action_filter_active = bpy.props.IntProperty()
    scene.gltf_action_filter.clear()
    if kept is None:
        return False
    allowed = set(kept)
    missing = allowed - set(bpy.data.actions.keys())
    if missing:
        raise RuntimeError("export pack names unknown actions: %s" % sorted(missing))
    for action in bpy.data.actions:
        item = scene.gltf_action_filter.add()
        item.action = action
        item.keep = action.name in allowed
    return True


def export_glb(path, *, animations, meshes_included, actions=None):
    """Export one GLB.

    Animations and skinned bodies are separable products of the same build: a
    rig carries the motion every character shares, a race carries only its own
    skin. Keeping them in one file would duplicate three megabytes of authored
    animation for every race that exists, so the plan names which of the two
    (or both) it wants.

    `actions` narrows an animation export to one *pack* — a slice of the clip
    set an actor only downloads if it can actually play it. The skeleton is
    re-emitted in every pack (a hundred nodes, next to nothing) because glTF
    animation channels address nodes by index and a pack has to be a valid
    document on its own.
    """
    filtered = set_action_allowlist(actions if animations else None)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    if meshes_included:
        for obj in meshes:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    log("exporting GLB (animations=%s meshes=%s clips=%s) -> %s" % (
        animations, meshes_included, "all" if actions is None else len(actions), path))
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_action_filter=filtered,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_morph=False,
        export_animations=animations,
        export_animation_mode="ACTIONS",
        export_nla_strips=False,
        export_bake_animation=False,
        export_optimize_animation_size=True,
        # Skin and armour diffuses are opaque and rebuilt base-colour only.
        # PNG made the character five times the size it needs to be.
        export_image_format="JPEG",
        export_jpeg_quality=88,
    )


exports = PLAN.get("exports") or [{
    "path": PLAN["output_glb"], "animations": True, "meshes": True,
}]
out = PLAN["output_glb"]
for export in exports:
    export_glb(
        export["path"],
        animations=bool(export.get("animations", True)) and bool(PLAN["animations"]),
        meshes_included=bool(export.get("meshes", True)),
        actions=export.get("actions"),
    )
SUMMARY["exports"] = [export["path"] for export in exports]
SUMMARY["outputGlb"] = out
open(os.environ.get("SUMMARY_JSON", PLAN["summary_json"]), "w", encoding="utf-8").write(
    json.dumps(SUMMARY, indent=2)
)
print("SUMMARY_WRITTEN")
