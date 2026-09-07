import type { FootprintPoint } from './ribbonFootprint';
import type { RasterDomainBounds } from './rasterWaterDomain';

/** Remove only the proxy area beyond an owner's complete support bounds.
 * Standing waves sample height at fixed XZ, so this cannot crop displaced
 * water. River cutouts remain unchanged inside the owner's rectangle. */
export function clipRasterBounds(points: readonly FootprintPoint[], bounds: RasterDomainBounds): FootprintPoint[] {
  let polygon = [...points];
  for (const [axis, limit, sign] of [['x', bounds.minX, 1], ['x', bounds.maxX, -1], ['z', bounds.minZ, 1], ['z', bounds.maxZ, -1]] as const) {
    const next: FootprintPoint[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = (a[axis] - limit) * sign, db = (b[axis] - limit) * sign;
      if (da >= 0) next.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        next.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    polygon = next;
    if (!polygon.length) break;
  }
  return polygon;
}
