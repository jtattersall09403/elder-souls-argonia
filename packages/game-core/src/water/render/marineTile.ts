import type { WaterData } from '../waterData';
import { rasterDomainCells, rasterDomainVertex } from './rasterWaterDomain';

export interface MarineTileSpec {
  x: number; z: number; sizeM: number; maximumCellM: number;
}
export interface MarineTileData {
  positions: Float32Array;
  /** Authored tide/season coefficients, not an owner-wide replacement. */
  levelResponses: Float32Array;
  groundHeights: Float32Array;
  bodyIndices: Uint16Array;
  indices: Uint32Array;
  diagnostics: { rectangles: number; triangles: number; vertices: number; bytes: number; maximumCellM: number; maximumCoordinateRoundoffM: number };
}

/** Bounded geometry prototype, not yet a production surface selector. It
 * partitions the existing raster domain before interpolation: no face
 * straddles marine/inland class boundaries or hydraulic owners. The coarse
 * and near (1/8 m) versions have identical coverage. Authored field samples
 * at discontinuous edges use the limit from this face's owner.
 *
 * Y remains datum zero. A future material binding adds these coefficients
 * and the existing shared spectral waves; it must not resample an adjacent
 * inland vertex's stage. Exact native ground fragment clipping remains
 * authoritative. This prototype makes no unmeasured far-LOD error claim. */
export function* marineTileSteps(data: WaterData, spec: MarineTileSpec): Generator<void, MarineTileData> {
  if (![spec.x, spec.z, spec.sizeM, spec.maximumCellM].every(Number.isFinite)
    || spec.sizeM <= 0 || spec.sizeM > 32 || spec.maximumCellM < .125 || spec.maximumCellM > 8)
    throw new RangeError('Marine tile requires finite extent <=32m and cell size 0.125–8m');
  const positions: number[] = [], levels: number[] = [], ground: number[] = [], owners: number[] = [], indices: number[] = [];
  const vertices = new Map<string, number>();
  let rectangles = 0, visited = 0, maximumCellM = 0, maximumCoordinateRoundoffM = 0;
  for (const cell of rasterDomainCells(data, { minX: spec.x, minZ: spec.z, maxX: spec.x + spec.sizeM, maxZ: spec.z + spec.sizeM }, spec.maximumCellM)) {
    if ((++visited & 63) === 0) yield;
    const { minX: x0, maxX: x1, minZ: z0, maxZ: z1, sample, classIndex: klass, bodyIndex: owner } = cell;
    if (!sample.supported || !sample.waterBodyId || klass < 1 || klass >= 3) continue;
    const vertex = (x: number, z: number): number => {
      const fx = Math.fround(x), fz = Math.fround(z);
      const key = `${owner}:${klass}:${fx},${fz}`;
      const existing = vertices.get(key); if (existing !== undefined) return existing;
      // A vanishing interior offset chooses the intended one-sided owner;
      // output XZ is still the common exact Float32 edge, without cracks.
      const edge = rasterDomainVertex(data, cell, x, z).sample;
      const index = owners.length;
      positions.push(fx, 0, fz); levels.push(edge.tideResponse, edge.seasonResponse);
      maximumCoordinateRoundoffM = Math.max(maximumCoordinateRoundoffM, Math.abs(fx - x), Math.abs(fz - z));
      ground.push(edge.surfaceBase - edge.depthProxy); owners.push(owner);
      vertices.set(key, index); return index;
    };
    const a = vertex(x0, z0), b = vertex(x1, z0), c = vertex(x0, z1), d = vertex(x1, z1);
    indices.push(a, c, b, b, c, d); rectangles++;
    maximumCellM = Math.max(maximumCellM, x1 - x0, z1 - z0);
  }
  const result = { positions: new Float32Array(positions), levelResponses: new Float32Array(levels),
    groundHeights: new Float32Array(ground), bodyIndices: new Uint16Array(owners), indices: new Uint32Array(indices) };
  return { ...result, diagnostics: { rectangles, triangles: indices.length / 3, vertices: owners.length,
    bytes: Object.values(result).reduce((sum, array) => sum + array.byteLength, 0), maximumCellM, maximumCoordinateRoundoffM } };
}
