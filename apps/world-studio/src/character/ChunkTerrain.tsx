import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { createGroundMaterial, useGroundManifest, type GroundUniforms } from "../groundMaterial";
import { SkyContext, sharedAerialUniforms } from "../sky/WorldSky";
import { lodForDistance, type ChunkGrid, type ChunkMeta, type ChunkStore, type ChunksManifest } from "./chunkStore";
import { useHiddenLayers } from "../ladder";
import { buildTerrainGridGeometry } from "@elder-souls/game-core/terrain/gridGeometry";
import { useFrameWork } from "@elder-souls/game-core/scheduling/frameWorkContext";
import type { FrameJobHandle } from "@elder-souls/game-core/scheduling/frameWork";

/**
 * Chunked terrain renderer: every province chunk is its own mesh, LOD chosen
 * by chunk distance from the player (LOD 1 = 1.83 m near, 2 mid, 4 far),
 * textured by the shared splat material. Near geometry is the SAME LOD-1 grid
 * the Rapier colliders use, so feet and ground agree exactly. Each mesh gets a
 * short dropped skirt to hide hairline gaps at LOD borders.
 *
 * All chunks stay resident: LOD depends only on the focus chunk cell, never on
 * the camera direction, so turning around cannot unmount and rebuild geometry
 * (decision 0046 retired the per-frame frustum residency and its rebuild loop).
 */

const desiredLod = lodForDistance;   // rings: 1 near (LOD 1), 3 mid (LOD 2), beyond LOD 4

function ChunkMesh({ grid, geometry, material }: {
  grid: ChunkGrid;
  /** Built under the frame budget by `ChunkTerrain` and cached there, which
   * also owns its disposal: a chunk arriving used to build its grid geometry
   * inside the React commit that mounted it (owner 2026-09-20). */
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  // ONLY the near ring casts sun shadows: the character-mode shadow frustum
  // ends at 300 m, so mid/far chunks drawn into the cascades were pure waste
  // — a large share of the post-load jerky-fps period (owner round 4).
  const casts = grid.lod === "1";
  return <mesh geometry={geometry} material={material} castShadow={casts} receiveShadow />;
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
  useEffect(() => () => {
    meshJob.current?.cancel();
    for (const geometry of geometries.current.values()) geometry.dispose();
    geometries.current.clear();
  }, []);

  const [focusCell, setFocusCell] = useState<[number, number]>([-99, -99]);
  const [, setLoadedVersion] = useState(0);
  useFrame(() => {
    const f = focusRef.current;
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
    for (const chunk of [...manifest.chunks, ...(apron?.chunks ?? [])]) {
      const lod = desiredLod(chunk.cx - focusCell[0], chunk.cy - focusCell[1]);
      const key = `${chunk.cx},${chunk.cy},${lod}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      store.load(chunk.cx, chunk.cy, lod)
        .then(bump)
        .catch((e) => { console.warn(`chunk ${key} failed: ${String(e).slice(0, 200)}`); requested.current.delete(key); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, manifest, focusCell, apron]);

  // Province chunks and the apron's ring 0 go through one loop: same LOD rule,
  // same skirt, same store — only the material and UV frame differ (16d).
  const drawn: { chunk: ChunkMeta; apron: boolean }[] = [
    ...manifest.chunks.map((chunk) => ({ chunk, apron: false })),
    ...(apron?.chunks ?? []).map((chunk) => ({ chunk, apron: true })),
  ];
  const scale = verticalScale ?? manifest.verticalScaleAtGeometry;
  const resolved = drawn.map(({ chunk, apron: isApron }) => {
    const want = desiredLod(chunk.cx - focusCell[0], chunk.cy - focusCell[1]);
    // Render the desired LOD if decoded; otherwise the best fallback we have.
    const grid = store.loaded(chunk.cx, chunk.cy, want)
      ?? store.loaded(chunk.cx, chunk.cy, "4")
      ?? store.loaded(chunk.cx, chunk.cy, "2")
      ?? store.loaded(chunk.cx, chunk.cy, "1");
    return { chunk, isApron, grid };
  });
  const wantedKeys = new Set<string>();
  const missing: { key: string; grid: ChunkGrid; isApron: boolean; distance: number }[] = [];
  const focus = focusRef.current;
  for (const { chunk, isApron, grid } of resolved) {
    if (!grid) continue;
    const key = `${chunk.cx},${chunk.cy},${grid.lod}`;
    wantedKeys.add(key);
    if (geometries.current.has(key)) continue;
    const centreX = (chunk.cx + 0.5) * manifest.chunkMetres;
    const centreZ = (chunk.cy + 0.5) * manifest.chunkMetres;
    missing.push({ key, grid, isApron,
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
      for (const { key, grid, isApron } of missing) {
        if (geometries.current.has(key)) continue;
        geometries.current.set(key, buildTerrainGridGeometry(
          grid, scale,
          isApron && apron ? apron.uvExtentM : uvExtentM,
          (isApron && apron ? apron.uvOriginM : undefined) ?? [0, 0]));
        yield;
      }
      meshJob.current = null;
      setGeometryVersion((v) => v + 1);
    };
    meshJob.current = queue.add(build(), { priority: 20, label: "terrain-mesh" });
  }
  const meshes = resolved.map(({ chunk, isApron, grid }) => {
    if (!grid) return null;
    const geometry = geometries.current.get(`${chunk.cx},${chunk.cy},${grid.lod}`);
    if (!geometry) return null;
    return (
      <ChunkMesh
        key={`${chunk.cx},${chunk.cy},${grid.lod}`}
        grid={grid}
        geometry={geometry}
        material={isApron && apron ? apron.material : material}
      />
    );
  });
  // Keep the caller's macro terrain visible until the first PROVINCE chunk
  // decodes (an apron tile is not the ground the player stands on), but never
  // draw it beneath detail meshes.
  if (!meshes.slice(0, manifest.chunks.length).some((mesh) => mesh !== null)) return <>{loadingFallback ?? null}</>;
  return <group>{meshes}</group>;
}
