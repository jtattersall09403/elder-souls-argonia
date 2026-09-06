import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SpectralOcean } from './spectralOcean';
import { SpectralOceanTextures } from './render/SpectralOceanTextures';
import { WaterData } from './waterData';
import { WaterWorld } from './waterWorld';
import { getWindWaveScale, setWindWaveScale, waveExposure } from './waves';
import { advanceWaveAmplitude } from './waveWeather';
import { LocalWaterPatch } from './LocalWaterPatch';
import { sampleLocalPatchSurface } from './localPatchPresentation';

const originalScale = getWindWaveScale();
afterEach(() => setWindWaveScale(originalScale));

it('prepares weather then wave state before physics without moving contact consumers earlier', () => {
  const sky = readFileSync(new URL('../../../../apps/world-studio/src/sky/WorldSky.tsx', import.meta.url), 'utf8');
  const surface = readFileSync(new URL('./render/WaterSurface.tsx', import.meta.url), 'utf8');
  const pipeline = readFileSync(new URL('./render/WaterPipeline.tsx', import.meta.url), 'utf8');
  expect(sky).toContain('}, legacyWater ? 0 : -2);');
  const start = surface.indexOf('useFrame(function prepareWaterFrame('), end = surface.indexOf('}, -1);', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const prep = surface.slice(start, end);
  for (const expression of ['runtime.advanceClock(delta)', 'oceanTextures.sync()', 'uniforms.uWindWave.value = getWindWaveScale()']) expect(prep).toContain(expression);
  for (const expression of ['hero.update(', 'effects.update(', 'inland.update(']) expect(prep).not.toContain(expression);
  expect(surface.indexOf('hero.update(', end)).toBeGreaterThan(end);
  expect(surface.match(/runtime\.advanceClock\(delta\)/g)).toHaveLength(1);
  expect(pipeline).toContain('}, 1);');
});

// Independent level-zero atlas reader matching actual texel addressing,
// including negative world coordinates and temporally blended Float32 data.
function atlasSample(textures: SpectralOceanTextures, x: number, z: number) {
  const pixels = textures.field.image.data as Float32Array, result = [0, 0, 0];
  textures.ocean.cascades.forEach((cascade, layer) => {
    const n = cascade.size, gx = ((x / cascade.spec.lengthM % 1 + 1) % 1) * n;
    const gz = ((z / cascade.spec.lengthM % 1 + 1) % 1) * n;
    const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
      const offset = ((layer * 128 + (iz + dz) % n) * 64 + (ix + dx) % n) * 4;
      const weight = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
      for (let c = 0; c < 3; c++) result[c] += pixels[offset + c] * weight;
    }
  });
  return result;
}

it('keeps physical ocean height and exaggerated render normals on the same weather-transition atlas', () => {
  const grid = { file: '', size: 2, metresPerPixel: 1 };
  const data = new WaterData({ surface: { ...grid, minM: 0, maxM: 1, buryM: 3 },
    flow: { ...grid, flowMax: 3, shoreMaxM: 160 }, klass: { ...grid, classes: ['none', 'coast'] } },
  new Float32Array(4), new Float32Array(4).fill(25.5), new Uint8ClampedArray(16), new Uint8ClampedArray(16));
  const ocean = new SpectralOcean(), textures = new SpectralOceanTextures(ocean);
  let time = 0, amplitude = .8;
  const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0,
    waveTimeS: () => time, spectralOcean: ocean });
  try {
    for (const dt of [0, 1 / 60, .4, 1 / 60, 1.7, 1e-8]) {
      amplitude = advanceWaveAmplitude(amplitude, 6, dt); setWindWaveScale(amplitude);
      time += dt;
      ocean.setWindVelocity({ x: -8, z: 3 }); ocean.update(time); textures.sync();
      const revision = ocean.revision, pixels = textures.field.image.data;
      for (const [x, z] of [[-512.125, 96.375], [7370.03125, -19.0625]]) {
        const rendered = atlasSample(textures, x, z), physical = world.sample({ x, y: -2, z }, 0);
        const exposure = Math.min(waveExposure(160, 25.5, .25) * amplitude, 25.5 * .45);
        for (const scale of [.5, 1, 3.25]) {
          expect(physical.surfaceHeight * scale).toBeCloseTo(rendered[0] * exposure * scale, 6);
          const displayNormal = [-rendered[1] * exposure * scale, 1, -rendered[2] * exposure * scale];
          const cpuNormal = [physical.surfaceNormal.x, physical.surfaceNormal.y / scale, physical.surfaceNormal.z];
          const a = Math.hypot(...displayNormal), b = Math.hypot(...cpuNormal);
          for (let c = 0; c < 3; c++) expect(cpuNormal[c] / b).toBeCloseTo(displayNormal[c] / a, 6);
        }
      }
      // Repeated gameplay samples cannot rewrite the submitted endpoints.
      expect(ocean.revision).toBe(revision); expect(textures.field.image.data).toBe(pixels);
    }
  } finally { textures.dispose(); }
});

it('keeps existing local impact/displacement history through weather changes without scaling its physical volume', () => {
  const patch = new LocalWaterPatch({ size: 32, cellSizeM: .25, originX: 100, originZ: 100,
    baseHeightM: 10, bodyId: 'pool', groundHeights: new Float32Array(1024).fill(8) });
  patch.moveImmersedSphere('body', { x: 104, y: 9.8, z: 104, radiusM: .4 });
  patch.impulse({ x: 104, z: 104, radiusM: 1, energyJ: 20 });
  const sample = { surfaceBase: 10, depthProxy: 2, supported: true, waterBodyId: 'pool', tideResponse: 0, seasonResponse: 0,
    className: 'lake', shoreDistM: 0, turbidity: 1, tannin: 1, salinity: 0, waveShelter: 0, flowX: 0, flowZ: 0 };
  const world = new WaterWorld({ sample: () => sample } as unknown as WaterData,
    { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0 });
  world.setLocalPatch(patch);
  const volume = patch.volumeOffsetM3, energy = patch.energyJ, revision = patch.revision;
  for (const target of [.35, 6, .35, 6]) {
    setWindWaveScale(target);
    const local = sampleLocalPatchSurface(patch, 104.1, 104.2)!;
    const water = world.sample({ x: 104.1, y: 9, z: 104.2 }, 0);
    for (const scale of [.5, 1, 4]) expect(water.surfaceHeight * scale).toBeCloseTo((10 + local.height) * scale, 10);
    expect(patch.volumeOffsetM3).toBe(volume); expect(patch.energyJ).toBe(energy); expect(patch.revision).toBe(revision);
  }
  world.setLocalPatch(null);
});
