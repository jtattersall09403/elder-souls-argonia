/**
 * Per-frame rung gating (decision 0082 §3).
 *
 * The only per-frame CPU cost of the cell renderer: a loop over
 * cells × species × rungs (hundreds), never instances. A range whose band
 * cannot intersect the cell's distance range from the eye is switched off
 * through `BatchedMesh.setVisibleAt`; a range whose cell is outside the
 * frustum is switched off too, EXCEPT the nearest rung, which casts shadows
 * into view from off-screen.
 *
 * Pure: no three.js beyond the frustum's `intersectsSphere` shape.
 */

import { LOD_OPEN_M } from "../fx/lodFade";

export interface GateBox {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface GateSphere {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** One 58 m gate tile of one rung: the unit that is switched on or off. */
export interface GateTile {
  box: GateBox;
  /** Batch instance ids, one array per kit part. */
  ids: Int32Array[];
  /** Batch copies in this tile (instances × parts). */
  copies: number;
  triangles: number;
}

/** One rung of one species in one cell, tiled. */
export interface GateRung {
  /** (dIn, dOut, wIn, wOut), metres — the same band every copy carries. */
  band: [number, number, number, number];
  /** Rung index 0: the near rung, which casts shadows off-screen. */
  near: boolean;
  /** Non-empty tiles only. */
  tiles: GateTile[];
  /** Last applied visibility, one byte per tile. */
  state: Uint8Array;
  /** Σ over tiles. */
  copies: number;
  triangles: number;
  /** 1 all on, 0 all off, −1 mixed — the last state applied. */
  uniform: number;
}

/** One species of one cell: the level the distance test resolves first. */
export interface GateSpecies {
  key: string;
  cell: string;
  species: string;
  maxDraw: number;
  cellBox: GateBox;
  cellSphere: GateSphere;
  rungs: GateRung[];
  /** True when any rung casts shadows and so escapes the frustum test. */
  near: boolean;
}

/** XZ distances from an eye to a box: 0 inside, and the farthest corner. */
export function rangeDistances(
  box: GateBox,
  eyeX: number,
  eyeZ: number,
): { dMin: number; dMax: number } {
  const dx = Math.max(box.minX - eyeX, 0, eyeX - box.maxX);
  const dz = Math.max(box.minZ - eyeZ, 0, eyeZ - box.maxZ);
  const fx = Math.max(Math.abs(eyeX - box.minX), Math.abs(eyeX - box.maxX));
  const fz = Math.max(Math.abs(eyeZ - box.minZ), Math.abs(eyeZ - box.maxZ));
  return { dMin: Math.hypot(dx, dz), dMax: Math.hypot(fx, fz) };
}

/**
 * Whether a band can hold any distance in [dMin, dMax]. The outer edge allows
 * for the dithered vanish half-width, so a range is never switched off while
 * some of its copies are still fading.
 */
export function rungVisible(
  band: readonly [number, number, number, number],
  dMin: number,
  dMax: number,
): boolean {
  const [dIn, dOut, , wOut] = band;
  if (!(dIn <= 0 || dMax >= dIn)) return false;
  if (dOut <= 0 || dOut >= LOD_OPEN_M) return true;
  return dMin < dOut + wOut;
}

export interface GateFrustum {
  intersectsSphere(sphere: GateSphere): boolean;
}

export interface GateStats {
  visibleCopies: number;
  visibleTriangles: number;
  /** Cell × species entries resolved. */
  checksCell: number;
  /** Per-tile distance tests — only boundary cells pay these. */
  checksTile: number;
}

/**
 * Resolve every tile's visibility, cheapest level first: a cell whose whole
 * distance range misses a band, or which lies wholly inside one, answers for
 * all 64 of its tiles at once, and only a cell the band's edge CROSSES pays a
 * test per tile. `apply` is called only where the answer changed.
 */
export function gateSpecies(
  list: readonly GateSpecies[],
  eye: { x: number; y: number; z: number },
  frustum: GateFrustum | null,
  apply: (tile: GateTile, visible: boolean) => void,
  stats: GateStats,
): void {
  stats.visibleCopies = 0;
  stats.visibleTriangles = 0;
  stats.checksCell = 0;
  stats.checksTile = 0;
  for (const entry of list) {
    stats.checksCell++;
    const { dMin, dMax } = rangeDistances(entry.cellBox, eye.x, eye.z);
    // The near rung is never frustum-culled: it casts into the cascades from
    // behind the camera, and dropping it drops the shadow with it.
    const offScreen = frustum !== null && !frustum.intersectsSphere(entry.cellSphere);
    for (const rung of entry.rungs) {
      const dIn = rung.band[0];
      const dOut = rung.band[1];
      const wOut = rung.band[3];
      const open = dOut <= 0 || dOut >= LOD_OPEN_M;
      let mode: 0 | 1 | -1;
      if (offScreen && !rung.near) mode = 0;
      else if (dMax < dIn || (!open && dMin > dOut + wOut)) mode = 0;
      else if (dMin >= dIn && (open || dMax < dOut)) mode = 1;
      else mode = -1;
      if (mode === 0) {
        if (rung.uniform === 0) continue;
        for (let i = 0; i < rung.tiles.length; i++) {
          if (rung.state[i] === 0) continue;
          rung.state[i] = 0;
          apply(rung.tiles[i], false);
        }
        rung.uniform = 0;
        continue;
      }
      if (mode === 1) {
        stats.visibleCopies += rung.copies;
        stats.visibleTriangles += rung.triangles;
        if (rung.uniform === 1) continue;
        for (let i = 0; i < rung.tiles.length; i++) {
          if (rung.state[i] === 1) continue;
          rung.state[i] = 1;
          apply(rung.tiles[i], true);
        }
        rung.uniform = 1;
        continue;
      }
      for (let i = 0; i < rung.tiles.length; i++) {
        const tile = rung.tiles[i];
        stats.checksTile++;
        const d = rangeDistances(tile.box, eye.x, eye.z);
        const on = rungVisible(rung.band, d.dMin, d.dMax);
        if (on) {
          stats.visibleCopies += tile.copies;
          stats.visibleTriangles += tile.triangles;
        }
        if ((rung.state[i] === 1) === on) continue;
        rung.state[i] = on ? 1 : 0;
        apply(tile, on);
      }
      rung.uniform = -1;
    }
  }
}
