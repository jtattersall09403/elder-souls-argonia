import { expect, it, vi } from 'vitest';
import type { WaterBoundaryStaticSample, WaterData } from '../waterData';
import { inlandAdaptiveLeaves, inlandAdaptiveLeavesSteps } from './inlandAdaptiveLeaves';

function fixture(coefficients: (x: number, z: number) => { tide: number; season: number }) {
  const boundaryAt = vi.fn((x: number, z: number, out: WaterBoundaryStaticSample) => {
    const response = coefficients(x, z);
    Object.assign(out, { surfaceBase: 10 + x * 0.02 + z * 0.01, depthProxy: 3,
      supported: true, waterBodyId: 'pool', tideResponse: response.tide, seasonResponse: response.season });
    return out;
  });
  const data = { meta: { surface: { metresPerPixel: 1, nativeChannelCoverage: true } }, boundaryAt, rasterClassAt: () => 4 } as unknown as WaterData;
  return { data, boundaryAt };
}
const preservedStage = { tidalAmplitudeM: 0.5, seasonalAmplitudeM: 1.4 };
const tent = (x: number) => 1 - Math.abs((x % 16) - 8) / 8;

it.each(['tide', 'season'] as const)('refines a planar base whose %s extrema warp between coarse vertices', coefficient => {
  const { data, boundaryAt } = fixture(x => ({ tide: coefficient === 'tide' ? tent(x) : 0,
    season: coefficient === 'season' ? tent(x) : 0 }));
  const baseline = inlandAdaptiveLeaves(data, 0, 0, 16);
  expect(baseline).toHaveLength(16); expect(baseline.every(leaf => leaf.step === 16)).toBe(true);
  boundaryAt.mockClear();
  const staged = inlandAdaptiveLeaves(data, 0, 0, 16, 0.04, 0, preservedStage);
  expect(staged.length).toBeGreaterThan(baseline.length);
  expect(staged.every(leaf => leaf.step <= 8)).toBe(true);
  expect(boundaryAt).toHaveBeenCalledTimes(65 * 65); // not five queries/sample
});

it('keeps genuinely planar base and all stage planes coarse, with bounded sampling yields', () => {
  const { data, boundaryAt } = fixture((x, z) => ({ tide: x / 128 + z / 256, season: z / 128 }));
  const build = inlandAdaptiveLeavesSteps(data, 0, 0, 16, 0.04, 0, preservedStage);
  let previous = 0, result = build.next();
  while (!result.done) {
    expect(boundaryAt.mock.calls.length - previous).toBeLessThanOrEqual(64);
    previous = boundaryAt.mock.calls.length; result = build.next();
  }
  expect(result.value).toHaveLength(16);
  expect(result.value.every(leaf => leaf.step === 16)).toBe(true);
  expect(boundaryAt).toHaveBeenCalledTimes(65 * 65);
});

it('preserves baseline leaves exactly when an explicit stage range has zero amplitudes', () => {
  const { data } = fixture((x, z) => ({ tide: tent(x), season: tent(z) }));
  expect(inlandAdaptiveLeaves(data, 0, 0, 16, 0.04, 0, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0 }))
    .toEqual(inlandAdaptiveLeaves(data, 0, 0, 16));
});

it.each([3, 2])('refines a same-owner class%s island missed by coarse corners and centre', islandClass => {
  const { data } = fixture(() => ({ tide: 0, season: 0 }));
  data.rasterClassAt = vi.fn((x: number, z: number) => x === 3 && z === 5 ? islandClass : 4);
  const leaves = inlandAdaptiveLeaves(data, 0, 0, 16);
  expect(leaves.some(leaf => leaf.step === 1 && leaf.x <= 3 && leaf.x + leaf.step >= 3 && leaf.z <= 5 && leaf.z + leaf.step >= 5)).toBe(true);
  expect(leaves.some(leaf => leaf.partition)).toBe(true);
  expect(leaves.some(leaf => leaf.step === 16)).toBe(true); // unrelated flat pool stays coarse
  expect(data.rasterClassAt).toHaveBeenCalledTimes(65 * 65);
});

it('publishes partition flags from cached actual support and owner changes, including native leaves', () => {
  const { data, boundaryAt } = fixture(() => ({ tide: 0, season: 0 }));
  const source = data.boundaryAt.bind(data);
  data.boundaryAt = (x, z, out, ...rest) => {
    const result = source(x, z, out, ...rest);
    if (x === 3 && z === 5) { result.supported = false; result.waterBodyId = null; }
    if (x === 7 && z === 9) result.waterBodyId = 'other-pool';
    return result;
  };
  const leaves = inlandAdaptiveLeaves(data, 0, 0, 1);
  expect(leaves.find(leaf => leaf.x === 3 && leaf.z === 5)?.partition).toBe(true);
  expect(leaves.find(leaf => leaf.x === 7 && leaf.z === 9)?.partition).toBe(true);
  expect(leaves.find(leaf => leaf.x === 40 && leaf.z === 40)?.partition ?? false).toBe(false);
  expect(boundaryAt).toHaveBeenCalledTimes(65 * 65);
});

it.each(['tide', 'season'] as const)('refines independent low-%s limits even with zero upper amplitudes', coefficient => {
  const { data } = fixture(x => ({ tide: coefficient === 'tide' ? tent(x) : 0,
    season: coefficient === 'season' ? tent(x) : 0 }));
  const leaves = inlandAdaptiveLeaves(data, 0, 0, 16, .04, 0,
    { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, lowTideAmplitudeM: .5, drySeasonAmplitudeM: .28 });
  expect(leaves.length).toBeGreaterThan(16);
  expect(leaves.every(leaf => leaf.step <= 8)).toBe(true);
});
