import { BufferAttribute, BufferGeometry } from "three";
import type { ChunkGrid } from "./chunkStore";

/** Shared renderer/collider winding. Flips are native CELL indices, not
 * vertices; topology changes never alter any source height. */
export function terrainGridIndices(nx: number, ny: number, flippedCells?: ReadonlySet<number>): Uint32Array {
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 2 || ny < 2) throw new Error("Invalid terrain grid dimensions");
  const indices = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let write = 0;
  for (let z = 0; z < ny - 1; z++) for (let x = 0; x < nx - 1; x++) {
    const a = z * nx + x, b = a + 1, c = a + nx, d = c + 1;
    if (flippedCells?.has(z * (nx - 1) + x)) {
      indices[write++] = a; indices[write++] = c; indices[write++] = d;
      indices[write++] = a; indices[write++] = d; indices[write++] = b;
    } else {
      indices[write++] = a; indices[write++] = c; indices[write++] = b;
      indices[write++] = b; indices[write++] = c; indices[write++] = d;
    }
  }
  return indices;
}

/** Existing regular-grid renderer, extracted so game and studio share the
 * native topology. Skirts remain only on the legacy/fallback grid path. */
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
  const flipped = new Set<number>();
  for (const cell of grid.flippedCells ?? []) {
    const x = cell % (nx - 1), z = Math.floor(cell / (nx - 1));
    flipped.add((z + 1) * (gx - 1) + x + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(terrainGridIndices(gx, gz, flipped), 1));
  return geometry;
}
