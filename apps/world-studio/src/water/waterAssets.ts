import { loadWaterAssets } from "@elder-souls/game-core/water/render/loadWaterAssets";
import { loadLadder } from "../ladder";
import { WATERFALL_TEXTURE_ROLES, type WaterfallTextureSlot } from "@elder-souls/game-core/water/render/WaterfallSheets";
import { worldClock } from "../sky/timeState";
import { sharedChunkStore, type ChunksManifest } from "../character/chunkStore";
import { groundHeightM } from "../vegetation/terrainHeight";
import { waterTimeS } from "./waterClock";
import { lastWeatherSample } from "../weather/weatherState";
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

/** The vanilla waterfall FX kit (decision 0064): the texture PNGs by shader
 * slot (read from the manifest by role) AND by id (every texture the kit's
 * shape roles bind), plus the piece geometry GLB `WATERFALL_GEOMETRY`.
 * Missing manifest = procedural fallback for the slots, no fall bodies. */
const WATERFALL_KIT = "kits/waterfall-fx-textures";
const WATERFALL_GEOMETRY = "kits/waterfall-fx-v1.glb";
async function waterfallTextureUrls(base: string): Promise<Partial<Record<WaterfallTextureSlot, string>> & Record<string, string | undefined>> {
  try {
    const res = await fetch(`${base}${WATERFALL_KIT}/manifest.json`);
    if (!res.ok) return {};
    const manifest = (await res.json()) as { textures?: { id: string; role: string; file: string }[] };
    const urls: Partial<Record<WaterfallTextureSlot, string>> & Record<string, string | undefined> = {};
    for (const [slot, role] of Object.entries(WATERFALL_TEXTURE_ROLES) as [WaterfallTextureSlot, string][]) {
      const entry = manifest.textures?.find((t) => t.role === role);
      if (entry) urls[slot] = `${base}${WATERFALL_KIT}/${entry.file}`;
    }
    for (const t of manifest.textures ?? []) if (t.id && !(t.id in urls)) urls[t.id] = `${base}${WATERFALL_KIT}/${t.file}`;
    return urls;
  } catch {
    return {};
  }
}

const cache = new Map<string, Promise<WaterAssets>>();
export function sharedWaterAssets(base: string): Promise<WaterAssets> {
  const cached = cache.get(base);
  if (cached) return cached;
  ensureChunkGround(base);
  // The sea beyond the border is drawn over the apron's ground (16d) only
  // when the ladder says the apron was built on this ground.
  const apronUrl = loadLadder(base).then((ladder) =>
    (ladder && ladder.hiddenLayers.includes("apron")) ? undefined : `${base}province/apron/apron-manifest.json`);
  const pending = Promise.all([waterfallTextureUrls(base), apronUrl]).then(([waterfallTextureUrls, apronManifestUrl]) => loadWaterAssets({
    baseUrl: base,
    apronManifestUrl,
    groundHeight: waterGroundHeight,
    seasonScalar: effectiveSeasonScalar,
    waveTimeS: waterTimeS,
    windSpeedMS: () => lastWeatherSample()?.windSpeedMS ?? 0,
    waterfallTextureUrls,
    waterfallKitUrl: `${base}${WATERFALL_GEOMETRY}`,
  })).then((assets) => {
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
