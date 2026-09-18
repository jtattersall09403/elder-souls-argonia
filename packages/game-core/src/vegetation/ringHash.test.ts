import { describe, expect, it } from "vitest";
import { hash32, latticeValue, u01 } from "./ringHash";

/** Histogram of `(b − a) mod 1` over paired draws; flat when independent. */
function foldedHistogram(pairs: [number, number][], bins = 10): number[] {
  const h = new Array<number>(bins).fill(0);
  for (const [a, b] of pairs) h[Math.min(bins - 1, Math.floor((((b - a) % 1) + 1) % 1 * bins))]++;
  return h;
}

describe("the ring's candidate hash", () => {
  it("draws independent streams for consecutive salts (the rows defect)", () => {
    // The x and z jitter of one candidate are salts k*8+1 and k*8+2. Before
    // the finaliser the folded histogram had two spikes holding ~85 % of the
    // mass (measured 2026-09-18: bins of 7,527 and 10,115 against a flat
    // 2,000), which is every plant on one of two diagonals in its cell.
    const pairs: [number, number][] = [];
    for (let tx = 250; tx < 260; tx++) for (let tz = 280; tz < 290; tz++) for (let k = 0; k < 400; k++) {
      pairs.push([u01(hash32(tx, tz, 7, k * 8 + 1)), u01(hash32(tx, tz, 7, k * 8 + 2))]);
    }
    const h = foldedHistogram(pairs);
    const expected = pairs.length / h.length;
    for (const count of h) expect(Math.abs(count - expected) / expected).toBeLessThan(0.08);
  });

  it("gives consecutive species different clump fields", () => {
    let same = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const a = latticeValue(i % 50, Math.floor(i / 50), 3);
      const b = latticeValue(i % 50, Math.floor(i / 50), 4);
      if (Math.abs(a - b) < 0.05) same++;
    }
    // Independent uniforms fall within 0.05 of each other ~10 % of the time.
    expect(same / n).toBeLessThan(0.16);
  });
});
