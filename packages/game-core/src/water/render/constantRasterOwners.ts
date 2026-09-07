import type { WaterBoundaryStaticSample, WaterData } from '../waterData';
import type { RasterDomainBounds } from './rasterWaterDomain';

export interface ConstantRasterOwner extends RasterDomainBounds {
  owner: number;
  sample: WaterBoundaryStaticSample;
  supportedCells: RasterDomainBounds[];
}

/** A constant stencil stays constant under owner-aware interpolation. Inspect
 * every contributing source vertex, including the one-pixel halo and dry
 * fringe, before selecting a plane. Ownership alone is never proof of a flat
 * surface or constant seasonal response. Bounds conservatively contain every
 * supported nearest-owner cell; fragment ownership/shore gates trim them.
 * Native ground remains necessary for the subpixel terrain shoreline. */
export function* constantRasterOwners(data: WaterData, bounds: RasterDomainBounds): Generator<void, { owners: Map<number, ConstantRasterOwner>; complete: boolean }> {
  const result = new Map<number, ConstantRasterOwner>();
  if (!data.nativeGround || !data.meta.surface.nativeChannelCoverage || !data.meta.surface.accessFile) return { owners: result, complete: false };
  const grid = data.meta.surface, mpp = grid.metresPerPixel, origin = grid.gridOriginM ?? mpp * .5;
  if (!Object.values(bounds).every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ
    || bounds.maxX - bounds.minX > 256 * mpp || bounds.maxZ - bounds.minZ > 256 * mpp)
    throw new RangeError('Constant water owner scan requires finite bounded tile coordinates');
  const minX = Math.max(0, Math.floor((bounds.minX - origin) / mpp) - 1);
  const minZ = Math.max(0, Math.floor((bounds.minZ - origin) / mpp) - 1);
  const maxX = Math.min(grid.size - 1, Math.ceil((bounds.maxX - origin) / mpp) + 1);
  const maxZ = Math.min(grid.size - 1, Math.ceil((bounds.maxZ - origin) / mpp) + 1);
  const rejected = new Set<number>(), fields = new Map<number, WaterBoundaryStaticSample>();
  let visited = 0;
  for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
    const wx = origin + x * mpp, wz = origin + z * mpp;
    const owner = data.rasterBodyIndexAt(wx, wz), sample = data.rasterVertexAt(x, z);
    const previous = fields.get(owner);
    if (![sample.surfaceBase, sample.tideResponse, sample.seasonResponse].every(Number.isFinite)) rejected.add(owner);
    if (!previous) fields.set(owner, sample);
    else if ((['surfaceBase', 'tideResponse', 'seasonResponse'] as const).some(key =>
      !Number.isFinite(sample[key]) || Math.abs(sample[key] - previous[key]) > 1e-7)) rejected.add(owner);
    // Nearest sampling extends the first/last source cells to the province
    // limits; the interpolation halo must not enlarge the emitted tile.
    const left = Math.max(bounds.minX, x === 0 ? 0 : wx - mpp * .5);
    const top = Math.max(bounds.minZ, z === 0 ? 0 : wz - mpp * .5);
    const right = Math.min(bounds.maxX, x === grid.size - 1 ? grid.size * mpp : wx + mpp * .5);
    const bottom = Math.min(bounds.maxZ, z === grid.size - 1 ? grid.size * mpp : wz + mpp * .5);
    if (sample.supported && sample.waterBodyId && left < right && top < bottom) {
      const patch = result.get(owner);
      const cell = { minX: left, minZ: top, maxX: right, maxZ: bottom };
      if (patch) {
        patch.supportedCells.push(cell);
        patch.minX = Math.min(patch.minX, left); patch.minZ = Math.min(patch.minZ, top);
        patch.maxX = Math.max(patch.maxX, right); patch.maxZ = Math.max(patch.maxZ, bottom);
      } else result.set(owner, { owner, sample, ...cell, supportedCells: [cell] });
    }
    if ((++visited & 63) === 0) yield;
  }
  const count = result.size;
  for (const owner of rejected) result.delete(owner);
  return { owners: result, complete: result.size === count };
}
