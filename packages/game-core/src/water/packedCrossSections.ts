import type { ChannelRibbonPoint, ChannelRibbonRecord } from './channelRibbons';

export interface PackedCrossSectionMeta {
  schemaVersion: 1;
  file: string;
  encoding: 'float32-le-offset-ground-access';
  sampleCount: number;
  sha256?: string;
}
export type ChannelCrossSection = NonNullable<ChannelRibbonPoint['crossSection']>;
const MAX_SAMPLES = 4_000_000;

export function validatePackedCrossSectionMeta(value: unknown): asserts value is PackedCrossSectionMeta {
  const m = value as Partial<PackedCrossSectionMeta> | null;
  if (!m || m.schemaVersion !== 1 || m.encoding !== 'float32-le-offset-ground-access'
    || typeof m.file !== 'string' || !/^[a-zA-Z0-9_-]+\.bin$/.test(m.file)
    || !Number.isSafeInteger(m.sampleCount) || m.sampleCount! < 0 || m.sampleCount! > MAX_SAMPLES
    || (m.sha256 !== undefined && (typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(m.sha256)))) {
    throw new Error('Invalid schema-1 packed water cross sections or sample budget');
  }
}

/** One packed Float32 buffer plus a bounded decoded-station LRU. Lazy getters
 * are non-enumerable: logging/stringifying metadata must not expand millions
 * of sample objects. Full validation uses packed numeric values directly. */
export class PackedCrossSections {
  readonly values: Float32Array;
  private readonly decoded = new Map<ChannelRibbonPoint, ChannelCrossSection>();
  private samples = 0;
  private builds = 0;
  readonly maxCachedStations = 256;
  readonly maxCachedSamples = 16384;

  constructor(meta: PackedCrossSectionMeta, buffer: ArrayBuffer, records: readonly ChannelRibbonRecord[]) {
    validatePackedCrossSectionMeta(meta);
    if (buffer.byteLength !== meta.sampleCount * 12) throw new Error('Packed water cross-section byte length does not match metadata');
    const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
    if (littleEndian) this.values = new Float32Array(buffer);
    else {
      const source = new DataView(buffer); this.values = new Float32Array(meta.sampleCount * 3);
      for (let i = 0; i < this.values.length; i++) this.values[i] = source.getFloat32(i * 4, true);
    }
    let cursor = 0;
    // Validate the entire bundle before installing any accessors, so a bad
    // late station cannot leave half-mutated metadata usable by a renderer.
    for (const record of records) for (const point of record.points) {
      const start = point.crossSectionStart, count = point.crossSectionCount;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start !== cursor || count! < 2 || count! > this.maxCachedSamples
        || start! + count! > meta.sampleCount || point.crossSection !== undefined) {
        throw new Error(`Invalid contiguous packed water section range at ${record.id}`);
      }
      let previous = -Infinity, centre = -1;
      for (let i = 0; i < count!; i++) {
        const k = (start! + i) * 3, offset = this.values[k], ground = this.values[k + 1], access = this.values[k + 2];
        if (!Number.isFinite(offset) || !Number.isFinite(ground) || !Number.isFinite(access)
          || offset <= previous || access + 0.0001 < ground - point.y) {
          throw new Error(`Invalid packed water section ground/access/order at ${record.id} sample ${i}`);
        }
        if (offset === 0) centre = i;
        previous = offset;
      }
      if (centre < 0) throw new Error(`Packed water section missing centre at ${record.id}`);
      for (let i = 1; i < count!; i++) {
        const current = this.values[(start! + i) * 3 + 2], previousAccess = this.values[(start! + i - 1) * 3 + 2];
        if ((i <= centre && current > previousAccess + 0.0001) || (i > centre && current + 0.0001 < previousAccess)) {
          throw new Error(`Packed water outward access barrier descends at ${record.id}`);
        }
      }
      cursor += count!;
    }
    if (cursor !== meta.sampleCount) throw new Error('Packed water sections contain unreferenced samples');
    for (const record of records) for (const point of record.points) {
      const first = point.crossSectionStart!, last = first + point.crossSectionCount! - 1;
      Object.defineProperties(point, {
        crossSection: { enumerable: false, configurable: false, get: () => this.section(point) },
        crossSectionMinOffsetM: { enumerable: false, value: this.values[first * 3] },
        crossSectionMaxOffsetM: { enumerable: false, value: this.values[last * 3] },
      });
    }
  }

  get cacheStats() { return { stations: this.decoded.size, samples: this.samples, builds: this.builds, byteLength: this.values.byteLength }; }

  private section(point: ChannelRibbonPoint): ChannelCrossSection {
    const cached = this.decoded.get(point);
    if (cached) { this.decoded.delete(point); this.decoded.set(point, cached); return cached; }
    const start = point.crossSectionStart!, count = point.crossSectionCount!;
    const section = new Array<ChannelCrossSection[number]>(count);
    for (let i = 0; i < count; i++) {
      const k = (start + i) * 3;
      section[i] = Object.freeze({ offsetM: this.values[k], groundM: this.values[k + 1], accessOffsetM: this.values[k + 2] });
    }
    Object.freeze(section); this.builds++;
    if (count <= this.maxCachedSamples) {
      while (this.decoded.size >= this.maxCachedStations || this.samples + count > this.maxCachedSamples) {
        const oldest = this.decoded.keys().next().value!;
        this.samples -= this.decoded.get(oldest)!.length; this.decoded.delete(oldest);
      }
      this.decoded.set(point, section); this.samples += count;
    }
    return section;
  }
}

export async function fetchPackedCrossSections(baseUrl: string, meta: PackedCrossSectionMeta, signal: AbortSignal): Promise<ArrayBuffer> {
  validatePackedCrossSectionMeta(meta);
  const response = await fetch(`${baseUrl}${meta.file}`, { signal });
  if (!response.ok) throw new Error(`Packed water cross sections: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer(); signal.throwIfAborted();
  if (buffer.byteLength !== meta.sampleCount * 12) throw new Error('Packed water cross-section byte length does not match metadata');
  if (meta.sha256) {
    if (!globalThis.crypto?.subtle) throw new Error('Packed water checksum validation requires a secure browser context');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
    if (Array.from(digest, n => n.toString(16).padStart(2, '0')).join('') !== meta.sha256) throw new Error('Packed water cross-section checksum mismatch');
    signal.throwIfAborted();
  }
  return buffer;
}
