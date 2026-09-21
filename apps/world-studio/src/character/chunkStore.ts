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

/** Terrain LOD ladder: the band a chunk is drawn at, by the distance from the
 * camera to the chunk rectangle's NEAREST EDGE (0 inside it), not by its ring
 * index. Chunks are 467.9 m, so the old Chebyshev rings drew LOD 1 out to
 * ~700 m in every direction; these thresholds are metres.
 *
 * A chunk steps UP in detail the moment it is inside a band, and steps DOWN
 * only once it is `LOD_HYSTERESIS` beyond it, so a camera sitting on a
 * boundary cannot flip a chunk back and forth every frame. */
export const LOD_BANDS: { lod: string; maxM: number }[] = [
  { lod: "1", maxM: 150 },
  { lod: "2", maxM: 900 },
  { lod: "4", maxM: 2800 },
  { lod: "8", maxM: Infinity },
];
export const LOD_HYSTERESIS = 1.15;
/** The camera must move this far before the whole ladder is re-evaluated. */
export const LOD_REEVALUATE_M = 8;

/** Distance in metres from (camX, camZ) to the chunk cell's rectangle. */
export function nearestEdgeM(camX: number, camZ: number, cx: number, cy: number, chunkMetres: number): number {
  const minX = cx * chunkMetres, minZ = cy * chunkMetres;
  const dx = Math.max(minX - camX, 0, camX - (minX + chunkMetres));
  const dz = Math.max(minZ - camZ, 0, camZ - (minZ + chunkMetres));
  return Math.hypot(dx, dz);
}

/** The LOD for a chunk cell, given the camera position and (for hysteresis)
 * the LOD it is currently drawn at. */
export function lodForDistance(
  camX: number, camZ: number, cx: number, cy: number, chunkMetres: number, current?: string,
): string {
  const d = nearestEdgeM(camX, camZ, cx, cy, chunkMetres);
  let fine = LOD_BANDS.length - 1;
  for (let i = 0; i < LOD_BANDS.length; i++) if (d < LOD_BANDS[i].maxM) { fine = i; break; }
  const ci = current === undefined ? -1 : LOD_BANDS.findIndex((b) => b.lod === current);
  if (ci < 0) return LOD_BANDS[fine].lod;
  if (fine < ci) return LOD_BANDS[fine].lod;          // upgrade immediately
  let coarse = LOD_BANDS.length - 1;
  for (let i = 0; i < LOD_BANDS.length; i++) if (d < LOD_BANDS[i].maxM * LOD_HYSTERESIS) { coarse = i; break; }
  return LOD_BANDS[Math.max(ci, coarse)].lod;          // downgrade only past the margin
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
    store.load(c.cx, c.cy, lodForDistance(focusXM, focusZM, c.cx, c.cy, manifest.chunkMetres))
      .catch(() => { /* reported where it is drawn */ });
  }
}
