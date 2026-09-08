import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BURIED_GUARD, CONTACT_FOAM_M, EDGE_FADE_M, FIELD_MAX_SLOPE, FLECK, FOAM_CYCLE_S, OWNER_DILATE_M,
  STRIP_AERATION_GLSL, STRIP_WHITE, createWaterMaterial, createWaterUniforms,
  stripAeration, stripAlbedo, stripBankProfile, stripStreakGain, stripStreakPhase, stripWhitewaterBlend, WATER_TIERS,
} from "./waterMaterial";
import { STRIP_BANK_FADE_START, STRIP_BANK_M } from "./ChannelStrips";
import { STREAK_LAYERS } from "./whitewaterStreaks";
import { BURIED_DEPTH_M } from "../waterData";
import type { WaterAssets } from "./types";

const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
function assetsFor(version: 1 | 2): WaterAssets {
  return {
    meta: {
      schemaVersion: version,
      surface: { file: "s.png", size: 2017, metresPerPixel: 3.65568, minM: -1, maxM: 500,
        buryM: 3, ownerFile: "water-owner.png",
        ...(version === 2 ? { depthMinM: -6, depthSpanM: 30.6 } : {}) },
      flow: { file: "f.png", size: 1345, metresPerPixel: 5.48, flowMax: 3, shoreMaxM: 160 },
      klass: { file: "k.png", size: 1345, metresPerPixel: 5.48, classes: ["none"] },
    },
    surfaceTex: texture, flowTex: texture, klassTex: texture, shoreTex: texture,
    ownerTex: texture,
  } as unknown as WaterAssets;
}
const assets = assetsFor(2);

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

function compile(mode: "field" | "strip", a: WaterAssets = assets, tier = WATER_TIERS.high) {
  const uniforms = createWaterUniforms(a);
  const material = createWaterMaterial("above",
    { csm: null, applyAerial: () => {}, assets: a, uniforms, tier }, mode);
  const shader = stubShader();
  material.onBeforeCompile!(shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    {} as THREE.WebGLRenderer);
  return { shader, uniforms, material };
}

/** Strip comments so a test cannot pass on a sentence in a comment. */
const code = (src: string) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("signed depth in the shader (decision 0047)", () => {
  it("decodes v2 signed depth and v1 unsigned depth from the same uniforms", () => {
    const v2 = compile("field", assetsFor(2)).uniforms;
    expect(v2.uSurfDepthMin.value).toBe(-6);
    expect(v2.uSurfDepthSpan.value).toBe(30.6);
    expect(v2.uSurfBuried.value).toBe(BURIED_DEPTH_M);
    const v1 = compile("field", assetsFor(1)).uniforms;
    expect(v1.uSurfDepthMin.value).toBe(0);
    expect(v1.uSurfDepthSpan.value).toBe(25.5);
    // v1 dry texels carry depth 0: they must still be excluded from the
    // level weighting, so the threshold sits just above zero
    expect(v1.uSurfBuried.value).toBeGreaterThan(0);
    expect(v1.uSurfBuried.value).toBeLessThan(0.1);
    const frag = code(compile("field").shader.fragmentShader);
    expect(frag).toContain("return vec2(w, t.b * uSurfDepthSpan + uSurfDepthMin);");
    expect(frag).not.toContain("t.b * 25.5");
    expect(frag).toContain("step(uSurfBuried, s00.y)");
  });

  it("keeps the vertex depth signed + lifted, never clamped", () => {
    const vert = code(compile("field").shader.vertexShader);
    expect(vert).toContain("float esVDepth = esSurf.y + (esStill - esSurf.x);");
    expect(vert).not.toContain("max(esSurf.y + (esStill - esSurf.x), 0.0)");
  });

  it("discards the field only as a buried guard, a cliff guard and the owner mask", () => {
    const frag = code(compile("field").shader.fragmentShader);
    const discards = frag.match(/discard;/g) ?? [];
    expect(discards).toHaveLength(3);
    expect(frag).toContain(`${BURIED_GUARD.nearM.toFixed(2)} - ${BURIED_GUARD.perMetre.toFixed(3)} * esGuardDist`);
    expect(frag).toContain(`${BURIED_GUARD.floorM.toFixed(1)})) discard;`);
    expect(BURIED_GUARD.nearM).toBeLessThan(0);
    expect(BURIED_GUARD.floorM).toBeGreaterThan(BURIED_DEPTH_M);
    expect(frag).toContain(`> ${FIELD_MAX_SLOPE.toFixed(1)}) discard;`);
    expect(frag).toContain("if (uHasOwner > 0.5 && esOwnedNearby(vEsWorldPos.xz)) discard;");
    expect(frag).toContain(`float e = ${OWNER_DILATE_M.toFixed(2)};`);
    expect(OWNER_DILATE_M).toBeLessThan(2 * STRIP_BANK_M + 1);
    // the old per-fragment raster wetness cut and manual occlusion are gone
    expect(frag).not.toContain("if (vEsData.y <= 0.004) discard;");
    expect(frag).not.toContain(".y <= 0.004) discard;");
    expect(frag).not.toContain("esSceneEye < esFragEye - 0.02");
    // and no falling-water shading on the field (falls are sheets)
    expect(frag).not.toContain("esFall");
    // strips discard nothing at all
    expect(code(compile("strip").shader.fragmentShader)).not.toContain("discard");
  });

  it("fades the shoreline by VERTICAL thickness from the unrefracted scene depth", () => {
    const frag = code(compile("field").shader.fragmentShader);
    expect(frag).toContain("vec3 esCamFwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);");
    expect(frag).toContain("float esSceneT = esSceneEye / max(dot(esRay, esCamFwd), 1e-3);");
    expect(frag).toContain("esTv = (vEsWorldPos.y - esSceneW.y) / max(uVerticalScale, 1e-3);");
    expect(frag).toContain(`float esEdgeSoft = smoothstep(0.0, ${EDGE_FADE_M.toFixed(2)}, esTv);`);
    expect(frag).toContain(`smoothstep(0.0, ${CONTACT_FOAM_M.toFixed(2)}, esTv + (esCn0 - 0.45) * 0.10)`);
    // the refracted read is only for the transmitted colour, rejected in front
    expect(frag).toContain("if (esSceneEyeR < esFragEye) { esRUV = esScreenUV; esSceneEyeR = esSceneEye; }");
    expect(frag).toContain("texture2D(uSceneColor, esRUV).rgb * esT");
    expect(frag).not.toContain("smoothstep(0.0, 0.10, esThick)");
    expect(frag).not.toContain("smoothstep(0.015, 0.24, esThick)");
  });
});

describe("flowing water (decision 0047 item 6)", () => {
  it("compiles the flow-wave twin into the field vertex stage, gated at 0.15 m/s", () => {
    const vert = code(compile("field").shader.vertexShader);
    expect(vert).toContain("float esFlowWave(vec2 pos, vec2 dir, float speed, float t, out vec3 normal)");
    expect(vert).toContain("if (esFlowSp > 0.15) {");
    expect(vert).toContain("esFlowH = esFlowWave(esRestW.xz, esFlowV / esFlowSp, esFlowSp, uWaveTime, esFlowN) * esFlowFade;");
    expect(vert).toContain("(esStill + esW.disp.y + esFlowH) * uVerticalScale");
    // strips never undulate (a Gerstner-sized swing throws the ribbon off its bed)
    const strip = code(compile("strip").shader.vertexShader);
    expect(strip).not.toContain("esFlowH = esFlowWave(");
  });

  it("gates every flow term at 0.15 m/s on a 6 s transport cycle and drifts detail with the current", () => {
    const frag = code(compile("field").shader.fragmentShader);
    expect(FOAM_CYCLE_S).toBe(6);
    expect(frag).toContain("bool esFlowing = esSpeed > 0.15;");
    expect(frag).not.toContain("esSpeed > 0.3)");
    expect(frag).toContain("float esCycle = 6.0;");
    expect(frag).toContain("float esPh1 = fract(uTransportTime / esCycle);");
    expect(frag).not.toContain("fract(uTransportTime * 0.25)");
    // scroll distance per cycle is speed x cycle: 1 m/s moves foam 1 m/s
    expect(frag).toContain("(vEsWorldPos.xz - esDrift * esPh1 * esCycle) * 0.55");
    expect(frag).toContain("float esAdv = min(esSpeed, 2.5) * esCycle;");
    // detail ripple follows esDrift on flowing water; the fixed drift is still-water only
    expect(frag).toContain("vec2 esQ1 = (vEsWorldPos.xz - esDrift * esPh1 * esCycle) * 2.3 + 17.0;");
    expect(frag).toMatch(/else \{\s*esGF = esDetailGrad\(vEsWorldPos\.xz \* 2\.3 \+ 17\.0, vec2\(0\.11, 0\.07\) \* uWaveTime\)/);
    // barcode guards stay
    expect(frag).not.toContain("dot(vEsWorldPos.xz, esFDirN)");
    expect(frag).toContain("esG -= esFDirN * dot(esG, esFDirN) * (1.0 - 1.0 / esStretch);");
    // waves and surf stay on the wave clock
    expect(code(compile("field").shader.vertexShader)).toContain("esSwash(esShore, esFetch, uWaveTime, esSurfWind)");
  });

  it("draws river flecks only on flowing river-class water, advected 1:1", () => {
    const frag = code(compile("field").shader.fragmentShader);
    expect(frag).toContain("if (esFlowing && vEsKlass.w > 2.5 && vEsKlass.w < 3.5) {");
    expect(frag).toContain(`smoothstep(${FLECK.lo.toFixed(3)}, ${FLECK.hi.toFixed(3)}, esFk)`);
    expect(code(compile("field").shader.vertexShader)).toContain("esKl.r * 255.0);");
  });

  it("fleck threshold covers a few percent of a river (esFbm ported)", () => {
    // Port of the shader's esHash21 / esNoised / esFbm (2 octaves).
    const fract = (v: number) => v - Math.floor(v);
    const hash = (x: number, y: number) => {
      let px = fract(x * 123.34);
      let py = fract(y * 456.21);
      const d = px * (px + 45.32) + py * (py + 45.32);
      px += d; py += d;
      return fract(px * py);
    };
    const noise = (x: number, y: number) => {
      const px = Math.floor(x), py = Math.floor(y);
      const fx = x - px, fy = y - py;
      const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
      const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const a = hash(px, py), b = hash(px + 1, py), c = hash(px, py + 1), d = hash(px + 1, py + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
    const fbm = (x: number, y: number, oct: number) => {
      let amp = 0.5, sum = 0;
      for (let i = 0; i < oct; i++) {
        sum += amp * noise(x, y);
        const nx = 1.6 * x - 1.2 * y, ny = 1.2 * x + 1.6 * y;
        x = nx; y = ny; amp *= 0.5;
      }
      return sum;
    };
    const sstep = (e0: number, e1: number, v: number) => {
      const t = Math.min(Math.max((v - e0) / (e1 - e0), 0), 1);
      return t * t * (3 - 2 * t);
    };
    let cover = 0, n = 0;
    for (let z = 0; z < 60; z += 0.25) {
      for (let x = 0; x < 60; x += 0.25) {
        // two phases half a cycle apart at 1 m/s, blended like the shader
        const f1 = fbm((x - 1.5) * FLECK.scale + 5, z * FLECK.scale + 5, 2);
        const f2 = fbm((x - 4.5) * FLECK.scale + 5, z * FLECK.scale + 5, 2);
        cover += sstep(FLECK.lo, FLECK.hi, f1 * 0.5 + f2 * 0.5);
        n++;
      }
    }
    const pct = (cover / n) * 100;
    expect(pct).toBeGreaterThan(3);
    expect(pct).toBeLessThan(6);
  });
});

describe("whitewater strips (decision 0047 item 4)", () => {
  it("drives the strip from per-vertex hydraulics plus its own ribbon UV", () => {
    const { shader, material } = compile("strip");
    const vert = code(shader.vertexShader);
    expect(vert).toContain("#define ES_STRIP 1");
    for (const attribute of ["aStill", "aBedDepth", "aFlow", "aSeason", "aDrop", "aSide", "aSideM", "aArc", "aScroll", "aEdge"]) {
      expect(vert).toContain(`attribute ${attribute === "aFlow" ? "vec2" : "float"} ${attribute};`);
    }
    expect(vert).toContain("vEsStrip = vec4(aSideM, aArc, aScroll, aEdge);");
    expect(vert).toContain("float esStill = esSurf.x + uLevelSeason * aSeason;");
    expect(material.polygonOffset).toBe(true);
    expect(material.customProgramCacheKey!()).toContain("strip");
  });

  it("aeration follows the slope x speed blend (research §4.2.2) and is monotone in both", () => {
    // w = smoothstep(0.06, 0.30, slope) · smoothstep(0.8, 3.0, speed)
    expect(stripWhitewaterBlend(0.02, 5)).toBe(0);
    expect(stripWhitewaterBlend(0.5, 0.5)).toBe(0);
    expect(stripWhitewaterBlend(0.3, 3)).toBe(1);
    expect(stripWhitewaterBlend(0.18, 1.9)).toBeCloseTo(0.25, 6);
    expect(stripAeration(0, 0)).toBeCloseTo(0.25, 6);
    expect(stripAeration(0.6, 4)).toBeCloseTo(1.0, 6);
    expect(stripAeration(0.3, 1)).toBeGreaterThan(stripAeration(0.1, 1));
    expect(stripAeration(0.3, 3)).toBeGreaterThan(stripAeration(0.3, 1));
    // the 0047 classifier's steep floor (0.035) alone does not make whitewater
    expect(stripAeration(0.035, 4)).toBeLessThan(0.3);
    // bank coverage: full over the COMPILED width, dissolved across the margin
    // only, monotone and never above 1 (it can never paint a bright line)
    const edge = (1.5 + STRIP_BANK_M) / 1.5;
    expect(stripBankProfile(0, edge)).toBe(1);
    expect(stripBankProfile(STRIP_BANK_FADE_START, edge)).toBe(1);
    expect(stripBankProfile(1, edge)).toBeGreaterThan(0.3);
    expect(stripBankProfile(edge, edge)).toBe(0);
    let prev = 1;
    for (let s = 0; s <= edge + 0.1; s += 0.01) {
      const v = stripBankProfile(s, edge);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });

  it("albedo mixes toward aerated white and is never the silt-tan brown", () => {
    const tan = [0.115, 0.085, 0.048];
    for (const a of [0.25, 0.5, 0.8, 1]) {
      for (const streak of [0, 0.5, 1]) {
        for (const tannin of [0, 1]) {
          const c = stripAlbedo(a, streak, 0, tannin);
          // never a warm/brown hue: red never dominates green
          expect(c[0]).toBeLessThanOrEqual(c[1] + 1e-9);
          // never the silt-tan point
          expect(Math.hypot(c[0] - tan[0], c[1] - tan[1], c[2] - tan[2])).toBeGreaterThan(0.02);
        }
      }
    }
    expect(stripAlbedo(1, 1, 0, 0)).toEqual([...STRIP_WHITE]);
    expect(stripAlbedo(1, 1, 0, 0)[0]).toBeGreaterThan(stripAlbedo(0.25, 0, 0, 0)[0]);
  });

  it("scrolls three streak layers along the ribbon's own arc, downstream, body at the ribbon speed", () => {
    // a feature at arc 10 at t=0 sits at arc 10 + 2.5 x 4 at t=4 (scroll 2.5 m/s)
    expect(stripStreakPhase(10, 2.5, 0)).toBeCloseTo(stripStreakPhase(20, 2.5, 4), 9);
    expect(stripStreakPhase(20, 2.5, 4)).toBeLessThan(stripStreakPhase(20, 2.5, 0));
    // foam layer 2.7x the body, accent 0.24x: the measured spread, never one belt
    const rate = (layer: number) => (stripStreakPhase(0, 2.5, 0, layer) - stripStreakPhase(0, 2.5, 1, layer));
    expect(rate(0)).toBeCloseTo(2.5, 9);
    expect(rate(1) / rate(2)).toBeGreaterThanOrEqual(6.7 * (STREAK_LAYERS[1].tileM / STREAK_LAYERS[2].tileM));
    expect(stripStreakGain(2.5) * STREAK_LAYERS[0].rateMS).toBeCloseTo(2.5, 9);
    const frag = code(compile("strip").shader.fragmentShader);
    expect(frag).toContain("float esStreak = esWhitewater(esStripU, vEsStrip.y, uTransportTime, esStripGain(vEsStrip.z), 0.5, esStripFoam);");
    expect(frag).toContain("float vv = arcM / tile - (rate * gain * t) / tile;");
    expect(frag).toContain("float esAer = esStripAeration(vEsFlow.z, esSpeed);");
    expect(frag).toContain("esWhite *= mix(0.15, 1.0, esBlend);");
    expect(frag).toContain("float esBank = esStripBank(vEsSide, vEsStrip.w);");
    // never world position x time on a ribbon
    expect(frag).not.toContain("vEsWorldPos.xz * 0.085 - esDrift * uTransportTime");
    expect(frag).toContain(`vec3(${STRIP_WHITE.map((v) => v.toFixed(2)).join(", ")})`);
    expect(frag).toContain("vec3 esT = vec3(1.0 - esAer);");
    expect(frag).toContain("roughnessFactor = mix(0.5, 0.9, esWhite);");
    // no silt albedo, no Beer-Lambert, no shoreline/surf terms, no SSR, no refraction
    expect(frag).not.toContain("0.115, 0.085, 0.048");
    expect(frag).not.toContain("exp(-esAbsorb");
    expect(frag).not.toContain("esSurfFoam(esShoreD");
    expect(frag).not.toContain("esPlungeFoam(vEsWorldPos");
    expect(frag).not.toContain("esContactFoam(vEsWorldPos");
    expect(frag).not.toContain("#define ES_SSR");
    expect(frag).not.toContain("uRefractStrength *");
    // bank overlap is the only fade
    expect(frag).toContain("outgoingLight = mix(texture2D(uSceneColor, esScreenUV).rgb, outgoingLight, esBank);");
    // the field never compiles the strip law
    expect(code(compile("field").shader.fragmentShader)).not.toContain("float esStripAeration(float");
    expect(frag).toContain(STRIP_AERATION_GLSL.trim().split("\n")[0]);
  });

  it("the field keeps SSR on the high tier and plunge foam", () => {
    const frag = code(compile("field").shader.fragmentShader);
    expect(frag).toContain("#define ES_SSR 1");
    expect(frag).toContain("esPlungeFoam(vEsWorldPos.xz, vEsFlow.xy)");
    expect(code(compile("field", assets, WATER_TIERS.low).shader.fragmentShader)).not.toContain("#define ES_SSR");
  });
});
