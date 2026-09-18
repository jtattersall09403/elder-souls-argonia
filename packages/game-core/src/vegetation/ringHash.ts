/**
 * The ground-cover ring's deterministic hashes (16f). Placement is hashed
 * per (tile, species, candidate, salt) so walking away and back yields the
 * same plants, and the Python twin `worldgen/groundcover_ring.py` computes
 * the identical values in uint32 numpy — every constant here is mirrored
 * there bit for bit.
 *
 * Both hashes end in MurmurHash3's finaliser. Without it the last mixing
 * step folded the final argument in with one multiply and one shift, which
 * is not an avalanche: for consecutive salts (`k*8+1` for the x jitter,
 * `k*8+2` for the z jitter, `k*8` for keep) the outputs were strongly
 * correlated — `(uz − ux) mod 1` piled up on two values instead of being
 * flat — so every candidate landed on one of two diagonals inside its cell
 * and the ring read as rows of plants (owner, 16f round 3). Consecutive
 * species salts likewise gave near-identical clump fields.
 */

/** MurmurHash3 fmix32. */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic 32-bit mix; `salt` separates the random streams one
 * candidate draws (keep / jitter x / jitter z / accept / yaw / height). */
export function hash32(a: number, b: number, c: number, d: number): number {
  let h = 0x9e3779b9 ^ Math.imul(a | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) ^ Math.imul(b | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) ^ Math.imul(d | 0, 0xc2b2ae35);
  return fmix32(h);
}

export function u01(h: number): number {
  return h / 4294967296;
}

/** One deterministic value per integer lattice point, for the clump field. */
export function latticeValue(ix: number, iz: number, salt: number): number {
  let h = (0x9e3779b9 ^ Math.imul(ix | 0, 0x85ebca6b)) >>> 0;
  h = (Math.imul(h ^ (h >>> 13), 0xc2b2ae35) ^ Math.imul(iz | 0, 0x27d4eb2f)) >>> 0;
  h = (Math.imul(h ^ (h >>> 15), 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  return fmix32(Math.imul(h ^ (h >>> 13), 0x85ebca6b)) / 4294967296;
}
