"""Render a compact animated preview of one semantic GLB action.

This is a visual-validation tool, not part of the asset build. It samples an
action uniformly and can mount the standalone weapon with the exact runtime
socket quaternion so attachment remains testable through motion.

Environment:
    GLB, OUTDIR, ACTION (or comma-separated ACTIONS)
    WEAPON (optional), SOCKET=Weapon, WQUAT=x,y,z,w, SAMPLES=16
"""

import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

GLB = os.environ["GLB"]
OUTDIR = os.environ["OUTDIR"]
ACTION_NAMES = [
    name.strip()
    for name in os.environ.get("ACTIONS", os.environ.get("ACTION", "")).split(",")
    if name.strip()
]
assert ACTION_NAMES, "set ACTION or ACTIONS"
WEAPON = os.environ.get("WEAPON")
SOCKET = os.environ.get("SOCKET", "Weapon")
SAMPLES = max(2, int(os.environ.get("SAMPLES", "16")))
CHAR_SCALE = float(os.environ.get("SCALE", "0.1496"))
quat_xyzw = [float(v) for v in os.environ.get("WQUAT", "0,0,0,1").split(",")]
WEAPON_CORRECTION = Quaternion((quat_xyzw[3], quat_xyzw[0], quat_xyzw[1], quat_xyzw[2]))

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.fps = 30

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=GLB)
character = [o for o in bpy.data.objects if o not in before]
arm = next(o for o in character if o.type == "ARMATURE")
meshes = [o for o in character if o.type == "MESH"]
root = bpy.data.objects.new("CharacterRoot", None)
scene.collection.objects.link(root)
for obj in character:
    if obj.parent is None:
        obj.parent = root
root.scale = (CHAR_SCALE,) * 3

if arm.animation_data is None:
    arm.animation_data_create()

mount = None
if WEAPON:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=WEAPON)
    weapon_objects = [o for o in bpy.data.objects if o not in before]
    mount = bpy.data.objects.new("WeaponMount", None)
    scene.collection.objects.link(mount)
    for obj in weapon_objects:
        if obj.parent is None:
            obj.parent = mount
            obj.matrix_parent_inverse = Matrix.Identity(4)

# Stable framing in real metres.
bpy.context.view_layer.update()
mn = Vector((1e9, 1e9, 1e9))
mx = Vector((-1e9, -1e9, -1e9))
for mesh in meshes:
    for corner in mesh.bound_box:
        world = mesh.matrix_world @ Vector(corner)
        for axis in range(3):
            mn[axis] = min(mn[axis], world[axis])
            mx[axis] = max(mx[axis], world[axis])
center = (mn + mx) * 0.5
height = max(1.8, mx.z - mn.z)

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
scene.collection.objects.link(camera)
camera.location = Vector((center.x + height * 0.42, center.y - height * 2.15, center.z + height * 0.06))
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.lens = 58
scene.camera = camera

world = bpy.data.worlds.new("PreviewWorld")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.24, 0.25, 0.27, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.65
scene.world = world
for location, energy in [((-3, -4, 6), 2.4), ((4, -1, 3), 1.1)]:
    light_data = bpy.data.lights.new("PreviewLight", "SUN")
    light_data.energy = energy
    light = bpy.data.objects.new("PreviewLight", light_data)
    scene.collection.objects.link(light)
    light.location = Vector(location)
    light.rotation_euler = (Vector(location) - center).to_track_quat("Z", "Y").to_euler()

scene.render.resolution_x = 420
scene.render.resolution_y = 560
scene.render.resolution_percentage = 100
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 6
scene.cycles.use_denoising = False
try:
    scene.view_settings.view_transform = "Standard"
except TypeError:
    pass

socket = arm.pose.bones.get(SOCKET) if mount else None
assert not mount or socket, "missing weapon socket %s" % SOCKET
for action_name in ACTION_NAMES:
    action = bpy.data.actions.get(action_name)
    assert action is not None, "missing action %s" % action_name
    arm.animation_data.action = action
    start, end = action.frame_range
    for sample in range(SAMPLES):
        progress = sample / (SAMPLES - 1)
        frame = int(round(start + (end - start) * progress))
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        if mount and socket:
            socket_world = arm.matrix_world @ socket.matrix
            location, rotation, _ = socket_world.decompose()
            mount.matrix_world = Matrix.LocRotScale(
                location,
                rotation @ WEAPON_CORRECTION,
                Vector((1, 1, 1)),
            )
        scene.render.filepath = os.path.join(OUTDIR, "%s-%03d.png" % (action_name, sample))
        bpy.ops.render.render(write_still=True)
        print("[action-preview]", action_name, sample, "frame", frame)
    print("ACTION_PREVIEW_DONE", action_name, SAMPLES)
