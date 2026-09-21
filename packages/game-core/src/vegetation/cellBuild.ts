/**
 * One vegetation cell's buffers, built ONCE (decision 0082).
 *
 * A cell is a vegetation chunk (468 m). Every instance in it is emitted into
 * EVERY rung of its species ladder, both band edges closed, so nothing here
 * depends on where the camera is: the shader's per-pixel Bayer test (0075)
 * picks the rung, and the per-frame gating loop (`cellGating.ts`) only
 * switches whole rung ranges on and off.
 *
 * Deliberately free of three.js, distance, occlusion and camera: that is what
 * makes "a camera move never rebuilds a cell" a property of the code rather
 * than a promise. The renderer composes matrices from `placements`.
 */

import {
  LOD_CULL_BAND_M,
  LOD_OPEN_M,
  type LodRung,
} from "../fx/lodFade";
import type { SolidInstance } from "../physics/floraSolids";

/** One instance as the bundle reader hands it over (`readInstance`). */
export interface CellInstance {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  tiltX: number;
  tiltZ: number;
  /** Metres the pivot sinks below the ground (PIVOT_TERRAIN species only). */
  sink: number;
}

/** One species group of one cell's bundle, read without allocating. */
export interface CellSpeciesSource {
  species: string;
  /** `ANCHOR_PIVOT_TERRAIN`: the pivot is re-grounded on the streamed ground. */
  anchorPivotTerrain: boolean;
  count: number;
  /** True when only the (unloaded) underwater kit holds this species. */
  underwaterOnly?: boolean;
  /** True when the kit holds this species but flags it unrenderable. It is
   * absent from `params` for good, so it is never a missing-kit gap. */
  suspect?: boolean;
  read(i: number, out: CellInstance): void;
}

/** Everything about a species that does not vary per instance. */
export interface CellSpeciesParams {
  species: string;
  ladder: LodRung[];
  vanishes: boolean;
  maxDraw: number;
  sways: boolean;
  trunkRadiusM: number | null;
  solid: boolean;
  cardLevel: number | null;
  /** Farthest a kit vertex lies from the pivot at scale 1. */
  reachM: number;
  heightM: number;
  /** Per-instance wind stiffness − 1, given the instance scale. */
  stiffness(scale: number): number;
}

/** One rung of one species in one cell: the same band for every instance. */
export interface CellRung {
  level: number;
  /** (dIn, dOut, wIn, wOut), metres. */
  band: [number, number, number, number];
}

/**
 * Gate tiles per cell edge. A cell is switched on and off at TILE resolution
 * (468 / 8 ≈ 58.5 m), because a whole 468 m cell switched on by one corner
 * inside a 24 m plant's draw distance submits an order of magnitude more
 * vertices than the plant can be seen through (round-1 vertex-load defect).
 */
export const CELL_TILES = 8;
/** minX, minY, minZ, maxX, maxY, maxZ, maxScale. */
export const TILE_BOUNDS_STRIDE = 7;

export interface CellSpeciesBuild {
  species: string;
  count: number;
  /** Stride 7: x, y, z, tiltX, yaw, tiltZ, scale. SORTED by gate tile. */
  placements: Float32Array;
  /** Stride 2: (stiffness − 1, sink). Sorted with `placements`. */
  windTune: Float32Array;
  rungs: CellRung[];
  /** CSR offsets into `placements` per tile: 65 entries, tile t is [t, t+1). */
  tileOffsets: Uint32Array;
  /** Stride `TILE_BOUNDS_STRIDE` per tile; an empty tile is all zero. */
  tileBounds: Float32Array;
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  maxScale: number;
}

export interface CellBuild {
  species: CellSpeciesBuild[];
  solids: SolidInstance[];
  /** Σ count × rungs — the batch instances this cell will occupy. */
  copies: number;
  underwaterWanted: boolean;
  /** Species in the chunk the kit did not hold when this cell was built. */
  skippedSpecies: string[];
}

/**
 * The bands one species' ladder produces when EVERY rung is emitted. Both
 * edges are closed (the `lodCopies` margin logic goes away, 0082 §2); the
 * last rung's outer edge is the dithered vanish where the species vanishes,
 * and open where it does not (a land tree inside the loaded ring).
 */
export function cellRungs(
  ladder: readonly LodRung[],
  vanishes: boolean,
): CellRung[] {
  const out: CellRung[] = [];
  for (let i = 0; i < ladder.length; i++) {
    const rung = ladder[i];
    const isLast = i === ladder.length - 1;
    const dIn = i > 0 ? rung.lo : 0;
    const dOut = !isLast ? rung.hi : vanishes ? rung.hi : LOD_OPEN_M;
    const wOut = isLast && vanishes ? LOD_CULL_BAND_M : 0;
    out.push({ level: rung.level, band: [dIn, dOut, 0, wOut] });
  }
  return out;
}

/**
 * The shape `copiesPerKey` needs: a species that will emit `count` copies into
 * each of its `rungs`. A built `CellSpeciesBuild` satisfies it, and so does the
 * cheap PLAN the renderer computes before the build (same `count` clamp, same
 * `cellRungs`) — which is what lets every batch be reserved before the first
 * copy is added.
 */
export interface CopiesSpecies {
  species: string;
  count: number;
  rungs: readonly CellRung[];
}

/**
 * Copies each batch key will receive: Σ count × rungs × parts. `keysFor` gives
 * the batch key of every kit part of one species × rung (the renderer's
 * material/geometry keying); a key repeated in that list counts again, because
 * two parts of the same rung really do take two copies each.
 */
export function copiesPerKey(
  species: readonly CopiesSpecies[],
  keysFor: (sb: CopiesSpecies, rungIndex: number) => readonly string[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const sb of species) {
    if (sb.count === 0) continue;
    for (let r = 0; r < sb.rungs.length; r++) {
      for (const key of keysFor(sb, r)) {
        out.set(key, (out.get(key) ?? 0) + sb.count);
      }
    }
  }
  return out;
}

const PLACEMENT_STRIDE = 7;

/** Ground sampler in TRUE metres (the caller applies `verticalScale`). */
export type CellGround = (x: number, z: number) => number | null;

/** Which gate tile of the cell at (originX, originZ) holds (x, z). */
export function tileIndex(
  x: number,
  z: number,
  originX: number,
  originZ: number,
  chunkMetres: number,
): number {
  const size = chunkMetres / CELL_TILES;
  const tx = Math.min(CELL_TILES - 1, Math.max(0, Math.floor((x - originX) / size)));
  const tz = Math.min(CELL_TILES - 1, Math.max(0, Math.floor((z - originZ) / size)));
  return tz * CELL_TILES + tx;
}

function buildSpecies(
  source: CellSpeciesSource,
  params: CellSpeciesParams,
  ground: CellGround,
  verticalScale: number,
  maxPerSpecies: number,
  solids: SolidInstance[],
  originX: number,
  originZ: number,
  chunkMetres: number,
): CellSpeciesBuild | null {
  const count = Math.min(source.count, maxPerSpecies);
  if (count === 0) return null;
  const rungs = cellRungs(params.ladder, params.vanishes);
  if (rungs.length === 0) return null;
  const tiles = CELL_TILES * CELL_TILES;
  const read = new Float32Array(count * PLACEMENT_STRIDE);
  const readWind = new Float32Array(count * 2);
  const tileOf = new Uint8Array(count);
  const tileOffsets = new Uint32Array(tiles + 1);
  const placements = new Float32Array(count * PLACEMENT_STRIDE);
  const windTune = new Float32Array(count * 2);
  const tileBounds = new Float32Array(tiles * TILE_BOUNDS_STRIDE);
  const inst: CellInstance = {
    x: 0, y: 0, z: 0, yaw: 0, scale: 1, tiltX: 0, tiltZ: 0, sink: 0,
  };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, maxScale = 0;
  for (let i = 0; i < count; i++) {
    source.read(i, inst);
    // Anchor per the mined authoring conventions: terrain species put their
    // PIVOT on the live streamed ground minus the baked sink; water-surface
    // and attached species keep their baked absolute Y.
    let y: number;
    let sink: number;
    if (source.anchorPivotTerrain) {
      const g = ground(inst.x, inst.z);
      y = (g ?? inst.y) * verticalScale - inst.sink;
      sink = inst.sink;
    } else {
      y = inst.y * verticalScale;
      sink = 0;
    }
    const at = i * PLACEMENT_STRIDE;
    read[at] = inst.x;
    read[at + 1] = y;
    read[at + 2] = inst.z;
    read[at + 3] = inst.tiltX;
    read[at + 4] = inst.yaw;
    read[at + 5] = inst.tiltZ;
    read[at + 6] = inst.scale;
    // A non-swaying species is pushed to stiffness −1 even though its
    // material is left unpatched: it may SHARE a material with a plant.
    readWind[i * 2] = params.sways ? params.stiffness(inst.scale) : -1;
    readWind[i * 2 + 1] = sink;
    const tile = tileIndex(inst.x, inst.z, originX, originZ, chunkMetres);
    tileOf[i] = tile;
    tileOffsets[tile + 1]++;
    if (inst.x < minX) minX = inst.x;
    if (inst.x > maxX) maxX = inst.x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (inst.z < minZ) minZ = inst.z;
    if (inst.z > maxZ) maxZ = inst.z;
    if (inst.scale > maxScale) maxScale = inst.scale;
    if (params.solid) {
      solids.push({
        species: params.species, x: inst.x, y, z: inst.z,
        yaw: inst.yaw, tiltX: inst.tiltX, tiltZ: inst.tiltZ, scale: inst.scale,
      });
    }
  }
  // Counting sort into tile order: the gate switches a TILE on and off, so a
  // tile's copies must be one contiguous run of batch instances.
  for (let t = 0; t < tiles; t++) tileOffsets[t + 1] += tileOffsets[t];
  const cursor = tileOffsets.slice(0, tiles);
  for (let i = 0; i < count; i++) {
    const tile = tileOf[i];
    const to = cursor[tile]++;
    const from = i * PLACEMENT_STRIDE;
    const at = to * PLACEMENT_STRIDE;
    for (let k = 0; k < PLACEMENT_STRIDE; k++) placements[at + k] = read[from + k];
    windTune[to * 2] = readWind[i * 2];
    windTune[to * 2 + 1] = readWind[i * 2 + 1];
    const b = tile * TILE_BOUNDS_STRIDE;
    const x = read[from];
    const y = read[from + 1];
    const z = read[from + 2];
    const scale = read[from + 6];
    if (to === tileOffsets[tile]) {
      tileBounds[b] = x; tileBounds[b + 1] = y; tileBounds[b + 2] = z;
      tileBounds[b + 3] = x; tileBounds[b + 4] = y; tileBounds[b + 5] = z;
      tileBounds[b + 6] = scale;
    } else {
      if (x < tileBounds[b]) tileBounds[b] = x;
      if (y < tileBounds[b + 1]) tileBounds[b + 1] = y;
      if (z < tileBounds[b + 2]) tileBounds[b + 2] = z;
      if (x > tileBounds[b + 3]) tileBounds[b + 3] = x;
      if (y > tileBounds[b + 4]) tileBounds[b + 4] = y;
      if (z > tileBounds[b + 5]) tileBounds[b + 5] = z;
      if (scale > tileBounds[b + 6]) tileBounds[b + 6] = scale;
    }
  }
  return {
    species: params.species, count, placements, windTune, rungs,
    tileOffsets, tileBounds,
    minX, minY, minZ, maxX, maxY, maxZ, maxScale,
  };
}

/** The whole cell in one call (the test path and small cells). */
export function buildCell(
  sources: readonly CellSpeciesSource[],
  params: ReadonlyMap<string, CellSpeciesParams>,
  ground: CellGround,
  verticalScale: number,
  maxPerSpecies: number,
  originX = 0,
  originZ = 0,
  chunkMetres = 468,
): CellBuild {
  let out: CellBuild | null = null;
  const job = buildCellJob(
    sources, params, ground, verticalScale, maxPerSpecies, (b) => { out = b; },
    originX, originZ, chunkMetres);
  while (!job.next().done) { /* run to completion */ }
  return out!;
}

/**
 * The same build, sliced over frames: one species group per `yield`, which is
 * the indivisible step the `FrameWorkQueue` schedules. The result reaches the
 * caller through `sink` on the final step.
 *
 * Each `yield` carries the species just built (null when the source held no
 * usable instances), so the caller can do ITS half of that species' work — the
 * renderer's GPU fill — inside the same frame-work step.
 */
export function* buildCellJob(
  sources: readonly CellSpeciesSource[],
  params: ReadonlyMap<string, CellSpeciesParams>,
  ground: CellGround,
  verticalScale: number,
  maxPerSpecies: number,
  sink: (build: CellBuild) => void,
  originX = 0,
  originZ = 0,
  chunkMetres = 468,
): Generator<CellSpeciesBuild | null> {
  const species: CellSpeciesBuild[] = [];
  const solids: SolidInstance[] = [];
  const skippedSpecies: string[] = [];
  let copies = 0;
  let underwaterWanted = false;
  for (const source of sources) {
    const p = params.get(source.species);
    if (!p) {
      // A species the (unloaded) underwater kit alone holds: meeting one in a
      // loaded cell is the request for that kit. Recorded so the cell can be
      // re-dirtied when — and only when — that species arrives.
      if (source.count > 0 && !source.suspect) skippedSpecies.push(source.species);
      if (source.underwaterOnly && source.count > 0) underwaterWanted = true;
      continue;
    }
    const built = buildSpecies(
      source, p, ground, verticalScale, maxPerSpecies, solids,
      originX, originZ, chunkMetres);
    if (built) {
      species.push(built);
      copies += built.count * built.rungs.length;
    }
    yield built;
  }
  sink({ species, solids, copies, underwaterWanted, skippedSpecies });
}
