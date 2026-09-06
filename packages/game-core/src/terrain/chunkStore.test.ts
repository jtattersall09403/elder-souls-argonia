import { describe, expect, it } from "vitest";
import { SparseHeightOverlay, alignManifestToNativeGrid, applyHeightOverlay,
  type ChunkGrid, type ChunksManifest } from "./chunkStore";

const MPP = 1.82784;
function overlay() {
  return new SparseHeightOverlay({ schemaVersion: 1, gridSize: 5, metresPerPixel: MPP,
    changes: [[12, 9.25, 10]] });
}
function manifest(): ChunksManifest {
  return { chunkSamples: 2, chunkMetres: 3.65, verticalScaleAtGeometry: 1, grid: [2, 2],
    chunks: [0, 1, 2, 3].map((index) => ({
      cx: index % 2, cy: Math.floor(index / 2),
      originM: [(index % 2) * 3.65, Math.floor(index / 2) * 3.65],
      lods: {
        "1": { file: "fine.png", shape: [3, 3], metresPerSample: 1.828, minM: 0, maxM: 20 },
        "2": { file: "coarse.png", shape: [2, 2], metresPerSample: 3.656, minM: 0, maxM: 20 },
      },
    })) };
}
function grid(m: ChunksManifest, index: number, lod = "1"): ChunkGrid {
  const meta = m.chunks[index], level = meta.lods[lod];
  const [ny, nx] = level.shape;
  return { meta, lod, nx, ny, metresPerSample: level.metresPerSample,
    heights: new Float32Array(nx * ny).fill(10) };
}

describe("reversible terrain bed corrections", () => {
  it("interpolates only changed native vertices and never raises or lowers more than one metre", () => {
    const edit = overlay();
    expect(edit.deltaAt(2 * MPP, 2 * MPP)).toBe(-0.75);
    expect(edit.deltaAt(1.5 * MPP, 2 * MPP)).toBeCloseTo(-0.375);
    expect(edit.deltaAt(0, 0)).toBe(0);
    expect(edit.deltaAt(-MPP, 2 * MPP)).toBe(0);
    expect(edit.deltaAt(5 * MPP, 2 * MPP)).toBe(0);
    for (let x = 0; x <= 4; x += 0.1) {
      const delta = edit.deltaAt(x * MPP, 2 * MPP);
      expect(delta).toBeGreaterThanOrEqual(-1);
      expect(delta).toBeLessThanOrEqual(0);
    }
  });

  it("aligns all overlap edges and LOD vertices without changing source metadata", () => {
    const source = manifest(), snapshot = structuredClone(source);
    const aligned = alignManifestToNativeGrid(source, overlay());
    expect(source).toEqual(snapshot);
    expect(aligned.chunkMetres).toBe(2 * MPP);
    for (const lod of ["1", "2"]) {
      const left = grid(aligned, 0, lod), right = grid(aligned, 1, lod);
      const edge = left.meta.originM[0] + (left.nx - 1) * left.metresPerSample;
      expect(edge).toBe(right.meta.originM[0]);
      expect(edge).toBe(2 * MPP);
    }
  });

  it("gives every neighbouring chunk and LOD the same correction at a shared native vertex", () => {
    const edit = overlay(), aligned = alignManifestToNativeGrid(manifest(), edit);
    for (const lod of ["1", "2"]) {
      for (let index = 0; index < 4; index++) {
        const original = grid(aligned, index, lod);
        const corrected = applyHeightOverlay(original, edit);
        const x = index % 2 === 0 ? corrected.nx - 1 : 0;
        const z = index < 2 ? corrected.ny - 1 : 0;
        expect(corrected.heights[z * corrected.nx + x]).toBe(9.25);
        expect(original.heights.every((height) => height === 10)).toBe(true);
        expect(corrected.heights).not.toBe(original.heights);
      }
    }
  });

  it("keeps untouched terrain identical and reuses its buffer", () => {
    const empty = new SparseHeightOverlay({ schemaVersion: 1, gridSize: 5, metresPerPixel: MPP, changes: [] });
    const original = grid(alignManifestToNativeGrid(manifest(), empty), 0);
    expect(applyHeightOverlay(original, empty)).toBe(original);
  });

  it("rejects wrong versions, raising, over-deep cuts and duplicate native indices", () => {
    const base = { schemaVersion: 1, gridSize: 5, metresPerPixel: MPP };
    expect(() => new SparseHeightOverlay({ ...base, schemaVersion: 2, changes: [] })).toThrow("schemaVersion 1");
    for (const changes of [[[12, 11, 10]], [[12, 8.9, 10]], [[12, 9, 10], [12, 9, 10]], [[25, 9, 10]]]) {
      expect(() => new SparseHeightOverlay({ ...base, changes })).toThrow("sorted unique native vertices");
    }
  });

  it("refuses an overlay lattice incompatible with the terrain instead of shifting heights", () => {
    const wrong = new SparseHeightOverlay({ schemaVersion: 1, gridSize: 4, metresPerPixel: MPP, changes: [] });
    expect(() => alignManifestToNativeGrid(manifest(), wrong)).toThrow("does not align");
  });

  it("requires an explicit bounded cap for deeper repairs and validates every change against it", () => {
    const base = { schemaVersion: 1, gridSize: 5, metresPerPixel: MPP, changes: [[12, 7, 10]] };
    expect(() => new SparseHeightOverlay(base)).toThrow("at most 1 metres");
    const deeper = new SparseHeightOverlay({ ...base, maxLoweringM: 3 });
    expect(deeper.deltaAt(2 * MPP, 2 * MPP)).toBe(-3);
    for (const maxLoweringM of [-1, 3.01, Infinity, NaN, "3", null]) {
      expect(() => new SparseHeightOverlay({ ...base, maxLoweringM })).toThrow("maxLoweringM");
    }
    expect(() => new SparseHeightOverlay({ ...base, maxLoweringM: 2 })).toThrow("at most 2 metres");
    const rounded = new SparseHeightOverlay({ ...base, maxLoweringM: 3, changes: [[12, 6.999999, 10]] });
    expect(rounded.deltaAt(2 * MPP, 2 * MPP)).toBe(-3);
  });

  it("restricts exceptional deeper cuts to their exact audited native indices", () => {
    const data = { schemaVersion: 1, gridSize: 5, metresPerPixel: MPP,
      maxLoweringM: 5, routineMaxLoweringM: 3, exceptionIndices: [12],
      changes: [[11, 7, 10], [12, 5.1, 10]] };
    const edit = new SparseHeightOverlay(data);
    expect(edit.deltaAt(MPP, 2 * MPP)).toBe(-3);
    expect(edit.deltaAt(2 * MPP, 2 * MPP)).toBeCloseTo(-4.9);
    // Interpolation remains bounded and cannot spread beyond adjacent vertices.
    expect(edit.deltaAt(1.5 * MPP, 2 * MPP)).toBeCloseTo(-3.95);
    expect(edit.deltaAt(3 * MPP, 2 * MPP)).toBe(0);
    expect(() => new SparseHeightOverlay({ ...data, changes: [[11, 6, 10], [12, 5.1, 10]] })).toThrow("at most 3 metres at vertex 11");
    expect(() => new SparseHeightOverlay({ ...data, changes: [[12, 4.99, 10]] })).toThrow("at most 5 metres");
    expect(() => new SparseHeightOverlay({ ...data, changes: [[12, 7, 10]] })).toThrow("actual repairs");
    expect(() => new SparseHeightOverlay({ ...data, changes: [] })).toThrow("existing changes");
    for (const exceptionIndices of [undefined, [], [12, 12], [13, 12], [-1], [25], [12.5], null]) {
      expect(() => new SparseHeightOverlay({ ...data, exceptionIndices })).toThrow();
    }
    for (const routineMaxLoweringM of [undefined, null, NaN, Infinity, -1, 3.01, "3"]) {
      expect(() => new SparseHeightOverlay({ ...data, routineMaxLoweringM })).toThrow();
    }
    expect(() => new SparseHeightOverlay({ ...data, maxLoweringM: 5.01 })).toThrow("maxLoweringM");
  });
});
