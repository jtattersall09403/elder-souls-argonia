/**
 * Ground-cover scheduling and culling rules (walk 5, 2026-09-29), pure and
 * three.js-light so a harness can replay them without a renderer.
 *
 *  - WHEN to fill: the ring's meshes are refilled (a whole-ring copy and a
 *    full buffer upload) in PHASES on a cold start — once when every tile of
 *    the near band is generated, once for the mid band, once when the queue
 *    drains — instead of every 0.25 s and on every terrain chunk arrival. The
 *    startup video showed 1-5 fills a second for ten seconds, each one a
 *    visible "wave" of new plants and a CPU spike.
 *  - WHAT to generate first: nearest first, with tiles in front of the camera
 *    ahead of tiles behind it at the same distance.
 *  - HOW MUCH per frame: a large budget in the first seconds (the loading
 *    screen and the settle-in), a small steady one after.
 *  - WHAT to submit: the ring is split into a core disc and `sectors` wedges
 *    around the fill focus; a wedge whose tiles are all outside the (widened)
 *    view frustum is not drawn. The old single ring mesh (and the quarter
 *    rings before it) had a bounding sphere that always met the view.
 */

import * as THREE from "three";

/** Tiles whose nearest point is within this of the fill focus share the core
 * slot, which is always tested as one: the camera sits a few metres behind
 * the focus, so a wedge's apex would otherwise always touch the view. */
export const GC_CORE_M = 24;
/** Outer wedges around the core. 8 x 45 deg: a ~85 deg view sees 3-4. */
export const GC_SECTORS = 8;

/** Which slot a tile goes to: 0 the core, 1..sectors a wedge by the tile
 * centre's bearing from the fill focus. */
export function sectorOf(
  centreX: number, centreZ: number, focusX: number, focusZ: number,
  nearestM: number, sectors: number = GC_SECTORS,
): number {
  if (sectors <= 1) return 0;
  if (nearestM <= GC_CORE_M) return 0;
  const a = Math.atan2(centreZ - focusZ, centreX - focusX); // -pi..pi
  const s = Math.floor(((a + Math.PI) / (2 * Math.PI)) * sectors);
  return 1 + Math.min(sectors - 1, Math.max(0, s));
}

/**
 * Generation order key, smaller first: the nearest distance, stretched for a
 * tile behind the camera (up to 2.5x straight behind). A tile under the feet
 * stays first whatever its bearing.
 */
export function viewPriority(
  nearestM: number, dx: number, dz: number, forwardX: number, forwardZ: number,
): number {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6 || nearestM <= 16) return nearestM;
  const cos = (dx * forwardX + dz * forwardZ) / len; // forward is unit length
  return nearestM * (1 + 0.75 * (1 - cos));
}

/** Per-frame generation budget, ms. */
export const GC_BUDGET_STARTUP_MS = 24;
export const GC_BUDGET_COLD_MS = 12;
export const GC_BUDGET_STEADY_MS = 4;
/** The startup window the large budget holds for, from the first generate. */
export const GC_STARTUP_S = 6;
/** More tiles than this still wanted = a spawn, a teleport, a raster
 * arriving: the cold budget applies. */
export const GC_COLD_TILES = 40;

export function generateBudgetMs(sinceStartS: number, remainingTiles: number): number {
  if (sinceStartS < GC_STARTUP_S) return GC_BUDGET_STARTUP_MS;
  if (remainingTiles > GC_COLD_TILES) return GC_BUDGET_COLD_MS;
  return GC_BUDGET_STEADY_MS;
}

/** A cold phase that has not completed after this long fills anyway, so the
 * ring never stays blank behind one slow band. */
export const GC_PHASE_CEILING_S = 1.5;
/** While walking (not cold), the edge tiles fill at this cadence. */
export const GC_FILL_INTERVAL_S = 0.25;

export interface FillInputs {
  /** Tiles generated since the last fill. */
  generatedSinceFill: number;
  /** Wanted tiles still missing, all of them. */
  remaining: number;
  /** Wanted tiles still missing inside each phase radius, nearest phase first. */
  remainingWithin: readonly number[];
  /** Phases already filled this cold start (0 = none). */
  phasesFilled: number;
  cold: boolean;
  sinceLastFillS: number;
}

/**
 * Whether the ring should be refilled now, and which phase that fill
 * completes. Nothing new generated = no fill, ever.
 */
export function fillDue(i: FillInputs): { fill: boolean; phase: number } {
  if (i.generatedSinceFill === 0) return { fill: false, phase: i.phasesFilled };
  if (i.remaining === 0) return { fill: true, phase: i.remainingWithin.length };
  if (!i.cold) return { fill: i.sinceLastFillS > GC_FILL_INTERVAL_S, phase: i.phasesFilled };
  let complete = 0;
  while (complete < i.remainingWithin.length && i.remainingWithin[complete] === 0) complete++;
  if (complete > i.phasesFilled) return { fill: true, phase: complete };
  if (i.sinceLastFillS > GC_PHASE_CEILING_S) return { fill: true, phase: i.phasesFilled };
  return { fill: false, phase: i.phasesFilled };
}

export interface SettleInputs {
  /** Generatable tiles still queued after this pass (not those waiting on a chunk). */
  remaining: number;
  /** Tiles generated since the last fill. */
  generatedSinceFill: number;
  /** Whether `fillDue` (or a focus move) already asked for a fill this frame. */
  fill: boolean;
  cold: boolean;
  sinceLastFillS: number;
}

/**
 * After a generation pass: whether to fill now, whether generation stays
 * armed, and, when the generatable queue drained with new tiles unfilled,
 * how long until they fill anyway (`fillInS`, else null).
 *
 * `fillDue` counts the tiles waiting on an LOD 1 chunk as missing, so a pass
 * whose only missing tiles wait on a chunk may not fill; clearing
 * `genPending` then left the tiles it had just made undrawn until a chunk
 * arrived or the focus moved 8 m (review 2026-09-30, replayed in
 * groundcoverDrain.test.ts). Filling at once instead bypassed the cold-start
 * phasing, one whole-ring fill per chunk arrival (review 2026-09-30, second
 * pass). So the drained pass keeps the schedule's own cadence: the fill
 * comes at GC_PHASE_CEILING_S (cold) or GC_FILL_INTERVAL_S (walking) after
 * the last fill, without re-running generation every frame to get there.
 */
export function settleGeneration(i: SettleInputs): {
  fill: boolean; pending: boolean; fillInS: number | null;
} {
  if (i.remaining > 0) return { fill: i.fill, pending: true, fillInS: null };
  if (i.fill || i.generatedSinceFill === 0) return { fill: i.fill, pending: false, fillInS: null };
  const cadenceS = i.cold ? GC_PHASE_CEILING_S : GC_FILL_INTERVAL_S;
  return { fill: false, pending: false, fillInS: Math.max(0, cadenceS - i.sinceLastFillS) };
}

/** Floats per tile box: minX, minY, minZ, maxX, maxY, maxZ. */
const BOX = 6;

/**
 * Per-slot tile boxes, set at fill time, tested per frame. One slot is
 * visible when ANY of its tiles meets the frustum; the test stops at the
 * first hit. No per-frame allocation.
 */
export class SectorCuller {
  readonly slots: number;
  private boxes: Float32Array;
  private readonly counts: Int32Array;
  private readonly capacity: number;
  readonly visible: Uint8Array;
  private readonly box = new THREE.Box3();
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();

  constructor(slots: number, tilesPerSlot = 1024) {
    this.slots = slots;
    this.capacity = tilesPerSlot;
    this.boxes = new Float32Array(slots * tilesPerSlot * BOX);
    this.counts = new Int32Array(slots);
    this.visible = new Uint8Array(slots).fill(1);
  }

  clear(): void {
    this.counts.fill(0);
    this.visible.fill(1);
  }

  add(slot: number, minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number): void {
    const n = this.counts[slot];
    if (n >= this.capacity) return; // saturated: the slot stays conservative below
    const o = (slot * this.capacity + n) * BOX;
    const b = this.boxes;
    b[o] = minX; b[o + 1] = minY; b[o + 2] = minZ;
    b[o + 3] = maxX; b[o + 4] = maxY; b[o + 5] = maxZ;
    this.counts[slot] = n + 1;
  }

  /**
   * The frustum of `camera` with its view widened by `widen` (<1 widens:
   * the projection's x/y scale is multiplied by it). The margin covers a
   * camera that moves after this test in the same frame.
   */
  frustumOf(camera: THREE.Camera, widen = 0.8): THREE.Frustum {
    const m = this.projection.copy(camera.projectionMatrix);
    m.elements[0] *= widen;
    m.elements[5] *= widen;
    m.multiply(camera.matrixWorldInverse);
    return this.frustum.setFromProjectionMatrix(m);
  }

  /** Updates `visible`; returns how many slots are visible. */
  test(frustum: THREE.Frustum): number {
    let seen = 0;
    const b = this.boxes;
    for (let s = 0; s < this.slots; s++) {
      const n = this.counts[s];
      let hit = n >= this.capacity; // saturated slot: never culled
      for (let k = 0; k < n && !hit; k++) {
        const o = (s * this.capacity + k) * BOX;
        this.box.min.set(b[o], b[o + 1], b[o + 2]);
        this.box.max.set(b[o + 3], b[o + 4], b[o + 5]);
        if (frustum.intersectsBox(this.box)) hit = true;
      }
      this.visible[s] = hit ? 1 : 0;
      if (hit) seen++;
    }
    return seen;
  }
}

/*
 * The budget thin (walk 5, 2026-09-29: "plants pop in as you approach, then
 * pop back OUT when you get closer"). Until then the thin was a prefix of
 * `ceil(n * max/total)` per tile block with the factor recomputed from the
 * ring's exact total at EVERY fill, so every plant near a prefix edge blinked
 * in and out as the ring's total moved (walk replay: 57 596 pop-outs over
 * 1.5 km, groundcoverThin.test.ts).
 *
 * Now a plant's survival is its own stable property: its `keep` roll (a hash,
 * stored sorted per tile block) is compared with
 *
 *   t(d) = 1 - (1 - s) * ramp(d),  ramp = 0 inside the NEAR band, rising
 *          linearly to 1 at the MID radius and held at 1 beyond,
 *
 * so the NEAR band is never thinned, far plants thin first, and t only grows
 * as the focus approaches. `s` belongs to the TILE, not the ring: it is the
 * factor that would hold the budget if the whole ring were as dense as this
 * tile (`tileThinFactor`, from the ring's geometric weights `ringWeights`),
 * quantised, and computed from the tile's far-subset count, which a FAR-built
 * and a full-built tile share. Nothing about the focus moves it, so walking
 * closer never removes a plant shown further out. Dense tiles thin, sparse
 * ones do not; a uniform ring lands exactly on the budget. A ring far denser
 * than any one tile predicts (dense near, sparse far) is caught by one global
 * factor `g` on top (`safetyFactor`, quantised, with hysteresis, acting
 * only past `GC_BUDGET_SLACK` x the budget), which a normal walk never moves.
 */
export const GC_THIN_QUANTUM = 1 / 32;
/** The safety factor's ceiling over the preset budget. The tile factors aim
 * the average ring at the budget; a ring whose density is uneven (dense near,
 * sparse far) lands within a few per cent either side of it (walk replay:
 * -1.8 % mean, +4.2 % peak), and moving `g` for that would bring back the
 * blinking this rule exists to end. Past 5 % over, `g` acts. */
export const GC_BUDGET_SLACK = 1.05;

/** 0 inside `nearM`, 1 at and beyond `midM`, linear between. */
export function thinRamp(distanceM: number, nearM: number, midM: number): number {
  if (distanceM <= nearM) return 0;
  if (midM <= nearM || distanceM >= midM) return 1;
  return (distanceM - nearM) / (midM - nearM);
}

/** The keep threshold for a tile `distanceM` from the focus under factor `s`. */
export function thinThreshold(distanceM: number, s: number, nearM: number, midM: number): number {
  if (s >= 1) return 1;
  return 1 - (1 - s) * thinRamp(distanceM, nearM, midM);
}

/**
 * The ring's geometric weights for one species' radii, per plant of full
 * tile density: `k` is how many tiles' worth of plants the ring draws (1 per
 * tile inside the MID band plus overlap, `farThin` per FAR tile), `kr` the
 * same weighted by `thinRamp` (what `s` can remove). Focus on a tile centre.
 */
export function ringWeights(
  nearM: number, midM: number, farM: number, overlapM: number, tileM: number, farThin: number,
): { k: number; kr: number } {
  let k = 0; let kr = 0;
  const reach = Math.ceil((farM + overlapM) / tileM) + 1;
  for (let j = -reach; j <= reach; j++) {
    for (let i = -reach; i <= reach; i++) {
      const nearest = Math.hypot(
        Math.max(0, Math.abs(i) * tileM - tileM / 2), Math.max(0, Math.abs(j) * tileM - tileM / 2));
      const w = nearest <= midM + overlapM ? 1 : (nearest <= farM + overlapM ? farThin : 0);
      k += w; kr += w * thinRamp(nearest, nearM, midM);
    }
  }
  return { k, kr };
}

/**
 * The tile's factor: `nk` = sum over its species of (full count x k), `nkr`
 * the same with kr. 1 when a ring this dense fits `maxInstances`, else the
 * nearest quantum to the exact fit (never 0: the ring never goes bare).
 */
export function tileThinFactor(nk: number, nkr: number, maxInstances: number): number {
  if (nk <= maxInstances) return 1;
  const exact = nkr > 0 ? 1 - (nk - maxInstances) / nkr : 0;
  return Math.min(1, Math.max(GC_THIN_QUANTUM, Math.round(exact / GC_THIN_QUANTUM) * GC_THIN_QUANTUM));
}

/**
 * The global safety factor `g` (multiplies every tile's `s`), quantised with
 * hysteresis: it drops the moment `drawnAt(g)` exceeds the budget and rises
 * one quantum only when two quanta more would still fit. `previous` is the
 * last fill's (1 on a cold start).
 */
export function safetyFactor(
  drawnAt: (g: number) => number, maxInstances: number, previous: number,
): number {
  let g = Math.min(1, Math.max(GC_THIN_QUANTUM, previous));
  if (drawnAt(g) > maxInstances) {
    g = Math.floor(g / GC_THIN_QUANTUM) * GC_THIN_QUANTUM;
    while (g > GC_THIN_QUANTUM && drawnAt(g) > maxInstances) g -= GC_THIN_QUANTUM;
    return Math.max(GC_THIN_QUANTUM, g);
  }
  if (g < 1 && drawnAt(Math.min(1, g + 2 * GC_THIN_QUANTUM)) <= maxInstances) {
    return Math.min(1, g + GC_THIN_QUANTUM);
  }
  return g;
}

/** Plants in `keeps[lo, hi)` (sorted ascending) whose roll is under `t`. */
export function keptCount(keeps: Float32Array, lo: number, hi: number, t: number): number {
  if (t >= 1) return hi - lo;
  let a = lo; let b = hi;
  while (a < b) {
    const m = (a + b) >> 1;
    if (keeps[m] < t) a = m + 1; else b = m;
  }
  return a - lo;
}
