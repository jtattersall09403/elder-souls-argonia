/**
 * A kit's published parts (decision 0120) as one gltf-shaped `{ scene }`,
 * loaded once per (kit, enabled) through `loadKitParts` and the caller's
 * KitCache: state, not suspense, so the hook's owner mounts at once and its
 * other fetches (the vegetation index, the manifests) run in parallel with
 * the parts. `null` until every named part has arrived, or while disabled.
 *
 * The vegetation index carries no species per chunk (vegetationBundle.ts
 * VegetationIndexEntry), so a kit loads every species in one pass at the
 * caller's priority: one build, never one per part.
 */
import { useEffect, useMemo, useState } from "react";
import type * as THREE from "three";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { createKitLoader, type KitDecoders } from "@elder-souls/game-core/assets/kitLoader";
import { loadKitParts } from "@elder-souls/game-core/assets/loadKitParts";
import { SharedKtx2Textures } from "@elder-souls/game-core/assets/sharedTextures";
import type { KitCache } from "@elder-souls/game-core/settlement/kitCache";

export function useKitParts(baseUrl: string, kitId: string, decoders: KitDecoders, kitCache: KitCache,
  options: { enabled?: boolean; priority?: RequestPriority } = {}): { scene: THREE.Group } | null {
  const { enabled = true, priority } = options;
  const loader = useMemo(() => createKitLoader(decoders)
    .setKTX2Loader(new SharedKtx2Textures(decoders.ktx2) as unknown as KTX2Loader), [decoders]);
  const [gltf, setGltf] = useState<{ scene: THREE.Group } | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    loadKitParts(kitId, "all", { baseUrl, kitCache, loader, priority })
      .then(({ scene }) => { if (!cancelled) setGltf({ scene }); })
      .catch((error: unknown) => console.error(`[kit] ${kitId} parts failed to load`, error));
    return () => { cancelled = true; };
  }, [baseUrl, kitId, kitCache, loader, enabled, priority]);
  return gltf;
}
