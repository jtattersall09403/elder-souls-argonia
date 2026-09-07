import { loadWaterAssets } from "@elder-souls/game-core/water/render/loadWaterAssets";
import { worldClock } from "../sky/timeState";
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

const cache = new Map<string, Promise<WaterAssets>>();
export function sharedWaterAssets(base: string): Promise<WaterAssets> {
  const cached = cache.get(base);
  if (cached) return cached;
  const pending = loadWaterAssets({
    baseUrl: base,
    groundHeight: (x, z) => groundHeightFn?.(x, z) ?? null,
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
