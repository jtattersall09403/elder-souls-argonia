"""Render the applied scene from a studio walk camera, to match a walk frame
to the placed pieces (audit10 c5: which piece is the slab in t12-door1-base).
The follow camera stands 5.8 m behind a pivot 1.5 m over the feet, vfov 48,
16:9; stand, yaw (compass rad, 0 north = -z) and pitch are the walk's
route.json waypoint values. Pieces only: no frozen vegetation, so a frame
object with no counterpart here is world vegetation, not the place.
    wb.py bpy <scene> tooling/placement-workbench/blender/examples/studio_shot.py \
        --out R.json --args X Z YAW PITCH OUT.png [hideUid,...]"""
import math
import bpy
from mathutils import Vector, Matrix

sx, sz, yaw, pitch = map(float, ARGS[:4])
out = ARGS[4]
hide = set(ARGS[5].split(",")) if len(ARGS) > 5 and ARGS[5] else set()
fx, fz = math.sin(yaw), -math.cos(yaw)
F = Vector((fx * math.cos(pitch), -fz * math.cos(pitch), -math.sin(pitch))).normalized()
g = api.ground_height(sx, sz)
if g is None:
    g = 38.0
cam_pos = Vector((sx, -sz, g + 1.5)) - F * 5.8
scene = bpy.context.scene
for o in scene.objects:
    if o.get("wb_uid") in hide:
        o.hide_render = True
cd = bpy.data.cameras.new("studio")
cd.sensor_fit = "VERTICAL"
cd.angle_y = math.radians(48.0)
cd.clip_start = 0.3
cam = bpy.data.objects.new("studio", cd)
scene.collection.objects.link(cam)
R = F.cross(Vector((0, 0, 1))).normalized()
U = R.cross(F).normalized()
m = Matrix((R, U, -F)).transposed().to_4x4()
m.translation = cam_pos
cam.matrix_world = m
scene.camera = cam
scene.render.resolution_x, scene.render.resolution_y = 960, 540
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
RESULT["camera"] = [cam_pos[0], -cam_pos[1], cam_pos[2]]
