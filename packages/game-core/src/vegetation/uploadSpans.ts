/**
 * Row-span bookkeeping for the vegetation instance buffers.
 *
 * A frame moves rows all over an instanced mesh: a rung switching on appends
 * at `count`, a rung switching off swaps the last visible copy down into an
 * arbitrary row. One merged `min..max` span would therefore cover every row
 * between two unrelated touches and re-upload the whole middle of the buffer.
 * This keeps the touched rows as separate spans and merges only what actually
 * abuts, so the upload is the rows that moved.
 *
 * Pure and React-free so it can be unit tested; three.js never appears here.
 */

/** Past this many spans, walking the list costs more than one upload of the
 * whole visible prefix, so the state collapses to "upload everything". */
export const MAX_UPLOAD_SPANS = 64;

export interface UploadSpans {
  /** Inclusive `[start, end]` row ranges, pairwise disjoint and non-adjacent. */
  spans: Array<[number, number]>;
  /** The spans were given up on: upload the whole visible prefix instead. */
  all: boolean;
  /** The span the last row landed in. A tile's rows arrive in order, so this
   * hits almost every time and the list is never walked (round 12 review:
   * the scan was up to 2 x `MAX_UPLOAD_SPANS` comparisons per copy). */
  hint: number;
}

export function newUploadSpans(): UploadSpans {
  return { spans: [], all: false, hint: 0 };
}

/** Record that one row was written. */
export function markUploadRow(state: UploadSpans, row: number): void {
  if (state.all) return;
  const spans = state.spans;
  let at = -1;
  // Adjacent counts as touching: `[4,5]` and row 6 are one upload.
  const hinted = spans[state.hint];
  if (hinted && row + 1 >= hinted[0] && row - 1 <= hinted[1]) {
    at = state.hint;
  } else {
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (row + 1 >= s[0] && row - 1 <= s[1]) { at = i; break; }
    }
  }
  if (at < 0) {
    if (spans.length >= MAX_UPLOAD_SPANS) {
      state.all = true;
      spans.length = 0;
      return;
    }
    state.hint = spans.length;
    spans.push([row, row]);
    return;
  }
  const s = spans[at];
  state.hint = at;
  if (row >= s[0] && row <= s[1]) return;   // already covered: no bridge
  if (row < s[0]) s[0] = row;
  if (row > s[1]) s[1] = row;
  // Growing by a row can bridge this span to another one.
  for (let i = spans.length - 1; i >= 0; i--) {
    if (i === at) continue;
    const o = spans[i];
    if (o[1] + 1 < s[0] || o[0] - 1 > s[1]) continue;
    if (o[0] < s[0]) s[0] = o[0];
    if (o[1] > s[1]) s[1] = o[1];
    spans.splice(i, 1);
    if (i < at) at--;
  }
  state.hint = at;
}

/** Forget every pending span (after the upload ranges have been pushed). */
export function clearUploadSpans(state: UploadSpans): void {
  state.spans.length = 0;
  state.all = false;
  state.hint = 0;
}
