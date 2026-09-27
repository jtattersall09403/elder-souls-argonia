import { sampleChunkHeight } from "@elder-souls/game-core/terrain/heightfield";
import { LOD_BANDS, type ChunkStore, type ChunksManifest } from "./chunkStore";

/** Finest first: the order the sampler looks for a resident raster in. */
const LODS_FINE_FIRST = LOD_BANDS.map((b) => b.lod);

/**
 * The coarse height lookup the terrain occlusion test marches along
 * (`@elder-souls/game-core/terrain/terrainOcclusion`, decision 0084).
 *
 * It reads the FINEST resident raster of the chunk (LOD 1, then 2, 4, 8; LOD 8
 * is the one every province chunk keeps), so a place's ground overlay
 * (decision 0102; a 15 m pad is one 14.6 m LOD-8 sample) reads as the mesh
 * draws it wherever the mesh is fine. It decodes nothing: a chunk with no
 * resident raster (and anything outside the province grid, the apron
 * included) answers NaN, which the test treats as "no data, not blocking". Heights come back in DISPLAY
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
    for (const lod of LODS_FINE_FIRST) {
      const grid = store.loaded(cx, cy, lod);
      if (grid) return sampleChunkHeight(grid, x, z) * verticalScale;
    }
    return NaN;
  };
}
