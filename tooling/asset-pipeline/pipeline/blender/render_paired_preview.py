"""Render two semantic actions together for critical-action validation.

Environment:
    GLB, OUTDIR, ATTACKER_ACTION, VICTIM_ACTION
    MODE=backstab|riposte, SEPARATION=1.45, SCALE=0.1496, SAMPLES=24
    WEAPON (optional), SOCKET=Weapon, WQUAT=x,y,z,w

The victim is anchored at the origin and faces Blender -Y (the imported
character's forward). A backstab attacker starts behind and faces the same way;
a riposte attacker starts in front and faces the victim. Both actions share the
same absolute clock, clamping only after their own authored end frame.
"""

import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

GLB = os.environ["GLB"]
OUTDIR = os.environ["OUTDIR"]
ATTACKER_ACTION = os.environ["ATTACKER_ACTION"]
VICTIM_ACTION = os.environ["VICTIM_ACTION"]
MODE = os.environ.get("MODE", "backstab")
SEPARATION = float(os.environ.get("SEPARATION", "1.45"))
SCALE = float(os.environ.get("SCALE", "0.1496"))
SAMPLES = max(2, int(os.environ.get("SAMPLES", "24")))
WEAPON = os.environ.get("WEAPON")
SOCKET = os.environ.get("SOCKET", "Weapon")
quat_xyzw = [float(v) for v in os.environ.get("WQUAT", "0,0,0,1").split(",")]
WEAPON_CORRECTION = Quaternion((quat_xyzw[3], quat_xyzw[0], quat_xyzw[1], quat_xyzw[2]))

if MODE not in {"backstab", "riposte"}:
    raise ValueError("MODE must be backstab or riposte")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.fps = 30


def import_actor(label, semantic, location, yaw):
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=GLB)
    objects = [o for o in bpy.data.objects if o not in before_objects]
    actions = [a for a in bpy.data.actions if a not in before_actions]
    armature = next(o for o in objects if o.type == "ARMATURE")
    action = next((a for a in actions if a.name == semantic), None)
    if action is None:
        action = next(a for a in actions if a.name.startswith(semantic + "."))
    armature.animation_data_create() if armature.animation_data is None else None
    armature.animation_data.action = action
    root = bpy.data.objects.new(label + "Root", None)
    scene.collection.objects.link(root)
    for obj in objects:
        if obj.parent is None:
            obj.parent = root
    root.scale = (SCALE,) * 3
    root.location = location
    root.rotation_euler.z = yaw
    return root, armature, action


if MODE == "backstab":
    attacker_location = Vector((0, SEPARATION, 0))
    attacker_yaw = 0
else:
    attacker_location = Vector((0, -SEPARATION, 0))
    attacker_yaw = math.pi

_, victim_arm, victim_action = import_actor(
    "Victim", VICTIM_ACTION, Vector((0, 0, 0)), 0)
_, attacker_arm, attacker_action = import_actor(
    "Attacker", ATTACKER_ACTION, attacker_location, attacker_yaw)

weapon_mount = None
if WEAPON:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=WEAPON)
    weapon_objects = [o for o in bpy.data.objects if o not in before]
    weapon_mount = bpy.data.objects.new("AttackerWeaponMount", None)
    scene.collection.objects.link(weapon_mount)
    for obj in weapon_objects:
        if obj.parent is None:
            obj.parent = weapon_mount
            obj.matrix_parent_inverse = Matrix.Identity(4)

world = bpy.data.worlds.new("PreviewWorld")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.22, 0.23, 0.25, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
scene.world = world
for rotation, energy in [((0.5, -0.7, -0.5), 3.0), ((1.0, 0.3, 2.2), 1.5)]:
    light_data = bpy.data.lights.new("PreviewLight", "SUN")
    light_data.energy = energy
    light = bpy.data.objects.new("PreviewLight", light_data)
    scene.collection.objects.link(light)
    light.rotation_euler = rotation

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
scene.collection.objects.link(camera)
camera.location = Vector((4.2, 3.4 if MODE == "backstab" else -3.4, 2.25))
target = Vector((0, 0, 1.0))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.lens = 54
scene.camera = camera

scene.render.resolution_x = 640
scene.render.resolution_y = 480
scene.render.resolution_percentage = 100
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 4
scene.cycles.use_denoising = False
scene.render.image_settings.file_format = "PNG"
try:
    scene.view_settings.view_transform = "Standard"
except TypeError:
    pass

start = min(attacker_action.frame_range[0], victim_action.frame_range[0])
end = max(attacker_action.frame_range[1], victim_action.frame_range[1])
socket = attacker_arm.pose.bones.get(SOCKET) if weapon_mount else None
assert not weapon_mount or socket, "missing weapon socket %s" % SOCKET

for sample in range(SAMPLES):
    progress = sample / (SAMPLES - 1)
    frame = round(start + (end - start) * progress)
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    if weapon_mount and socket:
        socket_world = attacker_arm.matrix_world @ socket.matrix
        location, rotation, _ = socket_world.decompose()
        weapon_mount.matrix_world = Matrix.LocRotScale(
            location,
            rotation @ WEAPON_CORRECTION,
            Vector((1, 1, 1)),
        )
    scene.render.filepath = os.path.join(
        OUTDIR, "%s-%s-%03d.png" % (ATTACKER_ACTION, VICTIM_ACTION, sample))
    bpy.ops.render.render(write_still=True)
    print("[paired-preview]", sample, "frame", frame)

print("PAIRED_PREVIEW_DONE", ATTACKER_ACTION, VICTIM_ACTION, SAMPLES)
