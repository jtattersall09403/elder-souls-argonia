import { expect, it } from 'vitest';
import { LocalWaterPatch } from '../LocalWaterPatch';
import { localWaterFocus } from './localWaterCaustics';

it('does not invent focused light on still flat water or at dry/foreign edges', () => {
  const flat = () => ({ height: 0, slopeX: 0, slopeZ: 0 });
  expect(localWaterFocus(flat, 4, 4, 2, [0, 1, 0], 0.25)).toBe(0);
  expect(localWaterFocus(flat, 4, 4, 2, [0.6, 0.8, 0], 0.25)).toBe(0);
  const bank = (x: number) => x > 4.1 ? null : ({ height: 0.1, slopeX: 0.1, slopeZ: 0 });
  expect(localWaterFocus(bank, 4, 4, 2, [0, 1, 0], 0.25)).toBe(0);
});

it('focuses below crests, defocuses below troughs and stays finite at optical folds', () => {
  const wave = (amplitude: number) => (x: number) => ({
    height: amplitude * Math.cos(x), slopeX: -amplitude * Math.sin(x), slopeZ: 0,
  });
  expect(localWaterFocus(wave(0.1), 0, 0, 2, [0, 1, 0], 0.25)).toBeGreaterThan(0);
  expect(localWaterFocus(wave(0.1), Math.PI, 0, 2, [0, 1, 0], 0.25)).toBeLessThan(0);
  for (let a = -2; a <= 2; a += 0.02) {
    const focus = localWaterFocus(wave(a), 0, 0, 2, [0, 1, 0], 0.25);
    expect(focus).toBeGreaterThanOrEqual(-0.75);
    expect(focus).toBeLessThanOrEqual(2);
  }
});

it('changes the caustic from an actual body disturbance, rather than an unrelated animation', () => {
  const patch = new LocalWaterPatch({ size: 32, cellSizeM: 0.25, originX: 0, originZ: 0,
    bodyId: 'water.pool', baseHeightM: 0, groundHeights: new Float32Array(1024).fill(-2) });
  const sample = (x: number, z: number) => patch.sample(x, z);
  const focus = () => localWaterFocus(sample, 4, 4, 2, [0, 1, 0], 0.25);
  expect(focus()).toBe(0);
  patch.impulse({ x: 4, z: 4, radiusM: 1, energyJ: 4 });
  const initial = focus();
  expect(Math.abs(initial)).toBeGreaterThan(0.001);
  for (let frame = 0; frame < 30; frame++) patch.advance(1 / 60);
  expect(Math.abs(focus() - initial)).toBeGreaterThan(0.001);
  patch.setActive(false);
  expect(focus()).toBe(0);
});
