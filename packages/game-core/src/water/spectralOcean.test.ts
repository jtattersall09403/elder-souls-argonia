import { describe, expect, it } from "vitest";
import { inverseFFT2D, SpectralOcean } from "./spectralOcean";

describe("bounded spectral ocean", () => {
  it("turns shorter travelling seas toward weather without changing long swell or spectral RMS", () => {
    const ocean = new SpectralOcean(); ocean.update(0);
    const initial = ocean.cascades.map(c => c.directionalEnergy);
    ocean.setWindVelocity({ x: -6.6, z: 7.5 });
    ocean.update(8);
    const alongTarget = (direction: { x: number; z: number }) => -0.66 * direction.x + 0.75 * direction.z;
    expect(alongTarget(ocean.cascades[2].directionalEnergy) - alongTarget(initial[2]))
      .toBeGreaterThan(alongTarget(ocean.cascades[1].directionalEnergy) - alongTarget(initial[1]));
    ocean.update(240);
    expect(ocean.cascades[0].directionalEnergy).toEqual(initial[0]);
    for (const c of ocean.cascades.slice(1)) {
      expect(alongTarget(c.directionalEnergy)).toBeGreaterThan(0.5);
      expect(c.directionalEnergy.expectedRmsM).toBeCloseTo(c.spec.rmsHeightM, 12);
    }
  });

  it("keeps endpoints continuous through an abrupt180-degree wind change even far from the origin", () => {
    const ocean = new SpectralOcean(); ocean.update(8.01);
    const old = ocean.sample(918271, -778125);
    const endpoints = ocean.cascades.map(c => c.next.slice());
    ocean.setWindVelocity({ x: -6.6, z: 7.5 }); ocean.update(8.01);
    expect(ocean.sample(918271, -778125)).toEqual(old);
    ocean.cascades.forEach((c, i) => expect(c.next).toEqual(endpoints[i]));
    const boundary = (ocean.frame + 1) * ocean.stepSeconds;
    ocean.update(boundary - 1e-8); const before = ocean.sample(918271, -778125);
    ocean.update(boundary + 1e-8);
    const after = ocean.sample(918271, -778125);
    expect(after.height).toBeCloseTo(before.height, 6);
    expect(after.slopeX).toBeCloseTo(before.slopeX, 6);
    expect(after.slopeZ).toBeCloseTo(before.slopeZ, 6);
  });

  it("retains calm wave history and is deterministic for identical weather histories", () => {
    const a = new SpectralOcean(), b = new SpectralOcean();
    for (const ocean of [a, b]) {
      ocean.update(0); ocean.setWindVelocity({ x: 5, z: 1 });
      for (let step = 1; step <= 30; step++) ocean.update(step / 15);
      const before = ocean.cascades.map(c => c.directionalEnergy);
      ocean.setWindVelocity({ x: 0, z: 0 }); ocean.update(120);
      expect(ocean.cascades.map(c => c.directionalEnergy)).toEqual(before);
    }
    a.cascades.forEach((c, i) => expect(c.next).toEqual(b.cascades[i].next));
    expect(a.sample(123, 456)).toEqual(b.sample(123, 456));
  });

  it("bounds directional work to future endpoints, including time jumps and repeated physics samples", () => {
    const ocean = new SpectralOcean(); ocean.setWindVelocity({ x: -8, z: 0 }); ocean.update(0);
    ocean.update(100000);
    expect(ocean.cascades.map(c => c.directionalUpdates)).toEqual([0, 1, 1]);
    const out = { height: 0, slopeX: 0, slopeZ: 0 }, revision = ocean.revision;
    for (let i = 0; i < 10000; i++) ocean.sample(i * 0.17, -i * 0.11, out);
    expect(ocean.revision).toBe(revision);
    expect(ocean.cascades.map(c => c.directionalUpdates)).toEqual([0, 1, 1]);
    for (const cascade of ocean.cascades) expect(cascade.directionalEnergy.activeModes).toBeLessThanOrEqual(4096);
  });

  it("matches a direct complex inverse DFT, including normalisation", () => {
    const n = 4, real = Float64Array.from({ length: n * n }, (_, i) => Math.sin(i * 1.3));
    const imaginary = Float64Array.from(real, (_, i) => Math.cos(i * 0.7));
    const expectedReal = new Float64Array(n * n), expectedImaginary = new Float64Array(n * n);
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      for (let kz = 0; kz < n; kz++) for (let kx = 0; kx < n; kx++) {
        const i = kz * n + kx, phase = 2 * Math.PI * (kx * x + kz * z) / n;
        expectedReal[z * n + x] += (real[i] * Math.cos(phase) - imaginary[i] * Math.sin(phase)) / (n * n);
        expectedImaginary[z * n + x] += (real[i] * Math.sin(phase) + imaginary[i] * Math.cos(phase)) / (n * n);
      }
    }
    inverseFFT2D(real, imaginary, n);
    for (let i = 0; i < real.length; i++) {
      expect(real[i]).toBeCloseTo(expectedReal[i], 12);
      expect(imaginary[i]).toBeCloseTo(expectedImaginary[i], 12);
    }
  });

  it("is deterministic, finite, zero-mean and has distinct swell/chop bands", () => {
    const a = new SpectralOcean(), b = new SpectralOcean();
    a.update(23.45); b.update(23.45);
    for (let c = 0; c < a.cascades.length; c++) {
      const field = a.cascades[c].previous;
      expect(field).toEqual(b.cascades[c].previous);
      let mean = 0, square = 0;
      for (let i = 0; i < field.length; i += 4) { mean += field[i]; square += field[i] ** 2; }
      expect(Math.abs(mean / (field.length / 4))).toBeLessThan(1e-8);
      const rms = Math.sqrt(square / (field.length / 4));
      expect(rms).toBeGreaterThan(a.cascades[c].spec.rmsHeightM * 0.6);
      expect(rms).toBeLessThan(a.cascades[c].spec.rmsHeightM * 1.4);
      expect(field.every(Number.isFinite)).toBe(true);
    }
  });

  it("updates only fixed temporal endpoints and never catches up after a time jump", () => {
    const ocean = new SpectralOcean();
    ocean.update(0.01);
    const revision = ocean.revision, arrays = ocean.cascades.map(c => c.next);
    ocean.update(0.02); expect(ocean.revision).toBe(revision);
    const before = ocean.sample(31, 72);
    ocean.update(0.02 + 1e-6);
    expect(Math.abs(ocean.sample(31, 72).height - before.height)).toBeLessThan(1e-5);
    ocean.update(100000); expect(ocean.revision).toBe(revision + 1);
    ocean.cascades.forEach((c, i) => expect(c.next).toBe(arrays[i]));
    expect(ocean.sample(-9000, 8500).height).not.toBeNaN();
  });

  it("joins temporal endpoints continuously and wraps each spatial grid", () => {
    const ocean = new SpectralOcean();
    ocean.update(ocean.stepSeconds - 1e-8);
    const before = ocean.sample(12, 53);
    ocean.update(ocean.stepSeconds + 1e-8);
    expect(ocean.sample(12, 53).height).toBeCloseTo(before.height, 6);
    for (const cascade of ocean.cascades) {
      const a = { height: 0, slopeX: 0, slopeZ: 0 }, b = { ...a };
      cascade.sample(-2, 3, 0.25, a);
      cascade.sample(-2 + cascade.spec.lengthM, 3 - cascade.spec.lengthM, 0.25, b);
      expect(a.height).toBeCloseTo(b.height, 12);
      expect(a.slopeX).toBeCloseTo(b.slopeX, 12);
      expect(a.slopeZ).toBeCloseTo(b.slopeZ, 12);
    }
  });
});
