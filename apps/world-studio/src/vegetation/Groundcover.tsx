/**
 * T3 groundcover ring (module 65 §110): grass/fern/reed regenerated at
 * runtime around the focus from the land-cover raster and the authored
 * bindings in `world/sources/flora/groundcover.json` — never baked into the
 * chunk bundles. This layer carries most of the "dense jungle" read: the
 * reference mod's jungle feel is mostly dense groundcover over modest trees.
 *
 * Placement is deterministic (tile + species + index hashed, the same idea as
 * `worldgen.scatter.hash64`), so walking away and back yields the same
 * plants. One InstancedMesh per species part across the WHOLE ring, rebuilt
 * when the focus crosses a 16 m tile boundary — per-tile meshes would be a
 * draw call per tile (the trap Vegetation.tsx already sprang per chunk).
 */

import { useEffect, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { buildFloraKit, type FloraKit, type KitManifest } from "./floraKit";
import { sharedChunkStore, type ChunksManifest, type ChunkStore } from "../character/chunkStore";
import { sharedWaterAssets } from "../water/waterAssets";
import type { WaterData } from "@elder-souls/game-core/water/index";
import groundcoverTable from "../../../../world/sources/flora/groundcover.json";

/** Ring tiling. Tiles are world-aligned so placement is position-independent. */
const TILE_M = 16;
const RING_RADIUS_M = 75;
/** Instances scale to zero over the outer band so the ring edge never pops. */
const FADE_FRACTION = 0.2;
/** Hard budget. The authored densities want ~30k in jungle; if a rebuild asks
 * for more than this, every species is thinned proportionally. */
const MAX_INSTANCES = 60_000;
/** Standing water gates: `below-at-least` species need shallow water; land
 * grass should not render drowned under a metre of marsh. */
const WATER_SPECIES_MAX_DEPTH_M = 1.5;
const LAND_SPECIES_MAX_DEPTH_M = 0.5;

interface SpeciesRule {
  asset: string;
  density: number; // instances per hectare
  slopeDegMax: number;
  heightVariance: number;
  positionJitterM: number;
  waterRule?: string;
}

interface SpeciesPlan {
  id: string;
  index: number;
  /** Highest authored density across covers — the candidate rate; each
   * candidate then survives at (local density / max), so cover boundaries
   * stay crisp at per-instance resolution. */
  maxDensity: number;
  byCover: Map<number, SpeciesRule>;
  needsWater: boolean;
}

/** groundcover.json: land-cover id (ground-control red channel) → species.
 * Absent ids are the bare list — bare ground stays bare (decision 0036 Q5). */
const TABLE = (groundcoverTable as unknown as {
  byLandCover: Record<string, { species: SpeciesRule[] }>;
}).byLandCover;

function buildPlans(): SpeciesPlan[] {
  const plans = new Map<string, SpeciesPlan>();
  for (const [coverId, { species }] of Object.entries(TABLE)) {
    for (const rule of species) {
      let plan = plans.get(rule.asset);
      if (!plan) {
        plan = {
          id: rule.asset,
          index: plans.size,
          maxDensity: 0,
          byCover: new Map(),
          needsWater: false,
        };
        plans.set(rule.asset, plan);
      }
      plan.byCover.set(Number(coverId), rule);
      plan.maxDensity = Math.max(plan.maxDensity, rule.density);
      if (rule.waterRule === "below-at-least") plan.needsWater = true;
    }
  }
  return [...plans.values()];
}

const SPECIES_PLANS = buildPlans();

/** Deterministic 32-bit mix; `salt` separates the random streams one
 * candidate draws (keep / jitter x / jitter z / accept / yaw / height). */
function hash32(a: number, b: number, c: number, d: number): number {
  let h = 0x9e3779b9 ^ Math.imul(a | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) ^ Math.imul(b | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) ^ Math.imul(d | 0, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function u01(h: number): number {
  return h / 4294967296;
}

// --- land-cover raster -------------------------------------------------------

interface ControlRaster {
  ids: Uint8Array; // red channel = land-cover material id
  size: number;
  metresPerTexel: number;
}

let controlPromise: Promise<ControlRaster> | null = null;
let controlBase: string | null = null;

/** Loaded ONCE per session and sampled CPU-side; both scenes share it. */
function sharedControlRaster(baseUrl: string): Promise<ControlRaster> {
  if (!controlPromise || controlBase !== baseUrl) {
    controlBase = baseUrl;
    controlPromise = (async () => {
      const meta = await (await fetch(`${baseUrl}province/refined/meta.json`)).json();
      const res = await fetch(`${baseUrl}province/refined/ground-control.png`);
      const bitmap = await createImageBitmap(await res.blob(), {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      bitmap.close();
      const ids = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0; i < ids.length; i++) ids[i] = px[i * 4];
      return {
        ids,
        size: canvas.width,
        metresPerTexel: meta.metresPerPixel as number,
      };
    })();
  }
  return controlPromise;
}

function coverAt(control: ControlRaster, x: number, z: number): number {
  const tx = Math.max(0, Math.min(control.size - 1, Math.floor(x / control.metresPerTexel)));
  const tz = Math.max(0, Math.min(control.size - 1, Math.floor(z / control.metresPerTexel)));
  return control.ids[tz * control.size + tx];
}

// --- terrain height ----------------------------------------------------------

/** True-metre ground height from the SAME streamed chunks the terrain draws
 * (no new raster fetch): best decoded LOD, bilinear — mirrors
 * `ChunkWorld.groundHeight`, which only reads LOD 1 and so goes blind in the
 * flyover's mid ring. */
function groundHeightM(
  store: ChunkStore,
  manifest: ChunksManifest,
  x: number,
  z: number,
): number | null {
  const cx = Math.max(0, Math.min(manifest.grid[0] - 1, Math.floor(x / manifest.chunkMetres)));
  const cy = Math.max(0, Math.min(manifest.grid[1] - 1, Math.floor(z / manifest.chunkMetres)));
  const grid = store.loaded(cx, cy, "1") ?? store.loaded(cx, cy, "2") ?? store.loaded(cx, cy, "4");
  if (!grid) return null;
  const lx = (x - grid.meta.originM[0]) / grid.metresPerSample;
  const lz = (z - grid.meta.originM[1]) / grid.metresPerSample;
  const x0 = Math.max(0, Math.min(grid.nx - 2, Math.floor(lx)));
  const z0 = Math.max(0, Math.min(grid.ny - 2, Math.floor(lz)));
  const fx = Math.max(0, Math.min(1, lx - x0));
  const fz = Math.max(0, Math.min(1, lz - z0));
  const h = grid.heights;
  const h00 = h[z0 * grid.nx + x0];
  const h10 = h[z0 * grid.nx + x0 + 1];
  const h01 = h[(z0 + 1) * grid.nx + x0];
  const h11 = h[(z0 + 1) * grid.nx + x0 + 1];
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

// --- component ---------------------------------------------------------------

export interface GroundcoverStats {
  instances: number;
  draws: number;
  triangles: number;
  tiles: number;
  /** 1 unless the authored densities exceeded MAX_INSTANCES; then the
   * proportional thinning factor actually applied. */
  densityScale: number;
}

export function Groundcover({
  focusRef,
  baseUrl,
  verticalScale = 1,
  onStats,
}: {
  /** Same shape the chunk terrain uses: ground position, not a camera. */
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  baseUrl: string;
  verticalScale?: number;
  onStats?: (stats: GroundcoverStats) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const [manifest, setManifest] = useState<KitManifest | null>(null);
  const [kit, setKit] = useState<FloraKit | null>(null);
  const [control, setControl] = useState<ControlRaster | null>(null);
  const [chunks, setChunks] = useState<ChunksManifest | null>(null);
  const water = useRef<WaterData | null>(null);
  const store = sharedChunkStore(baseUrl);
  const meshes = useRef<THREE.InstancedMesh[]>([]);
  const requested = useRef(new Set<string>());
  const focusTile = useRef<[number, number]>([Number.NaN, Number.NaN]);
  const [revision, setRevision] = useState(0);

  const gltf = useLoader(GLTFLoader, `${baseUrl}kits/groundcover-province-v1.glb`);

  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}kits/groundcover-province-v1.kit.json`)
      .then((r) => r.json())
      .then((m) => { if (!cancelled) setManifest(m as KitManifest); })
      .catch(() => undefined);
    sharedControlRaster(baseUrl)
      .then((c) => { if (!cancelled) setControl(c); })
      .catch(() => undefined);
    store.manifest()
      .then((m) => { if (!cancelled) setChunks(m); })
      .catch(() => undefined);
    // Same shared load StudioWater performs — the depth proxy gates the reed
    // species to shallow standing water. Optional: without it they place
    // everywhere their cover allows.
    sharedWaterAssets(baseUrl)
      .then((a) => {
        if (!cancelled && !water.current) {
          water.current = a.data;
          setRevision((r) => r + 1);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  useEffect(() => {
    if (manifest) setKit(buildFloraKit(gltf, manifest));
  }, [gltf, manifest]);

  useFrame(() => {
    const focus = focusRef.current;
    // Ensure the chunks under the ring are decoding at LOD 1 (the store
    // dedups with the terrain's own requests); a decode arrival rebuilds.
    if (chunks) {
      for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
        const cx = Math.max(0, Math.min(chunks.grid[0] - 1,
          Math.floor((focus.x + dx * RING_RADIUS_M) / chunks.chunkMetres)));
        const cy = Math.max(0, Math.min(chunks.grid[1] - 1,
          Math.floor((focus.z + dz * RING_RADIUS_M) / chunks.chunkMetres)));
        const key = `${cx},${cy}`;
        if (requested.current.has(key)) continue;
        requested.current.add(key);
        store.load(cx, cy, "1")
          .then(() => setRevision((r) => r + 1))
          .catch(() => requested.current.delete(key));
      }
    }
    const tx = Math.floor(focus.x / TILE_M);
    const tz = Math.floor(focus.z / TILE_M);
    if (tx !== focusTile.current[0] || tz !== focusTile.current[1]) {
      focusTile.current = [tx, tz];
      setRevision((r) => r + 1);
    }
  });

  useEffect(() => {
    const group = root.current;
    if (!group || !kit || !control || !chunks) return;

    for (const mesh of meshes.current) {
      group.remove(mesh);
      mesh.dispose();
    }
    meshes.current = [];

    const focus = focusRef.current;
    const waterData = water.current;
    const tileHa = (TILE_M * TILE_M) / 10_000;
    const fadeStartM = RING_RADIUS_M * (1 - FADE_FRACTION);
    const tileReach = Math.ceil(RING_RADIUS_M / TILE_M);
    const [ftx, ftz] = focusTile.current;

    // Pass one: generate every surviving instance. Each entry keeps a
    // decimation rand so the budget cut (pass two) stays deterministic.
    interface Placed {
      x: number; y: number; z: number; yaw: number; scale: number; keep: number;
    }
    const placed: Placed[][] = SPECIES_PLANS.map(() => []);
    let tiles = 0;
    for (let tz = ftz - tileReach; tz <= ftz + tileReach; tz++) {
      for (let tx = ftx - tileReach; tx <= ftx + tileReach; tx++) {
        const centreX = (tx + 0.5) * TILE_M;
        const centreZ = (tz + 0.5) * TILE_M;
        // Tile culled on its nearest point, so edge tiles still contribute.
        const nearest = Math.hypot(
          Math.max(0, Math.abs(focus.x - centreX) - TILE_M / 2),
          Math.max(0, Math.abs(focus.z - centreZ) - TILE_M / 2),
        );
        if (nearest > RING_RADIUS_M) continue;
        tiles++;

        for (const plan of SPECIES_PLANS) {
          // Candidates on a jittered grid at the species' peak density —
          // Bethesda's GRAS placement model, jitter amplitude as authored.
          const candidates = plan.maxDensity * tileHa;
          const g = Math.max(1, Math.ceil(Math.sqrt(candidates)));
          const cell = TILE_M / g;
          const keepP = candidates / (g * g);
          // Position must exist before the cover under it can be sampled, so
          // the jitter amplitude is the plan's first rule's (they differ by
          // ≤0.15 m across covers — well under a texel).
          const jitterM = (plan.byCover.values().next().value as SpeciesRule).positionJitterM;
          for (let k = 0; k < g * g; k++) {
            if (u01(hash32(tx, tz, plan.index, k * 8)) >= keepP) continue;
            const jx = (u01(hash32(tx, tz, plan.index, k * 8 + 1)) - 0.5) * 2;
            const jz = (u01(hash32(tx, tz, plan.index, k * 8 + 2)) - 0.5) * 2;
            const x = tx * TILE_M + ((k % g) + 0.5) * cell + jx * jitterM;
            const z = tz * TILE_M + (Math.floor(k / g) + 0.5) * cell + jz * jitterM;

            const rule = plan.byCover.get(coverAt(control, x, z));
            if (!rule) continue; // bare cover, or bound to other species
            if (u01(hash32(tx, tz, plan.index, k * 8 + 3)) >= rule.density / plan.maxDensity) continue;

            const distance = Math.hypot(focus.x - x, focus.z - z);
            if (distance > RING_RADIUS_M) continue;

            const h = groundHeightM(store, chunks, x, z);
            if (h === null) continue;
            // Slope from the same heights (true metres — the authored limits
            // are physical, not exaggerated).
            const step = 2;
            const east = groundHeightM(store, chunks, x + step, z);
            const south = groundHeightM(store, chunks, x, z + step);
            if (east !== null && south !== null) {
              const slopeDeg = Math.atan(Math.hypot(east - h, south - h) / step) * (180 / Math.PI);
              if (slopeDeg > rule.slopeDegMax) continue;
            }
            if (waterData) {
              const depth = waterData.depthProxy(x, z);
              if (plan.needsWater && rule.waterRule === "below-at-least") {
                // Cattails/scum reeds stand IN shallow water, not beside it.
                if (depth <= 0.02 || depth > WATER_SPECIES_MAX_DEPTH_M) continue;
              } else if (depth > LAND_SPECIES_MAX_DEPTH_M) {
                continue; // drowned grass under open water reads as a bug
              }
            }

            const fade = distance <= fadeStartM
              ? 1
              : 1 - (distance - fadeStartM) / (RING_RADIUS_M - fadeStartM);
            const vary = (u01(hash32(tx, tz, plan.index, k * 8 + 5)) - 0.5) * 2;
            placed[plan.index].push({
              x,
              y: h * verticalScale,
              z,
              yaw: u01(hash32(tx, tz, plan.index, k * 8 + 4)) * Math.PI * 2,
              scale: (1 + vary * rule.heightVariance) * fade,
              keep: u01(hash32(tx, tz, plan.index, k * 8 + 6)),
            });
          }
        }
      }
    }

    // Pass two: budget guard — thin every species by the same factor.
    const total = placed.reduce((n, list) => n + list.length, 0);
    const densityScale = total > MAX_INSTANCES ? MAX_INSTANCES / total : 1;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let instances = 0;
    let triangles = 0;
    for (const plan of SPECIES_PLANS) {
      const entry = kit.get(plan.id);
      if (!entry) continue; // species missing from the kit: skip, never throw
      const list = placed[plan.index].filter((p) => p.keep < densityScale);
      if (list.length === 0) continue;
      instances += list.length;
      for (const part of entry.levels[0].parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        mesh.frustumCulled = true;
        // Groundcover NEVER casts (module 65 §111 / research §4.2): tens of
        // thousands of alpha-tested casters would dominate the cascades.
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          position.set(p.x, p.y, p.z);
          quaternion.setFromAxisAngle(up, p.yaw);
          scale.setScalar(p.scale);
          mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
        meshes.current.push(mesh);
        const index = part.geometry.getIndex();
        triangles +=
          ((index ? index.count : part.geometry.attributes.position.count) / 3) * list.length;
      }
    }

    const stats: GroundcoverStats = {
      instances,
      draws: meshes.current.length,
      triangles: Math.round(triangles),
      tiles,
      densityScale,
    };
    onStats?.(stats);
    // Same convention as __STUDIO_VEGETATION_DEBUG__: probes read numbers.
    (window as unknown as { __STUDIO_GROUNDCOVER_DEBUG__?: GroundcoverStats })
      .__STUDIO_GROUNDCOVER_DEBUG__ = stats;
  }, [kit, control, chunks, revision, verticalScale, onStats, focusRef, store]);

  return <group ref={root} name="groundcover" />;
}
