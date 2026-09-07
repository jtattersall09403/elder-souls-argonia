import { describe, expect, it } from 'vitest';
import { evaluateWaterfallTrajectory, traceWaterfallLanding, type WaterfallTrajectory, type WaterfallTraceOptions } from './waterfallTrajectory';

const path: WaterfallTrajectory = { lip: { x: 0, y: 10, z: 2 }, velocity: { x: 3, y: 2, z: 0 }, gravityMPS2: -10 };
const options: WaterfallTraceOptions = { terrainHeight: () => null, receivingWaterHeight: () => 0, maxTimeS: 5, maxDistanceM: 100 };

describe('physical waterfall departure and first landing', () => {
  it('retains incoming vertical velocity and evaluates the ballistic arc exactly', () => {
    expect(evaluateWaterfallTrajectory(path, 1)).toEqual({ position: { x: 3, y: 7, z: 2 }, velocity: { x: 3, y: -8, z: 0 } });
    const hit = traceWaterfallLanding(path, options);
    const t = (2 + Math.sqrt(204)) / 10;
    expect(hit.kind).toBe('water'); expect(hit.timeS).toBeCloseTo(t, 9);
    expect(hit.position.x).toBeCloseTo(3 * t, 9); expect(hit.position.y).toBeCloseTo(0, 9);
    expect(hit.velocity.y).toBeCloseTo(2 - 10 * t, 9);
  });

  it('hits the first terrain obstruction instead of bending around it towards the pool', () => {
    const hit = traceWaterfallLanding(path, { ...options, terrainHeight: x => x >= 1 ? 11 : null });
    expect(hit.kind).toBe('terrain'); expect(hit.position.x).toBeCloseTo(1, 9);
    expect(hit.position.y).toBeGreaterThan(10); expect(hit.timeS).toBeCloseTo(1 / 3, 9);
  });

  it('changes landing range with the receiving seasonal plane, preserving launch velocity', () => {
    const low = traceWaterfallLanding(path, options);
    const high = traceWaterfallLanding(path, { ...options, receivingWaterHeight: () => 5 });
    expect(high.kind).toBe('water'); expect(high.position.y).toBeCloseTo(5, 9);
    expect(high.position.x).toBeLessThan(low.position.x);
    expect(high.velocity.x).toBe(low.velocity.x);
  });

  it('leaves an initial source plane before finding a subsequent landing', () => {
    const hit = traceWaterfallLanding(path, { ...options, receivingWaterHeight: () => 10 });
    expect(hit.kind).toBe('water'); expect(hit.timeS).toBeCloseTo(.4, 9);
    expect(hit.velocity.y).toBeCloseTo(-2, 9);
    const attached = traceWaterfallLanding({ ...path, velocity: { x: 3, y: 0, z: 0 } },
      { ...options, receivingWaterHeight: () => 10 });
    expect(attached.kind).toBe('none');
    if (attached.kind === 'none') expect(attached.reason).toBe('never-detached');
  });

  it('rejects an embedded lip and cannot pass through source terrain before departure', () => {
    const embedded = traceWaterfallLanding({ ...path, lip: { ...path.lip, y: -1 } }, options);
    expect(embedded.kind).toBe('none');
    if (embedded.kind === 'none') expect(embedded.reason).toBe('embedded-lip');
    expect(embedded.timeS).toBe(0);
    const obstructed = traceWaterfallLanding({ ...path, velocity: { x: 3, y: 0, z: 0 } },
      { ...options, terrainHeight: x => x < 1 ? 10 : null });
    expect(obstructed.kind).toBe('none');
    if (obstructed.kind === 'none') expect(obstructed.reason).toBe('never-detached');
    expect(obstructed.position.x).toBeLessThan(1);
  });

  it('bounds time, travelled distance and sampling when there is no receiver', () => {
    const empty = { ...options, maxDistanceM: 1000, receivingWaterHeight: () => null };
    const timed = traceWaterfallLanding(path, empty);
    expect(timed.kind).toBe('none'); expect(timed.timeS).toBe(5);
    if (timed.kind === 'none') expect(timed.reason).toBe('time-limit');
    const distance = traceWaterfallLanding(path, { ...empty, maxDistanceM: 1 });
    expect(distance.distanceM).toBeLessThanOrEqual(1); expect(distance.distanceM).toBeCloseTo(1, 9);
    if (distance.kind === 'none') expect(distance.reason).toBe('distance-limit');
    const bounded = traceWaterfallLanding(path, { ...empty, maxSteps: 2 });
    expect(bounded.samples).toBe(3);
    if (bounded.kind === 'none') expect(bounded.reason).toBe('step-limit');
  });

  it('rejects invalid trajectories, sampling bounds and receiver heights', () => {
    expect(() => evaluateWaterfallTrajectory({ ...path, gravityMPS2: 0 }, 1)).toThrow();
    expect(() => evaluateWaterfallTrajectory(path, -1)).toThrow();
    expect(() => traceWaterfallLanding(path, { ...options, maxSteps: Infinity })).toThrow();
    expect(() => traceWaterfallLanding(path, { ...options, terrainHeight: () => NaN })).toThrow();
  });
});
