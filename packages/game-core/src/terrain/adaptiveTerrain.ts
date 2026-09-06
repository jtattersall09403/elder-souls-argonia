import { BufferAttribute, BufferGeometry } from "three";

interface AdaptiveAsset { file: string; bytes: number; vertices: number; triangles: number; sha256: string; minM: number; maxM: number;
  compression?: "gzip"; downloadBytes?: number;
  /** Optional projected-error LOD affects protected water banks only. */
  baseLod?: '4'; maximumBankErrorM?: number }
export interface AdaptiveTerrainChunk {
  cx: number; cy: number; originM: [number, number]; cells: [number, number]; flippedCells: number[];
  lods: Record<string, AdaptiveAsset>;
}
export interface AdaptiveTerrainManifest {
  schemaVersion: 1; format: "es-adaptive-terrain-v1"; gridSize: number; chunkSamples: number; nativeMetresPerSample: number;
  sources: { nativeManifest: { file: string; sha256: string }; bedOverlay: { file: string; sha256: string };
    topology: { file: string; sha256: string }; protectionMaskSha256: string };
  chunks: AdaptiveTerrainChunk[];
}
export interface AdaptiveTerrainData {
  chunk: AdaptiveTerrainChunk; lod: string; metresPerSample: number;
  lattice: Uint16Array; heights: Float32Array; indices: Uint16Array | Uint32Array; byteLength: number;
}
const safeFile = (file: unknown): file is string => typeof file === "string" && /^[a-zA-Z0-9_./-]+$/.test(file)
  && !file.startsWith("/") && !file.split("/").some(part => part === ".." || part === ".");
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const integer = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

export function validateAdaptiveTerrainManifest(value: unknown): AdaptiveTerrainManifest {
  const m = value as AdaptiveTerrainManifest;
  if (!m || m.schemaVersion !== 1 || m.format !== "es-adaptive-terrain-v1" || !integer(m.gridSize, 2, 65536)
    || !integer(m.chunkSamples, 1, 256) || !Number.isFinite(m.nativeMetresPerSample) || m.nativeMetresPerSample <= 0
    || !Array.isArray(m.chunks) || m.chunks.length > 4096
    || m.chunks.length !== Math.ceil((m.gridSize - 1) / m.chunkSamples) ** 2 || !m.sources) throw new Error("Invalid adaptive terrain manifest");
  for (const source of [m.sources.nativeManifest, m.sources.bedOverlay, m.sources.topology]) {
    if (!source || !safeFile(source.file) || !hash(source.sha256)) throw new Error("Invalid adaptive terrain source dependency");
  }
  if (!hash(m.sources.protectionMaskSha256)) throw new Error("Missing adaptive protection hash");
  const keys = new Set<string>();
  for (const chunk of m.chunks) {
    const key = `${chunk.cx},${chunk.cy}`;
    if (!integer(chunk.cx, 0, 255) || !integer(chunk.cy, 0, 255) || keys.has(key)
      || !Array.isArray(chunk.cells) || chunk.cells.length !== 2 || !chunk.cells.every(n => integer(n, 1, 256))
      || !Array.isArray(chunk.originM) || chunk.originM.length !== 2
      || !chunk.originM.every(Number.isFinite)
      || chunk.cx * m.chunkSamples + chunk.cells[0] >= m.gridSize || chunk.cy * m.chunkSamples + chunk.cells[1] >= m.gridSize
      || Math.abs(chunk.originM[0] - chunk.cx * m.chunkSamples * m.nativeMetresPerSample) > 1e-7
      || Math.abs(chunk.originM[1] - chunk.cy * m.chunkSamples * m.nativeMetresPerSample) > 1e-7) throw new Error("Invalid adaptive terrain chunk grid");
    keys.add(key);
    let previous = -1;
    if (!Array.isArray(chunk.flippedCells)) throw new Error("Missing adaptive terrain topology audit");
    for (const cell of chunk.flippedCells) {
      if (!integer(cell, previous + 1, chunk.cells[0] * chunk.cells[1] - 1)) throw new Error("Invalid adaptive terrain cell flip");
      previous = cell;
    }
    if (!chunk.lods?.['2'] || !chunk.lods?.['4']) throw new Error('Missing protected-native adaptive terrain fallback');
    for (const lod of Object.keys(chunk.lods)) {
      const asset = chunk.lods?.[lod];
      const approximate = /^4-e(?:010|025|050|100)$/.test(lod);
      if (lod !== '2' && lod !== '4' && !approximate) throw new Error('Unknown adaptive terrain LOD');
      if (!asset) throw new Error('Missing adaptive terrain LOD asset');
      if (approximate && (asset.baseLod !== '4' || !Number.isFinite(asset.maximumBankErrorM) || asset.maximumBankErrorM! <= 0)
        || !approximate && (asset.baseLod !== undefined || asset.maximumBankErrorM !== undefined)) throw new Error('Invalid adaptive water-bank error declaration');
      if (!asset || !safeFile(asset.file) || !hash(asset.sha256) || !integer(asset.vertices, 3, 66049)
        || !integer(asset.triangles, 1, chunk.cells[0] * chunk.cells[1] * 2)
        || !integer(asset.bytes, 32, 4 * 1024 * 1024) || !Number.isFinite(asset.minM) || !Number.isFinite(asset.maxM)
        || asset.minM > asset.maxM || (asset.compression !== undefined && asset.compression !== "gzip")
        || (asset.compression === "gzip" && !integer(asset.downloadBytes, 20, 4 * 1024 * 1024))) throw new Error("Invalid adaptive terrain LOD asset");
    }
  }
  return m;
}

export function decodeAdaptiveTerrain(buffer: ArrayBuffer, chunk: AdaptiveTerrainChunk, lod: string, metresPerSample: number): AdaptiveTerrainData {
  if (buffer.byteLength < 32) throw new Error("Truncated adaptive terrain header");
  const header = new DataView(buffer);
  if (new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) !== "ESATLOD1" || header.getUint32(8, true) !== 1) throw new Error("Unsupported adaptive terrain binary");
  const vertices = header.getUint32(12, true), indices = header.getUint32(16, true), indexBytes = header.getUint32(20, true);
  const asset = chunk.lods[lod];
  if (!asset || vertices !== asset.vertices || indices !== asset.triangles * 3 || ![2, 4].includes(indexBytes)
    || header.getUint32(24, true) !== chunk.cells[0] || header.getUint32(28, true) !== chunk.cells[1]
    || buffer.byteLength !== 32 + vertices * 8 + indices * indexBytes || buffer.byteLength !== asset.bytes) throw new Error("Adaptive terrain binary disagrees with manifest");
  const lattice = new Uint16Array(buffer, 32, vertices * 2), heights = new Float32Array(buffer, 32 + vertices * 4, vertices);
  const triangles = indexBytes === 2 ? new Uint16Array(buffer, 32 + vertices * 8, indices) : new Uint32Array(buffer, 32 + vertices * 8, indices);
  for (let i = 0; i < vertices; i++) if (lattice[i * 2] > chunk.cells[0] || lattice[i * 2 + 1] > chunk.cells[1]
    || !Number.isFinite(heights[i]) || heights[i] < asset.minM - 0.0001 || heights[i] > asset.maxM + 0.0001) throw new Error("Invalid adaptive terrain vertex");
  for (const index of triangles) if (index >= vertices) throw new Error("Invalid adaptive terrain index");
  return { chunk, lod, metresPerSample, lattice, heights, indices: triangles, byteLength: buffer.byteLength };
}

export function buildAdaptiveTerrainGeometry(data: AdaptiveTerrainData, verticalScale: number, uvExtentM: number): BufferGeometry {
  const positions = new Float32Array(data.heights.length * 3), uv = new Float32Array(data.heights.length * 2);
  for (let i = 0; i < data.heights.length; i++) {
    const x = data.chunk.originM[0] + data.lattice[i * 2] * data.metresPerSample;
    const z = data.chunk.originM[1] + data.lattice[i * 2 + 1] * data.metresPerSample;
    positions[i * 3] = x; positions[i * 3 + 1] = data.heights[i] * verticalScale; positions[i * 3 + 2] = z;
    uv[i * 2] = x / uvExtentM; uv[i * 2 + 1] = 1 - z / uvExtentM;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3)); geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(data.indices, 1)); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function decompressTerrain(buffer: ArrayBuffer, expectedBytes: number): Promise<ArrayBuffer> {
  const reader = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const output = new Uint8Array(expectedBytes);
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > expectedBytes) throw new Error("Adaptive terrain exceeds declared decoded size");
      output.set(value, offset); offset += value.length;
    }
    if (offset !== expectedBytes) throw new Error("Adaptive terrain decoded size mismatch");
    return output.buffer;
  } finally { await reader.cancel(); }
}

/** Canvas-owned, bounded HTTP/decode queue. Missing optional manifest means
 * legacy terrain; malformed/mismatched data rejects instead of mixing worlds. */
export class AdaptiveTerrainLoader {
  private manifestPromise?: Promise<AdaptiveTerrainManifest | null>;
  private readonly controller = new AbortController();
  private readonly cache = new Map<string, AdaptiveTerrainData>();
  private readonly pending = new Map<string, Promise<AdaptiveTerrainData | null>>();
  private queue: { key: string; run: () => void; cancel: () => void }[] = [];
  private wanted: ReadonlySet<string> | null = null;
  private active = 0;
  private bytes = 0;
  private disposed = false;
  constructor(readonly provinceBaseUrl: string, private readonly options: { concurrency?: number; maxCacheBytes?: number; fetch?: typeof fetch } = {}) {}
  get diagnostics() { return { activeRequests: this.active, queuedRequests: this.queue.length, cachedBytes: this.bytes, cachedChunks: this.cache.size }; }
  /** Optional view-owned residency. Cancel only queued work; at most the
   * bounded active request count can finish after a camera switch. */
  retainWanted(keys: ReadonlySet<string>): void {
    this.wanted = new Set(keys);
    this.queue = this.queue.filter(request => {
      if (keys.has(request.key)) return true;
      request.cancel(); return false;
    });
    for (const [key, data] of this.cache) if (!keys.has(key)) {
      this.bytes -= data.byteLength; this.cache.delete(key);
    }
  }
  private fetch(url: string) { return (this.options.fetch ?? fetch)(url, { signal: this.controller.signal }); }

  manifest(): Promise<AdaptiveTerrainManifest | null> {
    this.manifestPromise ??= this.fetch(`${this.provinceBaseUrl}water/v2/terrain/manifest.json`).then(async response => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Adaptive terrain manifest HTTP ${response.status}`);
      const manifest = validateAdaptiveTerrainManifest(await response.json());
      await Promise.all([manifest.sources.nativeManifest, manifest.sources.bedOverlay, manifest.sources.topology].map(async source => {
        const dependency = await this.fetch(`${this.provinceBaseUrl}${source.file}`);
        if (!dependency.ok || await sha256(await dependency.arrayBuffer()) !== source.sha256) throw new Error(`Adaptive terrain dependency mismatch: ${source.file}`);
      }));
      return manifest;
    });
    return this.manifestPromise;
  }
  loaded(cx: number, cy: number, lod: string): AdaptiveTerrainData | undefined {
    const key = `${cx},${cy},${lod}`, data = this.cache.get(key);
    if (data) { this.cache.delete(key); this.cache.set(key, data); }
    return data;
  }
  load(cx: number, cy: number, lod: string): Promise<AdaptiveTerrainData | null> {
    const key = `${cx},${cy},${lod}`, cached = this.loaded(cx, cy, lod);
    if (this.wanted && !this.wanted.has(key)) return Promise.resolve(null);
    if (cached) return Promise.resolve(cached);
    let pending = this.pending.get(key);
    if (!pending) {
      pending = new Promise<AdaptiveTerrainData | null>((resolve, reject) => {
        this.queue.push({ key, cancel: () => { this.pending.delete(key); resolve(null); }, run: () => {
          this.active++;
          this.decode(cx, cy, lod).then(data => {
            const eligible = !this.disposed && (!this.wanted || this.wanted.has(key));
            if (data && eligible) {
              const limit = this.options.maxCacheBytes ?? 96 * 1024 * 1024;
              if (data.byteLength <= limit) {
                while (this.bytes + data.byteLength > limit && this.cache.size) {
                  const oldest = this.cache.keys().next().value!;
                  this.bytes -= this.cache.get(oldest)!.byteLength; this.cache.delete(oldest);
                }
                this.cache.set(key, data); this.bytes += data.byteLength;
              }
            }
            resolve(eligible ? data : null);
          }, reject).finally(() => { this.active--; this.pending.delete(key); this.pump(); });
        } });
      });
      this.pending.set(key, pending); this.pump();
    }
    return pending;
  }
  private pump() {
    const maximum = Math.max(1, Math.min(8, this.options.concurrency ?? 4));
    while (this.active < maximum && this.queue.length) this.queue.shift()!.run();
  }
  private async decode(cx: number, cy: number, lod: string): Promise<AdaptiveTerrainData | null> {
    if (this.disposed) throw new Error("Adaptive terrain loader disposed");
    const manifest = await this.manifest(), chunk = manifest?.chunks.find(c => c.cx === cx && c.cy === cy);
    if (!manifest || !chunk || !chunk.lods[lod]) return null;
    const response = await this.fetch(`${this.provinceBaseUrl}water/v2/terrain/${chunk.lods[lod].file}`);
    if (!response.ok) throw new Error(`Adaptive terrain chunk HTTP ${response.status}`);
    const downloaded = await response.arrayBuffer(), asset = chunk.lods[lod];
    if (downloaded.byteLength !== (asset.downloadBytes ?? asset.bytes)) throw new Error("Adaptive terrain download size mismatch");
    if (await sha256(downloaded) !== asset.sha256) throw new Error("Adaptive terrain chunk hash mismatch");
    const buffer = asset.compression === "gzip" ? await decompressTerrain(downloaded, asset.bytes) : downloaded;
    return decodeAdaptiveTerrain(buffer, chunk, lod, manifest.nativeMetresPerSample);
  }
  dispose(): void {
    this.disposed = true; this.controller.abort(); this.cache.clear(); this.bytes = 0;
    for (const request of this.queue) request.cancel();
    this.queue.length = 0;
  }
}
