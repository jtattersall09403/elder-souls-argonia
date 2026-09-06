import { describe, expect, it } from 'vitest';
import { advectRippleField } from './rippleAdvection';

function stateFor(size: number, labels: Uint16Array, maskSize: number) {
  const state = new Float32Array(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const label = labels[Math.floor((z + 0.5) * maskSize / size) * maskSize + Math.floor((x + 0.5) * maskSize / size)];
    state[(z * size + x) * 4 + 2] = (label & 255) / 255;
    state[(z * size + x) * 4 + 3] = (label >>> 8) / 255;
  }
  return state;
}
function centroid(state: Float32Array, size: number, patchM: number, component = 0) {
  let mass = 0, x = 0, z = 0;
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const value = state[(row * size + col) * 4 + component];
    mass += value; x += value * (col + 0.5) * patchM / size; z += value * (row + 0.5) * patchM / size;
  }
  return { mass, x: x / mass, z: z / mass };
}

describe('physical ripple-current transport', () => {
  it('moves height and wave-velocity centroids by current times elapsed seconds', () => {
    const size = 64, maskSize = 32, patchM = 16;
    const labels = new Uint16Array(maskSize * maskSize).fill(513), current = new Float32Array(maskSize * maskSize * 2);
    for (let i = 0; i < current.length; i += 2) { current[i] = 3.75; current[i + 1] = -1.5; }
    let state = stateFor(size, labels, maskSize);
    state[(32 * size + 16) * 4] = 1; state[(32 * size + 16) * 4 + 1] = 0.2;
    const start = centroid(state, size, patchM);
    for (let i = 0; i < 60; i++) state = advectRippleField(state, size, labels, current, maskSize, patchM, 1 / 60);
    for (const component of [0, 1]) {
      const end = centroid(state, size, patchM, component);
      expect(end.x - start.x).toBeCloseTo(3.75, 5);
      expect(end.z - start.z).toBeCloseTo(-1.5, 5);
      expect(end.mass).toBeCloseTo(component ? 0.2 : 1, 5);
    }
  });

  it('moves 3m/s through a 0.4s visible frame instead of the four-step wave solver cap', () => {
    const size = 64, maskSize = 32, patchM = 16, labels = new Uint16Array(maskSize ** 2).fill(1);
    const current = new Float32Array(maskSize ** 2 * 2);
    for (let i = 0; i < current.length; i += 2) current[i] = 3;
    const initial = stateFor(size, labels, maskSize); initial[(32 * size + 16) * 4] = 1;
    for (const dt of [1 / 60, .4]) {
      let state = initial;
      for (let i = 0; i < Math.round(2 / dt); i++) state = advectRippleField(state, size, labels, current, maskSize, patchM, dt);
      expect((centroid(state, size, patchM).x - centroid(initial, size, patchM).x) / 2).toBeCloseTo(3, 4);
    }
  });

  it('expires over-budget local backtraces rather than freezing or slowing their old history', () => {
    const size = 64, maskSize = 256, labels = new Uint16Array(maskSize ** 2).fill(1), current = new Float32Array(maskSize ** 2 * 2);
    for (let i = 0; i < current.length; i += 2) current[i] = 12;
    const state = stateFor(size, labels, maskSize);
    for (let i = 0; i < state.length; i += 4) state[i] = .2;
    const result = advectRippleField(state, size, labels, current, maskSize, 8, .4);
    for (let i = 0; i < result.length; i += 4) { expect(result[i]).toBe(0); expect(result[i + 2]).toBeCloseTo(1 / 255); }
  });

  it('leaves valid zero-current history bit-for-bit unchanged', () => {
    const labels = new Uint16Array(64).fill(7), current = new Float32Array(128), state = stateFor(16, labels, 8);
    for (let i = 0; i < state.length; i += 4) { state[i] = Math.sin(i) * 0.2; state[i + 1] = Math.cos(i) * 0.1; }
    expect(advectRippleField(state, 16, labels, current, 8, 8, 1 / 60)).toEqual(state);
  });

  it('does not transport through a diagonal dry corner shared by same-owner pools', () => {
    const labels = new Uint16Array(64), current = new Float32Array(128);
    labels[2 * 8 + 2] = labels[3 * 8 + 3] = 1;
    for (let i = 0; i < current.length; i++) current[i] = 3;
    let state = stateFor(16, labels, 8);
    for (let z = 4; z <= 5; z++) for (let x = 4; x <= 5; x++) state[(z * 16 + x) * 4] = 1;
    for (let frame = 0; frame < 12; frame++) state = advectRippleField(state, 16, labels, current, 8, 4, 1 / 60);
    for (let z = 6; z <= 7; z++) for (let x = 6; x <= 7; x++) expect(state[(z * 16 + x) * 4]).toBe(0);
  });

  it('blocks thin same-owner banks and rejects history from another or newly admitted body', () => {
    const labels = new Uint16Array(16 * 16).fill(2), current = new Float32Array(16 * 16 * 2);
    for (let z = 0; z < 16; z++) labels[z * 16 + 8] = 0;
    for (let i = 0; i < current.length; i += 2) current[i] = 12;
    let state = stateFor(32, labels, 16);
    for (let z = 0; z < 32; z++) for (let x = 0; x < 16; x++) state[(z * 32 + x) * 4] = 0.2;
    for (let frame = 0; frame < 10; frame++) state = advectRippleField(state, 32, labels, current, 16, 8, 1 / 60);
    for (let z = 0; z < 32; z++) for (let x = 18; x < 32; x++) expect(state[(z * 32 + x) * 4]).toBe(0);
    labels.fill(3); // newly admitted owner cannot inherit the old pool's field
    state = advectRippleField(state, 32, labels, current, 16, 8, 1 / 60);
    for (let i = 0; i < state.length; i += 4) expect(state[i]).toBe(0);
  });

  it('preserves the full 12 m/s current at the smallest allowed patch and finest mask', () => {
    const labels = new Uint16Array(256 * 256).fill(1), current = new Float32Array(256 * 256 * 2);
    for (let i = 0; i < current.length; i += 2) current[i] = 12;
    const state = stateFor(32, labels, 256); state[(16 * 32 + 10) * 4] = 1;
    const next = advectRippleField(state, 32, labels, current, 256, 8, 1 / 60);
    expect(centroid(next, 32, 8).x - centroid(state, 32, 8).x).toBeCloseTo(0.2, 6);
  });
});
