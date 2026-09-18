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
  const dx = target.x - eye.x;
  const dz = target.z - eye.z;
  const distance = Math.hypot(dx, dz);
  if (!(distance > OCCLUSION_SKIP_M) || !(stepM > 0)) return false;
  for (let s = OCCLUSION_SKIP_M; s < distance; s += stepM) {
    const t = s / distance;
    const ground = groundAt(eye.x + dx * t, eye.z + dz * t);
    if (ground === null) continue; // unknown ground never occludes
    if (ground + marginM > eye.y + (target.y - eye.y) * t) return true;
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
      result = occludedByTerrain(
        this.eye, { x: centreX, y: top, z: centreZ }, this.groundAt,
      );
    }
    this.cells.set(key, result);
    return result;
  }
}
