"""Headless Blender batch builder for wearable, skinned armour GLBs.

Armour is not a prop: every piece is skinned to the same rig the body is, so it
is imported onto the production skeleton and exported with it. The game mounts
the piece by rebinding it onto the actor's own skeleton, which is only valid
because both were built against this one.

Each piece also reports which biped slots it occupies, read from the ``SBP_*``
vertex groups Bethesda ships in the NIF. That is what tells the game which body
meshes to hide, so coverage is never hand-declared and cannot drift from the art.

A cuirass also has its **collar closed against the reference body's neck**. The
head is already stitched onto that same polyline by the character build, so one
shared loop closes head to body to armour. Without it the head hangs clear of
the collar and the scene's clear colour shows through: the white ring at the
base of an enemy's neck. See ``neck_seam.py``.

Env: BUILD_PLAN -> json with keys skeleton, rig_import, mesh_import,
reference_bodies{}, items[], summary_json.
"""

import bpy
import json
import os
import re
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from neck_seam import (  # noqa: E402
    closest_point_on_segments, find_collar_rings, neck_axis, neck_polyline,
    polyline_radius, raise_polyline, ring_profile, snap_ring,
)

#: How far the collar is lifted above the reference neck, as a share of the
#: neck's radius. The roster's neck rings span 0.055 radii in height, so this
#: clears the highest of them with room to spare while staying a few
#: millimetres of overlap rather than a collar that swallows the neck.
COLLAR_OVERLAP = 0.15

PLAN = json.loads(open(os.environ["BUILD_PLAN"], "r", encoding="utf-8").read())
SUMMARY = {"items": {}, "warnings": []}

_MAP_SUFFIXES = ("_n", "_msn", "_s", "_sk", "_g", "_m", "_em", "_e", "_b")
_BIPED_SLOT = re.compile(r"^SBP_(\d+)_", re.IGNORECASE)
ICON_SIZE = int(PLAN.get("icon_size", 160))


def log(message):
    print("[armour] " + message)


def warn(message):
    SUMMARY["warnings"].append(message)
    print("[armour] WARNING " + message)


def is_diffuse(image):
    base = os.path.splitext(os.path.basename(image.filepath or image.name))[0].lower()
    return not base.endswith(_MAP_SUFFIXES)


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
            shader.inputs["Metallic"].default_value = 0.45
            shader.inputs["Roughness"].default_value = 0.45
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
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


def render_icon(objects, path):
    """Same framing rules as the arsenal, so one grid reads as one set."""
    low, high = world_bounds(objects)
    centre = (low + high) * 0.5
    reach = max((high - low).length, 1e-3)

    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("IconCam")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new("IconCam", camera_data)
    scene.collection.objects.link(camera)
    direction = Vector((0.62, -1.0, 0.42)).normalized()
    camera.location = centre + direction * reach * 2.0
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    basis = camera.matrix_world.to_3x3()
    right, up = basis.col[0].normalized(), basis.col[1].normalized()
    extent = 0.0
    for obj in objects:
        for corner in obj.bound_box:
            offset = (obj.matrix_world @ Vector(corner)) - centre
            extent = max(extent, abs(offset.dot(right)), abs(offset.dot(up)))
    camera_data.ortho_scale = max(extent * 2.12, 1e-3)

    lights = []
    for offset, energy in ((Vector((1.2, -1.6, 1.4)), 6.0),
                           (Vector((-1.5, -0.9, 0.5)), 3.0),
                           (Vector((-0.4, 1.4, 1.0)), 2.5)):
        light_data = bpy.data.lights.new("IconLight", "SUN")
        light_data.energy = energy
        light = bpy.data.objects.new("IconLight", light_data)
        scene.collection.objects.link(light)
        light.location = centre + offset * reach
        light.rotation_euler = (centre - light.location).to_track_quat("-Z", "Y").to_euler()
        lights.append(light)

    world = bpy.data.worlds.new("IconWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[1].default_value = 3.0
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(PLAN.get("icon_samples", 24))
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x = ICON_SIZE
    scene.render.resolution_y = ICON_SIZE
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for obj in [camera, *lights]:
        bpy.data.objects.remove(obj, do_unlink=True)


bpy.ops.preferences.addon_enable(module=PLAN.get("addon", "io_scene_nifly"))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.scene.render.fps = 30

log("importing skeleton")
bpy.ops.import_scene.pynifly_hkx(filepath=PLAN["skeleton"], **PLAN["rig_import"])
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]

# The production skeleton, snapshotted before any garment touches it. Importing
# an armour NIF *adds* bones to the armature for any skin partition whose name
# the rig does not have, and Bethesda's meshes contain truncated names (a
# "NPC R Pauldro" for "NPC R Pauldron"). Left alone those strays are exported as
# real joints, and the game cannot rebind the piece onto an actor's skeleton
# because that joint does not exist there. Everything below keeps the armature
# equal to this set.
RIG_BONES = sorted(b.name for b in arm.data.bones)
RIG_BONE_SET = set(RIG_BONES)
log("rig bones: %d" % len(RIG_BONES))


def rig_bone_for(name):
    """The rig bone a stray skin group meant, or None if it is unrecoverable."""
    if name in RIG_BONE_SET:
        return name
    candidates = [b for b in RIG_BONES if b.startswith(name) or name.startswith(b)]
    return candidates[0] if len(candidates) == 1 else None


def reunite_with_rig(objects, item_id):
    """Rename stray skin groups onto the rig, then delete the bones they made."""
    for obj in objects:
        for group in list(obj.vertex_groups):
            if _BIPED_SLOT.match(group.name) or group.name in RIG_BONE_SET:
                continue
            target = rig_bone_for(group.name)
            if target is None:
                warn("%s: skin group %r matches no rig bone; weights dropped"
                     % (item_id, group.name))
                obj.vertex_groups.remove(group)
                continue
            log("%s: skin group %r -> %r" % (item_id, group.name, target))
            existing = obj.vertex_groups.get(target)
            if existing is not None:
                # Both spellings present: fold the stray into the real one.
                for vertex in obj.data.vertices:
                    for element in vertex.groups:
                        if element.group == group.index:
                            existing.add([vertex.index], element.weight, "ADD")
                obj.vertex_groups.remove(group)
            else:
                group.name = target

    strays = [b.name for b in arm.data.bones if b.name not in RIG_BONE_SET]
    if not strays:
        return
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name in strays:
        bone = arm.data.edit_bones.get(name)
        if bone is not None:
            arm.data.edit_bones.remove(bone)
    bpy.ops.object.mode_set(mode="OBJECT")
    log("%s: removed stray bones %s" % (item_id, strays))

def load_reference_body(sex, entry):
    """Import a reference body and take its neck polyline. Never exported.

    The host side chooses the *weight-zero* body and says why: a collar wider
    than the neck it is worn on leaves a hole, a narrower one is covered by
    skin, and one armour GLB is worn over every build's own blended neck.
    """
    existing = set(bpy.data.objects)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    result = bpy.ops.import_scene.pynifly(filepath=entry["nif"], **entry["import"])
    if "FINISHED" not in result:
        raise RuntimeError("reference body %s failed to import (%s)" % (entry["id"], result))
    meshes = [o for o in bpy.data.objects if o not in existing and o.type == "MESH"]
    if not meshes:
        raise RuntimeError("reference body %s produced no mesh" % entry["id"])
    reunite_with_rig(meshes, "reference-body:" + entry["id"])
    skin = max(meshes, key=lambda o: len(o.data.vertices))
    segments, vertices = neck_polyline(skin)
    if not segments:
        raise RuntimeError("reference body %s has no open neck boundary" % entry["id"])
    radius = polyline_radius(segments)
    log("reference body %s (%s): neck ring %d verts, radius %.4f"
        % (entry["id"], sex, len(vertices), radius))
    return {"objects": meshes, "skin": skin, "segments": segments,
            "vertices": vertices, "radius": radius, "id": entry["id"]}


REFERENCE_BODIES = {
    sex: load_reference_body(sex, entry)
    for sex, entry in sorted(PLAN.get("reference_bodies", {}).items())
}


def close_neck_seam(pieces, item):
    """Snap this piece's collar onto the reference neck, weights and all."""
    sex = item.get("body_sex", "male")
    body = REFERENCE_BODIES.get(sex) or REFERENCE_BODIES.get("male")
    if body is None:
        warn("%s: no reference body for sex %r; collar not closed" % (item["id"], sex))
        return None
    if sex not in REFERENCE_BODIES:
        warn("%s: no %s reference body; collar closed against %s"
             % (item["id"], sex, body["id"]))
    # A sanity bound, not the discriminator: the encirclement test in
    # `find_collar_rings` is what decides a ring is the collar, and a vanilla
    # collar genuinely sits a long way out — steel's raised rim is 0.30 units
    # from the neck, which is exactly the gap being complained about. This only
    # refuses a ring so far from the neck that the encirclement test must have
    # been fooled.
    move_limit = body["radius"] * 1.5
    # Snapped to the neck lifted by COLLAR_OVERLAP, so the rim ends *inside*
    # the neck of every build rather than butting against one of them.
    neck_centre, neck_radius = neck_axis(body["segments"])
    target = raise_polyline(body["segments"], neck_radius * COLLAR_OVERLAP)
    before, after, rings, near_misses, profiles = [], [], 0, [], []
    for obj in pieces:
        found, rejected = find_collar_rings(obj, body["segments"])
        near_misses.extend(rejected)
        if not found:
            continue
        # One collar per mesh: the innermost encircling ring, which is the one
        # the head's neck meets. Outer concentric rings are the piece's own
        # layers and are left exactly as authored.
        ranked = []
        for ring in found:
            distances = [
                closest_point_on_segments(
                    obj.matrix_world @ obj.data.vertices[i].co, body["segments"])[1]
                for i in ring
            ]
            ranked.append((sum(distances) / len(distances), max(distances), ring))
        ranked.sort(key=lambda entry: entry[0])
        mean_distance, max_distance, ring = ranked[0]
        if max_distance > move_limit:
            near_misses.append((len(ring), round(float(mean_distance), 4),
                                round(float(max_distance), 4), -1))
            continue
        moved_before, moved_after = snap_ring(obj, ring, body["skin"], target)
        before.extend(moved_before)
        after.extend(moved_after)
        profiles.append(ring_profile(obj, ring, neck_centre))
        rings += 1
    if not before:
        # Not a failure by itself: elven and daedric are closed-neck designs
        # with no opening at the neck at all. The near misses are the measured
        # evidence for that, so the gate can tell "no collar" from "missed it".
        log("%s: no ring encircles the neck; %d near miss(es) %s"
            % (item["id"], len(near_misses), sorted(near_misses)[:6]))
        return {"referenceBody": body["id"], "bodySex": sex, "rings": 0,
                "snappedVertices": 0, "collar": "none",
                "nearMisses": sorted(near_misses)[:12]}
    seam = {
        "collar": "stitched",
        "referenceBody": body["id"],
        "bodySex": sex,
        "rings": rings,
        "snappedVertices": len(before),
        "bodyVertices": len(body["vertices"]),
        "maxDistanceBefore": round(float(max(before)), 6),
        "meanDistanceBefore": round(float(sum(before) / len(before)), 6),
        # Measured again on the moved geometry, not asserted.
        "maxDistanceAfter": round(float(max(after)), 8),
    }
    # The overlap, measured on the finished collar rather than assumed from the
    # constant: its widest rim against the reference neck it must stay inside,
    # and its lowest rim against the neck ring it must end above. These are what
    # the host-side gate checks.
    seam["referenceNeckRadius"] = round(float(neck_radius), 6)
    seam["referenceNeckHeight"] = round(float(neck_centre.z), 6)
    seam["collarRadius"] = round(float(max(radius for _c, radius in profiles)), 6)
    seam["collarHeight"] = round(float(min(centre.z for centre, _r in profiles)), 6)
    log("%s: collar stitched %d verts across %d ring(s), %.5f -> %.8f; "
        "radius %.4f vs neck %.4f, height %.4f vs neck %.4f"
        % (item["id"], seam["snappedVertices"], rings,
           seam["maxDistanceBefore"], seam["maxDistanceAfter"],
           seam["collarRadius"], seam["referenceNeckRadius"],
           seam["collarHeight"], seam["referenceNeckHeight"]))
    return seam


for item in PLAN["items"]:
    before = set(bpy.data.objects)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    result = bpy.ops.import_scene.pynifly(filepath=item["nif"], **PLAN["mesh_import"])
    if "FINISHED" not in result:
        warn("%s: import failed (%s)" % (item["id"], result))
        continue
    pieces = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not pieces:
        warn("%s: produced no mesh" % item["id"])
        continue

    for image in bpy.data.images:
        if image.source == "FILE" and image.filepath:
            try:
                image.reload()
            except RuntimeError:
                pass
    rebuild_materials(pieces)
    reunite_with_rig(pieces, item["id"])
    # After the rig reunion, so the weights copied off the body land in groups
    # the exported skeleton actually has; before the export, obviously.
    neck_seam = close_neck_seam(pieces, item) if item.get("close_neck_seam") else None
    bpy.ops.file.pack_all()

    # Which body parts this piece hides, straight out of the art.
    covered = set()
    unbound = set()
    for obj in pieces:
        for group in obj.vertex_groups:
            match = _BIPED_SLOT.match(group.name)
            if match:
                # Bethesda writes some partitions as 1xx and some as xx for the
                # same slot; normalise so a helmet and a cuirass are comparable.
                covered.add(int(match.group(1)) % 100)
            elif group.name not in RIG_BONE_SET:
                unbound.add(group.name)
    if unbound:
        warn("%s: skin groups outside the rig: %s" % (item["id"], sorted(unbound)))
    if not covered:
        warn("%s: declares no biped slot; nothing will be hidden under it" % item["id"])

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for obj in pieces:
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
        export_animations=False,
        export_image_format="JPEG",
        export_jpeg_quality=88,
    )
    if PLAN.get("render_icons", True):
        render_icon(pieces, item["icon_png"])
    low, high = world_bounds(pieces)
    SUMMARY["items"][item["id"]] = {
        "meshes": [o.name for o in pieces],
        "coversBipedSlots": sorted(covered),
        "neckSeam": neck_seam,
        "sizeMeters": [round(high[0] - low[0], 5),
                       round(high[2] - low[2], 5),
                       round(high[1] - low[1], 5)],
    }
    log("%s meshes=%d slots=%s" % (item["id"], len(pieces), sorted(covered)))
    for obj in pieces:
        bpy.data.objects.remove(obj, do_unlink=True)

open(PLAN["summary_json"], "w", encoding="utf-8").write(json.dumps(SUMMARY, indent=2))
log("built %d pieces" % len(SUMMARY["items"]))
print("SUMMARY_WRITTEN")
