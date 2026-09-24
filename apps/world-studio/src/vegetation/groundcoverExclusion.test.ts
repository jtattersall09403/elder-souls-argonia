import { describe, expect, it } from "vitest";
import {
  excludedByFootprints,
  rasteriseTileMask,
  maskCellIndex,
  MASK_N,
  MASK_EXCLUDE,
  MASK_PATCH,
  nearReachFraction,
} from "./Groundcover";

describe("building groundcover exclusion", () => {
  const footprint: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it("rejects origins inside the building", () => {
    expect(excludedByFootprints(5, 5, 0, [footprint])).toBe(true);
  });
  it("includes the species radius outside the wall", () => {
    expect(excludedByFootprints(11.5, 5, 2, [footprint])).toBe(true);
    expect(excludedByFootprints(12.5, 5, 2, [footprint])).toBe(false);
  });
});

describe("near-tier reach scales with the mesh's cost", () => {
  it("gives a typical grass clump the full reach", () => {
    expect(nearReachFraction(250)).toBe(1);
  });
  it("gives a cheaper mesh no more than the full reach", () => {
    expect(nearReachFraction(60)).toBe(1);
  });
  it("halves the reach for a mesh twice the reference cost", () => {
    expect(nearReachFraction(500)).toBeCloseTo(0.5, 10);
  });
  it("floors the reach for the spiky-grass tuft", () => {
    expect(nearReachFraction(2298)).toBeCloseTo(0.25, 10);
  });
});

describe("rasteriseTileMask", () => {
  const mask = new Uint8Array(MASK_N * MASK_N);
  const cells = (flag: number) => {
    const out: [number, number][] = [];
    for (let iz = 0; iz < MASK_N; iz++) {
      for (let ix = 0; ix < MASK_N; ix++) {
        if ((mask[iz * MASK_N + ix] & flag) !== 0) out.push([ix, iz]);
      }
    }
    return out;
  };

  it("marks exactly the cells a box covers when nothing reaches out of them", () => {
    // Tile at (32, 48); a box over local x 2..5, z 1..3. With zero species
    // radius the reach is the cell half-diagonal, so a cell is marked iff its
    // centre is within that of the box: local cells x 1..5, z 0..3.
    rasteriseTileMask(mask, 32, 48, 0, [
      { minX: 34, maxX: 37, minZ: 49, maxZ: 51 },
    ], []);
    const marked = cells(MASK_EXCLUDE);
    expect(marked.length).toBe(5 * 4);
    for (const [ix, iz] of marked) {
      expect(ix).toBeGreaterThanOrEqual(1);
      expect(ix).toBeLessThanOrEqual(5);
      expect(iz).toBeGreaterThanOrEqual(0);
      expect(iz).toBeLessThanOrEqual(3);
    }
    expect(cells(MASK_PATCH)).toHaveLength(0);
  });

  it("widens the marked area by the species reach, and keeps the two flags apart", () => {
    rasteriseTileMask(mask, 0, 0, 3, [], [
      { minX: 7, maxX: 8, minZ: 7, maxZ: 8 },
    ]);
    expect(cells(MASK_EXCLUDE)).toHaveLength(0);
    // A candidate at the far corner of a marked cell can reach the box; one
    // in an unmarked cell cannot, which is what makes the skip exact.
    expect(mask[maskCellIndex(7.5, 7.5)] & MASK_PATCH).toBe(MASK_PATCH);
    expect(mask[maskCellIndex(4.5, 7.5)] & MASK_PATCH).toBe(MASK_PATCH);
    expect(mask[maskCellIndex(0.5, 0.5)] & MASK_PATCH).toBe(0);
  });

  it("clears the mask when the tile holds nothing", () => {
    rasteriseTileMask(mask, 0, 0, 3, [], []);
    expect(mask.some((v) => v !== 0)).toBe(false);
  });
});
