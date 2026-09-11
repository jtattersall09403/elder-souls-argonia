"""Headless Blender batch builder for wearable, skinned armour GLBs.

Armour is not a prop: every piece is skinned to the same rig the body is, so it
is imported onto the production skeleton and exported with it. The game mounts
the piece by rebinding it onto the actor's own skeleton, which is only valid
because both were built against this one.

Each piece also reports which biped slots it occupies, read from the ``SBP_*``
vertex groups Bethesda ships in the NIF. That is what tells the game which body
meshes to hide, so coverage is never hand-declared and cannot drift from the art.

Each piece is built **once per sex, at both weights**, exactly as Skyrim ships
it: the GLB carries the ``_1`` geometry with ``_0`` as a glTF morph target, and
the runtime sets ``morphTargetInfluences = 1 - weight`` for the wearer. A
vanilla cuirass embeds the body's neck-bearing part, bit-for-bit, so blending
to the right sex and weight makes the head-to-collar seam exact rather than
tolerance-bounded — nothing here deforms authored art to fit (decision 0056).

What is left of the old seam code is the **check**: each cuirass's own neck
ring is measured against the reference body's, for both weights, and the host
side rejects a ring wider than the neck it is worn on. See ``neck_seam.py``.

Env: BUILD_PLAN -> json with keys skeleton, rig_import, mesh_import,
reference_bodies{}, items[], summary_json.
"""

import bpy
import json
import os
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from biped_slots import (  # noqa: E402
    BIPED_SLOT as _BIPED_SLOT,
    fold_partitions,
    raw_partitions,
)
from neck_seam import (  # noqa: E402
    closest_point_on_segments, find_collar_rings, neck_axis, neck_polyline,
    polyline_radius,
)

#: The glTF morph target name the runtime looks for. One name, written here and
#: read in `ArmourAttachments`: the influence is set by index, and a rebuild
#: that silently reordered or renamed the target would blend towards nothing.
MORPH_TARGET_NAME = "weight0"

PLAN = json.loads(open(os.environ["BUILD_PLAN"], "r", encoding="utf-8").read())
SUMMARY = {"items": {}, "warnings": []}

_MAP_SUFFIXES = ("_n", "_msn", "_s", "_sk", "_g", "_m", "_em", "_e", "_b")
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
    """Import a reference body at both weights and take its neck rings.

    Never exported, and never touched by the build: this is the independent
    reference the exported geometry is measured against. Both weights, because
    both are shipped — the piece's ``_1`` geometry is checked against the ``_1``
    body and its ``_0`` morph target against the ``_0`` body.
    """
    weights = {}
    for weight, nif in sorted(entry["nifs"].items()):
        existing = set(bpy.data.objects)
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        result = bpy.ops.import_scene.pynifly(filepath=nif, **entry["import"])
        if "FINISHED" not in result:
            raise RuntimeError("reference body %s_%s failed to import (%s)"
                               % (entry["id"], weight, result))
        meshes = [o for o in bpy.data.objects if o not in existing and o.type == "MESH"]
        if not meshes:
            raise RuntimeError("reference body %s_%s produced no mesh" % (entry["id"], weight))
        reunite_with_rig(meshes, "reference-body:%s_%s" % (entry["id"], weight))
        skin = max(meshes, key=lambda o: len(o.data.vertices))
        segments, vertices = neck_polyline(skin)
        if not segments:
            raise RuntimeError("reference body %s_%s has no open neck boundary"
                               % (entry["id"], weight))
        centre, radius = neck_axis(segments)
        points = [point for segment in segments for point in segment[:2]]
        weights[weight] = {"segments": segments, "vertices": vertices,
                           "centre": centre, "radius": radius,
                           # The widest the neck gets, which is the statistic a
                           # ring's widest vertex has to be compared against.
                           # Comparing a max against a mean is how a ring that
                           # is a bit-for-bit copy of the neck reads as wider
                           # than it.
                           "maxRadius": max((point - centre).xy.length for point in points),
                           "extent": polyline_radius(segments),
                           "objects": meshes, "skin": skin}
        log("reference body %s_%s (%s): neck ring %d verts, mean radius %.4f, height %.4f"
            % (entry["id"], weight, sex, len(vertices), radius, centre.z))
    return {"id": entry["id"], "weights": weights}


REFERENCE_BODIES = {
    sex: load_reference_body(sex, entry)
    for sex, entry in sorted(PLAN.get("reference_bodies", {}).items())
}


def ring_radius(points, axis):
    """A ring's widest radius about the neck axis, and its mean height."""
    widest = max((point - axis).xy.length for point in points)
    height = sum(point.z for point in points) / len(points)
    return widest, height


def measure_neck_ring(pieces, item, shape_keys):
    """Measure this piece's own neck opening against **every** reference body.

    Nothing is moved. The ring is found geometrically (``find_collar_rings``)
    and the one nearest the neck is taken — outer concentric rings are the
    piece's own layers, and a layer standing proud of the skin is a pauldron,
    not a hole.

    The measurement is then taken against all four references (both sexes, both
    weights), and the host side asserts the nearest one is the wearer this
    build is *for*. That is the point: a radius compared against a single
    reference cannot tell a well-fitted female collar from a male one, because
    a neck tapers and two rings at different heights are not comparable. "Which
    body is this shaped like?" is comparable, it is answered by geometry the
    build never touched, and it is exactly the question a mis-sexed path or a
    broken morph target gets wrong.

    The ``_0`` figures are read straight off the shape key, so they measure the
    morph target that actually shipped rather than a second import of it.
    """
    sex = item["sex"]
    body = REFERENCE_BODIES.get(sex)
    if body is None:
        warn("%s: no reference body for sex %r; neck ring not measured"
             % (item["id"], sex))
        return None
    reference = body["weights"]["1"]
    near_misses, measured = [], {}
    chosen = None
    for obj in pieces:
        found, rejected = find_collar_rings(obj, reference["segments"])
        near_misses.extend(rejected)
        if not found:
            continue
        ranked = []
        for ring in found:
            distances = [
                closest_point_on_segments(
                    obj.matrix_world @ obj.data.vertices[i].co, reference["segments"])[1]
                for i in ring
            ]
            ranked.append((sum(distances) / len(distances), max(distances), ring, obj))
        ranked.sort(key=lambda entry: entry[0])
        if chosen is None or ranked[0][0] < chosen[0]:
            chosen = ranked[0]
    if chosen is None:
        log("%s: no ring encircles the neck; %d near miss(es) %s"
            % (item["id"], len(near_misses), sorted(near_misses)[:6]))
        return {"collar": "none", "referenceBody": body["id"], "sex": sex,
                "nearMisses": sorted(near_misses)[:12]}
    _mean, _max, ring, obj = chosen
    key = shape_keys.get(obj.name)
    for weight in sorted(body["weights"]):
        if weight == "0" and key is None:
            # No weight pair: one authored mesh serves every wearer, so the
            # shipped geometry is the same at both ends of the blend and the
            # reading at _1 has already covered it.
            continue
        if weight == "0":
            points = [obj.matrix_world @ key.data[i].co for i in sorted(ring)]
        else:
            points = [obj.matrix_world @ obj.data.vertices[i].co for i in sorted(ring)]
        against = {}
        for other_sex, other in sorted(REFERENCE_BODIES.items()):
            for other_weight, entry in sorted(other["weights"].items()):
                distances = [closest_point_on_segments(point, entry["segments"])[1]
                             for point in points]
                against["%s_%s" % (other["id"], other_weight)] = {
                    "mean": round(float(sum(distances) / len(distances)), 6),
                    "max": round(float(max(distances)), 6),
                }
        entry = body["weights"][weight]
        widest, height = ring_radius(points, entry["centre"])
        measured[weight] = {
            "referenceBody": "%s_%s" % (body["id"], weight),
            "vertices": len(points),
            "ringRadius": round(float(widest), 6),
            "ringHeight": round(float(height), 6),
            "neckRadius": round(float(entry["radius"]), 6),
            "neckMaxRadius": round(float(entry["maxRadius"]), 6),
            "maxDistance": against["%s_%s" % (body["id"], weight)]["max"],
            # Distance to every reference, which is what makes this a check and
            # not a restatement of the thing being checked.
            "against": against,
        }
    return {"collar": "measured", "referenceBody": body["id"], "sex": sex,
            "mesh": obj.name, "morphed": key is not None, "weights": measured}


def _base_name(name):
    """A Blender object name with its uniquifying ".001" suffix removed."""
    head, _, tail = name.rpartition(".")
    return head if head and tail.isdigit() and len(tail) == 3 else name


def load_morph_target(item, pieces):
    """Add the ``_0`` geometry to each piece as a shape key.

    Skyrim's own model: an armour piece ships as a weight pair and the engine
    averages the two by the wearer's ``NAM7``. glTF calls the same thing a morph
    target, three.js drives it with ``morphTargetInfluences``, so the blend the
    engine did per frame is the blend the browser does per frame.

    Matched by mesh name, and the vertex counts are asserted equal: a pair whose
    halves disagree is not a weight pair, and interpreting one as a morph target
    would tear the mesh apart on a thin wearer.
    """
    keys = {}
    if not item.get("morph_nif"):
        return keys
    existing = set(bpy.data.objects)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    result = bpy.ops.import_scene.pynifly(filepath=item["morph_nif"], **PLAN["mesh_import"])
    if "FINISHED" not in result:
        warn("%s: morph source failed to import (%s); shipping unblended" % (item["id"], result))
        return keys
    sources = [o for o in bpy.data.objects if o not in existing and o.type == "MESH"]
    # The morph source is thrown away, but importing it adds bones to the shared
    # armature for every skin partition the rig does not have, and those would
    # be exported as real joints on a piece no actor could then rebind.
    reunite_with_rig(sources, item["id"] + ":morph")
    # Paired by import order, not by name. The two halves of a weight pair are
    # authored with the same shape names in the same order, and Blender
    # uniquifies a name that already exists in the scene — the reference bodies
    # are permanently in it, so a cuirass's own "MaleUnderwearBody:0" arrives as
    # "MaleUnderwearBody:0.002" and matches nothing. Order is what the NIF
    # actually guarantees; the name is checked against it and reported.
    if len(sources) != len(pieces):
        warn("%s: %d shipped mesh(es) and %d in the morph source; shipping unblended"
             % (item["id"], len(pieces), len(sources)))
        for source in sources:
            bpy.data.objects.remove(source, do_unlink=True)
        return keys
    for obj, source in zip(pieces, sources):
        if _base_name(obj.name) != _base_name(source.name):
            warn("%s: %r pairs with %r by order but not by name"
                 % (item["id"], obj.name, source.name))
        if len(source.data.vertices) != len(obj.data.vertices):
            warn("%s: %r has %d vertices and its morph source %d; not a weight pair"
                 % (item["id"], obj.name, len(obj.data.vertices), len(source.data.vertices)))
            continue
        if obj.data.shape_keys is None:
            obj.shape_key_add(name="Basis", from_mix=False)
        key = obj.shape_key_add(name=MORPH_TARGET_NAME, from_mix=False)
        # Through world space: the two halves of a pair import with their own
        # object transforms, and a shape key is stored in the target's local
        # space. Copying raw coordinates would shift the morph by the
        # difference between the two.
        to_local = obj.matrix_world.inverted() @ source.matrix_world
        for index, vertex in enumerate(source.data.vertices):
            key.data[index].co = to_local @ vertex.co
        key.value = 0.0
        keys[obj.name] = key
    for source in sources:
        bpy.data.objects.remove(source, do_unlink=True)
    return keys


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
    # The morph source before the measurement, so the _0 figure is read off the
    # shape key that actually ships rather than a separate import of it.
    shape_keys = load_morph_target(item, pieces)
    neck_ring = measure_neck_ring(pieces, item, shape_keys) if item.get("close_neck_seam") else None
    bpy.ops.file.pack_all()

    # Which body parts this piece hides, straight out of the art.
    covered = set()
    unbound = set()
    for obj in pieces:
        # Bethesda writes some partitions as 1xx and some as xx for the same
        # slot; the shared section-cap table normalises them so a helmet and a
        # cuirass are comparable, and drops the partitions (230, the neck cap)
        # that are geometry rather than a wearable slot. `% 100` did neither:
        # it mapped 230 onto 30 and made a neck cap read as a head cover.
        covered |= fold_partitions(raw_partitions(obj.vertex_groups))
        for group in obj.vertex_groups:
            if not _BIPED_SLOT.match(group.name) and group.name not in RIG_BONE_SET:
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
        # The weight pair. Positions only: Skyrim's own weight morph is a
        # vertex blend, and per-target normals would roughly double a file that
        # now ships twice over (once per sex).
        export_morph=True,
        export_morph_normal=False,
        export_morph_tangent=False,
        export_animations=False,
        export_image_format="JPEG",
        export_jpeg_quality=88,
    )
    if PLAN.get("render_icons", True) and item.get("icon_png"):
        render_icon(pieces, item["icon_png"])
    low, high = world_bounds(pieces)
    SUMMARY["items"][item["id"]] = {
        "meshes": [o.name for o in pieces],
        "coversBipedSlots": sorted(covered),
        "neckRing": neck_ring,
        "morphTarget": MORPH_TARGET_NAME if shape_keys else None,
        "sizeMeters": [round(high[0] - low[0], 5),
                       round(high[2] - low[2], 5),
                       round(high[1] - low[1], 5)],
    }
    log("%s meshes=%d slots=%s morphed=%d/%d"
        % (item["id"], len(pieces), sorted(covered), len(shape_keys), len(pieces)))
    for obj in pieces:
        bpy.data.objects.remove(obj, do_unlink=True)

open(PLAN["summary_json"], "w", encoding="utf-8").write(json.dumps(SUMMARY, indent=2))
log("built %d piece-sex builds" % len(SUMMARY["items"]))
print("SUMMARY_WRITTEN")
