import { describe, expect, it } from 'vitest';
import type { WaterBoundaryStaticSample, WaterData } from '../waterData';
import { inlandAdaptiveLeaves, rasterWaterClassInDomain } from './inlandAdaptiveLeaves';

function fixture(varying: boolean): WaterData {
  return { meta: { surface: { metresPerPixel: 1, nativeChannelCoverage: true } }, rasterClassAt: (x: number) => x < 48 ? 2 : 4,
    boundaryAt: (x: number, z: number, out: WaterBoundaryStaticSample) => Object.assign(out, {
      surfaceBase: x < 48 ? 0 : 90, depthProxy: 5, supported: true, waterBodyId: x < 48 ? 'estuary' : 'inland-pool',
      tideResponse: .5, seasonResponse: varying ? 1 - Math.abs(x % 16 - 8) / 8 : z / 128,
    }) } as unknown as WaterData;
}

describe('shared adaptive raster geometry in marine mode', () => {
  it('retains inland as default and selects only coast/estuary for marine', () => {
    expect([0, 1, 2, 3, 4].filter(k => rasterWaterClassInDomain(k, 'marine'))).toEqual([1, 2]);
    const data = fixture(false), stage = { tidalAmplitudeM: .5, seasonalAmplitudeM: 1.4 };
    const inland = inlandAdaptiveLeaves(data, 0, 0, 16, .04, 0, stage);
    const marine = inlandAdaptiveLeaves(data, 0, 0, 16, .04, 0, stage, 'marine');
    expect(inland.every(leaf => leaf.x + leaf.step >= 48)).toBe(true);
    expect(marine.every(leaf => leaf.x <= 48)).toBe(true);
    expect(marine.some(leaf => leaf.step === 16 && leaf.x < 32)).toBe(true);
    expect(marine.some(leaf => leaf.partition)).toBe(true);
  });
  it('uses the same preserved-stage error refinement for varying estuary responses', () => {
    const stage = { tidalAmplitudeM: .5, seasonalAmplitudeM: 1.4 };
    const flat = inlandAdaptiveLeaves(fixture(false), 0, 0, 16, .04, 0, stage, 'marine');
    const varying = inlandAdaptiveLeaves(fixture(true), 0, 0, 16, .04, 0, stage, 'marine');
    expect(varying.length).toBeGreaterThan(flat.length);
    expect(varying.filter(leaf => leaf.x < 32).every(leaf => leaf.step <= 8)).toBe(true);
  });
});
