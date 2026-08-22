"""Headless Blender batch builder for static Skyrim hand-held item GLBs.

One Blender session builds every item in the plan, so adding the fortieth
weapon costs a few seconds rather than another process launch. Per item it
imports the NIF via PyNifly, drops sheathed/gore shapes, rebuilds materials as
clean diffuse Principled BSDF, normalises scale to real metres while PRESERVING
the NIF's native origin and orientation (authored for the hand attach node, so
the game mounts it with the rig's own socket convention and nothing else), then
exports a GLB and renders an inventory icon.

Env: BUILD_PLAN -> json with keys items[], summary_json.
"""

import bpy
import json
import math
import os
from mathutils import Matrix, Vector

PLAN = json.loads(open(os.environ["BUILD_PLAN"], "r", encoding="utf-8").read())
SUMMARY = {"items": {}, "warnings": []}

#: Support-map suffixes; never the base-colour diffuse.
_MAP_SUFFIXES = ("_n", "_msn", "_s", "_sk", "_g", "_m", "_em", "_e", "_b")

ICON_SIZE = int(PLAN.get("icon_size", 160))


def log(message):
    print("[weapons] " + message)


def is_diffuse(image):
    base = os.path.splitext(os.path.basename(image.filepath or image.name))[0].lower()
    return not base.endswith(_MAP_SUFFIXES)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                  bpy.data.cameras, bpy.data.lights):
        for datablock in list(block):
            if datablock.users == 0:
                block.remove(datablock)


def drop_sheathed(objects, drop_terms):
    """Remove scabbard/gore shapes, identified by object, material or texture."""
    kept = []
    for obj in objects:
        haystack = obj.name.lower()
        for slot in obj.material_slots:
            if not slot.material:
                continue
            haystack += " " + slot.material.name.lower()
            if slot.material.use_nodes:
                for node in slot.material.node_tree.nodes:
                    if node.type == "TEX_IMAGE" and node.image:
                        haystack += " " + os.path.basename(
                            node.image.filepath or node.image.name).lower()
        if any(term in haystack for term in drop_terms):
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return kept


def rebuild_materials(objects):
    """PyNifly's Skyrim shader exports to glTF washed out; rebuild it clean."""
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
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


def normalise_scale(objects, target_length):
    """Scale to real metres about the native origin (the hand attach point)."""
    bpy.context.view_layer.update()
    low, high = world_bounds(objects)
    size = high - low
    longest = max(size.x, size.y, size.z)
    scale = target_length / longest if longest else 1.0
    matrix = Matrix.Scale(scale, 4)
    for obj in objects:
        obj.data.transform(matrix @ obj.matrix_world.copy())
        obj.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    return scale, [round(v, 4) for v in size]


def render_icon(objects, path):
    """Small three-quarter orthographic render on a transparent background.

    Inventory art, not a beauty shot: the item fills the frame at a consistent
    angle so a grid of them reads as a set rather than as a gallery.
    """
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

    # Frame by what the camera actually sees, not by the diagonal: a long thin
    # sword measured by its diagonal renders as a sliver in the middle of an
    # empty tile, while every item framed to its own projected extent fills the
    # cell and a grid of them reads as one set.
    basis = camera.matrix_world.to_3x3()
    right, up = basis.col[0].normalized(), basis.col[1].normalized()
    extent = 0.0
    for obj in objects:
        for corner in obj.bound_box:
            offset = (obj.matrix_world @ Vector(corner)) - centre
            extent = max(extent, abs(offset.dot(right)), abs(offset.dot(up)))
    camera_data.ortho_scale = max(extent * 2.12, 1e-3)

    lights = []
    # Skyrim weapon textures are dark and the materials are metallic, so an
    # icon lit only by a key reads as a silhouette. A bright environment plus
    # key/fill/rim is what makes the shape legible at 160 px.
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

    # Cycles on the CPU: EEVEE needs a GL context and crashes headless Wine.
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
drop_terms = [term.lower() for term in PLAN.get("drop", [])]

for item in PLAN["items"]:
    clear_scene()
    bpy.ops.import_scene.pynifly(
        filepath=item["nif"],
        create_bones=False,
        import_tris=False,
        import_animations=False,
        import_collisions=False,
        blender_xf=True,
        rotate_bones_pretty=False,
    )
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for image in bpy.data.images:
        if image.source == "FILE" and image.filepath:
            try:
                image.reload()
            except RuntimeError:
                pass
    kept = drop_sheathed(meshes, drop_terms)
    if not kept:
        SUMMARY["warnings"].append("%s: every shape was dropped" % item["id"])
        continue
    rebuild_materials(kept)
    bpy.ops.file.pack_all()
    scale, native = normalise_scale(kept, item["target_length"])

    bpy.ops.object.select_all(action="DESELECT")
    for obj in kept:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=item["output_glb"],
        export_format="GLB",
        use_selection=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_animations=False,
        export_morph=False,
        # Weapon diffuses are opaque (materials are rebuilt base-colour only),
        # and PNG makes an arsenal five times the size it needs to be on a
        # static host. Measured: 15 MB of PNG against 3 MB of JPEG for 41 items.
        export_image_format="JPEG",
        export_jpeg_quality=85,
    )
    render_icon(kept, item["icon_png"])
    low, high = world_bounds(kept)
    SUMMARY["items"][item["id"]] = {
        "keptMeshes": [o.name for o in kept],
        "nativeSize": native,
        "scale": round(scale, 5),
        "targetLength": item["target_length"],
        # Metres, in the exported Y-up frame, so the game can size a collider
        # and place a grip without re-deriving either from the mesh.
        "sizeMeters": [round(high[0] - low[0], 5),
                       round(high[2] - low[2], 5),
                       round(high[1] - low[1], 5)],
    }
    log("%s scale=%.5f native=%s" % (item["id"], scale, native))

open(PLAN["summary_json"], "w", encoding="utf-8").write(json.dumps(SUMMARY, indent=2))
log("built %d items" % len(SUMMARY["items"]))
print("SUMMARY_WRITTEN")
