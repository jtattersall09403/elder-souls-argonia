import { describe, expect, it } from "vitest";
import { WaterData, type WaterMeta } from "./waterData";
import { WaterWorld } from "./waterWorld";
import { gerstnerAt, gerstnerGlsl, surfaceWaveAt, waveBands, type WaveSample } from "./waves";

function supportedWater(options: { ground?: number; supported?: boolean; season?: number; classIndex?: number } = {}) {
  const size = 4;
  const meta: WaterMeta = {
    schemaVersion: 2,
    bodies: [{ index: 1, id: "water.test.lake" }],
    surface: { file: "", size, metresPerPixel: 2, gridOriginM: 0, minM: -10, maxM: 20, buryM: 3 },
    flow: { file: "", size, metresPerPixel: 2, gridOriginM: 0, flowMax: 3, shoreMaxM: 160 },
    klass: { file: "", size, metresPerPixel: 2, gridOriginM: 0, classes: ["none", "coast", "estuary", "river", "lake", "marsh"] },
  };
  const heights = new Float32Array(size * size).fill(5);
  const depths = new Float32Array(size * size).fill(2);
  const flow = new Uint8ClampedArray(size * size * 4);
  const klass = new Uint8ClampedArray(size * size * 4);
  const support = new Uint8ClampedArray(size * size * 4);
  const character = new Uint8ClampedArray(size * size * 4);
  const season = new Float32Array(size * size).fill(1);
  for (let i = 0; i < size * size; i++) {
    flow[i * 4] = flow[i * 4 + 1] = 128;
    klass[i * 4] = options.classIndex ?? 4;
    support[i * 4] = options.supported === false ? 0 : 255;
    support[i * 4 + 2] = 1;
    // Fully sheltered lake: exact static reference independent of weather globals.
    character[i * 4 + 2] = 0;
  }
  const data = new WaterData(meta, heights, depths, flow, klass, undefined, season, support, character);
  const world = new WaterWorld(data, { tidalAmplitudeM: 0.5, seasonalAmplitudeM: 1.4,
    seasonScalar: () => options.season ?? 0, groundHeight: options.ground === undefined ? undefined : () => options.ground! });
  return { data, world, heights };
}

describe("water support and query agreement", () => {
  it("keeps native supported ponds inland when the coarse semantic raster misses them", () => {
    const { data, world } = supportedWater({ classIndex: 0 });
    expect(data.rasterClassAt(2, 2)).toBe(4);
    expect(data.sample(2, 2)).toMatchObject({ supported: true, className: "lake", classIndex: 4 });
    expect(world.sample({ x: 2, y: 5, z: 2 }, 0).surfaceHeight).toBe(5);
  });
  it("samples node-aligned surface heights without shifting half a terrain cell", () => {
    const { data, heights } = supportedWater();
    for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) heights[z * 4 + x] = x * 2 + z * 5;
    expect(data.surfaceBase(2, 2)).toBe(7);
    expect(data.surfaceBase(3, 3)).toBe(10.5);
  });

  it("does not resurrect unsupported terrain when the wet season rises above it", () => {
    const { world } = supportedWater({ supported: false, ground: 1, season: 1 });
    expect(world.sample({ x: 2, y: 0, z: 2 }, 0).waterBodyId).toBeNull();
    expect(world.sampleBoundary(2, 2, 0)).toMatchObject({ waterBodyId: null, depth: 0 });
  });

  it("uses actual ground for both interactions and the inexpensive ripple boundary", () => {
    const dry = supportedWater({ ground: 6 }).world;
    const wet = supportedWater({ ground: 4 }).world;
    expect(dry.sampleBoundary(2, 2, 0).depth).toBe(0);
    expect(dry.sample({ x: 2, y: 4, z: 2 }, 0).waterBodyId).toBeNull();
    const sample = wet.sample({ x: 2, y: 4, z: 2 }, 0);
    expect(sample.waterBodyId).toBe("water.test.lake");
    expect(wet.sampleBoundary(2, 2, 0).depth).toBe(sample.depth);
    expect(wet.sampleBoundary(2, 2, 0).surfaceHeight).toBe(sample.surfaceHeight);
  });

  it("preserves seasonal range and treats the surface as zero immersion", () => {
    const drySeason = supportedWater({ season: -1 }).world;
    const wetSeason = supportedWater({ season: 1 }).world;
    const low = drySeason.sampleBoundary(2, 2, 0).surfaceHeight;
    const high = wetSeason.sampleBoundary(2, 2, 0).surfaceHeight;
    expect(low).toBeCloseTo(5 - 0.28);
    expect(high).toBeCloseTo(5 + 1.4);
    expect(wetSeason.sample({ x: 2, y: high, z: 2 }, 0).immersion).toBe(0);
    expect(wetSeason.sample({ x: 2, y: high - 1.7, z: 2 }, 0).immersion).toBeCloseTo(1);
  });
});

describe("storm-wave geometric safety", () => {
  it("bounds summed horizontal steepness at every weather strength and mirrors the GPU cap", () => {
    for (const exposure of [0.35, 1, 3, 6]) {
      const steepness = waveBands().reduce((sum, band) => sum + band.q / Math.max(1, exposure) * band.freq * band.amp * exposure, 0);
      expect(steepness).toBeLessThan(1);
    }
    expect(gerstnerGlsl()).toContain("q /= max(1.0, exposure)");
  });

  it("retains upward normals and centimetre-scale inverse agreement in a squall", () => {
    const sample: WaveSample = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 };
    const forward: WaveSample = { ...sample };
    for (let i = 0; i < 1000; i++) {
      const x = (i * 13.729) % 7400;
      const z = (i * 77.17) % 7400;
      const time = (i * 9.123) % 3600;
      surfaceWaveAt(x, z, time, 6, sample);
      gerstnerAt(x - sample.dx, z - sample.dz, time, 6, forward);
      expect(sample.ny).toBeGreaterThan(0.3);
      expect(Math.hypot(forward.dx - sample.dx, forward.dz - sample.dz)).toBeLessThan(0.025);
      expect(Math.abs(forward.height - sample.height)).toBeLessThan(0.04);
    }
  });
});
