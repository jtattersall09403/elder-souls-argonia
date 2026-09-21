/**
 * Per-frame rung gating (decision 0082 §3).
 *
 * The only per-frame CPU cost of the cell renderer: a loop over
 * cells × species × rungs (hundreds), never instances. A range whose band
 * cannot intersect the cell's distance range from the eye is switched off
 * through `BatchedMesh.setVisibleAt`.
 *
 * A rung's tiles are FLAT DATA, never objects: the tile CSR offsets and the
 * tile bounds are the arrays the species build already produced (shared by
 * reference, one copy per cell × species, not per rung), and a tile is
 * addressed by its index. 16 × 16 tiles of ~29 m replaced 8 × 8 of ~58 m
 * (round 2 addendum): the near rung's vertex load follows the tile size, not
 * the band.
 *
 * Visibility is distance AND a behind-the-camera test with hysteresis: a tile
 * whose centre is more than `BEHIND_MIN_M` behind the eye is off whatever its
 * band says, near rungs included — an off-screen shadow caster at 40 m is not
 * worth its vertices. Panning in place is still nearly free, because a tile
 * only flips as the forward vector crosses the two hysteresis cosines.
 *
 * Pure: no three.js at all.
 */

import { LOD_OPEN_M } from "../fx/lodFade";
import { CELL_TILES, TILE_BOUNDS_STRIDE } from "./cellBuild";

export interface GateBox {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Tiles per cell (`CELL_TILES` squared) — the length of every `state`. */
export const GATE_TILE_COUNT = CELL_TILES * CELL_TILES;

/** One rung of one species in one cell, tiled. */
export interface GateRung {
  /** (dIn, dOut, wIn, wOut), metres — the same band every copy carries. */
  band: [number, number, number, number];
  /** Rung index 0: the near rung, which casts shadows off-screen. */
  near: boolean;
  /** CSR offsets into the rung's instances per tile, shared with the build:
   * `GATE_TILE_COUNT + 1` entries, tile t is [t, t+1). Empty where equal. */
  tileOffsets: Uint32Array;
  /** Stride `TILE_BOUNDS_STRIDE` per tile, shared with the build. */
  tileBounds: Float32Array;
  /** Per tile: bit 0 the applied visibility, bit 1 the behind latch. */
  state: Uint8Array;
  /** Batch instance ids, one array per kit part, in tile order. Tile t's ids
   * of part p are `ids[p].subarray(tileOffsets[t], tileOffsets[t + 1])`. */
  ids: Int32Array[];
  /** Σ over tiles. */
  copies: number;
  triangles: number;
  /** Triangles one INSTANCE draws across all parts — what a tile's share of
   * `triangles` is computed from without walking parts. */
  trianglesPerInstance: number;
  /** Tiles currently switched on: lets a rung that is wholly out of band bail
   * without touching its tiles. */
  onTiles: number;
}

/** One species of one cell: the level the distance test resolves first. */
export interface GateSpecies {
  key: string;
  cell: string;
  species: string;
  maxDraw: number;
  cellBox: GateBox;
  /** Farthest a kit vertex lies from the pivot at scale 1: a tile's box is
   * its instance bounds grown by `reachM × the tile's max scale`. */
  reachM: number;
  rungs: GateRung[];
  /** True when any rung casts shadows (rung 0 exists). */
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

/** One tile's XZ box, instance bounds grown by the kit's reach at its scale. */
export function tileBox(
  bounds: Float32Array,
  tile: number,
  reachM: number,
  out: GateBox,
): GateBox {
  const b = tile * TILE_BOUNDS_STRIDE;
  const m = reachM * bounds[b + 6];
  out.minX = bounds[b] - m;
  out.minZ = bounds[b + 2] - m;
  out.maxX = bounds[b + 3] + m;
  out.maxZ = bounds[b + 5] + m;
  return out;
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

export interface GateStats {
  visibleCopies: number;
  visibleTriangles: number;
  /** Cell × species entries resolved. */
  checksCell: number;
  /** Per-tile distance tests — only boundary cells pay these. */
  checksTile: number;
}

/**
 * Distance margin, metres: every band is widened by this at both edges, so a
 * rung switches ON before the eye needs it and OFF well after. 8 m covers the
 * 2 m gate step plus a couple of frames of sprinting while the time-boxed
 * drain works through the flips; the 24 m of round 2 drew the near rung out to
 * ~140 m and was the vertex load the owner measured at 13 fps.
 */
export const GATE_MARGIN_M = 8;

/** Nearer than this, a tile is kept whatever the camera faces: it is under
 * the player's feet and its shadow reaches the screen. */
export const BEHIND_MIN_M = 40;
/** Forward·direction below this turns a tile off, above `BEHIND_ON` back on:
 * the gap is the hysteresis that stops a tile flipping as the camera jitters
 * around the boundary. */
const BEHIND_OFF = -0.5;
const BEHIND_ON = -0.2;

const scratchBox: GateBox = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };

/**
 * Resolve every tile's visibility, cheapest level first: a cell whose whole
 * distance range misses a band answers for all of its tiles at once, and only
 * a cell the band's edge crosses — or one far enough away to hold tiles
 * behind the camera — pays a test per tile. `apply(rung, tile, visible)` is
 * called only where the answer changed.
 */
export function gateSpecies(
  list: readonly GateSpecies[],
  eye: { x: number; y: number; z: number },
  forward: { x: number; z: number },
  apply: (rung: GateRung, tile: number, visible: boolean) => void,
  stats: GateStats,
  marginM: number = GATE_MARGIN_M,
): void {
  stats.visibleCopies = 0;
  stats.visibleTriangles = 0;
  stats.checksCell = 0;
  stats.checksTile = 0;
  for (const entry of list) {
    stats.checksCell++;
    const raw = rangeDistances(entry.cellBox, eye.x, eye.z);
    const dMin = Math.max(0, raw.dMin - marginM);
    const dMax = raw.dMax + marginM;
    // No tile of a cell wholly inside the behind radius can be behind, so the
    // whole-cell answers stay whole-cell answers close to the player.
    const mayBeBehind = raw.dMax > BEHIND_MIN_M;
    for (const rung of entry.rungs) {
      const dIn = rung.band[0];
      const dOut = rung.band[1];
      const wOut = rung.band[3];
      const open = dOut <= 0 || dOut >= LOD_OPEN_M;
      let mode: 0 | 1 | -1;
      if (dMax < dIn || (!open && dMin > dOut + wOut)) mode = 0;
      else if (dMin >= dIn && (open || dMax < dOut)) mode = 1;
      else mode = -1;
      if (mode === 0) {
        if (rung.onTiles === 0) continue;
        for (let t = 0; t < GATE_TILE_COUNT; t++) {
          if ((rung.state[t] & 1) === 0) continue;
          rung.state[t] &= ~1;
          rung.onTiles--;
          apply(rung, t, false);
        }
        continue;
      }
      const parts = rung.ids.length;
      const wholeCell = mode === 1 && !mayBeBehind;
      if (wholeCell) {
        stats.visibleCopies += rung.copies;
        stats.visibleTriangles += rung.triangles;
      }
      for (let t = 0; t < GATE_TILE_COUNT; t++) {
        const from = rung.tileOffsets[t];
        const count = rung.tileOffsets[t + 1] - from;
        if (count === 0) continue;
        let on: boolean;
        if (wholeCell) on = true;
        else {
          if (mode === 1) on = true;
          else {
            stats.checksTile++;
            const d = rangeDistances(
              tileBox(rung.tileBounds, t, entry.reachM, scratchBox),
              eye.x, eye.z);
            on = rungVisible(
              rung.band, Math.max(0, d.dMin - marginM), d.dMax + marginM);
          }
          if (on && mayBeBehind) on = !isBehind(rung, t, eye, forward);
          if (on) {
            stats.visibleCopies += count * parts;
            stats.visibleTriangles += count * rung.trianglesPerInstance;
          }
        }
        if (((rung.state[t] & 1) === 1) === on) continue;
        rung.state[t] = on ? (rung.state[t] | 1) : (rung.state[t] & ~1);
        rung.onTiles += on ? 1 : -1;
        apply(rung, t, on);
      }
    }
  }
}

/** The behind latch for one tile, updated in bit 1 of its state byte. */
function isBehind(
  rung: GateRung,
  tile: number,
  eye: { x: number; z: number },
  forward: { x: number; z: number },
): boolean {
  const b = tile * TILE_BOUNDS_STRIDE;
  const cx = (rung.tileBounds[b] + rung.tileBounds[b + 3]) / 2 - eye.x;
  const cz = (rung.tileBounds[b + 2] + rung.tileBounds[b + 5]) / 2 - eye.z;
  const len = Math.hypot(cx, cz);
  if (len <= BEHIND_MIN_M) {
    rung.state[tile] &= ~2;
    return false;
  }
  const dot = (cx * forward.x + cz * forward.z) / len;
  const latched = (rung.state[tile] & 2) !== 0;
  const behind = latched ? dot < BEHIND_ON : dot < BEHIND_OFF;
  if (behind) rung.state[tile] |= 2;
  else rung.state[tile] &= ~2;
  return behind;
}
