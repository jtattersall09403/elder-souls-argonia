import { describe, expect, it } from 'vitest';
import { ripplePathConnected, sampleIsolatedRipple } from './rippleIsolation';

describe('ripple connected-domain stamping and rendering', () => {
  it('rejects diagonal same-owner pools that every old 16-point path sample considered connected', () => {
    const labels = new Uint16Array(16); labels[5] = labels[10] = 1;
    for (let i = 1; i <= 16; i++) {
      const cell = Math.floor(1.5 + i / 16);
      expect(labels[cell * 4 + cell]).toBe(1); // old ray samples jump the exact corner
    }
    expect(ripplePathConnected(labels, 4, 1.5, 1.5, 2.5, 2.5)).toBe(false);
    labels[6] = labels[9] = 1;
    expect(ripplePathConnected(labels, 4, 1.5, 1.5, 2.5, 2.5)).toBe(true);
    labels[6] = 2;
    expect(ripplePathConnected(labels, 4, 1.5, 1.5, 2.5, 2.5)).toBe(false);
  });

  it('follows every crossed cell for grazing/axis paths and stays within the supported radius budget', () => {
    const size = 20, labels = new Uint16Array(size * size).fill(1);
    expect(ripplePathConnected(labels, size, 1.01, 1.01, 8.99, 1.01)).toBe(true);
    labels[1 * size + 4] = 0;
    expect(ripplePathConnected(labels, size, 1.01, 1.01, 8.99, 1.01)).toBe(false);
    expect(ripplePathConnected(labels, size, -1, 1, 1, 1)).toBe(false);
    labels.fill(1); labels[2 * size + 3] = 0;
    expect(ripplePathConnected(labels, size, 1.5, 1.5, 6.5, 4.499999)).toBe(false);
  });

  it('does not render another body or a diagonally disconnected pool through linear height filtering', () => {
    const size = 4, field = new Float32Array(size * size * 4);
    const set = (x: number, z: number, owner: number, height: number) => {
      const i = (z * size + x) * 4; field[i] = height; field[i + 2] = (owner & 255) / 255; field[i + 3] = (owner >>> 8) / 255;
    };
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) set(x, z, x < 2 ? 1 : 2, x < 2 ? 0.3 : 0);
    expect(sampleIsolatedRipple(field, size, 2.01 / size, 2.1 / size)).toEqual({ height: 0, gradientX: 0, gradientZ: 0 });
    field.fill(0); set(1, 1, 1, 0.3); set(2, 2, 1, 0);
    expect(sampleIsolatedRipple(field, size, 2.01 / size, 2.01 / size)).toEqual({ height: 0, gradientX: 0, gradientZ: 0 });
    expect(sampleIsolatedRipple(field, size, 0.1, 0.1)).toEqual({ height: 0, gradientX: 0, gradientZ: 0 });
  });

  it('preserves a smooth linear field inside one connected body', () => {
    const size = 8, field = new Float32Array(size * size * 4);
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const i = (z * size + x) * 4; field[i] = x * 0.02 + z * 0.01; field[i + 2] = 1 / 255;
    }
    const sample = sampleIsolatedRipple(field, size, 3.2 / size, 4.1 / size);
    expect(sample.height).toBeCloseTo(2.7 * 0.02 + 3.6 * 0.01, 7);
    expect(sample.gradientX).toBeCloseTo(0.04, 7); expect(sample.gradientZ).toBeCloseTo(0.02, 7);
  });
});
