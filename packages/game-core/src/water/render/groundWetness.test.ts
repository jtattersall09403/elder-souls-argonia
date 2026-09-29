import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { WET_BAND_SOFT_M, applyGroundWetness, createGroundWetnessUniforms, hasWetnessRaster, primeGroundWetnessUniforms,
  surfaceWetnessNode, updateGroundLocalWater, type GroundWetnessAssets } from "./groundWetness";

function assets(version: number): GroundWetnessAssets {
  const texture = new THREE.Texture();
  return {
    meta: {
      schemaVersion: version,
      surface: { file: "", size: 64, metresPerPixel: 2, minM: -10, maxM: 100, buryM: 3,
        ...(version === 2 ? { gridOriginM: 0, depthMinM: -6.3, depthSpanM: 30.6 } : {}) },
      flow: { file: "", size: 16, metresPerPixel: 8, flowMax: 3, shoreMaxM: 160 },
      klass: { file: "", size: 32, metresPerPixel: 4, classes: ["none", "coast"],
        ...(version === 2 ? { gridOriginM: 0 } : {}) },
    },
    surfaceTex: texture, shoreTex: texture, klassTex: texture,
    ...(version === 2 ? { supportTex: texture, characterTex: texture } : {}),
  };
}

describe("ground wetness raster compatibility", () => {
  it("registers surface and class grids separately and decodes signed depth metadata", () => {
    const uniforms = createGroundWetnessUniforms();
    primeGroundWetnessUniforms(uniforms, assets(2));
    expect(uniforms.uWetOrigin.value).toBe(0);
    expect(uniforms.uWetDepthMin.value).toBe(-6.3);
    expect(uniforms.uWetDepthSpan.value).toBe(30.6);
    expect(uniforms.uWetParams.value.toArray()).toEqual([-10, 110, 64, 2]);
    expect(uniforms.uWetKlassParams.value.toArray()).toEqual([32, 4, 0]);
    expect(uniforms.uWetHasSupport.value).toBe(1);
  });

  it("clears support/profile bindings and restores half-cell origins on legacy rollback", () => {
    const uniforms = createGroundWetnessUniforms();
    primeGroundWetnessUniforms(uniforms, assets(2));
    primeGroundWetnessUniforms(uniforms, assets(1));
    expect(uniforms.uWetOrigin.value).toBe(1);
    expect(uniforms.uWetKlassParams.value.toArray()).toEqual([32, 4, 2]);
    expect(uniforms.uWetDepthMin.value).toBe(0);
    expect(uniforms.uWetDepthSpan.value).toBe(25.5);
    expect(uniforms.uWetHasSupport.value).toBe(0);
    expect(uniforms.uWetHasCharacter.value).toBe(0);
    expect(hasWetnessRaster(uniforms.uWetSupport)).toBe(false);
    expect(hasWetnessRaster(uniforms.uWetCharacter)).toBe(false);
  });

  it("keeps weather and water state independent between game canvases", () => {
    const first = createGroundWetnessUniforms();
    const second = createGroundWetnessUniforms();
    primeGroundWetnessUniforms(first, assets(2));
    first.uWetLevels.value.set(0.5, 1.4);
    first.uRainWet.value = 1;
    expect(hasWetnessRaster(first.uWetSurf)).toBe(true);
    expect(hasWetnessRaster(second.uWetSurf)).toBe(false);
    expect(second.uWetLevels.value.toArray()).toEqual([0, 0]);
    expect(second.uRainWet.value).toBe(0);
  });

  it("exposes a caustic-only debug scalar that defaults to the shipped look", () => {
    expect(createGroundWetnessUniforms().uWetCausticDebug.value).toBe(1);
  });

  it("the not-buried threshold is the raster's own (v2 signed: -2.5 m; v1 unsigned: any wet depth)", () => {
    const u = createGroundWetnessUniforms();
    primeGroundWetnessUniforms(u, assets(2));
    expect(u.uWetBuried.value).toBe(-2.5);
    primeGroundWetnessUniforms(u, assets(1));
    expect(u.uWetBuried.value).toBeGreaterThan(0);
    expect(u.uWetBuried.value).toBeLessThan(0.1);
  });

  it("the band's softness floor spans several 0.12 m depth quanta (owner 2026-09-14)", () => {
    expect(WET_BAND_SOFT_M).toBeGreaterThanOrEqual(0.3);
    const quantumM = 30.6 / 255;
    expect(0.75 - 0.15).toBeGreaterThan(4 * quantumM);
  });

  it("clears the local field to the placeholder when the patch goes away", () => {
    const u = createGroundWetnessUniforms();
    const field = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    updateGroundLocalWater(u, { active: true, field, originX: 1, originZ: 2, cellSizeM: 0.25, size: 8,
      edgeBlendM: 2, bodyIndex: 7 } as never);
    expect(u.uLocalWaterField.value).toBe(field);
    expect(u.uLocalWaterInfo.value.toArray()).toEqual([1, 2, 0.25, 8]);
    updateGroundLocalWater(u, null);
    expect(hasWetnessRaster(u.uLocalWaterField)).toBe(false);
    expect(u.uLocalWaterActive.value).toBe(0);
  });

  it("wraps colour, roughness and the lighting finish once; a second apply is a no-op", () => {
    const material = new MeshStandardNodeMaterial();
    const u = createGroundWetnessUniforms();
    const lighting = material.setupLightingModel;
    applyGroundWetness(material, u);
    const color = material.colorNode, roughness = material.roughnessNode, wrapped = material.setupLightingModel;
    expect(color).toBeTruthy();
    expect(roughness).toBeTruthy();
    expect(wrapped).not.toBe(lighting);
    applyGroundWetness(material, u);
    expect(material.colorNode).toBe(color);
    expect(material.roughnessNode).toBe(roughness);
    expect(material.setupLightingModel).toBe(wrapped);
    material.dispose();
  });

  it("builds the wet-total node from explicit host inputs", () => {
    const u = createGroundWetnessUniforms();
    expect(surfaceWetnessNode(u, { worldPosition: [0, 0, 0], worldNormal: [0, 1, 0], verticalScale: 1 } as never)).toBeTruthy();
  });
});
