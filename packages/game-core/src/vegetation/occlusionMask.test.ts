/**
 * The mask's two round-1 properties: the sweep costs the OCCUPIED list (not
 * the 16 k texels of the window), and an anchor move reports itself so the
 * wipe reaches the GPU.
 */
import { describe, expect, it } from "vitest";
import { OcclusionMask } from "./occlusionMask";

const CELL = 32;

/** A ridge along x = 400: anything east of it is hidden from an eye west. */
const ground = (x: number, _z: number) => (Math.abs(x - 400) < 40 ? 200 : 0);

function list(pairs: [number, number][]): Int32Array {
  const out = new Int32Array(pairs.length * 2);
  pairs.forEach(([x, z], i) => { out[i * 2] = x; out[i * 2 + 1] = z; });
  return out;
}

describe("OcclusionMask", () => {
  it("reports whether the anchor moved, so the wipe can be uploaded", () => {
    const mask = new OcclusionMask(16, CELL);
    expect(mask.anchor(4, 4)).toBe(true);
    expect(mask.anchor(4, 4)).toBe(false);
    expect(mask.anchor(5, 4)).toBe(true);
  });

  it("evaluates only the occupied cells it is given", () => {
    const mask = new OcclusionMask(64, CELL);
    mask.anchor(0, 0);
    let sampled = 0;
    const counted = (x: number, z: number) => { sampled++; return ground(x, z); };
    const occupied = list([[25, 5], [26, 5]]);
    const out = mask.sweep(
      24, { x: 0, y: 2, z: 160 }, counted, 10, 16, occupied);
    expect(out.evaluated).toBe(2);
    // Two cells only: nothing walked the other 4094 texels.
    expect(sampled).toBeGreaterThan(0);
    expect(out.hidden).toBe(mask.hiddenCount);
  });

  it("marks a cell behind a ridge hidden and clears it when the ridge goes", () => {
    const mask = new OcclusionMask(64, CELL);
    mask.anchor(0, 0);
    const occupied = list([[25, 5]]);
    mask.sweep(8, { x: 0, y: 2, z: 176 }, ground, 4, 16, occupied);
    expect(mask.hidden(25 * CELL + 16, 5 * CELL + 16)).toBe(true);
    mask.reset();
    expect(mask.hiddenCount).toBe(0);
    expect(mask.hidden(25 * CELL + 16, 5 * CELL + 16)).toBe(false);
  });

  it("ignores occupied cells outside the window", () => {
    const mask = new OcclusionMask(16, CELL);
    mask.anchor(0, 0);
    const out = mask.sweep(
      8, { x: 0, y: 2, z: 0 }, ground, 4, 16, list([[900, 900]]));
    expect(out.evaluated).toBe(0);
  });
});

describe("OcclusionMask.clearCells", () => {
  it("clears only the dropped cell's texels and leaves the rest hidden", () => {
    const mask = new OcclusionMask(64, CELL);
    mask.anchor(0, 0);
    const eye = { x: 0, y: 2, z: 176 };
    mask.sweep(8, eye, ground, 4, 16, list([[25, 5], [25, 6]]));
    expect(mask.hiddenCount).toBe(2);

    // Stride 3, as the renderer's (cellX, cellZ, instances) triples come.
    const changed = mask.clearCells([25, 5, 12], 3);
    expect(changed).toBe(1);
    expect(mask.hiddenCount).toBe(1);
    expect(mask.hidden(25 * CELL + 16, 5 * CELL + 16)).toBe(false);
    expect(mask.hidden(25 * CELL + 16, 6 * CELL + 16)).toBe(true);

    // Clearing a visible or out-of-window cell changes nothing.
    expect(mask.clearCells([25, 5, 12], 3)).toBe(0);
    expect(mask.clearCells([900, 900])).toBe(0);
    expect(mask.hiddenCount).toBe(1);
  });

  it("appending occupied cells leaves the existing hidden texels intact", () => {
    const mask = new OcclusionMask(64, CELL);
    mask.anchor(0, 0);
    const eye = { x: 0, y: 2, z: 176 };
    mask.sweep(8, eye, ground, 4, 16, list([[25, 5]]));
    expect(mask.hidden(25 * CELL + 16, 5 * CELL + 16)).toBe(true);

    // A cell arriving only grows the occupied list: no reset, so the answer
    // already paid for stays, and the new texel reads visible until swept.
    const grown = list([[25, 5], [25, 6]]);
    expect(mask.hidden(25 * CELL + 16, 5 * CELL + 16)).toBe(true);
    expect(mask.hidden(25 * CELL + 16, 6 * CELL + 16)).toBe(false);
    mask.sweep(8, eye, ground, 4, 16, grown);
    expect(mask.hidden(25 * CELL + 16, 5 * CELL + 16)).toBe(true);
    expect(mask.hiddenCount).toBe(2);
  });
});
