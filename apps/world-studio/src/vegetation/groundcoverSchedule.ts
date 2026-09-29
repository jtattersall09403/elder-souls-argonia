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
