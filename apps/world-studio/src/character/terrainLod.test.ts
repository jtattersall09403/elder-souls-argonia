import { describe, expect, it } from "vitest";
import { LOD_BANDS, LOD_HYSTERESIS, lodForDistance, nearestEdgeM } from "./chunkStore";
import { subsampleGrid } from "@elder-souls/game-core/terrain/chunkStore";

const M = 467.9; // province chunkMetres

describe("terrain LOD ladder", () => {
  it("measures to the chunk rectangle's nearest edge, 0 inside", () => {
    expect(nearestEdgeM(100, 100, 0, 0, M)).toBe(0);
    expect(nearestEdgeM(-50, 100, 0, 0, M)).toBeCloseTo(50, 6);
    expect(nearestEdgeM(-30, -40, 0, 0, M)).toBeCloseTo(50, 6);
  });

  it("assigns the four bands by distance, not by ring", () => {
    // camera at the NW corner of cell 0,0; cell n,0 starts n*M east of it.
    const at = (cellX: number) => lodForDistance(0, 0, cellX, 0, M);
    expect(at(0)).toBe("1");          // inside
    expect(at(1)).toBe("2");          // 467.9 m
    expect(at(2)).toBe("4");          // 935.8 m
    expect(at(6)).toBe("8");          // 2807.4 m
  });

  it("covers every band boundary from the ladder constants", () => {
    for (const [i, band] of LOD_BANDS.entries()) {
      if (!Number.isFinite(band.maxM)) continue;
      expect(lodForDistance(-(band.maxM - 1), 0, 0, 0, M)).toBe(band.lod);
      expect(lodForDistance(-(band.maxM + 1), 0, 0, 0, M)).toBe(LOD_BANDS[i + 1].lod);
    }
  });

  it("steps up the moment it is inside, down only past the 15% margin", () => {
    const d = (metres: number, current?: string) => lodForDistance(-metres, 0, 0, 0, M, current);
    // sitting just past 150 m while drawn at LOD 1: held, not flipped
    expect(d(160, "1")).toBe("1");
    expect(d(150 * LOD_HYSTERESIS + 1, "1")).toBe("2");
    // and back up immediately on re-entry
    expect(d(149, "2")).toBe("1");
    // a chunk two bands too coarse upgrades in one step
    expect(d(100, "8")).toBe("1");
    // held at LOD 2 inside the 900 m margin, dropped beyond it
    expect(d(950, "2")).toBe("2");
    expect(d(900 * LOD_HYSTERESIS + 1, "2")).toBe("4");
  });
});

describe("derived LOD 8", () => {
  it("keeps every second sample, 5x5 -> 3x3", () => {
    const heights = new Float32Array(25);
    for (let z = 0; z < 5; z++) for (let x = 0; x < 5; x++) heights[z * 5 + x] = z * 10 + x;
    const out = subsampleGrid(heights, 5, 5, 2);
    expect([out.nx, out.ny]).toEqual([3, 3]);
    expect(Array.from(out.heights)).toEqual([0, 2, 4, 20, 22, 24, 40, 42, 44]);
  });

  it("halves a published 65x65 LOD 4 chunk to 33x33 (2 048 triangles)", () => {
    const out = subsampleGrid(new Float32Array(65 * 65), 65, 65, 2);
    expect([out.nx, out.ny]).toEqual([33, 33]);
    expect((out.nx - 1) * (out.ny - 1) * 2).toBe(2048);
  });
});
