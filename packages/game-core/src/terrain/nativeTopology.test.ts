import { describe, expect, it, vi } from 'vitest';
import { NativeTerrainTopology } from './nativeTopology';
import { ChunkStore, type ChunkGrid } from './chunkStore';
import { sampleChunkHeight } from './heightfield';
import { terrainColliderData } from './colliderData';

function grid(): ChunkGrid {
  return { meta: { cx: 0, cy: 0, originM: [0, 0], lods: {} }, lod: '1', nx: 2, ny: 2,
    metresPerSample: 1, heights: new Float32Array([350, 361, 363, 350]) };
}
const fixture = { schemaVersion: 1, gridSize: 3, metresPerPixel: 1, flippedCells: [0] };

describe('reversible native terrain topology', () => {
  it('connects the existing low diagonal without changing source heights, and preserves other chunks', () => {
    const topology = new NativeTerrainTopology(fixture), original = grid(), before = original.heights.slice();
    const corrected = topology.apply(original);
    expect(corrected.heights).toBe(original.heights);
    expect(original.heights).toEqual(before);
    expect(original.flippedCells).toBeUndefined();
    expect(sampleChunkHeight(original, 0.5, 0.5)).toBe(362);
    expect(sampleChunkHeight(corrected, 0.5, 0.5)).toBe(350);
    expect(sampleChunkHeight(corrected, 0.25, 0.75)).toBe(356.5);
    expect(sampleChunkHeight(corrected, 0.75, 0.25)).toBe(355.5);
    const neighbour = { ...original, meta: { ...original.meta, originM: [1, 0] as [number, number] } };
    expect(topology.apply(neighbour)).toBe(neighbour);
    expect(terrainColliderData(corrected, 5).kind).toBe('trimesh');
    expect(terrainColliderData(original, 5).kind).toBe('heightfield');
    const coarse = { ...original, lod: '2', metresPerSample: 2 };
    expect(topology.apply(coarse)).toBe(coarse);
  });

  it('rejects unknown versions, invalid or duplicated cells and mismatched native grids', () => {
    expect(() => new NativeTerrainTopology({ ...fixture, schemaVersion: 2 })).toThrow('schemaVersion 1');
    for (const flippedCells of [[-1], [0, 0], [1, 0], [4], [0.5], [NaN]]) {
      expect(() => new NativeTerrainTopology({ ...fixture, flippedCells })).toThrow('sorted unique');
    }
    const topology = new NativeTerrainTopology(fixture);
    expect(() => topology.apply({ ...grid(), metresPerSample: 1.0001 })).toThrow('exact native');
    expect(() => topology.apply({ ...grid(), meta: { ...grid().meta, originM: [0.01, 0] } })).toThrow('does not align');
  });

  it('does not expose a manifest before topology is loaded and fails closed on unsupported overlays', async () => {
    const source = { chunkSamples: 1, chunkMetres: 1, verticalScaleAtGeometry: 1, grid: [1, 1], chunks: [
      { cx: 0, cy: 0, originM: [0, 0], lods: { '1': { shape: [2, 2], metresPerSample: 1 } } }] };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => source })));
    try {
      let resolve!: (value: NativeTerrainTopology) => void;
      const topology = new Promise<NativeTerrainTopology>(done => { resolve = done; });
      const store = new ChunkStore('/', { loadTerrainTopology: () => topology });
      const pending = store.manifest();
      await Promise.resolve(); await Promise.resolve();
      expect(store.chunkAt(0, 0)).toBeUndefined();
      resolve(new NativeTerrainTopology(fixture));
      await pending;
      expect(store.chunkAt(0, 0)).toBeDefined();
      const invalid = new ChunkStore('/', { loadTerrainTopology: async () => new NativeTerrainTopology({ ...fixture, schemaVersion: 99 }) });
      await expect(invalid.manifest()).rejects.toThrow('schemaVersion 1');
      expect(invalid.chunkAt(0, 0)).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });
});
