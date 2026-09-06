import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createGroundWetnessUniforms, primeGroundWetnessUniforms, type GroundWetnessAssets } from "./groundWetness";

function assets(version: number): GroundWetnessAssets {
  const texture = new THREE.Texture();
  return {
    meta: {
      schemaVersion: version,
      surface: { file: "", size: 64, metresPerPixel: 2, minM: -10, maxM: 100, buryM: 3,
        ...(version === 2 ? { gridOriginM: 0, depthMinM: -6.3 } : {}) },
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
    expect(uniforms.uWetHasSupport.value).toBe(0);
    expect(uniforms.uWetHasCharacter.value).toBe(0);
    expect(uniforms.uWetSupport.value).toBeNull();
    expect(uniforms.uWetCharacter.value).toBeNull();
  });

  it("keeps weather and water state independent between game canvases", () => {
    const first = createGroundWetnessUniforms();
    const second = createGroundWetnessUniforms();
    primeGroundWetnessUniforms(first, assets(2));
    first.uWetLevels.value.set(0.5, 1.4);
    first.uRainWet.value = 1;
    expect(second.uWetSurf.value).toBeNull();
    expect(second.uWetLevels.value.toArray()).toEqual([0, 0]);
    expect(second.uRainWet.value).toBe(0);
  });
});
