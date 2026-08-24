/**
 * Loader/cache for the browser-encoded province terrain chunks
 * (`province/chunks/`, written by `worldgen.export_web_chunks`).
 *
 * Heights decode to **true metres** (sea level y = 0); the ×5 vertical scale
 * of decision 0006 is applied only where data becomes geometry/collision
 * (see `chunks-web-manifest.json`.verticalScaleAtGeometry).
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
  /** True-metre heights, row-major [y][x], y south, x east. */
  heights: Float32Array;
  nx: number;
  ny: number;
  metresPerSample: number;
}

export class ChunkStore {
  private manifestPromise: Promise<ChunksManifest> | null = null;
  private byCell = new Map<string, ChunkMeta>();
  private grids = new Map<string, ChunkGrid>();
  private pending = new Map<string, Promise<ChunkGrid>>();

  constructor(private readonly baseUrl: string) {}

  manifest(): Promise<ChunksManifest> {
    this.manifestPromise ??= fetch(`${this.baseUrl}province/chunks/chunks-web-manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`chunks manifest: HTTP ${r.status}`);
        return r.json();
      })
      .then((m: ChunksManifest) => {
        for (const chunk of m.chunks) this.byCell.set(`${chunk.cx},${chunk.cy}`, chunk);
        return m;
      });
    return this.manifestPromise;
  }

  chunkAt(cx: number, cy: number): ChunkMeta | undefined {
    return this.byCell.get(`${cx},${cy}`);
  }

  /** Already-decoded grid, if `load` has completed for this cell+lod. */
  loaded(cx: number, cy: number, lod: string): ChunkGrid | undefined {
    return this.grids.get(`${cx},${cy},${lod}`);
  }

  async load(cx: number, cy: number, lod: string): Promise<ChunkGrid> {
    const key = `${cx},${cy},${lod}`;
    const cached = this.grids.get(key);
    if (cached) return cached;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.decode(cx, cy, lod).then((grid) => {
        this.grids.set(key, grid);
        this.pending.delete(key);
        return grid;
      });
      this.pending.set(key, pending);
    }
    return pending;
  }

  private async decode(cx: number, cy: number, lod: string): Promise<ChunkGrid> {
    await this.manifest();
    const meta = this.chunkAt(cx, cy);
    const lodMeta = meta?.lods[lod];
    if (!meta || !lodMeta) throw new Error(`no chunk ${cx},${cy} lod ${lod}`);
    const image = new Image();
    image.src = `${this.baseUrl}province/chunks/${lodMeta.file}`;
    await image.decode();
    const [ny, nx] = lodMeta.shape;
    const canvas = document.createElement("canvas");
    canvas.width = nx;
    canvas.height = ny;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const px = ctx.getImageData(0, 0, nx, ny).data;
    const heights = new Float32Array(nx * ny);
    const span = lodMeta.maxM - lodMeta.minM;
    // 16-bit quantised height: R = high byte, G = low byte.
    for (let i = 0; i < heights.length; i++) {
      heights[i] = lodMeta.minM + ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * span;
    }
    return { meta, lod, heights, nx, ny, metresPerSample: lodMeta.metresPerSample };
  }
}
