/**
 * A place's vegetation clearance, applied when a vegetation cell is built
 * (decision 0102 decision 1): the clearance travels in the place's bundle
 * (`settlements[i].vegetationClearance`, schemaVersion 2: the tiers) instead of waiting
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
  type ClearancePolygon,
  clearanceBoundsM,
  keepForExtent,
  type VegetationClearancePatch,
  type VegetationPatchesDoc,
  type VegetationPatchRecord,
} from "./vegetationPatches";

/** 2 since 16k walk 4: the tiers. `hardClear` + `thinned` are where trees
 * and large plants go (the vegetation cells); `groundClear` is where the
 * ground cover dies (the groundcover ring): the hard surfaces only. */
export const VEGETATION_CLEARANCE_SCHEMA_VERSION = 2;
/** `apply_vegetation_patches` main's default seed. */
export const CLEARANCE_SEED = 0x5ca77e5;
/** `apply_vegetation_patches.ROLL_SALT`. */
const ROLL_SALT = 0xc1ea4n;

export interface BundleClearance extends VegetationClearancePatch {
  readonly id: string;
  readonly schemaVersion?: number;
  /** Ways, pads and floors, grown by their margin: the ground-cover tier. */
  readonly groundClear?: readonly ClearancePolygon[];
  /** The ground-cover tier's built-edge wobble, metres. */
  readonly groundEdgeJitterM?: number;
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

/** A species shorter than this (its kit height at scale 1,
 * `CellSpeciesParams.heightM`) is judged on the ground-cover tier, not the
 * tree tier: a sub-metre plant is ground cover wherever it grows (GROUND
 * rec 3, 16k walk 4 lane COMPILE). */
export const GROUND_TIER_MAX_HEIGHT_M = 0.6;

export interface ClearanceFilter {
  /** False when the plant at (x, z) with this reach is cleared. `heightM`
   * (the species' kit height) under GROUND_TIER_MAX_HEIGHT_M reads the
   * ground-cover tier; absent reads the tree tier. */
  survives(x: number, z: number, radiusM: number, heightM?: number): boolean;
}

/** The filter over every place's clearance in a bundle. */
export function makeClearanceFilter(
  clearances: readonly BundleClearance[], seed: number = CLEARANCE_SEED,
): ClearanceFilter {
  const tier = (rows: readonly (VegetationClearancePatch & { readonly id: string })[]) => rows.flatMap((c) => {
    const bounds = clearanceBoundsM(c);
    return bounds ? [{ clearance: c, bounds, idHash: patchIdHash(c.id) }] : [];
  });
  const trees = tier(clearances);
  const ground = tier(clearances.map(groundTierOf));
  return {
    survives(x, z, radiusM, heightM) {
      const entries = heightM !== undefined && heightM < GROUND_TIER_MAX_HEIGHT_M ? ground : trees;
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
    if (!Array.isArray(c.groundClear)) {
      throw new Error(`${s.id}: vegetationClearance schemaVersion ${String(c.schemaVersion)} `
        + "has no groundClear (the ground-cover tier)");
    }
    out.push(c);
  }
  return out;
}

/** A place's ground-cover tier as a patch: only its hard surfaces
 * (`groundClear`) clear, with its own tight wobble; no fringe, so the ground
 * cover stands everywhere else, between the buildings included. */
export function groundTierOf(c: BundleClearance): VegetationPatchRecord {
  return {
    id: `${c.id}.ground`,
    hardClear: c.groundClear ?? [],
    thinned: [],
    kept: c.kept ?? [],
    ...(c.groundEdgeJitterM !== undefined ? { edgeJitterM: c.groundEdgeJitterM } : {}),
  };
}

/** The published vegetation patches with every place's ground-cover tier
 * added (`groundTierOf`): the one clearance list the groundcover tiles index
 * (`indexPatches`). The vegetation cells filter on the tree tier
 * (`makeClearanceFilter`) of the same rows (0102, 16k walk 4). */
export function withPlaceClearances(
  doc: VegetationPatchesDoc, places: readonly BundleClearance[],
): VegetationPatchesDoc {
  return { ...doc, patches: [...(doc.patches ?? []), ...places.map(groundTierOf)] };
}
