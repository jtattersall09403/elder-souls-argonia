/**
 * Row arithmetic for hiding a whole BLOCK of instance rows at once.
 *
 * A vegetation tile switching off hides a few hundred copies of one geometry
 * in one go. Swap-removing them one at a time writes an arbitrary row per
 * copy, so the upload bookkeeping (`uploadSpans.ts`) sees hundreds of
 * disjoint rows and collapses to a whole-buffer upload. The rows a tile owns
 * are contiguous (a fill appends a tile's copies together), so the same
 * compaction can be done as one block move: the surviving rows of the tail
 * slide down into the hidden rows, and the upload is two spans.
 *
 * Pure and React-free so it can be unit tested; three.js never appears here.
 */

/**
 * Plan the moves that remove `hidden` from a visible prefix of `count` rows.
 *
 * `hidden` must be ascending, distinct and inside `[0, count)`. Flat
 * (donor, target) pairs are PUSHED onto `out` (cleared first) so a caller in
 * the frame loop allocates nothing; the new visible count is returned. A
 * donor is a surviving row at or beyond the new count; a target is a hidden
 * row below it. Rows at or beyond the new count are never drawn again, so
 * nothing is written there and only the targets need uploading.
 */
export function compactRows(
  count: number,
  hidden: readonly number[],
  out: number[],
): number {
  out.length = 0;
  const newCount = count - hidden.length;
  // `hidden` is ascending, so its entries below `newCount` are the targets
  // and the rest are tail rows that need no donor at all.
  let targets = 0;
  while (targets < hidden.length && hidden[targets] < newCount) targets++;
  let tail = targets;   // cursor into the hidden tail, also ascending
  let donor = newCount;
  for (let i = 0; i < targets; i++) {
    while (tail < hidden.length && donor === hidden[tail]) { donor++; tail++; }
    out.push(donor, hidden[i]);
    donor++;
  }
  return newCount;
}
