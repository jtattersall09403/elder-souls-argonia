/**
 * Loading the flora kits, the vegetation index and the collider shapes —
 * extracted from `Vegetation.tsx` (2026-09-20) so the cell renderer
 * (`VegetationCells.tsx`) shares exactly the same loading code rather than a
 * second copy that can drift. Behaviour is unchanged.
 */

import { useEffect, useMemo, useState } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { configureKitLoader, createKitLoader } from "@elder-souls/game-core/assets/kitLoader";
import { useKitDecoders } from "@elder-souls/game-core/assets/useKitDecoders";
import {
  collidersFor,
  type FloraCollider,
} from "@elder-souls/game-core/physics/floraSolids";
import { buildFloraKit, mergeFloraKits, type FloraKit, type KitManifest } from "./floraKit";
import { sharedChunkStore, type ChunkStore, type ChunksManifest } from "../character/chunkStore";
import type { VegetationIndex } from "./vegetationBundle";

export interface FloraKitState {
  kit: FloraKit | null;
  index: VegetationIndex | null;
  manifest: KitManifest | null;
  underwaterManifest: KitManifest | null;
  chunksManifest: ChunksManifest | null;
  store: ChunkStore;
  /** Ask for the 27 MB underwater kit (idempotent). */
  requestUnderwater: () => void;
}

export function useFloraKit(baseUrl: string): FloraKitState {
  // Streamed terrain, for re-grounding baked instance heights.
  const store = sharedChunkStore(baseUrl);
  const [chunksManifest, setChunksManifest] = useState<ChunksManifest | null>(null);
  const [index, setIndex] = useState<VegetationIndex | null>(null);
  const [manifest, setManifest] = useState<KitManifest | null>(null);
  const [underwaterManifest, setUnderwaterManifest] = useState<KitManifest | null>(null);

  // Kits ship KTX2/meshopt-compressed (pipeline/kit_compress.py); the
  // decoders are the renderer's, shared by every kit load.
  const decoders = useKitDecoders(baseUrl);
  const gltf = useLoader(GLTFLoader, `${baseUrl}kits/flora-province-v1.glb`,
    (loader) => configureKitLoader(loader, decoders));
  const [underwaterGltf, setUnderwaterGltf] = useState<GLTF | null>(null);
  const [underwaterWanted, setUnderwaterWanted] = useState(false);
  useEffect(() => {
    if (!underwaterWanted) return;
    let cancelled = false;
    createKitLoader(decoders).loadAsync(`${baseUrl}kits/underwater-v1.glb`)
      .then((g) => { if (!cancelled) setUnderwaterGltf(g); })
      .catch((error: unknown) => {
        console.error("[vegetation] underwater kit failed to load", error);
      });
    return () => { cancelled = true; };
  }, [baseUrl, underwaterWanted, decoders]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${baseUrl}province/vegetation/vegetation-index.json`).then((r) => r.json()),
      fetch(`${baseUrl}kits/flora-province-v1.kit.json`).then((r) => r.json()),
      fetch(`${baseUrl}kits/underwater-v1.kit.json`).then((r) => r.json()),
    ])
      .then(([i, m, u]) => {
        if (!cancelled) {
          setIndex(i as VegetationIndex);
          setManifest(m as KitManifest);
          setUnderwaterManifest(u as KitManifest);
        }
      })
      // Never silent: a bundle index or kit manifest that fails to load is
      // the whole scatter layer missing, and a swallowed rejection was how
      // "every tree and rock vanished" reached the owner with no console line.
      .catch((error: unknown) => {
        console.error("[vegetation] index or kit manifest failed to load", error);
      });
    store.manifest()
      .then((m) => { if (!cancelled) setChunksManifest(m); })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  const kit: FloraKit | null = useMemo(() => {
    if (!manifest || !underwaterManifest) return null;
    // First wins on a duplicate id: a few assets (tbp_seaweed06,
    // waterkelptall02/03) ship in both kits, and the palettes were authored
    // against the land kit's copy.
    const land = buildFloraKit(gltf, manifest);
    const merged = underwaterGltf
      ? mergeFloraKits(land, buildFloraKit(underwaterGltf, underwaterManifest, true))
      : land;
    if (import.meta.env.DEV) {
      console.info(`[vegetation] kit: ${merged.size} assets (flora${underwaterGltf ? " + underwater" : ""})`);
    }
    return merged;
  }, [gltf, underwaterGltf, manifest, underwaterManifest]);

  return {
    kit, index, manifest, underwaterManifest, chunksManifest, store,
    requestUnderwater: () => setUnderwaterWanted(true),
  };
}

/**
 * Collider shapes, built ONCE per kit load. A `convex` species (every rock,
 * boulder pile and cliff shell) collides as its own LOD0 triangles: a box
 * around a 30 m cliff walls off the ledge it exists to offer.
 */
export function useColliderShapes(
  kit: FloraKit | null,
  manifest: KitManifest | null,
  underwaterManifest: KitManifest | null,
  shapesRef?: React.MutableRefObject<Map<string, FloraCollider[]> | null>,
): void {
  useEffect(() => {
    if (!shapesRef || !kit || !manifest || !underwaterManifest) return;
    const assets = new Map(
      [...underwaterManifest.assets, ...manifest.assets].map((a) => [a.id, a]),
    );
    const geometryFor = (assetId: string) => {
      const parts = kit.get(assetId)?.levels[0]?.parts;
      if (!parts?.length) return null;
      // One merged array pair across the level's parts, index offsets applied.
      let vertexCount = 0;
      let indexCount = 0;
      for (const part of parts) {
        const position = part.geometry.getAttribute("position");
        const index = part.geometry.getIndex();
        vertexCount += position.count;
        indexCount += index ? index.count : position.count;
      }
      const positions = new Float32Array(vertexCount * 3);
      const index = new Uint32Array(indexCount);
      let vertexAt = 0;
      let indexAt = 0;
      for (const part of parts) {
        const position = part.geometry.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          positions[(vertexAt + i) * 3] = position.getX(i);
          positions[(vertexAt + i) * 3 + 1] = position.getY(i);
          positions[(vertexAt + i) * 3 + 2] = position.getZ(i);
        }
        const partIndex = part.geometry.getIndex();
        const count = partIndex ? partIndex.count : position.count;
        for (let i = 0; i < count; i++) {
          index[indexAt + i] = (partIndex ? partIndex.getX(i) : i) + vertexAt;
        }
        vertexAt += position.count;
        indexAt += count;
      }
      return { positions, index };
    };
    const shapes = new Map<string, FloraCollider[]>();
    for (const id of kit.keys()) {
      shapes.set(id, collidersFor(assets.get(id), geometryFor));
    }
    shapesRef.current = shapes;
  }, [kit, manifest, underwaterManifest, shapesRef]);
}
