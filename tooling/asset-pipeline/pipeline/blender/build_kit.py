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
import numpy as np
from mathutils import Matrix, Vector

PLAN = json.loads(open(os.environ["BUILD_PLAN"], "r", encoding="utf-8").read())
SUMMARY = {"kit": PLAN["kit"], "assets": []}

#: Diffuse images whose alpha channel drives an alpha test at runtime; these
#: get their transparent RGB dilated before export (see dilate_edge_rgb).
ALPHA_TESTED_IMAGES = set()

#: Images sampled by `_lod_flat` billboard cards. These are SHARED atlases
#: (one tamrieltreelod.dds carries every species' silhouette in a small UV
#: rect), so the general textureMaxSize downscale would leave each species a
#: handful of texels and the cards render as solid slabs (owner Phase 10
#: round 3). They keep their own, larger cap (billboardTextureMaxSize).
BILLBOARD_IMAGES = set()

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
            ALPHA_TESTED_IMAGES.add(diffuse.name)
    mat.use_backface_culling = not double_sided
    # Alpha only reaches the exporter for foliage; opaque kit pieces stay
    # opaque so their textures can leave as JPEG rather than PNG.
    if hasattr(mat, "blend_method"):
        try:
            mat.blend_method = "BLEND" if double_sided else "OPAQUE"
        except TypeError:
            pass
    return diffuse.name if diffuse else None


def dilate_edge_rgb(image, iterations=12):
    """Flood opaque RGB outward into fully transparent texels.

    NIF-converted foliage textures usually carry black (or grey) RGB under
    their transparent texels, and mip generation averages RGB regardless of
    alpha — so every runtime-generated mip inherits a black halo and distant
    canopies darken toward black blocks (research doc
    openworld-vegetation-placement-architecture §4.1 cause 2). three.js mips
    at upload time, so the only place to fix the source data is here, before
    export. Iterative 8-neighbour averaging is deterministic; ~12 texels of
    flood at the shipped 256 px covers the mips (level 3–4) that dominate at
    the distances where the defect reads.
    """
    width, height = image.size
    if not (width and height):
        return False
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba = pixels.reshape(height, width, 4)
    solid = rgba[..., 3] > 0.1
    if solid.all() or not solid.any():
        return False
    rgb = rgba[..., :3]
    for _ in range(iterations):
        if solid.all():
            break
        summed = np.zeros_like(rgb)
        counts = np.zeros((height, width), dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                # np.roll wraps, which matches the GPU's repeat sampling.
                neighbour_solid = np.roll(np.roll(solid, dy, axis=0), dx, axis=1)
                neighbour_rgb = np.roll(np.roll(rgb, dy, axis=0), dx, axis=1)
                summed += neighbour_rgb * neighbour_solid[..., None]
                counts += neighbour_solid
        grow = (~solid) & (counts > 0)
        if not grow.any():
            break
        rgb[grow] = summed[grow] / counts[grow][:, None]
        solid |= grow
    rgba[..., :3] = rgb
    image.pixels.foreach_set(pixels)
    return True


def import_nif_meshes(filepath):
    """Import a NIF, bake unit scale into the meshes, drop everything else."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.pynifly(
        filepath=filepath,
        create_bones=False,
        import_tris=False,
        import_animations=False,
        import_collisions=False,
        blender_xf=False,
        rotate_bones_pretty=False,
    )
    imported = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in imported if o.type == "MESH"]
    scale_matrix = Matrix.Scale(UNIT_SCALE, 4)
    for obj in meshes:
        obj.data.transform(scale_matrix @ obj.matrix_world)
        obj.matrix_world = Matrix.Identity(4)
        obj.parent = None
    for obj in imported:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    return meshes


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
    # Bake transforms and convert units in one step, then detach from any
    # imported parents so each asset is a clean root.
    meshes = import_nif_meshes(asset["nif"])
    if not meshes:
        print("[kit] WARNING no mesh in %s" % asset["id"])
        continue

    textures = set()
    materials = set()
    for obj in meshes:
        for slot in obj.material_slots:
            if slot.material:
                # Single-user copy: NIF material names are generic
                # ("plant_pmat1") and PyNifly can bind a later import to an
                # earlier asset's same-named material, so rebuilding it for
                # this asset would silently retexture the other one.
                if slot.material.users > 1:
                    slot.material = slot.material.copy()
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

    # T4 far tier: the source pool's authored `_lod_flat` billboard, exported
    # one level past the decimated chain and flagged so the runtime can pick
    # it beyond the mesh rings. These are static cross/flat cutout cards —
    # fine at distance, no octahedral impostor authoring (module 65 §110).
    billboard_materials = set()
    if asset.get("lodFlatNif"):
        flat_meshes = import_nif_meshes(asset["lodFlatNif"])
        flat_textures = set()
        for obj in flat_meshes:
            for slot in obj.material_slots:
                if slot.material:
                    if slot.material.users > 1:
                        slot.material = slot.material.copy()
                    name = rebuild_material(slot.material, True)
                    billboard_materials.add(slot.material.name)
                    if name:
                        flat_textures.add(name)
        # A billboard whose texture carries no alpha channel would pass the
        # runtime alpha test everywhere and read as solid black slabs — the
        # exact defect this tier exists to fix. Drop it; the decimated chain
        # stays the final level for that species.
        has_alpha = any(
            bpy.data.images[n].depth in (32, 64)
            for n in flat_textures if n in bpy.data.images
        )
        if flat_meshes and has_alpha:
            for obj in flat_meshes:
                obj.parent = root
                obj["lod"] = len(asset["lodRatios"]) + 1
                obj["billboard"] = True
                obj["assetId"] = asset["id"]
            textures |= flat_textures
            BILLBOARD_IMAGES |= flat_textures
        else:
            print("[kit] WARNING billboard unusable (no mesh or no alpha) in %s"
                  % asset["id"])
            for obj in flat_meshes:
                bpy.data.objects.remove(obj, do_unlink=True)
            billboard_materials = set()
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
    if billboard_materials:
        record["billboard"] = True
        record["billboardMaterials"] = sorted(billboard_materials)
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
max_billboard = PLAN.get("billboardTextureMaxSize", 1024)
for image in bpy.data.images:
    if image.source != "FILE" or not max(image.size or (0, 0)):
        continue
    # Shared billboard atlases keep more resolution: each species only owns a
    # small UV rect of them (see BILLBOARD_IMAGES).
    cap = max_billboard if image.name in BILLBOARD_IMAGES else max_texture
    longest = max(image.size)
    if longest > cap:
        factor = cap / longest
        image.scale(max(1, int(image.size[0] * factor)),
                    max(1, int(image.size[1] * factor)))
        print("[kit] resized %s -> %dx%d" % (image.name, image.size[0], image.size[1]))
# After the resize, so the flood works on the texels that actually ship and
# stays cheap; before packing, so the dilated buffer is what gets exported.
dilated = 0
for image in bpy.data.images:
    if image.name in ALPHA_TESTED_IMAGES and image.source == "FILE":
        # Larger billboard atlases need a deeper flood for the same mip reach.
        iterations = 24 if image.name in BILLBOARD_IMAGES else 12
        if dilate_edge_rgb(image, iterations=iterations):
            dilated += 1
print("[kit] dilated transparent-texel RGB in %d foliage textures" % dilated)
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
