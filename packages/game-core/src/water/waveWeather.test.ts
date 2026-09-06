import { describe, expect, it } from 'vitest';
import { advanceWaveAmplitude } from './waveWeather';

describe('scene-owned water weather amplitude', () => {
  it('seeds actual first weather and preserves the existing authored range', () => {
    expect(advanceWaveAmplitude(NaN, 6, 0)).toBe(6);
    expect(advanceWaveAmplitude(NaN, 20, 0)).toBe(6);
    expect(advanceWaveAmplitude(NaN, -.1, 0)).toBe(.35);
    expect(advanceWaveAmplitude(NaN, NaN, 0)).toBe(1);
  });
  it('does not pop at an abrupt target change, resume, or clock reset', () => {
    for (const dt of [0, -1, NaN, Infinity]) expect(advanceWaveAmplitude(.8, 6, dt)).toBe(.8);
    expect(advanceWaveAmplitude(.8, 6, 1e-8) - .8).toBeLessThan(1e-8);
    expect(advanceWaveAmplitude(6, .35, 8)).toBeCloseTo(.35 + (6 - .35) / Math.E, 12);
  });
  it('is independent of visible frame partition and never clips slow visible frames into a slower response', () => {
    let dense = .8;
    for (let i = 0; i < 120; i++) dense = advanceWaveAmplitude(dense, 6, 1 / 60);
    const sparse = advanceWaveAmplitude(advanceWaveAmplitude(.8, 6, .4), 6, 1.6);
    expect(sparse).toBeCloseTo(dense, 12);
    expect(sparse).toBeCloseTo(6 + (.8 - 6) * Math.exp(-2 / 8), 12);
  });
  it('keeps independent scene histories without singleton state or overshoot', () => {
    let rising = .35, falling = 6;
    for (let i = 0; i < 100; i++) {
      rising = advanceWaveAmplitude(rising, 6, .5);
      falling = advanceWaveAmplitude(falling, .35, .5);
      expect(rising).toBeGreaterThanOrEqual(.35); expect(rising).toBeLessThanOrEqual(6);
      expect(falling).toBeGreaterThanOrEqual(.35); expect(falling).toBeLessThanOrEqual(6);
    }
    expect(rising).toBeGreaterThan(5.9); expect(falling).toBeLessThan(.4);
  });
});
