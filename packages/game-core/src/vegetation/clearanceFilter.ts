/**
 * A place's vegetation clearance, applied when a vegetation cell is built
 * (decision 0102 decision 1): the clearance travels in the place's bundle
 * (`settlements[i].vegetationClearance`, schemaVersion 1) instead of waiting
 * for the chain to prune the published vegetation bundles.
 *
 * The rule is `worldgen.apply_vegetation_patches.survives`, exactly: a plant
 * goes when the worst keep over its origin and four reach points
 * (`keepForExtent`, the twin of `keep_over_extent`) is below 1 and its roll
 * — SplitMix64 over (seed, ROLL_SALT, hash of the patch id, the position on
 * the 1/16 m grid) — is not below that keep. Hard-cleared ground keeps 0, so
 * nothing stands there; the thinned fringe keeps its graded share.
 * `__fixtures__/clearance-survives.json` holds the two equal.
 */

import {
  clearanceBoundsM,
  keepForExtent,
  type VegetationClearancePatch,
  type VegetationPatchesDoc,
} from "./vegetationPatches";

export const VEGETATION_CLEARANCE_SCHEMA_VERSION = 1;
/** `apply_vegetation_patches` main's default seed. */
export const CLEARANCE_SEED = 0x5ca77e5;
/** `apply_vegetation_patches.ROLL_SALT`. */
const ROLL_SALT = 0xc1ea4n;

export interface BundleClearance extends VegetationClearancePatch {
  readonly id: string;
  readonly schemaVersion?: number;
}

const MASK = 0xffffffffffffffffn;
const GOLDEN = 0x9e3779b97f4a7c15n;

/** `scatter.hash64`: SplitMix64 folded over the values. */
export function hash64(...values: bigint[]): bigint {
  let state = GOLDEN;
  for (const value of values) {
    state = (state + (value & MASK) * GOLDEN) & MASK;
    state ^= state >> 30n;
    state = (state * 0xbf58476d1ce4e5b9n) & MASK;
    state ^= state >> 27n;
    state = (state * 0x94d049bb133111ebn) & MASK;
    state ^= state >> 31n;
  }
  return state;
}

/** `apply_vegetation_patches.patch_id_hash`. */
export function patchIdHash(id: string): bigint {
  const codes: bigint[] = [];
  for (const ch of id) codes.push(BigInt(ch.codePointAt(0)!));
  return hash64(...codes);
}

/** Python's `round` (half to even). */
function roundHalfEven(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** `composition._quantised`: the 1/16 m grid, as unsigned 32-bit. */
function quantised(v: number): bigint {
  return BigInt(roundHalfEven(v * 16)) & 0xffffffffn;
}

/** `apply_vegetation_patches.instance_roll`, in [0, 1). */
export function instanceRoll(seed: number, idHash: bigint, x: number, z: number): number {
  const key = hash64(BigInt(seed), ROLL_SALT, idHash, quantised(x), quantised(z));
  return Number(hash64(key, 0n) >> 11n) * (1 / 2 ** 53);
}

export interface ClearanceFilter {
  /** False when the plant at (x, z) with this reach is cleared. */
  survives(x: number, z: number, radiusM: number): boolean;
}

/** The filter over every place's clearance in a bundle. */
export function makeClearanceFilter(
  clearances: readonly BundleClearance[], seed: number = CLEARANCE_SEED,
): ClearanceFilter {
  const entries = clearances.flatMap((c) => {
    const bounds = clearanceBoundsM(c);
    return bounds ? [{ clearance: c, bounds, idHash: patchIdHash(c.id) }] : [];
  });
  return {
    survives(x, z, radiusM) {
      for (const e of entries) {
        const b = e.bounds;
        if (x < b.minX - radiusM || x > b.maxX + radiusM
          || z < b.minZ - radiusM || z > b.maxZ + radiusM) continue;
        const keep = keepForExtent(x, z, radiusM, [e.clearance]);
        if (keep >= 1) continue;
        if (!(instanceRoll(seed, e.idHash, x, z) < keep)) return false;
      }
      return true;
    },
  };
}

/** The clearances of one published bundle; refuses a version it does not know. */
export function clearancesOfBundle(bundle: {
  readonly settlements?: readonly { readonly id: string; readonly vegetationClearance?: BundleClearance }[];
}): BundleClearance[] {
  const out: BundleClearance[] = [];
  for (const s of bundle.settlements ?? []) {
    const c = s.vegetationClearance;
    if (!c) continue;
    if (c.schemaVersion !== VEGETATION_CLEARANCE_SCHEMA_VERSION) {
      throw new Error(`${s.id}: vegetationClearance schemaVersion ${String(c.schemaVersion)}, `
        + `expected ${VEGETATION_CLEARANCE_SCHEMA_VERSION}`);
    }
    out.push(c);
  }
  return out;
}

/** The published vegetation patches with every place's bundle clearance
 * added: the one clearance list the groundcover tiles index
 * (`indexPatches`), the same list the vegetation cells filter on (0102). */
export function withPlaceClearances(
  doc: VegetationPatchesDoc, places: readonly BundleClearance[],
): VegetationPatchesDoc {
  return { ...doc, patches: [...(doc.patches ?? []), ...places] };
}
