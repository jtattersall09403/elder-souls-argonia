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

/**
 * The land beyond the border (16d): the apron's coarse tiles, one mesh each.
 *
 * Ring 0 is not here — it is ordinary chunk geometry, registered on the chunk
 * store and drawn by the chunk renderer with the same LOD rule, so the border
 * is an ordinary chunk seam. This component draws only the single coarse tiles
 * (ring 1 at 29 m, ring 2 at 117 m out to the map's edge), each with the
 * interior the finer rings cover left out of the index.
 *
 * These meshes are scenery, never ground: no colliders, no shadows either way
 * (they are beyond the shadow frustum and beyond the walls), and no frustum
 * culling — one bounding box per ring spans tens of kilometres, so culling can
 * only cost a test and mistakenly drop a tile the camera is standing in.
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

function ApronTileMesh({ tile, heights, verticalScale, uvOriginM, uvExtentM, material }: {
  tile: ApronTile;
  heights: Float32Array;
  verticalScale: number;
  uvOriginM: [number, number];
  uvExtentM: number | [number, number];
  material: THREE.Material;
}) {
  const geometry = useMemo(
    () => buildApronTileGeometry(tile, heights, verticalScale, uvOriginM, uvExtentM),
    [tile, heights, verticalScale, uvOriginM, uvExtentM],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} castShadow={false} receiveShadow={false} frustumCulled={false} />;
}
