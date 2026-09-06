import type { ChunkGrid } from './chunkStore';

/** Audited native quad diagonals. This overlay changes no vertex heights. */
export class NativeTerrainTopology {
  readonly gridSize: number;
  readonly metresPerPixel: number;
  readonly flippedCells: ReadonlySet<number>;
  constructor(input: unknown) {
    const data = input as { schemaVersion?: number; gridSize?: number; metresPerPixel?: number; flippedCells?: unknown } | null;
    if (!data || data.schemaVersion !== 1) throw new Error('Terrain topology requires schemaVersion 1');
    if (!Number.isSafeInteger(data.gridSize) || data.gridSize! < 2 || !Number.isSafeInteger((data.gridSize! - 1) ** 2)
      || typeof data.metresPerPixel !== 'number' || !Number.isFinite(data.metresPerPixel) || data.metresPerPixel <= 0
      || !Array.isArray(data.flippedCells)) throw new Error('Terrain topology has invalid native grid or cells');
    this.gridSize = data.gridSize!; this.metresPerPixel = data.metresPerPixel;
    const cells = new Set<number>();
    let previous = -1;
    for (const index of data.flippedCells) {
      if (!Number.isSafeInteger(index) || index <= previous || index >= (this.gridSize - 1) ** 2) {
        throw new Error('Terrain topology requires sorted unique in-bounds native cells');
      }
      cells.add(index); previous = index;
    }
    this.flippedCells = cells;
  }

  /** Coarse water-adjacent rendering uses the separate native-preserving
   * adaptive mesh. A coarse grid cell cannot represent a native-only flip. */
  apply(grid: ChunkGrid): ChunkGrid {
    if (Math.abs(grid.metresPerSample - this.metresPerPixel) > 1e-8) {
      if (grid.lod === '1') throw new Error('Native terrain topology requires exact native LOD-1 spacing');
      return grid;
    }
    const gx = grid.meta.originM[0] / this.metresPerPixel, gz = grid.meta.originM[1] / this.metresPerPixel;
    const ox = Math.round(gx), oz = Math.round(gz), stride = this.gridSize - 1;
    if (Math.abs(gx - ox) > 1e-7 || Math.abs(gz - oz) > 1e-7 || ox < 0 || oz < 0
      || ox + grid.nx > this.gridSize || oz + grid.ny > this.gridSize) throw new Error('Terrain topology grid does not align with native terrain');
    const local = new Set<number>();
    // Sparse audit lists are tiny relative to the terrain grids.
    for (const cell of this.flippedCells) {
      const x = cell % stride - ox, z = Math.floor(cell / stride) - oz;
      if (x >= 0 && z >= 0 && x < grid.nx - 1 && z < grid.ny - 1) local.add(z * (grid.nx - 1) + x);
    }
    return local.size ? { ...grid, flippedCells: local } : grid;
  }
}

export async function loadNativeTerrainTopology(url: string): Promise<NativeTerrainTopology> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Terrain topology ${url}: HTTP ${response.status}`);
  return new NativeTerrainTopology(await response.json());
}
