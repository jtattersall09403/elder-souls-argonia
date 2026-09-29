import { expect, it } from 'vitest';
import { environmentFit, esEnvironmentFit } from './boundedPhysicalLighting';

it('keeps the Karis environment-BRDF fit bounded and physically ordered', () => {
  for (const r of [0, 0.25, 0.5, 1]) for (const n of [0, 0.5, 1]) {
    const [a, b] = environmentFit(r, n);
    expect(a + b).toBeGreaterThanOrEqual(0);
    expect(a + b).toBeLessThanOrEqual(1.1);
  }
  // smooth, head-on: reflectance scale near 1, bias near 0
  const [a, b] = environmentFit(0, 1);
  expect(a).toBeCloseTo(1.0, 1);
  expect(b).toBeCloseTo(0.0, 1);
  // grazing lifts the bias term
  expect(environmentFit(0, 0)[1]).toBeGreaterThan(environmentFit(0, 1)[1]);
});

it('builds a node graph for the fit', () => {
  expect(esEnvironmentFit([0.5, 0.5])).toBeTruthy();
});
