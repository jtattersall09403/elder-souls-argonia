import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import {
  FLECK, FOAM_TEX, STRIP_WHITE, createWaterMaterial, createWaterUniforms,
  stripAeration, stripAlbedo, stripBankProfile, stripStreakGain, stripStreakPhase, stripWhitewaterBlend, WATER_TIERS,
  type WaterVariant, type WaterSurfaceMode,
} from "./waterMaterial";
import { STRIP_BANK_FADE_START, STRIP_BANK_M } from "./ChannelStrips";
import { STREAK_LAYERS } from "./whitewaterStreaks";
import { BURIED_DEPTH_M } from "../waterData";
import { crestBands, vertexBandWeight, waveBands } from "../waves";
import type { WaterAssets } from "./types";

// Decision 0107: the water is a TSL node graph. These tests check the plain
// maths the graph mirrors, the slots the builder fills, and that every
// variant BUILDS to WGSL and GLSL with each backend's own node builder
// (no GPU, no shader-text assertions, docs/standards/tsl-shaders.md §7).
afterEach(() => vi.restoreAllMocks());

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
    hasOwner: true,
  } as unknown as WaterAssets;
}

const assets = assetsFor(2);
function material(variant: WaterVariant, mode: WaterSurfaceMode, a: WaterAssets = assets, tier = WATER_TIERS.high) {
  const uniforms = createWaterUniforms(a);
  return { uniforms, material: createWaterMaterial(variant, { assets: a, uniforms, tier }, mode) };
}

/** Build the real graph with the backend's node builder (no GPU). */
function build(variant: WaterVariant, mode: WaterSurfaceMode, forceWebGL: boolean, tier = WATER_TIERS.high) {
  const canvas = { style: {}, addEventListener() {}, removeEventListener() {} };
  const renderer = new WebGPURenderer({ forceWebGL, canvas: canvas as unknown as HTMLCanvasElement }) as unknown as {
    hasFeature(): boolean; backend: { hasFeature(): boolean; createNodeBuilder(o: unknown, r: unknown): Record<string, unknown> & { build(): void } };
    lighting: { getNode(s: unknown, c: unknown): { setLights(l: unknown[]): void } };
  };
  renderer.hasFeature = () => false;
  renderer.backend.hasFeature = () => false;
  const { material: m } = material(variant, mode, assets, tier);
  const geometry = new THREE.PlaneGeometry(10, 10, 2, 2).rotateX(-Math.PI / 2);
  if (mode === "strip") {
    const count = geometry.attributes.position.count;
    for (const [name, size] of [["aStill", 1], ["aBedDepth", 1], ["aFlow", 2], ["aSeason", 1], ["aDrop", 1],
      ["aSide", 1], ["aSideM", 1], ["aArc", 1], ["aScroll", 1], ["aRockFoam", 2], ["aEdge", 1]] as const) {
      geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * size), size));
    }
  }
  const mesh = new THREE.Mesh(geometry, m);
  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight();
  scene.add(mesh, light);
  const camera = new THREE.PerspectiveCamera();
  const builder = renderer.backend.createNodeBuilder(mesh, renderer);
  Object.assign(builder, { scene, camera, material: m });
  const lights = renderer.lighting.getNode(scene, camera);
  lights.setLights([light]);
  builder.lightsNode = lights;
  builder.build();
  return { fragment: String(builder.fragmentShader), vertex: String(builder.vertexShader) };
}

describe("water node graph (decision 0107)", () => {
  const cases: [WaterVariant, WaterSurfaceMode, keyof typeof WATER_TIERS][] = [
    ["above", "field", "high"], ["above", "field", "low"], ["below", "field", "high"],
    ["above", "strip", "high"], ["below", "strip", "high"],
  ];
  for (const [variant, mode, tier] of cases) for (const forceWebGL of [false, true]) {
    it(`builds ${variant}/${mode}/${tier} for ${forceWebGL ? "WebGL 2" : "WebGPU"} without warnings`, async () => {
      const warn = vi.spyOn(console, "warn");
      const error = vi.spyOn(console, "error");
      const { fragment, vertex } = build(variant, mode, forceWebGL, WATER_TIERS[tier]);
      expect(fragment.length).toBeGreaterThan(1000);
      expect(vertex.length).toBeGreaterThan(500);
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      const dir = process.env.ES_DUMP_SHADERS;
      if (dir) {
        const fs = await import("node:fs");
        fs.writeFileSync(`${dir}/water-${variant}-${mode}-${tier}-${forceWebGL ? "glsl" : "wgsl"}.txt`, `${fragment}\n//VERTEX\n${vertex}`);
      }
    }, 30000);
  }

  it("fills the slots each variant owns: the field alone carries the buried/slope/owner mask", () => {
    const field = material("above", "field").material;
    const strip = material("above", "strip").material;
    for (const m of [field, strip]) {
      expect(m.positionNode).toBeTruthy();
      expect(m.normalNode).toBeTruthy();
      expect(m.colorNode).toBeTruthy();
      expect(m.roughnessNode).toBeTruthy();
      expect(m.fog).toBe(true);
    }
    expect(field.maskNode).toBeTruthy();
    expect(strip.maskNode).toBeFalsy();
    expect(strip.polygonOffset).toBe(true);
    expect(strip.side).toBe(THREE.DoubleSide);
    expect(material("below", "field").material.side).toBe(THREE.BackSide);
    expect(field.side).toBe(THREE.FrontSide);
  });

  it("uniform nodes are written through .value, arrays through .array, textures swap", () => {
    const { uniforms } = material("above", "field");
    uniforms.uWaveTime.value = 12;
    expect(uniforms.uWaveTime.value).toBe(12);
    uniforms.uBodies.array[0].set(1, 2, 3, 4);
    expect(uniforms.uBodies.array[0].w).toBe(4);
    const t = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    uniforms.uRipple.value = t;
    expect(uniforms.uRipple.value).toBe(t);
    expect(uniforms.uSceneDepth.value).toBe(uniforms.placeholders.depth);
  });
});

describe("crest bands per pixel (perf-diag11 W1, diag12 Q2)", () => {
  it("both tiers pick the two highest-curvature (amp*k^2) whole-vertex bands", () => {
    for (const tier of [WATER_TIERS.high, WATER_TIERS.low]) {
      const picked = crestBands(tier.waveBands, tier.gridCellM, tier.crestBands);
      expect(picked.length).toBe(2);
      const curv = (b: { amp: number; freq: number }) => b.amp * b.freq * b.freq;
      const whole = waveBands().slice(0, tier.waveBands)
        .filter((b) => vertexBandWeight(b.wavelengthM, tier.gridCellM) === 1)
        .map(curv).sort((a, b) => b - a);
      expect(picked.map(curv)).toEqual(whole.slice(0, 2));
    }
    // low: the 17.9 m and 27.7 m bands, not the largest-amplitude 103/66 m
    const low = WATER_TIERS.low;
    expect(crestBands(low.waveBands, low.gridCellM, 2).map((b) => Math.round(b.wavelengthM))).toEqual([18, 28]);
  });
});

describe("water fragment per pixel throughout (f28-f33, perf10 c9 V8)", () => {
  it("the field carries the rest xz and the crest-band height; a strip has no crest and keeps its vertex colour", () => {
    for (const forceWebGL of [false, true]) {
      for (const tier of [WATER_TIERS.high, WATER_TIERS.low]) {
        const field = build("above", "field", forceWebGL, tier);
        expect(field.fragment).toContain("vEsRestXZ");
        expect(field.fragment).toContain("vEsCrestV");
        expect(field.fragment).toContain("vEsSurfH");
        // the along-flow undulation height reaches the fragment for the per-pixel crest swap (perf10 D11)
        expect(field.fragment).toContain("vEsFlowH");
        // the field's colour constituents are per pixel, never a vertex varying
        expect(field.vertex).not.toContain("vEsColour");
      }
      // the strip below reads its colour (the strip above draws whitewater from sal/tan only)
      const strip = build("below", "strip", forceWebGL);
      expect(strip.vertex).not.toContain("vEsCrestV");
      expect(strip.vertex).not.toContain("vEsFlowH");
      expect(strip.fragment).toContain("vEsColour");
    }
  }, 60000);
});

describe("signed depth (decision 0047)", () => {
  it("decodes v2 signed depth and v1 unsigned depth from the same uniforms", () => {
    const v2 = material("above", "field", assetsFor(2)).uniforms;
    expect(v2.uSurfDepthMin.value).toBe(-6);
    expect(v2.uSurfDepthSpan.value).toBe(30.6);
    expect(v2.uSurfBuried.value).toBe(BURIED_DEPTH_M);
    const v1 = material("above", "field", assetsFor(1)).uniforms;
    expect(v1.uSurfDepthMin.value).toBe(0);
    expect(v1.uSurfDepthSpan.value).toBe(25.5);
    // v1 dry texels carry depth 0: they must still be excluded from the
    // level weighting, so the threshold sits just above zero
    expect(v1.uSurfBuried.value).toBeGreaterThan(0);
    expect(v1.uSurfBuried.value).toBeLessThan(0.1);
  });
});

describe("river flecks", () => {
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
  });
});

