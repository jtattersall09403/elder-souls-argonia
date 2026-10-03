import { describe, expect, it } from "vitest";
import { TerrainGrids, GRID_TEXELS, type TerrainSamplers } from "./terrainGrids";

describe("far grid basin floor (vol10 diag8 F-1)", () => {
  it("a lake's bed never lowers the floor: over and around the water it is the water surface", () => {
    // flat land at 0 m with a 400 m lake whose surface is at 0 m and whose bed is 20 m down
    const inLake = (x: number, z: number) => Math.abs(x) < 200 && Math.abs(z) < 200;
    const s: TerrainSamplers = {
      groundHeight: (x, z) => (inLake(x, z) ? -20 : 0),
      water: (x, z) => (inLake(x, z) ? { height: 0, mask: 1 } : { height: 0, mask: 0 }),
      seaMask: () => 0,
      wetness: () => 0,
    };
    const g = new TerrainGrids(s);
    g.bakeAll(0, 0);
    const d = g.far.data;
    let minFloor = Infinity, minGround = Infinity;
    for (let k = 0; k < GRID_TEXELS * GRID_TEXELS; k++) { minFloor = Math.min(minFloor, d[k * 4 + 1]); minGround = Math.min(minGround, d[k * 4]); }
    expect(minGround).toBe(-20); // channel r keeps the bed
    expect(minFloor).toBeGreaterThan(-1e-6);
    g.dispose();
  });
});
