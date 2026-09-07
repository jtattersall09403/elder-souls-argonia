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
      if (offset + value.byteLength > count) throw new Error('Verified water binary exceeds declared byte length');
      bytes.set(value, offset); offset += value.byteLength;
    }
    if (offset !== count) throw new Error('Verified water binary is truncated');
    return bytes;
  } catch (error) { failure = error; throw error; }
  finally {
    signal.removeEventListener('abort', cancel);
    if (failure) await reader.cancel(failure).catch(() => {});
    reader.releaseLock();
  }
}

export async function fetchWaterBinary(baseUrl: string, meta: { file: string; downloadBytes: number; bytes: number; sha256: string }, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(`${baseUrl}${meta.file}`, { signal });
  if (!response.ok || !response.body) throw new Error(`Verified water binary HTTP ${response.status}`);
  const compressed = await exactBytes(response.body, meta.downloadBytes, signal);
  const inflated = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const bytes = await exactBytes(inflated, meta.bytes, signal);
  if (!globalThis.crypto?.subtle) throw new Error('Verified water binary integrity requires a secure browser context');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  signal.throwIfAborted();
  if (hash !== meta.sha256) throw new Error('Verified water binary integrity mismatch');
  return bytes.buffer;
}
