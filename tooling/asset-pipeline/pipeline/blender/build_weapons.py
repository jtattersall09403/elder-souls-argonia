"""Headless Blender batch builder for static Skyrim hand-held item GLBs.

One Blender session builds every item in the plan, so adding the fortieth
weapon costs a few seconds rather than another process launch. Per item it
imports the NIF via PyNifly, drops sheathed/gore shapes, rebuilds materials as
clean diffuse Principled BSDF, normalises scale to real metres while PRESERVING
the NIF's native origin and orientation (authored for the hand attach node, so
the game mounts it with the rig's own socket convention and nothing else), then
exports a GLB and renders an inventory icon.

An item may declare ``obj`` + ``textures`` instead of ``nif``: a Wavefront mesh
with loose maps, already converted to PNG by the host (a mod that ships no NIF).
The OBJ is first turned onto the NIF hand-node convention from the plan's
``orient`` block (see ``orient_obj``); everything after that is the same path,
so the GLB and the manifest entry are indistinguishable.

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


def obj_material(objects, textures):
    """One Principled material from a mod's loose maps, for an OBJ item.

    An OBJ carries no Skyrim shader, so there is nothing to read the maps off:
    the arsenal entry names them and they are wired here. The result is the same
    clean diffuse/normal Principled the NIF path rebuilds, so the exported GLB is
    indistinguishable downstream.
    """
    material = bpy.data.materials.new("Item")
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Metallic"].default_value = 0.55
    shader.inputs["Roughness"].default_value = 0.4
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    def load(role, colorspace):
        path = textures.get(role)
        if not path:
            return None
        image = bpy.data.images.load(path)
        image.colorspace_settings.name = colorspace
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        return node

    diffuse = load("diffuse", "sRGB")
    if diffuse is not None:
        tree.links.new(diffuse.outputs["Color"], shader.inputs["Base Color"])
    normal = load("normal", "Non-Color")
    if normal is not None:
        mapper = tree.nodes.new("ShaderNodeNormalMap")
        tree.links.new(normal.outputs["Color"], mapper.inputs["Color"])
        tree.links.new(mapper.outputs["Normal"], shader.inputs["Normal"])
    specular = load("specular", "Non-Color")
    if specular is not None:
        for socket in ("Specular IOR Level", "Specular"):
            if socket in shader.inputs:
                tree.links.new(specular.outputs["Color"], shader.inputs[socket])
                break
    if hasattr(material, "blend_method"):
        try:
            material.blend_method = "OPAQUE"
        except TypeError:
            pass
    for obj in objects:
        count = len(obj.data.materials)
        if count > 1:
            SUMMARY["warnings"].append(
                "%s: %d material groups flattened onto one material" % (obj.name, count))
        obj.data.materials.clear()
        obj.data.materials.append(material)
        # An OBJ with several `usemtl` groups (the cleaver: handle and blade)
        # leaves faces pointing at slots that no longer exist, and those faces
        # export with no material at all. Every face wears the one material.
        for polygon in obj.data.polygons:
            polygon.material_index = 0


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


def apply_to_meshes(objects, matrix):
    """Bake `matrix` into the meshes, transforming each datablock exactly once.

    Two objects can share one mesh datablock (an OBJ with mirrored halves), and
    transforming per object would then apply the matrix twice to the same
    vertices. Datablocks are tracked by name, and every object is reset to the
    identity afterwards so the world transform is in the mesh, not on the node.
    """
    seen = set()
    for obj in objects:
        if obj.data.name in seen:
            continue
        seen.add(obj.data.name)
        obj.data.transform(matrix @ obj.matrix_world.copy())
    for obj in objects:
        obj.matrix_world = Matrix.Identity(4)


def normalise_scale(objects, target_length):
    """Scale to real metres about the native origin (the hand attach point)."""
    bpy.context.view_layer.update()
    low, high = world_bounds(objects)
    size = high - low
    longest = max(size.x, size.y, size.z)
    scale = target_length / longest if longest else 1.0
    apply_to_meshes(objects, Matrix.Scale(scale, 4))
    bpy.context.view_layer.update()
    return scale, [round(v, 4) for v in size]


# Wavefront axes as `wm.obj_import` lands them in Blender (forward -Z, up Y):
# OBJ x -> X, OBJ y -> Z, OBJ z -> -Y. The Y-up GLB export undoes the same
# mapping, so an OBJ axis and the exported GLB axis are one and the same.
OBJ_AXIS_TO_BLENDER = {"x": Vector((1, 0, 0)), "y": Vector((0, 0, 1)), "z": Vector((0, -1, 0))}


def grip_centre(objects, long_axis, pommel, length):
    """Centre of the vertices in the pommel-end fifth of the length (the handle)."""
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    near = length * 0.2
    found = False
    for obj in objects:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            if abs(point[long_axis] - pommel) <= near:
                found = True
                for axis in range(3):
                    low[axis] = min(low[axis], point[axis])
                    high[axis] = max(high[axis], point[axis])
    if not found:
        # No vertex in the pommel fifth (a mesh that is all head, or a stray
        # long axis): the bounding-box centre is wrong but finite, where the
        # sentinels would fling the mesh a thousand kilometres off the socket.
        low, high = world_bounds(objects)
    return (low + high) * 0.5


def orient_obj(objects, orient):
    """Put an OBJ mesh on the NIF hand-node convention.

    A NIF weapon is authored with the blade along the socket's +Z (Blender -Y
    under the Y-up export), the width on X and the hand at the origin. An OBJ
    is authored about whatever its modeller chose, so the plan states which
    native axis end strikes (`tip`) and where the hand sits as a fraction of
    the length up from the pommel (`grip`); the cross-section is centred, and
    the mesh is rewritten in place so the exporter sees a NIF-shaped object.

    The plan may also name `edge`: the native axis whose positive end the
    cutting edge faces, which becomes the exported +X. Without it the widest
    remaining extent is taken as the width, which is right for a symmetric
    blade and a guess for anything else.
    """
    bpy.context.view_layer.update()
    low, high = world_bounds(objects)
    size = high - low
    tip_dir = OBJ_AXIS_TO_BLENDER[orient["tip"][1]] * (1 if orient["tip"][0] == "+" else -1)
    long_axis = max(range(3), key=lambda i: abs(tip_dir[i]))
    other = [i for i in range(3) if i != long_axis]
    edge = orient.get("edge")
    if edge:
        new_x = OBJ_AXIS_TO_BLENDER[edge[1]] * (1 if edge[0] == "+" else -1)
        if abs(new_x.dot(tip_dir)) > 1e-6:
            raise ValueError("orient.edge must be perpendicular to orient.tip")
    else:
        wide_axis = max(other, key=lambda i: size[i])
        new_x = Vector((0, 0, 0))
        new_x[wide_axis] = 1.0
    new_y = -tip_dir                       # blade along Blender -Y (GLB +Z)
    new_z = new_x.cross(new_y)             # right-handed, so no mirroring
    rotation = Matrix((new_x, new_y, new_z)).to_4x4()   # rows: old -> new
    length = size[long_axis]
    pommel = low[long_axis] if tip_dir[long_axis] > 0 else high[long_axis]
    # After the rotation the pommel is at +Y: leave it `grip * length` above
    # the origin so the hand (origin) sits that far up the handle. The axis
    # runs through the HANDLE, not the box centre: a one-sided blade (the
    # cleaver) would otherwise put the haft a hand's width off the socket.
    centre = grip_centre(objects, long_axis, pommel, length)
    centre[long_axis] = pommel
    shift = Vector((0, orient["grip"] * length, 0)) - rotation @ centre
    matrix = Matrix.Translation(shift) @ rotation
    apply_to_meshes(objects, matrix)
    bpy.context.view_layer.update()
    return {
        "tip": orient["tip"],
        "edge": orient.get("edge"),
        "grip": orient["grip"],
        "lengthNative": round(length, 4),
        # Native units: the pommel sits this far below the origin. The host
        # multiplies it by the scale it applies to reach metres.
        "gripOffset": round(orient["grip"] * length, 4),
    }


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
    oriented = None
    if item.get("obj"):
        # An OBJ item ships no scabbard and no shader: every shape is the weapon,
        # and its material comes from the maps the arsenal entry names.
        # Axes pinned: OBJ_AXIS_TO_BLENDER assumes exactly this import mapping.
        bpy.ops.wm.obj_import(filepath=item["obj"], forward_axis="NEGATIVE_Z", up_axis="Y")
        kept = [o for o in bpy.data.objects if o.type == "MESH"]
        if not kept:
            SUMMARY["warnings"].append("%s: the OBJ imported no mesh" % item["id"])
            continue
        orient = item.get("orient")
        if orient is None:
            SUMMARY["warnings"].append("%s: obj item without an orient block" % item["id"])
            continue
        obj_material(kept, item.get("textures", {}))
        try:
            oriented = orient_obj(kept, orient)
        except ValueError as error:
            SUMMARY["warnings"].append("%s: %s" % (item["id"], error))
            continue
    else:
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
        "oriented": oriented,
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
