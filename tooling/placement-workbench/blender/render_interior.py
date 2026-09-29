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

sys.path.insert(0, os.path.dirname(HERE))
from workbench import interior_render as ir  # noqa: E402  (the eye rule, unit-tested there)

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


def clear_eye(scene, shot, corners):
    """The shot's camera matrix. A corner shot stands at its eye from
    interior_render.corner_eyes (from the arrival point; `corners` caches
    them across the rows), aimed at its target; then every eye walks along
    its line to the target until interior_render.settle_eye accepts it
    (inside the room, its view clear), so its aim holds. Returns (matrix,
    metres moved, warning or None)."""
    from mathutils import Vector
    m, target = Matrix(shot["matrix"]), tuple(shot["targetBlender"])
    dg = bpy.context.evaluated_depsgraph_get()

    def cast(origin, direction, max_m):
        o = Vector(origin)
        ok, loc, *_ = scene.ray_cast(dg, o, Vector(direction), distance=max_m)
        return (loc - o).length if ok else None
    if "fromArrival" in shot:
        key = tuple(shot["arrivalEye"])
        if key not in corners:
            corners[key] = ir.corner_eyes(cast, key, shot["eyeHeightM"])
        eyes = corners[key]
        if shot["fromArrival"] < len(eyes):
            m = Matrix(ir._look_matrix(eyes[shot["fromArrival"]], target))
    eye, moved = ir.settle_eye(cast, tuple(m.translation), target, shot["eyeHeightM"])
    m.translation = Vector(eye)
    inside = ir.is_inside(cast, eye) and ir.on_level(cast, eye, shot["eyeHeightM"])
    clear = ir.view_clear(cast, eye, target)
    warn = None
    if not inside or clear < 1.0:
        warn = (f"[wb-irender] warning {shot['name']} eye at {tuple(round(v, 2) for v in eye)} "
                f"inside and level={inside} view clear {clear:.2f} of 1")
    return m, moved, warn


def main():
    import time
    t = [time.time(), time.process_time()]
    print(f"[wb-irender] start {t[0]:.3f}")

    def lap(what):
        now, cpu = time.time(), time.process_time()
        print(f"[wb-irender] time {what} {now - t[0]:.2f} cpu {cpu - t[1]:.2f}")
        t[0], t[1] = now, cpu
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
    lap("import")
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
    lap("lights")
    corners = {}
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
        m, moved, warn = clear_eye(scene, shot, corners)
        if warn:
            print(warn)
        cam.matrix_world = m
        lap(f"{shot['name']}-eye")
        if moved:
            print(f"[wb-irender] {shot['name']} stepped {moved} m toward its target")
        scene.render.filepath = shot["out"]
        bpy.ops.render.render(write_still=True)
        lap(f"{shot['name']}-render")
        print(f"[wb-irender] wrote {shot['out']}")
    print("[wb-irender] done")


try:
    main()
except Exception as exc:  # Blender exits 0 when a --python script raises
    import traceback
    traceback.print_exc()
    print(f"[wb-irender] FAILED {exc}")
    sys.exit(1)
