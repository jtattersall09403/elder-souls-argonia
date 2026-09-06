import type { ChunkGrid } from './chunkStore';
import { terrainGridIndices } from './gridGeometry';

/** Only audited topology chunks need a native trimesh; all other chunks
 * retain the cheaper heightfield representation and identical source data. */
export function terrainColliderData(grid: ChunkGrid, verticalScale: number) {
  if (!Number.isFinite(verticalScale) || verticalScale <= 0) throw new Error('Invalid terrain vertical scale');
  const { nx, ny, heights, metresPerSample } = grid;
  const extentX = (nx - 1) * metresPerSample, extentZ = (ny - 1) * metresPerSample;
  const position: [number, number, number] = [grid.meta.originM[0] + extentX / 2, 0, grid.meta.originM[1] + extentZ / 2];
  if (grid.flippedCells?.size) {
    const vertices = new Float32Array(nx * ny * 3);
    for (let z = 0; z < ny; z++) for (let x = 0; x < nx; x++) {
      const i = z * nx + x;
      vertices.set([x * metresPerSample - extentX / 2, heights[i] * verticalScale,
        z * metresPerSample - extentZ / 2], i * 3);
    }
    return { kind: 'trimesh' as const, vertices, indices: terrainGridIndices(nx, ny, grid.flippedCells), position };
  }
  const data = new Float32Array(nx * ny);
  for (let x = 0; x < nx; x++) for (let z = 0; z < ny; z++) data[x * ny + z] = heights[z * nx + x];
  return { kind: 'heightfield' as const, data, rows: ny - 1, columns: nx - 1,
    scale: { x: extentX, y: verticalScale, z: extentZ }, position };
}
