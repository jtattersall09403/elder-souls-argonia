import { describe, expect, it } from "vitest";
import { WATER_TIERS } from "./waterMaterial";
import { WAVES } from "../waves";
import type { WebGLRenderer } from "three";

describe("render quality keeps physical water unchanged", () => {
  it("uses the complete CPU wave spectrum in both tiers", () => {
    expect(WATER_TIERS.high.waveBands).toBe(WAVES.bands);
    expect(WATER_TIERS.low.waveBands).toBe(WAVES.bands);
    expect(WATER_TIERS.low.rtScale).toBeLessThan(WATER_TIERS.high.rtScale);
    expect(WATER_TIERS.low.ssr).toBe(false);
  });
});

it('keeps marine lighting and whitecaps when coarse geometry filters away the swell', async () => {
  const { SpectralOcean } = await import('../spectralOcean');
  const { createWaterMaterial } = await import('./waterMaterial');
  const THREE = await import('three');
  const ocean = new SpectralOcean(); ocean.update(23.45);
  let resolvedCrests = 0;
  for (let i = 0; i < 256; i++) {
    const coarse = { height: 0, slopeX: 0, slopeZ: 0 };
    const pixel = { ...coarse };
    for (const cascade of ocean.cascades) {
      cascade.sampleFiltered(i * 1.717, i * 3.11, ocean.alpha, 70, coarse);
      cascade.sampleFiltered(i * 1.717, i * 3.11, ocean.alpha, .125, pixel);
    }
    expect(coarse).toEqual({ height: 0, slopeX: 0, slopeZ: 0 });
    if (pixel.height > .16) resolvedCrests++;
  }
  expect(resolvedCrests).toBeGreaterThan(0);
  // Check the actual material injections, for both faces: this previously
  // restored only short-band slopes and classified foam from flat geometry.
  for (const variant of ['above', 'below'] as const) {
    const material = createWaterMaterial(variant, {
      csm: null, applyAerial: () => {}, tier: WATER_TIERS.high,
      uniforms: {} as Parameters<typeof createWaterMaterial>[1]['uniforms'],
      assets: {} as Parameters<typeof createWaterMaterial>[1]['assets'],
    });
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0],
      { capabilities: { maxTextures: 16 } } as WebGLRenderer);
    expect(shader.vertexShader).toContain('vOceanDetail = vec4(spectrum.yz, esWaveAmp, spectrum.x)');
    expect(shader.fragmentShader).toContain('esOceanSpectrum(vEsWorldPos.xz, esOceanPixelM, unusedDetailSlope)');
    expect(shader.fragmentShader).toContain('(vOceanDetail.xy - spectrum.yz) * uVerticalScale');
    expect(shader.fragmentShader).toContain('esWhitecapCrest += spectrum.x - vOceanDetail.w');
    if (variant === 'above') expect(shader.fragmentShader.includes('float esCrest = esWhitecapCrest')).toBe(true);
    material.dispose();
  }
});
