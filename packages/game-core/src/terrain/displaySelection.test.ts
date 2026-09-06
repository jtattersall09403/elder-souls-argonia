import { expect, it } from 'vitest';
import { hasTerrainAuthority, selectTerrainDisplay } from './displaySelection';
import type { AdaptiveTerrainData } from './adaptiveTerrain';
import type { ChunkGrid } from './chunkStore';

it('keeps loading adaptive banks even when the displayed fallback has the same LOD label', () => {
  const fallback = { grid: { lod: '4' } as ChunkGrid };
  expect(hasTerrainAuthority(fallback, '4', true)).toBe(false);
  expect(hasTerrainAuthority(fallback, '4', false)).toBe(true);
  expect(hasTerrainAuthority({ adaptive: { lod: '4' } as AdaptiveTerrainData }, '4', true)).toBe(true);
  expect(hasTerrainAuthority({ grid: { lod: '1' } as ChunkGrid }, '1', true)).toBe(true);
});

it('does not revert adaptive banks to cached regular terrain on the following render', () => {
  const adaptive = { lod: '4' } as AdaptiveTerrainData;
  const regular = { lod: '4' } as ChunkGrid;
  const admitted = selectTerrainDisplay(undefined, '4', true, adaptive, regular);
  expect(admitted).toEqual({ adaptive });
  expect(selectTerrainDisplay(admitted, '4', true, undefined, regular)).toBe(admitted);
});

it('retains a visible replacement until the requested authority arrives, then restores exact near terrain', () => {
  const native = { lod: '1' } as ChunkGrid, far = { lod: '4' } as AdaptiveTerrainData;
  const initial = { grid: native };
  expect(selectTerrainDisplay(initial, '4', true, undefined, { lod: '4' } as ChunkGrid)).toBe(initial);
  const distant = selectTerrainDisplay(initial, '4', true, far, undefined);
  expect(distant).toEqual({ adaptive: far });
  expect(selectTerrainDisplay(distant, '1', true, undefined, undefined)).toBe(distant);
  expect(selectTerrainDisplay(distant, '1', true, undefined, native)).toEqual({ grid: native });
  expect(selectTerrainDisplay(distant, '4', false, undefined, { lod: '4' } as ChunkGrid)).toHaveProperty('grid');
});
