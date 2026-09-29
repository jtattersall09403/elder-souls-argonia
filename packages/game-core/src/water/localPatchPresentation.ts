import type { LocalWaterPatch, LocalWaterPatchSample } from './LocalWaterPatch';

/** Presentation blend at an artificial local-model boundary. Solver volume is
 * unchanged; this explicitly localized display is not a global volume model. */
export const LOCAL_WATER_EDGE_M = 2;
/** Mesh vertices are field centres plus both outer half-cell borders. */
export function localWaterVertexCoordinate(index: number, size: number, cellSizeM: number): number {
  return Math.max(0, Math.min(size * cellSizeM, (index - 0.5) * cellSizeM));
}
export function sampleLocalPatchSurface(patch: LocalWaterPatch, x: number, z: number,
  out?: LocalWaterPatchSample): LocalWaterPatchSample | null {
  if (!patch.active || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const gx = (x - patch.originX) / patch.cellSizeM, gz = (z - patch.originZ) / patch.cellSizeM;
  if (gx < 0 || gz < 0 || gx >= patch.size || gz >= patch.size
    || !patch.wetMask[Math.floor(gz) * patch.size + Math.floor(gx)]) return null;
  const ix = Math.min(patch.size, Math.floor(gx + 0.5)), iz = Math.min(patch.size, Math.floor(gz + 0.5));
  const x0 = localWaterVertexCoordinate(ix, patch.size, patch.cellSizeM);
  const z0 = localWaterVertexCoordinate(iz, patch.size, patch.cellSizeM);
  const fx = (x - patch.originX - x0) / (localWaterVertexCoordinate(ix + 1, patch.size, patch.cellSizeM) - x0);
  const fz = (z - patch.originZ - z0) / (localWaterVertexCoordinate(iz + 1, patch.size, patch.cellSizeM) - z0);
  const upper = fx + fz > 1;
  const value = out ?? { height: 0, slopeX: 0, slopeZ: 0, foam: 0 };
  value.height = value.slopeX = value.slopeZ = value.foam = 0;
  const extent = patch.size * patch.cellSizeM;
  const edge = Math.min(LOCAL_WATER_EDGE_M, extent / 2);
  // Same anti-diagonal triangles as the submitted mesh. Interpolated normals
  // intentionally remain smooth vertex normals, not discontinuous face normals.
  for (let corner = 0; corner < 3; corner++) {
    const vx = ix + (corner === 1 || (corner === 0 && upper) ? 1 : 0);
    const vz = iz + (corner === 2 || (corner === 0 && upper) ? 1 : 0);
    const bary = corner === 0 ? (upper ? fx + fz - 1 : 1 - fx - fz) : corner === 1 ? (upper ? 1 - fz : fx) : (upper ? 1 - fx : fz);
    const px = localWaterVertexCoordinate(vx, patch.size, patch.cellSizeM), pz = localWaterVertexCoordinate(vz, patch.size, patch.cellSizeM);
    const tx = Math.min(1, Math.min(px, extent - px) / edge), tz = Math.min(1, Math.min(pz, extent - pz) / edge);
    const wx = tx * tx * (3 - 2 * tx), wz = tz * tz * (3 - 2 * tz), weight = wx * wz;
    const dx = 6 * tx * (1 - tx) / edge * (px < extent / 2 ? 1 : -1);
    const dz = 6 * tz * (1 - tz) / edge * (pz < extent / 2 ? 1 : -1);
    const offset = (Math.max(0, Math.min(patch.size - 1, vz - 1)) * patch.size + Math.max(0, Math.min(patch.size - 1, vx - 1))) * 4;
    const height = patch.fields[offset];
    value.height += bary * height * weight;
    value.slopeX += bary * (patch.fields[offset + 1] * weight + height * dx * wz);
    value.slopeZ += bary * (patch.fields[offset + 2] * weight + height * dz * wx);
    value.foam += bary * patch.fields[offset + 3] * weight;
  }
  return value;
}

