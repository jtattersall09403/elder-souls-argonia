import { describe, expect, it } from 'vitest';
import { Box3, Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { TerrainViewResidency } from './viewResidency';
import type { ChunksManifest } from './chunkStore';
import type { AdaptiveTerrainChunk } from './adaptiveTerrain';

function fixture(): ChunksManifest {
  return { chunkSamples: 100, chunkMetres: 100, verticalScaleAtGeometry: 1, grid: [16, 16],
    chunks: Array.from({ length: 256 }, (_, i) => ({ cx: i % 16, cy: Math.floor(i / 16), originM: [i % 16 * 100, Math.floor(i / 16) * 100],
      lods: Object.fromEntries(['1', '2', '4'].map(lod => [lod, {
        file: `${i}-${lod}.png`, shape: [101, 101], metresPerSample: 1, minM: 0, maxM: 20,
      }])) })) };
}
function camera(x = 850, z = 850, targetZ = 0) {
  const view = new PerspectiveCamera(60, 16 / 9, 0.1, 2500);
  view.position.set(x, 100, z); view.lookAt(x, 0, targetZ); view.updateMatrixWorld();
  return view;
}

describe('terrain view residency', () => {
  it('reselects bank variants on drawing-buffer and manifest changes without relaxing the native ring', () => {
    const planner = new TerrainViewResidency(fixture(), 1), view = camera();
    const asset = { file: 'test.bin.gz', bytes: 100, vertices: 10, triangles: 100,
      sha256: 'a'.repeat(64), minM: 0, maxM: 20 };
    const chunks = new Map<string, AdaptiveTerrainChunk>(['8,0', '8,8'].map(key => {
      const [cx, cy] = key.split(',').map(Number);
      return [key, { cx, cy, originM: [cx * 100, cy * 100], cells: [100, 100], flippedCells: [],
        lods: { '2': asset, '4': asset, '4-test': { ...asset, triangles: 20, baseLod: '4', maximumBankErrorM: .1 } } }];
    }));
    const low = { chunks, widthPx: 1920, heightPx: 1080 };
    const selected = planner.update(view, 850, 850, low);
    expect(selected.find(entry => entry.chunk.cx === 8 && entry.chunk.cy === 0)?.lod).toBe('4-test');
    expect(selected.find(entry => entry.chunk.cx === 8 && entry.chunk.cy === 8)?.lod).toBe('1');
    expect(planner.update(view, 850, 850, low)).toBe(selected);
    const high = planner.update(view, 850, 850, { chunks, widthPx: 19200, heightPx: 10800 });
    expect(high.find(entry => entry.chunk.cx === 8 && entry.chunk.cy === 0)?.lod).toBe('4');
    expect(planner.update(view, 850, 850, low).find(entry => entry.chunk.cx === 8 && entry.chunk.cy === 0)?.lod).toBe('4-test');
    const absent = planner.update(view, 850, 850, { ...low, chunks: new Map() });
    expect(absent.find(entry => entry.chunk.cx === 8 && entry.chunk.cy === 0)?.lod).toBe('4');
  });

  it('retains every actually visible chunk plus the native focus ring and a near buffer', () => {
    const manifest = fixture(), view = camera();
    const planner = new TerrainViewResidency(manifest, 1);
    const entries = planner.update(view, 850, 850);
    expect(entries.length).toBeLessThan(180);
    const keys = new Map(entries.map(entry => [`${entry.chunk.cx},${entry.chunk.cy}`, entry.lod]));
    expect(keys.has('8,15')).toBe(false);
    for (let z = 7; z <= 9; z++) for (let x = 7; x <= 9; x++) expect(keys.get(`${x},${z}`)).toBe('1');
    expect(keys.get('8,10')).toBe('2');
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
    for (const chunk of manifest.chunks) {
      const box = new Box3(new Vector3(chunk.originM[0], 0, chunk.originM[1]), new Vector3(chunk.originM[0] + 100, 20, chunk.originM[1] + 100));
      if (frustum.intersectsBox(box)) expect(keys.has(`${chunk.cx},${chunk.cy}`)).toBe(true);
    }
    expect(planner.update(view, 850, 850)).toBe(entries); // static views allocate no new plan
  });

  it('evicts behind a camera turn and preserves a separate player focus on camera switches', () => {
    const planner = new TerrainViewResidency(fixture(), 1);
    const north = planner.update(camera(), 850, 850);
    expect(north.some(entry => entry.chunk.cx === 8 && entry.chunk.cy === 0)).toBe(true);
    const south = planner.update(camera(850, 850, 1600), 850, 850);
    expect(south.some(entry => entry.chunk.cx === 8 && entry.chunk.cy === 0)).toBe(false);
    expect(south.some(entry => entry.chunk.cx === 8 && entry.chunk.cy === 15)).toBe(true);
    const distant = planner.update(camera(50, 50, 1600), 1250, 1250);
    expect(distant.find(entry => entry.chunk.cx === 12 && entry.chunk.cy === 12)?.lod).toBe('1');
    expect(distant.find(entry => entry.chunk.cx === 12 && entry.chunk.cy === 14)?.lod).toBe('2');
  });

  it('uses vertical exaggeration in actual height bounds without changing terrain metadata', () => {
    const manifest = fixture(), chunk = manifest.chunks[8];
    for (const lod of Object.values(chunk.lods)) { lod.minM = 100; lod.maxM = 120; }
    const view = new PerspectiveCamera(20, 1, 0.1, 1500);
    view.position.set(850, 1000, 850); view.lookAt(850, 1000, 0); view.updateMatrixWorld();
    const unscaled = new TerrainViewResidency(manifest, 1, { prefetchM: 0, retainM: 0 }).update(view, 850, 850);
    const scaled = new TerrainViewResidency(manifest, 10, { prefetchM: 0, retainM: 0 }).update(view, 850, 850);
    expect(unscaled.some(entry => entry.chunk === chunk)).toBe(false);
    expect(scaled.some(entry => entry.chunk === chunk)).toBe(true);
    expect(chunk.lods['1'].maxM).toBe(120);
  });
});
