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

  // decision 0046 batch: the four fixes lost in the restore + the domed edge.
  it("never rotates absolute world coordinates by the flow direction (barcode)", () => {
    const frag = compile("field").shader.fragmentShader;
    expect(frag).not.toContain("dot(vEsWorldPos.xz, esFDirN)");
    expect(frag).not.toContain("mat2 esAniso");
    expect(frag).toContain("esG -= esFDirN * dot(esG, esFDirN) * (1.0 - 1.0 / esStretch);");
    // streaks: three taps of a world-anchored pattern at LOCAL offsets
    expect(frag).toContain("vec2 esSmear = esFDirN * 0.85;");
    expect(frag).toMatch(/esFbm\(esSP1 - esSmear, 2\) \+ esFbm\(esSP1, 2\) \+ esFbm\(esSP1 \+ esSmear, 2\)/);
  });

  it("advects foam and falling water on the transport clock, waves on the wave clock", () => {
    const { shader, uniforms } = compile("field");
    expect(uniforms.uTransportTime.value).toBe(0);
    const frag = shader.fragmentShader;
    expect(frag).toContain("uniform float uTransportTime;");
    expect(frag).toContain("float esPh1 = fract(uTransportTime * 0.25);");
    expect(frag).toContain("float esPh2 = fract(uTransportTime * 0.25 + 0.5);");
    expect(frag).toContain("esY * 0.22 + uTransportTime * 2.6");
    // waves and surf stay on the wind-scaled wave clock
    expect(shader.vertexShader).toContain("esSwash(esShore, esFetch, uWaveTime, esSurfWind)");
  });

  it("keeps the vertex depth signed so dry corners are discarded", () => {
    expect(compile("field").shader.vertexShader)
      .toContain("float esVDepth = esSurf.y + (esStill - esSurf.x);");
    expect(compile("field").shader.vertexShader)
      .not.toContain("max(esSurf.y + (esStill - esSurf.x), 0.0)");
  });

  it("shades waterfalls from the authored grade, not screen derivatives", () => {
    const strip = compile("strip").shader.fragmentShader;
    expect(strip).toContain("esFall = smoothstep(1.2, 3.0, vEsFlow.z);");
    // the field fallback keeps the derivative, unmultiplied by the exaggeration
    expect(compile("field").shader.fragmentShader)
      .toContain("vec2 esDW = vec2(dFdx(vEsData.x), dFdy(vEsData.x));");
    expect(compile("field").shader.fragmentShader)
      .not.toContain("dFdy(vEsData.x)) * uVerticalScale");
  });

  it("interpolates the surface height wet-aware and cuts wetness per fragment", () => {
    const { shader } = compile("field");
    const src = shader.vertexShader + shader.fragmentShader;
    expect(src).toContain("vec4 esWet = vec4(step(0.0004, s00.y), step(0.0004, s10.y),");
    expect(src).toContain("float esWsum = esWw.x + esWw.y + esWw.z + esWw.w;");
    // the depth proxy keeps the plain mix so the fade still reaches zero
    expect(src).toContain("return vec2(esH, esPlain.y);");
    expect(shader.fragmentShader).toContain("if (esSurfaceAt(vEsWorldPos.xz).y <= 0.004) discard;");
  });

  it("drives whitecap density from pixels, not vertices", () => {
    const frag = compile("field").shader.fragmentShader;
    expect(frag).toContain("vec2 esCP = vEsWorldPos.xz * 0.085 - esDrift * uTransportTime * 0.05;");
    expect(frag).toContain("esCrest = max(esCrest, (esCn - 0.62) * 1.6 * clamp(uWindWave, 0.0, 2.0));");
    expect(frag).toContain("float esCrestFade = 1.0 - smoothstep(1200.0, 2400.0, esDist);");
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
