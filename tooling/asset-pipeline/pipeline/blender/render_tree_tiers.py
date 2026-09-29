"""Headless check renders for the tree tiers (vegetation round 13).

Run by `pipeline/tree_tiers_check.py` in native Linux Blender (3.2, Cycles
CPU; no GL context on the VM). Imports one preview GLB from
`tree_tiers.preview` (scene roots `source`, `mid`, `far`), and renders each
requested (tier, pixel height) pair from N azimuths with an orthographic
camera framed on the SOURCE bounds, so masks compare pixel for pixel.

The alpha test is made hard (texture alpha > cutoff) as the runtime draws it,
so the frame's alpha channel is the coverage mask. Light: a soft white sky
plus one sun (fixed bearing), so the lit and shadow sides can be judged.

    blender -b --python render_tree_tiers.py -- <job.json>
job: {"glb", "outDir", "azimuths", "elevationDeg", "renders": [[tier, px], ...]}
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

job = json.load(open(sys.argv[sys.argv.index("--") + 1]))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=job["glb"])
scene = bpy.context.scene

tiers = {}
for obj in bpy.data.objects:
    top = obj
    while top.parent is not None:
        top = top.parent
    if obj.type == "MESH":
        tiers.setdefault(top.name.split(".")[0], []).append(obj)

# Hard alpha test on every material, as three.js alphaTest draws it.
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    for node in list(nt.nodes):
        if node.type != "BSDF_PRINCIPLED":
            continue
        sock = node.inputs["Alpha"]
        if not sock.is_linked:
            continue
        src = sock.links[0].from_socket
        cmp = nt.nodes.new("ShaderNodeMath")
        cmp.operation = "GREATER_THAN"
        cmp.inputs[1].default_value = 0.5
        nt.links.new(src, cmp.inputs[0])
        nt.links.new(cmp.outputs[0], sock)
    mat.blend_method = "CLIP"

lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for obj in tiers["source"]:
    for corner in obj.bound_box:
        w = obj.matrix_world @ Vector(corner)
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
size = hi - lo
centre = (lo + hi) / 2
height = size.z
frame = max(size.x, size.y, size.z) * 1.05

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = int(job.get("samples", 6))
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 2
scene.cycles.transparent_max_bounces = 128
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.82, 0.95, 1.0)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.55
scene.world = world
sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 3.0
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = (math.radians(40), 0.0, math.radians(35))
scene.collection.objects.link(sun)
cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = frame
cam_data.clip_start = 0.01
cam_data.clip_end = frame * 10
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

elev = math.radians(job.get("elevationDeg", 0.0))
out = job["outDir"]
os.makedirs(out, exist_ok=True)
for tier, px in job["renders"]:
    res = max(16, int(round(px * frame / max(height, 1e-3))))
    scene.render.resolution_x = scene.render.resolution_y = res
    # "jitter": the SOURCE again, the camera moved half a pixel sideways -- the
    # noise floor of a pixel-exact mask comparison at this size.
    shown = "source" if tier == "jitter" else tier
    shift = 0.5 * frame / res if tier == "jitter" else 0.0
    for name, objs in tiers.items():
        for obj in objs:
            obj.hide_render = name != shown
    for k in range(job["azimuths"]):
        az = 2 * math.pi * k / job["azimuths"]
        d = frame * 3
        direction = Vector((math.sin(az) * math.cos(elev), -math.cos(az) * math.cos(elev),
                            math.sin(elev)))
        cam.location = centre + direction * d
        cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
        cam.location += Vector((math.cos(az), math.sin(az), 0.0)) * shift
        scene.render.filepath = os.path.join(out, "%s_%d_%02d.png" % (tier, px, k))
        bpy.ops.render.render(write_still=True)
print("[tiers] rendered", job["glb"], "frame %.2f height %.2f" % (frame, height))
