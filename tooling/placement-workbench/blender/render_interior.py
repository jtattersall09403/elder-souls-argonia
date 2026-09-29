"""Blender side of `wb.py render-interior` (Linux Blender 3.2.2, headless,
Cycles on CPU). JOB (environment) is written by workbench/interior_render.py:
pieces (raw kit GLB, asset id, Blender matrix, id), the cell's lights, its
ambient and directional, the fires and the flame-card materials to hide,
and the shots (camera matrix, lens, row `day` or `night`, out path).

Reuses the render's kit import and fire pass (render_scene.py:
`import_kits` through the per-kit .blend cache, `copy_tree`,
`add_fire_light_pass`), and lights the room as the runtime's interior
loader does, never with the render's sky or sun:
- each LIGH record is a shadowless point light; three.js intensity I
  (candela) is Cycles power 4*pi*I W (Cycles: outgoing = albedo * P /
  (4 pi^2 d^2); three.js: albedo / pi * I / d^2, measured on a white plane),
  times three.js's range window (1 - (d/r)^4)^2 in the light's own nodes,
  and d^(2-decay) so the falloff is three.js's 1/d^decay for any decay;
- the AmbientLight (never occluded in three.js) is each material's albedo
  times ambient/pi added as emission; the directional is a shadowless sun
  from straight above at strength pi;
- direct light only (no bounces: three.js has none), Filmic view.
Row `night` (the sources pass) switches the ambient and the directional off.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

import render_scene as rs  # noqa: E402  (reads JOB; its main() runs only as __main__)

JOB = rs.JOB


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(JOB.get("samples", 24))
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 16
    scene.cycles.diffuse_bounces = 0
    scene.cycles.glossy_bounces = 0
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0
    scene.cycles.transparent_max_bounces = 16
    scene.render.resolution_x, scene.render.resolution_y = JOB["res"]
    scene.view_settings.view_transform = "Filmic"
    scene.world = bpy.data.worlds.new("irender")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam, cam_data


def _is_card(name, cards):
    return any(name == c or name.startswith(c + ".") for c in cards)


def ambient_materials(ambient, cards):
    """Add albedo x ambient/pi as emission to every Principled material (the
    AmbientLight three.js never occludes); flame-card materials go
    transparent (the loader leaves them undrawn). Returns the ambient colour
    sockets, set per row."""
    k = [c / math.pi for c in ambient]
    sockets = []
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        if _is_card(mat.name, cards):
            for n in list(nt.nodes):
                nt.nodes.remove(n)
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            tr = nt.nodes.new("ShaderNodeBsdfTransparent")
            nt.links.new(tr.outputs[0], out.inputs[0])
            mat.blend_method = "BLEND"
            continue
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        base = bsdf.inputs["Base Color"]
        amb = nt.nodes.new("ShaderNodeRGB")
        amb.outputs[0].default_value = (*k, 1.0)
        mul = nt.nodes.new("ShaderNodeMixRGB")
        mul.blend_type = "MULTIPLY"
        mul.inputs[0].default_value = 1.0
        if base.is_linked:
            nt.links.new(base.links[0].from_socket, mul.inputs[1])
        else:
            mul.inputs[1].default_value = base.default_value
        nt.links.new(amb.outputs[0], mul.inputs[2])
        emit, strength = bsdf.inputs["Emission"], bsdf.inputs["Emission Strength"]
        add = nt.nodes.new("ShaderNodeMixRGB")
        add.blend_type = "ADD"
        add.inputs[0].default_value = 1.0
        nt.links.new(mul.outputs[0], add.inputs[1])
        s = float(strength.default_value) if not strength.is_linked else 1.0
        if emit.is_linked:
            nt.links.new(emit.links[0].from_socket, add.inputs[2])
        else:
            add.inputs[2].default_value = tuple(v * s for v in emit.default_value[:3]) + (1.0,)
        strength.default_value = 1.0
        nt.links.new(add.outputs[0], emit)
        sockets.append(amb.outputs[0])
    return sockets, tuple(k)


def record_light(i, rec, scene):
    """A LIGH record: shadowless point light, three.js intensity and window."""
    data = bpy.data.lights.new(f"light{i}", type="POINT")
    data.energy = 4.0 * math.pi * rec["intensity"]
    data.color = tuple(rec["colour"])
    data.shadow_soft_size = 0.0
    data.cycles.cast_shadow = False
    data.use_nodes = True
    nt = data.node_tree
    em = next(n for n in nt.nodes if n.type == "EMISSION")
    path = nt.nodes.new("ShaderNodeLightPath")
    ratio = nt.nodes.new("ShaderNodeMath")
    ratio.operation = "DIVIDE"
    ratio.inputs[1].default_value = rec["radiusM"]
    nt.links.new(path.outputs["Ray Length"], ratio.inputs[0])
    p4 = nt.nodes.new("ShaderNodeMath")
    p4.operation = "POWER"
    p4.inputs[1].default_value = 4.0
    nt.links.new(ratio.outputs[0], p4.inputs[0])
    one = nt.nodes.new("ShaderNodeMath")
    one.operation = "SUBTRACT"
    one.use_clamp = True
    one.inputs[0].default_value = 1.0
    nt.links.new(p4.outputs[0], one.inputs[1])
    sq = nt.nodes.new("ShaderNodeMath")
    sq.operation = "POWER"
    sq.inputs[1].default_value = 2.0
    nt.links.new(one.outputs[0], sq.inputs[0])
    strength = sq.outputs[0]
    decay = rec.get("decay", 2.0)
    if abs(decay - 2.0) > 1e-6:
        # Cycles falls off as 1/d^2; three.js as 1/d^decay: times d^(2-decay)
        fall = nt.nodes.new("ShaderNodeMath")
        fall.operation = "POWER"
        fall.inputs[1].default_value = 2.0 - decay
        nt.links.new(path.outputs["Ray Length"], fall.inputs[0])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(sq.outputs[0], mul.inputs[0])
        nt.links.new(fall.outputs[0], mul.inputs[1])
        strength = mul.outputs[0]
    nt.links.new(strength, em.inputs["Strength"])
    obj = bpy.data.objects.new(f"light{i}", data)
    obj.location = rec["at"]
    scene.collection.objects.link(obj)
    return obj


CLEAR_M = 1.5      # a view with anything nearer than this across its frame steps in
FAN_DEG = (-40.0, -20.0, 0.0, 20.0, 40.0)   # the rays across the frame's width that must be clear
STEP_M = 0.7
ENCLOSED_M = 30.0  # inside = every horizontal ray and the up ray hit within this
FLOOR_M = 3.0      # ... and a floor lies within this below the eye


def is_inside(scene, dg, eye):
    """True when 8 horizontal rays and 1 up ray all hit geometry within
    ENCLOSED_M and a floor is hit within FLOOR_M below: the eye stands in a
    room, not outside its shell looking at the void (walk 5: KeebaHouseElder's
    corners, room box widened by lower-level poles and an outer floor)."""
    from mathutils import Vector
    rays = [Vector((math.cos(a), math.sin(a), 0.0))
            for a in (i * math.pi / 4.0 for i in range(8))] + [Vector((0.0, 0.0, 1.0))]
    for ray in rays:
        if not scene.ray_cast(dg, eye, ray, distance=ENCLOSED_M)[0]:
            return False
    return scene.ray_cast(dg, eye, Vector((0.0, 0.0, -1.0)), distance=FLOOR_M)[0]


def step_inside(scene, dg, eye, target):
    """Step from the eye toward the target until is_inside holds; the target
    itself when no step on the way is inside. Returns (eye, metres moved)."""
    d = target - eye
    n = max(1, int(d.length / STEP_M))
    for i in range(n + 1):
        p = eye + d * (i / n)
        if is_inside(scene, dg, p):
            return p, (p - eye).length
    return target.copy(), d.length


def clear_eye(scene, matrix, target):
    """Step the camera inside the room first (step_inside), then toward its
    target while anything stands nearer than
    CLEAR_M on a fan of rays across the frame (a pillar, a shelf or a wall
    of the corner fills the frame otherwise); at most six steps, never
    within 2 m of the target."""
    from mathutils import Euler, Vector
    m = Matrix(matrix)
    eye, target = m.translation.copy(), Vector(target)
    dg = bpy.context.evaluated_depsgraph_get()
    eye, moved = step_inside(scene, dg, eye, target)
    for _ in range(6):
        d = target - eye
        if d.length < 2.0 + STEP_M:
            break
        ahead = d.normalized()
        near = CLEAR_M
        for deg in FAN_DEG:
            ray = ahead.copy()
            ray.rotate(Euler((0.0, 0.0, math.radians(deg))))
            ok, loc, *_ = scene.ray_cast(dg, eye, ray, distance=CLEAR_M)
            if ok:
                near = min(near, (loc - eye).length)
        if near >= CLEAR_M:
            break
        eye = eye + ahead * STEP_M
        moved += STEP_M
    m.translation = eye
    return m, round(moved, 2)


def main():
    scene, cam, cam_data = setup()
    world = bpy.data.collections.new("world")
    scene.collection.children.link(world)
    needed = {}
    for p in JOB["pieces"]:
        needed.setdefault(p["glb"], set()).add(p["assetId"])
    roots = rs.import_kits(needed)
    for p in JOB["pieces"]:
        root = roots.get(p["assetId"])
        if root is None:
            print(f"[wb-render] missing {p['assetId']} in {p['glb']}")
            continue
        rs.copy_tree(root, world, Matrix(p["matrix"]), None, uid=p["uid"])
    sockets, amb = ambient_materials(JOB.get("ambient") or [0, 0, 0], JOB.get("flameCards") or [])
    rs.add_fire_light_pass(world, JOB.get("fires"))
    for obj in world.objects:          # the proxies are markers, never light sources
        if obj.name.startswith("fire"):
            obj.visible_diffuse = obj.visible_glossy = obj.visible_shadow = False
    for i, rec in enumerate(JOB.get("lights") or []):
        record_light(i, rec, scene)
    sun = None
    if JOB.get("directional"):
        sd = bpy.data.lights.new("directional", type="SUN")
        sd.color = tuple(JOB["directional"])
        sd.cycles.cast_shadow = False
        sun = bpy.data.objects.new("directional", sd)
        scene.collection.objects.link(sun)
        sun.rotation_euler = (0.0, 0.0, 0.0)        # straight down
    for shot in JOB["shots"]:
        day = shot["row"] == "day"
        for s in sockets:
            s.default_value = (*(amb if day else (0.0, 0.0, 0.0)), 1.0)
        if sun is not None:
            sun.data.energy = math.pi if day else 0.0
        cam_data.type = "PERSP"
        cam_data.lens = shot.get("lens", 14.0)
        cam_data.clip_start = 0.05
        cam_data.clip_end = 500.0
        m, moved = clear_eye(scene, shot["matrix"], shot["targetBlender"])
        cam.matrix_world = m
        if moved:
            print(f"[wb-irender] {shot['name']} stepped {moved} m in past a blocker")
        scene.render.filepath = shot["out"]
        bpy.ops.render.render(write_still=True)
        print(f"[wb-irender] wrote {shot['out']}")
    print("[wb-irender] done")


try:
    main()
except Exception as exc:  # Blender exits 0 when a --python script raises
    import traceback
    traceback.print_exc()
    print(f"[wb-irender] FAILED {exc}")
    sys.exit(1)
