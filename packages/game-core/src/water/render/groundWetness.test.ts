import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SURFACE_WETNESS_GLSL, WATER_RECEIVER_DECLARATIONS, WET_BAND_SOFT_M, createGroundWetnessUniforms, primeGroundWetnessUniforms,
  waterReceiverLight, type GroundWetnessAssets } from "./groundWetness";

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

  it("does not gate caustics on a support raster the field bundle cannot ship", () => {
    const glsl = waterReceiverLight("vEsWorldPos", "esNrmW", "uVerticalScale");
    // the round-1 defect: every province fragment multiplied its caustic
    // visibility by uWetHasSupport, which is 0 for the field bundle
    expect(glsl).not.toMatch(/uWetHasSupport\s*\*\s*step/);
    expect(glsl).toContain("step(0.05, column.y)");
    expect(glsl).toContain("uWetCausticDebug");
  });

  it("decodes the signed depth through the span uniform and gates the wet band on it for v2", () => {
    const glsl = WATER_RECEIVER_DECLARATIONS + SURFACE_WETNESS_GLSL;
    expect(glsl).toContain("sampleValue.b * uWetDepthSpan + uWetDepthMin");
    expect(glsl).not.toContain("* 25.5 + uWetDepthMin");
    expect(glsl).toContain("if (uWetHasSupport > 0.5 || uWetDepthMin < -0.5)");
  });

  it("exposes a caustic-only debug scalar that defaults to the shipped look", () => {
    expect(createGroundWetnessUniforms().uWetCausticDebug.value).toBe(1);
  });

  // 16c round 2 (owner: "wet ground has sharp straight edges and jagged
  // triangular spiky edges"): the band's level mixed buried texels
  // (W = ground − 3 m) into the surface, so the threshold H − W walked 3 m
  // across each last wet texel and the edge followed the texel grid. Same
  // weighting as the water surface's esSurfaceAt / WaterData.surfaceBase.
  it("weights only not-buried texels into the band's level; the depth keeps the plain mix", () => {
    const glsl = WATER_RECEIVER_DECLARATIONS;
    const body = glsl.slice(glsl.indexOf("vec2 esWetSampleSurface("), glsl.indexOf("float esWetSurfEnergy("));
    expect(body).toContain("vec4 wet = vec4(step(uWetBuried, s00.y), step(uWetBuried, s10.y), step(uWetBuried, s01.y), step(uWetBuried, s11.y));");
    expect(body).toContain("(ww.x * s00.x + ww.y * s10.x + ww.z * s01.x + ww.w * s11.x) / wsum");
    expect(body).toContain("return vec2(level, plain.y);");
    // the plain bilinear of the level is gone from the fallback path
    expect(body).not.toMatch(/return mix\(mix\(esWetLevelDepth/);
    // the threshold is the raster's own (v2 signed: −2.5 m; v1 unsigned: any wet depth)
    const u = createGroundWetnessUniforms();
    primeGroundWetnessUniforms(u, assets(2));
    expect(u.uWetBuried.value).toBe(-2.5);
    primeGroundWetnessUniforms(u, assets(1));
    expect(u.uWetBuried.value).toBeGreaterThan(0);
    expect(u.uWetBuried.value).toBeLessThan(0.1);
  });

  it("fades the compiled band by camera distance (no black coastline from the air); rain wetness is unaffected", () => {
    expect(SURFACE_WETNESS_GLSL).toContain("float esWetFade = 1.0 - smoothstep(350.0, 1200.0, distance(cameraPosition.xz, vEsWorldPos.xz));");
    expect(SURFACE_WETNESS_GLSL).toContain("esWetTotal = clamp(esWet * 0.85, 0.0, 1.0) * esWetFade;");
    // the rain term is written after the band and takes the max, untouched by the fade
    const rain = SURFACE_WETNESS_GLSL.slice(SURFACE_WETNESS_GLSL.indexOf("if (uRainWet > 0.003)"));
    expect(rain).toContain("esWetTotal = max(esWetTotal, esRainWet);");
    expect(rain).not.toContain("esWetFade");
  });

  it("the band fades over a hand's depth of height, noise-broken, so its edge is never a drawn line", () => {
    // owner 2026-09-14 (tmp/image.png): "unpleasant sharp edges. The lines
    // themselves are too straight and you can see those jagged triangular
    // spiky edge effect things along the edges". The run-up lift falls to
    // 0.08 m with no surf, and an 8 cm window over a smooth level is an
    // iso-contour of the raster; the depth guard's old 0.2 m window sat on a
    // raster quantised at 0.12 m, which is where the steps and the triangular
    // facets came from.
    expect(WET_BAND_SOFT_M).toBeGreaterThanOrEqual(0.3);
    expect(SURFACE_WETNESS_GLSL).toContain(`float esWetSoft = max(esWetLift, ${WET_BAND_SOFT_M.toFixed(2)});`);
    // the fade, the noise break and the stage cut all run on the SOFTNESS...
    expect(SURFACE_WETNESS_GLSL).toContain("float esAbove = esWetH - esWetW + (esWetN - 0.5) * esWetSoft * 0.9;");
    expect(SURFACE_WETNESS_GLSL).toContain("(1.0 - smoothstep(esWetSoft * 0.55, esWetSoft * 1.65, esAbove))");
    // ...never on the bare lift, which is the band's POSITION up the beach
    expect(SURFACE_WETNESS_GLSL).not.toContain("smoothstep(esWetLift * 0.55, esWetLift * 1.65, esAbove)");
    // the depth guard spans several 0.12 m quanta and is broken by the noise
    expect(SURFACE_WETNESS_GLSL).toContain("smoothstep(esWetSoft * 1.65 + 0.15, esWetSoft * 1.65 + 0.75,");
    expect(SURFACE_WETNESS_GLSL).toContain("-esWetDepth + (esWetN - 0.5) * 0.25);");
    expect(SURFACE_WETNESS_GLSL).not.toContain("esWetLift * 1.65 + 0.1, esWetLift * 1.65 + 0.3");
    const quantumM = 30.6 / 255;
    expect(0.75 - 0.15).toBeGreaterThan(4 * quantumM);
  });

  it("the beach band's lift rides THE surf energy knob (wind + the ocean's fetch), not the wave-scale power", () => {
    expect(WATER_RECEIVER_DECLARATIONS).toContain("float esWetSurfEnergy(float windMS)");
    expect(SURFACE_WETNESS_GLSL).toContain("* esWetSurfEnergy(uWetWindMS)");
    expect(SURFACE_WETNESS_GLSL).not.toContain("pow(uWetWind, 0.8)");
    expect(createGroundWetnessUniforms().uWetWindMS.value).toBe(0);
  });
});
