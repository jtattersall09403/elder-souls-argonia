import type { ChunkGrid } from './chunkStore';

/** Rapier heightfield description for one chunk: a centred column-major
 * matrix (data[x * ny + z]) plus its world position. Heights stay true
 * metres; the vertical scale is the collider's y scale. */
export function terrainColliderData(grid: ChunkGrid, verticalScale: number) {
  if (!Number.isFinite(verticalScale) || verticalScale <= 0) throw new Error('Invalid terrain vertical scale');
  const { nx, ny, heights, metresPerSample } = grid;
  const extentX = (nx - 1) * metresPerSample, extentZ = (ny - 1) * metresPerSample;
  const position: [number, number, number] = [grid.meta.originM[0] + extentX / 2, 0, grid.meta.originM[1] + extentZ / 2];
  const data = new Float32Array(nx * ny);
  for (let x = 0; x < nx; x++) for (let z = 0; z < ny; z++) data[x * ny + z] = heights[z * nx + x];
  return { data, rows: ny - 1, columns: nx - 1,
    scale: { x: extentX, y: verticalScale, z: extentZ }, position };
}
