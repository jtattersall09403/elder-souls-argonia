import { describe, expect, it } from 'vitest';
import { advanceFallingSpray, fallingSprayTrajectory } from './fallingSpray';

describe('compiled waterfall spray trajectories', () => {
  const falls = [
    [{ x: 1948.4774, y: 337.0885, z: 210.2016 }, { x: 1953.961, y: 331.8425, z: 217.513 }],
    [{ x: 2112.983, y: 327.5876, z: 266.8646 }, { x: 2118.4666, y: 319.5805, z: 266.8646 }],
    [{ x: -4, y: 18, z: 7 }, { x: 3.01, y: 0.2, z: -2.03 }],
    [{ x: 1, y: 1.1, z: 2 }, { x: 1.01, y: 0, z: 2.01 }],
  ] as const;
  it.each(falls)('is split-step invariant and lands inside even a 1cm plunge footprint (%j)', (lip, plunge) => {
    const one = fallingSprayTrajectory(lip, plunge, 0.13), split = fallingSprayTrajectory(lip, plunge, 0.13);
    const p = { x: 0, y: 0, z: 0 }, v = { ...p }, q = { ...p }, w = { ...p };
    advanceFallingSpray(one, 0.4, p, v);
    for (let i = 0; i < 8; i++) advanceFallingSpray(split, 0.05, q, w);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(p[axis]).toBeCloseTo(q[axis], 10); expect(v[axis]).toBeCloseTo(w[axis], 10);
    }
    expect(advanceFallingSpray(one, 10, p, v)).toBe(true);
    expect(Math.hypot(p.x - plunge.x, p.z - plunge.z)).toBeLessThan(0.005);
    expect(p.y).toBe(plunge.y);
    expect(v.y).toBeCloseTo(-Math.sqrt(19.62 * (lip.y - plunge.y)), 10);
  });
});
