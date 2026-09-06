import { describe, expect, it } from "vitest";
import { WaterData, type WaterMeta } from "./waterData";
import { WaterWorld } from "./waterWorld";

function fixture(nativeChannelCoverage = true) {
  const meta: WaterMeta = { schemaVersion: 2,
    surface: { file: '', size: 2, metresPerPixel: 1, gridOriginM: 0, minM: 0, maxM: 1,
      buryM: 3, nativeChannelCoverage, accessFile: 'water-access.png', accessMinOffsetM: -2, accessSpanM: 4 },
    flow: { file: '', size: 2, metresPerPixel: 1, gridOriginM: 0, flowMax: 3, shoreMaxM: 160 },
    klass: { file: '', size: 2, metresPerPixel: 1, gridOriginM: 0, classes: ['none', 'coast', 'estuary', 'river', 'lake'] },
    bodies: [{ index: 1, id: 'water.left' }, { index: 2, id: 'water.right' }] };
  const support = new Uint8ClampedArray([255, 0, 1, 255, 255, 0, 2, 255, 255, 0, 1, 255, 255, 0, 2, 255]);
  const access = new Uint8ClampedArray([96, 0, 0, 255, 255, 255, 255, 255, 96, 0, 0, 255, 255, 255, 255, 255]);
  const season = new Float32Array([1, 0, 1, 0]);
  const surface = new Float32Array(4), depth = new Float32Array(4).fill(2);
  const create = () => new WaterData(meta, surface, depth,
    new Uint8ClampedArray(16).fill(128), new Uint8ClampedArray([4, 0, 0, 255, 4, 0, 0, 255, 4, 0, 0, 255, 4, 0, 0, 255]),
    undefined, season, support, undefined, undefined, access);
  return { meta, support, access, surface, depth, create };
}

describe('native channel ownership and fine hydraulic access', () => {
  it('keeps unequal neighbouring standing heads flat instead of inventing an intermediate ramp', () => {
    const f = fixture();
    // A connected drainage basin may contain several distinct pool heads.
    f.meta.bodies = [{ index: 1, id: 'water.left', basinIndex: 42 }, { index: 2, id: 'water.right', basinIndex: 42 }];
    f.surface.set([10, 40, 10, 40]); f.depth.set([0.02, 8, 0.02, 8]);
    const data = f.create();
    for (const x of [0, 0.1, 0.49, 0.5, 0.51, 0.9, 1]) {
      const head = x < 0.5 ? 10 : 40, depth = x < 0.5 ? 0.02 : 8;
      expect(data.surfaceBase(x, 0.5)).toBeCloseTo(head, 10);
      expect(data.depthProxy(x, 0.5)).toBeCloseTo(depth, 7);
      expect(data.sample(x, 0.5).surfaceBase).toBeCloseTo(head, 10);
      expect(data.sample(x, 0.5).waterBodyId).toBe(x < 0.5 ? 'water.left' : 'water.right');
      expect(data.boundaryAt(x, 0.5).surfaceBase).toBeCloseTo(head, 10);
      expect(data.boundaryAt(x, 0.5).depthProxy).toBeCloseTo(depth, 7);
    }
    f.meta.surface.nativeChannelCoverage = false;
    expect(f.create().surfaceBase(0.5, 0.5)).toBe(25);
  });

  it('interpolates signed shallow depth through its own dry fringe, not a different head', () => {
    const f = fixture();
    f.surface.fill(10); f.depth.set([0.02, -0.02, 0.02, -0.02]);
    for (const index of [1, 3]) { f.support[index * 4] = 0; f.support[index * 4 + 2] = 1; }
    const data = f.create();
    for (const x of [0.1, 0.49, 0.5, 0.51, 0.9]) {
      expect(data.surfaceBase(x, 0.5)).toBeCloseTo(10, 10);
      expect(data.depthProxy(x, 0.5)).toBeCloseTo(0.02 - 0.04 * x, 8);
      expect(data.boundaryAt(x, 0.5).supported).toBe(x < 0.5);
    }
  });

  it('keeps authored channel stages level across a raster ownership boundary', () => {
    const f = fixture();
    f.meta.ribbons = [{ id: 'native', bodyIndex: 1, riverBand: 1,
      points: [0, 1].map(z => ({ x: 0.5, y: 0, z, halfWidthM: 0.5, groundM: -1,
        tideResponse: 0.25, seasonResponse: 0.75 })) }];
    const data = f.create(), mesh = data.ribbons.meshDataFor(f.meta.ribbons);
    for (const x of [0.1, 0.49, 0.51, 0.9]) {
      expect(data.sample(x, 0.5)).toMatchObject({ tideResponse: 0.25, seasonResponse: 0.75 });
      expect(data.boundaryAt(x, 0.5)).toMatchObject({ tideResponse: 0.25, seasonResponse: 0.75 });
    }
    for (let i = 0; i < mesh.levelResponses.length; i += 3) {
      expect(Array.from(mesh.levelResponses.slice(i, i + 3))).toEqual([0.25, 0.75, 1]);
    }
  });

  it('keeps accessible standing raster water and does not interpolate another owner\'s barrier or responses', () => {
    const { create } = fixture(), data = create();
    const left = data.sample(0.49, 0.5), right = data.sample(0.51, 0.5);
    expect(left).toMatchObject({ supported: true, waterBodyId: 'water.left', tideResponse: 0, seasonResponse: 1 });
    expect(left.floodAccessOffsetM).toBeCloseTo(-0.5, 4);
    expect(right).toMatchObject({ tideResponse: 1, seasonResponse: 0 });
    expect(right.floodAccessOffsetM).toBeCloseTo(2, 12);
    const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 1.4, seasonScalar: () => 0 });
    expect(world.sampleBoundary(0.49, 0.5, 0).waterBodyId).toBe('water.left');
    expect(world.sampleBoundary(0.51, 0.5, 0).waterBodyId).toBeNull();
    expect(world.sample({ x: 0.51, y: -1, z: 0.5 }, 0).waterBodyId).toBeNull();
  });

  it('includes same-owner dry fringe in fine response interpolation rather than pinning it to zero', () => {
    const f = fixture();
    for (const i of [1, 3]) { f.support[i * 4] = 0; f.support[i * 4 + 2] = 1; }
    const data = f.create(), s = data.sample(0.4, 0.5), b = data.boundaryAt(0.4, 0.5);
    expect(s.tideResponse).toBeCloseTo(0.4);
    expect(s.seasonResponse).toBeCloseTo(0.6);
    expect(b.tideResponse).toBeCloseTo(s.tideResponse);
    expect(b.seasonResponse).toBeCloseTo(s.seasonResponse);
    expect(b.floodAccessOffsetM).toBeCloseTo(s.floodAccessOffsetM!);
    expect(data.sample(1, 1)).toMatchObject({ tideResponse: 1, seasonResponse: 0 });
    expect(data.boundaryAt(1, 1)).toMatchObject({ tideResponse: 1, seasonResponse: 0 });
  });

  it('never revives a native-owned dry gap from positive proxy depth, but keeps its real ribbon wet', () => {
    const f = fixture();
    for (let i = 0; i < 4; i++) { f.support[i * 4] = 128; f.support[i * 4 + 2] = 1; }
    f.meta.ribbons = [{ id: 'water-ribbon.test.native', bodyIndex: 1, riverBand: 1,
      points: [0, 1].map(z => ({ x: 0.2, y: 0, z, halfWidthM: 0.1, groundM: -1 })) }];
    const data = f.create();
    expect(data.sample(0.2, 0.5).supported).toBe(true);
    expect(data.boundaryAt(0.2, 0.5, undefined, false).supported).toBe(false);
    expect(data.sample(0.8, 0.5)).toMatchObject({ supported: false, waterBodyId: null, depthProxy: 2 });
    const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 1.4, seasonScalar: () => 1 });
    expect(world.sample({ x: 0.2, y: -1, z: 0.5 }, 0).waterBodyId).toBe('water.left');
    expect(world.sample({ x: 0.8, y: -1, z: 0.5 }, 0).waterBodyId).toBeNull();
    expect(world.sampleBoundary(0.8, 0.5, 0).waterBodyId).toBeNull();
  });
});
