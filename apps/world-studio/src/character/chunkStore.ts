import { ChunkStore, loadSparseHeightOverlay } from "@elder-souls/game-core/terrain/chunkStore";
import { loadNativeTerrainTopology } from "@elder-souls/game-core/terrain/nativeTopology";
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
      loadTerrainTopology: async () => {
        const response = await fetch(`${baseUrl}province/water/v2/water-meta.json`);
        if (!response.ok) throw new Error(`Terrain water metadata: HTTP ${response.status}`);
        const meta = await response.json();
        if (meta.schemaVersion !== 2) throw new Error('Terrain water metadata requires schemaVersion 2');
        const file = meta.surface?.terrainTopologyFile;
        if (file === undefined) return null;
        if (typeof file !== 'string' || !/^[a-zA-Z0-9_-]+\.json$/.test(file)) throw new Error('Invalid terrain topology filename');
        return loadNativeTerrainTopology(`${baseUrl}province/water/v2/${file}`);
      },
    });
  }
  return shared;
}
