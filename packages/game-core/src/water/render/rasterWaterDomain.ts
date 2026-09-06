import type { WaterBoundaryStaticSample, WaterData } from '../waterData';

export interface RasterDomainBounds { minX: number; minZ: number; maxX: number; maxZ: number }
export interface RasterDomainCell extends RasterDomainBounds {
  centreX: number; centreZ: number; bodyIndex: number; classIndex: number;
  sample: WaterBoundaryStaticSample;
  /** Semantic sampling domain, potentially wider than this tessellation cell. */
  samplingBounds: RasterDomainBounds;
}

function samplingInterval(data: WaterData, centre: number): readonly [number, number] {
  const extent = data.meta.surface.size * data.meta.surface.metresPerPixel;
  if (centre < 0) return [-Infinity, 0];
  if (centre >= extent) return [extent, Infinity];
  let min = 0, max = extent;
  for (const grid of [data.meta.surface, data.meta.klass]) {
    const mpp = grid.metresPerPixel, origin = grid.gridOriginM ?? mpp * .5;
    const i = Math.min(grid.size - 1, Math.max(0, Math.round((centre - origin) / mpp)));
    if (i > 0) min = Math.max(min, origin + (i - .5) * mpp);
    if (i < grid.size - 1) max = Math.min(max, origin + (i + .5) * mpp);
  }
  return [min, max];
}

export function rasterDomainAxis(data: WaterData, start: number, end: number, spacing = Infinity): number[] {
  // Retain the exact domain coordinate until vertex emission: rounding a
  // boundary first can put both nominal one-sided samples in the same owner.
  const values = new Set<number>([start, end]);
  const add = (value: number) => { if (value > start && value < end) values.add(value); };
  if (Number.isFinite(spacing)) for (let i = Math.floor(start / spacing) + 1; i * spacing < end; i++) add(i * spacing);
  for (const [grid, half] of [[data.meta.surface, true], [data.meta.klass, false]] as const) {
    const mpp = grid.metresPerPixel, origin = grid.gridOriginM ?? mpp * .5;
    const step = half ? mpp * .5 : mpp, offset = half ? origin : origin + mpp * .5;
    for (let i = Math.floor((start - offset) / step) + 1; offset + i * step < end; i++) add(offset + i * step);
  }
  add(0); add(data.meta.surface.size * data.meta.surface.metresPerPixel);
  return [...values].sort((a, b) => a - b);
}

/** Domain-neutral partition for inland AND marine raster geometry. Includes
 * nearest-owner/class boundaries and fine interpolation knots; never drops
 * a whole wet triangle merely because its corners belong to different IDs.
 * Caller selects wetness/class and performs native-footprint subtraction.
 * One yield is one bounded cell query; this is not a whole-province builder. */
export function* rasterDomainCells(data: WaterData, bounds: RasterDomainBounds,
  maximumCellM = Infinity): Generator<RasterDomainCell> {
  if (!Object.values(bounds).every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ
    || bounds.maxX - bounds.minX > 1024 || bounds.maxZ - bounds.minZ > 1024 || !(maximumCellM > 0))
    throw new RangeError('Raster water partition requires finite ordered bounds <=1024m and positive spacing');
  // Bound allocation before constructing either coordinate axis.
  const spacing = Math.min(maximumCellM, data.meta.surface.metresPerPixel * .5, data.meta.klass.metresPerPixel);
  if ((Math.ceil((bounds.maxX - bounds.minX) / spacing) + 4) * (Math.ceil((bounds.maxZ - bounds.minZ) / spacing) + 4) > 131072)
    throw new RangeError('Raster water partition exceeds bounded cell budget');
  const xs = rasterDomainAxis(data, bounds.minX, bounds.maxX, maximumCellM), zs = rasterDomainAxis(data, bounds.minZ, bounds.maxZ, maximumCellM);
  if ((xs.length - 1) * (zs.length - 1) > 131072) throw new RangeError('Raster water partition exceeds bounded cell budget');
  for (let row = 0; row < zs.length - 1; row++) for (let col = 0; col < xs.length - 1; col++) {
    const minX = xs[col], maxX = xs[col + 1], minZ = zs[row], maxZ = zs[row + 1];
    if (Math.fround(minX) === Math.fround(maxX) || Math.fround(minZ) === Math.fround(maxZ)) continue;
    const centreX = (minX + maxX) * .5, centreZ = (minZ + maxZ) * .5;
    const [sampleMinX, sampleMaxX] = samplingInterval(data, centreX), [sampleMinZ, sampleMaxZ] = samplingInterval(data, centreZ);
    yield { minX, maxX, minZ, maxZ, centreX, centreZ, bodyIndex: data.rasterBodyIndexAt(centreX, centreZ),
      classIndex: data.rasterClassAt(centreX, centreZ), sample: data.boundaryAt(centreX, centreZ, undefined, false),
      samplingBounds: { minX: sampleMinX, maxX: sampleMaxX, minZ: sampleMinZ, maxZ: sampleMaxZ } };
  }
}

/** Same Float32 geometric edge for both owners, separate one-sided fields.
 * The <1 ULP coordinate displacement is not a claim of sub-ULP ownership
 * precision; actual fragment owner/ground gates remain authoritative. */
export function rasterDomainVertex(data: WaterData, cell: RasterDomainCell, x: number, z: number) {
  const inward = (value: number, min: number, max: number): number => {
    let f = Math.fround(value);
    const ulp = Math.max(2 ** -149, 2 ** (Math.floor(Math.log2(Math.abs(f))) - 23));
    if (f <= min) f = Math.fround(f + ulp);
    if (f >= max) f = Math.fround(f - ulp);
    if (!(f > min && f < max)) throw new Error('Raster water domain has no interior Float32 sample');
    return f;
  };
  // A geometric sliver between a regular tessellation line and an unrelated
  // interpolation knot may have no interior Float32 coordinate. It need not:
  // only semantic (owner/class) boundaries constrain the sample's side.
  const bounds = cell.samplingBounds;
  const sx = inward(x, bounds.minX, bounds.maxX), sz = inward(z, bounds.minZ, bounds.maxZ);
  const sample = data.boundaryAt(sx, sz, undefined, false);
  if (sample.waterBodyId !== cell.sample.waterBodyId) throw new Error('Raster water owner partition disagrees with field sampling');
  return { x: Math.fround(x), z: Math.fround(z), sampleX: sx, sampleZ: sz, sample };
}
