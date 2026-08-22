"""Headless preview renderer for a built character GLB (Wine Blender 4.4.3).

Imports the GLB, frames the character, and renders a set of (action, frame)
stills so the character's materials, proportions and animation deformation can
be eyeballed without a browser. Env:

    GLB   = windows path to the .glb
    OUTDIR= windows path to an existing output directory
    POSES = "IDLE:20,WALK:15,RUN:10,LIGHT_1:12,ROLL:14,GUARD:10,DEATH:20"
"""

import bpy
import os
from mathutils import Vector

GLB = os.environ["GLB"]
OUTDIR = os.environ["OUTDIR"]
POSES = os.environ.get("POSES", "IDLE:20")

# ---- clean scene ----------------------------------------------------------
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.fps = 30

# ---- import ---------------------------------------------------------------
bpy.ops.import_scene.gltf(filepath=GLB)
arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
assert arm and meshes, "no armature/meshes imported"

# ---- frame the character --------------------------------------------------
bpy.context.view_layer.update()
mn = Vector((1e9, 1e9, 1e9))
mx = Vector((-1e9, -1e9, -1e9))
for m in meshes:
    for c in m.bound_box:
        w = m.matrix_world @ Vector(c)
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
center = (mn + mx) * 0.5
size = (mx - mn)
height = size.z
reach = max(size.x, size.z, height)

cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
# Front view, slightly above waist, framing full body.
cam.location = Vector((center.x, mn.y - reach * 1.7, center.z + height * 0.05))
cam_data.lens = 50
# point at center
direction = center - cam.location
import math
cam.rotation_euler = (math.atan2(math.hypot(direction.x, direction.y), direction.z) if False else 0, 0, 0)
# aim: use track quaternion
q = direction.to_track_quat("-Z", "Y")
cam.rotation_euler = q.to_euler()
scene.camera = cam

# ---- lights + bright world ------------------------------------------------
world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.35, 0.37, 0.4, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.55
scene.world = world
for key, loc, energy in [
    ("key", (mn.y - reach, mn.y - reach, mx.z + reach), 2.2),
    ("fill", (mx.x + reach, mn.y - reach, center.z), 1.0),
]:
    ld = bpy.data.lights.new(key, "SUN")
    ld.energy = energy
    lo = bpy.data.objects.new(key, ld)
    scene.collection.objects.link(lo)
    lo.location = Vector(loc)
    lo.rotation_euler = (Vector(loc) - center).to_track_quat("Z", "Y").to_euler()

# ---- render settings ------------------------------------------------------
scene.render.resolution_x = 640
scene.render.resolution_y = 900
scene.render.film_transparent = False
# Cycles on CPU renders without a GL context (EEVEE/Workbench crash headless in Wine).
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = False
# Truthful colours: no AgX highlight desaturation (the game uses its own tonemap).
try:
    scene.view_settings.view_transform = "Standard"
except TypeError:
    pass
scene.view_settings.exposure = -0.5

actions = {a.name: a for a in bpy.data.actions}
if arm.animation_data is None:
    arm.animation_data_create()

for token in POSES.split(","):
    name, _, frame_s = token.partition(":")
    name = name.strip()
    frame = int(frame_s) if frame_s else 15
    action = actions.get(name)
    if action is None:
        print("[render] MISSING action", name)
        continue
    arm.animation_data.action = action
    fr = action.frame_range
    f = min(max(int(fr[0]) + frame, int(fr[0])), int(fr[1]))
    scene.frame_set(f)
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(OUTDIR, f"pose_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("[render] wrote", name, "frame", f)

print("RENDER_DONE")
