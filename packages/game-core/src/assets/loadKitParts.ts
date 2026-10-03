/**
 * Load a set of a kit's assets from its published parts (decision 0120) as
 * ONE gltf-shaped object: `{ scene }` whose children are the asset root
 * nodes, so readers written against a whole kit GLTF (buildFloraKit,
 * buildCardIndex, buildArchitectureKit, the waterfall kit) read it
 * unchanged. The parts index and every part go through the injected
 * KitCache (index once per kit; a part once per `kit#asset`, shared with the
 * settlement and interior layers), each part fetched at the caller's
 * priority. The roots are cloned into the group (geometry and materials
 * shared), so a part GLTF another layer holds is never re-parented.
 */
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KitCache } from "../settlement/kitCache";
import { fetchJsonWithRetry, loadGltfWithRetry, type BytesParser } from "../settlement/fetchRetry";
import { parseKitPartsIndex, type KitPartsIndex } from "./kitParts";

/** The published parts index of a kit by id (kit_parts.mjs writes it there). */
export const publishedKitPartsPath = (kitId: string): string => `kits/${kitId}/parts/index.json`;

export interface LoadKitPartsOptions {
  /** Site root the `kits/` folder sits under (with trailing slash). */
  baseUrl: string;
  kitCache: KitCache;
  /** A GLTFLoader with the kit decoders (and the shared KTX2 pool, sharedTextures.ts). */
  loader: BytesParser<GLTF>;
  priority?: RequestPriority;
  fetchFn?: typeof fetch;
}

/** The kit's parts index through the cache. */
export function loadKitPartsIndex(kitId: string, options: LoadKitPartsOptions): Promise<KitPartsIndex> {
  const url = `${options.baseUrl}${publishedKitPartsPath(kitId)}`;
  return options.kitCache.partsIndex(kitId, () =>
    fetchJsonWithRetry(url, { priority: options.priority }).then((raw) => parseKitPartsIndex(raw, kitId, url)));
}

/** One asset's part GLTF through the cache (key `kit#asset`). An asset the index lacks is an error naming it. */
export async function loadKitPart(kitId: string, assetId: string, options: LoadKitPartsOptions): Promise<GLTF> {
  const index = await loadKitPartsIndex(kitId, options);
  const row = index.assets[assetId];
  if (!row) throw new Error(`kit ${kitId}: asset ${assetId} has no published part (${publishedKitPartsPath(kitId)})`);
  const url = `${options.baseUrl}${publishedKitPartsPath(kitId).slice(0, -"index.json".length)}${row.file}`;
  return options.kitCache.load(`${kitId}#${assetId}`, url, (u) =>
    loadGltfWithRetry(u, options.loader, { priority: options.priority, fetchFn: options.fetchFn }));
}

/** The named assets (`"all"`: every asset in the index) as one group. */
export async function loadKitParts(kitId: string, assetIds: readonly string[] | "all",
  options: LoadKitPartsOptions): Promise<{ scene: THREE.Group; index: KitPartsIndex }> {
  const index = await loadKitPartsIndex(kitId, options);
  const ids = assetIds === "all" ? Object.keys(index.assets).sort() : [...assetIds];
  const parts = await Promise.all(ids.map((assetId) => loadKitPart(kitId, assetId, options)));
  const scene = new THREE.Group();
  scene.name = kitId;
  for (const gltf of parts) for (const root of gltf.scene.children) scene.add(root.clone());
  return { scene, index };
}
