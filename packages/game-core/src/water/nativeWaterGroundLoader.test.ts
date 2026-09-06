import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNativeWaterGround, validateNativeWaterGroundMeta } from './nativeWaterGroundLoader';
import type { NativeWaterGroundDescriptor } from './nativeWaterGround';

function fixture() {
  const bytes = new Uint8Array(68), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('ESWGRND1'));
  for (const [offset, value] of [[8, 1], [12, 2], [16, 1], [20, 1], [40, 1]]) view.setUint32(offset, value, true);
  view.setFloat64(32, 1, true);
  for (let i = 0; i < 4; i++) view.setFloat32(52 + i * 4, i, true);
  const compressed = gzipSync(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const meta: NativeWaterGroundDescriptor = { file: 'water-native-ground.bin.gz', compression: 'gzip',
    bytes: bytes.length, downloadBytes: compressed.length, sha256,
    nativeManifestSha256: sha256, bedOverlaySha256: sha256, topologySha256: sha256 };
  return { bytes, compressed, meta };
}
afterEach(() => vi.unstubAllGlobals());
describe('native terrain water bundle loader', () => {
  it('checks bounded descriptors before any allocation or request', () => {
    const { meta } = fixture();
    expect(() => validateNativeWaterGroundMeta(meta)).not.toThrow();
    for (const change of [{ bytes: 128 * 1024 ** 2 + 4 }, { downloadBytes: 0 }, { file: '../terrain.bin.gz' },
      { nativeManifestSha256: 'unversioned' }, { compression: 'unknown' }, { bytes: 51 }]) {
      expect(() => validateNativeWaterGroundMeta({ ...meta, ...change })).toThrow();
    }
  });
  it('decodes a verified ground authority and rejects hash, download and inflation mismatches', async () => {
    const { meta, compressed } = fixture();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(compressed)));
    const ground = await fetchNativeWaterGround('/', meta, new AbortController().signal);
    expect(ground.sample(0.25, 0.25)).toBeCloseTo(0.75);
    for (const change of [{ sha256: '0'.repeat(64) }, { downloadBytes: compressed.length - 1 },
      { downloadBytes: compressed.length + 1 }, { bytes: meta.bytes - 4 }, { bytes: meta.bytes + 4 }]) {
      await expect(fetchNativeWaterGround('/', { ...meta, ...change }, new AbortController().signal)).rejects.toThrow();
    }
  });
  it('never publishes a provider after cancellation', async () => {
    const { meta, compressed } = fixture(), controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => { controller.abort(); return new Response(compressed); }));
    await expect(fetchNativeWaterGround('/', meta, controller.signal)).rejects.toThrow();
  });
});
