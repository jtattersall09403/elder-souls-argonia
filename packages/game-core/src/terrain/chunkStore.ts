import type { NativeTerrainTopology } from './nativeTopology';

/** Shared streamed terrain cache. Heights remain true world metres; every
 * consumer receives the same optional corrected grid before it is cached. */
export interface ChunkLodMeta {
  file: string;
  shape: [number, number];
  metresPerSample: number;
  minM: number;
  maxM: number;
}
export interface ChunkMeta {
  cx: number;
  cy: number;
  originM: [number, number];
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
  /** Local row-major native quad indices whose diagonal is NW–SE. */
  flippedCells?: ReadonlySet<number>;
}

export interface SparseHeightOverlayData {
  schemaVersion: 1;
  gridSize: number;
  metresPerPixel: number;
  /** Explicit repair envelope, metres. Omitted legacy overlays retain 1 m. */
  maxLoweringM?: number;
  /** Routine cap stays <=3 m even when explicitly audited vertices need <=5 m. */
  routineMaxLoweringM?: number;
  /** Sorted unique native indices of actual repairs beyond the routine cap. */
  exceptionIndices?: number[];
  /** Compiler audit coordinates; province-specific scope is checked at export. */
  exceptionCells?: [row: number, column: number][];
  /** Native index = row * gridSize + column, world origin (0, 0). */
  changes: [index: number, newHeightM: number, originalHeightM: number][];
}

/** Reversible, bounded terrain lowering. Missing native vertices contribute
 * zero delta; interpolation never extends a correction across the province. */
export class SparseHeightOverlay {
  private readonly deltas = new Map<number, number>();
  readonly gridSize: number;
  readonly metresPerPixel: number;
  readonly maxLoweringM: number;

  constructor(input: unknown) {
    const data = input as Partial<SparseHeightOverlayData> | null;
    if (!data || data.schemaVersion !== 1) throw new Error("Terrain overlay requires schemaVersion 1");
    const { gridSize, metresPerPixel, changes } = data;
    if (!Number.isSafeInteger(gridSize) || gridSize! < 2
      || !Number.isSafeInteger(gridSize! * gridSize!)
      || typeof metresPerPixel !== "number" || !Number.isFinite(metresPerPixel) || metresPerPixel <= 0
      || !Array.isArray(changes)) throw new Error("Terrain overlay has invalid native grid or changes");
    this.gridSize = gridSize!;
    this.metresPerPixel = metresPerPixel;
    const maxLoweringM = data.maxLoweringM === undefined ? 1 : data.maxLoweringM;
    if (typeof maxLoweringM !== "number" || !Number.isFinite(maxLoweringM)
      || maxLoweringM < 0 || maxLoweringM > 5) {
      throw new Error("Terrain overlay maxLoweringM must be finite, at most 3 metres routinely or 5 for declared exceptions");
    }
    const routineMaxLoweringM = data.routineMaxLoweringM ?? Math.min(3, maxLoweringM);
    if (typeof routineMaxLoweringM !== "number" || !Number.isFinite(routineMaxLoweringM)
      || routineMaxLoweringM < 0 || routineMaxLoweringM > Math.min(3, maxLoweringM)
      || data.routineMaxLoweringM === null) throw new Error("Terrain overlay routineMaxLoweringM must be finite and between 0 and 3 metres, within maxLoweringM");
    const exceptionIndices = data.exceptionIndices === undefined ? [] : data.exceptionIndices;
    if (!Array.isArray(exceptionIndices)
      || (maxLoweringM > 3 && (data.routineMaxLoweringM === undefined || exceptionIndices.length === 0))) {
      throw new Error("Terrain overlay maxLoweringM above 3 requires an explicit routine cap and exceptionIndices");
    }
    const exceptions = new Set<number>();
    let previousException = -1;
    for (const index of exceptionIndices) {
      if (!Number.isSafeInteger(index) || index <= previousException || index >= this.gridSize * this.gridSize) {
        throw new Error("Terrain overlay exceptionIndices must be sorted unique in-bounds native vertices");
      }
      exceptions.add(index);
      previousException = index;
    }
    this.maxLoweringM = maxLoweringM;
    let previous = -1;
    for (const row of changes) {
      if (!Array.isArray(row) || row.length !== 3) throw new Error("Terrain overlay requires [index, newHeight, originalHeight] tuples");
      const [index, target, original] = row;
      const delta = target - original;
      const cap = exceptions.has(index) ? maxLoweringM : routineMaxLoweringM;
      if (!Number.isSafeInteger(index) || index <= previous || index >= this.gridSize * this.gridSize
        || !Number.isFinite(target) || !Number.isFinite(original)
        || delta > 0.00001 || delta < -cap - 0.00001) {
        throw new Error(`Terrain overlay must contain sorted unique native vertices lowered by at most ${cap} metres at vertex ${index}`);
      }
      if (exceptions.has(index)) {
        if (delta >= -routineMaxLoweringM - 0.00001) {
          throw new Error("Terrain overlay exceptionIndices must identify actual repairs beyond the routine cap");
        }
        exceptions.delete(index);
      }
      previous = index;
      this.deltas.set(index, Math.min(0, Math.max(-cap, delta)));
    }
    if (exceptions.size) throw new Error("Terrain overlay exceptionIndices must identify existing changes");
  }

  deltaAt(x: number, z: number): number {
    const fx = x / this.metresPerPixel, fz = z / this.metresPerPixel;
    const last = this.gridSize - 1;
    if (fx < 0 || fz < 0 || fx > last + 1e-7 || fz > last + 1e-7) return 0;
    const ix = Math.min(last, Math.floor(fx)), iz = Math.min(last, Math.floor(fz));
    const tx = Math.max(0, Math.min(1, fx - ix)), tz = Math.max(0, Math.min(1, fz - iz));
    const nx = Math.min(last, ix + 1), nz = Math.min(last, iz + 1);
    const a = this.deltas.get(iz * this.gridSize + ix) ?? 0;
    const b = this.deltas.get(iz * this.gridSize + nx) ?? 0;
    const c = this.deltas.get(nz * this.gridSize + ix) ?? 0;
    const d = this.deltas.get(nz * this.gridSize + nx) ?? 0;
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }
}

export async function loadSparseHeightOverlay(url: string): Promise<SparseHeightOverlay> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Terrain overlay ${url}: HTTP ${response.status}`);
  return new SparseHeightOverlay(await response.json());
}

/** Correct the old manifest's rounded origins/spacings from the native
 * lattice. Every LOD and neighbouring overlap edge then lands at the exact
 * same world coordinate. Clone metadata: legacy/source records stay intact. */
export function alignManifestToNativeGrid(manifest: ChunksManifest, overlay: { gridSize: number; metresPerPixel: number }): ChunksManifest {
  if (!Number.isSafeInteger(manifest.chunkSamples) || manifest.chunkSamples < 1) throw new Error("Invalid terrain chunk sample count");
  const mpp = overlay.metresPerPixel;
  const chunks = manifest.chunks.map((chunk) => {
    const cellsX = Math.min(manifest.chunkSamples, overlay.gridSize - 1 - chunk.cx * manifest.chunkSamples);
    const cellsZ = Math.min(manifest.chunkSamples, overlay.gridSize - 1 - chunk.cy * manifest.chunkSamples);
    const lods = Object.fromEntries(Object.entries(chunk.lods).map(([key, lod]) => {
      const [ny, nx] = lod.shape;
      const stepX = cellsX / (nx - 1), stepZ = cellsZ / (ny - 1);
      if (cellsX < 1 || cellsZ < 1 || !Number.isInteger(stepX) || stepX < 1 || stepX !== stepZ) {
        throw new Error(`Terrain chunk ${chunk.cx},${chunk.cy} LOD ${key} does not align with the overlay grid`);
      }
      return [key, { ...lod, metresPerSample: stepX * mpp }];
    }));
    return { ...chunk, originM: [chunk.cx * manifest.chunkSamples * mpp,
      chunk.cy * manifest.chunkSamples * mpp] as [number, number], lods };
  });
  return { ...manifest, chunkMetres: manifest.chunkSamples * mpp, chunks };
}

/** Lazy copy: original decoded heights are never modified, including when
 * adjacent LODs consume overlapping source samples. Unaffected grids reuse
 * their original buffer and every correction respects the declared cap. */
export function applyHeightOverlay(grid: ChunkGrid, overlay: SparseHeightOverlay): ChunkGrid {
  let heights = grid.heights;
  for (let z = 0; z < grid.ny; z++) {
    for (let x = 0; x < grid.nx; x++) {
      const delta = overlay.deltaAt(grid.meta.originM[0] + x * grid.metresPerSample,
        grid.meta.originM[1] + z * grid.metresPerSample);
      if (delta === 0) continue;
      if (heights === grid.heights) heights = grid.heights.slice();
      const i = z * grid.nx + x;
      heights[i] = grid.heights[i] + delta;
    }
  }
  return heights === grid.heights ? grid : { ...grid, heights };
}

export interface ChunkStoreOptions {
  /** Load once before exposing a manifest/grid; reject failures to prevent
   * visible terrain and physical/query terrain silently diverging. */
  loadHeightOverlay?: () => Promise<SparseHeightOverlay>;
  loadTerrainTopology?: () => Promise<NativeTerrainTopology | null>;
}

export class ChunkStore {
  private manifestPromise: Promise<ChunksManifest> | null = null;
  private overlay: SparseHeightOverlay | null = null;
  private topology: NativeTerrainTopology | null = null;
  private readonly byCell = new Map<string, ChunkMeta>();
  private readonly grids = new Map<string, ChunkGrid>();
  private readonly pending = new Map<string, Promise<ChunkGrid>>();

  constructor(readonly baseUrl: string, private readonly options: ChunkStoreOptions = {}) {}

  manifest(): Promise<ChunksManifest> {
    this.manifestPromise ??= Promise.all([
      fetch(`${this.baseUrl}province/chunks/chunks-web-manifest.json`).then((response) => {
        if (!response.ok) throw new Error(`Chunks manifest: HTTP ${response.status}`);
        return response.json() as Promise<ChunksManifest>;
      }),
      this.options.loadHeightOverlay?.() ?? Promise.resolve(null),
      this.options.loadTerrainTopology?.() ?? Promise.resolve(null),
    ]).then(([source, overlay, topology]) => {
      if (overlay && topology && (overlay.gridSize !== topology.gridSize || overlay.metresPerPixel !== topology.metresPerPixel)) {
        throw new Error('Terrain height and topology overlays require the same native lattice');
      }
      this.overlay = overlay;
      this.topology = topology;
      const lattice = overlay ?? topology;
      const manifest = lattice ? alignManifestToNativeGrid(source, lattice) : source;
      for (const chunk of manifest.chunks) this.byCell.set(`${chunk.cx},${chunk.cy}`, chunk);
      return manifest;
    }).catch((error: unknown) => {
      this.manifestPromise = null;
      throw error;
    });
    return this.manifestPromise;
  }

  chunkAt(cx: number, cy: number): ChunkMeta | undefined { return this.byCell.get(`${cx},${cy}`); }
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
      for (let i = 0; i < heights.length; i++) heights[i] = lodMeta.minM + ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * span;
      const grid = { meta, lod, heights, nx, ny, metresPerSample: lodMeta.metresPerSample };
      const corrected = this.overlay ? applyHeightOverlay(grid, this.overlay) : grid;
      return this.topology ? this.topology.apply(corrected) : corrected;
    } finally {
      bitmap.close();
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    }
  }
}
