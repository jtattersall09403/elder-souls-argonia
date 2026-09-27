import { describe, expect, it } from "vitest";
import type { ChunkGrid, ChunkMeta, ChunksManifest, ChunkStore } from "./chunkStore";
import { makeChunkHeightSampler } from "./terrainHeightSampler";

const META = { cx: 0, cy: 0, originM: [0, 0], lods: {} } as unknown as ChunkMeta;
const MANIFEST = { chunkMetres: 32, grid: [1, 1] } as unknown as ChunksManifest;

function grid(lod: string, n: number, height: number): ChunkGrid {
  return { meta: META, lod, heights: new Float32Array(n * n).fill(height), nx: n, ny: n,
    metresPerSample: 32 / (n - 1) };
}

/** A store whose resident rasters are exactly `grids` (LOD 1 a padded 12 m,
 * LOD 4 the frozen 10 m: the case a coarse-only sampler misses). */
function store(grids: ChunkGrid[]): ChunkStore {
  return { loaded: (_cx: number, _cy: number, lod: string) => grids.find((g) => g.lod === lod) } as
    unknown as ChunkStore;
}

describe("makeChunkHeightSampler (0102 round 2)", () => {
  it("reads the finest resident LOD, where the place's pad is drawn", () => {
    const sample = makeChunkHeightSampler(store([grid("4", 5, 10), grid("1", 17, 12)]), MANIFEST, 2);
    expect(sample(16, 16)).toBeCloseTo(24, 5);
  });

  it("falls back to a coarser resident LOD, and to NaN with none or off the grid", () => {
    expect(makeChunkHeightSampler(store([grid("4", 5, 10)]), MANIFEST, 1)(16, 16)).toBeCloseTo(10, 5);
    expect(makeChunkHeightSampler(store([]), MANIFEST, 1)(16, 16)).toBeNaN();
    expect(makeChunkHeightSampler(store([grid("1", 17, 12)]), MANIFEST, 1)(40, 16)).toBeNaN();
  });
});
