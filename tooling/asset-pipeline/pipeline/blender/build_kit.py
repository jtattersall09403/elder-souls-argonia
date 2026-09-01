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
import math
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

#: Floor on the triangle count a decimated LOD level may fall to. The kit's
#: `lodRatios` are proportions, which is right for a 12k-triangle willow and
#: destructive for a 273-triangle shrub: 0.12 leaves it ~33 triangles, i.e. a
#: collapsed cross-plane that reads as a flat dark cutout however close the
#: player stands (owner Phase 10 round 4, uplands 1.59 km E / 1.63 km S).
#: A mesh already at or below the floor keeps its full geometry at every
#: level — there is nothing to save on a mesh this small anyway.
MIN_LOD_TRIANGLES = 300

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


def import_composite(parts):
    """Assemble one asset out of several source NIFs.

    Some of the best material in the mod pools ships as a KIT rather than a
    tree: Tropical Skyrim's 34 m Anvil trunk and its 23 m fern crown are two
    separate meshes, and neither is a tree on its own. Composing them here is
    sourcing, not modelling — the geometry is the mod author's, only its
    arrangement is ours — and it is the only way to reach a 30-40 m canopy of
    genuinely tropical trees (owner round-6: the wide-crowned species we had
    all read as temperate oaks).

    Offsets are metres in kit source space (z-up), measured from the composite
    origin, which is the first part's own origin. Strays are dropped per PART,
    before composing, so one part's leftover tube cannot be mistaken for
    another part's legitimate offset.
    """
    composed = []
    trunk = []
    for index, part in enumerate(parts):
        meshes = import_nif_meshes(part["nif"])
        meshes, dropped = drop_strays(meshes)
        for stray in dropped:
            print("[kit]   dropped stray shape %s at %s" % (stray["shape"], stray["offsetM"]))
        offset = Vector(part.get("offsetM", [0.0, 0.0, 0.0]))
        scale = part.get("scale", 1.0)
        yaw = math.radians(part.get("yawDeg", 0.0))
        transform = (Matrix.Translation(offset)
                     @ Matrix.Rotation(yaw, 4, "Z")
                     @ Matrix.Scale(scale, 4))
        for obj in meshes:
            # Single-user copy FIRST. Importing the same NIF twice (the canopy
            # tree uses one crown mesh at two places) can hand back objects
            # sharing a mesh datablock, and `data.transform` then moves both —
            # which shipped one crown at the composite's feet.
            if obj.data.users > 1:
                obj.data = obj.data.copy()
            obj.data.transform(transform)
        composed.extend(meshes)
        if index == 0:
            trunk = list(meshes)
    # `mesh.transform()` edits the datablock but leaves `object.bound_box`
    # cached. Every part but the LAST one gets flushed by the next part's
    # import; without this the final part measures at its untransformed
    # position and the whole composite's height, pivot and trunk capsule come
    # out wrong (it shipped one crown reading as if it sat at the tree's feet).
    bpy.context.view_layer.update()
    return composed, trunk


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


def _median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def trunk_capsule(objects, lo, hi):
    """The capsule a tree should collide with: its trunk, not its canopy.

    Module 65 §111 gives trees a trunk capsule and nothing else. Round 5
    shipped this crown-sized and in the wrong frame (owner: "blocked by air
    beside the trunk, walked through the trunk itself"), so the v2 contract
    is explicit:

    * **Frame: pivot-relative, glTF Y-up** — exactly what the runtime places
      by. (Round 5 emitted the XY relative to the BBOX CENTRE while the
      runtime read it as pivot-relative, and assumed the pivot sat at the
      bbox bottom — up to 7 m of error on the big willow.)
    * **Radius: measured on a chest-height trunk slice**, not the bottom 10 %
      of the whole tree — that band swept in root flares and ground-skirt
      bush cards and produced 1.3–5.3 m "trunks". The slice centre is the
      per-axis MEDIAN (robust against one-sided skirt cards; a leaning
      palm's trunk is nowhere near the bbox centre) and the radius a low
      percentile of the slice distances, so trunk vertices dominate and a
      drooping frond cannot inflate the capsule.

    Returns (radius, height, base_offset_gltf[x, y, z]).

    `lo`/`hi` are recomputed from the objects' VERTICES rather than trusted
    from the caller, because `object.bound_box` is a cache that a fresh
    `mesh.transform()` does not invalidate — the composite path measured the
    emergent giant's capsule base 5 m up its own trunk that way. For an
    up-to-date object this is the same answer, just not a cached one.
    """
    vertices = [obj.matrix_world @ v.co for obj in objects for v in obj.data.vertices]
    if vertices:
        lo = Vector((min(v[i] for v in vertices) for i in range(3)))
        hi = Vector((max(v[i] for v in vertices) for i in range(3)))
    height = hi.z - lo.z
    band_lo = lo.z + min(0.3, height * 0.05)
    band_hi = lo.z + max(band_lo - lo.z + 0.2, min(2.0, height * 0.35))
    points = [(v.x, v.y) for v in vertices if band_lo <= v.z <= band_hi]
    if not points:
        return 0.25, round(height, 3), [0.0, round(lo.z, 3), 0.0]
    cx = _median([p[0] for p in points])
    cy = _median([p[1] for p in points])
    distances = sorted(((p[0] - cx) ** 2 + (p[1] - cy) ** 2) ** 0.5 for p in points)
    radius = distances[min(len(distances) - 1, int(len(distances) * 0.35))]
    # Blender z-up world -> glTF Y-up: (x, y, z) -> (x, z, -y).
    base = [round(cx, 3), round(lo.z, 3), round(-cy, 3)]
    return round(max(0.15, radius), 3), round(height, 3), base


exported = []
for asset in PLAN["assets"]:
    # Bake transforms and convert units in one step, then detach from any
    # imported parents so each asset is a clean root.
    trunk_meshes = None
    if asset.get("parts"):
        meshes, trunk_meshes = import_composite(asset["parts"])
    else:
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

    dropped = []
    if not asset.get("parts"):
        # Composites drop their strays per part, inside import_composite —
        # doing it again here would read a legitimately offset crown as a stray.
        meshes, dropped = drop_strays(meshes)
        for stray in dropped:
            print("[kit]   dropped stray shape %s at %s"
                  % (stray["shape"], stray["offsetM"]))
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
            # Ratios are proportional; the floor is absolute. Small source
            # meshes keep their geometry rather than collapsing to a plane.
            source_tris = len(obj.data.loop_triangles) or len(obj.data.polygons)
            effective = ratio
            if source_tris > 0:
                effective = min(1.0, max(ratio, MIN_LOD_TRIANGLES / source_tris))
            modifier = copy.modifiers.new(name="decimate", type="DECIMATE")
            modifier.ratio = effective
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
    # Collision frame contract (v2, round 6): every offset below is
    # PIVOT-relative in glTF Y-up axes — Blender (x, y, z) -> (x, z, -y) —
    # i.e. directly addable to the instance position before yaw rotation.
    # The runtime asserts on this tag; a kit without it gets no colliders
    # rather than misplaced ones.
    if asset["collision"] == "trunk-capsule":
        # A composite measures its capsule off its FIRST part only — the
        # trunk. Sampling the whole assembly would take the emergent giant's
        # 12 m buttress-root flare for trunk width and wall the player out of
        # a circle they can see straight through.
        capsule_meshes = trunk_meshes or meshes
        radius, height, base = trunk_capsule(
            capsule_meshes, *(world_bounds(capsule_meshes) if trunk_meshes else (lo, hi)))
        # Explicit override for the handful of meshes the automatic measure
        # gets wrong. `trunk_capsule` takes a percentile of the lowest slab's
        # vertices, which assumes the trunk is where the vertices are; the
        # Anvil giant column is a smooth low-poly cylinder with a dense cap of
        # small triangles at its centre, so the percentile lands inside the
        # cap and returns a 17 cm trunk you can walk through. Overriding one
        # asset is safer than retuning a heuristic that is right for the other
        # fifty (the owner passed those colliders in round 6).
        if asset.get("collisionRadiusM"):
            radius = float(asset["collisionRadiusM"])
        record["collisionFrame"] = "pivot-yup-v2"
        record["collisionCapsule"] = {
            "radiusM": radius, "heightM": height, "baseOffsetM": base,
        }
    elif asset["collision"] == "convex":
        # Boulders and root arches: a box proxy about the mesh bounds, inset a
        # little so the collider hides inside the silhouette — a proxy that
        # sticks out reads as an invisible wall beside the rock. A convex hull
        # would be tighter, but this ships as three numbers rather than a mesh
        # and a boulder is a box to within what the player can feel.
        inset = 0.88
        record["collisionFrame"] = "pivot-yup-v2"
        record["collisionBox"] = {
            "halfExtentsM": [
                round((hi.x - lo.x) / 2 * inset, 3),
                round((hi.z - lo.z) / 2 * inset, 3),
                round((hi.y - lo.y) / 2 * inset, 3),
            ],
            "centreOffsetM": [
                round((lo.x + hi.x) / 2, 3),
                round((lo.z + hi.z) / 2, 3),
                round(-(lo.y + hi.y) / 2, 3),
            ],
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
