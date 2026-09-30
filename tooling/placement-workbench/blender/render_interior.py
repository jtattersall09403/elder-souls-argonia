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
  times ambient/pi added as emission; a cell with an ambient cube (the
  runtime's LightProbe, ambientCube.ts) multiplies that by the cube's
  E(n) = sum_a m_a a^2 + d_a a on the world normal in the material's nodes
  (exact to the probe: both are the same quadratic); the directional is a shadowless sun
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


GLOW_STRENGTH = 4.0   # an emissive flame card's strength: it reads as flame in both rows


def glow_card(mat):
    """A flame card the loader draws (a piece with mined `flames`): its
    texture as emission, blended additively (Add Shader over Transparent),
    scaled by its alpha, so it reads as flame in the sources-only row too."""
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    base = bsdf.inputs["Base Color"] if bsdf else None
    alpha = bsdf.inputs["Alpha"] if bsdf else None
    col_src = base.links[0].from_socket if base is not None and base.is_linked else None
    a_src = alpha.links[0].from_socket if alpha is not None and alpha.is_linked else None
    col_val = tuple(base.default_value) if base is not None else (1.0, 0.5, 0.1, 1.0)
    for n in list(nt.nodes):
        if n.type != "TEX_IMAGE" and n.type != "UVMAP":
            nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = GLOW_STRENGTH
    mul = nt.nodes.new("ShaderNodeMixRGB")
    mul.blend_type = "MULTIPLY"
    mul.inputs[0].default_value = 1.0
    if col_src is not None:
        nt.links.new(col_src, mul.inputs[1])
    else:
        mul.inputs[1].default_value = col_val
    if a_src is not None:
        nt.links.new(a_src, mul.inputs[2])
    else:
        mul.inputs[2].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(mul.outputs[0], em.inputs["Color"])
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(tr.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs[0])
    mat.blend_method = "BLEND"


def cube_colour(nt, cube):
    """Nodes computing the ambient cube's E(n) (linear rgb) on the world normal;
    ``cube`` is ``interior_render.cube_blender`` (m, d per Blender axis)."""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sq = nt.nodes.new("ShaderNodeVectorMath")
    sq.operation = "MULTIPLY"
    nt.links.new(geo.outputs["Normal"], sq.inputs[0])
    nt.links.new(geo.outputs["Normal"], sq.inputs[1])
    comb = nt.nodes.new("ShaderNodeCombineRGB")
    for c in range(3):
        dm = nt.nodes.new("ShaderNodeVectorMath")
        dm.operation = "DOT_PRODUCT"
        nt.links.new(sq.outputs[0], dm.inputs[0])
        dm.inputs[1].default_value = tuple(cube["m"][a][c] for a in range(3))
        dd = nt.nodes.new("ShaderNodeVectorMath")
        dd.operation = "DOT_PRODUCT"
        nt.links.new(geo.outputs["Normal"], dd.inputs[0])
        dd.inputs[1].default_value = tuple(cube["d"][a][c] for a in range(3))
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        nt.links.new(dm.outputs["Value"], add.inputs[0])
        nt.links.new(dd.outputs["Value"], add.inputs[1])
        nt.links.new(add.outputs[0], comb.inputs[c])
    return comb.outputs[0]


def ambient_materials(ambient, cards, glow=(), cube=None):
    """Add albedo x ambient/pi as emission to every Principled material (the
    AmbientLight three.js never occludes); flame-card materials the loader
    leaves undrawn go transparent, those it draws (`glow`) go emissive and
    additive (`glow_card`). Returns the ambient colour sockets, set per row."""
    k = [c / math.pi for c in ambient]
    sockets = []
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        if glow and _is_card(mat.name, glow) and not _is_card(mat.name, cards):
            glow_card(mat)
            print(f"[wb-irender] flame card {mat.name} emissive")
            continue
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
        if cube:
            by_normal = nt.nodes.new("ShaderNodeMixRGB")
            by_normal.blend_type = "MULTIPLY"
            by_normal.inputs[0].default_value = 1.0
            nt.links.new(mul.outputs[0], by_normal.inputs[1])
            nt.links.new(cube_colour(nt, cube), by_normal.inputs[2])
            mul = by_normal
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


def bed_tongues(world, fires):
    """A flame-card bed (a hearth's fxfirewithembers01) burns 2-3 core and
    2-3 outer cards spread over its bed (fx/fire/FlameSystem.ts), not one
    wick: its proxy (`fire{i}`, a teardrop h x 0.44 h from the fire pass)
    is widened to the preset's width plus its spread, and two outer tongues
    of 0.7 h stand at +-0.8 spread, so the render shows the hearth at the
    size the game burns it."""
    body = bpy.data.materials.get("fire-proxy")
    for i, fire in enumerate(fires or []):
        spread = fire.get("spreadM")
        if not spread:
            continue
        h = float(fire["heightM"])
        obj = world.objects.get(f"fire{i}")
        if obj is not None:
            k = (float(fire["widthM"]) + spread) / (h * 0.44)
            obj.scale = (k, k, obj.scale[2])
        x, y, z = fire["at"]
        for side, dx in (("l", -0.8 * spread), ("r", 0.8 * spread)):
            t = 0.7 * h
            bpy.ops.mesh.primitive_uv_sphere_add(radius=t * 0.22, segments=12, ring_count=8,
                                                 location=(x + dx, y, z + t * 0.45))
            tongue = bpy.context.active_object
            tongue.name = f"fire{i}-{side}"
            tongue.scale = (1.0, 1.0, 2.2)
            if body is not None:
                tongue.data.materials.append(body)
            for used in list(tongue.users_collection):
                used.objects.unlink(tongue)
            world.objects.link(tongue)


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


def scene_cast(scene):
    from mathutils import Vector
    dg = bpy.context.evaluated_depsgraph_get()

    def cast(origin, direction, max_m):
        o = Vector(origin)
        ok, loc, *_ = scene.ray_cast(dg, o, Vector(direction), distance=max_m)
        return (loc - o).length if ok else None

    def who(origin, direction, max_m):
        """(distance, piece uid) of the first hit (copy_tree's `wb_uid`), or None."""
        o = Vector(origin)
        ok, loc, _n, _i, obj, _m = scene.ray_cast(dg, o, Vector(direction), distance=max_m)
        if not ok:
            return None
        src = getattr(obj, "original", obj)
        return (loc - o).length, src.get("wb_uid") or src.name
    cast.who = who
    return cast


def floor_survey(scene):
    """interior_render.floor_plan on the scene: the floor ray-cast below the
    arrival marker against the room's main (largest) walkable level."""
    lo, hi = JOB["boundsBlender"]
    plan = ir.floor_plan(scene_cast(scene), lo, hi, JOB["arrivalBlender"])
    print(f"[wb-irender] floor arrival {plan['arrivalZ']:.2f} below {plan['belowZ']:.2f} "
          f"main {plan['mainZ']:.2f} onMain={plan['onMain']} eyes on {plan['floorZ']:.2f} "
          f"hub {tuple(round(v, 2) for v in plan['hub'])} levels {plan['levels']}")
    return plan


def clear_eye(scene, shot, eyes):
    """The shot's camera matrix from interior_render.eye_plan (`eyes`,
    computed once for the cell): the doorway at the landing edge or 1.2 m
    in, the corners the two best-scoring candidates 90+ degrees apart, all
    looking at the hub. A view the plan has no eye for falls back to its
    fallback camera walked by interior_render.settle_eye, with a warning.
    Returns (matrix, metres moved, warning or None)."""
    cast = scene_cast(scene)
    target = tuple(eyes["target"])
    view = shot["view"]
    eye = None
    if view == "doorway" and eyes["doorway"] is not None:
        eye, target = eyes["doorway"]
    elif view in ("corner-a", "corner-b"):
        i = 0 if view == "corner-a" else 1
        eye = eyes["corners"][i] if i < len(eyes["corners"]) else None
    if eye is not None:
        score = (ir.door_score if view == "doorway" else ir.score_eye)(cast, eye, target)
        warn = None
        if score < ir.MIN_SCORE_M:
            warn = (f"[wb-irender] warning {shot['name']} eye at {tuple(round(v, 2) for v in eye)} "
                    f"scores {score:.2f} m, under {ir.MIN_SCORE_M}")
        print(f"[wb-irender] eyes {shot['name']} at {tuple(round(v, 2) for v in eye)} "
              f"aim {tuple(round(v, 2) for v in target)} score {score:.2f}")
        return Matrix(ir._look_matrix(eye, target)), 0.0, warn
    m = Matrix(shot["matrix"])
    t = tuple(shot["targetBlender"])
    eye, moved = ir.settle_eye(cast, tuple(m.translation), t, shot["eyeHeightM"])
    t = ir.level_aim(eye, t)             # within MAX_PITCH_DEG of level
    m = Matrix(ir._look_matrix(eye, t))
    return m, moved, (f"[wb-irender] warning {shot['name']} has no scored eye; fallback at "
                      f"{tuple(round(v, 2) for v in eye)} view clear {ir.view_clear(cast, eye, t):.2f}")


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
    plan = floor_survey(scene)
    if JOB.get("surveyOnly"):
        print("[wb-irender] done")
        return
    shots = [ir.on_floor(s, plan, JOB["arrivalFloor"]) for s in JOB["shots"]]
    sockets, amb = ambient_materials(JOB.get("ambient") or [0, 0, 0], JOB.get("flameCards") or [],
                                     JOB.get("glowCards") or [], JOB.get("ambientCube"))
    rs.add_fire_light_pass(world, JOB.get("fires"))
    bed_tongues(world, JOB.get("fires"))
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
    eyes = ir.eye_plan(scene_cast(scene), plan, JOB["doorBlender"])
    print(f"[wb-irender] eyes hub {tuple(round(v, 2) for v in eyes['hub'])} corners on "
          f"{eyes['cornerZ']:.2f} scores {eyes['scores']} doorway on {eyes['doorZ']:.2f} at "
          + (f"{tuple(round(v, 2) for v in eyes['doorway'][0])} aim {tuple(round(v, 2) for v in eyes['doorway'][1])}"
             if eyes["doorway"] is not None else "none (fallback camera)"))
    if eyes["doorway"] is None:           # why the doorway search found nothing
        st = {}
        side = ir.door_side_eye(scene_cast(scene), JOB["doorBlender"], eyes["doorZ"], eyes["target"], st)
        print(f"[wb-irender] eyes doorway-search door {tuple(round(v, 2) for v in JOB['doorBlender'])} "
              f"side spots {st} best {None if side is None else round(side[0], 2)}")
    for shot in shots:
        day = shot["row"] == "day"
        for s in sockets:
            s.default_value = (*(amb if day else (0.0, 0.0, 0.0)), 1.0)
        if sun is not None:
            sun.data.energy = math.pi if day else 0.0
        cam_data.type = "PERSP"
        cam_data.lens = shot.get("lens", 14.0)
        cam_data.clip_start = 0.05
        cam_data.clip_end = 500.0
        m, moved, warn = clear_eye(scene, shot, eyes)
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
