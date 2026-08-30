"""Headless Blender builder for a world static kit (Wine Blender 4.4.3).

One run converts every asset in a kit: import the NIF via PyNifly, rebuild its
materials as diffuse Principled BSDF with the alpha channel connected, scale
from Bethesda units to true metres about the native origin, add a decimated
LOD chain, and measure the collision proxy the runtime will need. Exports one
GLB holding every asset as its own root empty.

Statics keep their **native size and origin** — unlike the weapon builder,
which normalises to a target length. A 32 m source tree is a 32 m tree; how
big it ends up in the world is a placement decision, applied per instance.

Env: BUILD_PLAN -> json with keys kit, assets[], metresPerUnit, output_glb,
summary_json.
"""

import bpy
import json
import os
from mathutils import Matrix, Vector

PLAN = json.loads(open(os.environ["BUILD_PLAN"], "r", encoding="utf-8").read())
SUMMARY = {"kit": PLAN["kit"], "assets": []}

bpy.ops.preferences.addon_enable(module="io_scene_nifly")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.meshes):
    bpy.data.meshes.remove(block)

# PyNifly's blender_xf bakes its own convenience transform; importing without
# it keeps one Blender unit equal to one Bethesda unit, so the conversion to
# metres is a single documented multiply rather than two stacked guesses.
UNIT_SCALE = PLAN["metresPerUnit"]

_MAP_SUFFIXES = ("_n", "_msn", "_s", "_sk", "_g", "_m", "_em", "_e", "_p", "_b")


def is_diffuse(image):
    base = os.path.splitext(os.path.basename(image.filepath or image.name))[0].lower()
    return not base.endswith(_MAP_SUFFIXES)


def rebuild_material(mat, double_sided):
    """Diffuse Principled BSDF with alpha linked.

    Foliage is alpha-tested, and the cheapest way to be certain of that at
    runtime is to carry the alpha channel here and let the game set
    `alphaTest` — module 65 §111 forbids alpha-blended foliage outright, so
    the blend mode is deliberately not decided in Blender.
    """
    images = []
    if mat.use_nodes:
        images = [n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    diffuse = next((im for im in images if is_diffuse(im)), None) or (
        images[0] if images else None)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.85
    tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if diffuse is not None:
        diffuse.colorspace_settings.name = "sRGB"
        tex = tree.nodes.new("ShaderNodeTexImage")
        tex.image = diffuse
        tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if double_sided and diffuse.depth in (32, 64):   # alpha-tested foliage
            tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    mat.use_backface_culling = not double_sided
    # Alpha only reaches the exporter for foliage; opaque kit pieces stay
    # opaque so their textures can leave as JPEG rather than PNG.
    if hasattr(mat, "blend_method"):
        try:
            mat.blend_method = "BLEND" if double_sided else "OPAQUE"
        except TypeError:
            pass
    return diffuse.name if diffuse else None


def world_bounds(objects):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], point[i])
                hi[i] = max(hi[i], point[i])
    return lo, hi


def drop_strays(meshes):
    """Discard shapes stranded far from the asset, and say which.

    Source meshes carry modders' leftovers — Tropical Skyrim's man-fern has a
    tube 116 m below the plant — and a stray shape silently inflates the
    asset's height, its LOD switch distance and its clearance radius. Anything
    outside a generous box around the largest shape is not part of the asset.
    """
    if len(meshes) < 2:
        return meshes, []
    boxes = [(obj, *world_bounds([obj])) for obj in meshes]
    anchor = max(boxes, key=lambda b: max(1e-6, (b[2] - b[1]).length))
    _, alo, ahi = anchor
    margin = max(2.0, (ahi - alo).length * 2.0)
    kept, dropped = [], []
    for obj, lo, hi in boxes:
        outside = any(
            hi[i] < alo[i] - margin or lo[i] > ahi[i] + margin for i in range(3)
        )
        if outside:
            dropped.append({
                "shape": obj.name,
                "offsetM": [round(lo[i] - alo[i], 2) for i in range(3)],
            })
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    return kept, dropped


def trunk_capsule(objects, lo, hi):
    """The capsule a tree should collide with: its trunk, not its canopy.

    Module 65 §111 gives trees a trunk capsule and nothing else. Two details
    matter and both were wrong first time round: the capsule centres on the
    *base's own centroid* (a leaning palm's trunk is nowhere near the bounding
    box centre), and the radius is a 90th percentile rather than a maximum, so
    one drooping frond card cannot inflate a 0.3 m trunk into a 4.5 m bollard.
    """
    height = hi.z - lo.z
    band = lo.z + max(0.05, height * 0.10)
    points = []
    for obj in objects:
        matrix = obj.matrix_world
        for vertex in obj.data.vertices:
            point = matrix @ vertex.co
            if point.z <= band:
                points.append((point.x, point.y))
    if not points:
        return 0.25, round(height, 3), [0.0, 0.0]
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    distances = sorted(((p[0] - cx) ** 2 + (p[1] - cy) ** 2) ** 0.5 for p in points)
    radius = distances[min(len(distances) - 1, int(len(distances) * 0.9))]
    centre = [round(cx - (lo.x + hi.x) / 2, 3), round(cy - (lo.y + hi.y) / 2, 3)]
    return round(max(0.08, radius), 3), round(height, 3), centre


exported = []
for asset in PLAN["assets"]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.pynifly(
        filepath=asset["nif"],
        create_bones=False,
        import_tris=False,
        import_animations=False,
        import_collisions=False,
        blender_xf=False,
        rotate_bones_pretty=False,
    )
    imported = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in imported if o.type == "MESH"]
    if not meshes:
        print("[kit] WARNING no mesh in %s" % asset["id"])
        for obj in imported:
            bpy.data.objects.remove(obj, do_unlink=True)
        continue

    # Bake transforms and convert units in one step, then detach from any
    # imported parents so each asset is a clean root.
    scale_matrix = Matrix.Scale(UNIT_SCALE, 4)
    for obj in meshes:
        obj.data.transform(scale_matrix @ obj.matrix_world)
        obj.matrix_world = Matrix.Identity(4)
        obj.parent = None
    for obj in imported:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()

    textures = set()
    materials = set()
    for obj in meshes:
        for slot in obj.material_slots:
            if slot.material:
                name = rebuild_material(slot.material, asset["doubleSided"])
                materials.add(slot.material.name)
                if name:
                    textures.add(name)

    meshes, dropped = drop_strays(meshes)
    for stray in dropped:
        print("[kit]   dropped stray shape %s at %s" % (stray["shape"], stray["offsetM"]))
    lo, hi = world_bounds(meshes)
    size = hi - lo
    if PLAN.get("inspect"):
        for obj in meshes:
            olo, ohi = world_bounds([obj])
            print("[kit]   shape %-40s %6.2f x %6.2f x %6.2f m at z=%.2f" % (
                obj.name[:40], ohi.x - olo.x, ohi.y - olo.y, ohi.z - olo.z, olo.z))
    triangles = sum(len(o.data.loop_triangles) or len(o.data.polygons) for o in meshes)

    root = bpy.data.objects.new(asset["id"].replace(":", "__"), None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_size = 0.1
    # The semantic id travels as glTF `extras`, not as the node name: three.js
    # sanitises node names for its animation property paths and silently
    # strips the slashes out of `bmv__landscape/trees/cypress1`, so a
    # name-based lookup finds nothing and the whole kit renders empty.
    root["assetId"] = asset["id"]
    root["category"] = asset["category"]
    for obj in meshes:
        obj.parent = root

    lods = []
    for level, ratio in enumerate(asset["lodRatios"], start=1):
        for obj in meshes:
            copy = obj.copy()
            copy.data = obj.data.copy()
            copy.name = "%s__lod%d" % (obj.name, level)
            bpy.context.scene.collection.objects.link(copy)
            modifier = copy.modifiers.new(name="decimate", type="DECIMATE")
            modifier.ratio = ratio
            copy.parent = root
            copy["lod"] = level
            copy["assetId"] = asset["id"]
            lods.append((level, ratio, copy))
    bpy.context.view_layer.update()

    record = {
        "id": asset["id"],
        "node": root.name,
        "category": asset["category"],
        "sizeM": [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
        "originOffsetM": [round(-lo.x, 3), round(-lo.y, 3), round(-lo.z, 3)],
        "triangles": triangles,
        "lodRatios": asset["lodRatios"],
        "doubleSided": asset["doubleSided"],
        "alphaTest": asset["doubleSided"],
        "collision": asset["collision"],
        "droppedShapes": dropped,
        "textures": sorted(textures),
        "materials": sorted(materials),
    }
    if asset["collision"] == "trunk-capsule":
        radius, height, centre = trunk_capsule(meshes, lo, hi)
        record["collisionCapsule"] = {
            "radiusM": radius, "heightM": height, "centreOffsetM": centre,
        }
    SUMMARY["assets"].append(record)
    exported.append(root)
    print("[kit] %-52s %7d tris  %5.2f x %5.2f x %5.2f m" % (
        asset["id"], triangles, size.x, size.y, size.z))

max_texture = PLAN.get("textureMaxSize", 1024)
for image in bpy.data.images:
    if image.source != "FILE" or not max(image.size or (0, 0)):
        continue
    longest = max(image.size)
    if longest > max_texture:
        factor = max_texture / longest
        image.scale(max(1, int(image.size[0] * factor)),
                    max(1, int(image.size[1] * factor)))
        print("[kit] resized %s -> %dx%d" % (image.name, image.size[0], image.size[1]))
bpy.ops.file.pack_all()
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=PLAN["output_glb"],
    export_format="GLB",
    use_selection=True,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
    export_animations=False,
    export_morph=False,
    export_apply=True,
    export_extras=True,          # carries assetId and lod through to the runtime
    export_image_format="AUTO",
    export_jpeg_quality=88,
)
SUMMARY["outputGlb"] = PLAN["output_glb"]
SUMMARY["metresPerUnit"] = UNIT_SCALE
open(PLAN["summary_json"], "w", encoding="utf-8").write(json.dumps(SUMMARY, indent=2))
print("[kit] exported %d assets" % len(SUMMARY["assets"]))
print("SUMMARY_WRITTEN")
