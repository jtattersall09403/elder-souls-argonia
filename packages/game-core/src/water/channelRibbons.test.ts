import { describe, expect, it } from 'vitest';
import { buildChannelRibbonMeshData, ChannelRibbonSampler, type ChannelRibbonRecord } from './channelRibbons';
import { WaterData, type WaterMeta } from './waterData';
import { WaterWorld } from './waterWorld';

function river(): ChannelRibbonRecord {
  return { id: 'water-ribbon.test.slope', bodyIndex: 17, riverBand: 2, points: [
    { x: 10, y: 8, z: 0, halfWidthM: 2 },
    { x: 10, y: 6, z: 10, halfWidthM: 2 },
    { x: 10, y: 4, z: 20, halfWidthM: 2 },
  ] };
}

describe('compiled channel ribbons', () => {
  it('interpolates actual native bed and selects the visible plane at overlapping junctions', () => {
    const low = river();
    low.points = low.points.map(p => ({ ...p, groundM: p.y - 0.4 }));
    const high = river();
    high.points = high.points.map(p => ({ ...p, y: p.y + 0.2, groundM: p.y - 0.3 }));
    for (const records of [[low, high], [high, low]]) {
      const water = new ChannelRibbonSampler(records).sample(10, 5);
      expect(water?.height).toBeCloseTo(7.2);
      expect(water?.groundHeight).toBeCloseTo(6.7);
      expect(Array.from(buildChannelRibbonMeshData(records).groundHeights).every(Number.isFinite)).toBe(true);
    }
  });
  it('descends continuously, stays level across its width and drives current downhill', () => {
    const sample = new ChannelRibbonSampler([river()]);
    for (let z = 0; z <= 20; z += 0.5) {
      for (const x of [8.1, 10, 11.9]) {
        const water = sample.sample(x, z);
        expect(water?.height).toBeCloseTo(8 - z * 0.2, 8);
        expect(water?.bodyIndex).toBe(17);
        expect(water?.flowX).toBe(0);
        expect(water?.flowZ).toBeGreaterThan(0);
        expect(water?.flowY).toBeCloseTo(-0.2 * water!.flowZ, 8);
        expect(water?.surfaceNormal.y).toBeCloseTo(1 / Math.hypot(1, 0.2), 8);
        expect(water?.surfaceNormal.z).toBeCloseTo(0.2 / Math.hypot(1, 0.2), 8);
      }
    }
  });

  it('has no water outside the actual banks or beyond the end caps', () => {
    const sample = new ChannelRibbonSampler([river()]);
    for (const [x, z] of [[7.9, 10], [12.1, 10], [10, -0.1], [10, 20.1], [1000, 1000]]) {
      expect(sample.sample(x, z)).toBeNull();
    }
  });

  it('reverses old graph direction when actual levels descend the other way', () => {
    const record = river();
    record.points = [...record.points].reverse();
    const water = new ChannelRibbonSampler([record]).sample(10, 5);
    expect(water?.height).toBeCloseTo(7);
    expect(water?.flowZ).toBeGreaterThan(0);
  });

  it('samples the same triangles emitted for the renderer at a bend', () => {
    const record = river();
    record.points = [...record.points.slice(0, 2), { x: 20, y: 4, z: 20, halfWidthM: 1 }];
    const mesh = buildChannelRibbonMeshData([record]);
    const sampler = new ChannelRibbonSampler([record], 4);
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const p = mesh.positions;
      const x = (p[i] + p[i + 3] + p[i + 6]) / 3;
      const y = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
      const z = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
      expect(sampler.sample(x, z)?.height).toBeCloseTo(y, 5);
      const windingY = (p[i + 5] - p[i + 2]) * (p[i + 6] - p[i])
        - (p[i + 3] - p[i]) * (p[i + 8] - p[i + 2]);
      expect(windingY).toBeGreaterThan(0);
      const water = sampler.sample(x, z)!;
      const n = water.surfaceNormal;
      expect(n.x * (p[i + 3] - p[i]) + n.y * (p[i + 4] - p[i + 1]) + n.z * (p[i + 5] - p[i + 2])).toBeCloseTo(0, 5);
      expect(n.x * (p[i + 6] - p[i]) + n.y * (p[i + 7] - p[i + 1]) + n.z * (p[i + 8] - p[i + 2])).toBeCloseTo(0, 5);
      expect(n.x * water.flowX + n.y * water.flowY + n.z * water.flowZ).toBeCloseTo(0, 8);
      expect(Math.hypot(water.flowX, water.flowY, water.flowZ)).toBeLessThanOrEqual(3.000001);
    }
  });

  it('keeps nearby separated channels independent across bucket boundaries', () => {
    const second = river();
    second.id = 'water-ribbon.test.other';
    second.bodyIndex = 18;
    second.points = second.points.map(point => ({ ...point, x: point.x + 8, y: point.y + 30 }));
    const sampler = new ChannelRibbonSampler([river(), second], 4);
    expect(sampler.sample(10, 8)?.height).toBeCloseTo(6.4);
    expect(sampler.sample(18, 8)?.height).toBeCloseTo(36.4);
    expect(sampler.sample(14, 8)).toBeNull();
  });

  it('treats empty input as dry and preserves downstream advection through flat channel reaches', () => {
    expect(new ChannelRibbonSampler([]).sample(0, 0)).toBeNull();
    const record = river();
    record.points = record.points.map(point => ({ ...point, y: 4 }));
    const flat = new ChannelRibbonSampler([record]).sample(10, 10)!;
    expect(flat.flowZ).toBeCloseTo(0.35);
    expect(flat.flowY).toBeCloseTo(0);
    expect(new ChannelRibbonSampler([record]).sample(NaN, 1)).toBeNull();
  });

  it('shares exact Float32 planes on narrow sloping reaches far from the origin', () => {
    const record: ChannelRibbonRecord = { id: 'water-ribbon.test.far-narrow', bodyIndex: 19, riverBand: 1,
      points: [
        { x: 6893.123456, y: 83.998412, z: 6719.789123, halfWidthM: 0.011, groundM: 83.4 },
        { x: 6893.369172, y: 83.712936, z: 6720.211941, halfWidthM: 0.013, groundM: 83.1 },
        { x: 6893.534812, y: 83.421671, z: 6720.435712, halfWidthM: 0.010, groundM: 82.8 },
      ] };
    const sampler = new ChannelRibbonSampler([record]);
    const { positions: p } = buildChannelRibbonMeshData([record]);
    for (let i = 0; i < p.length; i += 9) {
      const x = (p[i] + p[i + 3] + p[i + 6]) / 3;
      const y = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
      const z = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
      expect(sampler.sample(x, z)?.height).toBeCloseTo(y, 9);
    }
  });

  it('publishes the visible ribbon normal and downhill vertical current through the gameplay query', () => {
    const record = river();
    record.points = record.points.map(p => ({ ...p, groundM: p.y - 1 }));
    const meta: WaterMeta = {
      surface: { file: '', size: 2, metresPerPixel: 20, gridOriginM: 0, minM: 0, maxM: 20, buryM: 3 },
      flow: { file: '', size: 2, metresPerPixel: 20, flowMax: 3, shoreMaxM: 160 },
      klass: { file: '', size: 2, metresPerPixel: 20, classes: ['none', 'coast', 'estuary', 'river'] },
      ribbons: [record], bodies: [{ index: 17, id: 'water.test.slope' }],
    };
    const data = new WaterData(meta, new Float32Array(4).fill(7), new Float32Array(4).fill(1),
      new Uint8ClampedArray(16).fill(128), new Uint8ClampedArray(16), new Float32Array(4));
    const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0, waveTimeS: () => 0 });
    const result = world.sample({ x: 10, y: 6.5, z: 5 }, 0);
    const geometric = data.ribbons.sample(10, 5)!;
    expect(result.surfaceHeight).toBeCloseTo(7);
    for (const axis of ['x', 'y', 'z'] as const) expect(result.surfaceNormal[axis]).toBeCloseTo(geometric.surfaceNormal[axis], 8);
    expect(result.flowVelocity.y).toBeLessThan(0);
    expect(result.flowVelocity.y).toBeCloseTo(-0.2 * result.flowVelocity.z, 8);
    const pond = new WaterData({ ...meta, ribbons: [] }, new Float32Array(4).fill(7), new Float32Array(4).fill(1),
      new Uint8ClampedArray(16).fill(128), new Uint8ClampedArray(16), new Float32Array(4));
    const stillWorld = new WaterWorld(pond, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0 });
    expect(stillWorld.sample({ x: 10, y: 6.5, z: 5 }, 0).flowVelocity).toEqual({ x: 0, y: 0, z: 0 });
  });
});
