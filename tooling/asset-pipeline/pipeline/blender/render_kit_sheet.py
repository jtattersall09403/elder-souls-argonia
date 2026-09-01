"""Headless contact-sheet renderer for a built world-static kit (Wine Blender).

Why this exists: we never make art, we source it, so *choosing* between fifty
candidate meshes is the real work — and the kit manifest's numbers (height,
crown width, triangles) cannot tell you whether a tree reads as tropical or as
an English oak. This renders one framed still per asset, each with a 1.8 m
human silhouette beside it for scale, so a sheet of candidates can be judged at
a glance.

Env:
    KIT_GLB   = windows path to the kit .glb
    OUTDIR    = windows path to an existing output directory
    ASSETS    = comma-separated asset ids to render (default: all)
    RES       = square render size in px (default 512)
Writes OUTDIR/<safe-id>.png per asset, and prints "[sheet] <id> -> <file>".
"""

import bpy
import json
import math
import os
import struct
from mathutils import Vector

KIT_GLB = os.environ["KIT_GLB"]
OUTDIR = os.environ["OUTDIR"]
WANT = [a for a in os.environ.get("ASSETS", "").split(",") if a]
RES = int(os.environ.get("RES", "512"))

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
# Cycles on CPU, not EEVEE: headless Wine has no OpenGL context and EEVEE
# segfaults on the first render. Few samples is plenty — these frames answer
# "what shape is this tree", not "how does it light".
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 2
scene.cycles.transparent_max_bounces = 128  # foliage cards layer deep; a low
scene.cycles.transmission_bounces = 4       # cap renders whole crowns BLACK
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("sheet")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.42, 0.52, 0.66, 1.0)   # flat sky, no gradient
bg.inputs[1].default_value = 1.6

bpy.ops.import_scene.gltf(filepath=KIT_GLB)

# The kit GLB is one root node per asset, tagged with extras.assetId
# (build_kit.py). Each root holds the LOD chain; only lod0 is rendered.
roots = {}
for obj in bpy.data.objects:
    if obj.parent is None:
        asset_id = (obj.get("assetId") or obj.name)
        roots[asset_id] = obj
targets = WANT or sorted(roots)

# ---- a 1.8 m human bar, so every frame carries the same scale cue ---------
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
human = bpy.context.object
human.name = "__scale_human"
human.scale = (0.25, 0.25, 0.9)          # 0.5 x 0.5 x 1.8 m
human.location = (0, 0, 0.9)
mat = bpy.data.materials.new("__scale_mat")
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.9, 0.1, 0.1, 1)
human.data.materials.append(mat)

sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.0
sun = bpy.data.objects.new("sun", sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(52), 0, math.radians(35))

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def lod0_meshes(root):
    """Meshes under the asset root that belong to its level-0 chain."""
    out = []
    stack = [root]
    while stack:
        node = stack.pop()
        stack.extend(node.children)
        if node.type != "MESH":
            continue
        # LOD levels are separate children named ...lod1/lod2/billboard.
        name = node.name.lower()
        if "lod1" in name or "lod2" in name or "billboard" in name or "_lod_flat" in name:
            continue
        out.append(node)
    return out


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            lo = Vector((min(lo[i], p[i]) for i in range(3)))
            hi = Vector((max(hi[i], p[i]) for i in range(3)))
    return lo, hi


for asset_id in targets:
    root = roots.get(asset_id)
    if root is None:
        print(f"[sheet] MISSING {asset_id}")
        continue
    meshes = lod0_meshes(root)
    if not meshes:
        print(f"[sheet] EMPTY {asset_id}")
        continue

    for obj in bpy.data.objects:
        if obj.parent is None and obj not in (human, sun, cam):
            obj.hide_render = obj is not root
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj is not human:
            obj.hide_render = obj not in meshes

    lo, hi = world_bounds(meshes)
    centre = (lo + hi) * 0.5
    # Stand the model on z=0 next to the human bar rather than moving the
    # camera: keeps the scale cue honest whatever the source pivot does.
    root.location.z -= lo.z
    lo.z, hi.z, centre.z = 0.0, hi.z - lo.z, centre.z - lo.z
    span = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, 2.0)

    human.location = (lo.x - 1.5, centre.y, 0.9)
    dist = span * 1.5
    cam.location = (centre.x + dist * 0.55, centre.y - dist, centre.z + span * 0.12)
    direction = Vector((centre.x, centre.y, centre.z * 0.92)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = 42.0

    safe = asset_id.replace(":", "__").replace("/", "_").replace(" ", "_")
    path = os.path.join(OUTDIR, f"{safe}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    root.location.z += lo.z if False else 0.0   # bounds already rebased
    print(f"[sheet] {asset_id} -> {safe}.png  h={hi.z - lo.z:.1f}m")
