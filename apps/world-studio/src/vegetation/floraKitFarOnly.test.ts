/**
 * A FAR-ONLY tier chain on the real published kit (vegetation round 13b):
 * `vanilla:landscape/plants/tundrashrub03` ships `lodTiers.far` (level 2) and
 * no `mid`, so its kit levels are 0 (base), 1 (the builder's decimation of an
 * alpha-tested part, swapped back to base and folded away), 2 (the far tier,
 * own material) and 3 (the baked card). `buildFloraKit` must turn that into
 * base -> far -> card with no empty rung, and the ladder the renderer builds
 * from it (as `Vegetation.tsx` does) must pass the band-coverage invariant.
 *
 * The published GLB is meshopt-packed, so the scene is rebuilt from its JSON
 * chunk only: node tree, extras (read by three.js as `userData`), material
 * identity per glTF material index (GLTFLoader shares one instance per index)
 * and index counts. Geometry contents are not needed: `buildFloraKit` reads
 * structure and triangle counts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { lodLadder } from "@elder-souls/game-core/fx/lodFade";
import { QUALITY_PRESETS } from "@elder-souls/game-core/core/quality";
import {
  buildFloraKit,
  ladderCoverageFailures,
  maxDrawDistance,
  speciesRings,
  SUBMERGED_MAX_DRAW_M,
  treeDrawDistance,
  type KitManifest,
  type KitSpecies,
} from "./floraKit";

const KITS = join(__dirname, "../../public/kits");
const ID = "vanilla:landscape/plants/tundrashrub03";
const CHUNK_M = 467.93;

interface GltfJson {
  nodes: { name?: string; mesh?: number; children?: number[]; extras?: Record<string, unknown> }[];
  meshes: { primitives: { material?: number; indices?: number; attributes: { POSITION: number } }[] }[];
  accessors: { count: number }[];
  materials: { name?: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }[];
}

function readGlbJson(path: string): GltfJson {
  const buf = readFileSync(path);
  const length = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + length).toString("utf8")) as GltfJson;
}

/** The asset's root node as GLTFLoader would give it, geometry as counts only. */
function sceneFor(json: GltfJson, assetId: string): GLTF {
  const rootIndex = json.nodes.findIndex(
    (n) => n.extras?.assetId === assetId && (n.children?.length ?? 0) > 0 && n.mesh === undefined,
  );
  if (rootIndex < 0) throw new Error(`no root node for ${assetId} in the published GLB`);
  const materials = new Map<number, THREE.MeshStandardMaterial>();
  const materialOf = (i: number) => {
    let m = materials.get(i);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ name: json.materials[i].name });
      if (json.materials[i].pbrMetallicRoughness?.baseColorTexture) m.map = new THREE.Texture();
      materials.set(i, m);
    }
    return m;
  };
  const build = (i: number): THREE.Object3D => {
    const node = json.nodes[i];
    const object = new THREE.Object3D();
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        const geometry = new THREE.BufferGeometry();
        const vertices = json.accessors[prim.attributes.POSITION].count;
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
        if (prim.indices !== undefined) {
          geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(json.accessors[prim.indices].count), 1));
        }
        const mesh = new THREE.Mesh(geometry, materialOf(prim.material ?? 0));
        mesh.userData = { ...(node.extras ?? {}) };
        object.add(mesh);
      }
    }
    object.name = node.name ?? "";
    object.userData = { ...(node.extras ?? {}) };
    for (const c of node.children ?? []) object.add(build(c));
    return object;
  };
  const scene = new THREE.Group();
  scene.add(build(rootIndex));
  return { scene } as unknown as GLTF;
}

function levelTriangles(level: KitSpecies["levels"][number]): number {
  let t = 0;
  for (const p of level.parts) t += (p.geometry.getIndex()?.count ?? 0) / 3;
  return t;
}

function loadSpecies(): { species: KitSpecies; tiers: Record<string, { level: number; triangles: number }> } {
  type Tiers = Record<string, { level: number; triangles: number }>;
  const manifest = JSON.parse(readFileSync(join(KITS, "flora-province-v1.kit.json"), "utf8")) as KitManifest;
  const asset = manifest.assets.find((a) => a.id === ID) as
    (KitManifest["assets"][number] & { lodTiers?: Tiers }) | undefined;
  if (!asset?.lodTiers) throw new Error(`${ID} has no lodTiers in the published manifest`);
  const json = readGlbJson(join(KITS, "flora-province-v1.glb"));
  const kit = buildFloraKit(sceneFor(json, ID), { ...manifest, assets: [asset] });
  const species = kit.get(ID);
  if (!species) throw new Error(`buildFloraKit dropped ${ID}`);
  return { species, tiers: asset.lodTiers };
}

describe("far-only tier chain (tundrashrub03, published kit)", () => {
  const { species, tiers } = loadSpecies();

  it("is far-only in the manifest", () => {
    expect(tiers.far).toBeDefined();
    expect(tiers.mid).toBeUndefined();
  });

  it("builds base -> far -> card with no empty rung", () => {
    expect(species.levels).toHaveLength(3);
    expect(species.billboardIndex).toBe(2);
    expect(species.folded).toBe(false);
    for (const level of species.levels) expect(level.parts.length).toBeGreaterThan(0);
    const [base, far, card] = species.levels.map(levelTriangles);
    expect(far).toBe(tiers.far.triangles);
    expect(far).toBeLessThan(base);
    expect(card).toBeLessThan(far);
    // The far rung keeps its own tier geometry, not the base swapped in.
    expect(species.levels[1].parts[0].geometry).not.toBe(species.levels[0].parts[0].geometry);
  });

  it("passes the band-coverage invariant at every quality preset", () => {
    const failures: string[] = [];
    for (const preset of Object.values(QUALITY_PRESETS)) {
      // As Vegetation.tsx builds a species' ladder.
      const maxDraw = species.submerged
        ? Math.min(maxDrawDistance(species.heightM) * preset.vegDrawScale, SUBMERGED_MAX_DRAW_M)
        : species.category === "tree"
          ? treeDrawDistance(preset.vegChunkRing, CHUNK_M)
          : maxDrawDistance(species.heightM) * preset.vegDrawScale;
      const meshLevels = species.billboardIndex ?? species.levels.length;
      expect(meshLevels).toBe(2);
      const rings = speciesRings({
        heightM: species.heightM, meshLevels, category: species.category,
        submerged: species.submerged, folded: species.folded,
      }, preset.vegDrawScale, preset.name);
      const ladder = lodLadder(rings, meshLevels, species.billboardIndex, maxDraw);
      // The drawn rungs step down the kit's levels in order from the base.
      // (Today the 1.21 m shrub's draw distance, max(60, 35 h) x drawScale,
      // ends inside its small-plant full-mesh radius in every preset, so only
      // the base is drawn: that is ring policy in `speciesRings`, not the kit.)
      const shown = ladder.filter((r) => r.hi > r.lo).map((r) => r.level);
      expect(shown[0]).toBe(0);
      expect(shown).toEqual([0, 1, 2].slice(0, shown.length));
      failures.push(...ladderCoverageFailures(
        ladder, species.submerged || species.category !== "tree", maxDraw, preset.name));
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });
});
