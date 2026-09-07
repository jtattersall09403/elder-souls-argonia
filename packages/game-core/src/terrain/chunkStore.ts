/**
 * Loader/cache for the browser-encoded province terrain chunks
 * (`province/chunks/`, written by `worldgen.export_web_chunks`).
 *
 * Heights decode to **true metres** (sea level y = 0); the vertical scale of
 * decision 0006 is applied only where data becomes geometry/collision (see
 * `chunks-web-manifest.json`.verticalScaleAtGeometry). Decoded grids are the
 * raw exported terrain: no overlay, no topology repair (decision 0046).
 */
export interface ChunkLodMeta {
  file: string;
  shape: [number, number]; // [ny, nx] samples (includes +1 overlap edge)
  metresPerSample: number;
  minM: number;
  maxM: number;
}
export interface ChunkMeta {
  cx: number;
  cy: number;
  originM: [number, number]; // NW corner, metres east/south of province origin
  lods: Record<string, ChunkLodMeta>;
}
export interface ChunksManifest {
  chunkSamples: number;
  chunkMetres: number;
  verticalScaleAtGeometry: number;
  grid: [number, number];
  chunks: ChunkMeta[];
}
export interface ChunkGrid {
  meta: ChunkMeta;
  lod: string;
  /** Row-major [z][x] true-metre heights. Treat as immutable. */
  heights: Float32Array;
  nx: number;
  ny: number;
  metresPerSample: number;
}

export class ChunkStore {
  private manifestPromise: Promise<ChunksManifest> | null = null;
  private readonly byCell = new Map<string, ChunkMeta>();
  private readonly grids = new Map<string, ChunkGrid>();
  private readonly pending = new Map<string, Promise<ChunkGrid>>();

  constructor(readonly baseUrl: string) {}

  manifest(): Promise<ChunksManifest> {
    this.manifestPromise ??= fetch(`${this.baseUrl}province/chunks/chunks-web-manifest.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Chunks manifest: HTTP ${response.status}`);
        return response.json() as Promise<ChunksManifest>;
      })
      .then((manifest) => {
        for (const chunk of manifest.chunks) this.byCell.set(`${chunk.cx},${chunk.cy}`, chunk);
        return manifest;
      })
      .catch((error: unknown) => {
        this.manifestPromise = null;
        throw error;
      });
    return this.manifestPromise;
  }

  chunkAt(cx: number, cy: number): ChunkMeta | undefined { return this.byCell.get(`${cx},${cy}`); }

  /** Already-decoded grid, if `load` has completed for this cell+lod. */
  loaded(cx: number, cy: number, lod: string): ChunkGrid | undefined { return this.grids.get(`${cx},${cy},${lod}`); }

  async load(cx: number, cy: number, lod: string): Promise<ChunkGrid> {
    const key = `${cx},${cy},${lod}`;
    const cached = this.grids.get(key);
    if (cached) return cached;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.decode(cx, cy, lod).then((grid) => {
        this.grids.set(key, grid);
        return grid;
      }).finally(() => { this.pending.delete(key); });
      this.pending.set(key, pending);
    }
    return pending;
  }

  private async decode(cx: number, cy: number, lod: string): Promise<ChunkGrid> {
    await this.manifest();
    const meta = this.chunkAt(cx, cy), lodMeta = meta?.lods[lod];
    if (!meta || !lodMeta) throw new Error(`No chunk ${cx},${cy} LOD ${lod}`);
    const response = await fetch(`${this.baseUrl}province/chunks/${lodMeta.file}`);
    if (!response.ok) throw new Error(`Terrain chunk ${lodMeta.file}: HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const [ny, nx] = lodMeta.shape;
    let canvas: OffscreenCanvas | undefined;
    try {
      if (bitmap.width !== nx || bitmap.height !== ny) throw new Error(`Terrain chunk ${lodMeta.file}: unexpected raster dimensions`);
      canvas = new OffscreenCanvas(nx, ny);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Terrain raster decoding context unavailable");
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(0, 0, nx, ny).data;
      const heights = new Float32Array(nx * ny);
      const span = lodMeta.maxM - lodMeta.minM;
      // 16-bit quantised height: R = high byte, G = low byte.
      for (let i = 0; i < heights.length; i++) heights[i] = lodMeta.minM + ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * span;
      return { meta, lod, heights, nx, ny, metresPerSample: lodMeta.metresPerSample };
    } finally {
      bitmap.close();
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    }
  }
}
