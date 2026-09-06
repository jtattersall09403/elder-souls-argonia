import { expect, it } from 'vitest';
import { marineReplaced } from './marineCoverage';

it('replaces only published geometry and preserves all nonmarine render paths', () => {
  const mask = new Float32Array([1, 0, 0, 0]), near = [[2, 2, 4, 4]] as const;
  expect(marineReplaced(-1, 3, 3, mask, 2, 10, near)).toBe(true);
  expect(marineReplaced(-1, 13, 3, mask, 2, 10, near)).toBe(false);
  expect(marineReplaced(-1, -1, 3, mask, 2, 10, near)).toBe(false);
  expect(marineReplaced(-1, 20, 3, mask, 2, 10, near)).toBe(false);
  expect(marineReplaced(-2, 3, 3, mask, 2, 10, near)).toBe(true);
  expect(marineReplaced(-2, 4, 3, mask, 2, 10, near)).toBe(false);
  for (const mode of [-3, 0, 1, 2]) expect(marineReplaced(mode, 3, 3, mask, 2, 10, near)).toBe(false);
  mask.fill(0);
  expect(marineReplaced(-1, 3, 3, mask, 2, 10, [])).toBe(false);
  expect(marineReplaced(-2, 3, 3, mask, 2, 10, [])).toBe(false);
});
