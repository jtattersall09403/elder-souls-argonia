import { BufferAttribute, BufferGeometry } from "three";
import type { ChunkGrid } from "./chunkStore";

/** Shared renderer/collider winding for a regular grid. */
export function terrainGridIndices(nx: number, ny: number): Uint32Array {
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 2 || ny < 2) throw new Error("Invalid terrain grid dimensions");
  const indices = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let write = 0;
  for (let z = 0; z < ny - 1; z++) for (let x = 0; x < nx - 1; x++) {
    const a = z * nx + x, b = a + 1, c = a + nx, d = c + 1;
    indices[write++] = a; indices[write++] = c; indices[write++] = b;
    indices[write++] = b; indices[write++] = c; indices[write++] = d;
  }
  return indices;
}

/** One chunk mesh: the regular grid with a dropped skirt ring hiding
 * hairline gaps at LOD borders. Shared by the studio and the game. */
export function buildTerrainGridGeometry(grid: ChunkGrid, verticalScale: number, uvExtentM: number): BufferGeometry {
  const { heights, nx, ny, metresPerSample } = grid;
  const [ox, oz] = grid.meta.originM;
  const gx = nx + 2, gz = ny + 2;
  const positions = new Float32Array(gx * gz * 3), uv = new Float32Array(gx * gz * 2);
  for (let z = 0; z < gz; z++) for (let x = 0; x < gx; x++) {
    const i = z * gx + x, sx = Math.max(0, Math.min(nx - 1, x - 1)), sz = Math.max(0, Math.min(ny - 1, z - 1));
    const skirt = x === 0 || z === 0 || x === gx - 1 || z === gz - 1;
    const wx = ox + sx * metresPerSample, wz = oz + sz * metresPerSample;
    positions[i * 3] = wx; positions[i * 3 + 1] = (heights[sz * nx + sx] - (skirt ? 2.5 : 0)) * verticalScale;
    positions[i * 3 + 2] = wz; uv[i * 2] = wx / uvExtentM; uv[i * 2 + 1] = 1 - wz / uvExtentM;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(terrainGridIndices(gx, gz), 1));
  return geometry;
}
