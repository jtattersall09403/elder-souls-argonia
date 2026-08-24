import { useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { HeightfieldCollider, RigidBody } from "@react-three/rapier";
import { HeightFieldFlags } from "@dimforge/rapier3d-compat";
import type { ChunkGrid, ChunkStore, ChunksManifest } from "./chunkStore";

/**
 * Rapier heightfield colliders for the 3×3 chunks around the player, built
 * from the same LOD-1 grids the near render meshes use (chunks-manifest
 * collision contract: true-metre heights, ×5 as the collider's y scale,
 * 257-sample overlap edges so neighbours stitch without seams).
 *
 * Rapier heightfields are centred matrices in column-major order with row 0
 * at −z (north) and column 0 at −x (west) — verified empirically against
 * @dimforge/rapier3d-compat 0.
 */

const RING = 1; // 3×3

function colliderFor(grid: ChunkGrid, verticalScale: number) {
  const { heights, nx, ny, metresPerSample } = grid;
  const data = new Float32Array(nx * ny);
  // Our row-major [z][x] grid → rapier's column-major matrix: data[x*ny + z].
  for (let x = 0; x < nx; x++) {
    for (let z = 0; z < ny; z++) data[x * ny + z] = heights[z * nx + x];
  }
  const extentX = (nx - 1) * metresPerSample;
  const extentZ = (ny - 1) * metresPerSample;
  return {
    // FIX_INTERNAL_EDGES: without it the capsule catches phantom bumps on the
    // heightfield's internal triangle edges — felt as stumbles while running.
    args: [
      ny - 1, nx - 1, data,
      { x: extentX, y: verticalScale, z: extentZ },
      HeightFieldFlags.FIX_INTERNAL_EDGES,
    ] as const,
    position: [
      grid.meta.originM[0] + extentX / 2,
      0,
      grid.meta.originM[1] + extentZ / 2,
    ] as [number, number, number],
  };
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
        const { args, position } = colliderFor(grid, scale);
        return (
          <RigidBody
            key={`${grid.meta.cx},${grid.meta.cy},${scale}`}
            type="fixed"
            colliders={false}
            position={position}
          >
            <HeightfieldCollider args={args as unknown as [number, number, number[], { x: number; y: number; z: number }]} />
          </RigidBody>
        );
      })}
    </>
  );
}
