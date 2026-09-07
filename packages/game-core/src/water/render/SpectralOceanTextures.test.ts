import { describe, expect, it } from 'vitest';
import { SpectralOcean, type SpectralSample } from '../spectralOcean';
import { SpectralOceanTextures, SPECTRAL_OCEAN_GLSL } from './SpectralOceanTextures';

const zero = (): SpectralSample => ({ height: 0, slopeX: 0, slopeZ: 0 });
function filtered(ocean: SpectralOcean, x: number, z: number, footprint: number): SpectralSample {
  const out = zero();
  for (const cascade of ocean.cascades) cascade.sampleFiltered(x, z, ocean.alpha, footprint, out);
  return out;
}

describe('spectral geometry and screen footprint filtering', () => {
  it('retains Fourier phases while rejecting frequencies beyond each reduced grid Nyquist', () => {
    const ocean = new SpectralOcean(); ocean.update(12.3);
    const coefficient = (field: Float32Array, n: number, kx: number, kz: number) => {
      let real = 0, imaginary = 0;
      for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const angle = -2 * Math.PI * (x * kx + z * kz) / n, h = field[(z * n + x) * 4] / n ** 2;
        real += h * Math.cos(angle); imaginary += h * Math.sin(angle);
      }
      return [real, imaginary];
    };
    ocean.cascades.forEach((cascade, layer) => {
      const k = layer === 0 ? 3 : layer === 1 ? 5 : 6;
      const native = coefficient(cascade.next, 64, k, 0), reduced = coefficient(cascade.nextLods[1], 32, k, 0);
      expect(reduced[0]).toBeCloseTo(native[0], 8); expect(reduced[1]).toBeCloseTo(native[1], 8);
      for (let level = 1; level < cascade.nextLods.length; level++) {
        const n = 64 >> level;
        for (const [kx, kz] of [[n / 2, 0], [0, n / 2], [Math.ceil(n * 0.4), Math.ceil(n * 0.4)]]) {
          const value = coefficient(cascade.nextLods[level], n, kx, kz);
          expect(Math.hypot(...value)).toBeLessThan(2e-9);
        }
      }
    });
  });

  it('packs one reusable temporally interpolated atlas and matches CPU samples across mip seams', () => {
    const ocean = new SpectralOcean(); ocean.update(23.45);
    const textures = new SpectralOceanTextures(ocean); textures.sync();
    const pixels = textures.field.image.data as Float32Array;
    expect(textures.previous).toBe(textures.next);
    expect(pixels.byteLength).toBe(393216);
    expect(textures.diagnostics.blendedFloats).toBe(65472);
    const read = (layer: number, level: number, x: number, z: number, channel: number) => {
      const n = 64 >> level, length = ocean.cascades[layer].spec.lengthM;
      const gx = ((x / length % 1 + 1) % 1) * n, gz = ((z / length % 1 + 1) % 1) * n;
      const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
      let value = 0;
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        const row = layer * 128 + 128 - 2 * n + (iz + dz) % n;
        value += pixels[(row * 64 + (ix + dx) % n) * 4 + channel] * (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
      }
      return value;
    };
    for (const footprint of [0.01, 0.125, 0.3, 1.25, 2, 16, 64, 256]) for (let sample = 0; sample < 20; sample++) {
      const x = 8001.171 + sample * 1.117, z = -3017.78 + sample * 0.411, gpu = [0, 0, 0];
      ocean.cascades.forEach((cascade, layer) => {
        const lod = Math.max(0, Math.log2(Math.max(1, 2 * footprint * 64 / cascade.spec.lengthM)));
        const first = Math.floor(lod), blend = lod - first;
        for (let level = first; level <= first + 1; level++) if (level < cascade.previousLods.length) {
          const w = level === first ? 1 - blend : blend;
          for (let channel = 0; channel < 3; channel++) gpu[channel] += read(layer, level, x, z, channel) * w;
        }
      });
      const cpu = filtered(ocean, x, z, footprint);
      expect(gpu[0]).toBeCloseTo(cpu.height, 7); expect(gpu[1]).toBeCloseTo(cpu.slopeX, 7); expect(gpu[2]).toBeCloseTo(cpu.slopeZ, 7);
    }
    const uploads = textures.diagnostics.uploads; textures.sync(); expect(textures.diagnostics.uploads).toBe(uploads);
    ocean.update(23.451); textures.sync(); expect(textures.diagnostics.uploads).toBe(uploads + 1);
    expect(textures.field.image.data).toBe(pixels);
    expect(SPECTRAL_OCEAN_GLSL.match(/uniform sampler2D/g)).toHaveLength(1);
    textures.dispose();
  });

  it('bounds filtered-field error exactly and near rendered-triangle error across wind and temporal endpoints', () => {
    const ocean = new SpectralOcean();
    for (const time of [0, 23.45, 240.031]) {
      ocean.setWindVelocity({ x: time ? -8 : 8, z: 0 }); ocean.update(time);
      const bound = ocean.cascades.reduce((sum, cascade) => sum + cascade.filterErrorBound(2, ocean.alpha), 0);
      let square = 0, maximum = 0;
      for (let i = 0; i < 2000; i++) {
        const x = 7000 + i * 0.791, z = -3000 + i * 1.177, raw = ocean.sample(x, z);
        expect(Math.abs(raw.height - filtered(ocean, x, z, 2).height)).toBeLessThanOrEqual(bound + 1e-7);
        const cell = 0.125, gx = x / cell, gz = z / cell, a = Math.floor(gx) * cell, b = Math.floor(gz) * cell;
        const tx = gx - Math.floor(gx), tz = gz - Math.floor(gz);
        const height = tx + tz <= 1
          ? filtered(ocean, a, b, cell).height * (1 - tx - tz) + filtered(ocean, a + cell, b, cell).height * tx + filtered(ocean, a, b + cell, cell).height * tz
          : filtered(ocean, a + cell, b + cell, cell).height * (tx + tz - 1) + filtered(ocean, a + cell, b, cell).height * (1 - tz) + filtered(ocean, a, b + cell, cell).height * (1 - tx);
        const error = Math.abs(height - raw.height); maximum = Math.max(maximum, error); square += error * error;
      }
      // Unit exposure; actual physical envelope <=6x wind and is further
      // limited by depth*.45. Bound storm error, not just calm screenshots.
      expect(maximum * 6).toBeLessThan(0.025);
      expect(Math.sqrt(square / 2000) * 6).toBeLessThan(0.004);
    }
  });

});
