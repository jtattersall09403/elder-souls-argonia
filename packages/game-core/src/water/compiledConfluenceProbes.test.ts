import { describe, expect, it, vi } from 'vitest';
import { confluenceReproProbes, CONFLUENCE_REPRO_SITES, interpolateInlandStillFace, resolveInlandStillVertex, standingEdgeStageUnion, type OwnershipEdgeProbe } from './compiledConfluenceProbes';
import type { WaterBoundaryStaticSample } from './waterData';

const stages = [{ tide: 0, season: 0 }, { tide: -.5, season: -.28 }, { tide: .5, season: -.28 },
  { tide: -.5, season: 1.4 }, { tide: .5, season: 1.4 }];
const edge: OwnershipEdgeProbe = { id: 'join', point: 0, inside: [0, 0], outside: [1, 0] };
const baseline: WaterBoundaryStaticSample = { supported: true, waterBodyId: 'pool', surfaceBase: 1, depthProxy: -8,
  seasonResponse: 1, tideResponse: 0, floodAccessOffsetM: .6 };

it('preserves all three exact owner repro centres and deterministic25-point neighbourhoods', () => {
  const probes = confluenceReproProbes();
  expect(probes).toEqual(confluenceReproProbes()); expect(probes).toHaveLength(75);
  expect(new Set(probes.map(p => p.label)).size).toBe(75);
  expect(CONFLUENCE_REPRO_SITES.map(({ x, z }) => [x, z])).toEqual([[2370, 190], [1960, 220], [3840, 1120]]);
  for (const site of CONFLUENCE_REPRO_SITES) {
    const points = probes.filter(p => p.site === site.id);
    expect(points).toHaveLength(25); expect(points[0]).toMatchObject({ x: site.x, z: site.z });
    for (const [ring, radius] of [0.25, 10, 30].entries()) for (let direction = 0; direction < 8; direction++) {
      const p = points[1 + ring * 8 + direction];
      expect(p.x - site.x).toBeCloseTo(radius * Math.cos(direction * Math.PI / 4), 10);
      expect(p.z - site.z).toBeCloseTo(radius * Math.sin(direction * Math.PI / 4), 10);
    }
  }
});

it('uses actual vertex-level interpolation even for unsupported corners, never an exact fragment raster plane', () => {
  const vertices = [
    { ...baseline, surfaceBase: 10, tideResponse: 1, seasonResponse: 0 },
    { ...baseline, surfaceBase: 20, tideResponse: 0, seasonResponse: 1, supported: false, waterBodyId: null },
    { ...baseline, surfaceBase: 40, tideResponse: 0.5, seasonResponse: 0.25 },
  ];
  const plane = interpolateInlandStillFace(vertices, [0.5, 0.25, 0.25]);
  expect(plane).toEqual({ height: 20, tide: 0.625, season: 0.3125 });
  expect(plane.height + 0.5 * plane.tide + 1.4 * plane.season).toBe(20.75);
  expect(interpolateInlandStillFace(vertices, [0, 1, 0]).height).toBe(20); // unsupported shader vertex is not zeroed
});

it('matches mixed explicit and raster-sampled vertices without losing signed proxy depth', () => {
  const sampled = { ...baseline, surfaceBase: 40, depthProxy: 3, tideResponse: 0.2, seasonResponse: 0.4 };
  const explicit = resolveInlandStillVertex(sampled, { waterOverrideX: 10, waterGround: 12,
    waterLevelResponse: [1, 0.5, 1], waterBodyIndex: 7 });
  expect(explicit).toEqual({ surfaceBase: 10, depthProxy: -2, tideResponse: 1, seasonResponse: 0.5 });
  const fallback = resolveInlandStillVertex(sampled, { waterOverrideX: -999, waterGround: 999,
    waterLevelResponse: [0, 0, 0], waterBodyIndex: 0 });
  expect(fallback).toBe(sampled);
  expect(resolveInlandStillVertex(sampled)).toBe(sampled);
  const plane = interpolateInlandStillFace([explicit, fallback, sampled], [0.5, 0.25, 0.25]);
  expect(plane.height).toBe(25); expect(plane.tide).toBeCloseTo(0.6); expect(plane.season).toBeCloseTo(0.45);
});

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
