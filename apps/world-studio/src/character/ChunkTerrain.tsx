import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { createGroundMaterial, useGroundManifest, type GroundUniforms } from "../groundMaterial";
import { SkyContext, sharedAerialUniforms } from "../sky/WorldSky";
import type { ChunkGrid, ChunkStore, ChunksManifest } from "./chunkStore";

/**
 * Chunked terrain renderer for the character mode: every province chunk as its
 * own mesh, LOD chosen by chunk distance from the player (LOD 1 ≈5.5 m near,
 * 2 mid, 4 far), textured by the shared splat material. Near geometry is the
 * SAME LOD-1 grid the Rapier colliders use, so feet and ground agree exactly.
 * Each mesh gets a short dropped skirt to hide hairline gaps at LOD borders.
 */

const NEAR_RING = 1;  // Chebyshev chunk distance rendered at LOD 1
const MID_RING = 3;   // … at LOD 2; beyond renders at LOD 4

function desiredLod(dx: number, dy: number): string {
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return d <= NEAR_RING ? "1" : d <= MID_RING ? "2" : "4";
}

function buildChunkGeometry(
  grid: ChunkGrid,
  verticalScale: number,
  uvExtentM: number,
): THREE.BufferGeometry {
  const { heights, nx, ny, metresPerSample } = grid;
  const [ox, oz] = grid.meta.originM;
  // One extra ring of vertices dropped below the edge: the skirt. LOD-border
  // height mismatches scale with the vertical scale (gaussian-smoothed LOD2/4
  // edges differ from LOD1 by up to ~2.5 m true), so the drop does too. The
  // shader lights skirts from the shared gradient texture, so an exposed
  // skirt takes the surface's own shading instead of reading as a dark wall.
  const skirtDrop = 2.5 * verticalScale;
  const gx = nx + 2;
  const gz = ny + 2;
  const pos = new Float32Array(gx * gz * 3);
  const uv = new Float32Array(gx * gz * 2);
  for (let r = 0; r < gz; r++) {
    for (let c = 0; c < gx; c++) {
      const i = r * gx + c;
      const sx = Math.max(0, Math.min(nx - 1, c - 1));
      const sz = Math.max(0, Math.min(ny - 1, r - 1));
      const onSkirt = c === 0 || r === 0 || c === gx - 1 || r === gz - 1;
      const x = ox + sx * metresPerSample;
      const z = oz + sz * metresPerSample;
      pos[i * 3] = x;
      pos[i * 3 + 1] = heights[sz * nx + sx] * verticalScale - (onSkirt ? skirtDrop : 0);
      pos[i * 3 + 2] = z;
      uv[i * 2] = x / uvExtentM;
      uv[i * 2 + 1] = 1 - z / uvExtentM;
    }
  }
  const idx = new Uint32Array((gx - 1) * (gz - 1) * 6);
  let j = 0;
  for (let r = 0; r < gz - 1; r++) {
    for (let c = 0; c < gx - 1; c++) {
      const a = r * gx + c;
      idx[j++] = a; idx[j++] = a + gx; idx[j++] = a + 1;
      idx[j++] = a + 1; idx[j++] = a + gx; idx[j++] = a + gx + 1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  // No vertex normals: the splat shader lights from the province-wide
  // gradient texture (seamless across chunk borders and LODs).
  return g;
}

function ChunkMesh({ grid, material, verticalScale, uvExtentM }: {
  grid: ChunkGrid;
  material: THREE.Material;
  verticalScale: number;
  uvExtentM: number;
}) {
  const geometry = useMemo(
    () => buildChunkGeometry(grid, verticalScale, uvExtentM),
    [grid, verticalScale, uvExtentM],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  // ONLY the near ring casts sun shadows: the character-mode shadow frustum
  // ends at 300 m, so mid/far chunks drawn into the cascades were pure waste
  // — a large share of the post-load jerky-fps period (owner round 4).
  const casts = grid.lod === "1";
  return <mesh geometry={geometry} material={material} castShadow={casts} receiveShadow />;
}

export function ChunkTerrain({ store, manifest, focusRef, matSet, tintStrength, verticalScale, onLodMap }: {
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

  return (
    <group>
      {manifest.chunks.map((chunk) => {
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
      })}
    </group>
  );
}
