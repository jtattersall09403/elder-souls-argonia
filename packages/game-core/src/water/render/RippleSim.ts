import type { WorldWaterQuery } from "@elder-souls/contracts";
import * as THREE from "three";
import { NodeMaterial, QuadMesh, RenderTarget, type WebGPURenderer } from "three/webgpu";
import { sel, type TslNode } from "../../render/nodes/materialNodes";
import { esRipplePath } from './rippleIsolation';
import { esRippleAdvection, type RipplePassNodes } from './rippleAdvection';
import * as TSL from "three/tsl";
// Loose TSL (decision 0107 §1): the chained typings are too deep for tsc to
// check usefully and cost minutes of type-checking; values are TslNode.
const {Break, Fn, If, Loop, abs, clamp, cos, dot, float, length, max, min, smoothstep, sqrt, texture, uniform, uniformArray, uv, vec2, vec4,} = TSL as TslNode;

export const RIPPLE_PATCH_M = 64;
const FIXED_STEP = 1 / 60;
const MAX_DROPS = 32;
/** Most drops one swept path may stamp in a frame. */
const MAX_PATH_STAMPS = 6;
const MIN_WET_MARGIN_M = 0.02;
const MAX_STALE_STAGE_M = 0.008;
/** The level step one mask cell can show (perf10 K1): the default cell is
 * 64 m / 128 = 0.5 m, and the flattest shore the mask resolves (a marsh
 * margin, about 1:64) moves its waterline one cell per 0.5 / 64 = 7.8 mm.
 * Tide and season reach the mask quantised to this step, so a creeping tide
 * starts a refresh only when a shoreline cell can actually move, as fast as
 * a 1 mm trigger showed that move. It equals the stale-row clear bound, so
 * one step refreshes rows in place and only a jump past it clears them. */
export const LEVEL_REFRESH_EPS_M = 0.008;
/** Float slack on the stale bound so one exact quantised step never clears. */
const STAGE_SLACK_M = 1e-6;

/** Level fed to the mask, snapped to LEVEL_REFRESH_EPS_M. */
export function quantiseLevel(levelM: number): number {
  return Math.round(levelM / LEVEL_REFRESH_EPS_M) * LEVEL_REFRESH_EPS_M;
}

export interface RippleBoundarySample {
  waterBodyId: string | null;
  depth: number;
  surfaceHeight: number;
  /** Distance to either drying or losing flood access, in vertical metres. */
  wetMarginM?: number;
  flowX?: number;
  flowZ?: number;
}
interface RippleLevelSource {
  levelOffsets(epochMinutes: number): { tide: number; season: number };
}
/** Still-water depth against actual ground is sufficient; no wave/normal
 * evaluation needed. `levels` are the mask's quantised tide/season (computed
 * once per refresh, never per texel); the sampler writes into `out` (the
 * mask's own scratch) and returns it. */
export type RippleBoundarySampler = (x: number, z: number,
  levels: Readonly<{ tide: number; season: number }>, out: RippleBoundarySample) => RippleBoundarySample;

export interface RippleSimOptions {
  size?: number;
  patchM?: number;
  boundarySize?: number;
  maskRefreshS?: number;
  /** Refresh period while tide/season are still. Default: never. Ground that
   * streams in is signalled through `groundChanged` (the terrain store's
   * arrival event), so an unchanged patch is never resampled. */
  staticRefreshS?: number;
  sampleBoundary?: RippleBoundarySampler;
}

/** Whether any cell of a packed mask (RGBA, A = wet support) is wet. */
export function anyWetSupport(data: Uint8Array): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
  return false;
}

/** CPU mask sampled at 0.5 m by default. Movement reuses overlapping samples;
 * tide/season movement by a LEVEL_REFRESH_EPS_M step refreshes the complete patch at
 * most once per `refreshS`; so does `requestRefresh()` (a terrain chunk arrived
 * under the patch). Still levels and no arrival mean no sampling at all.
 * Refreshes without movement rewrite their rows in place and flag only the rows
 * whose bytes changed (`dirtyRows`), so the GPU upload is those rows alone.
 * RG = stable 16-bit local body label, B = depth / 4 m, A = wet support. */
export class RippleBoundaryMask {
  readonly center = new THREE.Vector2(NaN, NaN);
  data: Uint8Array;
  /** Parallel true-metre/second XZ current; never packed/clipped to a speed range. */
  current: Float32Array;
  hasCurrent = false;
  private currentScratch: Float32Array;
  private scratch: Uint8Array;
  private readonly cornerLabels: Uint16Array;
  private readonly bodyLabels = new Map<string, number>();
  private age = Infinity;
  private refreshRow = 0;
  private rowsRemaining = 0;
  private sampler?: RippleBoundarySampler;
  private readonly rowStages: Float64Array;
  private readonly scratchRowStages: Float64Array;
  private tide = 0;
  private season = 0;
  /** The quantised levels handed to the sampler (one record, rewritten). */
  private readonly levels = { tide: 0, season: 0 };
  /** Sampler scratch: cell centre and shared corner. */
  private readonly centreSample: RippleBoundarySample = { waterBodyId: null, depth: 0, surfaceHeight: 0 };
  private readonly edgeSample: RippleBoundarySample = { waterBodyId: null, depth: 0, surfaceHeight: 0 };
  /** Level-driven refresh cycles started (tests, probes). */
  levelRefreshes = 0;
  private hasLevels = false;
  private dirty = false;
  /** Ground under the patch changed since the last cycle started. */
  private refreshRequested = false;
  /** Levels at the start of the current refresh cycle. */
  private cycleTide = NaN;
  private cycleSeason = NaN;
  /** Row stages moved by a scroll/full rebuild since setLevelOffsets last looked. */
  private stagesMoved = true;
  private readonly rowHasCurrent: Uint8Array;
  /** Rows whose data/current bytes changed since clearDirty(); `dirtyAll` = the arrays were rebuilt. */
  readonly dirtyRows: Uint8Array;
  dirtyAll = true;
  /** Cells the last update() walked (instrumentation for tests and benchmarks). */
  cellsWalked = 0;

  constructor(readonly size = 128, readonly patchM = RIPPLE_PATCH_M, readonly refreshS = 0.2, sampler?: RippleBoundarySampler,
    private readonly refreshRows = size, readonly staticRefreshS = refreshS) {
    this.data = new Uint8Array(size * size * 4);
    this.scratch = new Uint8Array(this.data.length);
    this.current = new Float32Array(size * size * 2);
    this.currentScratch = new Float32Array(this.current.length);
    this.cornerLabels = new Uint16Array((size + 1) * (size + 1));
    this.rowStages = new Float64Array(size * 4).fill(NaN);
    this.scratchRowStages = new Float64Array(size * 4);
    this.rowHasCurrent = new Uint8Array(size);
    this.dirtyRows = new Uint8Array(size);
    this.sampler = sampler;
  }

  clearDirty(): void { this.dirtyRows.fill(0); this.dirtyAll = false; }

  /** Start an in-place refresh cycle as soon as the rate limit allows (a
   * request during a cycle starts the next one, so no row misses it). Keeps
   * the ripple history: only rows whose bytes change are rewritten. */
  requestRefresh(): void { this.refreshRequested = true; }

  setSampler(sampler: RippleBoundarySampler): void { this.sampler = sampler; this.invalidate(); }
  invalidate(): void { this.age = Infinity; }

  /** Clear unsafe support immediately, then refill rows without restarting the
   * refresh cursor. A continuously moving tide cannot starve later rows. */
  setLevelOffsets(tide: number, season: number): boolean {
    if (!Number.isFinite(tide) || !Number.isFinite(season)) return false;
    tide = quantiseLevel(tide); season = quantiseLevel(season);
    // Unchanged levels over unmoved stages: the last pass already cleared
    // every row this one could (refreshed rows carry exactly these levels).
    if (this.hasLevels && tide === this.tide && season === this.season && !this.stagesMoved) return false;
    this.stagesMoved = false;
    let cleared = false;
    for (let row = 0; row < this.size; row++) {
      const i = row * 4;
      // Responses lie in [0,1]. This bounds every sample represented by a
      // row, including mixed-age samples retained during lateral scrolling.
      const excursion = Math.max(Math.abs(tide - this.rowStages[i]), Math.abs(tide - this.rowStages[i + 1]))
        + Math.max(Math.abs(season - this.rowStages[i + 2]), Math.abs(season - this.rowStages[i + 3]));
      if ((!this.hasLevels && Number.isFinite(this.center.x)) || excursion > MAX_STALE_STAGE_M + STAGE_SLACK_M) {
        this.data.fill(0, row * this.size * 4, (row + 1) * this.size * 4);
        this.current.fill(0, row * this.size * 2, (row + 1) * this.size * 2);
        this.rowStages.fill(NaN, i, i + 4);
        this.rowHasCurrent[row] = 0;
        this.dirtyRows[row] = 1;
        cleared = true;
      }
    }
    this.tide = tide; this.season = season; this.hasLevels = true;
    this.levels.tide = tide; this.levels.season = season;
    if (cleared) {
      this.dirty = true; this.rowsRemaining = this.size; this.age = 0;
      this.cycleTide = tide; this.cycleSeason = season;
    }
    return cleared;
  }

  invalidateProgressively(): void {
    this.data.fill(0); this.current.fill(0); this.hasCurrent = false; this.rowStages.fill(NaN);
    this.rowHasCurrent.fill(0); this.dirtyRows.fill(1);
    this.dirty = true; this.rowsRemaining = this.size; this.age = 0;
  }

  update(focusX: number, focusZ: number, dt: number): boolean {
    const texel = this.patchM / this.size;
    const cx = Math.round(focusX / texel) * texel;
    const cz = Math.round(focusZ / texel) * texel;
    this.age += Math.max(0, dt);
    const full = !Number.isFinite(this.age) || !Number.isFinite(this.center.x);
    if (!full && !this.rowsRemaining && this.age + 1e-9 >= this.refreshS && (this.refreshRequested
      || this.age + 1e-9 >= this.staticRefreshS
      || this.tide !== this.cycleTide || this.season !== this.cycleSeason)) {
      if (this.tide !== this.cycleTide || this.season !== this.cycleSeason) this.levelRefreshes++;
      this.rowsRemaining = this.size;
      this.refreshRow = 0;
      this.age = 0;
      this.refreshRequested = false;
      this.cycleTide = this.tide; this.cycleSeason = this.season;
    }
    const rowStart = this.refreshRow;
    const rowCount = full ? this.size : Math.min(this.rowsRemaining, Math.max(1, this.refreshRows));
    const dx = Number.isFinite(this.center.x) ? Math.round((cx - this.center.x) / texel) : this.size;
    const dz = Number.isFinite(this.center.y) ? Math.round((cz - this.center.y) / texel) : this.size;
    if (!full && !rowCount && dx === 0 && dz === 0 && !this.dirty) { this.cellsWalked = 0; return false; }
    if (!full && dx === 0 && dz === 0) return this.refreshRowsInPlace(cx, cz, rowStart, rowCount);
    this.cellsWalked = this.size * this.size;
    this.rowHasCurrent.fill(0);
    const target = this.scratch;
    // Corner samples are shared by four cells: conservative support needs
    // about two samples/cell, not five. 65535 is the unsampled sentinel.
    this.cornerLabels.fill(65535);
    this.scratchRowStages.fill(NaN);
    this.hasCurrent = false;
    for (let z = 0; z < this.size; z++) for (let x = 0; x < this.size; x++) {
      const i = (z * this.size + x) * 4;
      const ci = i / 2;
      const oldX = x + dx;
      const oldZ = z + dz;
      const refreshCell = full || (z - rowStart + this.size) % this.size < rowCount;
      if (!refreshCell && oldX >= 0 && oldX < this.size && oldZ >= 0 && oldZ < this.size) {
        const old = (oldZ * this.size + oldX) * 4;
        target[i] = this.data[old]; target[i + 1] = this.data[old + 1];
        target[i + 2] = this.data[old + 2]; target[i + 3] = this.data[old + 3];
        this.currentScratch[ci] = this.current[old / 2]; this.currentScratch[ci + 1] = this.current[old / 2 + 1];
        if (this.currentScratch[ci] !== 0 || this.currentScratch[ci + 1] !== 0) { this.hasCurrent = true; this.rowHasCurrent[z] = 1; }
        if (target[i + 3]) this.includeRowStage(z, oldZ);
        continue;
      }
      this.sampleCell(target, this.currentScratch, x, z, cx, cz, texel,true);
    }
    this.scratch = this.data;
    this.data = target;
    const swap = this.current; this.current = this.currentScratch; this.currentScratch = swap;
    this.rowStages.set(this.scratchRowStages);
    this.dirty = false;
    this.stagesMoved = true;
    this.dirtyAll = true;
    this.center.set(cx, cz);
    if (full) {
      this.age = 0; this.rowsRemaining = 0; this.refreshRow = 0; this.refreshRequested = false;
      this.cycleTide = this.tide; this.cycleSeason = this.season;
    } else { this.rowsRemaining -= rowCount; this.refreshRow = (this.refreshRow + rowCount) % this.size; }
    return true;
  }

  /** No movement: resample only the refresh rows, in place. Byte-identical to
   * the scrolling walk with dx = dz = 0 (non-refresh cells and their row stages
   * are copies of themselves); rows are flagged dirty only when they changed. */
  private refreshRowsInPlace(cx: number, cz: number, rowStart: number, rowCount: number): boolean {
    const texel = this.patchM / this.size;
    const rowBytes = this.size * 4;
    this.cornerLabels.fill(65535);
    let changed = this.dirty;
    for (let r = 0; r < rowCount; r++) {
      const z = (rowStart + r) % this.size;
      const i = z * 4;
      this.scratchRowStages.fill(NaN, i, i + 4);
      this.rowHasCurrent[z] = 0;
      // Sample into the scratch row, then compare and copy back.
      for (let x = 0; x < this.size; x++) this.sampleCell(this.scratch, this.currentScratch, x, z, cx, cz, texel,false);
      const b0 = z * rowBytes, c0 = z * this.size * 2;
      let rowChanged = false;
      for (let k = 0; k < rowBytes; k++) if (this.scratch[b0 + k] !== this.data[b0 + k]) { rowChanged = true; break; }
      if (!rowChanged) for (let k = 0; k < this.size * 2; k++) {
        if (!Object.is(this.currentScratch[c0 + k], this.current[c0 + k])) { rowChanged = true; break; }
      }
      if (rowChanged) {
        this.data.set(this.scratch.subarray(b0, b0 + rowBytes), b0);
        this.current.set(this.currentScratch.subarray(c0, c0 + this.size * 2), c0);
        this.dirtyRows[z] = 1;
        changed = true;
      }
      this.rowStages[i] = this.scratchRowStages[i]; this.rowStages[i + 1] = this.scratchRowStages[i + 1];
      this.rowStages[i + 2] = this.scratchRowStages[i + 2]; this.rowStages[i + 3] = this.scratchRowStages[i + 3];
    }
    this.hasCurrent = false;
    for (let z = 0; z < this.size; z++) if (this.rowHasCurrent[z]) { this.hasCurrent = true; break; }
    this.cellsWalked = rowCount * this.size;
    this.dirty = false;
    this.rowsRemaining -= rowCount; this.refreshRow = (this.refreshRow + rowCount) % this.size;
    return changed;
  }

  private sampleCell(target: Uint8Array, current: Float32Array, x: number, z: number, cx: number, cz: number, texel: number, walk: boolean): void {
      const i = (z * this.size + x) * 4;
      const ci = i / 2;
      const sample = this.sampler?.(cx + (x + 0.5) * texel - this.patchM / 2, cz + (z + 0.5) * texel - this.patchM / 2,
        this.levels, this.centreSample);
      const id = this.sampler ? sample?.waterBodyId : "water.unbounded.default";
      const depth = this.sampler ? sample?.depth ?? 0 : 4;
      let label = 0;
      if (id && Number.isFinite(depth) && depth > 0.025 && (sample?.wetMarginM ?? depth - 0.004) > MIN_WET_MARGIN_M) {
        label = this.bodyLabel(id);
      }
      if (label && this.sampler) {
        // A cell must be wet at its centre AND four corners; thin banks
        // cannot become a full wet cell just because its centre missed land.
        for (let cornerZ = z; cornerZ <= z + 1 && label; cornerZ++) {
          for (let cornerX = x; cornerX <= x + 1; cornerX++) {
            const corner = cornerZ * (this.size + 1) + cornerX;
            if (this.cornerLabels[corner] === 65535) {
              const edge = this.sampler(cx + cornerX * texel - this.patchM / 2, cz + cornerZ * texel - this.patchM / 2, this.levels, this.edgeSample);
              this.cornerLabels[corner] = edge.waterBodyId && Number.isFinite(edge.depth) && edge.depth > 0.025
                && (edge.wetMarginM ?? edge.depth - 0.004) > MIN_WET_MARGIN_M ? this.bodyLabel(edge.waterBodyId) : 0;
            }
            if (this.cornerLabels[corner] !== label) { label = 0; break; }
          }
        }
      }
      target[i] = label & 255;
      target[i + 1] = label >>> 8;
      target[i + 2] = label ? Math.min(255, Math.max(1, Math.round(depth / 4 * 255))) : 0;
      target[i + 3] = label ? 255 : 0;
      current[ci] = label && Number.isFinite(sample?.flowX) ? sample!.flowX! : 0;
      current[ci + 1] = label && Number.isFinite(sample?.flowZ) ? sample!.flowZ! : 0;
      if (current[ci] !== 0 || current[ci + 1] !== 0) { if (walk) this.hasCurrent = true; this.rowHasCurrent[z] = 1; }
      if (label) this.includeRowStage(z);
  }

  /** Label at a world point, used to restrict each impulse to its origin body. */
  labelAt(x: number, z: number): number {
    if (!Number.isFinite(this.center.x) || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const ix = Math.floor((x - this.center.x + this.patchM / 2) * this.size / this.patchM);
    const iz = Math.floor((z - this.center.y + this.patchM / 2) * this.size / this.patchM);
    if (ix < 0 || iz < 0 || ix >= this.size || iz >= this.size) return 0;
    const i = (iz * this.size + ix) * 4;
    return this.data[i] + this.data[i + 1] * 256;
  }

  private bodyLabel(id: string): number {
    const known = this.bodyLabels.get(id);
    if (known) return known;
    if (this.bodyLabels.size >= 65534) return 0;
    const label = this.bodyLabels.size + 1;
    this.bodyLabels.set(id, label);
    return label;
  }

  private includeRowStage(row: number, previousRow?: number): void {
    const i = row * 4;
    const old = previousRow === undefined ? -1 : previousRow * 4;
    const minT = old < 0 ? this.tide : this.rowStages[old], maxT = old < 0 ? this.tide : this.rowStages[old + 1];
    const minS = old < 0 ? this.season : this.rowStages[old + 2], maxS = old < 0 ? this.season : this.rowStages[old + 3];
    if (!Number.isFinite(this.scratchRowStages[i])) {
      this.scratchRowStages[i] = minT; this.scratchRowStages[i + 1] = maxT;
      this.scratchRowStages[i + 2] = minS; this.scratchRowStages[i + 3] = maxS;
    } else {
      this.scratchRowStages[i] = Math.min(this.scratchRowStages[i], minT);
      this.scratchRowStages[i + 1] = Math.max(this.scratchRowStages[i + 1], maxT);
      this.scratchRowStages[i + 2] = Math.min(this.scratchRowStages[i + 2], minS);
      this.scratchRowStages[i + 3] = Math.max(this.scratchRowStages[i + 3], maxS);
    }
  }
}

/** Scheduling is independent of rendering. Every recenter is copied immediately,
 * including frames shorter than one simulation step, before new drops are stamped. */
export class RippleFrameScheduler {
  readonly center = new THREE.Vector2();
  private accumulator = 0;
  constructor(readonly size = 256, readonly patchM = RIPPLE_PATCH_M) {}
  reset(): void { this.accumulator = 0; }

  advance(focusX: number, focusZ: number, deltaS: number) {
    const texel = this.patchM / this.size;
    const x = Math.round(focusX / texel) * texel;
    const z = Math.round(focusZ / texel) * texel;
    const shiftX = (x - this.center.x) / this.patchM;
    const shiftZ = (z - this.center.y) / this.patchM;
    this.center.set(x, z);
    this.accumulator = Math.min(this.accumulator + Math.max(0, deltaS), 4 * FIXED_STEP);
    const steps = Math.floor((this.accumulator + 1e-9) / FIXED_STEP);
    this.accumulator = Math.max(0, this.accumulator - steps * FIXED_STEP);
    return { shiftX, shiftZ, steps };
  }
}

/** Uniform nodes shared by the four pass materials. */
interface RipplePassUniforms {
  prev: TslNode;
  boundary: TslNode;
  maskOffset: TslNode;
  maskSize: TslNode;
}

/** The former COMMON block: boundary support, owner comparison and the
 * owner-checked history read, over the fragment's quad uv. */
function passNodes(u: RipplePassUniforms): RipplePassNodes {
  const inside = (p: TslNode) => p.x.greaterThanEqual(0).and(p.y.greaterThanEqual(0)).and(p.x.lessThanEqual(1)).and(p.y.lessThanEqual(1));
  // Explicit level 0 everywhere: samples sit inside data-dependent branches
  // and loops (WGSL uniformity); the targets and masks carry no mips.
  const support = (p: TslNode) => {
    const maskUv = p.add(u.maskOffset);
    const mask = texture(u.boundary, maskUv).level(float(0));
    return sel(inside(maskUv), mask, vec4(0));
  };
  const sameBody = (a: TslNode, b: TslNode): TslNode => dot(abs(a.sub(b)) as TslNode, vec2(1)).lessThan(0.002);
  const history = (p: TslNode, boundary: TslNode) => {
    const state = texture(u.prev, p).level(float(0));
    const rg = sel(sameBody(state.ba, boundary.rg), state.rg, vec2(0));
    return sel(inside(p).not().or(boundary.a.lessThan(0.5)), vec4(0, 0, boundary.rg), vec4(rg, boundary.rg));
  };
  return { uv: uv(), inside, support, sameBody, history, maskOffset: u.maskOffset, maskSize: u.maskSize };
}

function copyPass(ctx: RipplePassNodes, shift: TslNode): TslNode {
  return ctx.history(ctx.uv.add(shift), ctx.support(ctx.uv));
}

function updatePass(ctx: RipplePassNodes, texel: TslNode, cellM: TslNode): TslNode {
  const uvNode = ctx.uv, out = vec4(0).toVar();
  const boundary = ctx.support(uvNode);
  If(boundary.a.greaterThanEqual(0.5), () => {
    const state = ctx.history(uvNode, boundary).toVar();
    // Neumann/no-flux shoreline: reflected waves, never propagation through a bank.
    const neighbour = (p: TslNode) => {
      const edge = ctx.support(p);
      return sel(ctx.inside(p).not().or(edge.a.lessThan(0.5)).or(ctx.sameBody(edge.rg, boundary.rg).not()),
        state.r, ctx.history(p, edge).r);
    };
    const laplacian = neighbour(uvNode.add(vec2(texel.x, 0)))
      .add(neighbour(uvNode.sub(vec2(texel.x, 0))))
      .add(neighbour(uvNode.add(vec2(0, texel.y))))
      .add(neighbour(uvNode.sub(vec2(0, texel.y)))).sub(state.r.mul(4));
    // Shallow-water phase speed sqrt(g*d), capped locally; CFL <= .45.
    const speed = min(3, sqrt(float(9.81).mul(max(0.025, boundary.b.mul(4)))));
    const courant = min(0.45, speed.div(float(60).mul(cellM)));
    const velocity = state.g.add(laplacian.mul(courant).mul(courant)).mul(0.99);
    const height = state.r.add(velocity);
    const edge = min(min(uvNode.x, uvNode.x.oneMinus()), min(uvNode.y, uvNode.y.oneMinus()));
    const keep = smoothstep(0, 0.06, edge);
    out.assign(vec4(clamp(height.mul(keep), -0.5, 0.5), clamp(velocity.mul(keep), -0.2, 0.2), boundary.rg));
  });
  return out;
}

function dropPass(ctx: RipplePassNodes, drops: TslNode, bodies: TslNode, count: TslNode): TslNode {
  const uvNode = ctx.uv, out = vec4(0).toVar();
  const boundary = ctx.support(uvNode);
  If(boundary.a.greaterThanEqual(0.5), () => {
    const state = ctx.history(uvNode, boundary).toVar();
    const impulse = float(0).toVar();
    // A named index: the path loop nested inside must never shadow it.
    Loop({ start: 0, end: MAX_DROPS, type: "int", condition: "<", name: "dropIndex" }, ({ dropIndex }: { dropIndex: TslNode }) => {
      If(dropIndex.greaterThanEqual(count), () => { Break(); });
      const drop = vec4(drops.element(dropIndex)).toVar();
      If(ctx.sameBody(bodies.element(dropIndex), boundary.rg), () => {
        const travel = uvNode.sub(drop.xy);
        const radial = length(travel).div(drop.z).toVar();
        If(radial.lessThan(1), () => {
          // Exact bounded cell supercover, including both sides of a corner.
          If(esRipplePath(ctx, drop.xy, uvNode, boundary.rg), () => {
            impulse.addAssign(float(0.5).add(cos(radial.mul(3.14159265)).mul(0.5)).mul(drop.w));
          });
        });
      });
    });
    out.assign(vec4(clamp(state.r.add(impulse), -0.5, 0.5), state.g, boundary.rg));
  });
  return out;
}

/** A full-screen pass material: fragment output only, no blending, depth,
 * tone mapping or fog. `userData.uniforms` names the pass's own uniforms. */
function passMaterial(name: string, fragment: TslNode, uniforms: Record<string, unknown>): NodeMaterial {
  const material = new NodeMaterial();
  material.name = name;
  material.fragmentNode = fragment;
  material.depthTest = false; material.depthWrite = false;
  material.blending = THREE.NoBlending; material.toneMapped = false; material.fog = false;
  material.userData.uniforms = uniforms;
  return material;
}

/**
 * One bounded near-camera wave patch, evolved with the finite-difference method
 * used by Evan Wallace / jeantimex (MIT; source research in water-edges-and-shore-waves.md §4).
 * Every update obeys shared water support/body boundaries. RG is height/velocity;
 * BA retains the body's mask label so newly flooded or recentered cells cannot
 * inherit another pool's disturbance. No readbacks and no per-drop draw calls.
 */
export class RippleSim {
  private a: RenderTarget;
  private b: RenderTarget;
  private readonly quad: QuadMesh;
  private readonly copy: NodeMaterial;
  private readonly update: NodeMaterial;
  private readonly drop: NodeMaterial;
  private readonly advect: NodeMaterial;
  /** Read side of the ping-pong: `.value` is swapped to the latest state before every pass. */
  private readonly prevNode: TslNode;
  private readonly maskOffset = uniform(new THREE.Vector2());
  private readonly shift = uniform(new THREE.Vector2());
  private readonly deltaSNode = uniform(FIXED_STEP);
  private readonly dropCount = uniform(0, "int");
  private readonly drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4());
  private readonly dropBodies = Array.from({ length: MAX_DROPS }, () => new THREE.Vector2());
  private readonly mask: RippleBoundaryMask;
  private readonly maskTexture: THREE.DataTexture;
  private readonly currentTexture: THREE.DataTexture;
  private readonly scheduler: RippleFrameScheduler;
  private readonly pendingDrops: { x: number; z: number; radiusM: number; strength: number }[] = [];
  private readonly fastSampler?: RippleBoundarySampler;
  private readonly maxDropRadiusM: number;
  /** A whole-texture upload is queued and not yet consumed: row ranges must not narrow it. */
  private maskFullPending = true;
  private currentFullPending = true;
  /** Renderer.getClearColor fills a Color4 (Color + alpha); a Color with `a` serves. */
  private readonly savedColor = Object.assign(new THREE.Color(), { a: 1 }) as unknown as Parameters<WebGPURenderer["getClearColor"]>[0];
  private readonly savedViewport = new THREE.Vector4();
  private readonly savedScissor = new THREE.Vector4();
  private epoch = () => 0;
  private levels?: (epochMinutes: number) => { tide: number; season: number };
  private initialized = false;
  /** The four pass programs have been queued for linking (`linkPasses`). */
  private linked = false;
  private disposed = false;
  /** Any mask cell with wet support (recounted when the mask changes). */
  private maskWet = true;
  /** The last GPU step ran over an all-dry mask: the field is all zero. */
  private fieldDry = false;
  /** Steps skipped over a dry patch (tests, probes). */
  skippedSteps = 0;
  readonly center: THREE.Vector2;
  readonly patchM: number;

  constructor(options: RippleSimOptions = {}) {
    const size = Math.max(32, Math.min(512, Math.round(options.size ?? 256)));
    this.patchM = Math.max(8, Math.min(128, options.patchM ?? RIPPLE_PATCH_M));
    const boundarySize = Math.max(16, Math.min(256, Math.round(options.boundarySize ?? 128)));
    this.maxDropRadiusM = Math.min(4, this.patchM / boundarySize * 8);
    this.fastSampler = options.sampleBoundary;
    // Keep conservative half-metre banks without a 33k-query hitch every
    // fifth of a second. Initial/teleported support is complete immediately;
    // subsequent level changes refresh in bounded row batches.
    // Still levels and no ground arrival: no resampling (walk 5 perf).
    this.mask = new RippleBoundaryMask(boundarySize, this.patchM, Math.max(0.1, options.maskRefreshS ?? 0.2), this.fastSampler, 16,
      Math.max(0.1, options.staticRefreshS ?? Infinity));
    this.scheduler = new RippleFrameScheduler(size, this.patchM);
    this.center = this.scheduler.center;
    this.maskTexture = new THREE.DataTexture(this.mask.data, boundarySize, boundarySize, THREE.RGBAFormat);
    this.maskTexture.minFilter = this.maskTexture.magFilter = THREE.NearestFilter;
    this.maskTexture.generateMipmaps = false;
    this.maskTexture.colorSpace = THREE.NoColorSpace;
    this.maskTexture.needsUpdate = true;
    this.currentTexture = new THREE.DataTexture(this.mask.current, boundarySize, boundarySize, THREE.RGFormat, THREE.FloatType);
    this.currentTexture.minFilter = this.currentTexture.magFilter = THREE.NearestFilter;
    this.currentTexture.generateMipmaps = false;
    this.currentTexture.colorSpace = THREE.NoColorSpace;
    this.currentTexture.needsUpdate = true;
    this.maskTexture.onUpdate = () => { this.maskFullPending = false; };
    this.currentTexture.onUpdate = () => { this.currentFullPending = false; };
    const makeTarget = () => {
      const rt = new RenderTarget(size, size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        // Simulation taps are exact texel centres; linear filtering gives the
        // surface shader smooth gradients without any additional output pass.
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
      rt.texture.colorSpace = THREE.NoColorSpace;
      rt.texture.generateMipmaps = false;
      return rt;
    };
    this.a = makeTarget(); this.b = makeTarget();
    this.prevNode = texture(this.a.texture);
    const shared: RipplePassUniforms = {
      prev: this.prevNode, boundary: texture(this.maskTexture), maskOffset: this.maskOffset, maskSize: uniform(boundarySize),
    };
    const texel = uniform(new THREE.Vector2(1 / size, 1 / size)), cellM = uniform(this.patchM / size);
    const drops = uniformArray(this.drops, "vec4"), bodies = uniformArray(this.dropBodies, "vec2");
    const advection = { current: texture(this.currentTexture), stateSize: uniform(size), patchM: uniform(this.patchM), deltaS: this.deltaSNode };
    this.copy = passMaterial("ripple.copy", Fn(() => copyPass(passNodes(shared), this.shift))(), { shift: this.shift });
    this.update = passMaterial("ripple.update", Fn(() => updatePass(passNodes(shared), texel, cellM))(), { texel, cellM });
    this.advect = passMaterial("ripple.advect", Fn(() => esRippleAdvection(passNodes(shared), advection))(), advection);
    this.drop = passMaterial("ripple.drop", Fn(() => dropPass(passNodes(shared), drops, bodies, this.dropCount))(),
      { drops: this.drops, dropBodies: this.dropBodies, dropCount: this.dropCount });
    this.quad = new QuadMesh(this.copy);
  }

  get texture(): THREE.Texture { return this.a.texture; }

  configureBoundary(query: WorldWaterQuery, epochMinutes: () => number): void {
    this.epoch = epochMinutes;
    // WaterWorld can expose this optional cheap path while generic gameplay queries work too.
    const cheap = query as WorldWaterQuery & { sampleBoundary?: RippleBoundarySampler } & Partial<RippleLevelSource>;
    this.levels = cheap.levelOffsets ? epoch => cheap.levelOffsets!(epoch) : undefined;
    this.initialized = false;
    this.pendingDrops.length = 0;
    this.mask.setSampler(this.fastSampler ?? (cheap.sampleBoundary
      ? (x, z, levels, out) => cheap.sampleBoundary!(x, z, levels, out)
      // A generic query owns its own levels: it samples at the current epoch.
      : (x, z, _levels, out) => {
        const sample = query.sample({ x, y: 0, z }, this.epoch());
        out.waterBodyId = sample.waterBodyId; out.depth = sample.depth; out.surfaceHeight = sample.surfaceHeight;
        out.flowX = sample.flowVelocity.x; out.flowZ = sample.flowVelocity.z;
        return out;
      }));
  }

  /** Explicit terrain/support changes discard stale history immediately on the
   * next render step; the new mask is admitted in the usual bounded row budget. */
  invalidateBoundary(): void {
    this.mask.invalidateProgressively(); this.initialized = false; this.pendingDrops.length = 0;
  }

  /** A terrain chunk covering [minX, maxX] x [minZ, maxZ] (world metres)
   * arrived: refresh the shoreline mask in place within the usual rate limit
   * if it touches the patch. Unlike `invalidateBoundary` it keeps the ripple
   * history. Wired to `ChunkStore.onArrival` by the app. */
  groundChanged(minX: number, minZ: number, maxX: number, maxZ: number): void {
    const c = this.mask.center;
    if (!Number.isFinite(c.x)) return;  // the first full build samples it anyway
    const half = this.patchM / 2 + 1;
    if (maxX < c.x - half || minX > c.x + half || maxZ < c.y - half || minZ > c.y + half) return;
    this.mask.requestRefresh();
  }

  /** Optional explicit injection for query adapters without levelOffsets. */
  setLevelOffsets(tide: number, season: number): void {
    if (this.mask.setLevelOffsets(tide, season)) {
      this.initialized = false; this.pendingDrops.length = 0;
    }
  }

  addDrop(x: number, z: number, radiusM: number, strength: number): void {
    if (this.disposed || ![x, z, radiusM, strength].every(Number.isFinite) || radiusM <= 0 || strength === 0) return;
    if (this.pendingDrops.length >= MAX_DROPS) return;
    this.pendingDrops.push({ x, z, radiusM: Math.min(this.maxDropRadiusM, radiusM), strength: THREE.MathUtils.clamp(strength, -0.3, 0.3) });
  }

  /** Swept-path stamping (study §1.4): a wading player or a moving contact
   * stamps along the distance travelled since the last frame — drops spaced
   * under a radius apart along the segment, never one point every tick. */
  addPath(x0: number, z0: number, x1: number, z1: number, radiusM: number, strength: number): void {
    if (![x0, z0, x1, z1, radiusM].every(Number.isFinite) || radiusM <= 0) return;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.min(MAX_PATH_STAMPS, Math.max(1, Math.ceil(len / (radiusM * 0.9))));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 1 : i / (n - 1);
      this.addDrop(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, radiusM, strength);
    }
  }

  step(renderer: WebGPURenderer, focusX: number, focusZ: number, deltaS: number): void {
    if (this.disposed || ![focusX, focusZ, deltaS].every(Number.isFinite) || deltaS < 0) return;
    const plan = this.scheduler.advance(focusX, focusZ, deltaS);
    const epoch = this.epoch();
    const levels = this.levels?.(epoch);
    if (levels) this.setLevelOffsets(levels.tide, levels.season);
    const maskChanged = this.mask.update(this.center.x, this.center.y, deltaS);
    if (maskChanged) { this.uploadMask(); this.maskWet = anyWetSupport(this.mask.data); }
    // Dry patch (perf10 f3): the update pass writes 0 on every cell without
    // wet support, so once one pass has run over an all-dry mask the field is
    // all zero and every further pass would rewrite zeros. Skip the GPU work
    // until support appears; the zero field it resumes from is the field the
    // passes would have kept. Drops land only on labelled (wet) cells.
    if (!this.maskWet && this.fieldDry && !this.mask.hasCurrent) {
      this.pendingDrops.length = 0;
      this.skippedSteps++;
      return;
    }
    this.fieldDry = !this.maskWet;
    this.maskOffset.value.set((this.center.x - this.mask.center.x) / this.patchM, (this.center.y - this.mask.center.y) / this.patchM);
    const target = renderer.getRenderTarget();
    const tone = renderer.toneMapping;
    const autoClear = renderer.autoClear;
    const color = renderer.getClearColor(this.savedColor);
    const alpha = renderer.getClearAlpha();
    const viewport = renderer.getViewport(this.savedViewport);
    const scissor = renderer.getScissor(this.savedScissor);
    const scissorTest = renderer.getScissorTest();
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      if (!this.linked) this.linkPasses(renderer);
      if (!this.initialized) {
        renderer.setClearColor(0, 0);
        renderer.setRenderTarget(this.a); renderer.clear();
        renderer.setRenderTarget(this.b); renderer.clear();
        this.initialized = true;
      }
      if (plan.shiftX !== 0 || plan.shiftZ !== 0 || maskChanged) {
        this.shift.value.set(plan.shiftX, plan.shiftZ);
        this.renderPass(renderer, this.copy);
      }
      // Transport is m/s times the entire visible interval, independent of
      // bounded wave-equation catch-up. One exact-path pass; overly long
      // per-cell traces expire their old history instead of faking slow flow.
      if (this.mask.hasCurrent && deltaS > 0) {
        this.deltaSNode.value = deltaS;
        this.renderPass(renderer, this.advect);
      }
      for (let i = 0; i < plan.steps; i++) this.renderPass(renderer, this.update);
      // Current-frame contacts were born after the elapsed interval. They
      // must neither advect nor age through preceding time before first draw.
      let count = 0;
      for (const d of this.pendingDrops) {
        const label = this.mask.labelAt(d.x, d.z);
        const u = (d.x - this.center.x) / this.patchM + 0.5;
        const v = (d.z - this.center.y) / this.patchM + 0.5;
        if (!label || u < 0 || v < 0 || u > 1 || v > 1) continue;
        this.drops[count].set(u, v, Math.max(d.radiusM, this.patchM / this.scheduler.size) / this.patchM, d.strength);
        this.dropBodies[count].set((label & 255) / 255, (label >>> 8) / 255);
        count++;
      }
      this.pendingDrops.length = 0;
      if (count) { this.dropCount.value = count; this.renderPass(renderer, this.drop); }
    } finally {
      renderer.setRenderTarget(target);
      renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      renderer.setClearColor(color, alpha);
      renderer.toneMapping = tone; renderer.autoClear = autoClear;
    }
  }

  /** Invisible remote patches do no mask/solver work. Discard their history
   * and queued events rather than replaying stale splashes upon reactivation. */
  suspend(): void {
    this.pendingDrops.length = 0;
    this.initialized = false;
    this.scheduler.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingDrops.length = 0;
    this.a.dispose(); this.b.dispose(); this.maskTexture.dispose(); this.currentTexture.dispose();
    this.copy.dispose(); this.update.dispose(); this.drop.dispose(); this.advect.dispose();
    this.quad.geometry.dispose();
  }

  /** Rebuilt arrays upload whole; in-place row refreshes upload only their
   * changed rows (three's DataTexture updateRanges, one texSubImage2D per row:
   * its ranges are counted in RGBA-element units and may not span rows, so the
   * RG current texture's ranges are given in the same pixel*4 units). */
  private uploadMask(): void {
    const size = this.mask.size;
    if (this.mask.dirtyAll) {
      this.maskTexture.image.data = this.mask.data; this.maskTexture.clearUpdateRanges();
      this.currentTexture.image.data = this.mask.current; this.currentTexture.clearUpdateRanges();
      this.maskFullPending = this.currentFullPending = true;
    } else {
      const rows = this.mask.dirtyRows;
      for (let z = 0; z < size; z++) {
        if (!rows[z]) continue;
        if (!this.maskFullPending) this.maskTexture.addUpdateRange(z * size * 4, size * 4);
        if (!this.currentFullPending) this.currentTexture.addUpdateRange(z * size * 4, size * 4);
      }
    }
    this.maskTexture.needsUpdate = true;
    this.currentTexture.needsUpdate = true;
    this.mask.clearDirty();
  }

  /**
   * Link all four pass programs on the first step, against the half-float
   * target and the tone mapping every pass draws with (perf10 f11, 16k walk
   * 10 D6). The drop pass first runs at the first contact and the advect pass
   * at the first current, often a minute after mount, and each then linked
   * synchronously on the frame it first drew. `compileAsync` builds each
   * pipeline off the frame; the one quad takes each material in turn.
   */
  private linkPasses(renderer: WebGPURenderer): void {
    this.linked = true;
    const own = this.quad.material;
    renderer.setRenderTarget(this.b);
    try {
      for (const material of [this.copy, this.drop, this.update, this.advect]) {
        this.quad.material = material;
        renderer.compileAsync(this.quad, this.quad.camera).catch(() => undefined);
      }
    } finally {
      this.quad.material = own;
    }
  }

  private renderPass(renderer: WebGPURenderer, material: NodeMaterial): void {
    this.prevNode.value = this.a.texture;
    this.quad.material = material;
    renderer.setRenderTarget(this.b);
    this.quad.render(renderer);
    const swap = this.a; this.a = this.b; this.b = swap;
  }
}
