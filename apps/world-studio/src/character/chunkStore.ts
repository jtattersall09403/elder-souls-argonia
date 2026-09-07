export { ChunkStore } from "@elder-souls/game-core/terrain/chunkStore";
export type { ChunkLodMeta, ChunkMeta, ChunksManifest, ChunkGrid } from "@elder-souls/game-core/terrain/chunkStore";
import { ChunkStore } from "@elder-souls/game-core/terrain/chunkStore";

/** App-owned cache shared by fly/walk terrain, colliders and vegetation. */
let shared: ChunkStore | null = null;
export function sharedChunkStore(baseUrl: string): ChunkStore {
  if (!shared || shared.baseUrl !== baseUrl) shared = new ChunkStore(baseUrl);
  return shared;
}
