/**
 * The T2 vegetation renderer: the compiler's chunk bundles drawn as batched
 * meshes, with the detail rung chosen per pixel on the GPU (decision 0082,
 * module 65 §110).
 *
 * A CELL is one vegetation chunk (468 m). Its buffers are built ONCE, when
 * the chunk decodes and its terrain is loaded, and every instance is emitted
 * into EVERY rung of its species ladder with both band edges closed. The GPU
 * picks the rung per pixel (`lodFade.ts`, decision 0075); the CPU never
 * chooses one. A camera move NEVER rebuilds a cell — the gate for that lives
 * in `CellRegistry` and is unit-tested.
 *
 * Copies live in one `THREE.BatchedMesh` per material key, so a species part
 * is one draw where `WEBGL_multi_draw` exists (the fallback count is
 * published as `drawsFallback`). Per frame the CPU does three small things
 * and nothing else:
 *   1. hierarchical gating — cell, then 58 m tile — switching whole runs of
 *      batch instances on and off with `setVisibleAt`;
 *   2. a few terrain-occlusion rays into a 128² mask texture the shader reads
 *      (decision 0071's rule, evaluated incrementally);
 *   3. the wind and camera uniforms.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  lodRings,
  maxDrawDistance,
  treeDrawDistance,
  SUBMERGED_MAX_DRAW_M,
  type FloraKit,
} from "./floraKit";
import type { QualitySettings } from "@elder-souls/game-core/core/quality";
import {
  applyWindSwayWithShadow,
  updateWindSway,
  windStiffness,
} from "@elder-souls/game-core/fx/windSway";
import { sharedWindUniforms } from "./windUniforms";
import {
  applyLodFadeWithShadow,
  createLodFadeUniforms,
  lodLadder,
} from "@elder-souls/game-core/fx/lodFade";
import {
  applyBatchData,
  BATCH_DATA_TEXELS,
  createBatchDataTexture,
  createBatchDataUniforms,
  writeBatchInstance,
} from "@elder-souls/game-core/fx/batchData";
import { OCCLUSION_CELL_M, OCCLUSION_MIN_DISTANCE_M } from "@elder-souls/game-core/render/terrainOcclusion";
import { isSolid, type FloraCollider, type SolidInstance } from "@elder-souls/game-core/physics/floraSolids";
import {
  buildCellJob,
  cellRungs,
  copiesPerKey,
  CELL_TILES,
  TILE_BOUNDS_STRIDE,
  type CellBuild,
  type CopiesSpecies,
  type CellInstance,
  type CellSpeciesBuild,
  type CellSpeciesParams,
  type CellSpeciesSource,
} from "@elder-souls/game-core/vegetation/cellBuild";
import {
  gateSpecies,
  GATE_TILE_COUNT,
  rangeDistances,
  tileBox,
  type GateBox,
  type GateSpecies,
  type GateRung,
  type GateStats,
} from "@elder-souls/game-core/vegetation/cellGating";
import {
  CellRegistry,
  type TerrainLod,
} from "@elder-souls/game-core/vegetation/cellRegistry";
import { OcclusionMask } from "@elder-souls/game-core/vegetation/occlusionMask";
import { lastWeatherSample } from "../weather/weatherState";
import { useFloraKit, useColliderShapes } from "./useFloraKit";
import { useFrameWork } from "@elder-souls/game-core/scheduling/frameWorkContext";
import { groundHeightM } from "./terrainHeight";
import {
  ANCHOR_PIVOT_TERRAIN,
  decodeVegetationBundle,
  readInstance,
  type VegetationBundle,
} from "./vegetationBundle";

export interface VegetationStats {
  chunks: number;
  instances: number;
  draws: number;
  triangles: number;
  /** Copies gated off this frame (not instances; not comparable with the
   * pre-0082 figure, which counted instances skipped by the draw cull). */
  culled: number;
  /** Instances drawn as their `_lod_flat` far billboard (T4). */
  billboardInstances: number;
  /** Instances in mask cells a ridge hides from the camera (`OcclusionMask`,
   * one ray per 32 m cell, decision 0071). */
  occluded: number;
  /** Per-species drawn copies and the INSTANCE world-Y range they lie in. Added
   * 2026-09-17 for the "underwater band invisible" probe: the aggregate
   * counts cannot tell a missing species from a distant one. */
  bySpecies: Record<string, { drawn: number; minY: number; maxY: number }>;
  /** The LAST CELL BUILD, ms: `total` is the main-thread time it actually
   * spent, summed across the frame-work pump calls it was sliced over
   * (`frames`), never the wall clock between them (`elapsedMs`). */
  rebuildMs: { total: number; frames: number; elapsedMs: number };
  /** Draws the no-`WEBGL_multi_draw` fallback would issue (visible copies). */
  drawsFallback: number;
  cellBuilds: number;
  cellRebuilds: number;
  cellRebuildReasons: Record<string, number>;
  /** Milliseconds the last frame's gating loop took, and the worst of 60. */
  gatingMs: number;
  gatingMaxMs: number;
  /** Milliseconds the last frame's occlusion-mask sweep took. */
  maskMs: number;
  batches: number;
  /** Every copy resident in the batches, visible or not. */
  copiesTotal: number;
  /** Cells loaded but not yet built, plus cells with a build job running: a
   * probe reads 0 as "steady state reached". */
  cellsPending: number;
  /** Monotonic frame counter, so a probe can see the renderer is alive. */
  frame: number;
  /** Visibility churn this frame, and the worst of the last 120 (DEV stutter
   * hunt, round 2): tiles whose state flipped, `setVisibleAt` calls those
   * flips cost, and how many batches a flip touched. */
  flipTiles: number;
  flipTilesMax: number;
  flipInstances: number;
  flipInstancesMax: number;
  batchesTouched: number;
  batchesTouchedMax: number;
  /** Batches still holding un-applied visibility flips after this frame's
   * budget was spent. Steady state is 0; a walk drains a backlog in tens of
   * frames (round 2). */
  pendingBatches: number;
  /** Milliseconds this frame spent applying queued flips, and the worst of
   * the last 120. */
  flipMs: number;
  flipMaxMs: number;
  /** The shared frame-work queue's pump cost this frame and the worst of 120,
   * with the label that ran most often over that window. */
  queueMs: number;
  queueMaxMs: number;
  queueTop: string;
  /** Rolling 60-frame average frame rate, so the HUD line carries the number
   * the stutter is actually about. */
  fps: number;
  /** Main-thread ms spent in cell-build job steps since the previous frame,
   * and the worst of the last 120. */
  buildStepMs: number;
  buildStepMaxMs: number;
}

const CHUNK_RING = 2;
const UNDERWATER_KIT_LEAD_M = 400;
const MAX_PER_DRAW = 6000;
/** Occlusion cells re-rayed per frame. 64 keeps a ~5 000-cell occupied set
 * under ~80 frames of staleness; the sweep costs ~0.1 ms (`maskMs`). */
const MASK_CELLS_PER_FRAME = 64;
/** Instances a brand-new batch reserves, whatever the first cell needs. */
const MIN_BATCH_CAPACITY = 256;
const MASK_SIZE = 128;
/** Camera travel that re-runs the gate pass. With the 8 m band margin a 2 m
 * step keeps the resident rung set a superset of what the shader reads. */
const GATE_STEP_M = 2;
/** Camera TURN that re-runs the gate pass: the behind-the-camera test depends
 * on the forward vector, so a turn changes the answer even standing still.
 * 20° is a fifth of the hysteresis gap's worth of angle; the time-boxed drain
 * keeps the flips it produces off the frame. */
const GATE_TURN_RAD = 20 * Math.PI / 180;
/** Frames after which the pass runs anyway, whatever the camera did. */
const GATE_MAX_FRAMES = 120;
/** Main-thread milliseconds one frame may spend APPLYING queued flips. A
 * batch's cost is not its `setVisibleAt` calls but the `onBeforeRender` walk
 * and indirect-texture upload they force, and that cost varies by an order of
 * magnitude between batches: a fixed batch count bounded the wrong thing
 * (owner walk 2026-09-21, 15 898 flips in a frame). At least one batch is
 * always applied, so a backlog can never stall. */
const FLIP_BUDGET_MS = 1.5;

/**
 * DIAGNOSTIC SWITCH (DEV only, `?vegshader=…`), for telling "the geometry is
 * not there" from "a shader patch hides it". Never a rendering mode.
 *   `0`        no batch patch at all (plain cloned kit material)
 *   `lod`      LOD fade + batch data only (no wind)
 *   `wind`     wind + batch data only (no fade)
 *   `noaerial` all three, but the haze traversal skips these materials
 * Read once, at module load.
 */
type VegShaderMode = "all" | "off" | "lod" | "wind" | "noaerial";
const VEG_SHADER_MODE: VegShaderMode = ((): VegShaderMode => {
  if (!import.meta.env.DEV || typeof window === "undefined") return "all";
  const v = new URLSearchParams(window.location.search).get("vegshader");
  if (v === "0") return "off";
  if (v === "lod" || v === "wind" || v === "noaerial") return v;
  return "all";
})();

/**
 * DEV shadow switch (`?vegshadow=0`), read once at module load: every batch is
 * built with `castShadow = false`, so a frame can be measured with the
 * vegetation shadow pass removed and nothing else changed.
 */
const VEG_CAST_SHADOW: boolean = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).get("vegshadow") !== "0";
})();

/**
 * A/B switch (DEV only, `?veg=0`), read once at module load: the renderer is
 * not MOUNTED at all, so the HUD line shows what the frame costs without it
 * (owner walk 2026-09-21). Not a rendering mode — a measurement.
 */
export const VEGETATION_ENABLED: boolean = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).get("veg") !== "0";
})();

function chunkKey(cx: number, cz: number): string {
  return `${cx}_${cz}`;
}

function cellId(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/**
 * What a batch GROWTH needs to re-add one part's geometry to the fresh mesh.
 * Deliberately holds NO `CellSpeciesBuild`: the instances are copied out of
 * the old `BatchedMesh` and its data texture, so a finished cell keeps no
 * second CPU copy of its placements (review, round 2).
 */
interface ReplaySpec {
  geometryKey: string;
  geometry: THREE.BufferGeometry;
}

/** One species × rung of one cell, tiled, with the instances it owns. The
 * tiles are the flat arrays of `GateRung`; nothing per tile is allocated. */
interface CellRungEntry extends GateRung {
  level: number;
  isCard: boolean;
  species: string;
  /** The species' kit reach, for a tile's box (`tileBox`). */
  reachM: number;
  /** One batch per kit part; replaced in place when a batch grows. */
  partBatches: Batch[];
  partSpecs: ReplaySpec[];
  /** Visibility ACTUALLY applied, `tile × part`. The gate pass writes a
   * DESIRED state into the pending queue; this is what the meshes hold, and
   * the two differ while a backlog drains. */
  appliedParts: Uint8Array;
}

interface CellSpeciesEntry extends GateSpecies {
  rungs: CellRungEntry[];
  /** The species' INSTANCE Y range in this cell (not the gate sphere), so the
   * `bySpecies` stat answers "where in the water column is it?" as it did
   * before 0082. Aggregated over the cell's non-empty gate tiles. */
  instMinY: number;
  instMaxY: number;
}

interface Batch {
  key: string;
  mesh: THREE.BatchedMesh;
  material: THREE.Material;
  depthMaterial: THREE.Material | undefined;
  capacity: number;
  used: number;
  data: THREE.DataTexture;
  geometryIds: Map<string, number>;
  vertexCapacity: number;
  indexCapacity: number;
  near: boolean;
  isCard: boolean;
  /** Copies currently switched visible — the draw-count signal. */
  visibleCopies: number;
  rungs: Set<CellRungEntry>;
}

/** The patched materials one batch KEY owns, kept across capacity growth. */
interface BatchMaterials {
  material: THREE.Material;
  depthMaterial: THREE.Material | undefined;
  uniforms: {
    esBatchData: { value: THREE.DataTexture | null };
    esOccMask: { value: THREE.DataTexture | null };
    esOccParams: { value: THREE.Vector4 };
  };
}

interface Cell {
  key: string;
  originX: number;
  originZ: number;
  bundle: VegetationBundle;
  /** Only what the renderer still needs after the build: the CPU placements
   * are dropped with the `CellBuild`. */
  build: { solids: SolidInstance[] } | null;
  lod: TerrainLod;
  species: CellSpeciesEntry[];
  /** (cellX, cellZ, instances) triples of the 32 m cells this cell occupies. */
  occCells: number[];
}

function attributeSignature(geometry: THREE.BufferGeometry): string {
  return Object.keys(geometry.attributes)
    .sort()
    .map((name) => `${name}:${geometry.attributes[name].itemSize}`)
    .join(",");
}

export function Vegetation({
  focusRef,
  baseUrl,
  verticalScale = 1,
  onStats,
  quality,
  onSolids,
  shapesRef,
}: {
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  baseUrl: string;
  verticalScale?: number;
  onStats?: (stats: VegetationStats) => void;
  quality?: QualitySettings;
  onSolids?: (solids: SolidInstance[]) => void;
  shapesRef?: React.MutableRefObject<Map<string, FloraCollider[]> | null>;
}) {
  const chunkRing = quality?.vegChunkRing ?? CHUNK_RING;
  const drawScale = quality?.vegDrawScale ?? 1;
  const root = useRef<THREE.Group>(null);
  const {
    kit, index, manifest, underwaterManifest, chunksManifest, store,
    requestUnderwater,
  } = useFloraKit(baseUrl);
  useColliderShapes(kit, manifest, underwaterManifest, shapesRef);

  const queue = useFrameWork();
  const wind = sharedWindUniforms;
  const lodFade = useMemo(() => createLodFadeUniforms(), []);
  const batchUniforms = useMemo(() => createBatchDataUniforms(), []);
  const mask = useMemo(() => new OcclusionMask(MASK_SIZE, OCCLUSION_CELL_M), []);
  const maskTexture = useMemo(() => {
    const texture = new THREE.DataTexture(
      mask.data, MASK_SIZE, MASK_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }, [mask]);
  useEffect(() => {
    batchUniforms.esOccMask.value = maskTexture;
    return () => { maskTexture.dispose(); };
  }, [batchUniforms, maskTexture]);

  const cells = useRef(new Map<string, Cell>());
  const pending = useRef(new Set<string>());
  const batches = useRef(new Map<string, Batch>());
  const registry = useRef(new CellRegistry());
  const jobs = useRef(new Map<string, { cancel(): void }>());
  const batchMaterials = useRef(new Map<string, BatchMaterials>());
  const mounted = useRef(true);
  const allSpecies = useRef<CellSpeciesEntry[]>([]);
  const copiesTotal = useRef(0);
  const gateStats = useRef<GateStats>({
    visibleCopies: 0, visibleTriangles: 0, checksCell: 0, checksTile: 0,
  });
  const maskChunk = useRef<{ cx: number; cz: number } | null>(null);
  const cameraPos = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const lastScan = useRef<{ cx: number; cz: number; loaded: number; pending: number } | null>(null);
  const counters = useRef({
    builds: 0, gatingMs: 0, gatingMaxMs: 0, maskMs: 0, frame: 0,
    lastBuild: { total: 0, frames: 0, elapsedMs: 0 },
    flipTiles: 0, flipTilesMax: 0,
    flipInstances: 0, flipInstancesMax: 0,
    flipMs: 0, flipMaxMs: 0,
    queueMs: 0, queueMaxMs: 0,
    batchesTouched: 0, batchesTouchedMax: 0,
    buildStepMs: 0, buildStepMaxMs: 0,
  });
  /** Frame-work labels seen over the rolling 120-frame window, and how often:
   * the queue reports labels, not per-label time, so `queueTop` is the label
   * that ran most often. */
  const queueLabels = useRef(new Map<string, number>());
  /** Scratch stats for the fill-time gate pass, so the frame's own gate
   * counters are never clobbered by a cell arriving. */
  const fillStats = useRef<GateStats>({
    visibleCopies: 0, visibleTriangles: 0, checksCell: 0, checksTile: 0,
  });
  /** Batches a visibility flip touched this frame — cleared at frame end, so
   * `batchesTouched` counts distinct batches, not flips. */
  const flippedBatches = useRef(new Set<Batch>());
  /** Queued visibility flips, batch by batch: the gate pass ENQUEUES here and
   * a bounded number of batches are applied per frame. */
  const pendingFlips = useRef(
    new Map<Batch, Map<CellRungEntry, Map<number, boolean>>>());
  /** Camera forward on XZ at the last gate pass; the behind test reads it. */
  const cameraFwd = useRef({ x: 0, z: -1 });
  const gateBox = useRef<GateBox>({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 });
  /** Camera state at the last gate pass, and whether a build or drop has
   * invalidated it. */
  const lastGate = useRef({ x: NaN, z: NaN, fx: 0, fz: -1, frame: -1e9 });
  const gateDirty = useRef(true);
  const fps = useRef({ sum: 0, count: 0, value: 0, last: 0 });
  const [revision, setRevision] = useState(0);
  /** 32 m cells that hold at least one instance, and how many — recomputed
   * when a cell is built or dropped, never per frame. `occupiedList` is the
   * same set as a flat (cellX, cellZ) array for the mask sweep. */
  const occupiedCells = useRef(new Map<number, number>());
  const occupiedList = useRef(new Int32Array(0));

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const host = window as unknown as { __STUDIO_VEGETATION_REBUILD__?: () => void };
    host.__STUDIO_VEGETATION_REBUILD__ = () => {
      registry.current.kitChanged();   // the dev hook forces every cell

      setRevision((r) => r + 1);
    };
    return () => { delete host.__STUDIO_VEGETATION_REBUILD__; };
  }, []);

  // The cell → terrain-chunk mapping below assumes the two grids share an
  // origin and a chunk size; say so loudly, once, if they ever diverge.
  const gridChecked = useRef(false);
  useEffect(() => {
    if (gridChecked.current || !chunksManifest || !index) return;
    gridChecked.current = true;
    const origin = store.chunkAt(0, 0)?.originM;
    // 0.1 m tolerance: the two are rounded differently (467.9 vs 467.93).
    if (Math.abs(chunksManifest.chunkMetres - index.chunkMetres) > 0.1
        || !origin || origin[0] !== 0 || origin[1] !== 0) {
      console.error("[vegetation-cells] terrain and vegetation chunk grids differ", {
        terrainChunkMetres: chunksManifest.chunkMetres,
        vegetationChunkMetres: index.chunkMetres,
        terrainFirstOriginM: origin ?? null,
      });
    }
  }, [chunksManifest, index, store]);

  // A kit arrival dirties only the cells that SKIPPED one of the arriving
  // species; a quality change dirties every cell. Neither is movement
  // (decision 0082 round-1 realisation).
  useEffect(() => {
    if (!kit) return;
    registry.current.kitChanged(new Set(kit.keys()));
  }, [kit]);
  useEffect(() => { registry.current.drawScaleChanged(); }, [drawScale, chunkRing]);

  useEffect(() => {
    mounted.current = true;
    const live = batches.current;
    const liveJobs = jobs.current;
    const liveMaterials = batchMaterials.current;
    const group = root.current;
    return () => {
      mounted.current = false;
      // Cancel first: a job that finishes after this would build fresh
      // BatchedMeshes with no owner and no parent.
      for (const job of [...liveJobs.values()]) job.cancel();
      liveJobs.clear();
      for (const batch of live.values()) {
        group?.remove(batch.mesh);
        batch.mesh.dispose();
        batch.data.dispose();
      }
      live.clear();
      for (const owned of liveMaterials.values()) {
        owned.material.dispose();
        owned.depthMaterial?.dispose();
      }
      liveMaterials.clear();
    };
  }, []);

  /** Ground in TRUE metres from the finest decoded terrain LOD. */
  const sampleGround = useMemo(() => (
    chunksManifest
      ? (x: number, z: number) => groundHeightM(store, chunksManifest, x, z)
      : () => null
  ), [store, chunksManifest]);

  // Per-species build parameters, recomputed only when the kit, the quality
  // tier or the chunk ring changes — never per frame and never per cell.
  const speciesParams = useMemo(() => {
    const out = new Map<string, CellSpeciesParams>();
    if (!kit || !index) return out;
    const reach = new Map<string, number>();
    for (const a of [...(manifest?.assets ?? []), ...(underwaterManifest?.assets ?? [])]) {
      if (!reach.has(a.id)) {
        reach.set(a.id, Math.hypot(a.sizeM[2], Math.max(a.sizeM[0], a.sizeM[1]) / 2));
      }
    }
    // Land manifest wins on a shared id: the underwater band's copies carry
    // no collision.
    const solidByAsset = new Map(
      [...(underwaterManifest?.assets ?? []), ...(manifest?.assets ?? [])]
        .map((a) => [a.id, isSolid(a)]),
    );
    for (const [id, entry] of kit) {
      if (entry.suspect) continue;
      const maxDraw = entry.submerged
        ? Math.min(maxDrawDistance(entry.heightM) * drawScale, SUBMERGED_MAX_DRAW_M)
        : entry.category === "tree"
          ? treeDrawDistance(chunkRing, index.chunkMetres)
          : maxDrawDistance(entry.heightM) * drawScale;
      const rings = lodRings(entry.heightM, drawScale, entry.submerged);
      const meshLevels = entry.billboardIndex ?? entry.levels.length;
      const ladder = lodLadder(rings, meshLevels, entry.billboardIndex, maxDraw);
      const trunkRadius = entry.trunkRadiusM;
      out.set(id, {
        species: id,
        ladder,
        vanishes: entry.submerged || entry.category !== "tree",
        maxDraw,
        sways: entry.sways,
        trunkRadiusM: trunkRadius,
        solid: solidByAsset.get(id) ?? false,
        cardLevel: entry.billboardIndex,
        reachM: reach.get(id) ?? entry.heightM,
        heightM: entry.heightM,
        stiffness: (scale: number) =>
          trunkRadius === null ? 0 : windStiffness(trunkRadius, scale) - 1,
      });
    }
    return out;
  }, [kit, index, manifest, underwaterManifest, drawScale, chunkRing]);

  const underwaterOnly = useMemo(() => {
    const set = new Set(underwaterManifest?.assets.map((a) => a.id) ?? []);
    for (const a of manifest?.assets ?? []) set.delete(a.id);
    return set;
  }, [manifest, underwaterManifest]);

  const tallestM = useMemo(() => {
    let tallest = 0;
    for (const species of kit?.values() ?? []) {
      if (species.heightM > tallest) tallest = species.heightM;
    }
    return tallest;
  }, [kit]);

  // ---- batch plumbing -----------------------------------------------------

  const batchKeyFor = (
    material: THREE.Material,
    depthMaterial: THREE.Material | undefined,
    geometry: THREE.BufferGeometry,
    near: boolean,
    isCard: boolean,
  ) => `${material.uuid}|${depthMaterial?.uuid ?? "-"}|${attributeSignature(geometry)}`
    + `|${near ? "near" : "far"}|${isCard ? "card" : "mesh"}`;

  /**
   * Vertex/index room every kit geometry that lands in a batch needs, for
   * EVERY key at once: one pass over the kit per kit, not one per new batch
   * (at ~570 batches the per-batch walk was ~10⁶ throwaway key strings).
   */
  const batchGeometryBudgets = useMemo(() => {
    const out = new Map<string, { vertices: number; indices: number }>();
    for (const entry of kit?.values() ?? []) {
      if (entry.suspect) continue;
      for (let level = 0; level < entry.levels.length; level++) {
        const isCard = entry.billboardIndex !== null && level === entry.billboardIndex;
        for (const part of entry.levels[level].parts) {
          const position = part.geometry.getAttribute("position");
          const idx = part.geometry.getIndex();
          const vertices = position.count;
          const indices = idx ? idx.count : position.count;
          // Rung 0 is ALWAYS kit level 0, so a near key can only ever hold
          // level-0 geometry: sizing it for the whole ladder reserved buffers
          // several times larger than anything that lands in them.
          const nears = level === 0 ? [true, false] : [false];
          for (const near of nears) {
            const key = batchKeyFor(
              part.material, part.depthMaterial, part.geometry, near, isCard);
            const have = out.get(key);
            if (have) {
              have.vertices += vertices;
              have.indices += indices;
            } else {
              out.set(key, { vertices, indices });
            }
          }
        }
      }
    }
    for (const budget of out.values()) {
      budget.vertices = Math.max(64, budget.vertices);
      budget.indices = Math.max(64, budget.indices);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit]);

  const batchGeometryBudget = (key: string) =>
    batchGeometryBudgets.get(key) ?? { vertices: 64, indices: 64 };

  const makeBatch = (
    key: string,
    material: THREE.Material,
    depthMaterial: THREE.Material | undefined,
    near: boolean,
    isCard: boolean,
    capacity: number,
    budget: { vertices: number; indices: number },
  ): Batch => {
    // Materials are owned per batch KEY and patched ONCE. Cloning a patched
    // material is not safe: `Material.copy` JSON-clones userData and drops
    // `onBeforeCompile`, so every `apply*` guard would see a husk, return
    // early, and the batch would draw with no LOD fade, wind or occlusion.
    let owned = batchMaterials.current.get(key);
    if (!owned) {
      const clone = material.clone();
      const depthClone = depthMaterial?.clone();
      const uniforms = {
        esBatchData: { value: null as THREE.DataTexture | null },
        esOccMask: batchUniforms.esOccMask,
        esOccParams: batchUniforms.esOccParams,
      };
      // EVERY batch material is wind-patched, unconditionally: a batch key is
      // a material, and a rock and a plant can share one glTF material, so a
      // `sways` test here silenced whichever species did not create the batch.
      // Stillness is per INSTANCE — a non-swaying species and every card copy
      // carry stiffness -1 in the data texture.
      // `?vegshader=…` (DEV diagnostic) drops patches one at a time.
      if (VEG_SHADER_MODE !== "off") {
        if (VEG_SHADER_MODE !== "lod") applyWindSwayWithShadow(clone, depthClone, wind);
        if (VEG_SHADER_MODE !== "wind") applyLodFadeWithShadow(clone, depthClone, lodFade);
        applyBatchData(clone, depthClone, uniforms);
      }
      if (VEG_SHADER_MODE === "noaerial") {
        clone.userData.esAerial = false;
        if (depthClone) depthClone.userData.esAerial = false;
      }
      owned = { material: clone, depthMaterial: depthClone, uniforms };
      batchMaterials.current.set(key, owned);
    }
    const clone = owned.material;
    const depthClone = owned.depthMaterial;
    const data = createBatchDataTexture(capacity);
    // The data texture is PER BATCH and re-pointed when the batch grows; the
    // occlusion mask and its window are shared by reference, so one sweep
    // feeds every batch.
    owned.uniforms.esBatchData.value = data;
    const mesh = new THREE.BatchedMesh(
      capacity, budget.vertices, budget.indices, clone);
    mesh.perObjectFrustumCulled = false;   // measured 2.6 ms at 80 k (0082)
    mesh.sortObjects = false;              // 108 ms at 300 k
    mesh.frustumCulled = false;            // gated by distance, never culled
    mesh.castShadow = near && VEG_CAST_SHADOW;
    mesh.receiveShadow = !isCard;
    if (depthClone) mesh.customDepthMaterial = depthClone;
    root.current?.add(mesh);
    return {
      key, mesh, material: clone, depthMaterial: depthClone, capacity, used: 0,
      data, geometryIds: new Map(), vertexCapacity: budget.vertices,
      indexCapacity: budget.indices, near, isCard,
      visibleCopies: 0, rungs: new Set(),
    };
  };

  // ---- the frame ----------------------------------------------------------

  useFrame((state) => {
    const weather = lastWeatherSample();
    if (weather) updateWindSway(wind, state.clock.elapsedTime, weather);
    lodFade.esLodViewPos.value.copy(state.camera.position);
    cameraPos.current.copy(state.camera.position);
    if (!index || !root.current) return;
    const eye = cameraPos.current;
    const focus = focusRef.current;
    const size = index.chunkMetres;
    const cx = Math.floor(focus.x / size);
    const cz = Math.floor(focus.z / size);
    registry.current.cameraMoved(eye.x, eye.z);

    // --- ring scan and eviction (guarded exactly as the old renderer) ---
    const scan = lastScan.current;
    if (!scan || scan.cx !== cx || scan.cz !== cz
        || scan.loaded !== cells.current.size || scan.pending !== pending.current.size) {
      lastScan.current = {
        cx, cz, loaded: cells.current.size, pending: pending.current.size,
      };
      for (let dz = -chunkRing; dz <= chunkRing; dz++) {
        for (let dx = -chunkRing; dx <= chunkRing; dx++) {
          const key = chunkKey(cx + dx, cz + dz);
          if (!index.chunks[key] || cells.current.has(key) || pending.current.has(key)) continue;
          pending.current.add(key);
          const ox = (cx + dx) * size;
          const oz = (cz + dz) * size;
          fetch(`${baseUrl}province/vegetation/chunk_${key}_vegetation.bin`)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing"))))
            .then((buffer) => {
              cells.current.set(key, {
                key, originX: ox, originZ: oz,
                bundle: decodeVegetationBundle(buffer),
                build: null, lod: null, species: [], occCells: [],
              });
              registry.current.chunkLoaded(key);
            })
            .catch(() => undefined)
            .finally(() => pending.current.delete(key));
        }
      }
      // Eviction: a cell beyond ring + 1 gives its batch instances back.
      for (const cell of [...cells.current.values()]) {
        const ccx = Math.round(cell.originX / size);
        const ccz = Math.round(cell.originZ / size);
        if (Math.max(Math.abs(ccx - cx), Math.abs(ccz - cz)) <= chunkRing + 1) continue;
        dropCell(cell);
      }
    }

    // --- terrain LOD bookkeeping and the dirty set ---
    if (chunksManifest) {
      for (const cell of cells.current.values()) {
        const tcx = Math.max(0, Math.min(chunksManifest.grid[0] - 1,
          Math.floor((cell.originX + size / 2) / chunksManifest.chunkMetres)));
        const tcz = Math.max(0, Math.min(chunksManifest.grid[1] - 1,
          Math.floor((cell.originZ + size / 2) / chunksManifest.chunkMetres)));
        const lod: TerrainLod = store.loaded(tcx, tcz, "1") ? "1"
          : store.loaded(tcx, tcz, "2") ? "2"
            : store.loaded(tcx, tcz, "4") ? "4" : null;
        cell.lod = lod;
        registry.current.terrainLod(cell.key, lod);
      }
    }
    if (kit && speciesParams.size > 0) {
      const dirty = registry.current.dirty()
        .filter((d) => !jobs.current.has(d.key))
        .sort((a, b) => cellDistance(a.key) - cellDistance(b.key));
      for (const d of dirty) startBuild(d.key, d.serial);
    }

    // --- occlusion mask ---
    const maskStart = performance.now();
    // The window is anchored on the FOCUS CHUNK, not on the camera's 32 m
    // cell: re-anchoring every 32 m wiped the mask faster than 64 cells a
    // frame could refill it, so terrain occlusion was off whenever we moved.
    // 128 cells = 4096 m covers the 5 × 5 chunk neighbourhood with margin.
    const anchorChunk = maskChunk.current;
    let anchored = false;
    if (!anchorChunk || anchorChunk.cx !== cx || anchorChunk.cz !== cz) {
      maskChunk.current = { cx, cz };
      anchored = mask.anchor(
        Math.floor(((cx + 0.5) * size) / OCCLUSION_CELL_M) - MASK_SIZE / 2,
        Math.floor(((cz + 0.5) * size) / OCCLUSION_CELL_M) - MASK_SIZE / 2,
      );
    }
    const sweep = mask.sweep(
      MASK_CELLS_PER_FRAME, { x: eye.x, y: eye.y, z: eye.z },
      (x, z) => {
        // Rendered space, like the camera.
        const h = sampleGround(x, z);
        return h === null ? null : h * verticalScale;
      },
      tallestM, OCCLUSION_MIN_DISTANCE_M,
      occupiedList.current,
    );
    // A wipe has to reach the GPU on its own: otherwise the uniform points at
    // the new window while the texture still holds the old window's 255s.
    if (anchored || sweep.changed > 0) maskTexture.needsUpdate = true;
    batchUniforms.esOccParams.value.set(
      mask.originCellX, mask.originCellZ, MASK_SIZE, OCCLUSION_CELL_M);
    counters.current.maskMs = performance.now() - maskStart;

    // --- gating ---
    // The pass is not per frame: the 8 m band margin and the behind-test
    // hysteresis mean the answer cannot change until the eye has moved 2 m,
    // turned 20°, or a cell has arrived (round 2 addendum, decision 0082).
    const gateStart = performance.now();
    const g = lastGate.current;
    const fwd = cameraFwd.current;
    forwardVec.set(0, 0, -1).applyQuaternion(state.camera.quaternion);
    const flen = Math.hypot(forwardVec.x, forwardVec.z);
    if (flen > 1e-6) { fwd.x = forwardVec.x / flen; fwd.z = forwardVec.z / flen; }
    const moved = Math.hypot(eye.x - g.x, eye.z - g.z);
    const turned = fwd.x * g.fx + fwd.z * g.fz;
    const runGate = gateDirty.current
      || !(moved < GATE_STEP_M)
      || !(turned > Math.cos(GATE_TURN_RAD))
      || counters.current.frame - g.frame >= GATE_MAX_FRAMES;
    if (runGate) {
      gateDirty.current = false;
      g.x = eye.x; g.z = eye.z; g.fx = fwd.x; g.fz = fwd.z;
      g.frame = counters.current.frame;
      gateSpecies(allSpecies.current, eye, fwd, enqueueTile, gateStats.current);
    }
    const gatingMs = performance.now() - gateStart;
    counters.current.gatingMs = gatingMs;
    if (gatingMs > counters.current.gatingMaxMs) counters.current.gatingMaxMs = gatingMs;

    // --- drain the flip queue, ON before OFF, nearest first ---
    const flipStart = performance.now();
    drainFlips(eye);
    counters.current.flipMs = performance.now() - flipStart;

    // --- the shared frame-work queue's own report, for the same HUD line ---
    if (import.meta.env.DEV) {
      const report = (window as unknown as {
        __STUDIO_FRAME_WORK__?: { lastPumpMs?: number; labels?: string[] };
      }).__STUDIO_FRAME_WORK__;
      counters.current.queueMs = report?.lastPumpMs ?? 0;
      for (const label of report?.labels ?? []) {
        queueLabels.current.set(label, (queueLabels.current.get(label) ?? 0) + 1);
      }
    }

    // Rolling frame rate: a 60-frame average, latched.
    const nowMs = performance.now();
    const f = fps.current;
    if (f.last > 0) { f.sum += nowMs - f.last; f.count++; }
    f.last = nowMs;
    if (f.count >= 60) {
      f.value = Math.round((1000 * f.count) / Math.max(f.sum, 0.001));
      f.sum = 0; f.count = 0;
    }

    // Published often enough that a probe on a sub-1 fps software renderer
    // still sees the numbers; the gating maximum is a 60-frame window.
    counters.current.frame++;
    const c = counters.current;
    c.batchesTouched = flippedBatches.current.size;
    if (c.flipTiles > c.flipTilesMax) c.flipTilesMax = c.flipTiles;
    if (c.flipInstances > c.flipInstancesMax) c.flipInstancesMax = c.flipInstances;
    if (c.flipMs > c.flipMaxMs) c.flipMaxMs = c.flipMs;
    if (c.queueMs > c.queueMaxMs) c.queueMaxMs = c.queueMs;
    if (c.batchesTouched > c.batchesTouchedMax) c.batchesTouchedMax = c.batchesTouched;
    if (c.buildStepMs > c.buildStepMaxMs) c.buildStepMaxMs = c.buildStepMs;
    if (c.frame % 60 === 0) publishStats();
    if (c.frame % 60 === 0) c.gatingMaxMs = 0;
    // The churn maxima roll on a 120-frame window (the gating maximum is 60:
    // a stutter is rarer than a slow frame, so it needs the longer memory).
    if (c.frame % 120 === 0) {
      c.flipTilesMax = 0; c.flipInstancesMax = 0;
      c.flipMaxMs = 0; c.queueMaxMs = 0;
      c.batchesTouchedMax = 0; c.buildStepMaxMs = 0;
      queueLabels.current.clear();
    }
    c.flipTiles = 0; c.flipInstances = 0; c.buildStepMs = 0;
    flippedBatches.current.clear();

    function cellDistance(key: string): number {
      const cell = cells.current.get(key);
      if (!cell) return Infinity;
      return Math.hypot(
        cell.originX + size / 2 - eye.x, cell.originZ + size / 2 - eye.z);
    }
  });

  function refreshOccupied(): void {
    const counts = new Map<number, number>();
    for (const cell of cells.current.values()) {
      for (let i = 0; i < cell.occCells.length; i += 3) {
        const id = cellId(cell.occCells[i], cell.occCells[i + 1]);
        counts.set(id, (counts.get(id) ?? 0) + cell.occCells[i + 2]);
      }
    }
    occupiedCells.current = counts;
    const list = new Int32Array(counts.size * 2);
    let at = 0;
    for (const id of counts.keys()) {
      const cx = Math.floor(id / 65536);
      list[at++] = cx - 32768;
      list[at++] = id - cx * 65536 - 32768;
    }
    occupiedList.current = list;
    // No wipe: a full reset takes ~80 frames to refill, which left occlusion
    // off for most of a walk. A dropped cell clears its OWN texels
    // (`dropCell`); a built cell only appends, and new texels are already
    // 0 = visible.
  }

  function refreshRanges(): void {
    const out: CellSpeciesEntry[] = [];
    let copies = 0;
    for (const cell of cells.current.values()) {
      for (const entry of cell.species) {
        out.push(entry);
        for (const rung of entry.rungs) copies += rung.copies;
      }
    }
    allSpecies.current = out;
    copiesTotal.current = copies;
    gateDirty.current = true;   // a built or dropped cell needs a gate pass
  }

  function publishSolids(): void {
    if (!onSolids) return;
    const solids: SolidInstance[] = [];
    for (const cell of cells.current.values()) {
      if (cell.build) solids.push(...cell.build.solids);
    }
    onSolids(solids);
  }

  function removeRanges(entries: CellSpeciesEntry[]): void {
    for (const entry of entries) {
      for (const rung of entry.rungs) {
        hideRung(rung);   // keeps the per-batch visible counters honest
        for (let p = 0; p < rung.partBatches.length; p++) {
          const batch = rung.partBatches[p];
          const ids = rung.ids[p];
          for (let i = 0; i < ids.length; i++) batch.mesh.deleteInstance(ids[i]);
          batch.used -= ids.length;
          batch.rungs.delete(rung);
        }
        rung.partBatches = [];
        rung.ids = [];
      }
      entry.rungs = [];
    }
  }

  function dropCell(cell: Cell): void {
    jobs.current.get(cell.key)?.cancel();
    jobs.current.delete(cell.key);
    removeRanges(cell.species);
    // Its occlusion answers are about to stop being swept: clear them, or
    // they stay 255 = hidden for as long as the window sits still.
    if (mask.clearCells(cell.occCells, 3) > 0) maskTexture.needsUpdate = true;
    cells.current.delete(cell.key);
    registry.current.chunkUnloaded(cell.key);
    refreshRanges();
    refreshOccupied();
    publishSolids();
    publishStats();
  }

  function startBuild(key: string, serial: number): void {
    const cell = cells.current.get(key);
    const liveKit = kit;
    const liveIndex = index;
    if (!cell || !liveKit || !liveIndex) return;
    const reason = registry.current.reason(key);
    const lod = cell.lod;
    const started = performance.now();
    let cpuMs = 0;
    let segmentStart = started;
    let frames = 0;
    const sources: CellSpeciesSource[] = [];
    for (const group of cell.bundle.species) {
      if (group.count === 0) continue;
      const id = liveIndex.speciesOrder?.[group.index];
      if (!id) continue;
      sources.push({
        species: id,
        // A suspect asset is deliberately absent from `speciesParams`: it is
        // unrenderable, not a kit that has yet to arrive, so it must never
        // make its cell look like it is waiting (and rebuild on every kit).
        suspect: liveKit.get(id)?.suspect === true,
        anchorPivotTerrain: group.anchorMode === ANCHOR_PIVOT_TERRAIN,
        count: group.count,
        underwaterOnly: underwaterOnly.has(id),
        read: (i: number, out: CellInstance) => {
          const inst = readInstance(group, i);
          out.x = inst.x; out.y = inst.y; out.z = inst.z;
          out.yaw = inst.yaw; out.scale = inst.scale;
          out.tiltX = inst.tiltX; out.tiltZ = inst.tiltZ; out.sink = inst.sink;
        },
      });
    }
    const inner = buildCellJob(
      sources, speciesParams, sampleGround, verticalScale, MAX_PER_DRAW,
      (build) => { finish(build); },
      cell.originX, cell.originZ, liveIndex.chunkMetres);

    // The new copies are built and filled FIRST and the old ones deleted at
    // the end, so nothing blinks while a cell is re-grounded. `filled` holds
    // the half-done work, which a cancel has to give back.
    const filled: CellSpeciesEntry[] = [];
    const touched = new Set<Batch>();

    function* job(): Generator<void> {
      // Step one: make room in every batch this cell will touch, so no growth
      // can happen with a rung half-filled.
      segmentStart = performance.now();
      const { needs, specs } = planBatches(sources, liveKit!);
      reserveBatches(needs, specs);
      cpuMs += buildStepElapsed(segmentStart);
      frames++;
      yield;
      for (;;) {
        segmentStart = performance.now();
        const step = inner.next();
        // One species per step covers BOTH halves: its build, then its fill.
        if (!step.done && step.value
            && mounted.current && cells.current.get(key) === cell) {
          const entry = fillSpecies(cell!, step.value, liveKit!, touched);
          if (entry) filled.push(entry);
        }
        cpuMs += buildStepElapsed(segmentStart);
        frames++;
        if (step.done) return;
        yield;
      }
    }

    function finish(build: CellBuild): void {
      // A cancelled or unmounted owner must not get fresh BatchedMeshes.
      if (!mounted.current || cells.current.get(key) !== cell) return;
      const previous = cell!.species;
      // One upload per batch the whole cell touched, not one per part.
      for (const batch of touched) batch.data.needsUpdate = true;
      removeRanges(previous);
      cell!.species = filled;
      cell!.build = { solids: build.solids };
      cell!.occCells = occupiedFor(build);
      // `finish` runs INSIDE the last frame-work step, so its cost is already
      // in that step's segment: adding it again would double-count it.
      registry.current.built(key, lod, build.skippedSpecies, serial);
      counters.current.builds++;
      counters.current.lastBuild = {
        total: Math.round(cpuMs * 10) / 10,
        frames,
        elapsedMs: Math.round(performance.now() - started),
      };
      refreshRanges();
      refreshOccupied();
      publishSolids();
      // The underwater kit is 27 MB: ask for it only once a sea-bed species
      // comes within the lead distance of the focus (16f round 4).
      if (build.underwaterWanted) {
        const f = focusRef.current;
        const dx = Math.max(cell!.originX - f.x, 0, f.x - (cell!.originX + liveIndex!.chunkMetres));
        const dz = Math.max(cell!.originZ - f.z, 0, f.z - (cell!.originZ + liveIndex!.chunkMetres));
        if (Math.hypot(dx, dz) <= UNDERWATER_KIT_LEAD_M) requestUnderwater();
      }
      if (import.meta.env.DEV) {
        if (reason && reason !== "first") {
          console.debug(`vegetation cell rebuilt ${key} (${reason})`);
        }
        console.debug(
          `vegetation cell built ${key} ${counters.current.lastBuild.total} ms `
          + `${build.copies} copies`);
      }
      // Publish NOW, not at the next 10-frame tick: on a sub-1 fps software
      // renderer that tick is longer than a probe's whole window.
      publishStats();
    }

    const handle = queue.add(job(), {
      priority: 30, label: "vegetation-cell",
      // `finish` runs while the job is still registered, so publish again once
      // it is retired: otherwise `cellsPending` stays one too high until the
      // next 10-frame tick.
      onDone: () => { jobs.current.delete(key); publishStats(); },
      onError: () => { jobs.current.delete(key); publishStats(); },
    });
    jobs.current.set(key, {
      cancel: () => {
        handle.cancel();
        jobs.current.delete(key);
        // The fill is sliced now, so a cancel can land with some species
        // already in the batches: give those copies back.
        if (filled.length > 0 && cell.species !== filled) {
          removeRanges(filled);
          filled.length = 0;
        }
      },
    });
  }

  /** (cellX, cellZ, instances) triples: the count feeds the `occluded` stat. */
  function occupiedFor(build: CellBuild): number[] {
    const counts = new Map<number, number>();
    for (const sb of build.species) {
      for (let i = 0; i < sb.count; i++) {
        const x = sb.placements[i * 7];
        const z = sb.placements[i * 7 + 2];
        const id = cellId(
          Math.floor(x / OCCLUSION_CELL_M), Math.floor(z / OCCLUSION_CELL_M));
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const out: number[] = [];
    for (const [id, count] of counts) {
      const cx = Math.floor(id / 65536);
      out.push(cx - 32768, id - cx * 65536 - 32768, count);
    }
    return out;
  }

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const scaleVec = useMemo(() => new THREE.Vector3(), []);
  /** Camera forward, re-derived each frame for the gate's behind test. */
  const forwardVec = useMemo(() => new THREE.Vector3(), []);

  /** What `reserveBatches` needs to CREATE a batch for a key. */
  interface PartSpec {
    material: THREE.Material;
    depthMaterial: THREE.Material | undefined;
    near: boolean;
    isCard: boolean;
  }

  /**
   * The copies one cell will add per batch key, and how to make each of those
   * batches — worked out from the SOURCES, before anything is built, so every
   * batch can be grown up front (`reserveBatches`). The count and the rung
   * ladder here are exactly what `buildSpecies` will produce.
   */
  function planBatches(
    sources: readonly CellSpeciesSource[],
    liveKit: FloraKit,
  ): { needs: Map<string, number>; specs: Map<string, PartSpec> } {
    const plan: CopiesSpecies[] = [];
    for (const source of sources) {
      const params = speciesParams.get(source.species);
      if (!params) continue;
      const count = Math.min(source.count, MAX_PER_DRAW);
      const rungs = cellRungs(params.ladder, params.vanishes);
      if (count === 0 || rungs.length === 0) continue;
      plan.push({ species: source.species, count, rungs });
    }
    const specs = new Map<string, PartSpec>();
    const needs = copiesPerKey(plan, (sb, rungIndex) => {
      const entry = liveKit.get(sb.species);
      if (!entry) return [];
      const level = Math.min(entry.levels.length - 1, sb.rungs[rungIndex].level);
      const isCard = entry.billboardIndex !== null && level === entry.billboardIndex;
      const near = rungIndex === 0;
      const keys: string[] = [];
      for (const part of entry.levels[level].parts) {
        const key = batchKeyFor(
          part.material, part.depthMaterial, part.geometry, near, isCard);
        if (!specs.has(key)) {
          specs.set(key, {
            material: part.material, depthMaterial: part.depthMaterial,
            near, isCard,
          });
        }
        keys.push(key);
      }
      return keys;
    });
    return { needs, specs };
  }

  /**
   * Grow every batch this cell will overflow, BEFORE its first `addInstance`.
   * A growth replays whole live rungs into a fresh mesh, which is only sound
   * while no rung is half-filled — so this is the one place that grows.
   */
  function reserveBatches(
    needs: Map<string, number>,
    specs: Map<string, PartSpec>,
  ): void {
    for (const [key, need] of needs) {
      const spec = specs.get(key);
      if (!spec) continue;
      const batch = batches.current.get(key);
      if (!batch) {
        batches.current.set(key, makeBatch(
          key, spec.material, spec.depthMaterial, spec.near, spec.isCard,
          Math.max(MIN_BATCH_CAPACITY, Math.ceil(need * 1.5)),
          batchGeometryBudget(key)));
      } else if (batch.used + need > batch.capacity) {
        batches.current.set(key, growBatch(batch, need));
      }
    }
  }

  /**
   * Re-create a full batch at 1.5× and replay every live rung into it. The
   * materials are NOT re-created (they are owned per key): only the mesh and
   * the per-instance data texture are, and the uniform is re-pointed at the
   * new texture inside `makeBatch`.
   */
  function growBatch(old: Batch, need: number): Batch {
    const capacity = Math.max(MIN_BATCH_CAPACITY, Math.ceil((old.used + need) * 1.5));
    // Hide everything this batch holds first, so the visible-copy counters and
    // the tile states are consistent with the fresh (all-invisible) copies;
    // the next gating pass re-applies the right answer.
    for (const rung of [...old.rungs]) hideRung(rung);
    const fresh = makeBatch(
      old.key, old.material, old.depthMaterial, old.near, old.isCard,
      capacity, { vertices: old.vertexCapacity, indices: old.indexCapacity });
    // The replay reads the OLD mesh, not a retained CPU copy of the
    // placements: matrix out, matrix in, and the two data texels with it.
    const oldData = old.data.image.data as Float32Array;
    const freshData = fresh.data.image.data as Float32Array;
    const stride = BATCH_DATA_TEXELS * 4;
    for (const rung of [...old.rungs]) {
      for (let p = 0; p < rung.partBatches.length; p++) {
        if (rung.partBatches[p] !== old) continue;
        rung.partBatches[p] = fresh;
        const spec = rung.partSpecs[p];
        let geometryId = fresh.geometryIds.get(spec.geometryKey);
        if (geometryId === undefined) {
          geometryId = fresh.mesh.addGeometry(spec.geometry);
          fresh.geometryIds.set(spec.geometryKey, geometryId);
        }
        // Ids are rewritten IN PLACE, so every tile's slice of this array
        // carries the new ids without anything being rebuilt.
        const ids = rung.ids[p];
        for (let i = 0; i < ids.length; i++) {
          const oldId = ids[i];
          const newId = fresh.mesh.addInstance(geometryId);
          old.mesh.getMatrixAt(oldId, matrix);
          fresh.mesh.setMatrixAt(newId, matrix);
          const from = oldId * stride;
          const to = newId * stride;
          for (let k = 0; k < stride; k++) freshData[to + k] = oldData[from + k];
          fresh.mesh.setVisibleAt(newId, false);
          ids[i] = newId;
        }
        fresh.used += ids.length;
        fresh.rungs.add(rung);
      }
      old.rungs.delete(rung);
    }
    // The replay is a whole-batch rewrite, so this upload is not the
    // per-species one `addCopies` deliberately leaves to the caller.
    fresh.data.needsUpdate = true;
    root.current?.remove(old.mesh);
    old.mesh.dispose();
    old.data.dispose();
    return fresh;
  }

  /** Switch every visible tile of a rung off (the state bookkeeping with it). */
  function hideRung(rung: CellRungEntry): void {
    // Every tile, not just the visible ones: a tile with a queued ON flip must
    // lose it here, or the queue would reach instances this rung is about to
    // delete or replay into a fresh mesh. `applyTile` is idempotent.
    for (let t = 0; t < GATE_TILE_COUNT; t++) {
      rung.state[t] = 0;
      applyTile(rung, t, false);
    }
    rung.onTiles = 0;
  }

  /**
   * Add one species × rung × part's copies to a batch, writing their ids into
   * `ids` IN PLACE so the per-tile subarray views survive a batch growth.
   *
   * The caller marks `batch.data` dirty ONCE per cell (a `needsUpdate` here
   * re-uploads the whole RGBA32F texture per species × rung × part).
   */
  function addCopies(
    batch: Batch,
    geometryKey: string,
    geometry: THREE.BufferGeometry,
    sb: CellSpeciesBuild,
    rungIndex: number,
    ids: Int32Array,
  ): Int32Array {
    let geometryId = batch.geometryIds.get(geometryKey);
    if (geometryId === undefined) {
      geometryId = batch.mesh.addGeometry(geometry);
      batch.geometryIds.set(geometryKey, geometryId);
    }
    const rung = sb.rungs[rungIndex];
    for (let i = 0; i < sb.count; i++) {
      const id = batch.mesh.addInstance(geometryId);
      const at = i * 7;
      position.set(sb.placements[at], sb.placements[at + 1], sb.placements[at + 2]);
      euler.set(sb.placements[at + 3], sb.placements[at + 4], sb.placements[at + 5], "YXZ");
      quaternion.setFromEuler(euler);
      scaleVec.setScalar(sb.placements[at + 6]);
      batch.mesh.setMatrixAt(id, matrix.compose(position, quaternion, scaleVec));
      // The card rung never sways, whatever the species does.
      const stiffness = batch.isCard ? -1 : sb.windTune[i * 2];
      writeBatchInstance(
        batch.data, id, rung.band, stiffness, sb.windTune[i * 2 + 1]);
      batch.mesh.setVisibleAt(id, false);
      ids[i] = id;
    }
    batch.used += sb.count;
    return ids;
  }

  /** One cell-build job step's main-thread cost; also rolled into the DEV
   * per-frame `buildStepMs` counter, which is what a stutter shows up in. */
  function buildStepElapsed(segmentStart: number): number {
    const dt = performance.now() - segmentStart;
    if (import.meta.env.DEV) counters.current.buildStepMs += dt;
    return dt;
  }

  /**
   * Switch one tile's copies on or off across every part it spans, NOW. Only
   * for the structural paths (a rung being hidden before a drop or a batch
   * growth), which cannot wait for the queue; the gate pass enqueues instead.
   */
  function applyTile(rung: CellRungEntry, tile: number, visible: boolean): void {
    if (import.meta.env.DEV) counters.current.flipTiles++;
    const from = rung.tileOffsets[tile];
    const to = rung.tileOffsets[tile + 1];
    const parts = rung.partBatches.length;
    for (let p = 0; p < parts; p++) {
      const batch = rung.partBatches[p];
      const queued = pendingFlips.current.get(batch);
      if (queued) {
        const tiles = queued.get(rung);
        if (tiles) {
          tiles.delete(tile);
          if (tiles.size === 0) queued.delete(rung);
        }
        if (queued.size === 0) pendingFlips.current.delete(batch);
      }
      const at = tile * parts + p;
      if (rung.appliedParts[at] === (visible ? 1 : 0)) continue;
      const ids = rung.ids[p];
      for (let i = from; i < to; i++) batch.mesh.setVisibleAt(ids[i], visible);
      batch.visibleCopies += visible ? to - from : from - to;
      rung.appliedParts[at] = visible ? 1 : 0;
      if (import.meta.env.DEV) {
        counters.current.flipInstances += to - from;
        flippedBatches.current.add(batch);
      }
    }
  }

  /** Queue one tile's desired visibility; last write wins, and a write that
   * matches what the meshes already hold cancels the entry. */
  function enqueueTile(
    gateRung: GateRung, tile: number, visible: boolean,
  ): void {
    const rung = gateRung as CellRungEntry;
    if (import.meta.env.DEV) counters.current.flipTiles++;
    const parts = rung.partBatches.length;
    for (let p = 0; p < parts; p++) {
      const batch = rung.partBatches[p];
      let queued = pendingFlips.current.get(batch);
      if (rung.appliedParts[tile * parts + p] === (visible ? 1 : 0)) {
        const tiles = queued?.get(rung);
        if (tiles) {
          tiles.delete(tile);
          if (tiles.size === 0) queued!.delete(rung);
          if (queued!.size === 0) pendingFlips.current.delete(batch);
        }
        continue;
      }
      if (!queued) {
        queued = new Map<CellRungEntry, Map<number, boolean>>();
        pendingFlips.current.set(batch, queued);
      }
      let tiles = queued.get(rung);
      if (!tiles) { tiles = new Map<number, boolean>(); queued.set(rung, tiles); }
      tiles.set(tile, visible);
    }
  }

  /**
   * Apply queued flips until `FLIP_BUDGET_MS` of this frame is spent, or the
   * queue is empty — at least one batch always. A `setVisibleAt` is cheap on
   * its own, but the batch it touches is re-walked and its indirect texture
   * re-uploaded before the next draw, so what has to be bounded is TIME, not
   * a batch count. Batches that turn something ON go first, then the nearest,
   * so the resident set is always a superset of what the shader is about to
   * read.
   */
  function drainFlips(eye: THREE.Vector3): void {
    const queue = pendingFlips.current;
    if (queue.size === 0) return;
    const order: { batch: Batch; on: number; d: number }[] = [];
    for (const [batch, rungs] of queue) {
      let on = 0;
      let nearest = Infinity;
      for (const [rung, tiles] of rungs) {
        for (const [tile, visible] of tiles) {
          if (visible) on = 1;
          const d = rangeDistances(
            tileBox(rung.tileBounds, tile, rung.reachM, gateBox.current),
            eye.x, eye.z).dMin;
          if (d < nearest) nearest = d;
        }
      }
      order.push({ batch, on, d: nearest });
    }
    order.sort((a, b) => (b.on - a.on) || (a.d - b.d));
    const deadline = performance.now() + FLIP_BUDGET_MS;
    for (let i = 0; i < order.length; i++) {
      if (i > 0 && performance.now() > deadline) break;
      applyBatchFlips(order[i].batch);
    }
  }

  function applyBatchFlips(batch: Batch): void {
    const rungs = pendingFlips.current.get(batch);
    pendingFlips.current.delete(batch);
    if (!rungs) return;
    for (const [rung, tiles] of rungs) {
      const parts = rung.partBatches.length;
      for (const [tile, visible] of tiles) {
        const from = rung.tileOffsets[tile];
        const to = rung.tileOffsets[tile + 1];
        for (let p = 0; p < parts; p++) {
          if (rung.partBatches[p] !== batch) continue;
          const at = tile * parts + p;
          if (rung.appliedParts[at] === (visible ? 1 : 0)) continue;
          const ids = rung.ids[p];
          for (let i = from; i < to; i++) batch.mesh.setVisibleAt(ids[i], visible);
          batch.visibleCopies += visible ? to - from : from - to;
          rung.appliedParts[at] = visible ? 1 : 0;
          if (import.meta.env.DEV) counters.current.flipInstances += to - from;
        }
      }
    }
    if (import.meta.env.DEV) flippedBatches.current.add(batch);
  }

  /**
   * Fill ONE built species into the batches — the GPU half of the work, done
   * in the same frame-work step as that species' build. Every batch it touches
   * was reserved before the cell started, so nothing grows here.
   */
  function fillSpecies(
    cell: Cell,
    sb: CellSpeciesBuild,
    liveKit: FloraKit,
    touched: Set<Batch>,
  ): CellSpeciesEntry | null {
    {
      const entry = liveKit.get(sb.species);
      const params = speciesParams.get(sb.species);
      if (!entry || !params) return null;
      const margin = params.reachM * sb.maxScale;
      const speciesEntry: CellSpeciesEntry = {
        key: `${cell.key}|${sb.species}`,
        cell: cell.key,
        species: sb.species,
        maxDraw: params.maxDraw,
        reachM: params.reachM,
        cellBox: {
          minX: sb.minX - margin, minZ: sb.minZ - margin,
          maxX: sb.maxX + margin, maxZ: sb.maxZ + margin,
        },
        rungs: [],
        near: sb.rungs.length > 0,
        instMinY: Infinity,
        instMaxY: -Infinity,
      };
      // Instance Y from the non-empty gate tiles (an empty tile is all zero
      // and would drag the range to 0 m).
      for (let t = 0; t < CELL_TILES * CELL_TILES; t++) {
        if (sb.tileOffsets[t + 1] === sb.tileOffsets[t]) continue;
        const b = t * TILE_BOUNDS_STRIDE;
        if (sb.tileBounds[b + 1] < speciesEntry.instMinY) {
          speciesEntry.instMinY = sb.tileBounds[b + 1];
        }
        if (sb.tileBounds[b + 4] > speciesEntry.instMaxY) {
          speciesEntry.instMaxY = sb.tileBounds[b + 4];
        }
      }
      for (let rungIndex = 0; rungIndex < sb.rungs.length; rungIndex++) {
        const rung = sb.rungs[rungIndex];
        const level = Math.min(entry.levels.length - 1, rung.level);
        const isCard = entry.billboardIndex !== null && level === entry.billboardIndex;
        const near = rungIndex === 0;
        const parts = entry.levels[level].parts;
        const partBatches: Batch[] = [];
        const partIds: Int32Array[] = [];
        const partSpecs: ReplaySpec[] = [];
        const partTriangles: number[] = [];
        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
          const part = parts[partIndex];
          const batch = batches.current.get(batchKeyFor(
            part.material, part.depthMaterial, part.geometry, near, isCard))!;
          touched.add(batch);
          const geometryKey = `${sb.species}|${level}|${partIndex}`;
          const ids = addCopies(
            batch, geometryKey, part.geometry, sb, rungIndex,
            new Int32Array(sb.count));
          partBatches.push(batch);
          partIds.push(ids);
          partSpecs.push({ geometryKey, geometry: part.geometry });
          const idx = part.geometry.getIndex();
          partTriangles.push(
            (idx ? idx.count : part.geometry.attributes.position.count) / 3);
        }
        // The gate's tiles are the build's own CSR arrays, shared by
        // reference: the rung adds only its applied-state bytes.
        let trianglesPerInstance = 0;
        for (const tris of partTriangles) trianglesPerInstance += tris;
        const rungEntry: CellRungEntry = {
          band: rung.band, near,
          tileOffsets: sb.tileOffsets,
          tileBounds: sb.tileBounds,
          state: new Uint8Array(GATE_TILE_COUNT),
          ids: partIds,
          copies: sb.count * partIds.length,
          triangles: sb.count * trianglesPerInstance,
          trianglesPerInstance,
          onTiles: 0,
          level, isCard, species: sb.species, reachM: params.reachM,
          partBatches, partSpecs,
          appliedParts: new Uint8Array(GATE_TILE_COUNT * partIds.length),
        };
        for (const batch of partBatches) batch.rungs.add(rungEntry);
        speciesEntry.rungs.push(rungEntry);
      }
      // Initial visibility is applied HERE, not queued: a fresh cell's copies
      // are all invisible, so every tile the camera can already see would sit
      // in the drain queue behind whatever else is flipping — the tens of
      // seconds of `pending` the owner saw at first load. The queue is for
      // LATER changes only.
      if (Number.isFinite(cameraPos.current.x)) {
        gateSpecies([speciesEntry], cameraPos.current, cameraFwd.current,
          applyTile as (rung: GateRung, tile: number, visible: boolean) => void,
          fillStats.current);
      }
      return speciesEntry;
    }
  }

  /** The frame-work label seen most often over the rolling window. The queue
   * reports which jobs are pending, not how long each took, so frequency is
   * the signal available. */
  function topQueueLabel(): string {
    let top = "-";
    let best = 0;
    for (const [label, count] of queueLabels.current) {
      if (count > best) { best = count; top = label; }
    }
    return top;
  }

  function publishStats(): void {
    // The visible copies and triangles are what the GATING LOOP counted this
    // frame; nothing is re-walked for them.
    const instances = gateStats.current.visibleCopies;
    const triangles = gateStats.current.visibleTriangles;
    const total = copiesTotal.current;
    let billboardInstances = 0;
    const bySpecies: VegetationStats["bySpecies"] = {};
    let draws = 0;
    for (const batch of batches.current.values()) if (batch.visibleCopies > 0) draws++;
    let cellsPending = 0;
    for (const cell of cells.current.values()) {
      if (!cell.build || jobs.current.has(cell.key)) cellsPending++;
    }
    // A per-species breakdown only a debug panel reads: a walk over tile
    // STATE bytes, no distance maths, once every 60 frames.
    for (const entry of allSpecies.current) {
      let drawn = 0;
      for (const rung of entry.rungs) {
        let onCopies = 0;
        if (rung.onTiles > 0) {
          const parts = rung.ids.length;
          for (let t = 0; t < GATE_TILE_COUNT; t++) {
            if ((rung.state[t] & 1) === 0) continue;
            onCopies += (rung.tileOffsets[t + 1] - rung.tileOffsets[t]) * parts;
          }
        }
        drawn += onCopies;
        if (rung.isCard) billboardInstances += onCopies;
      }
      if (drawn === 0) continue;
      const seen = bySpecies[entry.species]
        ?? (bySpecies[entry.species] = { drawn: 0, minY: Infinity, maxY: -Infinity });
      seen.drawn += drawn;
      if (entry.instMinY < seen.minY) seen.minY = entry.instMinY;
      if (entry.instMaxY > seen.maxY) seen.maxY = entry.instMaxY;
    }
    // Like-for-like with the old path: INSTANCES in hidden mask cells, not
    // the count of hidden texels.
    let occluded = 0;
    for (const [id, count] of occupiedCells.current) {
      const cx = Math.floor(id / 65536) - 32768;
      const cz = id - (cx + 32768) * 65536 - 32768;
      if (mask.hidden((cx + 0.5) * OCCLUSION_CELL_M, (cz + 0.5) * OCCLUSION_CELL_M)) {
        occluded += count;
      }
    }
    const stats: VegetationStats = {
      chunks: cells.current.size,
      instances,
      draws,
      drawsFallback: instances,
      triangles: Math.round(triangles),
      culled: Math.max(0, total - instances),
      billboardInstances,
      occluded,
      bySpecies,
      rebuildMs: counters.current.lastBuild,
      cellBuilds: counters.current.builds,
      cellRebuilds: registry.current.rebuilds,
      cellRebuildReasons: { ...registry.current.reasons },
      gatingMs: Math.round(counters.current.gatingMs * 1000) / 1000,
      gatingMaxMs: Math.round(counters.current.gatingMaxMs * 1000) / 1000,
      maskMs: Math.round(counters.current.maskMs * 1000) / 1000,
      batches: batches.current.size,
      copiesTotal: total,
      cellsPending,
      frame: counters.current.frame,
      flipTiles: counters.current.flipTiles,
      flipTilesMax: counters.current.flipTilesMax,
      flipInstances: counters.current.flipInstances,
      flipInstancesMax: counters.current.flipInstancesMax,
      batchesTouched: counters.current.batchesTouched,
      batchesTouchedMax: counters.current.batchesTouchedMax,
      pendingBatches: pendingFlips.current.size,
      flipMs: Math.round(counters.current.flipMs * 1000) / 1000,
      flipMaxMs: Math.round(counters.current.flipMaxMs * 1000) / 1000,
      queueMs: Math.round(counters.current.queueMs * 1000) / 1000,
      queueMaxMs: Math.round(counters.current.queueMaxMs * 1000) / 1000,
      queueTop: topQueueLabel(),
      fps: fps.current.value,
      buildStepMs: Math.round(counters.current.buildStepMs * 1000) / 1000,
      buildStepMaxMs: Math.round(counters.current.buildStepMaxMs * 1000) / 1000,
    };
    onStats?.(stats);
    (window as unknown as { __STUDIO_VEGETATION_DEBUG__?: VegetationStats })
      .__STUDIO_VEGETATION_DEBUG__ = stats;
  }

  void revision;
  return <group ref={root} name="vegetation" />;
}
