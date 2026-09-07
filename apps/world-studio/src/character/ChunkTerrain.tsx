import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { createGroundMaterial, useGroundManifest, type GroundUniforms } from "../groundMaterial";
import { SkyContext, sharedAerialUniforms } from "../sky/WorldSky";
import type { ChunkGrid, ChunkStore, ChunksManifest } from "./chunkStore";
import { buildTerrainGridGeometry } from "@elder-souls/game-core/terrain/gridGeometry";

/**
 * Chunked terrain renderer: every province chunk is its own mesh, LOD chosen
 * by chunk distance from the player (LOD 1 ≈5.5 m near, 2 mid, 4 far),
 * textured by the shared splat material. Near geometry is the SAME LOD-1 grid
 * the Rapier colliders use, so feet and ground agree exactly. Each mesh gets a
 * short dropped skirt to hide hairline gaps at LOD borders.
 *
 * All chunks stay resident: LOD depends only on the focus chunk cell, never on
 * the camera direction, so turning around cannot unmount and rebuild geometry
 * (decision 0046 retired the per-frame frustum residency and its rebuild loop).
 */

const NEAR_RING = 1;  // Chebyshev chunk distance rendered at LOD 1
const MID_RING = 3;   // … at LOD 2; beyond renders at LOD 4

function desiredLod(dx: number, dy: number): string {
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return d <= NEAR_RING ? "1" : d <= MID_RING ? "2" : "4";
}

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
  /** Keep the caller's macro/loading terrain visible until detail chunks exist. */
  loadingFallback?: React.ReactNode;
}) {
  const base = import.meta.env.BASE_URL;
  const { set, manifest: ground } = useGroundManifest(base, matSet);
  const images = useLoader(THREE.ImageLoader,
    ground.materials.map((m) => `${base}textures/ground/${set}/${m.file}`));
  const ctrl = useLoader(THREE.TextureLoader, `${base}province/refined/ground-control.png`);
  const tintTex = useLoader(THREE.TextureLoader, `${base}province/refined/ground-tint.png`);
  const gradTex = useLoader(THREE.TextureLoader, `${base}province/chunks/normal-grad.png`);
  const { csm } = useContext(SkyContext);
  const material = useMemo(
    () => createGroundMaterial(images, ctrl, tintTex, gradTex, ground,
      verticalScale ?? manifest.verticalScaleAtGeometry, sharedAerialUniforms, csm),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images, ctrl, tintTex, gradTex, ground, csm],
  );
  const groundUniforms = material.userData.groundUniforms as GroundUniforms;
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
    for (const chunk of manifest.chunks) {
      const lod = desiredLod(chunk.cx - focusCell[0], chunk.cy - focusCell[1]);
      const key = `${chunk.cx},${chunk.cy},${lod}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      store.load(chunk.cx, chunk.cy, lod)
        .then(bump)
        .catch(() => requested.current.delete(key));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, manifest, focusCell]);

  const meshes = manifest.chunks.map((chunk) => {
    const want = desiredLod(chunk.cx - focusCell[0], chunk.cy - focusCell[1]);
    // Render the desired LOD if decoded; otherwise the best fallback we have.
    const grid = store.loaded(chunk.cx, chunk.cy, want)
      ?? store.loaded(chunk.cx, chunk.cy, "4")
      ?? store.loaded(chunk.cx, chunk.cy, "2")
      ?? store.loaded(chunk.cx, chunk.cy, "1");
    if (!grid) return null;
    const scale = verticalScale ?? manifest.verticalScaleAtGeometry;
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
  // Keep the caller's macro terrain visible until the first chunk decodes,
  // but never draw it beneath detail meshes.
  if (!meshes.some((mesh) => mesh !== null)) return <>{loadingFallback ?? null}</>;
  return <group>{meshes}</group>;
}
