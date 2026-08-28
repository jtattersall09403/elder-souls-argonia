/**
 * Deterministic integer hashing for the weather machine. Same inputs → same
 * weather, always (module 55 §94/§98): no Math.random anywhere in world
 * systems; every "roll" is a hash of (seed, structural indices).
 */

/** Province weather seed — one constant, changing it re-rolls all weather. */
export const WEATHER_SEED = 0x8c0a6;

/** 32-bit avalanche hash of up to three ints → [0, 1). */
export function hash01(a: number, b = 0, c = 0): number {
  let h = (WEATHER_SEED ^ Math.imul(a | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (b | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (c | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Weighted pick: entries [key, weight]; r in [0,1). */
export function pickWeighted<T>(entries: readonly (readonly [T, number])[], r: number): T {
  let total = 0;
  for (const [, w] of entries) total += w;
  let x = r * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x < 0) return k;
  }
  return entries[entries.length - 1][0];
}
