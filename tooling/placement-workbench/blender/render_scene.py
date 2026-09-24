"""Blender side of the workbench render (Linux Blender 3.2.2, headless).

Reads JOB (a JSON path in the environment): kit GLBs with the pieces to
pose (asset id -> 4x4 matrices in the workbench frame, which is Blender's:
x east, y north, z up), the ground and water meshes (npy), the camera and
the output path. Cycles on CPU: no GPU and no display on this VM (the same
reason `pipeline/blender/render_assembly.py` gives).

Imports each kit once into an EXCLUDED library collection and copies the
needed asset roots out (mesh data shared), as `render_assembly.import_kits`
does, so Cycles never evaluates the whole kit.
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

JOB = json.loads(open(os.environ["JOB"]).read())


def emission(name, colour, strength=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = colour
    em.inputs[1].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    return mat


def grid_material(name, base, minor=1.0, major=5.0):
    """Ground shader: base colour with world-space lines every `minor` and a
    brighter line every `major` metres (so every view carries a scale)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])

    def line(axis_out, period, width):
        m = nt.nodes.new("ShaderNodeMath")
        m.operation = "PINGPONG"
        m.inputs[1].default_value = period / 2
        nt.links.new(axis_out, m.inputs[0])
        lt = nt.nodes.new("ShaderNodeMath")
        lt.operation = "LESS_THAN"
        lt.inputs[1].default_value = width
        nt.links.new(m.outputs[0], lt.inputs[0])
        return lt.outputs[0]

    def either(a, b):
        mx = nt.nodes.new("ShaderNodeMath")
        mx.operation = "MAXIMUM"
        nt.links.new(a, mx.inputs[0])
        nt.links.new(b, mx.inputs[1])
        return mx.outputs[0]

    minor_l = either(line(sep.outputs[0], minor, 0.03), line(sep.outputs[1], minor, 0.03))
    major_l = either(line(sep.outputs[0], major, 0.07), line(sep.outputs[1], major, 0.07))
    mix1 = nt.nodes.new("ShaderNodeMixRGB")
    mix1.inputs[1].default_value = base
    mix1.inputs[2].default_value = (0.85, 0.85, 0.80, 1)
    mixf = nt.nodes.new("ShaderNodeMath")
    mixf.operation = "MULTIPLY"
    mixf.inputs[1].default_value = 0.55
    nt.links.new(minor_l, mixf.inputs[0])
    nt.links.new(mixf.outputs[0], mix1.inputs[0])
    mix2 = nt.nodes.new("ShaderNodeMixRGB")
    mix2.inputs[2].default_value = (1.0, 0.95, 0.35, 1)
    nt.links.new(mix1.outputs[0], mix2.inputs[1])
    nt.links.new(major_l, mix2.inputs[0])
    nt.links.new(mix2.outputs[0], bsdf.inputs["Base Color"])
    return mat


def mesh_object(name, verts, faces, mat, collection):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(int(i) for i in f) for f in faces])
    me.update()
    obj = bpy.data.objects.new(name, me)
    obj.data.materials.append(mat)
    collection.objects.link(obj)
    return obj


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(JOB.get("samples", 12))
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.transparent_max_bounces = 32
    scene.render.resolution_x = int(JOB["res"][0])
    scene.render.resolution_y = int(JOB["res"][1])
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("wb")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.62, 0.72, 1.0)
    bg.inputs[1].default_value = 1.2
    sun_data = bpy.data.lights.new("sun", type="SUN")
    sun_data.energy = 3.2
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(30))
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam, cam_data


def import_kits(needed):
    """{glb: set(assetId)} -> {assetId: root object} (library excluded)."""
    library = bpy.data.collections.new("__library")
    bpy.context.scene.collection.children.link(library)
    roots = {}
    for glb, ids in needed.items():
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb)
        fresh = [o for o in bpy.data.objects if o not in before]
        keep = []
        for obj in fresh:
            if obj.parent is None and obj.get("assetId") in ids:
                keep.append(obj)
        keep_all = set()
        for obj in keep:
            keep_all.add(obj)
            keep_all.update(obj.children_recursive)
        for obj in fresh:
            if obj not in keep_all:
                bpy.data.objects.remove(obj, do_unlink=True)
        for obj in keep:
            for node in list(obj.children_recursive):
                if "__lod" in node.name:
                    for sub in [node] + list(node.children_recursive):
                        if sub.name in bpy.data.objects:
                            bpy.data.objects.remove(sub, do_unlink=True)
            if any(abs(obj.matrix_world[i][j] - (1.0 if i == j else 0.0)) > 1e-4
                   for i in range(4) for j in range(4)):
                print(f"[wb-render] warning: {obj.get('assetId')} root is not at the identity")
            for node in [obj] + list(obj.children_recursive):
                for used in list(node.users_collection):
                    used.objects.unlink(node)
                library.objects.link(node)
            roots[obj.get("assetId")] = obj
    bpy.context.view_layer.layer_collection.children[library.name].exclude = True
    return roots


def copy_tree(root, collection, matrix, tint=None):
    mapping = {}
    for src in [root] + list(root.children_recursive):
        dup = src.copy()
        collection.objects.link(dup)
        mapping[src] = dup
    for src, dup in mapping.items():
        dup.parent = mapping.get(src.parent) if src.parent in mapping else None
        if dup.parent is not None:
            dup.matrix_parent_inverse = src.matrix_parent_inverse
    top = mapping[root]
    top.matrix_world = matrix @ root.matrix_world
    if tint is not None:
        for dup in mapping.values():
            if dup.type == "MESH":
                dup.data = dup.data.copy()
                dup.data.materials.clear()
                dup.data.materials.append(tint)
    return top


def main():
    scene, cam, cam_data = scene_setup()
    world = bpy.data.collections.new("world")
    scene.collection.children.link(world)
    needed = {}
    for p in JOB["pieces"]:
        needed.setdefault(p["glb"], set()).add(p["assetId"])
    roots = import_kits(needed)
    tints = {}
    for p in JOB["pieces"]:
        root = roots.get(p["assetId"])
        if root is None:
            print(f"[wb-render] missing {p['assetId']} in {p['glb']}")
            continue
        tint = None
        if p.get("tint"):
            key = tuple(p["tint"])
            if key not in tints:
                tints[key] = emission(f"tint{len(tints)}", (*p["tint"], 1.0), 0.9)
            tint = tints[key]
        copy_tree(root, world, Matrix(p["matrix"]), tint)
    ground = np.load(JOB["ground"])
    mesh_object("ground", ground["verts"], ground["faces"],
                grid_material("ground", (0.36, 0.33, 0.26, 1)), world)
    if len(ground["water_faces"]):
        water = bpy.data.materials.new("water")
        water.use_nodes = True
        b = water.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.10, 0.28, 0.45, 1)
        b.inputs["Alpha"].default_value = 0.55
        water.blend_method = "BLEND"
        mesh_object("water", ground["water_verts"], ground["water_faces"], water, world)
    for i, mark in enumerate(JOB.get("marks", [])):
        mat = emission(f"mark{i}", (*mark["colour"], 1.0), 2.0)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=mark.get("radius", 0.15),
                                             location=mark["at"])
        obj = bpy.context.active_object
        obj.data.materials.append(mat)
        for used in list(obj.users_collection):
            used.objects.unlink(obj)
        world.objects.link(obj)
    for shot in JOB["shots"]:
        cam_data.type = "ORTHO" if shot["ortho"] else "PERSP"
        if shot["ortho"]:
            cam_data.ortho_scale = shot["orthoScale"]
        else:
            cam_data.lens = shot.get("lens", 35)
        cam_data.clip_start = shot.get("clipStart", 0.1)
        cam_data.clip_end = shot.get("clipEnd", 5000)
        cam_data.shift_x = shot.get("shiftX", 0.0)
        cam_data.shift_y = shot.get("shiftY", 0.0)
        cam.matrix_world = Matrix(shot["matrix"])
        sun = bpy.data.objects["sun"]
        if shot.get("sunDir"):
            # light from behind the camera: an elevation is never backlit
            sun.rotation_euler = Vector(shot["sunDir"]).to_track_quat("-Z", "Y").to_euler()
        else:
            sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(30))
        scene.render.resolution_x, scene.render.resolution_y = shot["res"]
        scene.render.filepath = shot["out"]
        # a cutaway's interior gets no sun through its walls: light it inside
        lamps = []
        for i, at in enumerate(shot.get("lights", [])):
            data = bpy.data.lights.new(f"inner{i}", type="POINT")
            data.energy = 3000.0
            data.shadow_soft_size = 0.05
            lamp = bpy.data.objects.new(f"inner{i}", data)
            lamp.location = at
            scene.collection.objects.link(lamp)
            lamps.append(lamp)
        bpy.ops.render.render(write_still=True)
        for lamp in lamps:
            bpy.data.objects.remove(lamp, do_unlink=True)
        print(f"[wb-render] wrote {shot['out']}")
    print("[wb-render] done")


try:
    main()
except Exception as exc:  # Blender exits 0 when a --python script raises
    import traceback
    traceback.print_exc()
    print(f"[wb-render] FAILED {exc}")
    sys.exit(1)
