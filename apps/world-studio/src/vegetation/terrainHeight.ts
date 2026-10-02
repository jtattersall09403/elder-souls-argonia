import type { ChunkStore, ChunksManifest } from "../character/chunkStore";

/** True-metre ground height from the SAME streamed chunks the terrain draws
 * (no new raster fetch): best decoded LOD, bilinear — mirrors
 * `ChunkWorld.groundHeight`, which only reads LOD 1 and so goes blind in the
 * flyover's mid ring. Shared by the T3 groundcover ring and the baked-scatter
 * renderer: the compiler bakes heights from its own raster, which can sit a
 * metre off the rendered mesh on banks and slopes — re-grounding here is what
 * keeps planted things out of the air (owner round-3 "floating roots"). */
export function groundHeightM(
  store: ChunkStore,
  manifest: ChunksManifest,
  x: number,
  z: number,
): number | null {
  const cx = Math.max(0, Math.min(manifest.grid[0] - 1, Math.floor(x / manifest.chunkMetres)));
  const cy = Math.max(0, Math.min(manifest.grid[1] - 1, Math.floor(z / manifest.chunkMetres)));
  const grid = store.loaded(cx, cy, "1") ?? store.loaded(cx, cy, "2") ?? store.loaded(cx, cy, "4");
  if (!grid) return null;
  return heightInGrid(grid, x, z);
}

type Grid = NonNullable<ReturnType<ChunkStore["loaded"]>>;

/** The LODs `groundHeightM` reads, finest first. */
const SAMPLED_LODS = ["1", "2", "4"];

function heightInGrid(grid: Grid, x: number, z: number): number {
  const lx = (x - grid.meta.originM[0]) / grid.metresPerSample;
  const lz = (z - grid.meta.originM[1]) / grid.metresPerSample;
  const x0 = Math.max(0, Math.min(grid.nx - 2, Math.floor(lx)));
  const z0 = Math.max(0, Math.min(grid.ny - 2, Math.floor(lz)));
  const fx = Math.max(0, Math.min(1, lx - x0));
  const fz = Math.max(0, Math.min(1, lz - z0));
  const h = grid.heights;
  const h00 = h[z0 * grid.nx + x0];
  const h10 = h[z0 * grid.nx + x0 + 1];
  const h01 = h[(z0 + 1) * grid.nx + x0];
  const h11 = h[(z0 + 1) * grid.nx + x0 + 1];
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

/**
 * `groundHeightM` with each chunk's best decoded grid looked up once
 * instead of once per sample (perf10 O6): an occlusion ray marches dozens of
 * 12 m steps through one or two chunks, and every step used to build a
 * `cx,cy,lod` key string and probe up to three maps. The cache is kept across
 * frames (diag10 C3: emptying it every frame re-built those key strings for
 * every chunk on every frame); a grid that decodes later replaces its chunk's
 * entry when it is finer, through the store's `onArrival`, so the answer stays
 * bit-identical to `groundHeightM`. The store never evicts a grid. The owner
 * calls `dispose()` on unmount. Allocation-free after warm-up; `sample` is a
 * stable bound function.
 */
export class FrameGroundSampler {
  private readonly grids = new Map<number, Grid | null>();
  readonly dispose: () => void;

  constructor(
    private readonly store: ChunkStore,
    private readonly manifest: ChunksManifest,
    /** Applied to every height (rendered space); 1 = true metres. */
    private readonly scale = 1,
  ) {
    this.dispose = store.onArrival?.((g) => {
      const rank = SAMPLED_LODS.indexOf(g.lod);
      if (rank < 0) return;
      const key = g.meta.cx * 65_536 + g.meta.cy;
      const cached = this.grids.get(key);
      if (cached === undefined) return; // never sampled: read on demand
      if (cached === null || rank < SAMPLED_LODS.indexOf(cached.lod)) this.grids.set(key, g);
    }) ?? (() => undefined);
  }

  readonly sample = (x: number, z: number): number | null => {
    const m = this.manifest;
    const cx = Math.max(0, Math.min(m.grid[0] - 1, Math.floor(x / m.chunkMetres)));
    const cy = Math.max(0, Math.min(m.grid[1] - 1, Math.floor(z / m.chunkMetres)));
    const key = cx * 65_536 + cy;
    let grid = this.grids.get(key);
    if (grid === undefined) {
      grid = this.store.loaded(cx, cy, "1") ?? this.store.loaded(cx, cy, "2")
        ?? this.store.loaded(cx, cy, "4") ?? null;
      this.grids.set(key, grid);
    }
    return grid === null ? null : heightInGrid(grid, x, z) * this.scale;
  };
}
