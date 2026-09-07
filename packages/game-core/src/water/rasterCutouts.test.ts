import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import { RasterCutouts, validateRasterCutoutMeta, type RasterCutoutDescriptor } from './rasterCutouts';
import { fetchRasterCutouts } from './rasterCutoutLoader';
import type { WaterMeta } from './waterData';

function fixture() {
  const bytes = new Uint8Array(56), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('ESWCUT01'));
  for (const [offset, value] of [[8, 1], [12, 2], [16, 17], [20, 1], [48, 18], [52, 0]]) view.setUint32(offset, value, true);
  [4, 4, 4, 8, 8, 4].forEach((value, i) => view.setFloat32(24 + i * 4, value, true));
  const compressed = gzipSync(bytes), hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
  const meta: RasterCutoutDescriptor = { schemaVersion: 1, file: 'water-cutouts.bin.gz', compression: 'gzip', complete: true,
    bytes: bytes.length, downloadBytes: compressed.length, sha256: hash(bytes), sourceRibbonsSha256: hash('[]'),
    surfaceOriginM: 0.5, classGrid: { size: 65, metresPerPixel: 1, gridOriginM: 0.5 },
    gridSize: 65, metresPerPixel: 1, tileCells: 64, steps: [4, 8, 16], cells: 2, triangles: 1 };
  return { bytes, compressed, meta };
}
afterEach(() => vi.unstubAllGlobals());

it('distinguishes an untouched cell, a fully removed cell, and a prepared triangle', () => {
  const { meta, bytes } = fixture(), cutouts = new RasterCutouts(meta, bytes.buffer);
  expect(cutouts.triangles(0, 0, 4, 1, 1)).toEqual(new Float32Array([4, 4, 4, 8, 8, 4]));
  expect(cutouts.triangles(0, 0, 4, 1, 2)).toHaveLength(0);
  expect(cutouts.triangles(0, 0, 4, 1, 3)).toBeUndefined();
  expect(cutouts.triangles(0, 0, 1, 1, 1)).toBeUndefined();
  expect(cutouts.byteLength).toBe(56);
});

it('rejects incomplete exports, corrupt addresses, bounds and winding', () => {
  const { meta } = fixture();
  for (const change of [{ complete: false }, { bytes: 128 * 1024 ** 2 + 4 }, { steps: [8, 4, 16] }, { cells: 3 }])
    expect(() => validateRasterCutoutMeta({ ...meta, ...change })).toThrow();
  for (const change of [(v: DataView) => v.setUint32(48, 17, true), (v: DataView) => v.setFloat32(24, 100, true),
    (v: DataView) => v.setFloat32(36, 0, true), (v: DataView) => v.setUint32(20, 100, true)]) {
    const { bytes } = fixture(); change(new DataView(bytes.buffer));
    expect(() => new RasterCutouts(meta, bytes.buffer)).toThrow();
  }
});

it('validates source records and compressed data before publishing cutouts', async () => {
  const { meta, compressed } = fixture();
  vi.stubGlobal('crypto', webcrypto);
  const fetcher = vi.fn(async () => new Response(compressed)); vi.stubGlobal('fetch', fetcher);
  const water = { surface: { size: 65, metresPerPixel: 1 }, klass: { size: 65, metresPerPixel: 1 }, ribbons: [], rasterCutouts: meta } as unknown as WaterMeta;
  expect((await fetchRasterCutouts('/province/', water, new AbortController().signal))?.byteLength).toBe(56);
  await expect(fetchRasterCutouts('/province/', { ...water, rasterCutouts: { ...meta, sourceRibbonsSha256: '0'.repeat(64) } }, new AbortController().signal)).rejects.toThrow('channel records');
  await expect(fetchRasterCutouts('/province/', { ...water, rasterCutouts: { ...meta, metresPerPixel: 2 } }, new AbortController().signal)).rejects.toThrow('grid');
  await expect(fetchRasterCutouts('/province/', { ...water, rasterCutouts: { ...meta, sha256: '0'.repeat(64) } }, new AbortController().signal)).rejects.toThrow('integrity mismatch');
  for (const change of [{ surfaceOriginM: 0 }, { classGrid: { ...meta.classGrid, gridOriginM: 0 } },
    { classGrid: { ...meta.classGrid, size: 129 } }, { classGrid: { ...meta.classGrid, metresPerPixel: 2 } }])
    await expect(fetchRasterCutouts('/province/', { ...water, rasterCutouts: { ...meta, ...change } }, new AbortController().signal)).rejects.toThrow('grid');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
