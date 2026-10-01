import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BLOOM_DEFAULTS, BloomPass, bloomMipSizes, bloomSource, bloomWeight } from "./BloomPass";

describe("bloomWeight", () => {
  const { threshold: t, knee: k } = BLOOM_DEFAULTS;
  it("is zero below the knee, so ordinary lit surfaces never glow", () => {
    expect(bloomWeight(0.5, t, k)).toBe(0);
    expect(bloomWeight(t - k, t, k)).toBe(0);
  });
  it("rises through the knee and tends to one far above the threshold", () => {
    const a = bloomWeight(t - k / 2, t, k);
    const b = bloomWeight(t, t, k);
    const c = bloomWeight(t + k, t, k);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(bloomWeight(1000, t, k)).toBeGreaterThan(0.99);
  });
});

describe("bloomMipSizes", () => {
  it("starts at half the buffer and halves to the 8 px floor or the cap", () => {
    expect(bloomMipSizes(1920, 1080, 5)).toEqual([[960, 540], [480, 270], [240, 135], [120, 67], [60, 33]]);
    expect(bloomMipSizes(1920, 1080, 8).length).toBe(7); // 15x8 is the last
    expect(bloomMipSizes(64, 32, 8)).toEqual([[32, 16], [16, 8]]);
    expect(bloomMipSizes(4, 4, 5)).toEqual([[2, 2]]);
  });
});

describe("BloomPass disabled", () => {
  it("issues no renderer call, so the frame is the frame without post", () => {
    const calls: string[] = [];
    const renderer = new Proxy({}, {
      get: (_, key) => { calls.push(String(key)); return () => undefined; },
    }) as unknown as THREE.WebGLRenderer;
    const pass = new BloomPass();
    pass.enabled = false;
    pass.render(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), new THREE.Texture(), null);
    expect(calls).toEqual([]);
    expect(pass.mipCount).toBe(0);
    pass.dispose();
  });
});

describe("bloomSource: the sky is not scene content (walk 9 sun blob)", () => {
  const o = BLOOM_DEFAULTS;
  it("a bright sky texel under the sky threshold adds nothing, where the scene threshold would glow it", () => {
    // the Mie halo at low sun: well above the scene threshold, below the disc
    expect(bloomSource(20, false)).toBeGreaterThan(10);
    expect(bloomSource(20, true)).toBe(0);
    expect(bloomSource(o.skyThreshold - o.knee, true)).toBe(0);
  });
  it("the sun's disc glows, never by more than skyMax however bright it is", () => {
    expect(bloomSource(o.skyThreshold * 2, true)).toBe(o.skyMax);
    expect(bloomSource(1e6, true)).toBe(o.skyMax);
    expect(o.skyMax).toBeLessThan(1);
  });
});
