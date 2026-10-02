import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BorderApron } from "@elder-souls/game-core/terrain/BorderApron";
import type { ApronManifest } from "@elder-souls/game-core/terrain/apronManifest";
import { paintFrameExtent } from "@elder-souls/game-core/terrain/apronManifest";
import { ChunkTerrain } from "./character/ChunkTerrain";
import {
  createOcclusionCadence, createOcclusionSweep, topCornersOfBox,
  type OcclusionRegistry, type OcclusionUnit,
} from "@elder-souls/game-core/terrain/terrainOcclusion";
import { makeChunkHeightSampler } from "./character/terrainHeightSampler";
import { useApronMaterials } from "./apronMaterials";
import { SkyContext } from "./sky/WorldSky";
import type { ChunkStore, ChunksManifest } from "./character/chunkStore";

/**
 * The province's terrain with the border apron beyond it (16d).
 *
 * Ring 0 is registered on the shared chunk store and drawn by `ChunkTerrain`
 * as ordinary chunks (so the border is an ordinary chunk seam); rings 1 and 2
 * are `BorderApron`'s two coarse meshes. The apron only starts once the built
 * ground's material exists, because both apron materials borrow its albedo
 * array texture instead of allocating another 40 MB each.
 */
type TerrainProps = Omit<React.ComponentProps<typeof ChunkTerrain>, "apron" | "onGroundMaterial">;

export function ApronTerrain({ apron, ...terrain }: TerrainProps & { apron: ApronManifest | null }) {
  const [ground, setGround] = useState<THREE.MeshStandardMaterial | null>(null);
  const [materials, setMaterials] = useState<{ near: THREE.Material; far: THREE.Material } | null>(null);
  const store: ChunkStore = terrain.store;
  const manifest: ChunksManifest = terrain.manifest;
  useEffect(() => {
    if (!apron) return;
    // tile files are relative to `ring0.dir` (build_border_apron writes both)
    store.register(apron.ring0.chunks, apron.ring0.dir);
  }, [store, apron, manifest]);
  const scale = terrain.verticalScale ?? manifest.verticalScaleAtGeometry;
  useEffect(() => {
    // Probe/diagnostics hook (the __GROUND_DEBUG__ pattern): what the apron mount has.
    const w = window as unknown as { __APRON_DEBUG__?: () => unknown };
    w.__APRON_DEBUG__ = () => ({
      manifest: !!apron, ring0Chunks: apron?.ring0.chunks.length ?? 0, tiles: apron?.tiles.length ?? 0,
      groundMaterial: !!ground, sharedArray: !!(ground?.userData.tex), materials: !!materials,
      ring0Registered: !!apron && !!store.chunkAt(-1, -1),
    });
    return () => { delete w.__APRON_DEBUG__; };
  }, [apron, ground, materials, store]);
  // Terrain occlusion for the apron's sectors (decision 0084): the same test
  // and the same height lookup the chunk renderer uses, as ONE pass over every
  // sector on the coarse cadence, spread over frames under 0.5 ms, half of
  // the 1 ms frame budget it shares with the chunk sweep (diag9 W1: a per-tile pass of every sector on one frame was a 34 ms walk
  // hitch). `&occl=0` removes it altogether.
  const occlusionOn = useMemo(
    () => new URLSearchParams(window.location.search).get("occl") !== "0", []);
  const heightAt = useMemo(
    () => makeChunkHeightSampler(store, manifest, scale), [store, manifest, scale]);
  const sectorUnits = useRef(new Map<string, OcclusionUnit & { box: THREE.Box3 }>());
  const occlusionDue = useRef(createOcclusionCadence());
  const occlusionSweep = useRef(createOcclusionSweep({ budgetMs: 0.5 }));
  const occlusion = useMemo<OcclusionRegistry | undefined>(() => {
    if (!occlusionOn) return undefined;
    const units = sectorUnits.current;
    return {
      register(key, mesh, box) {
        const known = units.get(key);
        if (known && known.mesh === mesh && known.box === box) return;
        // The apron meshes sit at the scene origin, so their boxes are world space.
        units.set(key, { mesh, box, corners: topCornersOfBox(box) });
      },
      unregister(key) { units.delete(key); },
    };
  }, [occlusionOn]);
  useFrame(({ camera }) => {
    if (!occlusion) return;
    if (occlusionDue.current(camera, performance.now())) {
      heightAt.reset();
      occlusionSweep.current.start(camera.position, sectorUnits.current.values());
    }
    const hidden = occlusionSweep.current.step(heightAt);
    if (hidden === null) return;
    const stats = (window as unknown as { __STUDIO_GPU_MS__?: { hiddenSectors?: number } })
      .__STUDIO_GPU_MS__;
    if (stats) stats.hiddenSectors = hidden;
  });
  const nearFrame = apron?.paint.near;
  return (
    <>
      <ChunkTerrain
        {...terrain}
        onGroundMaterial={setGround}
        apron={apron && materials && nearFrame
          ? { chunks: apron.ring0.chunks, material: materials.near, uvOriginM: nearFrame.originM, uvExtentM: paintFrameExtent(nearFrame)[0] }
          : undefined}
      />
      {/* Its own boundary: the apron's textures must never suspend (and so
          unmount) the ground the player is standing on. */}
      {apron && ground && (
        <Suspense fallback={null}>
        <ApronMaterials apron={apron} matSet={terrain.matSet} verticalScale={scale} onReady={setMaterials} />
        </Suspense>
      )}
      {apron && materials && (
        <BorderApron manifest={apron} baseUrl={import.meta.env.BASE_URL} materials={materials}
          verticalScale={scale} occlusion={occlusion} />
      )}
    </>
  );
}

/** Builds the two apron materials (it suspends on their textures) and hands
 * them up, so the terrain above stays mounted while they load. */
function ApronMaterials({ apron, matSet, verticalScale, onReady }: {
  apron: ApronManifest;
  matSet?: string;
  verticalScale: number;
  onReady: (m: { near: THREE.Material; far: THREE.Material } | null) => void;
}) {
  const { csm } = useContext(SkyContext);
  const materials = useApronMaterials(import.meta.env.BASE_URL, apron, matSet, verticalScale, csm);
  useEffect(() => {
    onReady(materials);
    return () => onReady(null);
  }, [materials, onReady]);
  return null;
}
