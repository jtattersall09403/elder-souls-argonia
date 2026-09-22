import { BufferAttribute, BufferGeometry } from "three";
import type { ChunkGrid } from "./chunkStore";

/** Shared renderer/collider winding for a regular grid.
 * `skipQuad(x, z)` (16d) drops individual quads — the border apron's coarse
 * tiles cover the province and the finer rings, and those quads are not drawn
 * over them. Skipped quads leave no unused vertices behind by design: the
 * position buffer stays a plain grid, only the index is sparse. */
export function terrainGridIndices(nx: number, ny: number, skipQuad?: (x: number, z: number) => boolean): Uint32Array {
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 2 || ny < 2) throw new Error("Invalid terrain grid dimensions");
  const indices = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let write = 0;
  for (let z = 0; z < ny - 1; z++) for (let x = 0; x < nx - 1; x++) {
    if (skipQuad?.(x, z)) continue;
    const a = z * nx + x, b = a + 1, c = a + nx, d = c + 1;
    indices[write++] = a; indices[write++] = c; indices[write++] = b;
    indices[write++] = b; indices[write++] = c; indices[write++] = d;
  }
  return write === indices.length ? indices : indices.slice(0, write);
}

/**
 * One sub-tile of a chunk grid: the `(ix, iz)` cell of a `divisions`×`divisions`
 * split, `(n - 1) / divisions + 1` samples square, sharing its edge rows and
 * columns with its neighbours (so neighbouring sub-tiles at the same LOD meet
 * exactly, and at different LODs meet under the skirts the mesh builder adds).
 *
 * Used by the character-mode terrain renderer to choose LOD 1 or LOD 2 per
 * sub-tile rather than per 467.9 m chunk. The returned grid carries the
 * sub-tile's own world origin, so the shared mesh builder places it and maps
 * its UVs in province space with no further arithmetic.
 */
export function subGrid(grid: ChunkGrid, ix: number, iz: number, divisions: number): ChunkGrid {
  const { heights, nx, ny, metresPerSample } = grid;
  if (!Number.isInteger(divisions) || divisions < 1) throw new Error("Invalid sub-tile divisions");
  if ((nx - 1) % divisions !== 0 || (ny - 1) % divisions !== 0) throw new Error("Grid does not divide into sub-tiles");
  if (ix < 0 || iz < 0 || ix >= divisions || iz >= divisions) throw new Error("Sub-tile index out of range");
  const stepX = (nx - 1) / divisions, stepZ = (ny - 1) / divisions;
  const sx = ix * stepX, sz = iz * stepZ;
  const sub = new Float32Array((stepX + 1) * (stepZ + 1));
  for (let z = 0; z <= stepZ; z++) {
    sub.set(heights.subarray((sz + z) * nx + sx, (sz + z) * nx + sx + stepX + 1), z * (stepX + 1));
  }
  const [ox, oz] = grid.meta.originM;
  return {
    meta: { ...grid.meta, originM: [ox + sx * metresPerSample, oz + sz * metresPerSample] },
    lod: grid.lod,
    heights: sub,
    nx: stepX + 1,
    ny: stepZ + 1,
    metresPerSample,
  };
}

/** One chunk mesh: the regular grid with a dropped skirt ring hiding
 * hairline gaps at LOD borders. Shared by the studio and the game. */
export function buildTerrainGridGeometry(
  grid: ChunkGrid,
  verticalScale: number,
  /** Metre span the UV frame covers: one number for a square frame, or
   * `[x, z]` for a rectangular one (16d's far apron paint set). */
  uvExtentM: number | [number, number],
  /** NW corner of the UV frame in metres; the province's control map starts
   * at the origin, the apron's own paint sets do not (16d). */
  uvOriginM: [number, number] = [0, 0],
): BufferGeometry {
  const { heights, nx, ny, metresPerSample } = grid;
  const [ox, oz] = grid.meta.originM;
  const [ux, uz] = Array.isArray(uvExtentM) ? uvExtentM : [uvExtentM, uvExtentM];
  const gx = nx + 2, gz = ny + 2;
  const positions = new Float32Array(gx * gz * 3), uv = new Float32Array(gx * gz * 2);
  for (let z = 0; z < gz; z++) for (let x = 0; x < gx; x++) {
    const i = z * gx + x, sx = Math.max(0, Math.min(nx - 1, x - 1)), sz = Math.max(0, Math.min(ny - 1, z - 1));
    const skirt = x === 0 || z === 0 || x === gx - 1 || z === gz - 1;
    const wx = ox + sx * metresPerSample, wz = oz + sz * metresPerSample;
    positions[i * 3] = wx; positions[i * 3 + 1] = (heights[sz * nx + sx] - (skirt ? 2.5 : 0)) * verticalScale;
    positions[i * 3 + 2] = wz;
    uv[i * 2] = (wx - uvOriginM[0]) / ux; uv[i * 2 + 1] = 1 - (wz - uvOriginM[1]) / uz;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(terrainGridIndices(gx, gz), 1));
  return geometry;
}
