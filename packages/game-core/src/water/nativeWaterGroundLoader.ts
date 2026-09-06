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

/** Reject compressed bombs/truncated downloads before publishing a provider.
 * One bounded destination avoids retaining an unbounded list of stream chunks. */
async function exactBytes(stream: ReadableStream<Uint8Array>, count: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(count), reader = stream.getReader();
  let offset = 0, failure: unknown;
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (offset + value.byteLength > count) throw new Error('Native water ground exceeds declared byte length');
      bytes.set(value, offset); offset += value.byteLength;
    }
    if (offset !== count) throw new Error('Native water ground is truncated');
    return bytes;
  } catch (error) { failure = error; throw error; }
  finally {
    signal.removeEventListener('abort', cancel);
    if (failure) await reader.cancel(failure).catch(() => {});
    reader.releaseLock();
  }
}

export async function fetchNativeWaterGround(baseUrl: string, meta: NativeWaterGroundDescriptor, signal: AbortSignal): Promise<NativeWaterGround> {
  validateNativeWaterGroundMeta(meta);
  const response = await fetch(`${baseUrl}${meta.file}`, { signal });
  if (!response.ok || !response.body) throw new Error(`Native water ground HTTP ${response.status}`);
  const compressed = await exactBytes(response.body, meta.downloadBytes, signal);
  const inflated = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const bytes = await exactBytes(inflated, meta.bytes, signal);
  if (!globalThis.crypto?.subtle) throw new Error('Native water ground integrity requires a secure browser context');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  signal.throwIfAborted();
  if (hash !== meta.sha256) throw new Error('Native water ground integrity mismatch');
  return new NativeWaterGround(bytes.buffer);
}
