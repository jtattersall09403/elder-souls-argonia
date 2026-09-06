import { expect, it } from 'vitest';
import { waterSsrDistances, WATER_SSR_GLSL, WATER_SSR_STEPS } from './waterSsr';

it('spends bounded near samples on contact-scale objects without dropping distant reach', () => {
  const distances = waterSsrDistances();
  expect(distances).toHaveLength(18);
  expect(distances[0]).toBe(0.12);
  expect(distances.filter(distance => distance < 2)).toHaveLength(5);
  expect(distances.every((distance, i) => i === 0 || distance > distances[i - 1])).toBe(true);
  expect(distances.at(-1)).toBeGreaterThan(100);
  expect(distances.at(-1)).toBeLessThan(300);
});

it('requires a crossing, refines only four times and rejects thick depth discontinuities', () => {
  expect(WATER_SSR_GLSL).toContain(`i < ${WATER_SSR_STEPS}`);
  expect(WATER_SSR_GLSL).toContain('previousDiff <= 0.0 && diff > 0.0');
  expect(WATER_SSR_GLSL).toContain('refine < 4');
  expect(WATER_SSR_GLSL).toContain('thickness, hitDiff');
  expect(WATER_SSR_GLSL).not.toContain('diff < 8.0');
});
