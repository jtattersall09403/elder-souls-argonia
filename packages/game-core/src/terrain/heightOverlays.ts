/**
 * A place's levelled ground as a runtime overlay (decision 0102 decision 1).
 *
 * A place's pads never reach the frozen terrain: they travel in its bundle
 * (`settlements.json` → `settlements[i].groundOverlays`, schemaVersion 1) and
 * the chunk store applies them to every decoded LOD, so the mesh, the height
 * sampler and the vegetation's ground all read one surface.
 *
 * Exact twin of `tooling/world-generation/worldgen/pad_overlay.py` (itself the
 * chain's `apply_settlement_pad` maths, per sample). Within `hardM` of a
 * piece's polygon the height is the piece's datum (highest datum where hard
 * zones meet); beyond, the ground is pulled toward the datum by
 * `1 − smoothstep` over `blendM` (the larger pull wins). Overlays apply one
 * after another in `applyOrder`: run pads in id order, then building pads in
 * id order, and a run pad yields inside every building pad's polygon (16k r7
 * rule 1: a building pad outranks a run pad where they overlap). An overlay
 * with no `kind` (bundles before r7) is a building pad when `hardM` is 0. The
 * golden fixture
 * `__fixtures__/ground-overlays-claywater.json` holds the two equal.
 */

export const GROUND_OVERLAYS_SCHEMA_VERSION = 1;

export interface GroundOverlayPiece {
  readonly placementId?: string;
  /** Polygon in world metres, [x, z] pairs. */
  readonly polygonM: readonly (readonly [number, number])[];
  readonly datumM: number;
}

export interface GroundOverlay {
  readonly id: string;
  /** "building" (a declared building pad) or "run" (a modular run's pad). */
  readonly kind?: "building" | "run";
  /** [minX, minZ, maxX, maxZ] of every piece polygon, metres. */
  readonly bboxM: readonly [number, number, number, number];
  readonly blendM: number;
  readonly hardM: number;
  readonly pieces: readonly GroundOverlayPiece[];
}

export interface GroundOverlaysDoc {
  readonly schemaVersion: number;
  readonly pads: readonly GroundOverlay[];
}

/** Where a row-major [z][x] grid stands: sample (ix, iz) is at
 * origin + (ix, iz) × metresPerSample. */
export interface OverlayGrid {
  readonly originM: readonly [number, number];
  readonly metresPerSample: number;
  readonly nx: number;
  readonly ny: number;
}

function inside(x: number, z: number, poly: GroundOverlayPiece["polygonM"]): boolean {
  let hit = false;
  let [ax, az] = poly[poly.length - 1];
  for (const [bx, bz] of poly) {
    if ((bz > z) !== (az > z)) {
      const xCross = (ax - bx) * (z - bz) / (az - bz + 1e-300) + bx;
      if (x < xCross) hit = !hit;
    }
    ax = bx; az = bz;
  }
  return hit;
}

function edgeDistance(x: number, z: number, poly: GroundOverlayPiece["polygonM"]): number {
  let best = Infinity;
  let [ax, az] = poly[poly.length - 1];
  for (const [bx, bz] of poly) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let d2: number;
    if (len2 === 0) d2 = (x - ax) ** 2 + (z - az) ** 2;
    else {
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2));
      d2 = (x - (ax + t * dx)) ** 2 + (z - (az + t * dz)) ** 2;
    }
    if (d2 < best) best = d2;
    ax = bx; az = bz;
  }
  return Math.sqrt(best);
}

/** 0 inside the polygon, else metres to its boundary. */
export function polygonDistance(x: number, z: number, poly: GroundOverlayPiece["polygonM"]): number {
  return inside(x, z, poly) ? 0 : edgeDistance(x, z, poly);
}

function reachOf(o: GroundOverlay): number { return o.hardM + o.blendM; }

type Polygon = GroundOverlayPiece["polygonM"];

/** A building pad (`kind` "building"; before r7, `hardM` 0). */
export function isBuildingPad(o: GroundOverlay): boolean {
  return o.kind ? o.kind === "building" : o.hardM === 0;
}

/** Run pads in id order, then building pads in id order. */
export function applyOrder(overlays: readonly GroundOverlay[]): GroundOverlay[] {
  return [...overlays].sort((a, b) => {
    const ka = isBuildingPad(a) ? 1 : 0, kb = isBuildingPad(b) ? 1 : 0;
    if (ka !== kb) return ka - kb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function yieldPolygons(overlays: readonly GroundOverlay[]): Polygon[] {
  return overlays.filter(isBuildingPad).flatMap((o) => o.pieces.map((p) => p.polygonM));
}

/** One overlay's height at (x, z) over the ground `base`; a run pad leaves
 * `base` as it is inside any polygon of `yieldTo` (the building pads). */
export function overlayOne(
  base: number, x: number, z: number, o: GroundOverlay, yieldTo: readonly Polygon[] = [],
): number {
  const reach = reachOf(o);
  const [x0, z0, x1, z1] = o.bboxM;
  if (x < x0 - reach || x > x1 + reach || z < z0 - reach || z > z1 + reach) return base;
  if (yieldTo.length > 0 && !isBuildingPad(o) && yieldTo.some((poly) => inside(x, z, poly))) return base;
  let hardTarget = -Infinity;
  let pull = 0;
  for (const piece of o.pieces) {
    const d = polygonDistance(x, z, piece.polygonM);
    if (d <= o.hardM) hardTarget = Math.max(hardTarget, piece.datumM);
    const t = Math.min(1, Math.max(0, (d - o.hardM) / Math.max(o.blendM, 1e-6)));
    const w = 1 - t * t * (3 - 2 * t);
    const step = (piece.datumM - base) * w;
    if (Math.abs(step) > Math.abs(pull)) pull = step;
  }
  return Number.isFinite(hardTarget) ? hardTarget : base + pull;
}

/** The padded ground at (x, z): every overlay in `applyOrder` over `base`. */
export function overlayHeight(base: number, x: number, z: number, overlays: readonly GroundOverlay[]): number {
  let h = base;
  const yieldTo = yieldPolygons(overlays);
  for (const o of applyOrder(overlays)) h = overlayOne(h, x, z, o, yieldTo);
  return h;
}

/** True when the overlay's reach touches the grid's rectangle. */
export function overlayTouchesGrid(o: GroundOverlay, grid: OverlayGrid): boolean {
  const reach = reachOf(o);
  const [ox, oz] = grid.originM;
  const maxX = ox + (grid.nx - 1) * grid.metresPerSample;
  const maxZ = oz + (grid.ny - 1) * grid.metresPerSample;
  return !(o.bboxM[2] + reach < ox || o.bboxM[0] - reach > maxX
    || o.bboxM[3] + reach < oz || o.bboxM[1] - reach > maxZ);
}

/**
 * The grid with every overlay applied. Pure: the input is never written; the
 * input array itself is returned when no overlay touches the grid.
 */
export function applyGroundOverlays(
  heights: Float32Array, grid: OverlayGrid, overlays: readonly GroundOverlay[],
): Float32Array {
  const touching = applyOrder(overlays).filter((o) => overlayTouchesGrid(o, grid));
  if (touching.length === 0) return heights;
  const out = new Float32Array(heights);
  const [ox, oz] = grid.originM;
  const mps = grid.metresPerSample;
  const yieldTo = yieldPolygons(overlays);
  for (const o of touching) {
    const reach = reachOf(o);
    const c0 = Math.max(Math.floor((o.bboxM[0] - reach - ox) / mps), 0);
    const c1 = Math.min(Math.ceil((o.bboxM[2] + reach - ox) / mps) + 1, grid.nx);
    const r0 = Math.max(Math.floor((o.bboxM[1] - reach - oz) / mps), 0);
    const r1 = Math.min(Math.ceil((o.bboxM[3] + reach - oz) / mps) + 1, grid.ny);
    for (let r = r0; r < r1; r++) {
      const z = oz + r * mps;
      for (let c = c0; c < c1; c++) {
        const i = r * grid.nx + c;
        out[i] = overlayOne(out[i], ox + c * mps, z, o, yieldTo);
      }
    }
  }
  return out;
}

/** The overlays of one published bundle, by place; refuses a version it does
 * not understand. */
export function overlaysOfBundle(bundle: {
  readonly settlements?: readonly { readonly id: string; readonly groundOverlays?: GroundOverlaysDoc }[];
}): Map<string, readonly GroundOverlay[]> {
  const out = new Map<string, readonly GroundOverlay[]>();
  for (const s of bundle.settlements ?? []) {
    const doc = s.groundOverlays;
    if (!doc) continue;
    if (doc.schemaVersion !== GROUND_OVERLAYS_SCHEMA_VERSION) {
      throw new Error(`${s.id}: groundOverlays schemaVersion ${String(doc.schemaVersion)}, `
        + `expected ${GROUND_OVERLAYS_SCHEMA_VERSION}`);
    }
    out.set(s.id, doc.pads);
  }
  return out;
}

/**
 * The overlays a chunk store applies, injected (never a module singleton).
 * `ready` settles once the bundle carrying them has been read (or has failed
 * to be: a missing bundle means no overlays, never a stalled terrain).
 */
export class GroundOverlayRegistry {
  private byPlace = new Map<string, readonly GroundOverlay[]>();
  private all: readonly GroundOverlay[] = [];
  readonly ready: Promise<void>;
  private settle!: () => void;

  constructor() {
    this.ready = new Promise<void>((resolve) => { this.settle = resolve; });
  }

  /** Install every place's overlays from one source and mark the registry ready. */
  set(byPlace: ReadonlyMap<string, readonly GroundOverlay[]>): void {
    this.byPlace = new Map(byPlace);
    this.all = [...this.byPlace.values()].flat();
    this.settle();
  }

  /** Mark ready with whatever is installed (the source failed or has none). */
  settleEmpty(): void { this.settle(); }

  overlays(): readonly GroundOverlay[] { return this.all; }

  places(): string[] { return [...this.byPlace.keys()]; }
}
