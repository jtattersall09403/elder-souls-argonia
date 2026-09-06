import { loadWaterAssets } from "@elder-souls/game-core/water/render/loadWaterAssets";
import { worldClock } from "../sky/timeState";
import { waterTimeS } from "./waterClock";
import { primeWetnessUniforms } from "./groundWetness";
import { sharedWaterAssets as legacyAssets, setWetSeasonOverride as legacySeason, setWaterGroundHeight as legacyGround } from "./legacy/waterAssets";
import type { WaterAssets } from "@elder-souls/game-core/water/render/types";
export type { WaterAssets } from "@elder-souls/game-core/water/render/types";
export const LEGACY_WATER = new URLSearchParams(window.location.search).get("water") === "legacy";

/** Studio-only preview controls and cache. Runtime loading/decoding lives in
 * the package, shared by any app that consumes the province bundle. */
let seasonOverride: number | null = null;
export function setWetSeasonOverride(v: number | null): void {
  seasonOverride = v;
  legacySeason(v);
}
export function effectiveSeasonScalar(): number {
  return seasonOverride ?? worldClock.season().s;
}

let groundHeightFn: ((x: number, z: number) => number | null) | null = null;
export function setWaterGroundHeight(fn: ((x: number, z: number) => number | null) | null): void {
  groundHeightFn = fn;
  legacyGround(fn);
}

const cache = new Map<string, Promise<WaterAssets>>();
export function sharedWaterAssets(base: string): Promise<WaterAssets> {
  const cached = cache.get(base);
  if (cached) return cached;
  const pending = (LEGACY_WATER
    ? legacyAssets(base).then((assets) => {
      // Terrain uses the shared wetness adapter even with the old renderer.
      // Its optional support/character fields accept the v1 bundle.
      primeWetnessUniforms(assets);
      return assets as WaterAssets;
    })
    : loadWaterAssets({
      baseUrl: base,
      groundHeight: (x, z) => groundHeightFn?.(x, z) ?? null,
      seasonScalar: effectiveSeasonScalar,
      waveTimeS: waterTimeS,
    }).then((assets) => {
      primeWetnessUniforms(assets);
      return assets;
    })
  ).catch((error: unknown) => {
    cache.delete(base);
    throw error;
  });
  cache.set(base, pending);
  return pending;
}
