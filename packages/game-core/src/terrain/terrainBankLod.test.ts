import { describe, expect, it } from 'vitest';
import type { AdaptiveTerrainChunk } from './adaptiveTerrain';
import { selectTerrainBankLod } from './terrainBankLod';

const asset = { file: 'terrain.bin.gz', bytes: 100, vertices: 10, triangles: 100, sha256: 'a'.repeat(64), minM: 0, maxM: 20 };
const chunk: AdaptiveTerrainChunk = { cx: 0, cy: 0, originM: [0, 0], cells: [8, 8], flippedCells: [], lods: {
  '2': asset, '4': asset,
  '4-e010': { ...asset, triangles: 80, baseLod: '4', maximumBankErrorM: .107 },
  '4-e025': { ...asset, triangles: 60, baseLod: '4', maximumBankErrorM: .257 },
  '4-e050': { ...asset, triangles: 40, baseLod: '4', maximumBankErrorM: .507 },
  '4-e100': { ...asset, triangles: 20, baseLod: '4', maximumBankErrorM: 1.007 },
} };

describe('protected-bank projected terrain LOD', () => {
  it('chooses only a subpixel bound including Float32 allowance and vertical scale', () => {
    const view = { distanceM: 1000, pixelsPerRadian: 1000 };
    expect(selectTerrainBankLod(chunk, '4', view)).toBe('4-e025'); //0.507px is NOT below0.5px.
    expect(selectTerrainBankLod(chunk, '4', { ...view, verticalScale: 2 })).toBe('4-e010');
    expect(selectTerrainBankLod(chunk, '4', { ...view, distanceM: 3000 })).toBe('4-e100');
    expect(selectTerrainBankLod(chunk, '4', { ...view, distanceM: 100 })).toBe('4');
    expect(selectTerrainBankLod(chunk, '4', { ...view, distanceM: 0 })).toBe('4');
  });
  it('keeps native/mid collider-aligned rings and legacy bundles unchanged', () => {
    const view = { distanceM: 10000, pixelsPerRadian: 500 };
    expect(selectTerrainBankLod(chunk, '1', view)).toBe('1');
    expect(selectTerrainBankLod(chunk, '2', view)).toBe('2');
    expect(selectTerrainBankLod({ ...chunk, lods: { '2': asset, '4': asset } }, '4', view)).toBe('4');
    expect(selectTerrainBankLod(chunk, '4', { ...view, distanceM: NaN })).toBe('4');
  });
  it('uses the shared displayed-height allowance once and rejects invalid bounds', () => {
    const view = { distanceM: 1000, pixelsPerRadian: 1000, verticalScale: 2 };
    expect(selectTerrainBankLod(chunk, '4', { ...view, scaledHeightRoundoffM: .28 })).toBe('4-e010');
    expect(selectTerrainBankLod(chunk, '4', { ...view, scaledHeightRoundoffM: .29 })).toBe('4');
    expect(selectTerrainBankLod(chunk, '4', { ...view, scaledHeightRoundoffM: -1 })).toBe('4');
    expect(selectTerrainBankLod(chunk, '4', { ...view, scaledHeightRoundoffM: NaN })).toBe('4');
  });
});
