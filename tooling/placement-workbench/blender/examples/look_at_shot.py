"""Render the applied scene from a camera placed in province metres and aimed
at a point: a side-on or down-the-flight view of a climb, a joint or a seat
that the `joint` sheets (cameras held 1.2 m over the ground, semi-transparent
terrain) cannot show (audit10 c6: from a bank top a joint camera looks through
the cliff at the stair below it). Opaque ground, pieces only, Cycles.
    wb.py bpy <scene> tooling/placement-workbench/blender/examples/look_at_shot.py \
        --out R.json --args CX CY CZ TX TY TZ OUT.png [VFOV_DEG] [hideUid,...]
C = camera, T = target, each (x east, height, z south) in province metres."""
import math
import bpy
from mathutils import Vector, Matrix

cx, cy, cz, tx, ty, tz = map(float, ARGS[:6])
out = ARGS[6]
vfov = float(ARGS[7]) if len(ARGS) > 7 and ARGS[7] else 50.0
hide = set(ARGS[8].split(",")) if len(ARGS) > 8 and ARGS[8] else set()
cam_pos, target = Vector((cx, -cz, cy)), Vector((tx, -tz, ty))
F = (target - cam_pos).normalized()
scene = bpy.context.scene
for o in scene.objects:
    if o.get("wb_uid") in hide:
        o.hide_render = True
cd = bpy.data.cameras.new("look")
cd.sensor_fit = "VERTICAL"
cd.angle_y = math.radians(vfov)
cd.clip_start = 0.1
cam = bpy.data.objects.new("look", cd)
scene.collection.objects.link(cam)
R = F.cross(Vector((0, 0, 1))).normalized()
U = R.cross(F).normalized()
m = Matrix((R, U, -F)).transposed().to_4x4()
m.translation = cam_pos
cam.matrix_world = m
scene.camera = cam
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.resolution_percentage = 100
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(40), 0.0, math.radians(30))
scene.collection.objects.link(sun)
if scene.world is None:
    scene.world = bpy.data.worlds.new("sky")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.7, 1.0)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
RESULT["out"] = out
RESULT["camera"] = [cx, cy, cz]
RESULT["target"] = [tx, ty, tz]
