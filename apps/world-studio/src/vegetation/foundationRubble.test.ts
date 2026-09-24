import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FOUNDATION_RUBBLE_PILES,
  FOUNDATION_RUBBLE_TRIANGLES,
  foundationRubblePiles,
} from "./Groundcover";

// 16h K6: the foundation rubble ring is the flora kit's sourced rock piles,
// under 2k triangles per building, never generated geometry.
const manifest = JSON.parse(readFileSync(
  join(__dirname, "../../public/kits/flora-province-v1.kit.json"), "utf8")) as {
  assets: { id: string; triangles?: number }[] };
const pileTriangles = FOUNDATION_RUBBLE_PILES.map(
  (id) => manifest.assets.find((a) => a.id === id)?.triangles ?? Number.NaN);

const house = {
  id: "treatment.test-house",
  footprintM: [[0, 0], [12, 0], [12, 8], [0, 8]] as [number, number][],
  foundationScatterBandM: [0, 1.5] as [number, number],
};

describe("foundation rubble piles", () => {
  it("are sourced flora-kit pieces with measured triangle counts", () => {
    expect(pileTriangles.every((n) => Number.isFinite(n) && n > 0)).toBe(true);
  });

  it("keep one building under the triangle ceiling, spaced, and repeat exactly", () => {
    const piles = foundationRubblePiles(house, pileTriangles);
    const tris = piles.reduce((s, p) => s + pileTriangles[p.pile], 0);
    expect(piles.length).toBeGreaterThan(0);
    expect(tris).toBeLessThanOrEqual(FOUNDATION_RUBBLE_TRIANGLES);
    for (const a of piles) for (const b of piles) {
      if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(3);
    }
    expect(foundationRubblePiles(house, pileTriangles)).toEqual(piles);
  });
});
