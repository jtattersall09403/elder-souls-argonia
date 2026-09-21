/**
 * DEV per-frame triangle attribution (vegetation lane): which source drew the
 * frame's triangles, and whether it drew them into the shadow map.
 *
 * The buckets are deliberately coarse — the reading answers "where do 11.5 M
 * triangles come from?", not "which mesh". A mesh names its own bucket with
 * `userData.perfTag`; everything untagged that is not a vegetation
 * `BatchedMesh` is `other`, so the four buckets always sum to the frame total.
 */

export const TRI_BUCKETS = ["veg", "terrain", "gc", "other"] as const;
export type TriBucket = (typeof TRI_BUCKETS)[number];

/** Index into a bucket row; `other` is the catch-all, so this never fails. */
export function bucketIndexOf(object: unknown): number {
  const o = object as { userData?: { perfTag?: unknown }; isBatchedMesh?: boolean };
  const tag = o?.userData?.perfTag;
  if (typeof tag === "string") {
    const i = (TRI_BUCKETS as readonly string[]).indexOf(tag);
    if (i >= 0) return i;
  }
  if (o?.isBatchedMesh) return TRI_BUCKETS.indexOf("veg");
  return TRI_BUCKETS.indexOf("other");
}

export function bucketOf(object: unknown): TriBucket {
  return TRI_BUCKETS[bucketIndexOf(object)];
}

/** Two rows (main pass, shadow pass) of four counters, all zero. */
export function emptyBuckets(): number[] {
  return new Array(TRI_BUCKETS.length * 2).fill(0);
}

/** Row 0 is the main pass, row 1 the shadow pass. */
export function bucketSlot(shadow: boolean, bucket: number): number {
  return (shadow ? TRI_BUCKETS.length : 0) + bucket;
}
