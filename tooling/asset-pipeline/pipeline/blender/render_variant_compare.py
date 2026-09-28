"""Before/after stills of a texture variant (Wine Blender, headless).

Renders a base asset from a built kit GLB twice per view: as built, then with
its images swapped for a variant's derived textures, so a recipe can be
judged BEFORE the kit is rebuilt (sample first; `pipeline.render_variant`).
Optional companion pieces (a Hist tree's flowers) stand around it at offsets
in the base piece's frame; each companion lists which of its instances the
variant keeps (a sick tree keeps a few flowers).

Env (all JSON unless noted):
    KIT_GLB  windows path of the kit .glb (string)
    OUTDIR   windows path of an existing folder (string)
    PLAN     {"base": id, "views": [[azimuthDeg, elevationDeg], ...],
              "res": px, "swaps": {stem: windows png path},
              "companions": [{"id": id, "atM": [x, y, z], "scale": s,
                              "keepInVariant": bool}]}
Writes OUTDIR/{before,after}-<view index>.png. No text on the frames (R8).
"""

import bpy
import json
import math
import os
from mathutils import Vector

KIT_GLB = os.environ["KIT_GLB"]
OUTDIR = os.environ["OUTDIR"]
PLAN = json.loads(os.environ["PLAN"])

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "CYCLES"          # no OpenGL context under Wine
scene.cycles.device = "CPU"
scene.cycles.samples = int(PLAN.get("samples", 24))
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 3
scene.cycles.transparent_max_bounces = 128
scene.render.resolution_x = scene.render.resolution_y = int(PLAN.get("res", 640))
scene.view_settings.view_transform = "Standard"
scene.world = bpy.data.worlds.new("variant")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.55, 0.62, 0.68, 1.0)   # overcast marsh sky
bg.inputs[1].default_value = 1.1

bpy.ops.import_scene.gltf(filepath=KIT_GLB)
roots = {}
for obj in bpy.data.objects:
    if obj.parent is None and obj.get("assetId"):
        roots[obj["assetId"]] = obj


def lod0(root):
    out, stack = [], [root]
    while stack:
        node = stack.pop()
        stack.extend(node.children)
        name = node.name.lower()
        if node.type == "MESH" and not any(t in name for t in ("lod1", "lod2", "lod3", "billboard", "_lod_flat", "card")):
            out.append(node)
    return out


def bounds(objs):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for obj in objs:
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            lo = Vector(min(lo[i], p[i]) for i in range(3))
            hi = Vector(max(hi[i], p[i]) for i in range(3))
    return lo, hi


base_root = roots[PLAN["base"]]
base_meshes = lod0(base_root)
keep = set(base_meshes)
base_root.location = (0.0, 0.0, 0.0)

# companions: a linked duplicate per instance, placed in the base's frame
companion_sets = []   # (objects, keepInVariant)
for comp in PLAN.get("companions", []):
    root = roots.get(comp["id"])
    if root is None:
        print("[variant] MISSING companion %s" % comp["id"])
        continue
    meshes = lod0(root)
    objs = []
    for mesh in meshes:
        dup = mesh.copy()
        dup.parent = None
        dup.matrix_world = mesh.matrix_world.copy()
        scene.collection.objects.link(dup)
        dup.scale = [c * comp.get("scale", 1.0) for c in dup.scale]
        dup.location = Vector(comp["atM"]) + (dup.location - root.location) * comp.get("scale", 1.0)
        objs.append(dup)
    companion_sets.append((objs, bool(comp.get("keepInVariant", True))))
    keep.update(objs)

for obj in bpy.data.objects:
    if obj.type == "MESH" and obj not in keep:
        obj.hide_render = True

# ground: a flat marsh-earth plane at the pivot's ground line (z 0 in the
# kit frame is the pivot; the manifest's designed sink puts the ground line
# `groundZ` above it, passed in by the driver)
ground_z = float(PLAN.get("groundZ", 0.0))
bpy.ops.mesh.primitive_plane_add(size=120.0, location=(0.0, 0.0, ground_z))
ground = bpy.context.object
gmat = bpy.data.materials.new("__ground")
gmat.use_nodes = True
gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.20, 0.17, 0.11, 1)
gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
ground.data.materials.append(gmat)

sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.2
sun_data.angle = math.radians(8)
sun = bpy.data.objects.new("sun", sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(48), 0, math.radians(210))

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 35.0
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

lo, hi = bounds(base_meshes)
centre = (lo + hi) * 0.5
span = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)

# image swap targets: every image node in the base's (and variant-kept
# companions') materials whose image stem is in the swap table
swaps = {k.casefold(): v for k, v in (PLAN.get("swaps") or {}).items()}
swap_nodes = []
for obj in keep:
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                stem = os.path.splitext(os.path.basename(node.image.name))[0].casefold()
                if stem in swaps:
                    swap_nodes.append((node, node.image, bpy.data.images.load(swaps[stem], check_existing=True)))
print("[variant] %d image nodes to swap (%s)" % (len(swap_nodes), sorted({n[1].name for n in swap_nodes})))


def render(tag):
    for index, view in enumerate(PLAN["views"]):
        # [azimuth, elevation, distance x span, target height share]
        az, el = view[0], view[1]
        far = view[2] if len(view) > 2 else float(PLAN.get("distance", 1.25))
        share = view[3] if len(view) > 3 else 0.42
        a, e = math.radians(az), math.radians(el)
        dist = span * far
        target = Vector((centre.x, centre.y, lo.z + (hi.z - lo.z) * share))
        cam.location = target + Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * dist
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUTDIR, "%s-%d.png" % (tag, index))
        bpy.ops.render.render(write_still=True)
        print("[variant] %s view %d -> %s" % (tag, index, scene.render.filepath))


render("before")
for node, _old, new in swap_nodes:
    node.image = new
    new.colorspace_settings.name = "sRGB"
for objs, kept in companion_sets:
    for obj in objs:
        obj.hide_render = not kept
render("after")
