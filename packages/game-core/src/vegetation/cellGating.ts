/**
 * Per-frame rung gating (decision 0082 §3).
 *
 * The only per-frame CPU cost of the cell renderer: a loop over
 * cells × species × rungs (hundreds), never instances. A range whose band
 * cannot intersect the cell's distance range from the eye is switched off
 * by moving them in and out of each instanced mesh's visible prefix.
 *
 * A rung's tiles are FLAT DATA, never objects: the tile CSR offsets and the
 * tile bounds are the arrays the species build already produced (shared by
 * reference, one copy per cell × species, not per rung), and a tile is
 * addressed by its index. 16 × 16 tiles of ~29 m replaced 8 × 8 of ~58 m
 * (round 2 addendum): the near rung's vertex load follows the tile size, not
 * the band.
 *
 * Visibility is distance AND the view frustum (walk 5, 2026-09-29): a tile's
 * box (instance bounds grown by the kit's reach) is tested against the
 * camera's four side planes, widened by an angle so a quick turn finds the
 * copies already resident, with hysteresis (a tile goes out beyond
 * `VIEW_OFF_MARGIN_DEG`, comes back inside `VIEW_ON_MARGIN_DEG`). A rung that
 * casts the sun shadow is tested with its box swept along the shadow, so a
 * tree behind the camera whose shadow falls on screen stays, and nothing else
 * does (at night nothing casts and nothing is kept).
 * Before this the only direction test dropped a tile more than ~120° off the
 * view line, so about two thirds of the submitted copies were off screen.
 * Without a view (`view` omitted) the old behind-latch rule runs, kept for the
 * measurement harness's before/after only.
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
  /** Rung index 0 (the full-mesh rung). */
  near: boolean;
  /** This rung's depth copy casts the sun shadow: it keeps the near ring
   * whatever the camera faces (`CASTER_KEEP_M`). */
  casts?: boolean;
  /** Its depth copy casts from distance 0 (`shadowBandFromZero`), so the gate
   * must keep it from 0 too, not from its band's inner edge: otherwise every
   * tree nearer than that edge lost its shadow. */
  castsFromZero?: boolean;
  /** Tallest instance height at scale 1, metres (the box's top). Absent: the
   * kit reach is used, which is never smaller. */
  heightM?: number;
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

/** XZ distances from an eye to a box: 0 inside, and the farthest corner.
 * Written into the caller's `out` (diag9 A4: a new object per cell per frame
 * was 30 MB of garbage on a walk). */
export interface RangeDistances { dMin: number; dMax: number }

export function rangeDistances(
  box: GateBox,
  eyeX: number,
  eyeZ: number,
  out: RangeDistances,
): RangeDistances {
  const dx = Math.max(box.minX - eyeX, 0, eyeX - box.maxX);
  const dz = Math.max(box.minZ - eyeZ, 0, eyeZ - box.maxZ);
  const fx = Math.max(Math.abs(eyeX - box.minX), Math.abs(eyeX - box.maxX));
  const fz = Math.max(Math.abs(eyeZ - box.minZ), Math.abs(eyeZ - box.maxZ));
  out.dMin = Math.hypot(dx, dz);
  out.dMax = Math.hypot(fx, fz);
  return out;
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
  fromZero = false,
): boolean {
  const [dIn0, dOut, wIn, wOut] = band;
  const dIn = fromZero ? 0 : dIn0 - wIn;
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

/** Nearer than this, a tile is kept whatever the camera faces (legacy rule,
 * no view given). */
export const BEHIND_MIN_M = 40;
/** Legacy name of the caster ring, kept for the no-view path only. The view
 * path sweeps a casting tile along the sun instead (`GateView.shadow`). */
export const CASTER_KEEP_M = BEHIND_MIN_M;
/** Angle added to each side of the real frustum. A tile in view stays in
 * until it is `OFF` degrees outside, and a tile out of view comes back once it
 * is within `ON` degrees: the gap is the hysteresis, and `ON` is larger than
 * the gate's re-run turn (`GATE_TURN_RAD` in the renderer, 8°) so a turn
 * never shows a tile before the pass that switches it on. */
export const VIEW_ON_MARGIN_DEG = 15;
export const VIEW_OFF_MARGIN_DEG = 25;

/** The camera's four side planes (inward normal nx, ny, nz, then d), twice:
 * widened by the ON margin and by the OFF margin. */
export interface GateView {
  on: Float64Array;
  off: Float64Array;
  /** The sun shadow, when one is cast: the horizontal direction light travels
   * (unit x, z) and metres of shadow per metre of height (1 / tan elevation,
   * capped by `SHADOW_REACH_MAX_M`). A casting rung's tile is kept when its box
   * swept along that shadow touches the view. Null: no shadow is cast (night,
   * storm, `?vegshadow=0`), so casting rungs are culled like any other. */
  shadow?: { x: number; z: number; perM: number } | null;
}

/** Longest shadow the caster test sweeps a tile by, metres: the CSM cascade
 * reach in character mode is 160 m, and a low sun past that is haze. */
export const SHADOW_REACH_MAX_M = 120;

/** Tallest caster the shadow-pass test allows for, metres (the occlusion
 * canopy cap: no kit tree stands taller). */
export const CASTER_HEIGHT_MAX_M = 40;

/** Radial over depth: the cascade is bounded by view DEPTH, and a copy at the
 * frustum's corner lies up to this much farther in plan than its depth
 * (≈ 1 / cos of the corner half-angle at the studio's 70° vertical fov, 16:9). */
export const CASCADE_CORNER_FACTOR = 1.6;

/**
 * Whether a casting batch whose nearest visible copy is `nearestM` (XZ,
 * metres; Infinity = none on) can put a shadow inside the sun cascade that
 * ends at view depth `cascadeFarM` (diag9 C1). A copy farther than the
 * cascade's corner reach plus the longest shadow a caster can throw towards
 * the camera, plus the gate margin, shadows nothing the cascade covers, so a
 * batch wholly beyond it is dropped from the shadow pass: one draw per batch
 * saved, and the near cascade's content is unchanged. `shadow` null: no sun
 * shadow is cast at all.
 */
export function casterReachesCascade(
  nearestM: number,
  cascadeFarM: number,
  shadow: { perM: number } | null,
): boolean {
  if (!shadow) return false;
  if (!Number.isFinite(cascadeFarM)) return nearestM !== Infinity;
  const reach = cascadeFarM * CASCADE_CORNER_FACTOR
    + Math.min(SHADOW_REACH_MAX_M, CASTER_HEIGHT_MAX_M * shadow.perM) + GATE_MARGIN_M;
  return nearestM <= reach;
}

/**
 * The cascades a casting batch reaches (diag20 E5c): bit i set when the batch
 * can shadow inside cascade i, whose view depth ends at `cascadeFarsM[i]`
 * (ascending; `count` of them). The far cascades take the batch the near
 * ones cannot, so a batch past the first cascade's reach is drawn into the
 * later cascades only. 0: it casts into none.
 */
export function casterCascadeMask(
  nearestM: number,
  cascadeFarsM: ArrayLike<number>,
  count: number,
  shadow: { perM: number } | null,
): number {
  let mask = 0;
  for (let i = 0; i < count; i++) {
    if (casterReachesCascade(nearestM, cascadeFarsM[i], shadow)) mask |= 1 << i;
  }
  return mask;
}

/** What `viewPlanesFor` reads: a THREE.PerspectiveCamera fits it. */
export interface GateCamera {
  position: { x: number; y: number; z: number };
  matrixWorld: { elements: ArrayLike<number> };
  /** Vertical field of view, degrees. */
  fov: number;
  aspect: number;
}

function sidePlanes(
  cam: GateCamera, marginRad: number, out: Float64Array,
): Float64Array {
  const e = cam.matrixWorld.elements;
  // Columns of the world matrix: right, up, back.
  const rx = e[0], ry = e[1], rz = e[2];
  const ux = e[4], uy = e[5], uz = e[6];
  const fx = -e[8], fy = -e[9], fz = -e[10];
  const rl = Math.hypot(rx, ry, rz) || 1;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const halfV = (cam.fov * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * cam.aspect);
  const cap = Math.PI / 2;
  const a = Math.min(cap, halfH + marginRad);
  const b = Math.min(cap, halfV + marginRad);
  // Inward normals: forward·sin(half) ∓ axis·cos(half). Written straight into
  // `out` (diag10 C3: no arrays per call; it runs every frame).
  const p = cam.position;
  writePlane(out, 0, fx / fl, fy / fl, fz / fl, -rx / rl, -ry / rl, -rz / rl, a, p);
  writePlane(out, 1, fx / fl, fy / fl, fz / fl, rx / rl, ry / rl, rz / rl, a, p);
  writePlane(out, 2, fx / fl, fy / fl, fz / fl, -ux / ul, -uy / ul, -uz / ul, b, p);
  writePlane(out, 3, fx / fl, fy / fl, fz / fl, ux / ul, uy / ul, uz / ul, b, p);
  return out;
}

function writePlane(
  out: Float64Array, i: number,
  fx: number, fy: number, fz: number,
  ax: number, ay: number, az: number,
  half: number, p: { x: number; y: number; z: number },
): void {
  const s = Math.sin(half);
  const c = Math.cos(half);
  const nx = fx * s + ax * c;
  const ny = fy * s + ay * c;
  const nz = fz * s + az * c;
  out[i * 4] = nx;
  out[i * 4 + 1] = ny;
  out[i * 4 + 2] = nz;
  out[i * 4 + 3] = -(nx * p.x + ny * p.y + nz * p.z);
}

/** The widened side planes of a perspective camera, for `gateSpecies`. Call
 * after the camera's world matrix is current; `into` is reused if given. */
export function viewPlanesFor(cam: GateCamera, into?: GateView): GateView {
  const view = into ?? { on: new Float64Array(16), off: new Float64Array(16) };
  sidePlanes(cam, (VIEW_ON_MARGIN_DEG * Math.PI) / 180, view.on);
  sidePlanes(cam, (VIEW_OFF_MARGIN_DEG * Math.PI) / 180, view.off);
  return view;
}

/** Whether an axis-aligned box touches the inside of all four planes. */
export function boxInPlanes(
  planes: Float64Array,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): boolean {
  for (let i = 0; i < 16; i += 4) {
    const nx = planes[i], ny = planes[i + 1], nz = planes[i + 2];
    const px = nx >= 0 ? maxX : minX;
    const py = ny >= 0 ? maxY : minY;
    const pz = nz >= 0 ? maxZ : minZ;
    if (nx * px + ny * py + nz * pz + planes[i + 3] < 0) return false;
  }
  return true;
}
/** Forward·direction below this turns a tile off, above `BEHIND_ON` back on:
 * the gap is the hysteresis that stops a tile flipping as the camera jitters
 * around the boundary. */
const BEHIND_OFF = -0.5;
const BEHIND_ON = -0.2;

/** `rangeDistances` as plain numbers (diag10 C3/D: no scratch object, no
 * module state): nearest and farthest XZ distance from the eye to a box. */
function rangeMin(minX: number, minZ: number, maxX: number, maxZ: number, ex: number, ez: number): number {
  return Math.hypot(Math.max(minX - ex, 0, ex - maxX), Math.max(minZ - ez, 0, ez - maxZ));
}
function rangeMax(minX: number, minZ: number, maxX: number, maxZ: number, ex: number, ez: number): number {
  return Math.hypot(
    Math.max(Math.abs(ex - minX), Math.abs(ex - maxX)),
    Math.max(Math.abs(ez - minZ), Math.abs(ez - maxZ)));
}

/**
 * Resolve every tile's visibility, cheapest level first: a cell whose whole
 * distance range misses a band answers for all of its tiles at once, and only
 * a cell the band's edge crosses — or one far enough away to hold tiles
 * behind the camera — pays a test per tile. `apply(rung, tile, visible)` is
 * called only where the answer changed.
 *
 * `order(rung, tile, d)` — optional — is called for EVERY tile the pass leaves
 * visible, changed or not, with that tile's camera distance. It is how the
 * renderer keeps a front-to-back batch order without a second pass: the
 * distances are the ones this loop already computes (a tile the cell answered
 * for as a whole reports the cell's own near distance).
 */
export function gateSpecies(
  list: readonly GateSpecies[],
  eye: { x: number; y: number; z: number },
  forward: { x: number; z: number },
  apply: (rung: GateRung, tile: number, visible: boolean) => void,
  stats: GateStats,
  marginM: number = GATE_MARGIN_M,
  order?: (rung: GateRung, tile: number, d: number) => void,
  view?: GateView,
): void {
  resetGateStats(stats);
  for (let e = 0; e < list.length; e++) {
    gateEntry(list[e], eye, forward, apply, stats, marginM, order, view);
  }
}

function resetGateStats(stats: GateStats): void {
  stats.visibleCopies = 0;
  stats.visibleTriangles = 0;
  stats.checksCell = 0;
  stats.checksTile = 0;
}

/** Entries one `GatePass.step` resolves at most (perf10 c9 F38b). */
export const GATE_ENTRIES_PER_STEP_MIN = 256;

/**
 * One `gateSpecies` pass spread over several frames (perf10 c9 F38b: the
 * whole pass in one frame cost 10 ms self on the walk). `start` snapshots the
 * eye, the forward and the view; each `step` resolves the next `budget`
 * entries against that snapshot. Every entry's answer depends only on the
 * snapshot and its own latches, so a pass split over N steps gives the same
 * answers as one; a tile's flip is queued as its entry resolves, exactly as
 * the one-frame pass queued it. The stats accumulate privately and are copied
 * to the caller's on the step that completes the pass.
 */
export class GatePass {
  private readonly eye = { x: 0, y: 0, z: 0 };
  private readonly forward = { x: 0, z: 0 };
  private view: GateView | undefined;
  private marginM = GATE_MARGIN_M;
  private next = 0;
  private active = false;
  /** The list the pass resolves, taken at its first step: a list the caller swaps mid-pass (a cell built or dropped) waits for the next pass. */
  private list: readonly GateSpecies[] | null = null;
  private readonly acc: GateStats = { visibleCopies: 0, visibleTriangles: 0, checksCell: 0, checksTile: 0 };

  get running(): boolean { return this.active; }

  /** Begin a pass. `view` is read on every step: keep it unchanged until the pass completes. */
  start(
    eye: { x: number; y: number; z: number },
    forward: { x: number; z: number },
    view?: GateView,
    marginM: number = GATE_MARGIN_M,
  ): void {
    this.eye.x = eye.x; this.eye.y = eye.y; this.eye.z = eye.z;
    this.forward.x = forward.x; this.forward.z = forward.z;
    this.view = view;
    this.marginM = marginM;
    this.next = 0;
    this.active = true;
    this.list = null;
    resetGateStats(this.acc);
  }

  /** Resolve up to `budget` entries; true when the pass is complete. */
  step(
    given: readonly GateSpecies[],
    apply: (rung: GateRung, tile: number, visible: boolean) => void,
    stats: GateStats,
    budget: number,
    order?: (rung: GateRung, tile: number, d: number) => void,
  ): boolean {
    if (!this.active) return true;
    const list = (this.list ??= given);
    const end = Math.min(list.length, this.next + Math.max(1, budget));
    for (let e = this.next; e < end; e++) {
      gateEntry(list[e], this.eye, this.forward, apply, this.acc, this.marginM, order, this.view);
    }
    this.next = end;
    if (end < list.length) return false;
    this.active = false;
    this.list = null;
    stats.visibleCopies = this.acc.visibleCopies;
    stats.visibleTriangles = this.acc.visibleTriangles;
    stats.checksCell = this.acc.checksCell;
    stats.checksTile = this.acc.checksTile;
    return true;
  }
}

function gateEntry(
  entry: GateSpecies,
  eye: { x: number; y: number; z: number },
  forward: { x: number; z: number },
  apply: (rung: GateRung, tile: number, visible: boolean) => void,
  stats: GateStats,
  marginM: number,
  order: ((rung: GateRung, tile: number, d: number) => void) | undefined,
  view: GateView | undefined,
): void {
  // Distances are plain numbers: the pass allocates nothing (diag10 C3).
  const ex = eye.x, ez = eye.z;
  {
    stats.checksCell++;
    const cb = entry.cellBox;
    const rawMax = rangeMax(cb.minX, cb.minZ, cb.maxX, cb.maxZ, ex, ez);
    const dMin = Math.max(0, rangeMin(cb.minX, cb.minZ, cb.maxX, cb.maxZ, ex, ez) - marginM);
    const dMax = rawMax + marginM;
    // Legacy rule: no tile of a cell wholly inside the behind radius can be
    // behind. With a view every tile is tested (the test is a few multiplies).
    const mayBeBehind = view ? true : rawMax > BEHIND_MIN_M;
    for (const rung of entry.rungs) {
      const dIn = rung.castsFromZero ? 0 : rung.band[0] - rung.band[2];
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
        // The cell's own near distance, unless the tile test below measures
        // the tile itself.
        let tileD = dMin;
        if (wholeCell) on = true;
        else {
          if (mode === 1) on = true;
          else {
            stats.checksTile++;
            // The band is measured to the copy's PIVOT (the shader's
            // `esLodOrigin`), so the distance test uses the pivots' own
            // bounds, not the box grown by the kit's reach: the grown box
            // kept the full-mesh rung of a whole tile of trees up to ~50 m
            // past its edge, submitted and collapsed (walk 5, 3.5x the
            // in-band triangles). The reach only matters to the view test.
            const tb = rung.tileBounds, b = t * TILE_BOUNDS_STRIDE;
            const bx0 = tb[b], bz0 = tb[b + 2], bx1 = tb[b + 3], bz1 = tb[b + 5];
            tileD = Math.max(0, rangeMin(bx0, bz0, bx1, bz1, ex, ez) - marginM);
            on = rungVisible(rung.band, tileD, rangeMax(bx0, bz0, bx1, bz1, ex, ez) + marginM, rung.castsFromZero);
          }
          if (on && mayBeBehind) {
            on = view
              ? inView(rung, t, entry.reachM, view)
              : !isBehind(rung, t, eye, forward);
          }
          if (on) {
            stats.visibleCopies += count * parts;
            stats.visibleTriangles += count * rung.trianglesPerInstance;
          }
        }
        if (on && order) order(rung, t, tileD);
        if (((rung.state[t] & 1) === 1) === on) continue;
        rung.state[t] = on ? (rung.state[t] | 1) : (rung.state[t] & ~1);
        rung.onTiles += on ? 1 : -1;
        apply(rung, t, on);
      }
    }
  }
}

/** The frustum test for one tile, with its latch in bit 1 of the state byte
 * (set = out of view). A casting rung's box is swept along the shadow. */
function inView(
  rung: GateRung,
  tile: number,
  reachM: number,
  view: GateView,
): boolean {
  // The tile's XZ box as locals, `tileBox` inlined (diag10 D: no module scratch).
  const tb = rung.tileBounds;
  const b = tile * TILE_BOUNDS_STRIDE;
  const scale = tb[b + 6];
  const m = reachM * scale;
  let minX = tb[b] - m, minZ = tb[b + 2] - m, maxX = tb[b + 3] + m, maxZ = tb[b + 5] + m;
  const up = (rung.heightM ?? reachM) * scale;
  const shadow = rung.casts ? view.shadow : null;
  if (shadow) {
    const len = Math.min(SHADOW_REACH_MAX_M, up * shadow.perM);
    const sx = shadow.x * len;
    const sz = shadow.z * len;
    if (sx < 0) minX += sx; else maxX += sx;
    if (sz < 0) minZ += sz; else maxZ += sz;
  }
  const minY = rung.tileBounds[b + 1] - reachM * scale;
  const maxY = rung.tileBounds[b + 4] + up;
  const latched = (rung.state[tile] & 2) !== 0;
  const planes = latched ? view.on : view.off;
  const visible = boxInPlanes(planes, minX, minY, minZ, maxX, maxY, maxZ);
  if (visible) rung.state[tile] &= ~2;
  else rung.state[tile] |= 2;
  return visible;
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
