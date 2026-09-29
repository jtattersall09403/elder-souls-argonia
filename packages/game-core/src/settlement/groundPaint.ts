/**
 * A place's painted ways (16k walk 4, decision 0102 decision 1): every
 * layout path op travels in the place's bundle as a `groundPaint` entry
 * (`settlement.groundPaint`, schemaVersion 1, written by
 * `worldgen.export_settlement_bundle.ground_paint`) and is draped at load as
 * a strip over the ground the character stands on. The frozen terrain is
 * never repainted for a place.
 *
 * The strip is a regular grid over the entry's polygon: every vertex sits
 * `PAINT_LIFT_M` above the sampled ground, and its alpha rises from 0 at the
 * polygon's edge to 1 at `edgeM` inside it, so the way's edge is soft. The
 * compile has already cut the polygon under pads and floors (except inside a
 * door's apron), so the paint reaches every threshold and never lies on a
 * floor.
 */

import type { TerrainHeight } from "./types";

export const GROUND_PAINT_SCHEMA_VERSION = 1;

/** The terrain road paint materials a way may use, by their ground-material
 * name: the land cover's BC_ROAD, TRACK and PATH (`landcover.py`), the same
 * texture the 16e road paint draws with. `world/sources/vocab/ground-paint.json`
 * maps each way kind to one; `groundPaint.test.ts` holds the two equal. */
export const GROUND_PAINT_TEXTURES: ReadonlySet<string> = new Set(["bc_road", "track_mud", "dirt_path"]);

/** Height of the strip above the sampled ground, metres (plus a polygon offset). */
export const PAINT_LIFT_M = 0.03;
/** Grid spacing of the strip, metres: under half the finest terrain post
 * spacing (1.8 m), so the strip follows the ground between posts. */
export const PAINT_CELL_M = 0.5;

export interface GroundPaintEntry {
  readonly id: string;
  readonly routeId?: string;
  readonly kind: string;
  readonly texture: string;
  readonly edgeM: number;
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

export interface PaintStrip {
  /** xyz per vertex, world metres. */
  readonly positions: Float32Array;
  /** rgba per vertex; rgb 1, a the soft-edge alpha. */
  readonly colors: Float32Array;
  /** Triangle indices. */
  readonly indices: Uint32Array;
  readonly vertexCount: number;
}

/**
 * The draped strip of one entry, or null while any vertex it needs has no
 * ground yet (the terrain under it is not decoded: build again later).
 */
export function paintStrip(
  entry: GroundPaintEntry, groundAt: TerrainHeight, cellM = PAINT_CELL_M, liftM = PAINT_LIFT_M,
): PaintStrip | null {
  const poly = entry.polygonM;
  let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const x0 = Math.floor(minX / cellM) * cellM;
  const z0 = Math.floor(minZ / cellM) * cellM;
  const nx = Math.ceil((maxX - x0) / cellM) + 1;
  const nz = Math.ceil((maxZ - z0) / cellM) + 1;
  const alpha = new Float32Array(nx * nz);
  const edge = Math.max(entry.edgeM, 1e-3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * cellM; const z = z0 + j * cellM;
      if (!insidePolygon(x, z, poly)) continue;
      const t = Math.min(1, edgeDistance(x, z, poly) / edge);
      alpha[j * nx + i] = t * t * (3 - 2 * t);
    }
  }
  const vertexOf = new Int32Array(nx * nz).fill(-1);
  const positions: number[] = []; const colors: number[] = []; const indices: number[] = [];
  const vertex = (i: number, j: number): number => {
    const k = j * nx + i;
    if (vertexOf[k] >= 0) return vertexOf[k];
    const x = x0 + i * cellM; const z = z0 + j * cellM;
    const y = groundAt(x, z);
    if (y === null) throw new MissingGround();
    vertexOf[k] = positions.length / 3;
    positions.push(x, y + liftM, z);
    colors.push(1, 1, 1, alpha[k]);
    return vertexOf[k];
  };
  try {
    for (let j = 0; j + 1 < nz; j++) {
      for (let i = 0; i + 1 < nx; i++) {
        const k = j * nx + i;
        if (alpha[k] + alpha[k + 1] + alpha[k + nx] + alpha[k + nx + 1] === 0) continue;
        const a = vertex(i, j); const b = vertex(i + 1, j);
        const c = vertex(i, j + 1); const d = vertex(i + 1, j + 1);
        indices.push(a, c, b, b, c, d);
      }
    }
  } catch (error) {
    if (error instanceof MissingGround) return null;
    throw error;
  }
  return {
    positions: Float32Array.from(positions), colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices), vertexCount: positions.length / 3,
  };
}

class MissingGround extends Error {}
