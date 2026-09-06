import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { HeightfieldCollider, TrimeshCollider, RigidBody } from "@react-three/rapier";
import { HeightFieldFlags, TriMeshFlags } from "@dimforge/rapier3d-compat";
import type { ChunkGrid, ChunkStore, ChunksManifest } from "./chunkStore";
import { terrainColliderData } from "@elder-souls/game-core/terrain/colliderData";

/**
 * Rapier terrain colliders for the 3×3 chunks around the player, built
 * from the same LOD-1 grids the near render meshes use (chunks-manifest
 * collision contract: true-metre heights, ×5 as the collider's y scale,
 * 257-sample overlap edges so neighbours stitch without seams).
 * Audited diagonal-flip chunks alone use the identical native triangle
 * mesh; all other chunks retain efficient heightfields.
 *
 * Rapier heightfields are centred matrices in column-major order with row 0
 * at −z (north) and column 0 at −x (west) — verified empirically against
 * @dimforge/rapier3d-compat 0.
 */

const RING = 1; // 3×3

function TerrainChunkCollider({ grid, scale }: { grid: ChunkGrid; scale: number }) {
  const data = useMemo(() => terrainColliderData(grid, scale), [grid, scale]);
  // react-three-rapier forwards the entire args array to ColliderDesc; its
  // tuple typings omit Rapier's optional flags, so retain those at runtime.
  const collider = useMemo(() => data.kind === 'trimesh'
    ? <TrimeshCollider args={[data.vertices, data.indices, TriMeshFlags.FIX_INTERNAL_EDGES] as unknown as [Float32Array, Uint32Array]} />
    : <HeightfieldCollider args={([data.rows, data.columns, data.data, data.scale, HeightFieldFlags.FIX_INTERNAL_EDGES]) as unknown as [number, number, number[], { x: number; y: number; z: number }]} />, [data]);
  return <RigidBody type="fixed" colliders={false} position={data.position}>{collider}</RigidBody>;
}

export function ChunkColliders({ store, manifest, focusRef, verticalScale, onReady }: {
  store: ChunkStore;
  manifest: ChunksManifest;
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  /** Vertical scale for the collider y — must equal the render-mesh scale. */
  verticalScale?: number;
  /** Fires once the collider ring around the current focus is mounted. */
  onReady?: () => void;
}) {
  const [focusCell, setFocusCell] = useState<[number, number]>(() => [
    Math.max(0, Math.min(manifest.grid[0] - 1, Math.floor(focusRef.current.x / manifest.chunkMetres))),
    Math.max(0, Math.min(manifest.grid[1] - 1, Math.floor(focusRef.current.z / manifest.chunkMetres))),
  ]);
  const [grids, setGrids] = useState<ChunkGrid[]>([]);

  useFrame(() => {
    const f = focusRef.current;
    const cx = Math.max(0, Math.min(manifest.grid[0] - 1, Math.floor(f.x / manifest.chunkMetres)));
    const cy = Math.max(0, Math.min(manifest.grid[1] - 1, Math.floor(f.z / manifest.chunkMetres)));
    if (cx !== focusCell[0] || cy !== focusCell[1]) setFocusCell([cx, cy]);
  });

  useEffect(() => {
    let cancelled = false;
    const wanted: Promise<ChunkGrid>[] = [];
    for (let dy = -RING; dy <= RING; dy++) {
      for (let dx = -RING; dx <= RING; dx++) {
        const cx = focusCell[0] + dx;
        const cy = focusCell[1] + dy;
        if (store.chunkAt(cx, cy)) wanted.push(store.load(cx, cy, "1"));
      }
    }
    Promise.all(wanted).then((active) => {
      if (cancelled) return;
      setGrids(active);
      onReady?.();
    });
    // Prefetch one ring further out so the next boundary crossing is instant.
    for (let dy = -RING - 1; dy <= RING + 1; dy++) {
      for (let dx = -RING - 1; dx <= RING + 1; dx++) {
        const cx = focusCell[0] + dx;
        const cy = focusCell[1] + dy;
        if (store.chunkAt(cx, cy)) void store.load(cx, cy, "1");
      }
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, focusCell]);

  return (
    <>
      {grids.map((grid) => {
        const scale = verticalScale ?? manifest.verticalScaleAtGeometry;
        return (
          <TerrainChunkCollider
            key={`${grid.meta.cx},${grid.meta.cy},${scale}`}
            grid={grid} scale={scale}
          />
        );
      })}
    </>
  );
}
