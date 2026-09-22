import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { createGroundMaterial, useGroundManifest, type GroundUniforms } from "../groundMaterial";
import { SkyContext, sharedAerialUniforms } from "../sky/WorldSky";
import {
  LOD_REEVALUATE_M, SUB_TILE_DIVISIONS, SUB_TILE_LODS, drawsAsSubTiles, lodForDistance, lodForSubTile,
  type ChunkGrid, type ChunkMeta, type ChunkStore, type ChunksManifest,
} from "./chunkStore";
import { useHiddenLayers } from "../ladder";
import { buildTerrainGridGeometry, subGrid } from "@elder-souls/game-core/terrain/gridGeometry";
import { useFrameWork } from "@elder-souls/game-core/scheduling/frameWorkContext";
import type { FrameJobHandle } from "@elder-souls/game-core/scheduling/frameWork";

/**
 * Chunked terrain renderer: every province chunk is its own mesh, LOD chosen
 * by the distance from the camera to each chunk's nearest edge (the ladder
 * in `chunkStore.LOD_BANDS`: LOD 1 under 150 m, 2 under 400 m, 4 under
 * 1 400 m, the derived LOD 8 beyond). Inside 400 m a chunk is drawn not whole
 * but as a 4×4 grid of 117 m sub-tiles, each taking LOD 1 or 2 from its own
 * edge distance, so a corner of a 468 m chunk inside the fine band no longer
 * costs the whole chunk's 131 k triangles.
 * The ground is textured by the shared splat material. Near geometry is the SAME LOD-1 grid
 * the Rapier colliders use, so feet and ground agree exactly. Each mesh gets a
 * short dropped skirt to hide hairline gaps at LOD borders.
 *
 * All chunks stay resident: LOD depends only on camera POSITION, never on the
 * camera direction, so turning around cannot unmount and rebuild geometry
 * (decision 0046 retired the per-frame frustum residency and its rebuild loop).
 */

function ChunkMesh({ grid, geometry, material }: {
  grid: ChunkGrid;
  /** Built under the frame budget by `ChunkTerrain` and cached there, which
   * also owns its disposal: a chunk arriving used to build its grid geometry
   * inside the React commit that mounted it (owner 2026-09-20). */
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  // LOD 1 and 2 cast sun shadows: the character-mode shadow frustum ends at
  // 300 m and CSM culls casters outside the cascades, so this is the terrain
  // within shadow range now that LOD 1 reaches only ~150 m. LOD 4 and the
  // derived LOD 8 never cast (owner round 4: mid/far casters were pure waste).
  const casts = grid.lod === "1" || grid.lod === "2";
  // `perfTag` names this mesh's bucket in the DEV triangle attribution
  // (HUD line 3, apps/world-studio/src/character/triangleBuckets.ts).
  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow={casts}
      receiveShadow
      userData={{ perfTag: "terrain" }}
    />
  );
}

export function ChunkTerrain({ store, manifest, focusRef, matSet, tintStrength, verticalScale, onLodMap, loadingFallback, apron, onGroundMaterial }: {
  store: ChunkStore;
  manifest: ChunksManifest;
  /** The border apron's ring-0 chunks (16d): ordinary chunk tiles registered
   * on the same store, drawn in this loop with the same LOD rule and skirt but
   * the apron's material and its own UV frame. */
  apron?: { chunks: ChunkMeta[]; material: THREE.Material; uvOriginM: [number, number]; uvExtentM: number };

  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  matSet?: string;
  tintStrength?: number;
  /** Vertical scale applied at geometry; defaults to the canonical manifest
   * value (decision 0006 ×5). The character mode must keep this equal to its
   * collider scale. */
  verticalScale?: number;
  /** Diagnostic callback: chunk cell of the focus + the lod rendered there. */
  onLodMap?: (focusCell: [number, number]) => void;
  /** Keep the caller's macro/loading terrain visible until detail chunks exist. */
  loadingFallback?: React.ReactNode;
  /** The built ground material, once it exists: the apron's materials borrow
   * its albedo array rather than allocating a second one (16d). */
  onGroundMaterial?: (material: THREE.MeshStandardMaterial) => void;
}) {
  const base = import.meta.env.BASE_URL;
  const { set, manifest: ground } = useGroundManifest(base, matSet);
  const images = useLoader(THREE.ImageLoader,
    ground.materials.map((m) => `${base}textures/ground/${set}/${m.file}`));
  // The two cliff normal maps (rock, dirt) — the side-projection relief.
  // An older set without `normalFile` rows simply ships no perturbation.
  const cliffNrmFiles = ["cliff_rock", "cliff_dirt"]
    .map((name) => ground.materials.find((m) => m.name === name)?.normalFile)
    .filter((f): f is string => !!f);
  const cliffNormals = useLoader(THREE.ImageLoader,
    cliffNrmFiles.map((f) => `${base}textures/ground/${set}/${f}`));
  const ctrl = useLoader(THREE.TextureLoader, `${base}province/refined/ground-control.png`);
  const tintTex = useLoader(THREE.TextureLoader, `${base}province/refined/ground-tint.png`);
  const gradTex = useLoader(THREE.TextureLoader, `${base}province/chunks/normal-grad.png`);
  const { csm } = useContext(SkyContext);
  const hiddenLayers = useHiddenLayers(base);
  const shoreWetness = !hiddenLayers.has("water");
  const material = useMemo(
    () => createGroundMaterial(images, cliffNormals, ctrl, tintTex, gradTex, ground,
      verticalScale ?? manifest.verticalScaleAtGeometry, sharedAerialUniforms, csm, { shoreWetness }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images, cliffNormals, ctrl, tintTex, gradTex, ground, csm, shoreWetness],
  );
  const groundUniforms = material.userData.groundUniforms as GroundUniforms;
  useEffect(() => {
    groundUniforms.uVerticalScale.value =
      verticalScale ?? manifest.verticalScaleAtGeometry;
  }, [groundUniforms, verticalScale, manifest]);
  useEffect(() => { onGroundMaterial?.(material); }, [material, onGroundMaterial]);
  useEffect(() => {
    // Probe/diagnostics hook: exposes what the material patch actually did.
    const w = window as unknown as {
      __GROUND_DEBUG__?: () => unknown;
      __GROUND_MATERIAL__?: THREE.Material;
    };
    w.__GROUND_MATERIAL__ = material;
    w.__GROUND_DEBUG__ = () => ({
      patchInfo: material.userData.patchInfo ?? { compiled: false },
      hasCsm: !!csm,
      type: material.type,
    });
    return () => {
      // Only the owner disposes the albedo array: the apron's materials borrow
      // this one (16d, `sharedArrayTexture`).
      if (material.userData.ownsTex !== false) (material.userData.tex as THREE.DataArrayTexture).dispose();
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

  // Chunk geometry cache, keyed `cx,cy,lod`, filled ONE PER STEP on the
  // shared frame-work queue (priority 20: after colliders, before the visual
  // rebuilds). A chunk whose geometry is not cached yet draws nothing this
  // pass, exactly as an undecoded chunk does.
  const geometries = useRef(new Map<string, THREE.BufferGeometry>());
  const queue = useFrameWork();
  const meshJob = useRef<FrameJobHandle | null>(null);
  const [, setGeometryVersion] = useState(0);
  // The mesh job is created DURING RENDER (below), so its completion can reach
  // `setGeometryVersion` before this component has mounted or after it has
  // unmounted — React's "state update on a component that hasn't mounted yet"
  // warning. The bump is held until the mount effect runs, and dropped once
  // the component is gone.
  const mounted = useRef(false);
  const bumpPending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (bumpPending.current) {
      bumpPending.current = false;
      setGeometryVersion((v) => v + 1);
    }
    return () => {
      mounted.current = false;
      meshJob.current?.cancel();
      for (const geometry of geometries.current.values()) geometry.dispose();
      geometries.current.clear();
    };
  }, []);

  const [focusCell, setFocusCell] = useState<[number, number]>([-99, -99]);
  const [, setLoadedVersion] = useState(0);
  // LOD each resident chunk is currently assigned, keyed `cx,cy`. The ladder
  // is re-evaluated in place (no allocation) only once the camera has moved
  // `LOD_REEVALUATE_M`, and `lodVersion` bumps only when an assignment moved.
  const lodByCell = useRef(new Map<string, string>());
  // LOD each sub-tile of a chunk inside the fine bands is drawn at, keyed
  // `cx,cy,ix,iz` — the same ladder and hysteresis, on the sub-tile's own
  // rectangle (the frame is a triangle budget, decision 0084).
  const lodBySubTile = useRef(new Map<string, string>());
  const lastEval = useRef<{ x: number; z: number } | null>(null);
  const [lodVersion, setLodVersion] = useState(0);
  const allChunks = useMemo(
    () => [...manifest.chunks, ...(apron?.chunks ?? [])], [manifest, apron]);
  useFrame(() => {
    const f = focusRef.current;
    const cx = Math.max(0, Math.min(manifest.grid[0] - 1, Math.floor(f.x / manifest.chunkMetres)));
    const cy = Math.max(0, Math.min(manifest.grid[1] - 1, Math.floor(f.z / manifest.chunkMetres)));
    if (cx !== focusCell[0] || cy !== focusCell[1]) {
      setFocusCell([cx, cy]);
      onLodMap?.([cx, cy]);
    }
    const last = lastEval.current;
    if (last && Math.hypot(f.x - last.x, f.z - last.z) < LOD_REEVALUATE_M) return;
    lastEval.current = { x: f.x, z: f.z };
    let changed = false;
    for (const chunk of allChunks) {
      const key = `${chunk.cx},${chunk.cy}`;
      const current = lodByCell.current.get(key);
      const lod = lodForDistance(f.x, f.z, chunk.cx, chunk.cy, manifest.chunkMetres, current);
      if (lod !== current) { lodByCell.current.set(key, lod); changed = true; }
      if (!drawsAsSubTiles(lod)) continue;
      for (let iz = 0; iz < SUB_TILE_DIVISIONS; iz++) for (let ix = 0; ix < SUB_TILE_DIVISIONS; ix++) {
        const subKey = `${key},${ix},${iz}`;
        const now = lodBySubTile.current.get(subKey);
        const sub = lodForSubTile(f.x, f.z, chunk.cx, chunk.cy, ix, iz, manifest.chunkMetres, now);
        if (sub !== now) { lodBySubTile.current.set(subKey, sub); changed = true; }
      }
    }
    if (changed) setLodVersion((v) => v + 1);
  });
  /** The ladder's answer for a chunk; falls back to a fresh evaluation for a
   * chunk registered since the last frame (the apron's ring 0). */
  const desiredLod = (chunk: ChunkMeta): string =>
    lodByCell.current.get(`${chunk.cx},${chunk.cy}`)
    ?? lodForDistance(focusRef.current.x, focusRef.current.z, chunk.cx, chunk.cy, manifest.chunkMetres);
  /** The ladder's answer for one sub-tile of a chunk inside the fine bands. */
  const desiredSubLod = (chunk: ChunkMeta, ix: number, iz: number): string =>
    lodBySubTile.current.get(`${chunk.cx},${chunk.cy},${ix},${iz}`)
    ?? lodForSubTile(focusRef.current.x, focusRef.current.z, chunk.cx, chunk.cy, ix, iz, manifest.chunkMetres);

  // Ensure desired LODs are loading. Decode arrivals COALESCE into one
  // re-render per 250 ms window: during initial load ~hundreds of chunks
  // land, and a full re-render (and mesh mounts) per arrival was a large
  // part of the minutes-long jerky period (owner round 4).
  const requested = useRef(new Set<string>());
  const bumpTimer = useRef<number | null>(null);
  const bump = () => {
    if (bumpTimer.current !== null) return;
    bumpTimer.current = window.setTimeout(() => {
      bumpTimer.current = null;
      setLoadedVersion((v) => v + 1);
    }, 250);
  };
  useEffect(() => () => { if (bumpTimer.current !== null) window.clearTimeout(bumpTimer.current); }, []);
  useEffect(() => {
    for (const chunk of allChunks) {
      const lod = desiredLod(chunk);
      // A chunk inside the fine bands is sliced into sub-tiles that may take
      // either fine LOD, so both rasters are needed.
      for (const want of drawsAsSubTiles(lod) ? SUB_TILE_LODS : [lod]) {
        const key = `${chunk.cx},${chunk.cy},${want}`;
        if (requested.current.has(key)) continue;
        requested.current.add(key);
        store.load(chunk.cx, chunk.cy, want)
          .then(bump)
          .catch((e) => { console.warn(`chunk ${key} failed: ${String(e).slice(0, 200)}`); requested.current.delete(key); });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, allChunks, lodVersion]);

  // Province chunks and the apron's ring 0 go through one loop: same LOD rule,
  // same skirt, same store — only the material and UV frame differ (16d).
  const drawn: { chunk: ChunkMeta; apron: boolean }[] = [
    ...manifest.chunks.map((chunk) => ({ chunk, apron: false })),
    ...(apron?.chunks ?? []).map((chunk) => ({ chunk, apron: true })),
  ];
  const scale = verticalScale ?? manifest.verticalScaleAtGeometry;
  /** Render the desired LOD if decoded; otherwise the best fallback we have. */
  const resolve = (chunk: ChunkMeta, want: string): ChunkGrid | undefined =>
    store.loaded(chunk.cx, chunk.cy, want)
    ?? store.loaded(chunk.cx, chunk.cy, "8")
    ?? store.loaded(chunk.cx, chunk.cy, "4")
    ?? store.loaded(chunk.cx, chunk.cy, "2")
    ?? store.loaded(chunk.cx, chunk.cy, "1");
  // One draw unit per mesh: a whole chunk beyond the fine bands, or one of the
  // 16 sub-tiles of a chunk inside them.
  const resolved: { chunk: ChunkMeta; isApron: boolean; grid?: ChunkGrid; sub?: [number, number]; key: string }[] = [];
  for (const { chunk, apron: isApron } of drawn) {
    const want = desiredLod(chunk);
    if (!drawsAsSubTiles(want)) {
      const grid = resolve(chunk, want);
      resolved.push({ chunk, isApron, grid, key: `${chunk.cx},${chunk.cy},${grid?.lod}` });
      continue;
    }
    for (let iz = 0; iz < SUB_TILE_DIVISIONS; iz++) for (let ix = 0; ix < SUB_TILE_DIVISIONS; ix++) {
      const grid = resolve(chunk, desiredSubLod(chunk, ix, iz));
      resolved.push({ chunk, isApron, grid, sub: [ix, iz],
        key: `${chunk.cx},${chunk.cy},${grid?.lod},${ix},${iz}` });
    }
  }
  const wantedKeys = new Set<string>();
  const missing: { key: string; grid: ChunkGrid; isApron: boolean; sub?: [number, number]; distance: number }[] = [];
  const focus = focusRef.current;
  for (const { chunk, isApron, grid, sub, key } of resolved) {
    if (!grid) continue;
    wantedKeys.add(key);
    if (geometries.current.has(key)) continue;
    const side = manifest.chunkMetres / (sub ? SUB_TILE_DIVISIONS : 1);
    const centreX = chunk.cx * manifest.chunkMetres + ((sub?.[0] ?? 0) + 0.5) * side;
    const centreZ = chunk.cy * manifest.chunkMetres + ((sub?.[1] ?? 0) + 0.5) * side;
    missing.push({ key, grid, isApron, sub,
      distance: Math.hypot(centreX - focus.x, centreZ - focus.z) });
  }
  // Evict what is no longer drawn (this replaces ChunkMesh's own dispose).
  for (const [key, geometry] of geometries.current) {
    if (wantedKeys.has(key)) continue;
    geometry.dispose();
    geometries.current.delete(key);
  }
  if (missing.length) {
    missing.sort((a, b) => a.distance - b.distance);
    meshJob.current?.cancel();
    const build = function* (): Generator<void> {
      for (const { key, grid, isApron, sub } of missing) {
        if (geometries.current.has(key)) continue;
        // The sub-tile keeps the CHUNK's UV frame (the builder maps UVs from
        // world metres), so the splat/control textures map exactly as before.
        geometries.current.set(key, buildTerrainGridGeometry(
          sub ? subGrid(grid, sub[0], sub[1], SUB_TILE_DIVISIONS) : grid, scale,
          isApron && apron ? apron.uvExtentM : uvExtentM,
          (isApron && apron ? apron.uvOriginM : undefined) ?? [0, 0]));
        yield;
      }
      meshJob.current = null;
      if (mounted.current) setGeometryVersion((v) => v + 1);
      else bumpPending.current = true;
    };
    meshJob.current = queue.add(build(), { priority: 20, label: "terrain-mesh" });
  }
  let provinceDrawn = false;
  const meshes = resolved.map(({ isApron, grid, key }) => {
    if (!grid) return null;
    const geometry = geometries.current.get(key);
    if (!geometry) return null;
    if (!isApron) provinceDrawn = true;
    return (
      <ChunkMesh
        key={key}
        grid={grid}
        geometry={geometry}
        material={isApron && apron ? apron.material : material}
      />
    );
  });
  // Keep the caller's macro terrain visible until the first PROVINCE chunk
  // decodes (an apron tile is not the ground the player stands on), but never
  // draw it beneath detail meshes.
  if (!provinceDrawn) return <>{loadingFallback ?? null}</>;
  return <group>{meshes}</group>;
}
