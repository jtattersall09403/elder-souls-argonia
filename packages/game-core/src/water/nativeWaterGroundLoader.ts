import { fetchWaterBinary } from './fetchWaterBinary';
import { NativeWaterGround, type NativeWaterGroundDescriptor } from './nativeWaterGround';

const MAX_BYTES = 128 * 1024 ** 2;
export function validateNativeWaterGroundMeta(value: unknown): asserts value is NativeWaterGroundDescriptor {
  const meta = value as Partial<NativeWaterGroundDescriptor> | null;
  const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (!meta || meta.compression !== 'gzip' || typeof meta.file !== 'string'
    || !/^[a-zA-Z0-9_-]+\.bin\.gz$/.test(meta.file)
    || !Number.isSafeInteger(meta.bytes) || meta.bytes! < 48 || meta.bytes! > MAX_BYTES || meta.bytes! % 4
    || !Number.isSafeInteger(meta.downloadBytes) || meta.downloadBytes! < 1 || meta.downloadBytes! > MAX_BYTES
    || ![meta.sha256, meta.nativeManifestSha256, meta.bedOverlaySha256, meta.topologySha256].every(hash)) {
    throw new Error('Invalid native water ground descriptor, source hashes or byte budget');
  }
}

export async function fetchNativeWaterGround(baseUrl: string, meta: NativeWaterGroundDescriptor, signal: AbortSignal): Promise<NativeWaterGround> {
  validateNativeWaterGroundMeta(meta);
  return new NativeWaterGround(await fetchWaterBinary(baseUrl, meta, signal));
}
