import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { decodeHeightPng } from "./chunkStore";
import { buildTerrainGridGeometry, terrainGridIndices } from "./gridGeometry";
import {
  apronSkipQuad,
  apronTileGrid,
  apronTileLodMeta,
  paintFrameExtent,
  type ApronManifest,
  type ApronTile,
  type ApronPaintSet,
} from "./apronManifest";

/** Sectors per side each ring's index is split into for frustum culling. */
export const APRON_SECTORS = 8;

/**
 * The land beyond the border (16d): the apron's coarse tiles, one mesh each.
 *
 * Ring 0 is not here — it is ordinary chunk geometry, registered on the chunk
 * store and drawn by the chunk renderer with the same LOD rule, so the border
 * is an ordinary chunk seam. This component draws only the single coarse tiles
 * (ring 1 at 29 m, ring 2 at 117 m out to the map's edge), each with the
 * interior the finer rings cover left out of the index.
 *
 * These meshes are scenery, never ground: no colliders and no shadows either
 * way (they are beyond the shadow frustum and beyond the walls). Each ring IS
 * frustum-culled, in `APRON_SECTORS`² pieces: one mesh per ring spanned tens of
 * kilometres, so its bounding volume was always on screen and the ring's
 * ~0.5 M triangles were drawn whatever the camera faced. The sectors share the
 * ring's vertex attributes and differ only in their index and their own
 * bounding volume, so splitting costs no extra memory (decision 0084).
 */
export function BorderApron({ manifest, baseUrl, materials, verticalScale }: {
  manifest: ApronManifest;
  baseUrl: string;
  materials: Record<ApronPaintSet, THREE.Material>;
  verticalScale: number;
}) {
  const [grids, setGrids] = useState<Record<string, Float32Array>>({});
  useEffect(() => {
    let alive = true;
    for (const tile of manifest.tiles) {
      fetch(`${baseUrl}province/apron/${tile.file}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return decodeHeightPng(await response.blob(), apronTileLodMeta(tile));
        })
        .then((heights) => { if (alive) setGrids((prev) => ({ ...prev, [tile.id]: heights })); })
        .catch((e) => console.warn(`apron tile ${tile.id} failed: ${String(e).slice(0, 200)}`));
    }
    return () => { alive = false; };
  }, [manifest, baseUrl]);

  return (
    <group>
      {manifest.tiles.map((tile) => {
        const heights = grids[tile.id];
        if (!heights) return null;
        const frame = manifest.paint[tile.paint];
        return (
          <ApronTileMesh
            key={tile.id}
            tile={tile}
            heights={heights}
            verticalScale={verticalScale}
            uvOriginM={frame.originM}
            uvExtentM={paintFrameExtent(frame)}
            material={materials[tile.paint]}
          />
        );
      })}
    </group>
  );
}

/** One coarse apron tile's geometry: the shared grid mesh, re-indexed so the
 * quads the finer rings cover are not drawn. */
export function buildApronTileGeometry(
  tile: ApronTile,
  heights: Float32Array,
  verticalScale: number,
  uvOriginM: [number, number],
  uvExtentM: number | [number, number],
): THREE.BufferGeometry {
  const geometry = buildTerrainGridGeometry(apronTileGrid(tile, heights), verticalScale, uvExtentM, uvOriginM);
  const skip = apronSkipQuad(tile);
  if (skip) {
    const [ny, nx] = tile.shape;
    geometry.setIndex(new THREE.BufferAttribute(terrainGridIndices(nx + 2, ny + 2, skip), 1));
  }
  return geometry;
}

/**
 * The same tile split into `APRON_SECTORS`² frustum-cullable sectors: one
 * geometry per sector, sharing the tile's position and uv `BufferAttribute`
 * objects and holding only its own index and bounding volume. Sectors whose
 * quads are all masked away yield no geometry at all.
 *
 * The sectors are disposed together (they share buffers, so one must not go
 * while another still draws).
 */
export function buildApronTileSectors(
  tile: ApronTile,
  heights: Float32Array,
  verticalScale: number,
  uvOriginM: [number, number],
  uvExtentM: number | [number, number],
): THREE.BufferGeometry[] {
  const base = buildTerrainGridGeometry(apronTileGrid(tile, heights), verticalScale, uvExtentM, uvOriginM);
  const position = base.getAttribute("position") as THREE.BufferAttribute;
  const uv = base.getAttribute("uv") as THREE.BufferAttribute;
  const [ny, nx] = tile.shape;
  const gx = nx + 2, gz = ny + 2;
  const skip = apronSkipQuad(tile);
  const out: THREE.BufferGeometry[] = [];
  for (let sz = 0; sz < APRON_SECTORS; sz++) for (let sx = 0; sx < APRON_SECTORS; sx++) {
    const x0 = Math.round((sx * (gx - 1)) / APRON_SECTORS), x1 = Math.round(((sx + 1) * (gx - 1)) / APRON_SECTORS);
    const z0 = Math.round((sz * (gz - 1)) / APRON_SECTORS), z1 = Math.round(((sz + 1) * (gz - 1)) / APRON_SECTORS);
    const indices = new Uint32Array((x1 - x0) * (z1 - z0) * 6);
    let write = 0;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      if (skip?.(x, z)) continue;
      const a = z * gx + x, b = a + 1, c = a + gx, d = c + 1;
      indices[write++] = a; indices[write++] = c; indices[write++] = b;
      indices[write++] = b; indices[write++] = c; indices[write++] = d;
    }
    if (write === 0) continue;
    const sector = new THREE.BufferGeometry();
    sector.setAttribute("position", position);
    sector.setAttribute("uv", uv);
    sector.setIndex(new THREE.BufferAttribute(indices.slice(0, write), 1));
    // The bounding volume is this sector's vertices only: computeBoundingSphere
    // would measure the whole shared position buffer and never cull.
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = z * gx + x;
      box.expandByPoint(v.fromBufferAttribute(position, i));
    }
    sector.boundingBox = box;
    sector.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    out.push(sector);
  }
  return out;
}

function ApronTileMesh({ tile, heights, verticalScale, uvOriginM, uvExtentM, material }: {
  tile: ApronTile;
  heights: Float32Array;
  verticalScale: number;
  uvOriginM: [number, number];
  uvExtentM: number | [number, number];
  material: THREE.Material;
}) {
  const sectors = useMemo(
    () => buildApronTileSectors(tile, heights, verticalScale, uvOriginM, uvExtentM),
    [tile, heights, verticalScale, uvOriginM, uvExtentM],
  );
  // Disposed together: the sectors share one position/uv buffer pair.
  useEffect(() => () => { for (const sector of sectors) sector.dispose(); }, [sectors]);
  return (
    <>
      {sectors.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={material} castShadow={false} receiveShadow={false} />
      ))}
    </>
  );
}
