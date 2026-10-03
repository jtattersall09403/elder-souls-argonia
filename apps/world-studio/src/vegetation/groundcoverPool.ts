/**
 * The ground-cover mesh pool's lookup (perf10 c9 F38c). A draw slot is keyed
 * `plan|slot|part`; a key the pool has never held reuses an IDLE member
 * (not filled by this refill and drawing nothing, so the previous refill's
 * drain already released it) under the new key, and only a miss with no idle
 * member creates one. Tiles entering new wedges kept creating 2-7 meshes per
 * refill under the old exact-key pool; with reuse the pool stops growing once
 * it holds the live set plus one refill's churn.
 */
export interface PoolMember {
  count: number;
}

export type PoolTake<T> =
  | { mesh: T; reusedFrom: null }
  | { mesh: T; reusedFrom: string }
  | null;

/**
 * The member for `key`: the one already under it, else an idle one moved to
 * `key` (`reusedFrom` names its old key, so the caller retargets it), else
 * null (the caller creates one and sets it under `key`).
 */
export function takePooled<T extends PoolMember>(
  pool: Map<string, T>, key: string, live: ReadonlySet<string>,
): PoolTake<T> {
  const own = pool.get(key);
  if (own) return { mesh: own, reusedFrom: null };
  for (const [k, mesh] of pool) {
    if (live.has(k) || mesh.count !== 0) continue;
    pool.delete(k);
    pool.set(key, mesh);
    return { mesh, reusedFrom: k };
  }
  return null;
}
