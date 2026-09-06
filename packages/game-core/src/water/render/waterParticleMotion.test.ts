import { expect, it } from 'vitest';
import { waterParticleMotion } from './waterParticleMotion';

it.each([['spray', 0.18, 9.81], ['mist', 1.6, 0], ['foam', 3, 0]] as const)(
  '%s transport is exact under split steps in uniform wind/current', (_kind, drag, gravity) => {
    const origin = { x: 4, y: 8, z: -2 }, velocity = { x: 3, y: 1, z: -4 }, target = { x: -5, y: 0, z: 2 };
    const whole = { ...origin }, wholeVelocity = { ...velocity }, split = { ...origin }, splitVelocity = { ...velocity };
    waterParticleMotion(origin, velocity, target, drag, gravity, 0.4, whole, wholeVelocity);
    for (let i = 0; i < 24; i++) waterParticleMotion(split, splitVelocity, target, drag, gravity, 1 / 60, split, splitVelocity);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(split[axis]).toBeCloseTo(whole[axis], 12);
      expect(splitVelocity[axis]).toBeCloseTo(wholeVelocity[axis], 12);
    }
  });
