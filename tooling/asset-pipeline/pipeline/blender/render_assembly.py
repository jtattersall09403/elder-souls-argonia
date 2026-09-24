"""Headless assembly renderer (Wine Blender). Driven by `pipeline/render_assembly.py`.

Reads a jobs file (see that module for the frames, the rotation convention and
why the sheets exist) and writes six PNGs per assembly: four LEVEL orthographic
elevations (front, back, left, right, at the bearings the host computed off the
front arrow), an orthographic plan, and the front elevation with the collider
wire. Beside them `<safeName>-frames.json` records each frame's camera
(orthographic scale, centre, axes, resolution) and each piece's rendered box;
the host draws the metre scale, the label, the front arrows, the human bar and
the ground cut line on the PNGs from it (PIL, not Blender text). Each view is
framed to the pieces' box by the host's `frame_view` (10 % margin), loaded from
`pipeline/render_assembly.py` so the arithmetic lives, and is tested, once.
The red ground rings and the grid are hidden on elevations: seen edge-on they
were a dark smear, and the host's cut line replaces them. Context pieces (role
`context`) are ghosted and get no ring, dots or collider.

A compile position (x, up, z) is Blender (x, -z, up); a compile yaw of t deg is
a Blender rotation of -t about +Z. Nothing else in this file may re-derive that.

Env:
    JOBS   = windows path to the jobs json written by render_assembly.build_jobs
    OUTDIR = windows path to an existing output directory
Writes OUTDIR/<safeName>-{front,back,left,right,plan,collider}.png and
<safeName>-frames.json, and prints "[assembly] ...".
"""

import importlib.util
import json
import math
import os
import sys

import bpy
from mathutils import Vector

# The host module (pure Python at import) holds the framing arithmetic.
_HOST_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "render_assembly.py")
_spec = importlib.util.spec_from_file_location("host_render_assembly", _HOST_PATH)
host = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = host       # @dataclass looks its module up by name
_spec.loader.exec_module(host)

JOBS = json.loads(open(os.environ["JOBS"]).read())
OUTDIR = os.environ["OUTDIR"]
RES = int(JOBS.get("res") or 512)
# The preset (host render_assembly.PRESETS): which frames and how many samples.
VIEWS = tuple(JOBS.get("views") or ("front", "back", "left", "right", "plan", "collider"))
SAMPLES = int(JOBS.get("samples") or 12)

GROUND_RED = (0.95, 0.06, 0.06, 1)
DOOR_YELLOW = (0.98, 0.85, 0.10, 1)
COLLIDER_CYAN = (0.10, 0.80, 0.95, 1)
GRID_GREY = (0.32, 0.32, 0.34, 1)
LINE_M = 0.05           # thickness of every drawn line, in metres
WIRE_M = 0.03           # collider wireframe thickness


# --------------------------------------------------------------------------- #
def emission(name, colour):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeEmission")
    shader.inputs[0].default_value = colour
    shader.inputs[1].default_value = 2.0
    mat.node_tree.links.new(shader.outputs[0], out.inputs[0])
    return mat


def bar(centre, size, colour, name="mark"):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centre)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.data.materials.append(emission(f"__{name}_{colour}", colour))
    return obj


def ball(centre, radius, colour, name="dot"):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=centre, segments=12,
                                         ring_count=8)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(emission(f"__{name}_{colour}", colour))
    return obj


def compile_to_blender(point):
    x, up, z = point
    return Vector((x, -z, up))


def place(point_local, world_m, yaw_deg):
    """A piece-local compile offset -> a Blender world point (compile convention)."""
    t = math.radians(yaw_deg)
    x, up, z = point_local
    wx = world_m[0] + x * math.cos(t) - z * math.sin(t)
    wz = world_m[2] + x * math.sin(t) + z * math.cos(t)
    return compile_to_blender((wx, world_m[1] + up, wz))


def ghost_material(src, alpha):
    """A copy of `src` whose Principled BSDF is at `alpha` (grey ghost if none)."""
    if src is not None and src.use_nodes:
        mat = src.copy()
        principled = [n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"]
        if principled:
            node = principled[0]
            for link in list(node.inputs["Alpha"].links):
                mat.node_tree.links.remove(link)
            node.inputs["Alpha"].default_value = alpha
            mat.surface_render_method = "BLENDED"
            return mat
    mat = bpy.data.materials.new("__ghost")
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (0.6, 0.6, 0.62, 1.0)
    node.inputs["Alpha"].default_value = alpha
    mat.surface_render_method = "BLENDED"
    return mat


def apply_override(meshes, override):
    """Mount-pair legibility: child flat magenta, parent at 40 % alpha, no shadows.

    The material goes in OBJECT-linked slots: the mesh data is shared with the
    library original and every later assembly that uses the asset.
    """
    if not override:
        return
    for obj in meshes:
        if override["kind"] == "emission":
            obj.visible_shadow = True
            mat = emission("__mount_child", tuple(override["rgba"]))
            if not obj.material_slots:
                obj.data.materials.append(None)
            for slot in obj.material_slots:
                slot.link = "OBJECT"
                slot.material = mat
        elif override["kind"] == "ghost":
            obj.visible_shadow = False
            if not obj.material_slots:
                obj.data.materials.append(None)
            for slot in obj.material_slots:
                src = slot.material
                slot.link = "OBJECT"
                slot.material = ghost_material(src, float(override["alpha"]))


# --------------------------------------------------------------------------- #
def scene_setup():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    # Cycles on CPU: headless Wine has no OpenGL context and EEVEE segfaults
    # (same reason as render_kit_sheet.py).
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.transparent_max_bounces = 64
    scene.render.resolution_x = scene.render.resolution_y = RES
    scene.world = bpy.data.worlds.new("sheet")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.42, 0.52, 0.66, 1.0)
    bg.inputs[1].default_value = 1.4
    sun_data = bpy.data.lights.new("sun", type="SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(52), 0, math.radians(35))
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam, cam_data


def is_lod_or_helper(name):
    low = name.lower()
    return ("lod1" in low or "lod2" in low or "billboard" in low or "_lod_flat" in low)


def import_kits(paths):
    """Import each kit GLB once; return {glb: {assetId: root}} with LODs removed.

    The imported originals live in a collection EXCLUDED from the view layer.
    `hide_render` keeps them out of the picture but not out of the depsgraph, so
    without the exclusion every Cycles frame re-evaluates the whole imported kit
    — the dominant cost of a batch render (round 1: 48 s per template).
    """
    libraries = {}
    library = bpy.data.collections.new("__library")
    bpy.context.scene.collection.children.link(library)
    for glb in paths:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb)
        fresh = [o for o in bpy.data.objects if o not in before]
        for obj in list(fresh):
            if is_lod_or_helper(obj.name):
                for child in obj.children_recursive:
                    bpy.data.objects.remove(child, do_unlink=True)
                bpy.data.objects.remove(obj, do_unlink=True)
        roots = {}
        for obj in bpy.data.objects:
            if obj in fresh and obj.parent is None and obj.name in bpy.data.objects:
                roots[obj.get("assetId") or obj.name] = obj
        for obj in roots.values():
            for node in [obj] + list(obj.children_recursive):
                node.hide_render = True
                for used in list(node.users_collection):
                    used.objects.unlink(node)
                library.objects.link(node)
        libraries[glb] = roots
    bpy.context.view_layer.layer_collection.children[library.name].exclude = True
    return libraries


def copy_tree(root, collection):
    """Deep-copy an object hierarchy (mesh data shared), return the new root."""
    mapping = {}
    for src in [root] + list(root.children_recursive):
        dup = src.copy()
        dup.hide_render = False
        collection.objects.link(dup)
        mapping[src] = dup
    for src, dup in mapping.items():
        dup.parent = mapping.get(src.parent, None) if src.parent in mapping else None
        if dup.parent is not None:
            dup.matrix_parent_inverse = src.matrix_parent_inverse
    return mapping[root]


def mesh_objects(root):
    return [o for o in [root] + list(root.children_recursive) if o.type == "MESH"]


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            lo = Vector((min(lo[i], p[i]) for i in range(3)))
            hi = Vector((max(hi[i], p[i]) for i in range(3)))
    return lo, hi


def wireframe_copy(objs, collection):
    """A cyan wire shell of the given meshes — the collider, drawn as geometry."""
    made = []
    mat = emission("__collider", COLLIDER_CYAN)
    for src in objs:
        dup = src.copy()
        dup.data = src.data.copy()
        collection.objects.link(dup)
        # Unparent FIRST: `parent = None` after `matrix_world =` keeps the
        # parent-local basis, which put every piece's wire on the assembly
        # origin (the Lilmoth gate showed one piece's worth of cyan).
        world = src.matrix_world.copy()
        dup.parent = None
        dup.matrix_world = world
        modifier = dup.modifiers.new("wire", "WIREFRAME")
        modifier.thickness = WIRE_M
        modifier.use_replace = True
        # Even offset extrudes along the angle bisector, which on the sliver
        # faces every Skyrim NIF carries throws metre-long spikes across the
        # frame and hides the piece. Off, the wire follows the mesh.
        modifier.use_even_offset = False
        modifier.use_boundary = True
        dup.data.materials.clear()
        dup.data.materials.append(mat)
        made.append(dup)
    return made


def wire_box(centre_blender, size, yaw_deg, collection):
    """A cyan wire box — a declared collider volume, not the mesh's own wire."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=tuple(centre_blender))
    obj = bpy.context.object
    obj.name = "colliderbox"
    obj.scale = size
    obj.rotation_euler = (0.0, 0.0, -math.radians(yaw_deg))
    modifier = obj.modifiers.new("wire", "WIREFRAME")
    modifier.thickness = WIRE_M
    modifier.use_replace = True
    obj.data.materials.clear()
    obj.data.materials.append(emission("__collider", COLLIDER_CYAN))
    for used in list(obj.users_collection):
        used.objects.unlink(obj)
    collection.objects.link(obj)
    return [obj]


def collider_wires_for(piece, meshes, collection):
    """The collider as the manifest declares it.

    `collisionBox` (a `convex` asset) is a declared BOX in the runtime y-up
    frame: drawn as a box, so a reader can see a box swallowing the gaps. Only a
    `mesh` collider is drawn from the geometry; `none` draws nothing, and the
    sheet says so.
    """
    box = piece.get("collisionBox")
    if box:
        hx, hup, hz = (float(v) for v in box["halfExtentsM"])
        cx, cup, cz = (float(v) for v in (box.get("centreOffsetM") or [0, 0, 0]))
        centre = place((cx, cup, cz), piece["worldM"], piece["worldYawDeg"])
        return wire_box(centre, (hx * 2, hz * 2, hup * 2), piece["worldYawDeg"],
                        collection)
    if piece.get("collision") == "none":
        return []
    return wireframe_copy(meshes, collection)


def ground_ring(lo, hi, z, colour, name):
    """A rectangle outline drawn flat at height `z` (the designed ground line)."""
    cx, cy = (lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5
    hx, hy = max((hi.x - lo.x) * 0.5, 0.3) + 0.15, max((hi.y - lo.y) * 0.5, 0.3) + 0.15
    made = []
    for dx, dy, sx, sy in ((0, hy, hx, LINE_M / 2), (0, -hy, hx, LINE_M / 2),
                           (hx, 0, LINE_M / 2, hy), (-hx, 0, LINE_M / 2, hy)):
        made.append(bar((cx + dx, cy + dy, z), (sx * 2, sy * 2, LINE_M), colour, name))
    return made


def grid(lo, hi, z):
    made = []
    x0, x1 = math.floor(lo.x) - 1, math.ceil(hi.x) + 1
    y0, y1 = math.floor(lo.y) - 1, math.ceil(hi.y) + 1
    for x in range(x0, x1 + 1):
        made.append(bar((x, (y0 + y1) / 2, z - 0.02),
                        (LINE_M, y1 - y0, LINE_M / 2), GRID_GREY, "grid"))
    for y in range(y0, y1 + 1):
        made.append(bar(((x0 + x1) / 2, y, z - 0.02),
                        (x1 - x0, LINE_M, LINE_M / 2), GRID_GREY, "grid"))
    return made


# --------------------------------------------------------------------------- #
def render_assembly(scene, cam, cam_data, libraries, assembly):
    collection = bpy.data.collections.new("assembly")
    scene.collection.children.link(collection)
    drawn, collider_wires, piece_meshes, plan_only = [], [], [], []
    boxes = {}
    for piece in assembly["pieces"]:
        root = libraries[piece["glb"]].get(piece["assetId"])
        if root is None:
            print(f"[assembly] MISSING {piece['assetId']}")
            continue
        dup = copy_tree(root, collection)
        dup.location = compile_to_blender(piece["worldM"])
        dup.rotation_euler = (math.radians(piece.get("pitchDeg") or 0.0), 0.0,
                              -math.radians(piece["worldYawDeg"]))
        scale = float(piece.get("scale") or 1.0)     # a mount parent's mined scale
        dup.scale = (scale, scale, scale)
        bpy.context.view_layer.update()
        meshes = mesh_objects(dup)
        piece_meshes += meshes
        if not meshes:
            continue
        apply_override(meshes, piece.get("override"))
        lo, hi = bounds(meshes)
        boxes[piece["id"]] = {"lo": list(lo), "hi": list(hi)}
        if piece.get("role", "test") != "test":
            continue          # context: ghosted, no ring, dots or collider
        pivot_z = piece["worldM"][1]
        sink = piece.get("designedSinkM")
        ground_z = pivot_z + (sink if sink is not None else 0.0)
        rings = ground_ring(lo, hi, ground_z, GROUND_RED, "groundline")
        drawn += rings
        plan_only += rings
        # The collider wire gets its OWN frame: a mesh collider on a Skyrim
        # piece is thousands of edges, and drawn over the five judging frames it
        # hides the piece it is meant to describe (the first sheets were
        # unreadable). Hidden here, shown in `-collider.png`.
        collider_wires += collider_wires_for(piece, meshes, collection)
        # The front arrow is drawn by the host on every view (frames.json).
        for door in piece.get("dotsM") or []:
            point = place(door, piece["worldM"], piece["worldYawDeg"])
            if host.inside_box(tuple(point), tuple(lo), tuple(hi)):
                drawn.append(ball(tuple(point), 0.25, DOOR_YELLOW, "doorway"))

    if not piece_meshes:
        print(f"[assembly] EMPTY {assembly['name']}")
        bpy.data.collections.remove(collection)
        return 0

    lo, hi = bounds(piece_meshes)
    ground = assembly.get("groundZ") or 0.0
    grid_bars = grid(lo, hi, ground)
    drawn += grid_bars
    plan_only += grid_bars
    # Framing points: every mesh's own box corners in world space (tighter than
    # the assembly's axis-aligned box on a yawed piece).
    corners = [tuple(obj.matrix_world @ Vector(c)) for obj in piece_meshes
               for c in obj.bound_box]

    # Every mark above is made with `bpy.ops`, which links the new object to the
    # view layer's ACTIVE collection (the scene root), not to this assembly's
    # collection. Adopting them here is what makes the teardown below complete:
    # without it each assembly inherits every earlier assembly's grid, ground
    # rings, arrows and human bar, and a batch sheet is unreadable by frame ten.
    for obj in drawn:
        for used in list(obj.users_collection):
            used.objects.unlink(obj)
        collection.objects.link(obj)

    for wire in collider_wires:
        wire.hide_render = True
    written = 0
    frames = {}
    bearings = dict(assembly["elevationBearingsDeg"])
    bearings["collider"] = bearings["front"]
    cam_data.type = "ORTHO"
    cam_data.clip_start = 0.1
    for view in VIEWS:
        if view == "collider":
            for wire in collider_wires:
                wire.hide_render = False
        for obj in plan_only:
            if obj.hide_render != (view != "plan"):   # assign only on change
                obj.hide_render = view != "plan"
        # Level and orthographic, framed to the pieces: the camera stands on
        # the side it is named for, at the host's bearing (compile frame,
        # north = 0, clockwise; compile (sin t, -cos t) is Blender (sin t, cos t)).
        frame = host.frame_view(corners, "plan" if view == "plan" else "elevation",
                                bearings.get(view, 0.0))
        toward = Vector(frame["toward"])
        distance = frame["depthM"] * 0.5 + 5.0
        cam_data.ortho_scale = frame["orthoScale"]
        cam_data.clip_end = frame["depthM"] + 20.0
        cam.location = tuple(Vector(frame["centre"]) + toward * distance)
        if view == "plan":
            cam.rotation_euler = (0.0, 0.0, 0.0)
        else:
            cam.rotation_euler = (-toward).to_track_quat("-Z", "Y").to_euler()
        frames[view] = {"orthoScale": frame["orthoScale"], "centreUpM": frame["centreUpM"],
                        "res": RES, "centre": frame["centre"], "right": frame["right"],
                        "up": frame["up"], "toward": frame["toward"]}
        path = os.path.join(OUTDIR, f"{assembly['safeName']}-{view}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        written += 1
    frames["pieces"] = boxes
    with open(os.path.join(OUTDIR, f"{assembly['safeName']}-frames.json"), "w") as fh:
        json.dump(frames, fh)
    spans = ",".join(f"{frames[v]['orthoScale']:.1f}" for v in VIEWS if v in frames)
    print(f"[assembly] {assembly['name']} -> {written} frames "
          f"span={spans}m pieces={len(assembly['pieces'])}")

    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)
    # The per-assembly copies leave orphan mesh and material datablocks behind;
    # over a few hundred assemblies that is the whole of Blender's memory.
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        if block.users == 0:
            bpy.data.materials.remove(block)
    return written


def main():
    scene, cam, cam_data = scene_setup()
    glbs = sorted({p["glb"] for a in JOBS["assemblies"] for p in a["pieces"]})
    libraries = import_kits(glbs)
    total = 0
    for assembly in JOBS["assemblies"]:
        total += render_assembly(scene, cam, cam_data, libraries, assembly)
    print(f"[assembly] done {total} frames, {len(JOBS['assemblies'])} assemblies")


main()
