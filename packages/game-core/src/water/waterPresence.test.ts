import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { WaterData, type WaterMeta } from "./waterData";
import { FoamField } from "./render/FoamField";

// 64² surface at 4 m/texel (256 m), all buried ground except what a case wets.
const SIZE = 64;
const MPP = 4;
function land(wet: [number, number][] = [], depthM = 0.5): WaterData {
  const meta: WaterMeta = {
    surface: { file: "", size: SIZE, metresPerPixel: MPP, minM: -10, maxM: 10, buryM: 3, depthMinM: -6, depthSpanM: 30.6 },
    flow: { file: "", size: SIZE, metresPerPixel: MPP, flowMax: 3, shoreMaxM: 160 },
    klass: { file: "", size: SIZE, metresPerPixel: MPP, classes: ["none", "river"] },
  };
  const depth = new Float32Array(SIZE * SIZE).fill(-3);
  for (const [x, z] of wet) depth[z * SIZE + x] = depthM;
  return new WaterData(meta, new Float32Array(SIZE * SIZE), depth,
    new Uint8ClampedArray(SIZE * SIZE * 4), new Uint8ClampedArray(SIZE * SIZE * 4));
}
const texelCentre = (i: number) => (i + 0.5) * MPP;

describe("WaterData.anyWaterIn (foam-field gate, perf10 f4b)", () => {
  it("is false over buried ground and true for one wet texel inside", () => {
    expect(land().anyWaterIn(0, 0, 256, 256)).toBe(false);
    const stream = land([[40, 21]]);
    expect(stream.anyWaterIn(150, 70, 170, 90)).toBe(true);
    expect(stream.anyWaterIn(0, 0, 100, 60)).toBe(false);
  });

  it("counts a table cell (a lift can wet it) and the bilinear reach of one texel", () => {
    expect(land([[10, 10]], -1.5).anyWaterIn(texelCentre(10), texelCentre(10), texelCentre(10), texelCentre(10))).toBe(true);
    // the rectangle ends just short of the wet texel's centre: the surface's
    // bilinear interpolation still reaches into it
    const d = land([[33, 20]]);
    expect(d.anyWaterIn(0, 0, texelCentre(33) - 1, 256)).toBe(true);
    // well clear of it (past one texel plus a whole block): dry
    expect(d.anyWaterIn(0, 0, texelCentre(33) - 13 * MPP, 256)).toBe(false);
  });

  it("is the open sea beyond the province once the apron is attached", () => {
    const d = land();
    expect(d.anyWaterIn(-10, 0, 20, 20)).toBe(false);
    d.attachApron({ originM: [-100, -100], metresPerSample: 50, nx: 2, ny: 2, heights: new Float32Array(4) } as never);
    expect(d.anyWaterIn(-10, 0, 20, 20)).toBe(true);
  });
});

// The pass's renderer calls, recorded (no GL here).
function fakeRenderer() {
  const calls = { render: 0, clear: 0 };
  const r = {
    getRenderTarget: () => null, setRenderTarget: () => {}, toneMapping: 0, autoClear: true,
    getClearColor: (c: THREE.Color) => c, getClearAlpha: () => 1, setClearColor: () => {},
    getViewport: (v: THREE.Vector4) => v, setViewport: () => {}, getScissor: (v: THREE.Vector4) => v,
    setScissor: () => {}, getScissorTest: () => false, setScissorTest: () => {},
    clear: () => { calls.clear++; }, render: () => { calls.render++; },
  };
  return { r: r as unknown as THREE.WebGLRenderer, calls };
}

describe("FoamField inland gate", () => {
  const field = (data: WaterData) => new FoamField({
    size: 64, worldSizeM: 128, samplerGlsl: "", noiseGlsl: "", uniforms: {}, classes: ["none", "river"],
    waterIn: (a, b, c, d) => data.anyWaterIn(a, b, c, d),
  });

  it("steps when one wet texel lies under the footprint", () => {
    const f = field(land([[40, 21]]));
    const { r, calls } = fakeRenderer();
    f.update(r, 150, 90, 1 / 60);
    f.update(r, 150, 90, 1 / 60);
    expect(f.steps).toBe(2);
    expect(calls.render).toBe(2);
    expect(f.info.w).toBe(1);
  });

  it("inland: drops to an inactive (zero-reading) field and stops stepping; wakes cleared", () => {
    const d = land([[2, 2]]);
    const f = field(d);
    const { r, calls } = fakeRenderer();
    f.update(r, 10, 10, 1 / 60); // over the water
    expect(f.steps).toBe(1);
    f.inject(10, 10, 2, 1);
    for (let i = 0; i < 5; i++) f.update(r, 230, 230, 1 / 60); // inland
    expect(f.steps).toBe(1);
    expect(f.info.w).toBe(0); // the surface reads 0: the history is gone
    expect(f.pendingCount).toBe(0);
    const clears = calls.clear;
    f.update(r, 10, 10, 1 / 60); // back over the water: cleared, then stepped
    expect(f.steps).toBe(2);
    expect(calls.clear).toBe(clears + 2);
    expect(f.info.w).toBe(1);
  });
});
