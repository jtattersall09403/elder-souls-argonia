/**
 * A place's painted ways (16k walk 4, decision 0102 decision 1): every
 * layout path op travels in the place's bundle as a `groundPaint` entry
 * (`settlement.groundPaint`, schemaVersion 2, written by
 * `worldgen.export_settlement_bundle.ground_paint`) and is draped at load
 * over the ground the character stands on. The frozen terrain is never
 * repainted for a place.
 *
 * ONE paint surface per place (16k walk 6, the coplanar rule: decal on decal
 * is removed at authoring, never left to the depth test): a single regular
 * grid over the union of the place's paint polygons, every vertex
 * `PAINT_LIFT_M` above the sampled ground. Each vertex carries one weight per
 * paint texture: the edge-feathered alpha of every entry of that texture
 * (smoothstep from 0 at the polygon edge to `peakAlpha` at `edgeM` inside),
 * taking the maximum where entries overlap, so a junction or a doubled way
 * never paints darker than one way. The shader blends the textures by weight
 * and draws alpha = the largest weight. The compile has already cut the
 * polygons under pads and floors (except inside a door's apron) and where
 * the province road paint already lies.
 */

import type { GroundArrivals, TerrainHeight } from "./types";

export const GROUND_PAINT_SCHEMA_VERSION = 2;

/** The terrain paint materials a way may use, by their ground-material name:
 * the land cover's TRACK (`landcover.py`), worn earth for every kind of way
 * since 16k walk 7 (the owner: a subtle dirt track, never cobble over the
 * fields). `world/sources/vocab/ground-paint.json` maps each way kind to one;
 * `groundPaint.test.ts` holds the two equal. The surface still blends up to
 * `PAINT_MAX_TEXTURES`, so a place kind that needs a second material is a
 * vocabulary row, not a code change. */
export const GROUND_PAINT_TEXTURES: ReadonlySet<string> = new Set(["track_mud"]);

/** Most textures one place's surface blends (one weight channel each). */
export const PAINT_MAX_TEXTURES = 3;

/** Height of the surface above the sampled ground, metres (plus a polygon offset). */
export const PAINT_LIFT_M = 0.03;
/** Grid spacing of the surface, metres: under half the finest terrain post
 * spacing (1.8 m), so the surface follows the ground between posts. */
export const PAINT_CELL_M = 0.5;

export interface GroundPaintEntry {
  readonly id: string;
  readonly routeId?: string;
  readonly kind: string;
  readonly texture: string;
  readonly edgeM: number;
  /** Alpha at the way's middle (0..1). */
  readonly peakAlpha: number;
  readonly widthM?: number;
  readonly centrelineM?: readonly (readonly [number, number])[];
  readonly polygonM: readonly (readonly [number, number])[];
}

export interface GroundPaintDoc {
  readonly schemaVersion: number;
  readonly entries: readonly GroundPaintEntry[];
}

/** Every painted way of the bundle's places; refuses an unknown version, a
 * texture that is not a road paint material, or a polygon under 3 points. */
export function groundPaintOfBundle(settlements: readonly {
  readonly id: string; readonly groundPaint?: GroundPaintDoc;
}[]): GroundPaintEntry[] {
  const out: GroundPaintEntry[] = [];
  for (const s of settlements) {
    const doc = s.groundPaint;
    if (!doc) continue;
    if (doc.schemaVersion !== GROUND_PAINT_SCHEMA_VERSION) {
      throw new Error(`${s.id}: groundPaint schemaVersion ${String(doc.schemaVersion)}, `
        + `expected ${GROUND_PAINT_SCHEMA_VERSION}`);
    }
    for (const e of doc.entries) {
      if (!GROUND_PAINT_TEXTURES.has(e.texture)) {
        throw new Error(`${s.id}: groundPaint ${e.id} texture ${JSON.stringify(e.texture)} `
          + `is not a road paint material (${[...GROUND_PAINT_TEXTURES].join(", ")})`);
      }
      if (e.polygonM.length < 3) throw new Error(`${s.id}: groundPaint ${e.id} has under 3 points`);
      if (!(e.peakAlpha > 0 && e.peakAlpha <= 1)) throw new Error(`${s.id}: groundPaint ${e.id} peakAlpha ${e.peakAlpha}`);
      out.push(e);
    }
  }
  return out;
}

function insidePolygon(x: number, z: number, poly: GroundPaintEntry["polygonM"]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[j];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
  }
  return inside;
}

function edgeDistance(x: number, z: number, poly: GroundPaintEntry["polygonM"]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const dx = poly[i][0] - ax;
    const dz = poly[i][1] - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}

export interface PaintSurface {
  /** The textures the weight channels stand for, in channel order. */
  readonly textures: readonly string[];
  /** xyz per vertex, world metres. */
  readonly positions: Float32Array;
  /** One weight per texture channel per vertex (PAINT_MAX_TEXTURES wide, unused channels 0). */
  readonly weights: Float32Array;
  /** Triangle indices. */
  readonly indices: Uint32Array;
  readonly vertexCount: number;
}

/**
 * The one draped surface of a place's entries, or null while any vertex it
 * needs has no ground yet (the terrain under it is not decoded: build again
 * later). Cost and memory are the sum of the entries' bounding boxes in
 * cells: the weights are sparse (painted cells only) and the sweep visits
 * only the quads touching a painted cell, never the union box (a 1 km city
 * would be 4 M cells).
 */
export function paintSurface(
  entries: readonly GroundPaintEntry[], groundAt: TerrainHeight, cellM = PAINT_CELL_M, liftM = PAINT_LIFT_M,
): PaintSurface | null {
  const textures = [...new Set(entries.map((e) => e.texture))].sort();
  if (textures.length > PAINT_MAX_TEXTURES) {
    throw new Error(`ground paint: ${textures.length} textures in one place, at most ${PAINT_MAX_TEXTURES}`);
  }
  let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
  for (const e of entries) {
    for (const [x, z] of e.polygonM) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  const empty = { textures, positions: new Float32Array(0), weights: new Float32Array(0),
    indices: new Uint32Array(0), vertexCount: 0 };
  if (!Number.isFinite(minX)) return empty;
  const W = PAINT_MAX_TEXTURES;
  const x0 = Math.floor(minX / cellM) * cellM;
  const z0 = Math.floor(minZ / cellM) * cellM;
  const nx = Math.ceil((maxX - x0) / cellM) + 1;
  const nz = Math.ceil((maxZ - z0) / cellM) + 1;
  /** Painted cells only: cell index -> one weight per channel. */
  const weight = new Map<number, Float32Array>();
  for (const e of entries) {
    const poly = e.polygonM;
    const ch = textures.indexOf(e.texture);
    const edge = Math.max(e.edgeM, 1e-3);
    let ex0 = Infinity; let ez0 = Infinity; let ex1 = -Infinity; let ez1 = -Infinity;
    for (const [x, z] of poly) {
      ex0 = Math.min(ex0, x); ex1 = Math.max(ex1, x); ez0 = Math.min(ez0, z); ez1 = Math.max(ez1, z);
    }
    const i0 = Math.max(0, Math.floor((ex0 - x0) / cellM)); const i1 = Math.min(nx - 1, Math.ceil((ex1 - x0) / cellM));
    const j0 = Math.max(0, Math.floor((ez0 - z0) / cellM)); const j1 = Math.min(nz - 1, Math.ceil((ez1 - z0) / cellM));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = x0 + i * cellM; const z = z0 + j * cellM;
        if (!insidePolygon(x, z, poly)) continue;
        const t = Math.min(1, edgeDistance(x, z, poly) / edge);
        const a = t * t * (3 - 2 * t) * e.peakAlpha;
        const k = j * nx + i;
        let w = weight.get(k);
        if (!w) { w = new Float32Array(W); weight.set(k, w); }
        if (a > w[ch]) w[ch] = a;
      }
    }
  }
  const painted = (k: number) => {
    const w = weight.get(k);
    if (!w) return false;
    for (let c = 0; c < W; c++) if (w[c] > 0) return true;
    return false;
  };
  // the quads with a painted corner, in row-major order (lower-left corner index)
  const quadSet = new Set<number>();
  for (const k of weight.keys()) {
    if (!painted(k)) continue;
    const i = k % nx; const j = (k - i) / nx;
    for (let dj = -1; dj <= 0; dj++) {
      for (let di = -1; di <= 0; di++) {
        const qi = i + di; const qj = j + dj;
        if (qi >= 0 && qj >= 0 && qi + 1 < nx && qj + 1 < nz) quadSet.add(qj * nx + qi);
      }
    }
  }
  const quads = [...quadSet].sort((p, q) => p - q);
  const vertexOf = new Map<number, number>();
  const positions: number[] = []; const weights: number[] = []; const indices: number[] = [];
  const vertex = (i: number, j: number): number => {
    const k = j * nx + i;
    const seen = vertexOf.get(k);
    if (seen !== undefined) return seen;
    const x = x0 + i * cellM; const z = z0 + j * cellM;
    const y = groundAt(x, z);
    if (y === null) throw new MissingGround();
    const v = positions.length / 3;
    vertexOf.set(k, v);
    positions.push(x, y + liftM, z);
    const w = weight.get(k);
    for (let c = 0; c < W; c++) weights.push(w ? w[c] : 0);
    return v;
  };
  try {
    for (const k of quads) {
      const i = k % nx; const j = (k - i) / nx;
      const a = vertex(i, j); const b = vertex(i + 1, j);
      const c = vertex(i, j + 1); const d = vertex(i + 1, j + 1);
      indices.push(a, c, b, b, c, d);
    }
  } catch (error) {
    if (error instanceof MissingGround) return null;
    throw error;
  }
  return {
    textures, positions: Float32Array.from(positions), weights: Float32Array.from(weights),
    indices: Uint32Array.from(indices), vertexCount: positions.length / 3,
  };
}

class MissingGround extends Error {}

/** Adapts a terrain chunk store's decode events to `GroundArrivals`. */
export function groundArrivalsOf(store: {
  onArrival(listener: (grid: { meta: { originM: readonly [number, number] }; nx: number; ny: number;
    metresPerSample: number }) => void): () => void;
}): GroundArrivals {
  return (listener) => store.onArrival((grid) => {
    const [x0, z0] = grid.meta.originM;
    listener([x0, z0, x0 + (grid.nx - 1) * grid.metresPerSample, z0 + (grid.ny - 1) * grid.metresPerSample]);
  });
}
