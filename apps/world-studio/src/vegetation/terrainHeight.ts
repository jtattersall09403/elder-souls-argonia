import type { ChunkStore, ChunksManifest } from "../character/chunkStore";

/** True-metre ground height from the SAME streamed chunks the terrain draws
 * (no new raster fetch): best decoded LOD, bilinear — mirrors
 * `ChunkWorld.groundHeight`, which only reads LOD 1 and so goes blind in the
 * flyover's mid ring. Shared by the T3 groundcover ring and the baked-scatter
 * renderer: the compiler bakes heights from its own raster, which can sit a
 * metre off the rendered mesh on banks and slopes — re-grounding here is what
 * keeps planted things out of the air (owner round-3 "floating roots"). */
export function groundHeightM(
  store: ChunkStore,
  manifest: ChunksManifest,
  x: number,
  z: number,
): number | null {
  const cx = Math.max(0, Math.min(manifest.grid[0] - 1, Math.floor(x / manifest.chunkMetres)));
  const cy = Math.max(0, Math.min(manifest.grid[1] - 1, Math.floor(z / manifest.chunkMetres)));
  const grid = store.loaded(cx, cy, "1") ?? store.loaded(cx, cy, "2") ?? store.loaded(cx, cy, "4");
  if (!grid) return null;
  const lx = (x - grid.meta.originM[0]) / grid.metresPerSample;
  const lz = (z - grid.meta.originM[1]) / grid.metresPerSample;
  const x0 = Math.max(0, Math.min(grid.nx - 2, Math.floor(lx)));
  const z0 = Math.max(0, Math.min(grid.ny - 2, Math.floor(lz)));
  const fx = Math.max(0, Math.min(1, lx - x0));
  const fz = Math.max(0, Math.min(1, lz - z0));
  const h = grid.heights;
  const h00 = h[z0 * grid.nx + x0];
  const h10 = h[z0 * grid.nx + x0 + 1];
  const h01 = h[(z0 + 1) * grid.nx + x0];
  const h11 = h[(z0 + 1) * grid.nx + x0 + 1];
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}
