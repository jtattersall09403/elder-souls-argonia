import { describe, expect, it } from "vitest";
import { compactRows } from "./compactRows";

/** Apply the plan to a row array and return the surviving prefix. */
function applyPlan(rows: number[], hidden: number[]): number[] {
  const out: number[] = [];
  const count = compactRows(rows.length, hidden, out);
  const copy = rows.slice();
  for (let i = 0; i < out.length; i += 2) copy[out[i + 1]] = copy[out[i]];
  return copy.slice(0, count);
}

describe("compactRows", () => {
  it("slides the tail down over a block at the front", () => {
    const out: number[] = [];
    expect(compactRows(5, [0, 1], out)).toBe(3);
    expect(out).toEqual([3, 0, 4, 1]);
    expect(applyPlan([10, 11, 12, 13, 14], [0, 1])).toEqual([13, 14, 12]);
  });

  it("moves nothing when the block is already the tail", () => {
    const out: number[] = [];
    expect(compactRows(5, [3, 4], out)).toBe(3);
    expect(out).toEqual([]);
  });

  it("skips hidden tail rows when choosing donors", () => {
    const out: number[] = [];
    expect(compactRows(5, [1, 3], out)).toBe(3);
    expect(out).toEqual([4, 1]);
    expect(applyPlan([10, 11, 12, 13, 14], [1, 3])).toEqual([10, 14, 12]);
  });

  it("handles interleaved rows across the whole prefix", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7];
    const hidden = [0, 2, 5, 6];
    const out: number[] = [];
    expect(compactRows(8, hidden, out)).toBe(4);
    expect(applyPlan(rows, hidden).sort((a, b) => a - b)).toEqual([1, 3, 4, 7]);
  });

  it("empties the prefix when every row is hidden", () => {
    const out: number[] = [];
    expect(compactRows(3, [0, 1, 2], out)).toBe(0);
    expect(out).toEqual([]);
  });

  it("returns the count unchanged for an empty hidden set", () => {
    const out: number[] = [];
    expect(compactRows(7, [], out)).toBe(7);
    expect(out).toEqual([]);
  });
});
