/** Reject compressed bombs/truncated downloads before publishing a provider.
 * One bounded destination avoids retaining an unbounded list of stream chunks. */
async function exactBytes(stream: ReadableStream<Uint8Array>, count: number, signal: AbortSignal,
  alternateCount = count): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(Math.max(count, alternateCount)), reader = stream.getReader();
  let offset = 0, failure: unknown;
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (offset + value.byteLength > bytes.length) throw new Error('Verified water binary exceeds declared byte length');
      bytes.set(value, offset); offset += value.byteLength;
    }
    if (offset !== count && offset !== alternateCount) throw new Error('Verified water binary is truncated');
    return bytes.subarray(0, offset);
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
  // Static hosts can serve .gz with Content-Encoding, which Fetch decodes
  // before exposing the body. Transport compression may also wrap the
  // compressed file itself. Both forms retain exact size and raw hash checks.
  const encoded = !!response.headers.get('Content-Encoding');
  const delivered = await exactBytes(response.body, meta.downloadBytes, signal,
    encoded ? meta.bytes : meta.downloadBytes);
  const gzip = delivered[0] === 0x1f && delivered[1] === 0x8b;
  let bytes: Uint8Array<ArrayBuffer>;
  if (encoded && !gzip && delivered.byteLength === meta.bytes) bytes = delivered;
  else {
    if (delivered.byteLength !== meta.downloadBytes) throw new Error('Verified water binary download size mismatch');
    const inflated = new Blob([delivered]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = await exactBytes(inflated, meta.bytes, signal);
  }
  if (!globalThis.crypto?.subtle) throw new Error('Verified water binary integrity requires a secure browser context');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  signal.throwIfAborted();
  if (hash !== meta.sha256) throw new Error('Verified water binary integrity mismatch');
  return bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
}
