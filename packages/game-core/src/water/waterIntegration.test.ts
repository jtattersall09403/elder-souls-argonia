import { describe, expect, it, vi } from "vitest";
import { WaterData, type WaterMeta } from "./waterData";
import { WaterWorld } from "./waterWorld";

function fixture(nativeRibbon = false) {
  const size = 4;
  const meta: WaterMeta = {
    ribbons: nativeRibbon ? [{ id: "water-ribbon.test.native-bed", bodyIndex: 1, riverBand: 1,
      points: [{ x: 2, y: 10, z: 0, halfWidthM: 0.5, groundM: 8.5 },
        { x: 2, y: 10, z: 6, halfWidthM: 0.5, groundM: 8.5 }] }] : undefined,
    bodies: [{ index: 1, id: "water.test.west" }, { index: 2, id: "water.test.east" }],
    surface: { size, metresPerPixel: 2, gridOriginM: 0, file: "", minM: 0, maxM: 20, buryM: 3 },
    flow: { size, metresPerPixel: 2, gridOriginM: 0, file: "", flowMax: 3, shoreMaxM: 160 },
    klass: { size, metresPerPixel: 2, gridOriginM: 0, file: "", classes: ["none", "coast"] },
  };
  const height = new Float32Array(size * size);
  const depth = new Float32Array(size * size);
  const season = new Float32Array(size * size);
  const flow = new Uint8ClampedArray(size * size * 4);
  const klass = new Uint8ClampedArray(size * size * 4);
  const support = new Uint8ClampedArray(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x;
    height[i] = 5 + x * 0.3 + z * 0.2;
    depth[i] = x - 0.4;
    season[i] = z / 3;
    klass[i * 4] = 1;
    klass[i * 4 + 2] = x * 50;
    support[i * 4] = z === 0 ? 0 : 255;
    support[i * 4 + 2] = x < 2 ? 1 : 2;
  }
  return new WaterData(meta, height, depth, flow, klass, undefined, season, support);
}

describe("water boundary integration", () => {
  it("preserves supported body, signed depth and continuous tide/season registration on the fast path", () => {
    const data = fixture();
    for (let x = -1; x < 10; x += 0.37) for (let z = -1; z < 10; z += 0.41) {
      const full = data.sample(x, z);
      const boundary = data.boundaryAt(x, z);
      expect(boundary.surfaceBase).toBeCloseTo(full.surfaceBase, 8);
      expect(boundary.depthProxy).toBeCloseTo(full.depthProxy, 8);
      expect(boundary.tideResponse).toBeCloseTo(full.tideResponse, 8);
      expect(boundary.seasonResponse).toBeCloseTo(full.seasonResponse, 8);
      expect(boundary.supported).toBe(full.supported);
      expect(boundary.waterBodyId).toBe(full.waterBodyId);
    }
  });

  it("does not call the full flow/chemistry/wave sampler while refreshing masks", () => {
    const data = fixture();
    const full = vi.spyOn(data, "sample").mockImplementation(() => { throw new Error("expensive path called"); });
    const world = new WaterWorld(data, { tidalAmplitudeM: 0.5, seasonalAmplitudeM: 1.4, seasonScalar: () => 0 });
    expect(world.sampleBoundary(2, 4, 0).surfaceHeight).toBeGreaterThan(0);
    expect(full).not.toHaveBeenCalled();
  });

  it("uses the ribbon's native bed rather than an unrelated reduced-raster depth", () => {
    const boundary = fixture(true).boundaryAt(2, 4);
    expect(boundary.surfaceBase).toBe(10);
    expect(boundary.depthProxy).toBeCloseTo(1.5);
    expect(boundary.waterBodyId).toBe("water.test.west");
  });

  it("reuses lunar levels within an epoch but immediately observes a pinned season change", () => {
    let season = 0;
    const world = new WaterWorld(fixture(), { tidalAmplitudeM: 0.5, seasonalAmplitudeM: 1.4, seasonScalar: () => season });
    const start = world.levelOffsets(23);
    expect(world.levelOffsets(23)).toBe(start);
    season = 1;
    const wet = world.levelOffsets(23);
    expect(wet).not.toBe(start);
    expect(wet.tide).toBe(start.tide);
    expect(wet.season).toBe(1.4);
    expect(world.levelOffsets(23)).toBe(wet);
    const later = world.levelOffsets(120);
    expect(later).not.toBe(wet);
    expect(later.tide).not.toBe(wet.tide);
  });
});
