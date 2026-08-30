/**
 * Vegetation renderer: the compiler's chunk bundles drawn as instanced meshes,
 * LOD chosen per instance by distance (module 65 §110 tiers T1/T2).
 *
 * Everything here is deliberately plain `InstancedMesh` rather than a library:
 * it is what any instancing wrapper is built on, it adds no dependency to
 * pin, and it is the honest baseline the budget probe should measure before
 * anything fancier is justified. The upgrade path (`@three.ez/instanced-mesh`
 * for BVH culling, octahedral impostors for T4) is module 65's, and should be
 * taken on evidence from that measurement rather than in advance.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import {
  buildFloraKit,
  lodDistances,
  maxDrawDistance,
  type FloraKit,
  type KitManifest,
} from "./floraKit";
import type { QualitySettings } from "@elder-souls/game-core/core/quality";
import { sharedChunkStore, type ChunksManifest } from "../character/chunkStore";
import { groundHeightM } from "./terrainHeight";
import {
  decodeVegetationBundle,
  readInstance,
  type VegetationBundle,
  type VegetationIndex,
} from "./vegetationBundle";

/** Chunks drawn around the focus. Beyond this a chunk is simply not built. */
const CHUNK_RING = 2;

/** Hard cap per (species, level) draw so a pathological chunk cannot stall. */
const MAX_PER_DRAW = 6000;

interface ChunkVegetation {
  key: string;
  originX: number;
  originZ: number;
  bundle: VegetationBundle;
}

interface DrawGroup {
  mesh: THREE.InstancedMesh;
  species: string;
  level: number;
}

export interface VegetationStats {
  chunks: number;
  instances: number;
  draws: number;
  triangles: number;
  /** Instances skipped by the per-species draw-distance cull. */
  culled: number;
  /** Instances drawn as their `_lod_flat` far billboard (T4). */
  billboardInstances: number;
}

function chunkKey(cx: number, cz: number): string {
  return `${cx}_${cz}`;
}

export function Vegetation({
  focusRef,
  baseUrl,
  verticalScale = 1,
  onStats,
  quality,
}: {
  /** Same shape the chunk terrain uses: ground position, not a camera. */
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  baseUrl: string;
  verticalScale?: number;
  onStats?: (stats: VegetationStats) => void;
  quality?: QualitySettings;
}) {
  const chunkRing = quality?.vegChunkRing ?? CHUNK_RING;
  const drawScale = quality?.vegDrawScale ?? 1;
  const root = useRef<THREE.Group>(null);
  // Streamed terrain, for re-grounding baked instance heights: the compiler
  // bakes Y from its own raster, which can sit a metre off the rendered mesh
  // on banks/slopes — enough to float a root arch (owner round 3).
  const store = sharedChunkStore(baseUrl);
  const [chunksManifest, setChunksManifest] = useState<ChunksManifest | null>(null);
  const [index, setIndex] = useState<VegetationIndex | null>(null);
  const [manifest, setManifest] = useState<KitManifest | null>(null);
  const loaded = useRef(new Map<string, ChunkVegetation>());
  const pending = useRef(new Set<string>());
  const groups = useRef<DrawGroup[]>([]);

  const gltf = useLoader(GLTFLoader, `${baseUrl}kits/flora-province-v1.glb`);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${baseUrl}province/vegetation/vegetation-index.json`).then((r) => r.json()),
      fetch(`${baseUrl}kits/flora-province-v1.kit.json`).then((r) => r.json()),
    ])
      .then(([i, m]) => {
        if (!cancelled) {
          setIndex(i as VegetationIndex);
          setManifest(m as KitManifest);
        }
      })
      .catch(() => undefined);
    store.manifest()
      .then((m) => { if (!cancelled) setChunksManifest(m); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  const kit: FloraKit | null = useMemo(
    () => (manifest ? buildFloraKit(gltf, manifest) : null),
    [gltf, manifest],
  );

  // Rebuild the instanced meshes whenever the set of loaded chunks changes —
  // or the focus has walked far enough that per-instance LOD choices are
  // stale. Without the movement trigger, LOD was frozen at whatever distance
  // held when the chunk arrived, so walking up to a far billboard never
  // upgraded it to the real model (owner round-2 "cardboard cutout" defect).
  const [revision, setRevision] = useState(0);
  const lastBuildFocus = useRef<{ x: number; z: number } | null>(null);
  const REBUILD_MOVE_M = 48;

  useFrame(() => {
    if (!index || !root.current) return;
    const focus = focusRef.current;
    const size = index.chunkMetres;
    const last = lastBuildFocus.current;
    if (last && Math.hypot(focus.x - last.x, focus.z - last.z) > REBUILD_MOVE_M) {
      setRevision((r) => r + 1);
    }
    const cx = Math.floor(focus.x / size);
    const cz = Math.floor(focus.z / size);

    for (let dz = -chunkRing; dz <= chunkRing; dz++) {
      for (let dx = -chunkRing; dx <= chunkRing; dx++) {
        const key = chunkKey(cx + dx, cz + dz);
        if (!index.chunks[key] || loaded.current.has(key) || pending.current.has(key)) {
          continue;
        }
        pending.current.add(key);
        fetch(`${baseUrl}province/vegetation/chunk_${key}_vegetation.bin`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing"))))
          .then((buffer) => {
            loaded.current.set(key, {
              key,
              originX: (cx + dx) * size,
              originZ: (cz + dz) * size,
              bundle: decodeVegetationBundle(buffer),
            });
            setRevision((r) => r + 1);
          })
          .catch(() => undefined)
          .finally(() => pending.current.delete(key));
      }
    }
  });

  useEffect(() => {
    const group = root.current;
    if (!group || !kit || !index) return;

    for (const drawn of groups.current) {
      group.remove(drawn.mesh);
      drawn.mesh.dispose();
    }
    groups.current = [];

    // One instanced mesh per (species, LOD level, geometry part) across ALL
    // loaded chunks, not per chunk: per-chunk meshes cost a draw call each and
    // measured 449 draws for 13 chunks, which is the wrong end of the budget
    // to be spending on bookkeeping.
    const focus = focusRef.current;
    lastBuildFocus.current = { x: focus.x, z: focus.z };
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    // Pass one: bucket every instance by the draw it belongs to.
    interface Bucket {
      species: string;
      level: number;
      transforms: THREE.Matrix4[];
    }
    const buckets = new Map<string, Bucket>();
    // A chunk instance can sit anywhere in its 468 m square, so chunk-level
    // culls must allow for the worst case: focus at one corner, instance at
    // the opposite one.
    const halfDiagonal = index.chunkMetres * Math.SQRT1_2;
    let culled = 0;
    let billboardInstances = 0;
    for (const chunk of loaded.current.values()) {
      const centreX = chunk.originX + index.chunkMetres / 2;
      const centreZ = chunk.originZ + index.chunkMetres / 2;
      const chunkDistance = Math.hypot(focus.x - centreX, focus.z - centreZ);

      for (const speciesGroup of chunk.bundle.species) {
        if (speciesGroup.count === 0) continue;
        const id = index.speciesOrder?.[speciesGroup.index];
        const entry = id ? kit.get(id) : undefined;
        if (!entry) continue;
        if (entry.suspect) {
          // Broken bounds (geometry far from the pivot): drawing it puts the
          // mesh underground or in the sky either way. A sourcing job.
          culled += speciesGroup.count;
          continue;
        }

        // Per-species draw-distance cull (T tiers): understory vanishes a
        // hundred metres out, canopy persists to the ring edge. This is what
        // keeps the coming density increase affordable — most instances are
        // small plants that must not render at two kilometres.
        const maxDraw = maxDrawDistance(entry.heightM) * drawScale;
        if (chunkDistance - halfDiagonal > maxDraw) {
          culled += speciesGroup.count;
          continue;
        }

        // Quality scales the rings too, so lower tiers shift work toward the
        // cheap levels — but never below the near ring, or plants beside the
        // camera would regress to cards (the round-2 defect).
        const rings = lodDistances(entry.heightM).map((r, i) => (i === 0 ? r : r * drawScale));
        const count = Math.min(speciesGroup.count, MAX_PER_DRAW);
        for (let i = 0; i < count; i++) {
          const inst = readInstance(speciesGroup, i);
          const instDistance = Math.hypot(inst.x - focus.x, inst.z - focus.z);
          if (instDistance > maxDraw) {
            culled++;
            continue;
          }
          // LOD per INSTANCE, not per chunk: chunk-centre distance put whole
          // 468 m squares — including the plants beside the camera — on their
          // far `_lod_flat` cards (owner round-2 "cardboard cutout" defect).
          // Beyond ring 1 a billboard species runs entirely on its flat cards
          // (T4 far tier); species without one keep the decimated chain.
          const near = instDistance < rings[0] ? 0 : instDistance < rings[1] ? 1 : 2;
          const asBillboard = entry.billboardIndex !== null && near === 2;
          const level = asBillboard
            ? entry.billboardIndex!
            : Math.min(entry.levels.length - 1, near);
          const key = `${id}|${level}`;
          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = { species: id!, level, transforms: [] };
            buckets.set(key, bucket);
          }
          // Ground Y from the live terrain when a chunk is decoded (baked Y
          // is the compile raster's, which can disagree with the mesh);
          // anchorYM then sits the model's bbox bottom on the ground (see
          // floraKit) — not every asset pivots at its base. Model-space
          // metres × instance scale — never × verticalScale, which
          // exaggerates terrain only.
          const ground = chunksManifest
            ? groundHeightM(store, chunksManifest, inst.x, inst.z)
            : null;
          position.set(
            inst.x,
            (ground ?? inst.y) * verticalScale + entry.anchorYM * inst.scale,
            inst.z,
          );
          euler.set(inst.tiltX, inst.yaw, inst.tiltZ, "YXZ");
          quaternion.setFromEuler(euler);
          scale.setScalar(inst.scale);
          bucket.transforms.push(matrix.compose(position, quaternion, scale).clone());
          if (asBillboard) billboardInstances++;
        }
      }
    }

    // Pass two: one InstancedMesh per bucket per geometry part.
    let instances = 0;
    let triangles = 0;
    for (const bucket of buckets.values()) {
      const entry = kit.get(bucket.species)!;
      const parts = entry.levels[bucket.level]?.parts ?? entry.levels[0].parts;
      instances += bucket.transforms.length;
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(
          part.geometry, part.material, bucket.transforms.length);
        mesh.frustumCulled = true;
        // Levels 0–1 cast: they cover the CSM reach (character maxFar 300 m,
        // and level 1 runs to ~2.6× the species' near ring). Level 2 is
        // beyond useful shadow range and would only bloat the cascade passes.
        mesh.castShadow = bucket.level <= 1;
        mesh.receiveShadow = true;
        if (part.depthMaterial) mesh.customDepthMaterial = part.depthMaterial;
        for (let i = 0; i < bucket.transforms.length; i++) {
          mesh.setMatrixAt(i, bucket.transforms[i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
        groups.current.push({ mesh, species: bucket.species, level: bucket.level });
        const geometryIndex = part.geometry.getIndex();
        triangles +=
          ((geometryIndex ? geometryIndex.count : part.geometry.attributes.position.count) / 3)
          * bucket.transforms.length;
      }
    }

    const stats: VegetationStats = {
      chunks: loaded.current.size,
      instances,
      draws: groups.current.length,
      triangles: Math.round(triangles),
      culled,
      billboardInstances,
    };
    onStats?.(stats);
    // Same convention as the sky and water debug hooks: probes read the
    // numbers rather than guessing them from a screenshot.
    (window as unknown as { __STUDIO_VEGETATION_DEBUG__?: VegetationStats })
      .__STUDIO_VEGETATION_DEBUG__ = stats;
  }, [kit, index, revision, verticalScale, onStats, focusRef, drawScale, chunksManifest, store]);

  return <group ref={root} name="vegetation" />;
}
