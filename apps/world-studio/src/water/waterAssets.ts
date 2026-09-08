import { loadWaterAssets } from "@elder-souls/game-core/water/render/loadWaterAssets";
import { worldClock } from "../sky/timeState";
import { sharedChunkStore, type ChunksManifest } from "../character/chunkStore";
import { groundHeightM } from "../vegetation/terrainHeight";
import { waterTimeS } from "./waterClock";
import { primeWetnessUniforms } from "./groundWetness";
import type { WaterAssets } from "@elder-souls/game-core/water/render/types";
export type { WaterAssets } from "@elder-souls/game-core/water/render/types";

/** Studio-only preview controls and cache. Runtime loading/decoding lives in
 * the package, shared by any app that consumes the province bundle. */

/** Studio water-season override (round 2): a pinned season scalar for
 * preview (wet = +1, dry = −1), or null = FOLLOW THE CALENDAR — the shipped
 * behaviour. */
let seasonOverride: number | null = null;
export function setWetSeasonOverride(v: number | null): void {
  seasonOverride = v;
}
export function effectiveSeasonScalar(): number {
  return seasonOverride ?? worldClock.season().s;
}

/** Terrain ground-height hook — CharacterMode wires its ChunkWorld in so the
 * water query uses real chunk heights where they are loaded. */
let groundHeightFn: ((x: number, z: number) => number | null) | null = null;
export function setWaterGroundHeight(fn: ((x: number, z: number) => number | null) | null): void {
  groundHeightFn = fn;
}

/** Fallback for every view: the streamed terrain chunks themselves (best
 * decoded LOD, the same heights the terrain mesh draws), so the fly camera's
 * water query and the probe hook see real ground too, not only the walker. */
let chunkManifest: ChunksManifest | null = null;
let chunkGround: ((x: number, z: number) => number | null) | null = null;
function ensureChunkGround(base: string): void {
  if (chunkGround) return;
  const store = sharedChunkStore(base);
  chunkGround = (x, z) => (chunkManifest ? groundHeightM(store, chunkManifest, x, z) : null);
  store.manifest().then((m) => { chunkManifest = m; }).catch(() => { chunkManifest = null; });
}

/** Real ground where any loaded chunk covers (x, z), true metres, else null. */
export function waterGroundHeight(x: number, z: number): number | null {
  return groundHeightFn?.(x, z) ?? chunkGround?.(x, z) ?? null;
}

const cache = new Map<string, Promise<WaterAssets>>();
export function sharedWaterAssets(base: string): Promise<WaterAssets> {
  const cached = cache.get(base);
  if (cached) return cached;
  ensureChunkGround(base);
  const pending = loadWaterAssets({
    baseUrl: base,
    groundHeight: waterGroundHeight,
    seasonScalar: effectiveSeasonScalar,
    waveTimeS: waterTimeS,
  }).then((assets) => {
    // the terrain wet band samples the same rasters
    primeWetnessUniforms(assets);
    return assets;
  }).catch((error: unknown) => {
    cache.delete(base);
    throw error;
  });
  cache.set(base, pending);
  return pending;
}
