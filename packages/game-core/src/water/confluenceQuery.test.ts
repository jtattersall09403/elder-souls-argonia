import { describe, expect, it } from 'vitest';
import { ChannelRibbonSampler, type ChannelRibbonPoint, type ChannelRibbonRecord } from './channelRibbons';
import { WaterData, type WaterMeta } from './waterData';
import { WaterWorld } from './waterWorld';

function branches(): ChannelRibbonRecord[] {
  const point = (x: number, y: number, z: number, island = false): ChannelRibbonPoint => {
    const samples = island ? [[-2, -1], [0, -1], [.8, -1], [1, .1], [1.2, -1], [2, -1]] : [[-2, -1], [0, -1], [2, -1]];
    return { x, y, z, halfWidthM: 2, groundM: -1, tideResponse: 0, seasonResponse: 1,
      crossSection: samples.map(([offsetM, groundM]) => ({ offsetM, groundM,
        accessOffsetM: Math.max(...samples.filter(([o]) => offsetM >= 0 ? o >= 0 && o <= offsetM : o <= 0 && o >= offsetM).map(([, g]) => g)) - y })) };
  };
  return [
    { id: 'west', bodyIndex: 1, riverBand: 2, points: [point(6, .02, 10, true), point(9.75, .002, 10, true), point(10, 0, 10)] },
    { id: 'south', bodyIndex: 1, riverBand: 2, points: [point(10, 0, 10), point(10, 0, 12), point(10, 0, 14)] },
    { id: 'east', bodyIndex: 1, riverBand: 2, points: [point(14, .02, 10), point(10, 0, 10)] },
  ];
}

describe('branched confluence physical surface selection', () => {
  it('selects the actual wet rendered face below an access-blocked higher branch', () => {
    const records = branches();
    for (const ordered of [records, [...records].reverse()]) {
      const sampler = new ChannelRibbonSampler(ordered);
      expect(sampler.sample(9.5, 11.8)?.ribbonId).toBe('west'); // Static base query remains unchanged.
      const physical = sampler.sample(9.5, 11.8, { stage: { tide: 0, season: 0, groundHeight: -1 } })!;
      expect(physical.ribbonId).toBe('south');
      expect(physical.height).toBe(0);
      expect(physical.flowX).toBe(0);
      expect(physical.flowZ).toBeGreaterThan(0);
      // Independently interpolate exported faces and apply fragment gates.
      const mesh = sampler.meshDataFor(ordered, { refineGround: false });
      const visible: number[] = [];
      for (let i = 0; i < mesh.positions.length; i += 9) {
        const a = mesh.positions.subarray(i, i + 3), b = mesh.positions.subarray(i + 3, i + 6), c = mesh.positions.subarray(i + 6, i + 9);
        const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        const u = ((b[2] - c[2]) * (9.5 - c[0]) + (c[0] - b[0]) * (11.8 - c[2])) / d;
        const v = ((c[2] - a[2]) * (9.5 - c[0]) + (a[0] - c[0]) * (11.8 - c[2])) / d, w = 1 - u - v;
        if (Math.min(u, v, w) < -1e-7) continue;
        const j = i / 3, access = u * mesh.floodAccessOffsets[j] + v * mesh.floodAccessOffsets[j + 1] + w * mesh.floodAccessOffsets[j + 2];
        const head = u * a[1] + v * b[1] + w * c[1];
        if (access <= .001 && head + 1 > .004) visible.push(head);
      }
      expect(visible.length).toBeGreaterThan(0);
      expect(physical.height).toBeCloseTo(Math.max(...visible), 8);
      expect(sampler.sample(9.5, 11.8, { stage: { tide: 0, season: .2 } })?.ribbonId).toBe('west');
    }
  });

  it('ranks wet overlaps by their current level without blending different owners', () => {
    const records = branches();
    records[0].bodyIndex = 2;
    records[0].points = records[0].points.map(p => ({ ...p, seasonResponse: p.x === 10 ? 1 : 0,
      crossSection: p.crossSection!.map(s => ({ ...s, groundM: -1, accessOffsetM: -1 })) }));
    const sampler = new ChannelRibbonSampler(records);
    expect(sampler.sample(9.5, 11.8, { stage: { tide: 0, season: 0 } })?.bodyIndex).toBe(2);
    const flooded = sampler.sample(9.5, 11.8, { stage: { tide: 0, season: .1 } })!;
    expect(flooded.bodyIndex).toBe(1);
    expect(flooded.height).toBe(0);
    expect(flooded.seasonResponse).toBe(1);
  });

  it('keeps an entirely dry confluence dry and retains its access diagnostic', () => {
    const sampler = new ChannelRibbonSampler(branches());
    const dry = sampler.sample(9.5, 11.8, { stage: { tide: 0, season: -2 } })!;
    expect(dry.ribbonId).toBe('west');
    expect(dry.floodAccessOffsetM).toBeGreaterThan(.09);
  });

  it('applies the fine-grid access fallback before ranking legacy and explicit candidates', () => {
    const records = branches();
    records[0].points = records[0].points.map(p => ({ ...p, groundM: undefined, crossSection: undefined }));
    const sampler = new ChannelRibbonSampler(records);
    const stage = { tide: 0, season: 0, groundHeight: -1, fallbackAccessOffsetM: .2 };
    expect(sampler.sample(9.5, 11.8, { stage })?.ribbonId).toBe('south');
    expect(sampler.sample(9.5, 11.8, { stage: { ...stage, season: .3 } })?.ribbonId).toBe('west');
  });

  it('threads the same selection through full, boundary, and still-level World queries', () => {
    const meta: WaterMeta = {
      surface: { file: '', size: 2, metresPerPixel: 20, gridOriginM: 0, minM: 0, maxM: 20, buryM: 3, nativeChannelCoverage: true },
      flow: { file: '', size: 2, metresPerPixel: 20, flowMax: 3, shoreMaxM: 160 },
      klass: { file: '', size: 2, metresPerPixel: 20, classes: ['none', 'coast', 'estuary', 'river'] },
      ribbons: branches(), bodies: [{ index: 1, id: 'water.test.confluence' }],
    };
    const support = new Uint8ClampedArray(16);
    for (let i = 0; i < 16; i += 4) { support[i] = 128; support[i + 2] = 1; }
    const data = new WaterData(meta, new Float32Array(4), new Float32Array(4).fill(1),
      new Uint8ClampedArray(16).fill(128), new Uint8ClampedArray(16), new Float32Array(4), undefined, support);
    let season = 0;
    const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 10, seasonScalar: () => season,
      groundHeight: () => -1, waveTimeS: () => 0 });
    expect(world.sample({ x: 9.5, y: -.5, z: 11.8 }, 0).waterBodyId).toBe('water.test.confluence');
    expect(world.sampleBoundary(9.5, 11.8, 0)).toMatchObject({ waterBodyId: 'water.test.confluence', surfaceHeight: 0, depth: 1, flowX: 0 });
    expect(world.stillSurfaceAt(9.5, 11.8, 0)).toBe(0);
    const legacyMeta = { ...meta, surface: { ...meta.surface, accessMinOffsetM: 0, accessSpanM: 1 },
      ribbons: meta.ribbons!.map((r, i) => i ? r : { ...r, points: r.points.map(p => ({ ...p, groundM: undefined, crossSection: undefined })) }) };
    const access = new Uint8ClampedArray(16);
    for (let i = 0; i < 16; i += 4) { access[i] = 51; access[i + 1] = 51; }
    const legacyData = new WaterData(legacyMeta, new Float32Array(4), new Float32Array(4).fill(1),
      new Uint8ClampedArray(16).fill(128), new Uint8ClampedArray(16), new Float32Array(4), undefined, support, undefined, undefined, access);
    const legacyWorld = new WaterWorld(legacyData, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0, groundHeight: () => -1 });
    expect(legacyWorld.sampleBoundary(9.5, 11.8, 0)).toMatchObject({ surfaceHeight: 0, depth: 1, flowX: 0 });
    expect(legacyWorld.sample({ x: 9.5, y: -.5, z: 11.8 }, 0).flowVelocity.x).toBe(0);

    // Native-owned footprints intentionally suppress the raster beneath
    // them. A genuine standing owner outside those footprints stays wet.
    const poolSupport = support.slice();
    for (let i = 0; i < 16; i += 4) { poolSupport[i] = 255; poolSupport[i + 2] = 2; }
    const poolData = new WaterData({ ...meta, bodies: [...meta.bodies!, { index: 2, id: 'water.test.pool' }] },
      new Float32Array(4), new Float32Array(4).fill(1), new Uint8ClampedArray(16).fill(128),
      new Uint8ClampedArray(16), new Float32Array(4), undefined, poolSupport);
    const poolWorld = new WaterWorld(poolData, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0, groundHeight: () => -1 });
    expect(poolWorld.sampleBoundary(18, 18, 0).waterBodyId).toBe('water.test.pool');
    season = -1;
    expect(world.sample({ x: 9.5, y: -.5, z: 11.8 }, 0).waterBodyId).toBeNull();
    expect(world.sampleBoundary(9.5, 11.8, 0).waterBodyId).toBeNull();
  });
});
