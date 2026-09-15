/**
 * The border apron's manifest (`province/apron/apron-manifest.json`, written by
 * `worldgen.build_border_apron`, 16d).
 *
 * Beyond the province's four edges the ground continues as the all-Tamriel
 * heightmap, blended into our own terrain over 6 km. Ring 0 is ordinary chunk
 * tiles registered on the chunk store; rings 1 and 2 are single coarse tiles
 * drawn by `BorderApron`, each masking the finer rings it covers.
 *
 * Types and pure helpers only, so the studio's material hook and the tests can
 * use them without pulling in React or three.
 */
import type { ChunkGrid, ChunkLodMeta, ChunkMeta } from "./chunkStore";

/** Which paint set a tile is textured with. */
export type ApronPaintSet = "near" | "far";

export interface ApronTile {
  id: string;
  file: string;
  /** NW corner, metres east/south of the province origin (negative outside). */
  originM: [number, number];
  /** [ny, nx] samples. */
  shape: [number, number];
  metresPerSample: number;
  minM: number;
  maxM: number;
  /** Half-open interior the finer rings cover: [z0, z1] (square) or
   * [z0, z1, x0, x1]. Quads with all four corners inside are not indexed. */
  maskInnerSamples?: number[];
  paint: ApronPaintSet;
}

export interface ApronPaintFrame {
  /** NW corner of the set's control/tint/gradient frame, in metres. */
  originM: [number, number];
  /** Square extent, or [x, z] for the rectangular far set. */
  extentM: number | [number, number];
  control: string;
  tint: string;
  grad: string;
}

export interface ApronManifest {
  schemaVersion: number;
  sourceSha256: string;
  blendM: number;
  paintBlendM: number;
  ring0: { dir: string; chunks: ChunkMeta[] };
  tiles: ApronTile[];
  paint: Record<ApronPaintSet, ApronPaintFrame>;
  report?: unknown;
}

/** The UV extent a mesh in this frame divides by. The far set is rectangular;
 * its U and V are the same world metre span only if it is square, so meshes in
 * a rectangular frame use the x span for U and the z span for V. */
export function paintFrameExtent(frame: ApronPaintFrame): [number, number] {
  return Array.isArray(frame.extentM) ? [frame.extentM[0], frame.extentM[1]] : [frame.extentM, frame.extentM];
}

/** `[z0, z1, x0, x1]`, half-open, for either mask form; null when unmasked. */
export function maskBounds(tile: ApronTile): [number, number, number, number] | null {
  const m = tile.maskInnerSamples;
  if (!m || m.length < 2) return null;
  if (m.length === 2) return [m[0], m[1], m[0], m[1]];
  return [m[0], m[1], m[2], m[3]];
}

/**
 * Quad predicate in the SKIRT-PADDED vertex frame `buildTerrainGridGeometry`
 * builds (one extra ring of vertices, clamped to the sample edge): quad
 * `(x, z)` is skipped when all four of its corner SAMPLES lie inside the mask.
 */
export function apronSkipQuad(tile: ApronTile): ((x: number, z: number) => boolean) | undefined {
  const bounds = maskBounds(tile);
  if (!bounds) return undefined;
  const [z0, z1, x0, x1] = bounds;
  const [ny, nx] = tile.shape;
  const sample = (v: number, n: number) => Math.max(0, Math.min(n - 1, v - 1));
  return (x: number, z: number) => {
    for (const vz of [z, z + 1]) for (const vx of [x, x + 1]) {
      const sx = sample(vx, nx), sz = sample(vz, ny);
      if (!(sz >= z0 && sz < z1 && sx >= x0 && sx < x1)) return false;
    }
    return true;
  };
}

/** The tile as a `ChunkGrid`, so it goes through the shared mesh builder. */
export function apronTileGrid(tile: ApronTile, heights: Float32Array): ChunkGrid {
  const [ny, nx] = tile.shape;
  const meta: ChunkMeta = { cx: -1, cy: -1, originM: tile.originM, lods: {} };
  return { meta, lod: "apron", heights, nx, ny, metresPerSample: tile.metresPerSample };
}

/** The tile read as one LOD's raster, for `decodeHeightPng`. */
export function apronTileLodMeta(tile: ApronTile): ChunkLodMeta {
  return { file: tile.file, shape: tile.shape, metresPerSample: tile.metresPerSample, minM: tile.minM, maxM: tile.maxM };
}
