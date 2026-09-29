/**
 * The plain-number side of GPU-driven culling (decision 0108 §7, tsl-shaders.md
 * §4): what the compute pass in `GpuCullSystem.ts` decides per candidate,
 * written once in TypeScript so it is unit-tested without a GPU. The node
 * graph mirrors these functions line for line.
 *
 * A candidate is KEPT (appended to its draw's compacted list) when
 *   1. its bounding sphere, swept along the sun shadow when its draw casts,
 *      touches all six camera frustum planes (`sphereSweptInFrustum`), and
 *   2. the LOD fade the vertex shader will compute for it does not collapse it
 *      (`bandKeeps`: `lodCopyCollapsed(lodFadeFactorsOver(...))` from
 *      `fx/lodFade.ts`, with every edge moved `BAND_EPS_M` the permissive way so
 *      the kept set is a superset of the copies the shader draws: the shader
 *      still collapses the rest exactly, so pixels match the CPU path).
 * A draw flagged `fromZero` (the casting mid rung, `shadowBandFromZero`) keeps
 * copies nearer than its inner edge: its shadow pass draws them.
 */
import {
  BAYER4_MAX, LOD_FADE_SAMPLES, LOD_OPEN_M, lodCopyCollapsed, lodFadeFactorsOver,
} from "../../fx/lodFade";

/** Metres every band edge is moved the permissive way in the cull (float slack
 * between the compute's distance and the vertex shader's). */
export const BAND_EPS_M = 0.05;

/** Longest horizontal sweep of a caster's sphere along the sun shadow, metres
 * (the vegetation gate's `SHADOW_REACH_MAX_M`). */
export const SWEEP_MAX_M = 120;

/** Per-draw flags (`drawInfo.z`). */
export const DRAW_CASTS = 1;
export const DRAW_FROM_ZERO = 2;
/** The draw has no LOD band: frustum only (a plain instanced prop). */
export const DRAW_NO_BAND = 4;

/** Empty candidate slot marker (`candDraw`). */
export const EMPTY_DRAW = 0xffffffff;

/** u32 words per draw in the indirect buffer (drawIndexedIndirect's 5). */
export const INDIRECT_STRIDE = 5;

/**
 * The indirect args for one draw: indexed `[indexCount, instanceCount,
 * firstIndex, baseVertex, firstInstance]`, non-indexed `[vertexCount,
 * instanceCount, firstVertex, firstInstance, 0]`. `instanceCount` (word 1) is
 * the one the compute writes.
 */
export function indirectArgs(
  indexed: boolean,
  count: number,
  start: number,
  firstInstance: number,
): [number, number, number, number, number] {
  return indexed
    ? [count, 0, start, 0, firstInstance]
    : [count, 0, start, firstInstance, 0];
}

/** The sun sweep a caster's sphere takes: horizontal unit direction light
 * travels and metres of shadow per metre of height; null = no sun shadow. */
export interface SunSweep {
  x: number;
  z: number;
  perM: number;
}

/**
 * Whether a sphere (centre `c`, radius `r`), swept horizontally by the sun
 * shadow of a caster about `2r` tall when `sweep` is given, touches every plane
 * of `planes` (6 × (nx, ny, nz, d), THREE.Frustum's inward convention:
 * `n·p + d >= 0` inside).
 */
export function sphereSweptInFrustum(
  planes: ArrayLike<number>,
  cx: number, cy: number, cz: number, r: number,
  sweep: SunSweep | null,
): boolean {
  let sx = 0;
  let sz = 0;
  if (sweep) {
    const len = Math.min(SWEEP_MAX_M, 2 * r * sweep.perM);
    sx = sweep.x * len;
    sz = sweep.z * len;
  }
  for (let p = 0; p < 6; p++) {
    const nx = planes[p * 4];
    const ny = planes[p * 4 + 1];
    const nz = planes[p * 4 + 2];
    const dist = nx * cx + ny * cy + nz * cz + planes[p * 4 + 3];
    const gain = Math.max(0, nx * sx + nz * sz);
    if (dist + gain < -r) return false;
  }
  return true;
}

/**
 * Whether the LOD band keeps a copy with pivot (`px`, `pz`) this frame, the
 * camera at (`vx`, `vz`) with history `offsets` (LOD_FADE_SAMPLES × (dx, dz),
 * `esLodHist`). Edges widened by `BAND_EPS_M`; `fromZero` ignores the inner edge.
 */
export function bandKeeps(
  band: readonly [number, number, number, number],
  px: number, pz: number,
  vx: number, vz: number,
  offsets: ArrayLike<number>,
  fromZero: boolean,
): boolean {
  const [dIn, dOut, wIn, wOut] = band;
  const widened: [number, number, number, number] = [
    fromZero || dIn <= 0 ? 0 : Math.max(1e-6, dIn - BAND_EPS_M),
    dOut <= 0 || dOut >= LOD_OPEN_M ? dOut : dOut + BAND_EPS_M,
    wIn, wOut,
  ];
  const distances: number[] = [];
  for (let k = 0; k < LOD_FADE_SAMPLES; k++) {
    distances.push(Math.hypot(vx + offsets[k * 2] - px, vz + offsets[k * 2 + 1] - pz));
  }
  return !lodCopyCollapsed(lodFadeFactorsOver(widened, distances));
}

/** Re-exported so the graph and the tests read one constant. */
export { BAYER4_MAX, LOD_FADE_SAMPLES, LOD_OPEN_M };

/**
 * First-fit allocator of contiguous row ranges in a fixed arena (the compacted
 * output rows each draw owns). Freed ranges merge with their neighbours.
 */
export class RangeAllocator {
  private free: Array<{ base: number; size: number }>;
  constructor(readonly capacity: number) {
    this.free = capacity > 0 ? [{ base: 0, size: capacity }] : [];
  }
  /** Base row of a fresh range of `size`, or -1 when the arena is full. */
  alloc(size: number): number {
    for (let i = 0; i < this.free.length; i++) {
      const f = this.free[i];
      if (f.size < size) continue;
      const base = f.base;
      f.base += size;
      f.size -= size;
      if (f.size === 0) this.free.splice(i, 1);
      return base;
    }
    return -1;
  }
  release(base: number, size: number): void {
    if (size <= 0) return;
    let i = 0;
    while (i < this.free.length && this.free[i].base < base) i++;
    this.free.splice(i, 0, { base, size });
    // Merge with the next, then the previous.
    const cur = this.free[i];
    const next = this.free[i + 1];
    if (next && cur.base + cur.size === next.base) {
      cur.size += next.size;
      this.free.splice(i + 1, 1);
    }
    const prev = this.free[i - 1];
    if (prev && prev.base + prev.size === cur.base) {
      prev.size += cur.size;
      this.free.splice(i, 1);
    }
  }
  /** Rows not handed out. */
  get available(): number {
    return this.free.reduce((s, f) => s + f.size, 0);
  }
}

/** Free-list allocator of single slots (candidates), with a high-water mark
 * the compute dispatch covers. */
export class SlotAllocator {
  private freeSlots: number[] = [];
  /** Slots ever handed out: the cull dispatch covers `[0, high)`. */
  high = 0;
  constructor(readonly capacity: number) {}
  alloc(): number {
    const s = this.freeSlots.pop();
    if (s !== undefined) return s;
    if (this.high >= this.capacity) return -1;
    return this.high++;
  }
  release(slot: number): void {
    this.freeSlots.push(slot);
  }
  get used(): number {
    return this.high - this.freeSlots.length;
  }
}

/** One draw as the cull reads it (the CPU twin of `drawInfo` / `drawBand`). */
export interface CullDraw {
  /** Sphere radius (unscaled, horizontal centre offset folded in) and centre height. */
  radius: number;
  centreY: number;
  flags: number;
  band: readonly [number, number, number, number] | null;
}

/**
 * The whole per-candidate decision the compute makes, on the CPU: `m` is the
 * candidate's column-major instance matrix (`Matrix4.elements`), `viewX/Z`
 * the camera (`esLodViewPos`), `offsets` the lodFade history.
 */
export function candidateKept(
  planes: ArrayLike<number>,
  m: ArrayLike<number>,
  draw: CullDraw,
  viewX: number, viewZ: number,
  offsets: ArrayLike<number>,
  sweep: SunSweep | null,
): boolean {
  const scale = Math.max(
    Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
  const r = draw.radius * scale;
  const cx = m[12] + m[4] * draw.centreY;
  const cy = m[13] + m[5] * draw.centreY;
  const cz = m[14] + m[6] * draw.centreY;
  const casts = (draw.flags & DRAW_CASTS) !== 0 && sweep !== null && sweep.perM > 0;
  if (!sphereSweptInFrustum(planes, cx, cy, cz, r, casts ? sweep : null)) return false;
  if ((draw.flags & DRAW_NO_BAND) !== 0 || !draw.band) return true;
  return bandKeeps(draw.band, m[12], m[14], viewX, viewZ, offsets, (draw.flags & DRAW_FROM_ZERO) !== 0);
}
