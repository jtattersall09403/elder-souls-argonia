import { describe, expect, it } from 'vitest';
import { validateWaterBodies, type WaterBodyRecord } from './waterBodies';
import type { ChannelRibbonRecord } from './channelRibbons';
import { WaterData, type WaterMeta } from './waterData';

const classes = ['none', 'coast', 'river', 'lake'];
const body = (): WaterBodyRecord => ({ schemaVersion: 1, id: 'water.pool', index: 2, basinIndex: 1,
  bounds: { minX: 0, minZ: 0, maxX: 10, maxZ: 10 }, semanticClasses: ['lake'], riverBandRange: [0, 0],
  surface: { kind: 'standing-plane', baseHeightM: 5 }, rendererProfile: 'province-semantic-v2',
  fields: { depth: 'surface.depthProxy', flow: 'flow+ribbons', access: 'surface.access+ribbons',
    optics: 'klass+shore+character', levels: 'access+shore+ribbons', ground: 'native-terrain' } });

describe('physical water body records', () => {
  it('resolves live sample identities to their compiled records without inventing legacy records', () => {
    const grid = { size: 2, metresPerPixel: 1, file: '', gridOriginM: 0 };
    const record = body();
    const meta: WaterMeta = { bodies: [record, { index: 3, id: 'legacy' }],
      surface: { ...grid, minM: 0, maxM: 10, buryM: 3 },
      flow: { ...grid, flowMax: 3, shoreMaxM: 10 }, klass: { ...grid, classes } };
    const data = new WaterData(meta, new Float32Array(4).fill(5), new Float32Array(4).fill(2),
      new Uint8ClampedArray(16), new Uint8ClampedArray(16));
    expect(data.waterBodyRecord(data.waterBodyIdForIndex(2)!)).toBe(record);
    expect(data.waterBodyRecord('legacy')).toBeNull();
    expect(data.waterBodyRecord('absent')).toBeNull();
  });
  it('retains separate heads in one basin and supports legacy identities without invented properties', () => {
    const second = { ...body(), id: 'water.other', index: 3, surface: { kind: 'standing-plane' as const, baseHeightM: 7 } };
    expect(() => validateWaterBodies([body(), second, { id: 'legacy', index: 4 }], [], classes)).not.toThrow();
    expect(body()).not.toHaveProperty('discharge'); expect(body()).not.toHaveProperty('navigability');
  });
  it('rejects flattening a channel or pointing to another owner’s reaches', () => {
    const reaches: ChannelRibbonRecord[] = [{ id: 'reach', bodyIndex: 2, riverBand: 1, points: [] }];
    expect(() => validateWaterBodies([body()], reaches, classes)).toThrow(/constant standing head/);
    const channel = { ...body(), surface: { kind: 'channel-network', ribbonIds: ['reach'], field: 'surface' } };
    expect(() => validateWaterBodies([channel], reaches, classes)).not.toThrow();
    expect(() => validateWaterBodies([{ ...channel, index: 3 }], reaches, classes)).toThrow(/channel references/);
  });
  it('rejects unsupported schemas, duplicate identities and malformed physical bounds', () => {
    expect(() => validateWaterBodies([body(), body()], [], classes)).toThrow(/duplicate/);
    expect(() => validateWaterBodies([{ ...body(), schemaVersion: 2 }], [], classes)).toThrow(/physical/);
    expect(() => validateWaterBodies([{ ...body(), bounds: { minX: 10, maxX: 0, minZ: 0, maxZ: 1 } }], [], classes)).toThrow(/physical/);
  });
});
