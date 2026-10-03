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
 * Per-instance this would be far too expensive, so `OcclusionMask` tests one
 * ray per 32 m cell and raises the target to the cell's canopy top: an
 * instance is only culled when even the tallest thing that could stand in its
 * cell is hidden. Conservative in both directions, and a rebuild pays a few
 * dozen rays rather than tens of thousands.
 *
 * Pure geometry: no three.js, no React. The ground sampler is injected.
 */

/** Metres from the eye that are never tested — the near ground is the eye's own. */
export const OCCLUSION_SKIP_M = 24;

/** Cell size of the mask, metres. */
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

/**
 * The ground as a frame path asks it (perf10 diag11 O1): the march lives
 * INSIDE the sampler and returns only the verdict, so no step hands back a
 * `number | null` (a boxed double per step in V8). `heightAt` is asked once
 * per cell, NaN where the ground is not decoded. The plain-sampler reference
 * march is `terrainOcclusionReference.testkit.ts`.
 */
export interface TerrainMarcher {
  /** Ground height, NaN when unknown. */
  heightAt(x: number, z: number): number;
  /** Is the terrain between eye and target above the sight line (points unpacked). */
  occluded(
    ex: number, ey: number, ez: number,
    tx: number, ty: number, tz: number,
    stepM: number, marginM: number,
  ): boolean;
}
