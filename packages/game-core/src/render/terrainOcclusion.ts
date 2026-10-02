/**
 * Terrain occlusion culling for scattered things.
 *
 * A ridge, a bluff or a river bank hides everything behind it, but the GPU
 * only learns that after transforming, shading and depth-testing every one of
 * those instances. In a province of drowned ridges and levees that is a large
 * fraction of the vegetation budget spent on geometry no player can see.
 *
 * The test is the standard cheap one: march the straight line from the eye to
 * the thing over XZ, and if the ground plus a small margin rises above that
 * line anywhere along it, the thing is behind a hill. Ground the streamer has
 * not decoded reads as NOT occluding — an unknown always draws, so a missing
 * chunk can never blank a hillside.
 *
 * Per-instance this would be far too expensive, so `OcclusionCellCache` tests
 * one ray per 32 m cell and raises the target to the cell's canopy top: an
 * instance is only culled when even the tallest thing that could stand in its
 * cell is hidden. Conservative in both directions, and a rebuild pays a few
 * dozen rays rather than tens of thousands.
 *
 * Pure geometry: no three.js, no React. The ground sampler is injected.
 */

/** Metres from the eye that are never tested — the near ground is the eye's own. */
export const OCCLUSION_SKIP_M = 24;

/** Cell size of the cache, metres. */
export const OCCLUSION_CELL_M = 32;

/**
 * Metres. Nothing nearer than this is ever occlusion-culled. A rebuild happens
 * every 16 m of movement, so a near instance culled on one rebuild can pop
 * back on the next — and a pop at arm's length is far worse than the handful
 * of triangles it saved.
 */
export const OCCLUSION_MIN_DISTANCE_M = 120;

/** Ceiling on the canopy height added to a cell's ground, metres. */
export const OCCLUSION_MAX_CANOPY_M = 40;

export interface OcclusionPoint {
  x: number;
  y: number;
  z: number;
}

export type GroundSampler = (x: number, z: number) => number | null;

/**
 * The ground as a frame path asks it (perf10 diag11 O1): the march lives
 * INSIDE the sampler and returns only the verdict, so no step hands back a
 * `number | null` (a boxed double per step in V8). `heightAt` is asked once
 * per cell, NaN where the ground is not decoded. Same verdicts as
 * `occludedByTerrain` over the equivalent `GroundSampler`.
 */
export interface TerrainMarcher {
  /** Ground height, NaN when unknown. */
  heightAt(x: number, z: number): number;
  /** `occludedByTerrain(eye, target, …, stepM, marginM)`, points unpacked. */
  occluded(
    ex: number, ey: number, ez: number,
    tx: number, ty: number, tz: number,
    stepM: number, marginM: number,
  ): boolean;
}

/** A `TerrainMarcher` over a plain sampler function: tests and tooling only,
 * never a frame path (every step calls the closure). */
export class FunctionTerrainMarcher implements TerrainMarcher {
  private readonly eye: OcclusionPoint = { x: 0, y: 0, z: 0 };
  private readonly target: OcclusionPoint = { x: 0, y: 0, z: 0 };
  constructor(private readonly groundAt: GroundSampler) {}
  heightAt(x: number, z: number): number {
    const h = this.groundAt(x, z);
    return h === null ? NaN : h;
  }
  occluded(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number,
    stepM: number, marginM: number): boolean {
    const e = this.eye, t = this.target;
    e.x = ex; e.y = ey; e.z = ez; t.x = tx; t.y = ty; t.z = tz;
    return occludedByTerrain(e, t, this.groundAt, stepM, marginM);
  }
}

/**
 * True when the terrain between `eye` and `target` rises above the sight line.
 *
 * `marginM` is the slack that stops a target standing ON the ground from
 * occluding itself through sampling noise.
 */
export function occludedByTerrain(
  eye: OcclusionPoint,
  target: OcclusionPoint,
  groundAt: GroundSampler,
  stepM = 12,
  marginM = 1.0,
): boolean {
  // Plain number locals only: the march allocates nothing (diag10 C3). The
  // sampler is the caller's stable bound function, so the call site stays
  // monomorphic and the engine inlines it.
  const ex = eye.x, ey = eye.y, ez = eye.z;
  const dx = target.x - ex;
  const dy = target.y - ey;
  const dz = target.z - ez;
  const distance = Math.hypot(dx, dz);
  if (!(distance > OCCLUSION_SKIP_M) || !(stepM > 0)) return false;
  for (let s = OCCLUSION_SKIP_M; s < distance; s += stepM) {
    const t = s / distance;
    const ground = groundAt(ex + dx * t, ez + dz * t);
    if (ground === null) continue; // unknown ground never occludes
    if (ground + marginM > ey + dy * t) return true;
  }
  return false;
}

/**
 * One occlusion ray per 32 m cell, memoised for the life of a rebuild.
 *
 * The target is the cell's CANOPY TOP (ground at the cell centre plus the
 * tallest species the kit can place there, capped), so the answer is valid for
 * every instance in the cell: if the top of the tallest possible plant is
 * hidden, so is everything under it.
 */
export class OcclusionCellCache {
  private readonly cells = new Map<number, boolean>();
  /** The ray's target, reused per cell (diag9 A2: no object per test). */
  private readonly target: OcclusionPoint = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly eye: OcclusionPoint,
    private readonly groundAt: GroundSampler,
    /** Tallest species height in the kit, metres. */
    private readonly canopyM: number,
  ) {}

  /** How many cells have been tested — the rebuild's ray count. */
  get tested(): number {
    return this.cells.size;
  }

  /** True when the cell holding (x, z) is behind terrain from the eye. */
  occluded(x: number, z: number): boolean {
    const cx = Math.floor(x / OCCLUSION_CELL_M);
    const cz = Math.floor(z / OCCLUSION_CELL_M);
    // One integer key: cheaper than a template string on every instance.
    const key = (cx + 32768) * 65536 + (cz + 32768);
    const cached = this.cells.get(key);
    if (cached !== undefined) return cached;
    const centreX = (cx + 0.5) * OCCLUSION_CELL_M;
    const centreZ = (cz + 0.5) * OCCLUSION_CELL_M;
    const ground = this.groundAt(centreX, centreZ);
    let result = false;
    if (ground !== null) {
      const top =
        ground + Math.min(OCCLUSION_MAX_CANOPY_M, Math.max(0, this.canopyM));
      const target = this.target;
      target.x = centreX; target.y = top; target.z = centreZ;
      result = occludedByTerrain(this.eye, target, this.groundAt);
    }
    this.cells.set(key, result);
    return result;
  }
}
