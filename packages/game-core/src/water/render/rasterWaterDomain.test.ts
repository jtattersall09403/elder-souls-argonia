import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WaterData, type WaterMeta } from '../waterData';
import { rasterDomainCells, rasterDomainVertex } from './rasterWaterDomain';
import * as THREE from 'three';
import { WaterWorld } from '../waterWorld';
import { createWaterMaterial, createWaterUniforms, WATER_TIERS } from './waterMaterial';
import type { WaterAssets } from './types';

function neighbours(eastHead: number) {
  const grid = { file: '', size: 65, metresPerPixel: 1, gridOriginM: 0 };
  const meta: WaterMeta = { surface: { ...grid, minM: 0, maxM: 10, buryM: 3, nativeChannelCoverage: true },
    flow: { ...grid, flowMax: 3, shoreMaxM: 160 }, klass: { ...grid, classes: ['none', 'coast', 'estuary', 'river', 'lake'] },
    bodies: [{ index: 1, id: 'water.test.west', basinIndex: 10 }, { index: 2, id: 'water.test.east', basinIndex: 10 }] };
  const heights = new Float32Array(65 * 65), support = new Uint8ClampedArray(heights.length * 4);
  const klass = new Uint8ClampedArray(support.length);
  for (let z = 0; z < 65; z++) for (let x = 0; x < 65; x++) {
    const i = z * 65 + x; heights[i] = x < 32 ? 5 : eastHead;
    support.set([255, 0, x < 32 ? 1 : 2, 255], i * 4); klass[i * 4] = 4;
  }
  return new WaterData(meta, heights, new Float32Array(heights.length).fill(2), new Uint8ClampedArray(support.length), klass,
    undefined, undefined, support);
}

describe('shared raster hydraulic-domain partition', () => {
  it.each([5, 9])('fills the finest-LOD ownership strip without bridging heads (east head %s)', eastHead => {
    const data = neighbours(eastHead);
    let area = 0, westArea = 0, eastArea = 0;
    // The original corner-owner rejection loses this entire1×64m strip.
    for (const cell of rasterDomainCells(data, { minX: 31, maxX: 32, minZ: 0, maxZ: 64 })) {
      const cellArea = (cell.maxX - cell.minX) * (cell.maxZ - cell.minZ); area += cellArea;
      if (cell.bodyIndex === 1) westArea += cellArea; else eastArea += cellArea;
      const corners = [[cell.minX, cell.minZ], [cell.maxX, cell.minZ], [cell.minX, cell.maxZ], [cell.maxX, cell.maxZ]];
      for (const [x, z] of corners) {
        const vertex = rasterDomainVertex(data, cell, x, z);
        expect(vertex.sample.surfaceBase).toBeCloseTo(cell.bodyIndex === 1 ? 5 : eastHead, 12);
        expect(vertex.sample.depthProxy).toBe(2);
        expect(vertex.sample.waterBodyId).toBe(cell.sample.waterBodyId);
        expect(vertex.sampleX).toBe(Math.fround(vertex.sampleX));
        expect(vertex.sampleX).toBeGreaterThan(cell.samplingBounds.minX);
        expect(vertex.sampleX).toBeLessThan(cell.samplingBounds.maxX);
        expect(data.rasterBodyIndexAt(vertex.sampleX, vertex.sampleZ)).toBe(cell.bodyIndex);
      }
    }
    expect(area).toBe(64); expect(westArea).toBe(32); expect(eastArea).toBe(32);
    expect(data.boundaryAt(31.75, 20, undefined, false).surfaceBase).toBe(eastHead);
    expect(data.rasterBodyIndexAt(31.75, 20)).toBe(2); // Not shared basin10.
  });

  it('binds explicit raster stage/base and hero ownership without changing native/legacy mode values', () => {
    const shader = readFileSync(new URL('./waterMaterial.ts', import.meta.url), 'utf8');
    expect(shader).toContain('if (waterOverride.w > 0.5 || waterLevelResponse.z > 0.5) esSurf = vec2(waterOverride.x, waterOverride.x - waterGround);');
    expect(shader).toContain('if (waterLevelResponse.z > 0.5) esStage.yz = waterLevelResponse.xy;');
    expect(shader.match(/varying float vRasterExplicit;/g)).toHaveLength(2);
    expect(shader).toContain('(vRibbon > 0.5 || vRasterExplicit > 0.5) ? vWaterBodyIndex');
    expect(shader).toContain('(waterOverride.w < 0.5 && waterLevelResponse.z > 0.5) ? waterOverride.yz : esRestW.xz');
    expect(shader).toContain('esKl.r = esClassAt(esDataXZ) / 255.0');
    expect(shader).toContain('waterOverride.yz : esFlowAt(esDataXZ)');
    expect(shader).toContain('esOceanSpectrum(esRestW.xz');
  });

  it('injects the shared domain binding into both actual Three physical shader variants', () => {
    const data = neighbours(9), texture = new THREE.DataTexture();
    const world = new WaterWorld(data, { tidalAmplitudeM: .5, seasonalAmplitudeM: 1.4, seasonScalar: () => 0 });
    const assets: WaterAssets = { data, world, meta: data.meta, surfaceTex: texture, flowTex: texture, klassTex: texture,
      shoreTex: texture, supportTex: texture, characterTex: texture, tidalAmplitudeM: .5, seasonalAmplitudeM: 1.4 };
    for (const nativeRibbonLayout of [false, true]) for (const variant of ['above', 'below'] as const) {
      const material = createWaterMaterial(variant, { assets, uniforms: createWaterUniforms(assets), tier: WATER_TIERS.high,
        csm: null, applyAerial: () => {}, nativeRibbonLayout });
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
      material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
      expect(shader.vertexShader.match(/varying float vRasterExplicit;/g)).toHaveLength(1);
      expect(shader.fragmentShader.match(/varying float vRasterExplicit;/g)).toHaveLength(1);
      expect(shader.vertexShader).toContain('esClassAt(esDataXZ)');
      expect(shader.vertexShader).toContain('esOceanSpectrum(esRestW.xz');
      expect(shader.fragmentShader).toContain('vRasterExplicit > 0.5');
      expect(shader.fragmentShader).toContain('if (abs(owner - vWaterBodyIndex) > 0.5) discard;');
      expect(shader.fragmentShader).toContain('raster.y + vEsWorldPos.y / max(uVerticalScale, 0.001) - raster.x');
      expect(shader.vertexShader.includes('attribute vec4 waterOverride;')).toBe(!nativeRibbonLayout);
      expect(shader.vertexShader.includes('#define waterOverride vec4(position.y, waterRibbonFlow.xz, 1.0)')).toBe(nativeRibbonLayout);
      expect(shader.vertexShader.includes('#define waterLevelResponse vec3(waterRibbonResponse, waterRibbonResponseValid)')).toBe(nativeRibbonLayout);
      expect(material.customProgramCacheKey()).toContain(nativeRibbonLayout ? 'native-ribbon' : 'general');
      material.dispose();
    }
    texture.dispose();
  });
});
