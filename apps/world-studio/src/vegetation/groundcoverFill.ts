/**
 * The groundcover fill's working state, held once per Groundcover instance
 * (on a ref, standard 8) and reset per rebuild instead of reallocated.
 *
 * A rebuild used to allocate a record object per (tile, species, tier) via
 * object spreads, a live-tile object per ring tile, a budget row per
 * (tile, species) and fresh slot arrays per species: 25-33 ms of JS inside
 * the rAF at walk start (perf10 diag3 C3, perf-diag3-gc.md Q1). Here every
 * per-item field is a parallel array (typed where numeric), grown by
 * doubling and never shrunk, and each slot holds record indices.
 *
 * Generic over the tile-species, mesh, band-attribute and geometry types so
 * the reset logic is testable without three.
 */

export const ROLE_ALL = 0;
export const ROLE_THIN = 1;
export const ROLE_REST = 2;
export type FillRole = typeof ROLE_ALL | typeof ROLE_THIN | typeof ROLE_REST;
export const ROLE_NAMES = ["all", "thin", "rest"] as const;

type Numeric = Float64Array | Int32Array | Uint8Array;

/** `a` if it holds `n`, else a doubled copy (contents kept). */
function fit<T extends Numeric>(a: T, n: number): T {
  if (n <= a.length) return a;
  const next = new (a.constructor as new (len: number) => T)(Math.max(n, a.length * 2));
  next.set(a);
  return next;
}

export class FillScratch<S, M = unknown, B = unknown, G = unknown> {
  // --- live tiles of the ring ---
  liveCount = 0;
  liveKey = new Float64Array(256);
  liveNearest = new Float64Array(256);
  liveTx = new Int32Array(256);
  liveTz = new Int32Array(256);
  readonly liveKeys = new Set<number>();

  // --- tile records (one per tile x species x tier copy) ---
  recCount = 0;
  readonly recSpecies: S[] = [];
  recFar = new Uint8Array(1024);
  recTier = new Uint8Array(1024);
  recRole = new Uint8Array(1024);
  recTx = new Int32Array(1024);
  recTz = new Int32Array(1024);
  recNearest = new Float64Array(1024);
  recThin = new Float64Array(1024);
  recThinNearM = new Float64Array(1024);
  recThinMidM = new Float64Array(1024);
  recMinY = new Float64Array(1024);
  recMaxY = new Float64Array(1024);

  /** Record indices per species per draw slot, in insertion order. */
  readonly slotRecords: number[][][] = [];
  /** Instance count per species per draw slot. */
  readonly slotCounts: Float64Array[] = [];

  // --- budget rows (one per tile x species the budget counts) ---
  budgetCount = 0;
  readonly budgetSpecies: S[] = [];
  budgetInMid = new Uint8Array(512);
  budgetNearest = new Float64Array(512);
  budgetThin = new Float64Array(512);
  budgetNearM = new Float64Array(512);
  budgetMidM = new Float64Array(512);

  // --- commits (one per mesh written) ---
  commitCount = 0;
  readonly commitMesh: M[] = [];
  readonly commitBands: B[] = [];
  readonly commitGeometry: G[] = [];
  commitDrawn = new Float64Array(64);
  commitCx = new Float64Array(64);
  commitCy = new Float64Array(64);
  commitCz = new Float64Array(64);
  commitRadius = new Float64Array(64);

  /** Meshes this rebuild filled, by key. */
  readonly liveMeshes = new Set<string>();

  /** Empty everything for a new rebuild over `speciesCount` x `slotCount` slots. */
  reset(speciesCount: number, slotCount: number): void {
    this.liveCount = 0;
    this.liveKeys.clear();
    this.recCount = 0;
    this.recSpecies.length = 0;
    for (let p = 0; p < speciesCount; p++) {
      let lists = this.slotRecords[p];
      if (!lists) lists = this.slotRecords[p] = [];
      for (let s = 0; s < slotCount; s++) {
        if (lists[s]) lists[s].length = 0;
        else lists[s] = [];
      }
      lists.length = slotCount;
      if (!this.slotCounts[p] || this.slotCounts[p].length !== slotCount) this.slotCounts[p] = new Float64Array(slotCount);
      else this.slotCounts[p].fill(0);
    }
    this.slotRecords.length = speciesCount;
    this.slotCounts.length = speciesCount;
    this.budgetCount = 0;
    this.budgetSpecies.length = 0;
    this.commitCount = 0;
    this.commitMesh.length = 0;
    this.commitBands.length = 0;
    this.commitGeometry.length = 0;
    this.liveMeshes.clear();
  }

  pushLive(key: number, nearest: number, tx: number, tz: number): void {
    const i = this.liveCount++;
    if (i >= this.liveKey.length) {
      this.liveKey = fit(this.liveKey, i + 1);
      this.liveNearest = fit(this.liveNearest, i + 1);
      this.liveTx = fit(this.liveTx, i + 1);
      this.liveTz = fit(this.liveTz, i + 1);
    }
    this.liveKey[i] = key; this.liveNearest[i] = nearest; this.liveTx[i] = tx; this.liveTz[i] = tz;
    this.liveKeys.add(key);
  }

  /** Append a record and file it under `slot` of `speciesIndex`, adding `count` instances. */
  pushRecord(speciesIndex: number, slot: number, count: number, species: S, far: boolean, tier: number, role: FillRole,
    tx: number, tz: number, nearest: number, thin: number, thinNearM: number, thinMidM: number, minY: number, maxY: number): void {
    const i = this.recCount++;
    if (i >= this.recFar.length) {
      const n = i + 1;
      this.recFar = fit(this.recFar, n); this.recTier = fit(this.recTier, n); this.recRole = fit(this.recRole, n);
      this.recTx = fit(this.recTx, n); this.recTz = fit(this.recTz, n);
      this.recNearest = fit(this.recNearest, n); this.recThin = fit(this.recThin, n);
      this.recThinNearM = fit(this.recThinNearM, n); this.recThinMidM = fit(this.recThinMidM, n);
      this.recMinY = fit(this.recMinY, n); this.recMaxY = fit(this.recMaxY, n);
    }
    this.recSpecies[i] = species;
    this.recFar[i] = far ? 1 : 0; this.recTier[i] = tier; this.recRole[i] = role;
    this.recTx[i] = tx; this.recTz[i] = tz; this.recNearest[i] = nearest; this.recThin[i] = thin;
    this.recThinNearM[i] = thinNearM; this.recThinMidM[i] = thinMidM; this.recMinY[i] = minY; this.recMaxY[i] = maxY;
    this.slotRecords[speciesIndex][slot].push(i);
    this.slotCounts[speciesIndex][slot] += count;
  }

  pushBudget(species: S, inMid: boolean, nearest: number, thin: number, nearM: number, midM: number): void {
    const i = this.budgetCount++;
    if (i >= this.budgetInMid.length) {
      const n = i + 1;
      this.budgetInMid = fit(this.budgetInMid, n); this.budgetNearest = fit(this.budgetNearest, n);
      this.budgetThin = fit(this.budgetThin, n); this.budgetNearM = fit(this.budgetNearM, n); this.budgetMidM = fit(this.budgetMidM, n);
    }
    this.budgetSpecies[i] = species;
    this.budgetInMid[i] = inMid ? 1 : 0; this.budgetNearest[i] = nearest; this.budgetThin[i] = thin;
    this.budgetNearM[i] = nearM; this.budgetMidM[i] = midM;
  }

  pushCommit(mesh: M, drawn: number, bands: B, geometry: G, cx: number, cy: number, cz: number, radius: number): void {
    const i = this.commitCount++;
    if (i >= this.commitDrawn.length) {
      const n = i + 1;
      this.commitDrawn = fit(this.commitDrawn, n); this.commitCx = fit(this.commitCx, n);
      this.commitCy = fit(this.commitCy, n); this.commitCz = fit(this.commitCz, n); this.commitRadius = fit(this.commitRadius, n);
    }
    this.commitMesh[i] = mesh; this.commitBands[i] = bands; this.commitGeometry[i] = geometry;
    this.commitDrawn[i] = drawn; this.commitCx[i] = cx; this.commitCy[i] = cy; this.commitCz[i] = cz; this.commitRadius[i] = radius;
  }
}
