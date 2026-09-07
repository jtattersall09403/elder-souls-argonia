import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { createGroundMaterial, useGroundManifest, type GroundUniforms } from "../groundMaterial";
import { SkyContext, sharedAerialUniforms } from "../sky/WorldSky";
import type { ChunkGrid, ChunkStore, ChunksManifest } from "./chunkStore";
import { buildTerrainGridGeometry } from "@elder-souls/game-core/terrain/gridGeometry";
import { AdaptiveTerrainLoader, buildAdaptiveTerrainGeometry, type AdaptiveTerrainData, type AdaptiveTerrainManifest } from "@elder-souls/game-core/terrain/adaptiveTerrain";
import { TerrainViewResidency, type TerrainViewEntry } from "@elder-souls/game-core/terrain/viewResidency";
import { hasTerrainAuthority, selectTerrainDisplay } from '@elder-souls/game-core/terrain/displaySelection';
import { loadTerrainGradient } from '@elder-souls/game-core/terrain/terrainGradient';
import { waterDatasetPath } from '../water/waterDataset';

/**
 * Chunked terrain renderer: visible/buffer chunks each have their own mesh,
 * with LOD chosen by chunk distance from the player (native LOD 1 near,
 * 2 mid, 4 far), textured by the shared splat material. Near geometry is the
 * SAME LOD-1 grid the Rapier colliders use, so feet and ground agree exactly.
 * Each mesh gets a short dropped skirt to hide hairline gaps at LOD borders.
 */

function ChunkMesh({ grid, material, verticalScale, uvExtentM }: {
  grid: ChunkGrid;
  material: THREE.Material;
  verticalScale: number;
  uvExtentM: number;
}) {
  const geometry = useMemo(
    () => buildTerrainGridGeometry(grid, verticalScale, uvExtentM),
    [grid, verticalScale, uvExtentM],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  // ONLY the near ring casts sun shadows: the character-mode shadow frustum
  // ends at 300 m, so mid/far chunks drawn into the cascades were pure waste
  // — a large share of the post-load jerky-fps period (owner round 4).
  const casts = grid.lod === "1";
  return <mesh geometry={geometry} material={material} castShadow={casts} receiveShadow />;
}

function AdaptiveChunkMesh({ data, material, verticalScale, uvExtentM }: {
  data: AdaptiveTerrainData; material: THREE.Material; verticalScale: number; uvExtentM: number;
}) {
  const geometry = useMemo(() => buildAdaptiveTerrainGeometry(data, verticalScale, uvExtentM), [data, verticalScale, uvExtentM]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

export function ChunkTerrain({ store, manifest, focusRef, matSet, tintStrength, verticalScale, onLodMap, loadingFallback }: {
  store: ChunkStore;
  manifest: ChunksManifest;
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  matSet?: string;
  tintStrength?: number;
  /** Vertical scale applied at geometry; defaults to the canonical manifest
   * value (decision 0006 ×5). The character mode must keep this equal to its
   * collider scale. */
  verticalScale?: number;
  /** Diagnostic callback: chunk cell of the focus + the lod rendered there. */
  onLodMap?: (focusCell: [number, number]) => void;
  /** Keep the caller's existing macro/loading terrain during async validation. */
  loadingFallback?: React.ReactNode;
}) {
  const base = import.meta.env.BASE_URL;
  const adaptive = useMemo(() => new URLSearchParams(window.location.search).get("water") === "legacy"
    ? null : new AdaptiveTerrainLoader(`${base}province/`, { waterPath: waterDatasetPath() }), [base]);
  const [adaptiveAvailable, setAdaptiveAvailable] = useState<boolean | null>(adaptive ? null : false);
  const [adaptiveMetadata, setAdaptiveMetadata] = useState<AdaptiveTerrainManifest | null>(null);
  const bankChunks = useMemo(() => new Map(adaptiveMetadata?.chunks.map(chunk => [`${chunk.cx},${chunk.cy}`, chunk])), [adaptiveMetadata]);
  const bufferSize = useMemo(() => new THREE.Vector2(), []);
  useEffect(() => {
    let active = true;
    if (adaptive) adaptive.manifest().then(manifest => { if (active) { setAdaptiveAvailable(manifest !== null); setAdaptiveMetadata(manifest); } })
      .catch(error => { if (active) { console.error("Adaptive terrain unavailable:", error); setAdaptiveAvailable(false); } });
    return () => { active = false; adaptive?.dispose(); };
  }, [adaptive]);
  const { set, manifest: ground } = useGroundManifest(base, matSet);
  const images = useLoader(THREE.ImageLoader,
    ground.materials.map((m) => `${base}textures/ground/${set}/${m.file}`));
  const ctrl = useLoader(THREE.TextureLoader, `${base}province/refined/ground-control.png`);
  const tintTex = useLoader(THREE.TextureLoader, `${base}province/refined/ground-tint.png`);
  const [gradientState,setGradientState]=useState<{texture:THREE.DataTexture;owner:AdaptiveTerrainLoader|null;base:string}|null>(null);
  // Reject the previous dataset synchronously, before passive effect cleanup
  // can run after a route/base change. Its texture still gets disposed once.
  const gradient=gradientState?.owner===adaptive&&gradientState.base===base?gradientState.texture:null;
  const [gradientError,setGradientError]=useState<Error|null>(null);
  const gradTex=useMemo(()=>new THREE.DataTexture(new Uint8Array([128,128,0,255]),1,1),[]);
  useEffect(()=>()=>gradTex.dispose(),[gradTex]);
  useEffect(()=>{
    const controller=new AbortController();let owned:THREE.DataTexture|null=null;
    setGradientState(null);setGradientError(null);
    // Reuse the stable dependency-validation promise; this is not a new
    // Suspense dependency and cannot recreate the fly scene loading loop.
    (adaptive?adaptive.manifest():Promise.resolve(null))
      .then(metadata=>loadTerrainGradient(`${base}province/`,metadata?.gradientPatch??null,{signal:controller.signal,waterPath:waterDatasetPath()}))
      .then(texture=>{if(controller.signal.aborted){texture.dispose();return;}owned=texture;setGradientState({texture,owner:adaptive,base});})
      .catch(error=>{if(!controller.signal.aborted){console.error("Matched terrain gradient unavailable:",error);setGradientError(error);}});
    return()=>{controller.abort();owned?.dispose();};
  },[adaptive,base]);
  const { csm } = useContext(SkyContext);
  const material = useMemo(
    () => createGroundMaterial(images, ctrl, tintTex, gradTex, ground,
      verticalScale ?? manifest.verticalScaleAtGeometry, sharedAerialUniforms, csm),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images, ctrl, tintTex, gradTex, ground, csm],
  );
  const groundUniforms = material.userData.groundUniforms as GroundUniforms;
  const gradientInfo=useRef({ready:false,error:null as string|null});
  gradientInfo.current={ready:!!gradient,error:gradientError?.message??null};
  // Bind before the first committed canvas frame: passive effects can run
  // after r3f draws newly admitted chunks with the placeholder still bound.
  useLayoutEffect(()=>{groundUniforms.uGrad.value=gradient??gradTex;},[groundUniforms,gradient,gradTex]);
  useEffect(() => {
    groundUniforms.uVerticalScale.value =
      verticalScale ?? manifest.verticalScaleAtGeometry;
  }, [groundUniforms, verticalScale, manifest]);
  useEffect(() => {
    // Probe/diagnostics hook: exposes what the material patch actually did.
    const w = window as unknown as {
      __GROUND_DEBUG__?: () => unknown;
      __GROUND_MATERIAL__?: THREE.Material;
    };
    w.__GROUND_MATERIAL__ = material;
    w.__GROUND_DEBUG__ = () => ({
      patchInfo: material.userData.patchInfo ?? { compiled: false },
      gradientReady:gradientInfo.current.ready,gradientError:gradientInfo.current.error,
      hasCsm: !!csm,
      type: material.type,
    });
    return () => {
      (material.userData.tex as THREE.DataArrayTexture).dispose();
      material.dispose();
    };
  }, [material, csm]);
  useEffect(() => {
    groundUniforms.uTintStrength.value = tintStrength ?? 1.0;
  }, [groundUniforms, tintStrength]);

  // The control map spans the refined sample grid exactly.
  const uvExtentM = useMemo(() => {
    let max = 0;
    for (const c of manifest.chunks) {
      const lod = c.lods["1"];
      max = Math.max(max, c.originM[0] + (lod.shape[1] - 1) * lod.metresPerSample);
    }
    return max;
  }, [manifest]);

  const [focusCell, setFocusCell] = useState<[number, number]>([-99, -99]);
  const residency = useMemo(() => new TerrainViewResidency(manifest, verticalScale ?? manifest.verticalScaleAtGeometry), [manifest, verticalScale]);
  const [viewEntries, setViewEntries] = useState<readonly TerrainViewEntry[]>([]);
  const previousEntries = useRef<readonly TerrainViewEntry[]>(viewEntries);
  const [, setLoadedVersion] = useState(0);
  useFrame(({ camera, gl }) => {
    const f = focusRef.current;
    gl.getDrawingBufferSize(bufferSize);
    const entries = residency.update(camera, f.x, f.z, adaptiveMetadata
      ? { chunks: bankChunks, widthPx: bufferSize.x, heightPx: bufferSize.y } : undefined);
    if (entries !== previousEntries.current) { previousEntries.current = entries; setViewEntries(entries); }
    const cx = Math.max(0, Math.min(manifest.grid[0] - 1, Math.floor(f.x / manifest.chunkMetres)));
    const cy = Math.max(0, Math.min(manifest.grid[1] - 1, Math.floor(f.z / manifest.chunkMetres)));
    if (cx !== focusCell[0] || cy !== focusCell[1]) {
      setFocusCell([cx, cy]);
      onLodMap?.([cx, cy]);
    }
  });

  // Ensure desired LODs are loading. Decode arrivals COALESCE into one
  // re-render per 250 ms window: during initial load ~hundreds of chunks
  // land, and a full re-render (and mesh mounts) per arrival was a large
  // part of the minutes-long jerky period (owner round 4).
  const requested = useRef(new Map<string, symbol>());
  const displayed = useRef(new Map<string, { grid?: ChunkGrid; adaptive?: AdaptiveTerrainData }>());
  const adaptiveArrivals = useRef(new Map<string, AdaptiveTerrainData>());
  const adaptiveReady = useRef(new Map<string, AdaptiveTerrainData>());
  const wantedAdaptive = useRef(new Set<string>());
  const bumpTimer = useRef<number | null>(null);
  const bump = () => {
    if (bumpTimer.current !== null) return;
    bumpTimer.current = window.setTimeout(() => {
      bumpTimer.current = null;
      setLoadedVersion((v) => v + 1);
    }, 250);
  };
  useFrame(() => {
    // Bound geometry construction/uploads too: a warm HTTP cache can finish
    // dozens of binaries before the next coalesced React render.
    let count = 0;
    for (const [key, data] of adaptiveArrivals.current) {
      adaptiveArrivals.current.delete(key);
      if (!wantedAdaptive.current.has(key)) continue;
      adaptiveReady.current.set(key, data);
      if (++count === 2) break;
    }
    if (count) setLoadedVersion(version => version + 1);
  });
  useEffect(() => () => { if (bumpTimer.current !== null) window.clearTimeout(bumpTimer.current); }, []);
  useEffect(() => {
    if (adaptiveAvailable === null || focusCell[0] < 0) return;
    wantedAdaptive.current = new Set(viewEntries.map(({ chunk, lod }) => `${chunk.cx},${chunk.cy},${lod}`));
    const residentCells = new Set(viewEntries.map(({ chunk }) => `${chunk.cx},${chunk.cy}`));
    adaptive?.retainWanted(wantedAdaptive.current);
    for (const key of requested.current.keys()) if (!wantedAdaptive.current.has(key)) requested.current.delete(key);
    for (const key of displayed.current.keys()) if (!residentCells.has(key)) displayed.current.delete(key);
    for (const key of adaptiveReady.current.keys()) if (!wantedAdaptive.current.has(key)) adaptiveReady.current.delete(key);
    for (const key of adaptiveArrivals.current.keys()) if (!wantedAdaptive.current.has(key)) adaptiveArrivals.current.delete(key);
    for (const { chunk, lod } of viewEntries) {
      const key = `${chunk.cx},${chunk.cy},${lod}`;
      const current = displayed.current.get(`${chunk.cx},${chunk.cy}`);
      if (hasTerrainAuthority(current, lod, !!adaptiveAvailable) || adaptiveReady.current.has(key) || adaptiveArrivals.current.has(key)) continue;
      if (requested.current.has(key)) continue;
      const ticket = Symbol(key);
      requested.current.set(key, ticket);
      const load = adaptiveAvailable && adaptive && lod !== "1"
        ? adaptive.load(chunk.cx, chunk.cy, lod).then(data => {
          if (data && wantedAdaptive.current.has(key) && requested.current.get(key) === ticket) adaptiveArrivals.current.set(key, data);
        }) : store.load(chunk.cx, chunk.cy, lod);
      load.then(() => { if (!adaptiveAvailable || lod === "1") bump(); }).catch(error => console.error("Terrain chunk unavailable:", error))
        .finally(() => { if (requested.current.get(key) === ticket) requested.current.delete(key); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, manifest, focusCell, viewEntries, adaptive, adaptiveAvailable]);

  // Keep the existing macro/loading terrain until the one authoritative
  // gradient is ready. Never show corrected chunks with stale slope data.
  if(!gradient)return <>{loadingFallback??null}</>;
  const detailMeshes = viewEntries.map(({ chunk, lod: want }) => {
        const key = `${chunk.cx},${chunk.cy}`;
        const ready = adaptiveReady.current.get(`${key},${want}`);
        const exact = store.loaded(chunk.cx, chunk.cy, want);
        const selected = selectTerrainDisplay(displayed.current.get(key), want, !!adaptiveAvailable, ready, exact ?? undefined);
        if (selected) displayed.current.set(key, selected);
        // Arrivals for old views are cached by the bounded loader, not held
        // forever by the app. The displayed replacement retains its buffer.
        adaptiveReady.current.delete(`${key},${want}`);
        const current = displayed.current.get(key);
        const scale = verticalScale ?? manifest.verticalScaleAtGeometry;
        if (current?.adaptive) return <AdaptiveChunkMesh key={`${key},adaptive-${current.adaptive.lod}`}
          data={current.adaptive} material={material} verticalScale={scale} uvExtentM={uvExtentM} />;
        // Render the desired LOD if decoded; otherwise the best fallback we have.
        const grid = current?.grid ?? store.loaded(chunk.cx, chunk.cy, want)
          ?? store.loaded(chunk.cx, chunk.cy, "4")
          ?? store.loaded(chunk.cx, chunk.cy, "2")
          ?? store.loaded(chunk.cx, chunk.cy, "1");
        if (!grid) return null;
        return (
          <ChunkMesh
            key={`${chunk.cx},${chunk.cy},${grid.lod}`}
            grid={grid}
            material={material}
            verticalScale={scale}
            uvExtentM={uvExtentM}
          />
        );
      });
  // A decoded gradient does not mean a chunk has arrived. Keep the existing
  // loading terrain through that gap, but never draw it beneath detail meshes.
  if (!detailMeshes.some(mesh => mesh !== null)) return <>{loadingFallback??null}</>;
  return <group>{detailMeshes}</group>;
}
