import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_SPANS,
  clearUploadSpans,
  markUploadRow,
  newUploadSpans,
} from "./uploadSpans";

describe("uploadSpans", () => {
  it("merges adjacent and overlapping rows into one span", () => {
    const s = newUploadSpans();
    markUploadRow(s, 4);
    markUploadRow(s, 5);
    markUploadRow(s, 3);
    markUploadRow(s, 4);
    expect(s.spans).toEqual([[3, 5]]);
    expect(s.all).toBe(false);
  });

  it("keeps distant rows as separate spans", () => {
    const s = newUploadSpans();
    markUploadRow(s, 10);
    markUploadRow(s, 8000);
    expect(s.spans).toEqual([[10, 10], [8000, 8000]]);
  });

  it("bridges two spans when the row between them is written", () => {
    const s = newUploadSpans();
    markUploadRow(s, 10);
    markUploadRow(s, 12);
    expect(s.spans.length).toBe(2);
    markUploadRow(s, 11);
    expect(s.spans).toEqual([[10, 12]]);
  });

  it("collapses to the whole buffer past the span cap", () => {
    const s = newUploadSpans();
    for (let i = 0; i < MAX_UPLOAD_SPANS; i++) markUploadRow(s, i * 2);
    expect(s.spans.length).toBe(MAX_UPLOAD_SPANS);
    expect(s.all).toBe(false);
    markUploadRow(s, MAX_UPLOAD_SPANS * 2 + 4);
    expect(s.all).toBe(true);
    expect(s.spans.length).toBe(0);
    // Once collapsed, further rows are already covered.
    markUploadRow(s, 1);
    expect(s.all).toBe(true);
    expect(s.spans.length).toBe(0);
  });

  it("clears back to an empty state", () => {
    const s = newUploadSpans();
    markUploadRow(s, 7);
    clearUploadSpans(s);
    expect(s.spans).toEqual([]);
    expect(s.all).toBe(false);
  });
});
