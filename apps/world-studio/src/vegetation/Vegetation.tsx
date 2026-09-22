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
 * Copies live in batches keyed by material, and inside a batch in one
 * `THREE.InstancedMesh` per kit geometry: one instanced draw per species part
 * (decision 0084 round 12). Its visible copies are a COMPACT PREFIX of the
 * instance buffer — switching a copy on appends it, switching one off swaps
 * the last copy into its row — so `count` is the draw and nothing per copy is
 * submitted. Per frame the CPU does three small things and nothing else:
 *   1. hierarchical gating — cell, then 58 m tile — switching whole runs of
 *      copies on and off in that prefix;
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
import {
  disposeSlotGeometry,
  makeSlotGeometry,
} from "@elder-souls/game-core/vegetation/slotGeometry";
import { OcclusionMask } from "@elder-souls/game-core/vegetation/occlusionMask";
import { compactRows } from "@elder-souls/game-core/vegetation/compactRows";
import {
  clearUploadSpans,
  markUploadRow,
  newUploadSpans,
  type UploadSpans,
} from "@elder-souls/game-core/vegetation/uploadSpans";
import {
  castsShadowFor as castsShadowRule,
  type ShadowRung,
} from "./shadowRule";
import { lastWeatherSample } from "../weather/weatherState";
import { useFloraKit, useColliderShapes } from "./useFloraKit";
import { useFrameWork } from "@elder-souls/game-core/scheduling/frameWorkContext";
import { useFrameSegments } from "@elder-souls/game-core/fx/frameSegments";
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
  /** Main-pass triangles split by the rung that drew them: `near` = kit level
   * 0 (full mesh), `mid` = level 1, `far` = level 2 and beyond, `card` = the
   * billboard. Derived from the tile STATE bytes in the same 60-frame walk as
   * `bySpecies`, so these are GATING numbers: they count what the gate left
   * visible, not what the driver drew, and will not exactly equal the
   * draw-measured `veg` bucket of HUD line 3. */
  trianglesByRung: { near: number; mid: number; far: number; card: number };
  /** The LAST CELL BUILD, ms: `total` is the main-thread time it actually
   * spent, summed across the frame-work pump calls it was sliced over
   * (`frames`), never the wall clock between them (`elapsedMs`). */
  rebuildMs: { total: number; frames: number; elapsedMs: number };
  /** Visible copies summed over the instanced meshes — what the pre-round-12
   * pre-round-12 batched path issued as multi-draw ranges, one per copy. */
  instancedRanges: number;
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
   * hunt, round 2): tiles whose state flipped, copies those flips switched on
   * or off, and how many batches a flip touched. */
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
/** Data-texture slots a brand-new batch reserves, whatever the first cell
 * needs, and instance rows a brand-new geometry mesh reserves. */
const MIN_BATCH_CAPACITY = 256;
const MIN_GEO_CAPACITY = 64;
/** How long a pooled geometry mesh may sit unused before it is disposed, and
 * how many may sit pooled at once across every batch: crossing several biomes
 * inside a minute would otherwise hold the union of them all at peak capacity
 * until the first idle sweep, so past the cap the oldest entries go whatever
 * their idle time (review, round 12). */
const POOL_IDLE_MS = 60_000;
const POOL_MAX_ENTRIES = 256;
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
 * batch's cost is the matrices it composes into its instance buffers and the
 * sub-uploads they force, and that cost varies by an order of magnitude
 * between batches: a fixed batch count bounded the wrong thing (owner walk
 * 2026-09-21, 15 898 flips in a frame). At least one batch is
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

/**
 * A/B switch (DEV only, `?vegorder=0`), read once at module load: batches keep
 * `renderOrder = 0`, so the frame can be measured without the front-to-back
 * batch order below.
 */
const VEG_ORDER_ENABLED: boolean = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).get("vegorder") !== "0";
})();

function chunkKey(cx: number, cz: number): string {
  return `${cx}_${cz}`;
}

function cellId(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/**
 * One kit geometry inside one batch: a single instanced draw.
 *
 * A copy owns a permanent SLOT (`0..next`), which is what the rungs' id
 * arrays hold and what indexes the CPU-side master arrays. The GPU buffers
 * are indexed by visible ORDER instead, a compact prefix of length `count`:
 * `slotOf` maps order to slot, `orderOf` maps slot to order or −1 when the
 * copy is switched off.
 */
interface GeoMesh {
  geometryKey: string;
  /** The kit's geometry, shared with every other batch that draws it. */
  source: THREE.BufferGeometry;
  /** This mesh's shallow view of it: the kit's buffers by reference plus this
   * mesh's own `esSlot` attribute. Disposed only through
   * `disposeShallowGeometry`, which drops the shared references first — a
   * plain `dispose()` would free the kit's position and index GL buffers out
   * from under every other mesh drawing the same kit geometry. */
  geometry: THREE.BufferGeometry;
  mesh: THREE.InstancedMesh;
  /** Instance rows the buffers hold. */
  capacity: number;
  /** Slots ever handed out, and the ones a dropped cell gave back. */
  next: number;
  free: number[];
  /** Per slot: the CELL RECORD's placement array it was built from and its
   * copy index in it, its data-texture slot in the batch, and its row in the
   * visible prefix (−1 when hidden).
   *
   * The transform is composed from the record on flip-on rather than kept in
   * a per-geometry CPU master: a cell owns one copy of every placement it
   * built and stays resident while it is gated (decision 0082), so a second
   * CPU copy here would double the per-copy transform memory of the whole
   * resident world (~32 MB at 500 k copies). A slot's reference is dropped
   * when the slot is freed, so a record is freed with its cell. */
  src: Array<Float32Array | null>;
  srcIndex: Int32Array;
  dataSlot: Int32Array;
  orderOf: Int32Array;
  /** `performance.now()` when this mesh entered the geometry pool; 0 while
   * it is live. Read by the idle sweep below. */
  pooledAt: number;
  /** Per visible row: the slot drawn there. */
  slotOf: Int32Array;
  /** Visible copies; kept equal to `mesh.count`. */
  count: number;
  /** Rows written since the last flush, as disjoint spans (never one
   * min..max range: a frame touches rows at both ends of the buffer). */
  dirty: UploadSpans;
}

/** One species × rung of one cell, tiled, with the instances it owns. The
 * tiles are the flat arrays of `GateRung`; nothing per tile is allocated. */
interface CellRungEntry extends GateRung {
  level: number;
  isCard: boolean;
  species: string;
  /** The species' kit reach, for a tile's box (`tileBox`). */
  reachM: number;
  /** One batch and one instanced mesh per kit part. */
  partBatches: Batch[];
  partGeo: GeoMesh[];
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
  /** One instanced draw per kit geometry, by `species|level|part`. */
  geometries: Map<string, GeoMesh>;
  geoList: GeoMesh[];
  /** Geometry meshes nothing allocates from any more, kept out of the scene
   * at `count = 0` with their `esSlot`/`instanceMatrix` capacity intact.
   * Walking the province evicts and re-enters the same cells, so `geoFor`
   * takes from here rather than building (and later leaking) a new mesh. */
  geometryPool: Map<string, GeoMesh>;
  material: THREE.Material;
  depthMaterial: THREE.Material | undefined;
  /** Data-texture slots: the capacity, the high-water mark and the slots
   * dropped cells gave back. */
  capacity: number;
  nextData: number;
  freeData: number[];
  data: THREE.DataTexture;
  near: boolean;
  isCard: boolean;
  /** This batch's rung is the one that casts the sun shadow (`batchKeyFor`). */
  casts: boolean;
  /** Whether its depth material was patched with `shadowBandFromZero`. */
  fromZero: boolean;
  /** Nearest visible tile this gating pass saw, in metres; Infinity when the
   * batch showed nothing. Drives the meshes' `renderOrder` (front to back). */
  orderMin: number;
  /** The render order its meshes currently hold, so a mesh created later in
   * the same batch inherits it. */
  renderOrder: number;
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
  /** Only what the renderer still needs after the build. The per-copy
   * placements are NOT dropped: each geometry slot holds a reference to the
   * species' placement array (`GeoMesh.src`), which is the one copy of the
   * cell's transforms and is freed when the cell gives its slots back. */
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
  const segments = useFrameSegments();
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
  const lastPoolSweep = useRef(0);
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
  /** Geometry meshes whose instance rows changed since the last flush; the
   * flush turns each one's touched span into a single upload range. */
  const dirtyGeos = useRef(new Set<GeoMesh>());
  /** Meshes whose attributes carry a pending WHOLE-buffer upload this frame
   * (an empty update-range list), so the second flush leaves them alone. */
  const allPending = useRef(new Set<GeoMesh>());
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
      // meshes with no owner and no parent.
      for (const job of [...liveJobs.values()]) job.cancel();
      liveJobs.clear();
      for (const batch of live.values()) {
        // The kit's GLTF is cached by `useLoader` and shared with
        // `VegetationCells`, so it OUTLIVES this component: its buffers must
        // survive. Each shallow view's own `esSlot` still goes, through the
        // strip-then-dispose helper.
        for (const geo of [...batch.geoList, ...batch.geometryPool.values()]) {
          group?.remove(geo.mesh);
          disposeShallowGeometry(geo);
        }
        batch.geometryPool.clear();
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
      const rings = lodRings(entry.heightM, drawScale, entry.submerged, entry.folded);
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
    casts: boolean,
    fromZero: boolean,
  ) => `${material.uuid}|${depthMaterial?.uuid ?? "-"}|${attributeSignature(geometry)}`
    + `|${near ? "near" : "far"}|${isCard ? "card" : "mesh"}`
    + `|${casts ? "cast" : "nocast"}|${fromZero ? "fromzero" : "ownband"}`;

  /**
   * The shadow rule lives in `shadowRule.ts` (highest non-card level ≤ 1);
   * here it is only gated by the DEV `?vegshadow=0` switch.
   */
  const castsShadowFor = (
    rungs: readonly ShadowRung[] | undefined,
    maxLevel: number,
    cardIndex: number | null,
    level: number,
  ): boolean => VEG_CAST_SHADOW && castsShadowRule(rungs, maxLevel, cardIndex, level);

  /**
   * `shadowBandFromZero` is needed only when the caster is level 1: a level-0
   * caster's own band already starts at zero.
   */
  const shadowFromZeroFor = (casts: boolean, level: number): boolean => casts && level === 1;

  const makeBatch = (
    key: string,
    material: THREE.Material,
    depthMaterial: THREE.Material | undefined,
    near: boolean,
    isCard: boolean,
    casts: boolean,
    fromZero: boolean,
    capacity: number,
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
        if (VEG_SHADER_MODE !== "wind") {
          // Only a casting batch's depth material takes `shadowBandFromZero`
          // (the mid-rung shadow rule above); the colour material is never
          // flagged, and `casts` is part of the batch key, so the flagged
          // depth clone is its own instance.
          applyLodFadeWithShadow(clone, depthClone, lodFade,
            { shadowBandFromZero: fromZero });
        }
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
    return {
      key, geometries: new Map(), geoList: [], geometryPool: new Map(),
      material: clone, depthMaterial: depthClone,
      capacity, nextData: 0, freeData: [],
      data, near, isCard, casts, fromZero,
      orderMin: Infinity, renderOrder: 0, rungs: new Set(),
    };
  };

  /**
   * A shallow view of a kit geometry plus this mesh's own `esSlot` attribute
   * (the shared helper: see `slotGeometry.ts` for why a view and not a
   * clone). `InstancedMesh.dispose()` frees `instanceMatrix`/`instanceColor`
   * only, never the view — that goes through `disposeShallowGeometry`.
   */
  const slotGeometry = (
    source: THREE.BufferGeometry, capacity: number,
  ): THREE.BufferGeometry => {
    const slots = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity), 1);
    // Both instance buffers are rewritten row by row as copies are switched
    // on and off, never once at upload.
    slots.setUsage(THREE.DynamicDrawUsage);
    return makeSlotGeometry(source, { esSlot: slots });
  };

  /** Free one geometry mesh's owned buffers: its `esSlot` view and the
   * instance matrix. The kit's shared buffers survive. */
  const disposeShallowGeometry = (geo: GeoMesh): void => {
    geo.mesh.dispose();
    disposeSlotGeometry(geo.geometry, geo.source);
  };

  const configureGeoMesh = (batch: Batch, mesh: THREE.InstancedMesh): void => {
    mesh.frustumCulled = false;            // gated by distance, never culled
    // Shadows come from the casting rung only — see `batchKeyFor`'s shadow
    // rule. Before it the near (full-mesh) rung cast, and the shadow cascades
    // drew nearly as many triangles as the whole main pass.
    mesh.castShadow = batch.casts;
    mesh.receiveShadow = !batch.isCard;
    if (batch.depthMaterial) mesh.customDepthMaterial = batch.depthMaterial;
    mesh.userData.perfTag = "veg";
    mesh.renderOrder = batch.renderOrder;
    mesh.count = 0;
  };

  const makeGeo = (
    batch: Batch,
    geometryKey: string,
    source: THREE.BufferGeometry,
    need: number,
  ): GeoMesh => {
    const capacity = Math.max(MIN_GEO_CAPACITY, Math.ceil(need * 1.5));
    const geometry = slotGeometry(source, capacity);
    const mesh = new THREE.InstancedMesh(geometry, batch.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    configureGeoMesh(batch, mesh);
    root.current?.add(mesh);
    return {
      geometryKey, source, geometry, mesh, capacity,
      pooledAt: 0, next: 0, free: [],
      src: new Array<Float32Array | null>(capacity).fill(null),
      srcIndex: new Int32Array(capacity),
      dataSlot: new Int32Array(capacity),
      orderOf: new Int32Array(capacity).fill(-1),
      slotOf: new Int32Array(capacity),
      count: 0, dirty: newUploadSpans(),
    };
  };

  /**
   * Re-create one geometry's mesh at 1.5×. SLOT IDS SURVIVE, so nothing is
   * replayed and no rung is touched: the visible prefix is copied across row
   * for row and the CPU master arrays are copied slot for slot.
   */
  const growGeo = (batch: Batch, geo: GeoMesh, need: number): void => {
    const capacity = Math.max(MIN_GEO_CAPACITY, Math.ceil((geo.next + need) * 1.5));
    const geometry = slotGeometry(geo.source, capacity);
    const mesh = new THREE.InstancedMesh(geometry, batch.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    configureGeoMesh(batch, mesh);
    (mesh.instanceMatrix.array as Float32Array).set(
      (geo.mesh.instanceMatrix.array as Float32Array).subarray(0, geo.count * 16));
    (geometry.getAttribute("esSlot").array as Float32Array).set(
      (geo.geometry.getAttribute("esSlot").array as Float32Array)
        .subarray(0, geo.count));
    mesh.count = geo.count;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.getAttribute("esSlot").needsUpdate = true;
    root.current?.add(mesh);
    root.current?.remove(geo.mesh);
    // The old mesh's own buffers go: `instanceMatrix` and the old `esSlot`,
    // dropped after the kit's shared references, so nothing else's buffers go
    // with it. The stripped geometry object itself is then garbage.
    disposeShallowGeometry(geo);
    const src = new Array<Float32Array | null>(capacity).fill(null);
    for (let i = 0; i < geo.src.length; i++) src[i] = geo.src[i];
    const srcIndex = new Int32Array(capacity);
    srcIndex.set(geo.srcIndex);
    const dataSlot = new Int32Array(capacity);
    dataSlot.set(geo.dataSlot);
    const orderOf = new Int32Array(capacity).fill(-1);
    orderOf.set(geo.orderOf);
    const slotOf = new Int32Array(capacity);
    slotOf.set(geo.slotOf);
    geo.geometry = geometry;
    geo.mesh = mesh;
    geo.capacity = capacity;
    geo.src = src;
    geo.srcIndex = srcIndex;
    geo.dataSlot = dataSlot;
    geo.orderOf = orderOf;
    geo.slotOf = slotOf;
    // The rows are in a brand-new pair of buffers, so every pending span
    // names a row of a buffer that no longer exists: the whole prefix is what
    // needs uploading, and the flush at the end of the frame does it.
    clearUploadSpans(geo.dirty);
    geo.dirty.all = true;
    dirtyGeos.current.add(geo);
  };

  const geoFor = (
    batch: Batch,
    geometryKey: string,
    source: THREE.BufferGeometry,
    need: number,
  ): GeoMesh => {
    let geo = batch.geometries.get(geometryKey);
    if (!geo) {
      // A pooled mesh keeps its buffers and its capacity; only the slot
      // bookkeeping is reset (it handed every slot back before it was
      // pruned). Its capacity is whatever the cell that pruned it needed, so
      // the growth check below runs on it too.
      const pooled = batch.geometryPool.get(geometryKey);
      if (pooled) {
        batch.geometryPool.delete(geometryKey);
        pooled.pooledAt = 0;
        pooled.next = 0;
        pooled.free.length = 0;
        pooled.count = 0;
        // Through the same configure as a fresh mesh: `batch.renderOrder` can
        // have moved while this one sat in the pool, and nothing else rewrites
        // it once the batch's order stops changing.
        configureGeoMesh(batch, pooled.mesh);
        pooled.orderOf.fill(-1);
        pooled.src.fill(null);
        clearUploadSpans(pooled.dirty);
        root.current?.add(pooled.mesh);
        geo = pooled;
      } else {
        geo = makeGeo(batch, geometryKey, source, need);
      }
      batch.geometries.set(geometryKey, geo);
      batch.geoList.push(geo);
    }
    if (geo.next - geo.free.length + need > geo.capacity) {
      growGeo(batch, geo, need);
    }
    return geo;
  };

  // ---- the frame ----------------------------------------------------------

  useFrame((state) => {
    // Vegetation gate stage of the frame (decision 0084 round 10).
    segments?.cpuMark("veg");
    // Site (a): everything the frame-work pump moved since the last render.
    // The previous frame's render consumed its upload ranges, so the
    // whole-buffer marks expire here.
    allPending.current.clear();
    flushAllDirty();
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

    // The pool bounds churn at a biome edge, where the same geometries are
    // dropped and re-entered every few seconds; the idle rule bounds its
    // memory to what was actually used in the last minute.
    const now = performance.now();
    if (now - lastPoolSweep.current >= 1000) {
      lastPoolSweep.current = now;
      const pooled: Array<{ batch: Batch; key: string; geo: GeoMesh }> = [];
      for (const batch of batches.current.values()) {
        for (const [key, geo] of [...batch.geometryPool]) {
          if (now - geo.pooledAt < POOL_IDLE_MS) {
            pooled.push({ batch, key, geo });
            continue;
          }
          batch.geometryPool.delete(key);
          disposeShallowGeometry(geo);
        }
      }
      if (pooled.length > POOL_MAX_ENTRIES) {
        pooled.sort((a, b) => a.geo.pooledAt - b.geo.pooledAt);
        for (let i = 0; i < pooled.length - POOL_MAX_ENTRIES; i++) {
          const { batch, key, geo } = pooled[i];
          batch.geometryPool.delete(key);
          disposeShallowGeometry(geo);
        }
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
      // Front to back across batches: three sorts opaques by renderOrder
      // ascending before material, so the nearest batch draws first and its
      // depth rejects the far foliage behind it instead of shading it twice.
      // The distances are the ones this pass already computes, and the two
      // loops below are over the ~120 batches, not over their copies.
      if (VEG_ORDER_ENABLED) {
        for (const batch of batches.current.values()) batch.orderMin = Infinity;
        gateSpecies(allSpecies.current, eye, fwd, enqueueTile,
          gateStats.current, undefined, markOrder);
        for (const batch of batches.current.values()) {
          if (batch.orderMin === Infinity) continue;
          const next = Math.round(batch.orderMin);
          if (batch.renderOrder === next) continue;
          batch.renderOrder = next;
          for (const geo of batch.geoList) geo.mesh.renderOrder = next;
        }
      } else {
        gateSpecies(allSpecies.current, eye, fwd, enqueueTile, gateStats.current);
      }
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

    // Site (b): this frame's gate pass, flip drain and eviction, pushed
    // before r3f renders.
    flushAllDirty();

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
    // Geometries touched this call: pruned below once nothing allocates from
    // them any more, so an emptied cell does not leave a permanent
    // zero-count mesh parented in the scene (review, round 12).
    const touched = new Map<GeoMesh, Batch>();
    for (const entry of entries) {
      for (const rung of entry.rungs) {
        hideRung(rung);   // keeps the per-batch visible counters honest
        for (let p = 0; p < rung.partBatches.length; p++) {
          const batch = rung.partBatches[p];
          const geo = rung.partGeo[p];
          const ids = rung.ids[p];
          // Both slot kinds go back on their free lists: the copy's row in
          // the instance buffers, and its texel pair in the data texture.
          for (let i = 0; i < ids.length; i++) {
            const slot = ids[i];
            setSlotVisible(geo, slot, false);
            batch.freeData.push(geo.dataSlot[slot]);
            geo.src[slot] = null;   // the cell's placements go with its slots
            geo.free.push(slot);
          }
          batch.rungs.delete(rung);
          touched.set(geo, batch);
        }
        rung.partBatches = [];
        rung.partGeo = [];
        rung.ids = [];
      }
      entry.rungs = [];
    }
    for (const [geo, batch] of touched) {
      if (geo.next - geo.free.length > 0) continue;
      // Nothing allocates from this geometry any more: drop it rather than
      // keep a permanent, always-visited zero-count mesh in the scene graph.
      // POOLED, never disposed. Disposing would have to free the shallow
      // geometry too, and rebuilding it on the next entry re-uploads this
      // kit mesh's `esSlot` and instance matrices from scratch; the province
      // walk re-enters the same cells constantly. Out of the scene at
      // `count = 0` it costs nothing per frame and keeps its capacity.
      root.current?.remove(geo.mesh);
      geo.mesh.count = 0;
      geo.count = 0;
      clearUploadSpans(geo.dirty);
      geo.pooledAt = performance.now();
      batch.geometryPool.set(geo.geometryKey, geo);
      dirtyGeos.current.delete(geo);
      allPending.current.delete(geo);
      batch.geometries.delete(geo.geometryKey);
      const idx = batch.geoList.indexOf(geo);
      if (idx >= 0) batch.geoList.splice(idx, 1);
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
      // A cancelled or unmounted owner must not get fresh meshes.
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
    casts: boolean;
    /** Whether this key's depth material takes `shadowBandFromZero`. */
    fromZero: boolean;
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
      const casts = castsShadowFor(
        sb.rungs, entry.levels.length - 1, entry.billboardIndex, level);
      const fromZero = shadowFromZeroFor(casts, level);
      const keys: string[] = [];
      for (const part of entry.levels[level].parts) {
        const key = batchKeyFor(
          part.material, part.depthMaterial, part.geometry,
          near, isCard, casts, fromZero);
        if (!specs.has(key)) {
          specs.set(key, {
            material: part.material, depthMaterial: part.depthMaterial,
            near, isCard, casts, fromZero,
          });
        }
        keys.push(key);
      }
      return keys;
    });
    return { needs, specs };
  }

  /**
   * Make room in the DATA TEXTURE of every batch this cell will touch. The
   * per-geometry instance buffers grow on demand instead (`geoFor`), because
   * a geometry growth leaves every slot id where it was.
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
          key, spec.material, spec.depthMaterial,
          spec.near, spec.isCard, spec.casts, spec.fromZero,
          Math.max(MIN_BATCH_CAPACITY, Math.ceil(need * 1.5))));
      } else if (batch.nextData + Math.max(0, need - batch.freeData.length)
                 > batch.capacity) {
        growBatchData(batch, need);
      }
    }
  }

  /**
   * Re-create one batch's per-slot data texture at 1.5×, copying it texel for
   * texel. Slot ids are unchanged, so nothing else moves; the materials own
   * the uniform, so it is re-pointed there.
   */
  function growBatchData(batch: Batch, need: number): void {
    const capacity = Math.max(
      MIN_BATCH_CAPACITY, Math.ceil((batch.nextData + need) * 1.5));
    const data = createBatchDataTexture(capacity);
    (data.image.data as Float32Array).set(
      (batch.data.image.data as Float32Array)
        .subarray(0, batch.nextData * BATCH_DATA_TEXELS * 4));
    data.needsUpdate = true;
    batch.data.dispose();
    batch.data = data;
    batch.capacity = capacity;
    const owned = batchMaterials.current.get(batch.key);
    if (owned) owned.uniforms.esBatchData.value = data;
  }

  /** The next free data-texture slot of a batch, growing the texture if the
   * plan under-counted (a reserve is by key, a fill is by part). */
  function allocDataSlot(batch: Batch): number {
    const reused = batch.freeData.pop();
    if (reused !== undefined) return reused;
    if (batch.nextData >= batch.capacity) growBatchData(batch, MIN_BATCH_CAPACITY);
    return batch.nextData++;
  }

  /** Compose one slot's matrix from its cell record straight into `row` of a
   * mesh's instance-matrix array. */
  function composeSlot(
    geo: GeoMesh, slot: number, matrices: Float32Array, row: number,
  ): void {
    const placements = geo.src[slot];
    if (!placements) return;
    const at = geo.srcIndex[slot] * 7;
    position.set(placements[at], placements[at + 1], placements[at + 2]);
    euler.set(placements[at + 3], placements[at + 4], placements[at + 5], "YXZ");
    quaternion.setFromEuler(euler);
    scaleVec.setScalar(placements[at + 6]);
    matrix.compose(position, quaternion, scaleVec).toArray(matrices, row * 16);
  }

  /** Rows one `hideRows` call is compacting away, and the (donor, target)
   * pairs `compactRows` plans for them. Reused, so a hide allocates nothing. */
  const hideRowsScratch: number[] = [];
  const hideMoveScratch: number[] = [];

  /**
   * Hide a whole BLOCK of one geometry's copies in one compaction.
   *
   * A tile's copies were appended together, so their rows are contiguous and
   * the surviving tail slides down over them as one move: the upload is the
   * hidden block, one span, instead of the hundreds of scattered rows a
   * per-copy swap-remove writes (which collapse `markUploadRow` to a
   * whole-buffer upload past `MAX_UPLOAD_SPANS`).
   */
  function hideRows(
    geo: GeoMesh, ids: Int32Array, from: number, to: number,
  ): void {
    const rows = hideRowsScratch;
    rows.length = 0;
    for (let i = from; i < to; i++) {
      const slot = ids[i];
      const order = geo.orderOf[slot];
      if (order < 0) continue;
      rows.push(order);
      geo.orderOf[slot] = -1;
    }
    if (rows.length === 0) return;
    rows.sort((a, b) => a - b);
    const matrices = geo.mesh.instanceMatrix.array as Float32Array;
    const slots = geo.geometry.getAttribute("esSlot").array as Float32Array;
    const moves = hideMoveScratch;
    const count = compactRows(geo.count, rows, moves);
    for (let m = 0; m < moves.length; m += 2) {
      const donor = moves[m];
      const target = moves[m + 1];
      const fromAt = donor * 16;
      const toAt = target * 16;
      for (let i = 0; i < 16; i++) matrices[toAt + i] = matrices[fromAt + i];
      slots[target] = slots[donor];
      const moved = geo.slotOf[donor];
      geo.slotOf[target] = moved;
      geo.orderOf[moved] = target;
      markUploadRow(geo.dirty, target);   // only the targets are written
    }
    geo.count = count;
    geo.mesh.count = count;
    dirtyGeos.current.add(geo);
  }

  /** Switch one tile's copies of one geometry on or off. A block hide is one
   * compaction; a single copy keeps the swap-remove. Both flip paths (the
   * structural `applyTile` and the gate's `applyBatchFlips`) go through it. */
  function setTileSlots(
    geo: GeoMesh, ids: Int32Array, from: number, to: number, visible: boolean,
  ): void {
    if (!visible && to - from > 1) {
      hideRows(geo, ids, from, to);
      return;
    }
    for (let i = from; i < to; i++) setSlotVisible(geo, ids[i], visible);
  }

  /**
   * Switch one copy on or off. ON appends it to the visible prefix; OFF swaps
   * the last visible copy into its row. Both touch one row of the two
   * instance buffers and move `count`, which IS the draw.
   */
  function setSlotVisible(geo: GeoMesh, slot: number, visible: boolean): void {
    const order = geo.orderOf[slot];
    if (visible === (order >= 0)) return;
    const matrices = geo.mesh.instanceMatrix.array as Float32Array;
    const slots = geo.geometry.getAttribute("esSlot").array as Float32Array;
    let row: number;
    if (visible) {
      row = geo.count;
      composeSlot(geo, slot, matrices, row);
      slots[row] = geo.dataSlot[slot];
      geo.slotOf[row] = slot;
      geo.orderOf[slot] = row;
      geo.count++;
    } else {
      row = order;
      const last = geo.count - 1;
      if (row !== last) {
        const moved = geo.slotOf[last];
        const from = last * 16;
        const to = row * 16;
        for (let i = 0; i < 16; i++) matrices[to + i] = matrices[from + i];
        slots[row] = slots[last];
        geo.slotOf[row] = moved;
        geo.orderOf[moved] = row;
        markUploadRow(geo.dirty, row);
      }
      geo.orderOf[slot] = -1;
      geo.count--;
      // Hiding the last visible row writes nothing: it just leaves the prefix.
    }
    geo.mesh.count = geo.count;
    if (visible) markUploadRow(geo.dirty, row);
    dirtyGeos.current.add(geo);
  }

  /**
   * Push one mesh's pending row spans onto its two instance attributes as
   * upload ranges.
   *
   * `WebGLAttributes.update` calls `attribute.clearUpdateRanges()` once it has
   * issued the `bufferSubData` calls (three 0.184,
   * `node_modules/three/build/three.module.js:207`), so the ranges on the
   * attribute never accumulate across renders: what we push here is exactly
   * what this frame uploads. When the spans collapsed, the upload is the
   * VISIBLE PREFIX, not the whole array: the buffers are sized by `capacity`
   * and the rows past `count` are never drawn, so uploading them would cost
   * the 1.5x growth headroom for nothing.
   */
  function flushDirty(geo: GeoMesh): void {
    const matrixAttr = geo.mesh.instanceMatrix;
    const slotAttr = geo.geometry.getAttribute("esSlot") as THREE.BufferAttribute;
    if (geo.dirty.all || allPending.current.has(geo)) {
      // A LATER flush this frame must not put a partial range back on the
      // attribute and shrink the upload to those rows; it re-states the
      // prefix instead, because `count` can have risen since. The set is
      // cleared at the top of the frame, after the render that consumed it.
      matrixAttr.clearUpdateRanges();
      slotAttr.clearUpdateRanges();
      allPending.current.add(geo);
      if (geo.count === 0) {
        // An empty range list is three's WHOLE-BUFFER upload, so an empty
        // prefix must not reach `needsUpdate` at all: nothing is drawn from
        // these buffers until a copy flips on, and that flush states the rows.
        clearUploadSpans(geo.dirty);
        return;
      }
      matrixAttr.addUpdateRange(0, geo.count * 16);
      slotAttr.addUpdateRange(0, geo.count);
    } else {
      for (const [start, end] of geo.dirty.spans) {
        const rows = end - start + 1;
        matrixAttr.addUpdateRange(start * 16, rows * 16);
        slotAttr.addUpdateRange(start, rows);
      }
    }
    matrixAttr.needsUpdate = true;
    slotAttr.needsUpdate = true;
    clearUploadSpans(geo.dirty);
  }

  /**
   * Flush every mesh whose rows moved since the last render.
   *
   * Called twice per frame and nowhere else: three uploads attributes inside
   * `renderer.render`, which r3f runs AFTER every `useFrame` subscriber, so a
   * row whose `count` was raised and whose span was marked before that render
   * is uploaded before it is drawn. The first call (top of this component's
   * `useFrame`) covers everything the frame-work pump did since the last
   * render — cell fills and the `gateSpecies`→`applyTile` inside them. The
   * pump itself cannot run between the two: its `useFrame` is priority −100
   * (`FrameWorkProvider.tsx`, and the fly-mode fallback in
   * `frameWorkContext.ts`), which r3f sorts ahead of this component's default
   * priority 0. The second call (bottom of the same `useFrame`) covers this
   * frame's gate pass, flip drain and eviction.
   */
  function flushAllDirty(): void {
    for (const geo of dirtyGeos.current) flushDirty(geo);
    dirtyGeos.current.clear();
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
    geo: GeoMesh,
    sb: CellSpeciesBuild,
    rungIndex: number,
    ids: Int32Array,
  ): Int32Array {
    const rung = sb.rungs[rungIndex];
    for (let i = 0; i < sb.count; i++) {
      const slot = geo.free.pop() ?? geo.next++;
      const dataSlot = allocDataSlot(batch);
      geo.dataSlot[slot] = dataSlot;
      geo.orderOf[slot] = -1;               // every copy arrives switched off
      // The transform stays in the cell's own placement array; the matrix is
      // composed straight into the instance buffer when the copy flips on.
      geo.src[slot] = sb.placements;
      geo.srcIndex[slot] = i;
      // The card rung never sways, whatever the species does.
      const stiffness = batch.isCard ? -1 : sb.windTune[i * 2];
      writeBatchInstance(
        batch.data, dataSlot, rung.band, stiffness, sb.windTune[i * 2 + 1]);
      ids[i] = slot;
    }
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
      const geo = rung.partGeo[p];
      const ids = rung.ids[p];
      setTileSlots(geo, ids, from, to, visible);
      rung.appliedParts[at] = visible ? 1 : 0;
      if (import.meta.env.DEV) {
        counters.current.flipInstances += to - from;
        flippedBatches.current.add(batch);
      }
    }
  }

  /** Every batch a visible tile spans takes that tile's distance if it is the
   * nearest seen so far this gating pass. Allocation-free. */
  function markOrder(gateRung: GateRung, _tile: number, d: number): void {
    const rung = gateRung as CellRungEntry;
    const parts = rung.partBatches.length;
    for (let p = 0; p < parts; p++) {
      const batch = rung.partBatches[p];
      if (d < batch.orderMin) batch.orderMin = d;
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
   * queue is empty — at least one batch always. One copy's flip is cheap on
   * its own, but a tile carries hundreds of them and each batch pays for the
   * rows it writes and uploads, so what has to be bounded is TIME, not a
   * batch count. Batches that turn something ON go first, then the nearest,
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
          const geo = rung.partGeo[p];
          const ids = rung.ids[p];
          setTileSlots(geo, ids, from, to, visible);
          rung.appliedParts[at] = visible ? 1 : 0;
          if (import.meta.env.DEV) counters.current.flipInstances += to - from;
        }
      }
    }
    if (import.meta.env.DEV) flippedBatches.current.add(batch);
  }

  /**
   * Fill ONE built species into the batches — the GPU half of the work, done
   * in the same frame-work step as that species' build.
   *
   * Since round 12 the fill DOES grow things: `geoFor` grows a geometry's
   * instance buffers when its free rows run out, and `allocDataSlot` grows the
   * batch's data texture. Both copy the live prefix into the new buffer and
   * mark the whole buffer dirty, and slot ids survive a geometry growth, so
   * ids taken earlier in this fill stay valid — but the attribute and texture
   * OBJECTS do not, and nothing may hold a reference to them across a call
   * into `geoFor` or `allocDataSlot`.
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
        const casts = castsShadowFor(
          sb.rungs, entry.levels.length - 1, entry.billboardIndex, level);
        const fromZero = shadowFromZeroFor(casts, level);
        const parts = entry.levels[level].parts;
        const partBatches: Batch[] = [];
        const partGeo: GeoMesh[] = [];
        const partIds: Int32Array[] = [];
        const partTriangles: number[] = [];
        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
          const part = parts[partIndex];
          const batch = batches.current.get(batchKeyFor(
            part.material, part.depthMaterial, part.geometry,
            near, isCard, casts, fromZero))!;
          touched.add(batch);
          const geometryKey = `${sb.species}|${level}|${partIndex}`;
          const geo = geoFor(batch, geometryKey, part.geometry, sb.count);
          const ids = addCopies(
            batch, geo, sb, rungIndex, new Int32Array(sb.count));
          partBatches.push(batch);
          partGeo.push(geo);
          partIds.push(ids);
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
          partBatches, partGeo,
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
    // One draw per instanced mesh with a non-empty visible prefix; the
    // ranges figure is what the pre-round-12 batched path submitted.
    let draws = 0;
    let instancedRanges = 0;
    for (const batch of batches.current.values()) {
      for (const geo of batch.geoList) {
        if (geo.count === 0) continue;
        draws++;
        instancedRanges += geo.count;
      }
    }
    let cellsPending = 0;
    for (const cell of cells.current.values()) {
      if (!cell.build || jobs.current.has(cell.key)) cellsPending++;
    }
    // A per-species breakdown only a debug panel reads: a walk over tile
    // STATE bytes, no distance maths, once every 60 frames.
    const trianglesByRung = { near: 0, mid: 0, far: 0, card: 0 };
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
        if (onCopies > 0) {
          const tris = (onCopies / rung.ids.length) * rung.trianglesPerInstance;
          if (rung.isCard) trianglesByRung.card += tris;
          else if (rung.level === 0) trianglesByRung.near += tris;
          else if (rung.level === 1) trianglesByRung.mid += tris;
          else trianglesByRung.far += tris;
        }
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
      instancedRanges,
      triangles: Math.round(triangles),
      culled: Math.max(0, total - instances),
      billboardInstances,
      occluded,
      bySpecies,
      trianglesByRung,
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
