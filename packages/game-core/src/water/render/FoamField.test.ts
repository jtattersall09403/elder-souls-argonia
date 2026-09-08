import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  FOAM_FIELD_GLSL, FOAM_FIELD_M, FOAM_LAW, FoamField, MAX_FOAM_INJECTIONS, createFoamFieldUniforms,
  foamDecayTime, foamFieldFragment, foamFieldRecentre, foamInjectKernel, foamStep,
} from "./FoamField";
import { WAVES } from "../waves";

const classes = ["none", "coast", "estuary", "river", "lake", "marsh"];
const stubUniforms = { uSurfTex: { value: null } } as Record<string, THREE.IUniform>;
const opts = { size: 512, samplerGlsl: "// sampler stub", noiseGlsl: "// noise stub", uniforms: stubUniforms, classes };
const code = (src: string) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("foam energy field (study §3.1 (1))", () => {
  it("decays in ~0.5 s at sea, 2–4 s when sheltered, ~1 s once dry", () => {
    expect(foamDecayTime(1, false)).toBe(FOAM_LAW.decaySeaS);
    expect(foamDecayTime(0, false)).toBe(FOAM_LAW.decaySlowS);
    expect(foamDecayTime(0, false)).toBeGreaterThanOrEqual(2);
    expect(foamDecayTime(0, false)).toBeLessThanOrEqual(4);
    expect(foamDecayTime(0, true)).toBe(FOAM_LAW.decayDryS);
    expect(foamDecayTime(1, true)).toBe(FOAM_LAW.decaySeaS);
  });

  it("a sustained fold converges to crestEq × exposure; foam then lingers past the crest", () => {
    let E = 0;
    for (let i = 0; i < 600; i++) E = foamStep(E, 1 / 60, 1, 1, 0, 0);
    expect(E).toBeCloseTo(FOAM_LAW.crestEq, 2);
    // half exposure: half the equilibrium
    let H = 0;
    for (let i = 0; i < 600; i++) H = foamStep(H, 1 / 60, 0.5, 1, 0, 0);
    expect(H).toBeCloseTo(FOAM_LAW.crestEq * 0.5, 2);
    // after the fold passes, energy e-folds on decaySea: still 1/e after 0.5 s
    let T = E;
    for (let i = 0; i < 30; i++) T = foamStep(T, 1 / 60, 1, 0, 0, 0);
    expect(T / E).toBeCloseTo(Math.exp(-0.5 / FOAM_LAW.decaySeaS), 2);
    // windward faces only inject in a freshening wind; never in still water
    expect(foamStep(0, 0.1, 1, 0, 1, 0, false, 1)).toBeCloseTo(FOAM_LAW.windwardEq * 0.1 * (1 - Math.exp(-0.1 / FOAM_LAW.decaySeaS)), 9);
    expect(foamStep(0, 0.1, 1, 0, 1, 0, false, 2)).toBeGreaterThan(foamStep(0, 0.1, 1, 0, 1, 0, false, 1));
    expect(foamStep(0, 0.1, 0, 1, 1, 0)).toBe(0);
    // the surf band deposits even where wave exposure is zero (the waterline)
    expect(foamStep(0, 0.1, 0, 0, 0, 1)).toBeGreaterThan(0);
    // bounded
    expect(foamStep(5, 0.01, 1, 1, 1, 1)).toBeLessThanOrEqual(2);
  });

  it("injection kernel is a soft disc: full at the centre, zero at the radius", () => {
    expect(foamInjectKernel(0, 1, 0.5)).toBe(0.5);
    expect(foamInjectKernel(0.3, 1, 0.5)).toBe(0.5);
    expect(foamInjectKernel(1, 1, 0.5)).toBe(0);
    expect(foamInjectKernel(0.7, 1, 0.5)).toBeGreaterThan(0);
    expect(foamInjectKernel(0.7, 1, 0.5)).toBeLessThan(0.5);
  });

  it("recentres on whole texels and shifts the history by exactly that offset", () => {
    const texel = FOAM_FIELD_M / 512;
    const first = foamFieldRecentre(NaN, NaN, 10.3, -7.6, 512);
    expect(first.cx / texel).toBe(Math.round(first.cx / texel));
    expect(first.shiftU).toBe(0);
    const next = foamFieldRecentre(first.cx, first.cz, 10.3 + 3 * texel, -7.6, 512);
    expect(next.cx - first.cx).toBeCloseTo(3 * texel, 9);
    expect(next.shiftU).toBeCloseTo((3 * texel) / FOAM_FIELD_M, 12);
    expect(next.shiftV).toBe(0);
    // a 256² low-tier field snaps to 2 m texels
    const low = foamFieldRecentre(NaN, NaN, 1.4, 0, 256);
    expect(low.cx).toBe(2);
  });

  it("queues at most 32 injections a frame, points as zero-length paths, rejecting junk", () => {
    const field = new FoamField(opts);
    field.inject(1, 2, 0.5, 0.3);
    field.injectPath(0, 0, 3, 0, 0.6, 0.2);
    field.injectPath(NaN, 0, 3, 0, 0.6, 0.2);
    field.injectPath(0, 0, 3, 0, 0, 0.2);
    field.injectPath(0, 0, 3, 0, 0.6, -1);
    expect(field.pendingCount).toBe(2);
    for (let i = 0; i < 40; i++) field.inject(i, i, 0.5, 0.1);
    expect(field.pendingCount).toBe(MAX_FOAM_INJECTIONS);
    field.suspend();
    expect(field.pendingCount).toBe(0);
    expect(field.info.w).toBe(0);
    field.dispose();
    field.inject(1, 2, 0.5, 0.3);
    expect(field.pendingCount).toBe(0);
  });

  it("the pass advects along the compiled flow, decays by exposure, and injects the fold/wind/surf sources", () => {
    const frag = code(foamFieldFragment(opts));
    expect(frag).toContain("vec2 prevUv = vUv + uShift - flow * dt / uField.z;");
    expect(frag).toContain("float tau = mix(uFoamLaw.w, uFoamLaw.z, expo01);");
    expect(frag).toContain("float keep = exp(-dt / tau);");
    expect(frag).toContain("E += eq * (1.0 - keep);");
    expect(frag).toContain("esWaveSampleEx(wp, exposure, ss.x, standing, uWaveTime)");
    expect(frag).toContain("float fold = smoothstep(0.16, 0.34, w.height);");
    expect(frag).toContain("dot(w.normal.xz, -uWindDir)");
    expect(frag).toContain("esSurfFoam(");
    expect(frag).toContain("esShoreFrothBand(depth, bn)");
    expect(frag).toContain(`uniform vec4 uInjectA[${MAX_FOAM_INJECTIONS}];`);
    expect(frag).toContain("esSegmentDist(wp, A.xy, A.zw)");
    expect(frag).toContain("E *= smoothstep(0.0, 0.04, edge);");
    // the standing ratio table is compiled from the class order given
    expect(frag).toContain("if (ci == 4) base = 0.45;");
    // the low tier compiles fewer bands
    expect(code(foamFieldFragment({ ...opts, waveBands: WAVES.lowTierBands })).match(/esWaveBand\(pos/g)?.length)
      .toBe(WAVES.lowTierBands);
  });

  it("shares the material's uniform objects instead of copying them", () => {
    const field = new FoamField(opts);
    const law = field.law;
    expect(law.uFoamLaw.x).toBe(FOAM_LAW.crestEq);
    expect((field as unknown as { pass: THREE.ShaderMaterial }).pass.uniforms.uSurfTex).toBe(stubUniforms.uSurfTex);
    field.dispose();
  });

  it("fragment sampler fades the field edge and reads zero when inactive", () => {
    const u = createFoamFieldUniforms();
    expect(u.uFoamFieldInfo.value.w).toBe(0);
    const glsl = code(FOAM_FIELD_GLSL);
    expect(glsl).toContain("if (uFoamFieldInfo.w < 0.5) return 0.0;");
    expect(glsl).toContain("smoothstep(0.0, 0.06, uv) * smoothstep(0.0, 0.06, 1.0 - uv)");
  });
});
