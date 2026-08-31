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
  collisionCapsule?: { radiusM: number; heightM: number; centreOffsetM: [number, number] };
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

export function buildFloraKit(gltf: GLTF, manifest: KitManifest): FloraKit {
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
    const levels: KitLevel[] = [];
    const sorted = [...byLevel.keys()].sort((a, b) => a - b);
    for (const level of sorted) {
      levels.push({ parts: byLevel.get(level)!, triangles: level === 0 ? triangles : 0 });
    }
    const billboardIndex =
      billboardLevel === null ? null : sorted.indexOf(billboardLevel);
    kit.set(id, {
      id,
      levels,
      billboardIndex,
      heightM: heights.get(id) ?? 4,
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
  const reach = Math.max(12, heightM * 6);
  return [reach, reach * 2.6];
}

/**
 * Per-species draw distance (T-tier cull): beyond this an instance is not
 * drawn at all. Scaled by height so a 1 m fern leaves the scene ~80–100 m out
 * while a 30 m cypress persists past the chunk ring edge (~1,170 m). This is
 * what makes dense understory affordable — most instances are small plants
 * that must not cost draws at two kilometres.
 */
export function maxDrawDistance(heightM: number): number {
  return Math.max(80, heightM * 35);
}
