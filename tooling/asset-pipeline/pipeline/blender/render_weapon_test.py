"""Render the character with a weapon attached to the hand `Weapon` socket,
mirroring the game's runtime attach (character scaled to metres; weapon placed at
the socket's world pose at unit scale). Lets us validate/tune sword placement
headlessly. Env: CHAR, WEAPON, OUTDIR, POSE (e.g. IDLE:20), WROT="x,y,z" deg,
WOFF="x,y,z" metres, SCALE (character scale), WSCALE (extra weapon scale).
"""

import bpy
import os
import math
from mathutils import Vector, Matrix, Euler

CHAR = os.environ["CHAR"]
WEAPON = os.environ["WEAPON"]
OUTDIR = os.environ["OUTDIR"]
POSE = os.environ.get("POSE", "IDLE:20")
CHAR_SCALE = float(os.environ.get("SCALE", "0.1496"))
WSCALE = float(os.environ.get("WSCALE", "1.0"))
WROT = [math.radians(float(v)) for v in os.environ.get("WROT", "0,0,0").split(",")]
WOFF = [float(v) for v in os.environ.get("WOFF", "0,0,0").split(",")]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.fps = 30

# ---- character, scaled to metres ----
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=CHAR)
char_objs = [o for o in bpy.data.objects if o not in before]
arm = next(o for o in char_objs if o.type == "ARMATURE")
root = bpy.data.objects.new("CharRoot", None)
scene.collection.objects.link(root)
for o in char_objs:
    if o.parent is None:
        o.parent = root
root.scale = (CHAR_SCALE, CHAR_SCALE, CHAR_SCALE)

# pose
name, _, frame_s = POSE.partition(":")
action = bpy.data.actions.get(name)
if arm.animation_data is None:
    arm.animation_data_create()
if action:
    arm.animation_data.action = action
    fr = action.frame_range
    scene.frame_set(min(int(fr[0]) + int(frame_s or 15), int(fr[1])))
bpy.context.view_layer.update()

# ---- weapon at the hand socket ----
pbone = arm.pose.bones.get("Weapon")
assert pbone, "no Weapon bone"
socket_world = arm.matrix_world @ pbone.matrix
loc, rot, _ = socket_world.decompose()

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=WEAPON)
weapon_objs = [o for o in bpy.data.objects if o not in before]
mount = bpy.data.objects.new("WeaponMount", None)
scene.collection.objects.link(mount)
# mount at socket world pose, unit scale, plus tuning
base = Matrix.LocRotScale(loc, rot, Vector((WSCALE, WSCALE, WSCALE)))
correction = Matrix.LocRotScale(Vector(WOFF), Euler(WROT).to_quaternion(), Vector((1, 1, 1)))
mount.matrix_world = base @ correction
bpy.context.view_layer.update()
for o in weapon_objs:
    if o.parent is None:
        o.parent = mount
        # Identity parent-inverse: the weapon rides the mount to the socket
        # (three.js parenting has no parent-inverse; this mirrors the game).
        o.matrix_parent_inverse = Matrix.Identity(4)
bpy.context.view_layer.update()

# ---- frame + light + render ----
mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
for m in [o for o in char_objs if o.type == "MESH"]:
    for c in m.bound_box:
        w = m.matrix_world @ Vector(c)
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
center = (mn + mx) * 0.5
size = mx - mn
reach = max(size.x, size.z, size.z)

cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
cam.location = Vector((center.x + reach * 0.35, mn.y - reach * 2.4, center.z + size.z * 0.05))
cam_data.lens = 60
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

world = bpy.data.worlds.new("W"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs[1].default_value = 0.55
scene.world = world
for loc2, e in [((mn.y - reach, mn.y - reach, mx.z + reach), 2.2), ((mx.x + reach, mn.y - reach, center.z), 1.0)]:
    ld = bpy.data.lights.new("L", "SUN"); ld.energy = e
    lo = bpy.data.objects.new("L", ld); scene.collection.objects.link(lo)
    lo.location = Vector(loc2)
    lo.rotation_euler = (Vector(loc2) - center).to_track_quat("Z", "Y").to_euler()

scene.render.resolution_x = 700; scene.render.resolution_y = 900
scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = 24
scene.cycles.use_denoising = False
try:
    scene.view_settings.view_transform = "Standard"
except TypeError:
    pass
scene.render.filepath = os.path.join(OUTDIR, f"weapon_{name}.png")
bpy.ops.render.render(write_still=True)
print("RENDER_DONE", scene.render.filepath)
