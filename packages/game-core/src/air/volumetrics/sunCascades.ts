/**
 * The sun's cascaded shadow maps as a volumetric sun term (decision 0112 §5): the inject kernel picks
 * the cascade by the froxel's view depth, projects the froxel through that cascade's shadow matrix and
 * compares by hand against one `textureLoad` texel (three r184 refuses a comparison sampler outside the
 * fragment stage, WGSLNodeBuilder.js:847). These are the CPU twins of that kernel code.
 */
import type * as THREE from "three";

/** Most cascades the inject kernel reads (the studio flyover has 3, character play 1). */
export const MAX_SUN_CASCADES = 4;

/** One cascade as the studio hands it over: its depth texture (live identity), its live shadow matrix
 * (LightShadow.matrix: world to [0,1] uv, y up, and [0,1] depth) and map size. */
export interface SunCascade { depth: THREE.Texture; matrix: THREE.Matrix4; size: THREE.Vector2 }

/** The sun's cascades, injected once they exist (WorldSky after the first shadow pass; no singleton). */
export interface SunCascadeSource {
  cascades: readonly SunCascade[];
  /** Writes each cascade's far end (m of view depth) into `out[0..n)`; called every frame, allocation-free. */
  splitEndsInto(out: number[]): void;
  /** The renderer's reversed depth buffer (GreaterEqual compare). */
  reversedDepth: boolean;
}

/** Index of the cascade covering view depth `viewZ` (m), -1 past the last one. */
export function pickCascade(viewZ: number, splitEndsM: readonly number[], n: number): number {
  for (let i = 0; i < n; i++) if (viewZ <= splitEndsM[i]) return i;
  return -1;
}

/** Shadow coordinate of world `p` through `m` (column-major elements): uv with y flipped to texture rows,
 * and the reference depth. */
export function shadowCoord(m: ArrayLike<number>, x: number, y: number, z: number): { u: number; v: number; d: number } {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return {
    u: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    v: 1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    d: (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  };
}

/** Integer texel of uv on a `size` map (clamped to the edge texels). */
export function shadowTexel(u: number, v: number, w: number, h: number): [number, number] {
  return [Math.min(w - 1, Math.max(0, Math.floor(u * w))), Math.min(h - 1, Math.max(0, Math.floor(v * h)))];
}

/** Sun visibility at world p in one cascade, one tap: null outside the cascade's map (caller falls back),
 * else 1 lit / 0 shadowed (LessEqual: lit when the reference depth is not behind the stored caster). */
export function cascadeLit(
  m: ArrayLike<number>, w: number, h: number, depthAt: (i: number, j: number) => number,
  x: number, y: number, z: number, reversed = false,
): number | null {
  const c = shadowCoord(m, x, y, z);
  if (!(c.u >= 0 && c.u <= 1 && c.v >= 0 && c.v <= 1 && c.d <= 1 && c.d >= 0)) return null;
  const [i, j] = shadowTexel(c.u, c.v, w, h);
  const stored = depthAt(i, j);
  return (reversed ? c.d >= stored : c.d <= stored) ? 1 : 0;
}
