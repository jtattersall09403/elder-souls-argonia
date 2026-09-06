import { ChunkStore, loadSparseHeightOverlay } from "@elder-souls/game-core/terrain/chunkStore";
export { ChunkStore } from "@elder-souls/game-core/terrain/chunkStore";
export type { ChunkLodMeta, ChunkMeta, ChunksManifest, ChunkGrid } from "@elder-souls/game-core/terrain/chunkStore";

/** App-owned cache shared by fly/walk terrain, colliders and vegetation.
 * The legacy comparison bypasses both bed corrections and grid alignment. */
let shared: ChunkStore | null = null;
export function sharedChunkStore(baseUrl: string): ChunkStore {
  if (!shared || shared.baseUrl !== baseUrl) {
    const legacy = new URLSearchParams(window.location.search).get("water") === "legacy";
    shared = new ChunkStore(baseUrl, legacy ? {} : {
      loadHeightOverlay: () => loadSparseHeightOverlay(`${baseUrl}province/water/v2/water-bed-overlay.json`),
    });
  }
  return shared;
}
