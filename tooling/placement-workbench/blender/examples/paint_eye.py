"""wb.py bpy script behind `wb.py paint-look --eye` (16k walk 6): eye-level
Cycles shots of a place with its ground draped in the `paint_look`
composite (the land cover in the studio's ground textures plus the
published painted ways), so a reader judges the paint as a walker sees it.

ARGS[0]: a JSON spec {"image", "boundsM": [x0, z0, x1, z1] (world metres,
row 0 = z0), "shots": [{"name", "eye": [x, z], "look": [x, z],
"eyeM": 1.7}], "outDir", "res": [w, h], "samples"}. The wb frame is
Blender's: x east, y north (= -z world), z up.
"""
import json
import math
import os

import bpy
from mathutils import Vector

spec = json.loads(open(ARGS[0]).read())
x0, z0, x1, z1 = spec["boundsM"]
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = int(spec.get("samples", 16))
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 2
scene.render.resolution_x, scene.render.resolution_y = spec.get("res", [960, 540])
scene.view_settings.view_transform = "Standard"
scene.world = bpy.data.worlds.new("paint-eye")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.55, 0.62, 0.72, 1.0)
bg.inputs[1].default_value = 1.0
sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.0
sun = bpy.data.objects.new("sun", sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(35), math.radians(8), math.radians(150))

# the ground: the composite image by world position
mat = bpy.data.materials.new("paint-ground")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 0.95
bsdf.inputs["Specular"].default_value = 0.2
geo = nt.nodes.new("ShaderNodeNewGeometry")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
nt.links.new(geo.outputs["Position"], sep.inputs[0])
u = nt.nodes.new("ShaderNodeMapRange")
u.inputs["From Min"].default_value, u.inputs["From Max"].default_value = x0, x1
nt.links.new(sep.outputs["X"], u.inputs["Value"])
v = nt.nodes.new("ShaderNodeMapRange")           # y = -z: image bottom (v 0) is z1
v.inputs["From Min"].default_value, v.inputs["From Max"].default_value = -z1, -z0
nt.links.new(sep.outputs["Y"], v.inputs["Value"])
comb = nt.nodes.new("ShaderNodeCombineXYZ")
nt.links.new(u.outputs["Result"], comb.inputs["X"])
nt.links.new(v.outputs["Result"], comb.inputs["Y"])
img = nt.nodes.new("ShaderNodeTexImage")
img.image = bpy.data.images.load(spec["image"])
img.extension = "EXTEND"
nt.links.new(comb.outputs["Vector"], img.inputs["Vector"])
nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
ground = bpy.data.objects["ground"]
ground.data.materials.clear()
ground.data.materials.append(mat)

cam_data = bpy.data.cameras.new("eye")
cam_data.lens = 24
cam_data.clip_start = 0.1
cam_data.clip_end = 600
cam = bpy.data.objects.new("eye", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
os.makedirs(spec["outDir"], exist_ok=True)
written = []
for shot in spec["shots"]:
    ex, ez = shot["eye"]
    lx, lz = shot["look"]
    eh = api.ground_height(ex, ez) + float(shot.get("eyeM", 1.7))
    lh = api.ground_height(lx, lz)
    cam.location = (ex, -ez, eh)
    d = Vector((lx, -lz, lh)) - Vector((ex, -ez, eh))
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    out = os.path.join(spec["outDir"], f"{shot['name']}.png")
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    written.append(out)
RESULT["written"] = written
