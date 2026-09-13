export { ChunkStore } from "@elder-souls/game-core/terrain/chunkStore";
export type { ChunkLodMeta, ChunkMeta, ChunksManifest, ChunkGrid } from "@elder-souls/game-core/terrain/chunkStore";
import type { ChunkMeta, ChunksManifest } from "@elder-souls/game-core/terrain/chunkStore";
import { ChunkStore } from "@elder-souls/game-core/terrain/chunkStore";

/** App-owned cache shared by fly/walk terrain, colliders and vegetation. */
let shared: ChunkStore | null = null;
export function sharedChunkStore(baseUrl: string): ChunkStore {
  if (!shared || shared.baseUrl !== baseUrl) shared = new ChunkStore(baseUrl);
  return shared;
}

/** LOD a chunk is drawn at, by Chebyshev chunk distance from the focus cell
 * (the same rings ChunkTerrain uses: 1 near, 2 mid, 4 far). */
export function lodForDistance(dx: number, dy: number): string {
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return d <= 1 ? "1" : d <= 3 ? "2" : "4";
}

/** Start every chunk's tile download the moment the manifest is known,
 * without waiting for the splat material's textures (~40 MB of PNG) to
 * arrive: until 2026-09-13 the tile requests sat behind that gate inside
 * ChunkTerrain, so the flyover showed the flat grey fallback for 30 s or
 * more on a cold load. The store dedupes, so ChunkTerrain's own requests
 * find these pending or done. Fire-and-forget; failures surface later. */
export function prefetchChunks(store: ChunkStore, manifest: ChunksManifest, focusXM: number, focusZM: number): void {
  const cx = Math.max(0, Math.min(manifest.grid[0] - 1, Math.floor(focusXM / manifest.chunkMetres)));
  const cy = Math.max(0, Math.min(manifest.grid[1] - 1, Math.floor(focusZM / manifest.chunkMetres)));
  const near: ChunkMeta[] = [], far: ChunkMeta[] = [];
  for (const c of manifest.chunks) (Math.max(Math.abs(c.cx - cx), Math.abs(c.cy - cy)) <= 3 ? near : far).push(c);
  for (const c of [...near, ...far]) {
    store.load(c.cx, c.cy, lodForDistance(c.cx - cx, c.cy - cy)).catch(() => { /* reported where it is drawn */ });
  }
}
