import { describe, expect, it } from "vitest";
import { buildTerrainGridGeometry, subGrid, terrainGridIndices } from "./gridGeometry";
import type { ChunkGrid } from "./chunkStore";

/** A 9×9 chunk at world origin (0, 0), 10 m per sample, height = z*100 + x. */
function grid(n = 9, metresPerSample = 10, originM: [number, number] = [0, 0]): ChunkGrid {
  const heights = new Float32Array(n * n);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) heights[z * n + x] = z * 100 + x;
  return { meta: { cx: 0, cy: 0, originM, lods: {} }, lod: "1", heights, nx: n, ny: n, metresPerSample };
}

describe("chunk sub-tiles", () => {
  it("splits (n-1)/divisions+1 samples per side and keeps the sample count", () => {
    const sub = subGrid(grid(), 0, 0, 4);
    expect([sub.nx, sub.ny]).toEqual([3, 3]);
    expect(sub.heights.length).toBe(9);
    expect(subGrid(grid(257), 3, 3, 4).nx).toBe(65);   // published LOD 1
    expect(subGrid(grid(129), 3, 3, 4).nx).toBe(33);   // published LOD 2
  });

  it("carries the sub-tile's own world origin and the chunk's sample spacing", () => {
    const sub = subGrid(grid(9, 10, [400, 800]), 2, 1, 4);
    expect(sub.meta.originM).toEqual([400 + 4 * 10, 800 + 2 * 10]);
    expect(sub.metresPerSample).toBe(10);
  });

  it("shares its edge rows and columns with its neighbours", () => {
    const a = subGrid(grid(), 0, 0, 4), b = subGrid(grid(), 1, 0, 4), c = subGrid(grid(), 0, 1, 4);
    for (let z = 0; z < 3; z++) expect(a.heights[z * 3 + 2]).toBe(b.heights[z * 3]);     // east/west edge
    for (let x = 0; x < 3; x++) expect(a.heights[2 * 3 + x]).toBe(c.heights[x]);          // south/north edge
    // and the values are the chunk's own samples, unresampled
    expect(Array.from(b.heights)).toEqual([2, 3, 4, 102, 103, 104, 202, 203, 204]);
  });

  it("covers the chunk exactly: 16 sub-tiles, no quad drawn twice", () => {
    const whole = terrainGridIndices(9, 9).length / 6;
    let quads = 0;
    for (let iz = 0; iz < 4; iz++) for (let ix = 0; ix < 4; ix++) {
      const sub = subGrid(grid(), ix, iz, 4);
      quads += (sub.nx - 1) * (sub.ny - 1);
    }
    expect(quads).toBe(whole);
  });

  it("rejects a split the grid does not divide into", () => {
    expect(() => subGrid(grid(10), 0, 0, 4)).toThrow(/divide/);
    expect(() => subGrid(grid(), 4, 0, 4)).toThrow(/range/);
  });

  it("maps UVs in the frame it is given, so the chunk's textures map unchanged", () => {
    const uvOf = (g: ChunkGrid, vertex: number) => {
      const geometry = buildTerrainGridGeometry(g, 1, 1000, [0, 0]);
      const uv = geometry.getAttribute("uv");
      const position = geometry.getAttribute("position");
      const out: [number, number, number, number] =
        [uv.getX(vertex), uv.getY(vertex), position.getX(vertex), position.getZ(vertex)];
      geometry.dispose();
      return out;
    };
    // The skirt-padded vertex 0 clamps to the sub-tile's NW sample: u and v
    // are that world metre position in the province frame, not a local one.
    const [u, v, wx, wz] = uvOf(subGrid(grid(), 2, 1, 4), 0);
    expect([wx, wz]).toEqual([40, 20]);
    expect(u).toBeCloseTo(40 / 1000, 6);
    expect(v).toBeCloseTo(1 - 20 / 1000, 6);
  });
});
