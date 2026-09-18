/**
 * Loads the compiled flora kit GLB and indexes it by semantic asset id.
 *
 * The kit builder exports one root node per asset (`bmv__landscape/trees/...`,
 * the id with its colon escaped) whose children are the base meshes plus a
 * decimated LOD chain marked with an `lod` extra. This turns that into the
 * shape a renderer wants: per species, an array of levels, each a list of
 * geometry/material pairs to instance.
 */

import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LOD_BAND_M } from "@elder-souls/game-core/fx/lodFade";

export interface KitLevel {
  readonly parts: {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    /** Alpha-tested foliage needs its own shadow depth material, or its
     * shadow is the whole leaf-card quad rather than the leaf shape. */
    depthMaterial?: THREE.Material;
  }[];
  readonly triangles: number;
}

export interface KitSpecies {
  readonly id: string;
  /** Level 0 is the full mesh; later entries are progressively decimated. */
  readonly levels: KitLevel[];
  /** Index into `levels` of the T4 flat-billboard mesh (the source pool's
   * `_lod_flat` variant, exported one past the decimated chain), or null
   * where the species ships none and the last decimated level is final. */
  readonly billboardIndex: number | null;
  /** Source-space height in metres at scale 1, for LOD distance choice. */
  readonly heightM: number;
  /** Trunk radius in metres at scale 1, from the kit's collision capsule.
   * Drives wind stiffness (`windStiffness`): fat trunks barely stir. Null
   * where the species has no trunk capsule (ground plants, aquatics), which
   * the caller reads as "no stiffening". */
  readonly trunkRadiusM: number | null;
  /** Manifest `category` (`tree`, `rock`, `aquatic-plant`, …) — the kit's own
   * vocabulary, carried through so the renderer can treat non-plants as the
   * non-plants they are. */
  readonly category: string | null;
  /** False for anything that is not a plant (rock, deadfall, container, misc,
   * ruin, architecture, clutter). A boulder that bends in the wind is the
   * owner's defect; the renderer must neither patch its material nor let it
   * inherit a plant's sway through a shared material. */
  readonly sways: boolean;
  /** True for the underwater-band species (and anything the manifest calls
   * aquatic): under water you can see a few dozen metres at best, so these
   * draw shorter and step down their LOD chain sooner. */
  readonly submerged: boolean;
  /** Bounds so far from the origin they are clearly stray geometry (the
   * algrass03b case: mesh ~83 m from its pivot). Renderers should skip these
   * — drawing them puts geometry underground or in the sky either way. */
  readonly suspect: boolean;
}

export type FloraKit = Map<string, KitSpecies>;

export interface KitManifestAsset {
  id: string;
  sizeM: [number, number, number];
  /** Origin → bbox max, kit source space (z-up); grounded assets have
   * `originOffsetM[2] ≈ sizeM[2]`. */
  originOffsetM?: [number, number, number];
  triangles: number;
  alphaTest?: boolean;
  /** True when the kit carries a `_lod_flat` billboard as the final level. */
  billboard?: boolean;
  doubleSided?: boolean;
  collision?: string;
  collisionFrame?: string;
  collisionCapsule?: { radiusM: number; heightM: number; baseOffsetM: [number, number, number] };
  /** Kit vocabulary. Land kit: tree, rock, shrub, aquatic-plant, plant,
   * fungus, deadfall, container, grass. Underwater kit adds ruin,
   * architecture, clutter, misc. */
  category?: string;
}

export interface KitManifest {
  kit: string;
  assets: KitManifestAsset[];
}

/**
 * The semantic id comes from glTF `extras`, never from the node name: three.js
 * sanitises node names for animation property paths and strips the slashes out
 * of `bmv__landscape/trees/cypress1`, which silently emptied the whole kit.
 * The name is kept only as a legible fallback.
 */
function assetIdOf(object: THREE.Object3D): string | null {
  const extras = (object.userData ?? {}) as { assetId?: string };
  if (typeof extras.assetId === "string") return extras.assetId;
  return object.name ? object.name.replace("__", ":") : null;
}

/** Triangles across a level's parts, for the identical-level test. */
function partTriangles(parts: KitLevel["parts"]): number {
  let total = 0;
  for (const part of parts) {
    const index = part.geometry.getIndex();
    total += (index ? index.count : part.geometry.attributes.position.count) / 3;
  }
  return total;
}

/** Level index from the exporter's `lod` extra; base meshes have none. */
function levelOf(object: THREE.Object3D): number {
  const extras = (object.userData ?? {}) as { lod?: number };
  return typeof extras.lod === "number" ? extras.lod : 0;
}

/** The kit builder flags the `_lod_flat` far-tier mesh with a `billboard`
 * extra (glTF extras, same channel as `lod` — never the node name). */
function isBillboard(object: THREE.Object3D): boolean {
  const extras = (object.userData ?? {}) as { billboard?: boolean };
  return extras.billboard === true;
}

/**
 * Manifest categories that are not plants. Nothing in this set sways: wind
 * displacing a boulder, a fallen log, a crate or a sunken wall is the owner's
 * round-16f defect, and no amount of amplitude tuning makes it right.
 */
export const NON_SWAYING_CATEGORIES = new Set([
  "rock", "deadfall", "container", "misc", "ruin", "architecture", "clutter",
]);

/** Categories that only ever stand under water. */
const SUBMERGED_CATEGORIES = new Set(["aquatic-plant", "aquatic"]);

/**
 * Metres. Draw ceiling for a submerged species: underwater sight lines are
 * short, and a kelp frond resolved at 400 m is triangles spent behind a wall
 * of scatter.
 */
export const SUBMERGED_MAX_DRAW_M = 120;

/** Submerged LOD rings are halved for the same reason. */
export const SUBMERGED_LOD_SCALE = 0.5;

export function buildFloraKit(
  gltf: GLTF,
  manifest: KitManifest,
  /** True for the underwater-band kit: every species in it is submerged,
   * whatever category the manifest gives it (a sunken wall is still only ever
   * seen through water). */
  underwater = false,
): FloraKit {
  const heights = new Map(manifest.assets.map((a) => [a.id, a.sizeM[2]]));
  const anchors = new Map(
    manifest.assets.map((a) => {
      const originAboveBase = a.originOffsetM?.[2] ?? 0;
      // Bottom-anchor, then sink slightly so sloped ground doesn't reveal a
      // floating flat base. Grounded assets (origin at base) come out ~0.
      const anchor = originAboveBase - Math.min(0.15, 0.05 * a.sizeM[2]);
      const suspect =
        !Number.isFinite(anchor) ||
        Math.abs(originAboveBase) > 2 * Math.max(a.sizeM[0], a.sizeM[1], a.sizeM[2]) + 2;
      return [a.id, { anchor: suspect ? 0 : anchor, suspect }];
    }),
  );
  const trunkRadii = new Map(
    manifest.assets.map((a) => [a.id, a.collisionCapsule?.radiusM ?? null]),
  );
  const categories = new Map(manifest.assets.map((a) => [a.id, a.category ?? null]));
  const alphaTested = new Set(
    manifest.assets.filter((a) => a.alphaTest).map((a) => a.id),
  );
  const kit: FloraKit = new Map();
  // One depth material per source material: meshes share materials across
  // LOD levels, and the shadow pass must alpha-test the same texture.
  const depthMaterials = new Map<THREE.Material, THREE.MeshDepthMaterial>();

  for (const root of gltf.scene.children) {
    const id = assetIdOf(root);
    if (!id || !heights.has(id)) continue;
    const byLevel = new Map<number, KitLevel["parts"]>();
    let billboardLevel: number | null = null;
    let triangles = 0;

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const level = levelOf(mesh);
      const material0 = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (isBillboard(mesh)) {
        // A card whose material lost its texture would draw as a solid
        // untextured rectangle at distance (the owner's "grey slab" defect).
        // Better to skip the card and let that species end on its last
        // decimated mesh level.
        if (!(material0 as THREE.MeshStandardMaterial)?.map) return;
        billboardLevel = level;
        // Lift the card out of its baked-in canopy shade (round-4 lever).
        // Materials are shared across a species' cards, so brighten once.
        const card = material0 as THREE.MeshStandardMaterial;
        // Only AUTHORED cards need it: they bake canopy shade into the paint.
        // A baked card (`cardSource: "baked"`) was rendered under flat white
        // light by the kit builder, so brightening it would blow it out.
        const baked = (mesh.userData ?? {}).cardSource === "baked";
        if (!baked && !card.userData.esBillboardBrightened) {
          card.color.multiplyScalar(BILLBOARD_BRIGHTNESS);
          card.userData.esBillboardBrightened = true;
        }
        // Bent normals (research doc §4.1 cause 3): a flat card's geometric
        // normal faces away from the sun half the time, rendering the card
        // near-black in full daylight. Grass-card practice is to light cards
        // as if they were ground — normals straight up.
        const normal = mesh.geometry.getAttribute("normal");
        if (normal) {
          for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0);
          normal.needsUpdate = true;
        }
      }
      const material = material0;
      // Foliage is alpha-*tested*, never blended: blending sorts wrongly
      // through a canopy and costs the most on exactly the devices that can
      // least afford it (module 65 §111). Billboards are always cutout cards,
      // whatever the base asset's mode.
      const std = material as THREE.MeshStandardMaterial;
      if ((alphaTested.has(id) || isBillboard(mesh)) && std) {
        std.alphaTest = 0.5;
        std.transparent = false;
        std.depthWrite = true;
        std.side = THREE.DoubleSide;
      }
      // Join the shared atmosphere: WorldSky's patchScene applies the aerial
      // inscatter term to any material tagged esAerial (after its CSM patch).
      // Unpatched, plants ignore haze/mist and read as dark cut-outs pasted
      // over the weathered scene.
      material.userData.esAerial = true;
      let depthMaterial: THREE.MeshDepthMaterial | undefined;
      if (std?.alphaTest) {
        depthMaterial = depthMaterials.get(material);
        if (!depthMaterial) {
          depthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: std.map,
            alphaTest: std.alphaTest,
            side: THREE.DoubleSide,
          });
          depthMaterials.set(material, depthMaterial);
        }
      }
      const parts = byLevel.get(level) ?? [];
      parts.push({ geometry: mesh.geometry, material, depthMaterial });
      byLevel.set(level, parts);
      const index = mesh.geometry.getIndex();
      if (level === 0) {
        triangles += (index ? index.count : mesh.geometry.attributes.position.count) / 3;
      }
    });

    if (byLevel.size === 0) continue;
    // An alpha-tested part is never drawn decimated (16f round 5). Every
    // plant in the kit is built from dozens to hundreds of small separate
    // islands of triangles (leaf cards, twig cards, bark strips: median 2–16
    // triangles each) and collapse decimation shreds them into slivers with
    // scrambled UVs — the owner's leaves, branches and trunk strips that
    // vanished at the middle distance. Such a part keeps its base geometry at
    // every mesh level, and the identical-level rule below then folds the
    // chain to "full mesh, then card". Only an opaque part (none in the
    // land kit today) still steps down through the builder's decimation.
    const base = byLevel.get(0);
    if (base) {
      for (const [level, parts] of byLevel) {
        if (level === 0 || level === billboardLevel) continue;
        for (const part of parts) {
          const std = part.material as THREE.MeshStandardMaterial;
          if (!std?.alphaTest) continue;
          const source = base.find((b) => b.material === part.material);
          if (source) part.geometry = source.geometry;
        }
      }
    }
    // A level that is not smaller than the one before it is not a level:
    // the builder's decimation floors at ~300 triangles a part, so a small
    // mesh (every palm: 60–256 triangles a part) ships three identical
    // chains. Drawing them as three rungs stepped the same geometry against
    // itself at two rings for nothing; here they are one level (round 5).
    const levels: KitLevel[] = [];
    const kept: number[] = [];
    const sorted = [...byLevel.keys()].sort((a, b) => a - b);
    for (const level of sorted) {
      const parts = byLevel.get(level)!;
      if (level !== billboardLevel && kept.length > 0) {
        const previous = byLevel.get(kept[kept.length - 1])!;
        if (partTriangles(parts) >= partTriangles(previous)) continue;
      }
      kept.push(level);
      levels.push({ parts, triangles: level === 0 ? triangles : 0 });
    }
    const billboardIndex =
      billboardLevel === null ? null : kept.indexOf(billboardLevel);
    kit.set(id, {
      id,
      levels,
      billboardIndex,
      heightM: heights.get(id) ?? 4,
      trunkRadiusM: trunkRadii.get(id) ?? null,
      category: categories.get(id) ?? null,
      sways: !NON_SWAYING_CATEGORIES.has(categories.get(id) ?? ""),
      submerged: underwater || SUBMERGED_CATEGORIES.has(categories.get(id) ?? ""),
      // Round-4 note: bbox-bottom anchoring (`anchorYM`) is GONE — bundle v2
      // species anchor by PIVOT with a baked sink (mined convention; the bbox
      // bottom is often a hanging frond tip and lifted trunks into the air).
      suspect: anchors.get(id)?.suspect ?? false,
    });
  }
  return kit;
}

/**
 * LOD distances, scaled by how big the thing is: a 60 m landmark tree has to
 * keep its silhouette much further out than a knee-high fern, and one fixed
 * ring would either pop the tree or waste triangles on the fern. Beyond
 * ring 1 a species runs on its `_lod_flat` billboard where the kit carries
 * one (T4, module 65 §110), or its last decimated mesh where it does not.
 */
export function lodDistances(heightM: number): number[] {
  // Measured 2026-09-16 at the jungle site: the old rings (full mesh to
  // height × 6, capped 150 m) drew 3.1 M triangles in character view and
  // 4.7 M from the air — ~2,800 full canopy meshes at 5–12 k triangles
  // each. Shipped open worlds hold full geometry to a few tens of metres and
  // hand over to decimated levels and cards well inside 300 m. Ring 0 (full
  // mesh) ends at height × 2.5 inside 24–60 m; ring 1 (the 0.35 decimation)
  // at height × 5 inside 50–140 m; ring 2 (the 0.12 decimation) at height ×
  // 8 inside 100–260 m; beyond it a billboard species runs on its flat card,
  // the rest on the deep level to their draw distance.
  const ring0 = Math.min(60, Math.max(MIN_MESH_LOD_REACH_M, heightM * 2.5));
  const ring1 = Math.min(140, Math.max(50, heightM * 5));
  const ring2 = Math.min(260, Math.max(100, heightM * 8));
  return [ring0, Math.max(ring1, ring0 + 10), Math.max(ring2, ring1 + 20)];
}

/**
 * Floor on the full-mesh ring. Height × 6 gives a 2 m shrub only 12 m of full
 * mesh and 33 m before it becomes a flat card — which is why the uplands
 * screenshot (owner round 4, 1.59 km E / 1.63 km S) showed dark leaf-shaped
 * cutouts a few strides away. Small plants are cheap; hold their real geometry
 * out to a distance where the player cannot read the difference.
 */
export const MIN_MESH_LOD_REACH_M = 24;

/**
 * Billboard cards bake shadowed-canopy lighting into their atlas texture, so
 * in bright open air they read darker than the meshes they replace (owner
 * round 4: "distant trees read near-black"). Scale the card material's colour
 * to compensate. One constant on purpose — the next tune is a one-line change,
 * and the owner judges the value on the deployed build.
 */
export const BILLBOARD_BRIGHTNESS = 1.25;

/**
 * Per-species draw distance (T-tier cull): beyond this an instance is not
 * drawn at all. Scaled by height so a 1 m fern leaves the scene ~80–100 m out
 * while a 30 m cypress persists past the chunk ring edge (~1,170 m). This is
 * what makes dense understory affordable — most instances are small plants
 * that must not cost draws at two kilometres.
 */
export function maxDrawDistance(heightM: number): number {
  // Small plants leave at 60–80 m; a 20 m tree persists to 700 m; nothing
  // is drawn past 900 m (the chunk ring is ~1.2 km, but a card at that
  // distance is a few pixels).
  return Math.min(900, Math.max(60, heightM * 35));
}

/**
 * A TREE never vanishes inside the loaded chunk ring (owner, 16f round 4:
 * "when not occluded and within visibility distance they should draw, in low
 * quality, at a high distance — looking out from the mountains"). Its draw
 * distance is the ring's own reach — the far corner of the outermost loaded
 * chunk — so the only limit is the chunk ring itself, and the fade-out band
 * sits beyond anything that is loaded. Beyond ring 2 a tree is its baked
 * card (two quads), so the price of the last kilometre is card instances,
 * never mesh: at the jungle site (1.11 km E / 5.21 km S) 13.3 k trees stood
 * inside the old 900 m cap and 17.8 k inside 1.1 km, 26.6 k in the whole
 * 5×5 ring. Terrain occlusion still culls what a ridge hides.
 */
export function treeDrawDistance(chunkRing: number, chunkMetres: number): number {
  return (chunkRing + 1) * chunkMetres * Math.SQRT2;
}

/**
 * The ring ladder a species runs at a quality scale, submerged or not — the
 * one place `Vegetation.tsx` gets its rings. Ring 0 (full mesh) is never
 * scaled down, or plants beside the camera would regress to cards (the
 * round-2 defect); the outer rings scale, and are then pushed apart so every
 * level keeps a band at least `2 × LOD_BAND_M` wide. Without that the low
 * preset (`vegDrawScale` 0.55) left a 20–28 m tree a level-1 band only
 * 5–6 m wide (submerged: 2.5 m) — narrower than the crossfade itself, so
 * that level never finished fading in before it started fading out.
 */
export function lodRings(heightM: number, drawScale: number, submerged: boolean): number[] {
  const rings = lodDistances(heightM)
    .map((r, i) => (i === 0 ? r : r * drawScale))
    .map((r) => (submerged ? r * SUBMERGED_LOD_SCALE : r));
  for (let i = 1; i < rings.length; i++) {
    rings[i] = Math.max(rings[i], rings[i - 1] + 2 * LOD_BAND_M);
  }
  return rings;
}

/**
 * Merges two built kits into one index. The renderer draws species from both
 * the land kit (`flora-province-v1`) and the 16f underwater band kit
 * (`underwater-v1`), and a handful of ids ship in BOTH (tbp_seaweed06,
 * waterkelptall02/03). FIRST WINS: the land kit is passed first because the
 * palettes were authored against its copy of those shared assets.
 */
export function mergeFloraKits(first: FloraKit, second: FloraKit): FloraKit {
  const merged: FloraKit = new Map(first);
  for (const [id, species] of second) {
    if (!merged.has(id)) merged.set(id, species);
  }
  return merged;
}
