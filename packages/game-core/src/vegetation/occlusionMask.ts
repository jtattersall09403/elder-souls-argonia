/**
 * Terrain occlusion as a small mask the shader reads (decision 0082 §6,
 * amending 0071's "evaluated per rebuild" to "evaluated incrementally").
 *
 * One texel per 32 m cell over a window around the camera: 255 = hidden,
 * 0 = visible. A few cells are re-rayed per frame under the frame budget, so
 * the camera's live position drives the answer without a pass over instances.
 * The rule is 0071's, unchanged: the ray runs to the cell's CANOPY TOP, and
 * nothing within `OCCLUSION_MIN_DISTANCE_M` is ever culled.
 *
 * Pure apart from the `Uint8Array`; the renderer wraps `data` in a DataTexture.
 */

import {
  OCCLUSION_CELL_M,
  OCCLUSION_MAX_CANOPY_M,
  occludedByTerrain,
  type GroundSampler,
  type OcclusionPoint,
} from "../render/terrainOcclusion";

export class OcclusionMask {
  readonly data: Uint8Array;

  originCellX = 0;
  originCellZ = 0;

  hiddenCount = 0;

  private cursor = 0;

  constructor(
    readonly size = 128,
    readonly cellM = OCCLUSION_CELL_M,
  ) {
    this.data = new Uint8Array(size * size);
  }

  /**
   * Move the window. Everything reads visible again and the sweep restarts.
   * Returns true when the window MOVED, which is the texture-upload trigger:
   * the wipe itself has to reach the GPU or it keeps the old window's 255s.
   */
  anchor(originCellX: number, originCellZ: number): boolean {
    if (originCellX === this.originCellX && originCellZ === this.originCellZ) return false;
    this.originCellX = originCellX;
    this.originCellZ = originCellZ;
    this.reset();
    return true;
  }

  /**
   * Clear just the texels of the given world cells, flat (cellX, cellZ, …)
   * with `stride` numbers per cell. This is what a DROPPED cell does: its
   * answers are stale and nothing sweeps them any more, while every other
   * cell's answer is still good. Returns how many texels changed, the
   * texture-upload trigger.
   *
   * A newly BUILT cell needs no counterpart: its texels are either already
   * swept (a cell another chunk also occupies) or still 0 = visible.
   */
  clearCells(cells: ArrayLike<number>, stride = 2): number {
    let changed = 0;
    for (let i = 0; i + 1 < cells.length; i += stride) {
      const lx = cells[i] - this.originCellX;
      const lz = cells[i + 1] - this.originCellZ;
      if (lx < 0 || lz < 0 || lx >= this.size || lz >= this.size) continue;
      const at = lz * this.size + lx;
      if (this.data[at] === 0) continue;
      this.data[at] = 0;
      this.hiddenCount--;
      changed++;
    }
    return changed;
  }

  /** Clear every texel (only `anchor()`: the whole window moved). */
  reset(): void {
    this.data.fill(0);
    this.hiddenCount = 0;
    this.cursor = 0;
  }

  /** True when the world cell holding (x, z) is marked hidden. */
  hidden(x: number, z: number): boolean {
    const cx = Math.floor(x / this.cellM) - this.originCellX;
    const cz = Math.floor(z / this.cellM) - this.originCellZ;
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return false;
    return this.data[cz * this.size + cx] > 0;
  }

  /**
   * Evaluate up to `n` cells from `occupied` — a flat (cellX, cellZ) list of
   * the world cells that actually hold instances — round-robin from where the
   * last sweep stopped. Iterating the OCCUPIED list rather than the 16 k
   * texels is what keeps the sweep cheap where the window is mostly empty.
   * Returns how many texels changed (the texture upload trigger).
   */
  sweep(
    n: number,
    eye: OcclusionPoint,
    groundAt: GroundSampler,
    canopyM: number,
    minDistanceM: number,
    occupied: Int32Array,
  ): { evaluated: number; changed: number; hidden: number } {
    const cells = occupied.length >> 1;
    let evaluated = 0;
    let changed = 0;
    let scanned = 0;
    const canopy = Math.min(OCCLUSION_MAX_CANOPY_M, Math.max(0, canopyM));
    if (this.cursor >= cells) this.cursor = 0;
    while (evaluated < n && scanned < cells) {
      const slot = this.cursor;
      this.cursor = cells === 0 ? 0 : (this.cursor + 1) % cells;
      scanned++;
      const cx = occupied[slot * 2];
      const cz = occupied[slot * 2 + 1];
      const lx = cx - this.originCellX;
      const lz = cz - this.originCellZ;
      if (lx < 0 || lz < 0 || lx >= this.size || lz >= this.size) continue;
      const at = lz * this.size + lx;
      evaluated++;
      const centreX = (cx + 0.5) * this.cellM;
      const centreZ = (cz + 0.5) * this.cellM;
      let result = false;
      if (Math.hypot(centreX - eye.x, centreZ - eye.z) > minDistanceM) {
        const ground = groundAt(centreX, centreZ);
        if (ground !== null) {
          result = occludedByTerrain(
            eye, { x: centreX, y: ground + canopy, z: centreZ }, groundAt);
        }
      }
      const value = result ? 255 : 0;
      if (this.data[at] !== value) {
        this.data[at] = value;
        this.hiddenCount += result ? 1 : -1;
        changed++;
      }
    }
    return { evaluated, changed, hidden: this.hiddenCount };
  }
}
