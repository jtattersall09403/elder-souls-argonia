import { describe, expect, it } from "vitest";
import { sampleChunkHeight, triangleHeight } from "./heightfield";

describe("render/physics terrain triangulation", () => {
  it("uses the same anti-diagonal as Rapier, not a bilinear saddle", () => {
    // Independently confirmed by actual Rapier heightfield downward raycasts.
    expect(triangleHeight(0, 0, 0, 4, 0.25, 0.25)).toBe(0);
    expect(triangleHeight(0, 0, 0, 4, 0.75, 0.25)).toBe(0);
    expect(triangleHeight(0, 0, 0, 4, 0.75, 0.75)).toBe(2);
    expect(triangleHeight(4, 0, 0, 0, 0.25, 0.25)).toBe(2);
  });
  it("preserves planes, native vertices and exact chunk boundaries", () => {
    const grid = { nx: 2, ny: 2, lod: "1", metresPerSample: 2,
      meta: { cx: 0, cy: 0, originM: [100, 200] as [number, number], lods: {} },
      heights: new Float32Array([1, 3, 5, 7]) };
    expect(sampleChunkHeight(grid, 101, 201)).toBe(4);
    expect(sampleChunkHeight(grid, 102, 202)).toBe(7);
    expect(sampleChunkHeight(grid, 100, 200)).toBe(1);
    expect(sampleChunkHeight(grid, 103, 203)).toBe(7);
  });
});
