/**
 * Terrain shadow on the sun inside the fog (decision 0112 §3): five probes up
 * the sun ray against the terrain grids' ground height; each probe above the
 * ground lets the sun through, each below it (a ridge between the froxel and
 * the sun) takes it away, softened over a band that widens with distance so
 * the far grid's 16 m texels do not stair-step the shadow edge.
 *
 * Adapted from fable5-world-demo src/gpu/passes/Froxels.ts:157-163,182-184
 * @ fd75fdb7 (MIT, Copyright (c) 2026 Remi Sebastian Kits). The shader
 * in froxelGrid.ts reads these constants; `terrainSunVisibility` is its
 * plain TS twin for tests.
 */

/** Distances (m) of the probes up the sun ray, log-spaced 12..420 m. */
export const SUN_PROBES_M = [12, 35, 90, 200, 420] as const;
/** Probes inside this distance read the near grid (256 m wide, centred on the camera) where it covers them. */
export const SUN_PROBE_NEAR_M = 100;
/** Half-width (m) of the soft band at a probe `d` metres out. */
export function probeSoftM(d: number): number {
  return 0.75 + d * 0.03;
}
/** Sky ambient kept on a froxel the terrain hides from the sun (softened: the sky dome is still open). */
export const SHADOWED_SKY = 0.6;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0..1: how much of the sun reaches `p` past the terrain (1 = no ridge in the way). */
export function terrainSunVisibility(
  ground: (x: number, z: number) => number,
  p: readonly [number, number, number],
  sunDir: readonly [number, number, number],
): number {
  let vis = 1;
  for (const d of SUN_PROBES_M) {
    const qx = p[0] + sunDir[0] * d, qy = p[1] + sunDir[1] * d, qz = p[2] + sunDir[2] * d;
    const s = probeSoftM(d);
    vis *= smooth(-s, s, qy - ground(qx, qz));
  }
  return vis;
}

/** The sky ambient factor a froxel keeps at sun visibility `vis` (only while the sun is up). */
export function shadowedSkyFactor(vis: number, sunY: number): number {
  const up = smooth(0, 0.05, sunY);
  return 1 - up * (1 - (SHADOWED_SKY + (1 - SHADOWED_SKY) * vis));
}

/** The camera basis a froxel grid is injected with (froxelGrid's camPos/camRight/camUp/camFwd/tanHalf). */
export interface FroxelBasis {
  pos: readonly [number, number, number];
  right: readonly [number, number, number];
  up: readonly [number, number, number];
  fwd: readonly [number, number, number];
  tanHalf: readonly [number, number];
  near: number;
  far: number;
}
const dot3 = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** World point -> grid uvw in `b` (TS twin of Volumetrics.gridUvw, the fog stage's lookup). */
export function froxelUvw(p: readonly [number, number, number], b: FroxelBasis): [number, number, number] {
  const rel = [p[0] - b.pos[0], p[1] - b.pos[1], p[2] - b.pos[2]];
  const z = Math.max(dot3(rel, b.fwd), b.near);
  const nx = dot3(rel, b.right) / (z * b.tanHalf[0]), ny = dot3(rel, b.up) / (z * b.tanHalf[1]);
  return [nx * 0.5 + 0.5, 0.5 - ny * 0.5, Math.log(z / b.near) / Math.log(b.far / b.near)];
}

/** Grid uvw -> the world point the inject pass lit there (TS twin of the inject's froxel position). */
export function froxelWorld(uvw: readonly [number, number, number], b: FroxelBasis): [number, number, number] {
  const nx = uvw[0] * 2 - 1, ny = 1 - uvw[1] * 2;
  const depth = b.near * Math.pow(b.far / b.near, uvw[2]);
  const d = [0, 1, 2].map((k) => b.right[k] * nx * b.tanHalf[0] + b.up[k] * ny * b.tanHalf[1] + b.fwd[k]);
  return [b.pos[0] + d[0] * depth, b.pos[1] + d[1] * depth, b.pos[2] + d[2] * depth];
}
