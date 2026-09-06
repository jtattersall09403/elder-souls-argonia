import { expect, it } from 'vitest';
import { bubbleRingCoverage, PARTICLE_FOAM_GLSL } from './particleFoam';

it('resolves a hollow near bubble and smoothly integrates a subpixel ring', () => {
  expect(bubbleRingCoverage(0, 0.24, 0.006)).toBe(0);
  expect(bubbleRingCoverage(0.24, 0.24, 0.006)).toBe(1);
  expect(bubbleRingCoverage(0.5, 0.24, 0.006)).toBe(0);
  const widths = [0.006, 0.025, 0.1, 0.5, 2, 10];
  const coverage = widths.map(width => bubbleRingCoverage(0.24, 0.24, width));
  expect(coverage.every((value, i) => i === 0 || value <= coverage[i - 1])).toBe(true);
  expect(coverage.at(-1)).toBeLessThan(0.004);
  for (const width of widths) for (let distance = 0; distance < 2; distance += 0.01) {
    expect(bubbleRingCoverage(distance, 0.24, width)).toBeGreaterThanOrEqual(0);
    expect(bubbleRingCoverage(distance, 0.24, width)).toBeLessThanOrEqual(1);
  }
});

it('does not draw one identical bubble at each hard fract-cell centre', () => {
  expect(PARTICLE_FOAM_GLSL).toContain('random.xy * 0.9');
  expect(PARTICLE_FOAM_GLSL).toContain('y = -1; y <= 1');
  expect(PARTICLE_FOAM_GLSL).toContain('x = -1; x <= 1');
  expect(PARTICLE_FOAM_GLSL).toContain('outer - inner');
  expect(PARTICLE_FOAM_GLSL).not.toContain('fract(cells) - 0.5');
});
