"""G-buffer bake for octahedral impostors (walk-5 perf, impostor far tier).

Run by `pipeline/impostor_bake.py` in native Linux Blender (3.2, Cycles CPU;
no GL context on the VM). Imports one preview GLB (`tree_tiers.preview`,
scene root `source`), and renders the tree seen from a LIST of directions in
ONE render: a copy of the tree per direction, each rotated so that direction
faces a single orthographic camera, laid out on a grid of square cells of
`cellM` metres, `cellPx` pixels each. Passes written: diffuse colour (albedo,
unlit), world normal (un-rotated per cell by the driver), alpha and depth
(camera distance; the driver turns it into depth along the view direction).

The alpha test is made hard (texture alpha > 0.5) as the runtime draws it.
Directions and the cell basis are glTF (Y-up) object space; the frame basis
is `right = normalize(cross(Y, d))` (X where d is vertical), `up = d x right`,
the same function the runtime shader uses (game-core vegetation/impostor.ts).

    blender -b --python impostor_bake.py -- <job.json>
job: {"glb", "outDir", "dirs": [[x,y,z],...], "cols", "cellM", "cellPx",
      "samples"}  -> <outDir>/{albedo,normal,alpha,depth}.npy, bounds.json
"""
import glob
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

job = json.load(open(sys.argv[sys.argv.index("--") + 1]))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=job["glb"])
scene = bpy.context.scene

source = []
for obj in list(bpy.data.objects):
    top = obj
    while top.parent is not None:
        top = top.parent
    if top.name.split(".")[0] == "source":
        if obj.type == "MESH":
            source.append(obj)
    else:
        bpy.data.objects.remove(obj, do_unlink=True)

for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    for node in list(nt.nodes):
        if node.type != "BSDF_PRINCIPLED":
            continue
        sock = node.inputs["Alpha"]
        if not sock.is_linked:
            continue
        src = sock.links[0].from_socket
        cmp = nt.nodes.new("ShaderNodeMath")
        cmp.operation = "GREATER_THAN"
        cmp.inputs[1].default_value = 0.5
        nt.links.new(src, cmp.inputs[0])
        nt.links.new(cmp.outputs[0], sock)
    mat.blend_method = "CLIP"


def to_blender(g):
    return Vector((g[0], -g[2], g[1]))


def basis(d):
    """glTF frame basis for direction d (unit, toward the viewer)."""
    r = np.cross([0.0, 1.0, 0.0], d)
    n = np.linalg.norm(r)
    r = np.array([1.0, 0.0, 0.0]) if n < 1e-6 else r / n
    return r, np.cross(d, r)


verts = []
for obj in source:
    mw = obj.matrix_world
    for v in obj.data.vertices:
        w = mw @ v.co
        verts.append((w.x, w.z, -w.y))  # glTF
verts = np.array(verts)
lo, hi = verts.min(0), verts.max(0)
centre = (lo + hi) / 2

# All source objects into one collection, instanced once per direction.
coll = bpy.data.collections.new("tree")
for obj in source:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj.parent = None if obj.parent is None else obj.parent
bpy.context.scene.collection.children.link(coll)
bpy.context.view_layer.layer_collection.children["tree"].exclude = True

dirs = [np.array(d, dtype=float) / np.linalg.norm(d) for d in job["dirs"]]
cols = int(job["cols"])
rows = (len(dirs) + cols - 1) // cols
S = float(job["cellM"])
W = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # columns: X, Z, -Y
c_b = to_blender(centre)
rot = []
for i, d in enumerate(dirs):
    r, u = basis(d)
    B = Matrix((to_blender(r), to_blender(u), to_blender(d))).transposed()
    M = W @ B.transposed()
    rot.append([list(row) for row in M])
    col, row = i % cols, i // cols
    cell = Vector(((col + 0.5) * S - cols * S / 2, 0.0, rows * S / 2 - (row + 0.5) * S))
    empty = bpy.data.objects.new("view%d" % i, None)
    empty.instance_type = "COLLECTION"
    empty.instance_collection = coll
    empty.matrix_world = Matrix.Translation(cell) @ M.to_4x4() @ Matrix.Translation(-c_b)
    scene.collection.objects.link(empty)

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.clip_start = 0.01
cam_data.clip_end = 100000.0
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
far = S * 50
cam.matrix_world = Matrix.Translation((0, -far, 0)) @ W.to_4x4()
aspect_w, aspect_h = cols * S, rows * S
cam_data.ortho_scale = max(aspect_w, aspect_h)
scene.render.resolution_x = cols * int(job["cellPx"])
scene.render.resolution_y = rows * int(job["cellPx"])
scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1.0

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = int(job.get("samples", 8))
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 0
scene.cycles.transparent_max_bounces = 128
scene.cycles.filter_width = 1.0
scene.render.film_transparent = True
scene.render.use_compositing = True
scene.world = bpy.data.worlds.new("black")
vl = scene.view_layers[0]
vl.use_pass_diffuse_color = True
vl.use_pass_normal = True
vl.use_pass_z = True

scene.use_nodes = True
nt = scene.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
rl = nt.nodes.new("CompositorNodeRLayers")
comp = nt.nodes.new("CompositorNodeComposite")
nt.links.new(rl.outputs["Image"], comp.inputs["Image"])
out = job["outDir"]
os.makedirs(out, exist_ok=True)
fo = nt.nodes.new("CompositorNodeOutputFile")
fo.base_path = out
fo.format.file_format = "OPEN_EXR"
fo.format.color_depth = "32"
fo.file_slots.clear()
for name, sock in (("albedo", "DiffCol"), ("normal", "Normal"), ("alpha", "Alpha"),
                   ("depth", "Depth")):
    fo.file_slots.new(name)
    nt.links.new(rl.outputs[sock], fo.inputs[name])
scene.render.filepath = os.path.join(out, "combined.png")
bpy.ops.render.render(write_still=True)

for name in ("albedo", "normal", "alpha", "depth"):
    path = sorted(glob.glob(os.path.join(out, name + "*.exr")))[-1]
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    arr = px.reshape(h, w, 4)[::-1]  # top row first
    np.save(os.path.join(out, name + ".npy"), arr)
    os.remove(path)
json.dump({"far": far, "centre": centre.tolist(), "lo": lo.tolist(), "hi": hi.tolist(),
           "rotations": rot, "rows": rows, "cols": cols},
          open(os.path.join(out, "bounds.json"), "w"))
print("[impostor] baked", len(dirs), "views", scene.render.resolution_x, "x",
      scene.render.resolution_y)
