import { sampleChunkHeight } from "@elder-souls/game-core/terrain/heightfield";
import type { ChunkStore, ChunksManifest } from "./chunkStore";

/**
 * The coarse height lookup the terrain occlusion test marches along
 * (`@elder-souls/game-core/terrain/terrainOcclusion`, decision 0084).
 *
 * It reads the COARSEST resident raster only — LOD 8, the one every province
 * chunk keeps — and decodes nothing: a chunk whose LOD 8 has not arrived (and
 * anything outside the province grid, the apron included) answers NaN, which
 * the test treats as "no data, not blocking". Heights come back in DISPLAY
 * metres (the stored true metres times the vertical scale), the same space as
 * the camera and the draw units' bounding boxes.
 */
export function makeChunkHeightSampler(
  store: ChunkStore, manifest: ChunksManifest, verticalScale: number,
): (x: number, z: number) => number {
  const chunkM = manifest.chunkMetres;
  const [gridX, gridY] = manifest.grid;
  return (x, z) => {
    const cx = Math.floor(x / chunkM), cy = Math.floor(z / chunkM);
    if (cx < 0 || cy < 0 || cx >= gridX || cy >= gridY) return NaN;
    const grid = store.loaded(cx, cy, "8");
    if (!grid) return NaN;
    return sampleChunkHeight(grid, x, z) * verticalScale;
  };
}
