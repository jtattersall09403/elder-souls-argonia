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
import {
  buildFloraKit, installImpostors, mergeFloraKits, withholdCards,
  type FloraKit, type KitLevel, type KitManifest,
} from "./floraKit";
import { FRAME_WORK_STARTUP_MS } from "@elder-souls/game-core/scheduling/frameWork";
import {
  impostorPart, type ImpostorSidecar,
} from "@elder-souls/game-core/vegetation/impostor";
import { sharedChunkStore, type ChunkStore, type ChunksManifest } from "../character/chunkStore";
import type { VegetationIndex } from "./vegetationBundle";
import { STUDIO_TOOLS } from "../studioTools";

type Impostors = ReadonlyMap<string, { part: KitLevel["parts"][number]; contentPx: number }>;

/** The longest the kit waits on the impostor sidecar (3 KB) before building without it. */
const SIDECAR_WAIT_MS = 1500;

/**
 * The kit the renderer draws, composed from bases built ONCE per GLB
 * (review 2026-09-30): every new kit Map sends each vegetation cell to
 * rebuild, and a base rebuilt per composition gave every species new
 * geometries and materials, so the sidecar and the impostor GLBs arriving
 * each rebuilt and relinked the whole ring. Here an impostor arrival changes
 * only the impostor species' entries; every other entry is the base's own
 * object. `null` until the sidecar is known (loaded, absent, failed or timed
 * out), so its arrival is never a rebuild of its own.
 */
export function composeFloraKit(
  land: FloraKit | null,
  underwater: FloraKit | null,
  sidecarKnown: boolean,
  impostors: Impostors | null,
  impostorsPending: readonly string[],
): FloraKit | null {
  if (!land || !sidecarKnown) return null;
  const withImpostors = impostors
    ? installImpostors(land, impostors)
    : impostorsPending.length ? withholdCards(land, impostorsPending) : land;
  // First wins on a duplicate id: a few assets (tbp_seaweed06,
  // waterkelptall02/03) ship in both kits, and the palettes were authored
  // against the land kit's copy.
  return underwater ? mergeFloraKits(withImpostors, underwater) : withImpostors;
}

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
  // Octahedral impostors (the flora kit's sidecar, `<kit>.impostors.json`):
  // installed over the card level of their species. They are NOT startup
  // payload (test_kit_compress STARTUP_KITS): the sidecar (a few hundred
  // bytes) is read at once so those species withhold their card
  // (`withholdCards`: the last mesh level runs to the draw distance), and the
  // GLBs load only after the startup window (FRAME_WORK_STARTUP_MS), while
  // the kits and the first chunks own the network. No sidecar (or an empty
  // one) leaves every card as it is.
  const [impostors, setImpostors] = useState<Impostors | null>(null);
  const [impostorsPending, setImpostorsPending] = useState<string[]>([]);
  const [sidecarKnown, setSidecarKnown] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const known = () => { if (!cancelled) setSidecarKnown(true); };
    const cap = setTimeout(known, SIDECAR_WAIT_MS);
    fetch(`${baseUrl}kits/flora-province-v1.impostors.json`)
      .then((r) => (r.ok ? (r.json() as Promise<ImpostorSidecar>) : null))
      .then((sidecar) => {
        if (cancelled) return;
        if (sidecar?.impostors.length) setImpostorsPending(sidecar.impostors.map((record) => record.id));
        known();
        if (!sidecar?.impostors.length) return;
        timer = setTimeout(() => {
          const loader = createKitLoader(decoders);
          const loaded = new Map<string, { part: KitLevel["parts"][number]; contentPx: number }>();
          Promise.all(sidecar.impostors.map(async (record) => {
            const g = await loader.loadAsync(`${baseUrl}kits/${record.path}`);
            const part = impostorPart(record, g.scene);
            if (part) loaded.set(record.id, { part, contentPx: record.contentPx });
          }))
            .then(() => { if (!cancelled) setImpostors(loaded); })
            .catch((error: unknown) => {
              // The withheld cards come back: never a species with neither.
              console.error("[vegetation] impostors failed to load", error);
              if (!cancelled) setImpostorsPending([]);
            });
        }, FRAME_WORK_STARTUP_MS);
      })
      .catch((error: unknown) => {
        console.error("[vegetation] impostor sidecar failed to load", error);
        known();
      });
    return () => { cancelled = true; clearTimeout(cap); if (timer !== undefined) clearTimeout(timer); };
  }, [baseUrl, decoders]);
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

  // Each base is built once per GLB; composing never rebuilds one.
  const landBase = useMemo(() => (manifest ? buildFloraKit(gltf, manifest) : null), [gltf, manifest]);
  const underwaterBase = useMemo(
    () => (underwaterGltf && underwaterManifest ? buildFloraKit(underwaterGltf, underwaterManifest, true) : null),
    [underwaterGltf, underwaterManifest]);
  const kit: FloraKit | null = useMemo(() => {
    if (!underwaterManifest) return null;
    const composed = composeFloraKit(landBase, underwaterBase, sidecarKnown, impostors, impostorsPending);
    if (composed && STUDIO_TOOLS) {
      console.info(`[vegetation] kit: ${composed.size} assets (flora${underwaterBase ? " + underwater" : ""})`);
    }
    return composed;
  }, [landBase, underwaterBase, underwaterManifest, sidecarKnown, impostors, impostorsPending]);

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
