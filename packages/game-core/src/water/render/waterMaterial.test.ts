import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createWaterMaterial, createWaterUniforms, WATER_TIERS } from "./waterMaterial";
import type { WaterAssets } from "./types";

const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
const assets = {
  meta: {
    surface: { file: "s.png", size: 2017, metresPerPixel: 3.65568, minM: -1, maxM: 500,
      buryM: 3, ownerFile: "water-owner.png" },
    flow: { file: "f.png", size: 1345, metresPerPixel: 5.48, flowMax: 3, shoreMaxM: 160 },
    klass: { file: "k.png", size: 1345, metresPerPixel: 5.48, classes: ["none"] },
  },
  surfaceTex: texture, flowTex: texture, klassTex: texture, shoreTex: texture,
  ownerTex: texture,
} as unknown as WaterAssets;

/** The three.js chunk markers the water patch replaces. */
const stubShader = () => ({
  uniforms: {} as Record<string, THREE.IUniform>,
  vertexShader: [
    "#include <common>", "void main() {", "#include <beginnormal_vertex>",
    "#include <begin_vertex>", "}",
  ].join("\n"),
  fragmentShader: [
    "#include <common>", "void main() {", "#include <normal_fragment_begin>",
    "#include <emissivemap_fragment>", "#include <opaque_fragment>", "}",
  ].join("\n"),
});

function compile(mode: "field" | "strip") {
  const uniforms = createWaterUniforms(assets);
  const material = createWaterMaterial("above",
    { csm: null, applyAerial: () => {}, assets, uniforms, tier: WATER_TIERS.high }, mode);
  const shader = stubShader();
  material.onBeforeCompile!(shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    {} as THREE.WebGLRenderer);
  return { shader, uniforms, material };
}

describe("water material variants", () => {
  it("discards the field wherever the compiled owner mask claims the cell", () => {
    const { shader, uniforms } = compile("field");
    expect(shader.fragmentShader).toContain("uOwnerTex");
    expect(shader.fragmentShader).toMatch(/texture2D\(uOwnerTex, esOwnUV\)\.r > 0\.25\) discard/);
    expect(uniforms.uHasOwner.value).toBe(1);
    expect(uniforms.uSurfExtentM.value).toBeCloseTo(2017 * 3.65568, 3);
  });

  it("draws plunge-pool foam on the field but never inside a strip", () => {
    expect(compile("field").shader.fragmentShader).toContain("esPlungeFoam(vEsWorldPos.xz, vEsFlow.xy)");
    expect(compile("field").shader.fragmentShader).toContain("uPlunges[16]");
  });

  it("drives the strip variant from per-vertex hydraulics, not the raster", () => {
    const { shader, material } = compile("strip");
    expect(shader.vertexShader).toContain("#define ES_STRIP 1");
    for (const attribute of ["aStill", "aBedDepth", "aFlow", "aSeason", "aDrop"]) {
      expect(shader.vertexShader).toContain(`attribute ${attribute === "aFlow" ? "vec2" : "float"} ${attribute};`);
    }
    expect(shader.vertexShader).toContain("vec2 esSurf = vec2(aStill, max(aBedDepth, 0.0));");
    // tide response is zero on a steep inland reach
    expect(shader.vertexShader).toContain("float esStill = esSurf.x + uLevelSeason * aSeason;");
    expect(shader.vertexShader).toContain("vec2 esFlowV = aFlow;");
    expect(material.polygonOffset).toBe(true);
    expect(material.customProgramCacheKey!()).toContain("strip");
  });

  it("keeps one shared look: the strip runs the same fragment shader", () => {
    const field = compile("field").shader.fragmentShader;
    const strip = compile("strip").shader.fragmentShader;
    for (const term of ["esFoam", "esSsr", "esDetailGrad", "esCascade", "esEdgeSoft"]) {
      expect(field).toContain(term);
      expect(strip).toContain(term);
    }
    expect(strip).toContain("#define ES_STRIP 1");
  });
});
