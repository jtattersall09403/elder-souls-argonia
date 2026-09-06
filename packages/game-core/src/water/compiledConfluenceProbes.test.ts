import { describe, expect, it, vi } from 'vitest';
import { standingEdgeStageUnion, type OwnershipEdgeProbe } from './compiledConfluenceProbes';
import type { WaterBoundaryStaticSample } from './waterData';

const stages = [{ tide: 0, season: 0 }, { tide: -.5, season: -.28 }, { tide: .5, season: -.28 },
  { tide: -.5, season: 1.4 }, { tide: .5, season: 1.4 }];
const edge: OwnershipEdgeProbe = { id: 'join', point: 0, inside: [0, 0], outside: [1, 0] };
const baseline: WaterBoundaryStaticSample = { supported: true, waterBodyId: 'pool', surfaceBase: 1, depthProxy: -8,
  seasonResponse: 1, tideResponse: 0, floodAccessOffsetM: .6 };

describe('compiled standing-boundary stage union', () => {
  it('includes dry-at-base shores opened only by wet season using exact bed, not quantized depth proxy', () => {
    const boundaryAt = vi.fn(() => baseline), ground = vi.fn(() => 1.5);
    const result = standingEdgeStageUnion([edge], { boundaryAt, rasterClassAt: () => 4 }, ground, stages);
    expect(result).toEqual([{ edge, stageMask: (1 << 3) | (1 << 4) }]);
    expect(boundaryAt).toHaveBeenCalledTimes(2); expect(ground).toHaveBeenCalledTimes(2);
    expect(boundaryAt).toHaveBeenCalledWith(0, 0, undefined, false);
  });

  it('includes tidal-only access on either side, but excludes barriers above every preserved stage', () => {
    const boundaryAt = (x: number) => ({ ...baseline, tideResponse: 1, seasonResponse: 0,
      floodAccessOffsetM: x === 0 ? .3 : 2 });
    expect(standingEdgeStageUnion([edge], { boundaryAt, rasterClassAt: () => 4 }, () => 1.2, stages))
      .toEqual([{ edge, stageMask: (1 << 2) | (1 << 4) }]);
    expect(standingEdgeStageUnion([edge], { boundaryAt: () => ({ ...baseline, floodAccessOffsetM: 2 }), rasterClassAt: () => 4 }, () => -10, stages)).toEqual([]);
  });

  it('never admits native-owned proxies or marine geometry through the standing inland gate', () => {
    const ground = vi.fn(() => -10);
    expect(standingEdgeStageUnion([edge], { boundaryAt: () => ({ ...baseline, supported: false }), rasterClassAt: () => 3 }, ground, stages)).toEqual([]);
    expect(standingEdgeStageUnion([edge], { boundaryAt: () => baseline, rasterClassAt: () => 1 }, ground, stages)).toEqual([]);
    expect(ground).not.toHaveBeenCalled();
  });

  it('fails missing exact ground instead of silently dropping potentially standing boundary evidence', () => {
    expect(() => standingEdgeStageUnion([edge], { boundaryAt: () => baseline, rasterClassAt: () => 4 }, () => null, stages)).toThrow('Missing native standing-boundary bed');
  });
});
