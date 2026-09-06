import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackedCrossSections, fetchPackedCrossSections, type PackedCrossSectionMeta } from './packedCrossSections';
import { ChannelRibbonSampler, type ChannelRibbonRecord } from './channelRibbons';

const descriptor = (sampleCount: number): PackedCrossSectionMeta => ({ schemaVersion: 1,
  file: 'water-cross-sections.bin', encoding: 'float32-le-offset-ground-access', sampleCount });
function fixture(stations = 4, perStation = 3) {
  const values = new Float32Array(stations * perStation * 3);
  const points = Array.from({ length: stations }, (_, i) => {
    const y = 10 - i * 0.1;
    for (let j = 0; j < perStation; j++) {
      const offset = j - Math.floor(perStation / 2), k = (i * perStation + j) * 3;
      values[k] = offset; values[k + 1] = y - 1; values[k + 2] = -1;
    }
    return { x: 10, y, z: i * 2, halfWidthM: 1, groundM: y - 1,
      crossSectionStart: i * perStation, crossSectionCount: perStation };
  });
  const records: ChannelRibbonRecord[] = [{ id: 'channel', bodyIndex: 1, riverBand: 1, points }];
  return { meta: descriptor(stations * perStation), records, values };
}
afterEach(() => vi.unstubAllGlobals());

describe('bounded packed native cross sections', () => {
  it('shares one typed buffer, installs non-enumerable lazy views and preserves exact geometry/current', () => {
    const f = fixture(), before = JSON.stringify(f.records);
    const store = new PackedCrossSections(f.meta, f.values.buffer, f.records);
    expect(store.values.buffer).toBe(f.values.buffer);
    expect(store.cacheStats).toMatchObject({ builds: 0, stations: 0, samples: 0 });
    expect(JSON.stringify(f.records)).toBe(before);
    expect(f.records[0].points[0].crossSectionMinOffsetM).toBe(-1);
    const first = f.records[0].points[0].crossSection!;
    expect(first).toEqual([{ offsetM: -1, groundM: 9, accessOffsetM: -1 }, { offsetM: 0, groundM: 9, accessOffsetM: -1 }, { offsetM: 1, groundM: 9, accessOffsetM: -1 }]);
    expect(f.records[0].points[0].crossSection).toBe(first);
    const inline = f.records.map(r => ({ ...r, points: r.points.map(p => ({ ...p, crossSection: p.crossSection })) }));
    expect(new ChannelRibbonSampler(f.records).meshDataFor(f.records)).toEqual(new ChannelRibbonSampler(inline).meshDataFor(inline));
    expect(JSON.stringify(f.records)).toBe(before);
  });

  it('bounds decoded station and sample residency while revisiting distant regions exactly', () => {
    const f = fixture(400, 101), store = new PackedCrossSections(f.meta, f.values.buffer, f.records);
    const original = f.records[0].points[0].crossSection!;
    for (const point of f.records[0].points) {
      expect(point.crossSection).toHaveLength(101);
      expect(store.cacheStats.stations).toBeLessThanOrEqual(256);
      expect(store.cacheStats.samples).toBeLessThanOrEqual(16384);
    }
    expect(f.records[0].points[0].crossSection).toEqual(original);
    expect(f.records[0].points[0].crossSection).not.toBe(original);
    expect(store.cacheStats.builds).toBe(401);
  });

  it('rejects invalid sizes, offsets, barriers and ranges before installing any accessors', () => {
    const broken = (mutate: (f: ReturnType<typeof fixture>) => void) => {
      const f = fixture(); mutate(f);
      expect(() => new PackedCrossSections(f.meta, f.values.buffer, f.records)).toThrow();
      expect(Object.getOwnPropertyDescriptor(f.records[0].points[0], 'crossSection')).toBeUndefined();
    };
    broken(f => { f.meta.schemaVersion = 2 as 1; });
    broken(f => { f.meta.sampleCount++; });
    broken(f => { f.records[0].points[3].crossSectionStart = 0; });
    broken(f => { f.values[3] = f.values[0]; });
    broken(f => { f.values[1] = NaN; });
    broken(f => { f.values[2] = -2; });
    broken(f => { f.values[3] = 0.1; });
    broken(f => { f.meta.file = '../escape.bin'; });
  });

  it('checks binary content hash and byte length before exposing corrupt or stale cached geometry', async () => {
    const f = fixture(), hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', f.values.buffer)), n => n.toString(16).padStart(2, '0')).join('');
    f.meta.sha256 = hash;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(f.values.buffer.slice(0))));
    const signal = new AbortController().signal;
    expect((await fetchPackedCrossSections('/water/', f.meta, signal)).byteLength).toBe(f.values.byteLength);
    f.meta.sha256 = '0'.repeat(64);
    await expect(fetchPackedCrossSections('/water/', f.meta, signal)).rejects.toThrow('checksum');
    f.meta.sampleCount++;
    await expect(fetchPackedCrossSections('/water/', f.meta, signal)).rejects.toThrow('byte length');
  });
});
