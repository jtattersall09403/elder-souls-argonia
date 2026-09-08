import { describe, expect, it } from 'vitest';
import { WaterClock } from './WaterClock';
import { WAVES, gerstnerAt, windWaveSpeed } from './waves';

describe('wave-phase and physical-transport clocks', () => {
  it('keeps 3m/s flow exact at 2.5–144 FPS through calm/storm and paused/accelerated previews', () => {
    for (const fps of [2.5, 10, 30, 60, 144]) for (const wind of [.35, 1, 6]) for (const rate of [0, 1, 8]) {
      const clock = new WaterClock();
      for (let frame = 0; frame < fps * 2; frame++) clock.advance(1 / fps, rate, wind);
      expect(clock.transportS).toBeCloseTo(2, 12);
      expect(clock.phaseS).toBeCloseTo(2 * Math.max(1, rate) * windWaveSpeed(wind), 11);
    }
  });
  it('freezes hidden time and skips the explicit resume gap without mistaking a slow visible frame for suspension', () => {
    const clock = new WaterClock(); clock.advance(.4, 1, 1);
    clock.setHidden(true); clock.advance(120, 8, 6);
    expect(clock.transportS).toBe(.4); expect(clock.phaseS).toBe(.4); expect(clock.deltaS).toBe(0);
    clock.setHidden(false); clock.advance(120, 8, 6);
    expect(clock.transportS).toBe(.4); expect(clock.phaseS).toBe(.4); expect(clock.deltaS).toBe(0);
    clock.advance(.4, 8, 6);
    expect(clock.transportS).toBe(.8); expect(clock.phaseS).toBeCloseTo(.4 + .4 * 8 * windWaveSpeed(6), 12);
    expect(clock.deltaS).toBe(.4);
  });
  it('folds the phase clock on the 8192 s loop with no visible seam', () => {
    const clock = new WaterClock();
    for (let i = 0; i < 100; i++) clock.advance(100, 1, 1);
    expect(clock.transportS).toBeCloseTo(10000, 9);
    expect(clock.phaseS).toBeCloseTo(10000 - WAVES.timePeriodS, 9);
    expect(clock.phaseS).toBeLessThan(WAVES.timePeriodS);
    const a = { dx: 0, dz: 0, height: 0, nx: 0, ny: 1, nz: 0 }, b = { ...a };
    gerstnerAt(40, 70, 10000, 1, a);
    gerstnerAt(40, 70, clock.phaseS, 1, b);
    expect(b.height).toBeCloseTo(a.height, 6);
  });
  it('keeps separate owners and rejects invalid/backwards deltas without resetting phases', () => {
    const a = new WaterClock(), b = new WaterClock(); a.advance(1, 1, 1);
    for (const dt of [-1, NaN, Infinity, 0]) a.advance(dt, 8, 6);
    expect(a.phaseS).toBe(1); expect(a.transportS).toBe(1); expect(a.deltaS).toBe(0);
    expect(b.phaseS).toBe(0); expect(b.transportS).toBe(0);
    b.advance(.5, NaN, NaN); expect(b.phaseS).toBe(.5);
  });
});
