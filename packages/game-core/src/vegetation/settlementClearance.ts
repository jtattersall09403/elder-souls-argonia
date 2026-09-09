/**
 * Settlement vegetation clearance, runtime side (decision 0041; placement
 * principle C13).
 *
 * The compiled scatter bundles already come out of `worldgen.compile_scatter`
 * with the built ground cleared. The T3 groundcover ring does NOT: it grows
 * grass from the land-cover raster at runtime, so it has to apply the same
 * rule itself or grass grows through the floors the compiler cleared (0041
 * clearing gotcha (b)).
 *
 * This is the exact twin of
 * `tooling/world-generation/worldgen/settlement_clearance.py` — same
 * constants, same geometry, same jittered edge. Change one, change both, and
 * the parity test in `settlementClearance.test.ts` carries the fixtures the
 * Python emits. Nothing here reaches for Python at runtime: the polygons come
 * from `province/blueprints.json`, which the studio already streams.
 */

/** Polygon in world metres: [x, z] pairs, X east / Z south. */
export type ClearancePolygon = readonly (readonly [number, number])[];

export interface KeptPlant {
  readonly id?: string;
  readonly kind?: string;
  readonly positionM: readonly [number, number];
}

export interface SettlementClearance {
  readonly hardClear?: readonly ClearancePolygon[];
  readonly thinned?: readonly ClearancePolygon[];
  readonly kept?: readonly KeptPlant[];
  /** Optional per-place override of the fringe falloff, metres. */
  readonly fringeFalloffM?: number;
}

/** Share of wild growth surviving at the built edge of the worked fringe. */
export const FRINGE_MIN_KEEP = 0.25;
/** C13's vegetation-channel falloff length, metres. */
export const FRINGE_FALLOFF_M = 15;
/** Wobble on the built edge, metres, and its two wavelengths. */
export const EDGE_JITTER_M = 1.5;
const EDGE_JITTER_WAVELENGTH_M: readonly [number, number] = [11.3, 7.1];
/** Weeds and rubble at the wall foot are a deliberate keep, not an oversight
 * (research/rendering/building-placement-rendering-treatments.md §2.3): they
 * break the hard join between wall and ground. Modest gain — weeds, not a
 * hedge. */
export const WALL_ENRICH_BAND_M = 1.2;
export const WALL_ENRICH_GAIN = 0.8;

/** Protected radius, metres, around a declared kept plant, by kind. */
export const KEPT_RADIUS_M: Readonly<Record<string, number>> = {
  "hist-tree": 18,
  shade: 8,
  "reed-bed": 12,
};
export const DEFAULT_KEPT_RADIUS_M = 8;

function pointInPolygon(x: number, z: number, poly: ClearancePolygon): boolean {
  let inside = false;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    if ((az > z) !== (bz > z)) {
      const t = (z - az) / (bz - az);
      if (x < ax + t * (bx - ax)) inside = !inside;
    }
  }
  return inside;
}

function distanceToPolygon(x: number, z: number, poly: ClearancePolygon): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax;
    const dz = bz - az;
    const length2 = dx * dx + dz * dz;
    const t = length2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

function nearest(x: number, z: number, polys: readonly ClearancePolygon[]) {
  let inside = false;
  let best = Infinity;
  for (const poly of polys) {
    if (poly.length < 3) continue;
    if (pointInPolygon(x, z, poly)) inside = true;
    best = Math.min(best, distanceToPolygon(x, z, poly));
  }
  return { inside, distance: best };
}

/** The wobble on the built edge at this position, metres. */
export function edgeJitter(x: number, z: number): number {
  const [lx, lz] = EDGE_JITTER_WAVELENGTH_M;
  const wobble = (Math.sin(x / lx) * Math.cos(z / lz)
    + 0.5 * Math.sin(z / (lx * 0.6) + 1.7)) / 1.5;
  return EDGE_JITTER_M * (wobble + 1) / 2;
}

/**
 * Share of wild vegetation surviving at this position, in [0, 1].
 * 1 is untouched marsh, 0 is built ground, and the fringe between grades
 * continuously over `FRINGE_FALLOFF_M`.
 */
export function keepAt(x: number, z: number, clearance: SettlementClearance): number {
  for (const kept of clearance.kept ?? []) {
    const radius = (kept.kind && KEPT_RADIUS_M[kept.kind]) || DEFAULT_KEPT_RADIUS_M;
    if (Math.hypot(x - kept.positionM[0], z - kept.positionM[1]) <= radius) return 1;
  }
  const hard = clearance.hardClear ?? [];
  const thinned = clearance.thinned ?? [];
  const falloff = clearance.fringeFalloffM || FRINGE_FALLOFF_M;
  let dHard = Infinity;
  let dWall = Infinity;
  if (hard.length > 0) {
    const near = nearest(x, z, hard);
    const jitter = edgeJitter(x, z);
    if (near.inside || near.distance <= jitter) return 0;
    dHard = near.distance;
    // Distance from the built edge as CUT, not from the drawn polygon.
    dWall = dHard - jitter;
  }
  const thin = nearest(x, z, thinned);
  if (!thin.inside) return 1;
  if (hard.length === 0) dHard = Math.max(0, falloff - thin.distance);
  const t = falloff > 0 ? Math.min(1, dHard / falloff) : 1;
  let keep = FRINGE_MIN_KEEP + (1 - FRINGE_MIN_KEEP) * t;
  if (dWall < WALL_ENRICH_BAND_M) {
    keep *= 1 + WALL_ENRICH_GAIN * (1 - dWall / WALL_ENRICH_BAND_M);
  }
  return Math.min(1, keep);
}

/**
 * `keepAt` judged over the plant's own extent: the worst of its origin and
 * four points at its radius.
 *
 * The lesson is the modding scene's, not ours — *No Grass In Objects*
 * documents a wide grass mesh poking through a floor because its ORIGIN sat
 * outside the blocked area. A 1–2 m fern rooted a metre outside a wall puts
 * fronds inside the room, and the defect is invisible in the data.
 */
export function keepForExtent(
  x: number, z: number, radiusM: number, clearances: readonly SettlementClearance[],
): number {
  let keep = keepAcross(x, z, clearances);
  if (radiusM <= 0 || keep === 0) return keep;
  for (const [dx, dz] of [[radiusM, 0], [-radiusM, 0], [0, radiusM], [0, -radiusM]]) {
    keep = Math.min(keep, keepAcross(x + dx, z + dz, clearances));
    if (keep === 0) return 0;
  }
  return keep;
}

/** The lowest keep factor across every settlement — settlements do not overlap
 * in practice, and the minimum is the safe answer if two ever do. */
export function keepAcross(
  x: number, z: number, clearances: readonly SettlementClearance[],
): number {
  let keep = 1;
  for (const clearance of clearances) {
    keep = Math.min(keep, keepAt(x, z, clearance));
    if (keep === 0) return 0;
  }
  return keep;
}

/** Axis-aligned bounds of a clearance, metres, or null if it declares nothing.
 * Callers use it to skip the polygon work for the 99.9 % of the province that
 * is nowhere near a town. */
export function clearanceBoundsM(
  clearance: SettlementClearance,
): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
  const polys = [...(clearance.hardClear ?? []), ...(clearance.thinned ?? [])];
  for (const poly of polys) {
    for (const [x, z] of poly) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  for (const kept of clearance.kept ?? []) {
    const radius = (kept.kind && KEPT_RADIUS_M[kept.kind]) || DEFAULT_KEPT_RADIUS_M;
    minX = Math.min(minX, kept.positionM[0] - radius);
    maxX = Math.max(maxX, kept.positionM[0] + radius);
    minZ = Math.min(minZ, kept.positionM[1] - radius);
    maxZ = Math.max(maxZ, kept.positionM[1] + radius);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minZ, maxX, maxZ };
}

/**
 * The clearances near a point, with their bounds pre-tested. `padM` should be
 * the largest radius the caller cares about (a fern's fronds, say).
 */
export function clearancesNear(
  x: number, z: number, indexed: readonly IndexedClearance[], padM = 0,
): SettlementClearance[] {
  const out: SettlementClearance[] = [];
  for (const entry of indexed) {
    const b = entry.bounds;
    if (x < b.minX - padM || x > b.maxX + padM
      || z < b.minZ - padM || z > b.maxZ + padM) continue;
    out.push(entry.clearance);
  }
  return out;
}

/**
 * The whole runtime decision for one candidate plant: does it survive the
 * settlement clearance? `roll` is the caller's own deterministic [0, 1) draw,
 * so the ring stays reproducible (walk away, walk back, same grass).
 */
export function survivesClearance(
  x: number, z: number, radiusM: number,
  indexed: readonly IndexedClearance[], roll: number,
): boolean {
  if (indexed.length === 0) return true;
  const near = clearancesNear(x, z, indexed, radiusM);
  if (near.length === 0) return true;
  const keep = keepForExtent(x, z, radiusM, near);
  return keep >= 1 || roll < keep;
}

export interface IndexedClearance {
  readonly id: string;
  readonly clearance: SettlementClearance;
  readonly bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}

/** Index the clearance blocks out of a streamed `province/blueprints.json`. */
export function indexClearances(
  bundle: { blueprints?: readonly { id: string; clearance?: SettlementClearance }[] },
): IndexedClearance[] {
  const out: IndexedClearance[] = [];
  for (const bp of bundle.blueprints ?? []) {
    if (!bp.clearance) continue;
    const bounds = clearanceBoundsM(bp.clearance);
    if (!bounds) continue;
    out.push({ id: bp.id, clearance: bp.clearance, bounds });
  }
  return out;
}
