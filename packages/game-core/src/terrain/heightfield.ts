import type { ChunkGrid } from "./chunkStore";

/** Exact anti-diagonal triangulation used by the terrain mesh and Rapier
 * heightfields. Bilinear interpolation is a different surface inside a cell. */
export function triangleHeight(h00: number, h10: number, h01: number, h11: number, x: number, z: number, flipped = false): number {
  if (flipped) return x <= z
    ? h00 + (h11 - h01) * x + (h01 - h00) * z
    : h00 + (h10 - h00) * x + (h11 - h10) * z;
  return x + z <= 1
    ? h00 + (h10 - h00) * x + (h01 - h00) * z
    : h11 + (h01 - h11) * (1 - x) + (h10 - h11) * (1 - z);
}

export function sampleChunkHeight(grid: ChunkGrid, worldX: number, worldZ: number): number {
  const x = Math.max(0, Math.min(grid.nx - 1, (worldX - grid.meta.originM[0]) / grid.metresPerSample));
  const z = Math.max(0, Math.min(grid.ny - 1, (worldZ - grid.meta.originM[1]) / grid.metresPerSample));
  const ix = Math.min(grid.nx - 2, Math.floor(x)), iz = Math.min(grid.ny - 2, Math.floor(z));
  const i = iz * grid.nx + ix, h = grid.heights;
  return triangleHeight(h[i], h[i + 1], h[i + grid.nx], h[i + grid.nx + 1], x - ix, z - iz,
    grid.flippedCells?.has(iz * (grid.nx - 1) + ix));
}
