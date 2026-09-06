import { Matrix4, WebGLCoordinateSystem, type Box3, type Camera } from 'three';
import type { TerrainBankLodView } from './terrainBankLod';

/** Conservative finite world-Y projection error over a displayed-world box.
 * Camera matrices must already be current. `distanceM` is the homogeneous
 * denominator (1 for orthographic), not Euclidean camera distance. For every
 * candidate error <= maxBankErrorM, the selector's error*numerator/denominator
 * bounds actual 2D pixel displacement, including tilted/rolled/off-axis views.
 */
export function projectedTerrainBankView(box: Box3, camera: Camera, widthPx: number, heightPx: number,
  maxBankErrorM: number, verticalScale: number): TerrainBankLodView & { scaledHeightRoundoffM: number } {
  const invalid = { distanceM: 0, pixelsPerRadian: 0, verticalScale, scaledHeightRoundoffM: 0 };
  if (box.isEmpty() || ![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z,
    widthPx, heightPx, maxBankErrorM, verticalScale].every(Number.isFinite)
    || widthPx <= 0 || heightPx <= 0 || maxBankErrorM < 0 || verticalScale <= 0) return invalid;
  const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  if (!matrix.every(Number.isFinite)) return invalid;
  const magnitude = Math.max(Math.abs(box.min.y), Math.abs(box.max.y)) + maxBankErrorM * verticalScale;
  const scaledHeightRoundoffM = verticalScale === 1 ? 0
    : 2 ** Math.max(-149, Math.floor(Math.log2(Math.max(magnitude, 2 ** -126))) - 23);
  const maximumDisplacement = maxBankErrorM * verticalScale + scaledHeightRoundoffM;
  if (!Number.isFinite(maximumDisplacement)) return invalid;
  let minW = Infinity, maxX = 0, maxY = 0, minNear = Infinity;
  const nearCoefficient = camera.reversedDepth ? matrix[7] - matrix[6]
    : camera.coordinateSystem === WebGLCoordinateSystem ? matrix[6] + matrix[7] : matrix[6];
  for (let iz = 0; iz < 2; iz++) for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
    const x = ix ? box.max.x : box.min.x, y = iy ? box.max.y : box.min.y, z = iz ? box.max.z : box.min.z;
    const cx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const cy = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    const cz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    const cw = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    if (!(cw > 0) || ![cx, cy, cz, cw].every(Number.isFinite)) return invalid;
    minW = Math.min(minW, cw); maxX = Math.max(maxX, Math.abs(cx / cw)); maxY = Math.max(maxY, Math.abs(cy / cw));
    const near = camera.reversedDepth ? cw - cz : camera.coordinateSystem === WebGLCoordinateSystem ? cz + cw : cz;
    minNear = Math.min(minNear, near);
  }
  // Fractional-linear extrema over a convex box with positive w occur at
  // vertices. The displaced denominator and near-plane half-space must also
  // remain positive for BOTH signs of the full allowed height perturbation.
  const distanceM = minW - maximumDisplacement * Math.abs(matrix[7]);
  if (!(distanceM > 0) || !(minNear > maximumDisplacement * Math.abs(nearCoefficient))) return invalid;
  const pixelsPerRadian = Math.hypot(widthPx * 0.5 * (Math.abs(matrix[4]) + maxX * Math.abs(matrix[7])),
    heightPx * 0.5 * (Math.abs(matrix[5]) + maxY * Math.abs(matrix[7])));
  if (!Number.isFinite(pixelsPerRadian)) return invalid;
  // Exactly zero sensitivity (an orthographic vertical view) is safe too;
  // the tiny conservative floor preserves the existing selector's >0 guard.
  return { distanceM, pixelsPerRadian: Math.max(Number.MIN_VALUE, pixelsPerRadian), verticalScale, scaledHeightRoundoffM };
}
