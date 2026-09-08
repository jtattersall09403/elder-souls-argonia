import { describe, expect, it } from "vitest";
import { decodeWaterRasters } from "./loadWaterAssets";
import { BURIED_DEPTH_M, buriedThresholdM, decodeDepthByte, type WaterMeta } from "../waterData";

function meta(version: 1 | 2): WaterMeta {
  return {
    schemaVersion: version,
    surface: { file: "", size: 2, metresPerPixel: 4, minM: -10, maxM: 90, buryM: 3,
      ...(version === 2 ? { depthMinM: -6, depthSpanM: 30.6 } : {}) },
    flow: { file: "", size: 2, metresPerPixel: 4, flowMax: 3, shoreMaxM: 160 },
    klass: { file: "", size: 2, metresPerPixel: 4, classes: ["none"] },
  };
}

describe("water-surface.png decode (v1 unsigned, v2 signed)", () => {
  it("v1: B is 0.1 m steps from zero; dry is exactly 0", () => {
    expect(decodeDepthByte(0, meta(1))).toBe(0);
    expect(decodeDepthByte(20, meta(1))).toBeCloseTo(2, 9);
    expect(decodeDepthByte(255, meta(1))).toBeCloseTo(25.5, 9);
    expect(buriedThresholdM(meta(1))).toBeGreaterThan(0);
  });

  it("v2: B is signed, −6 … +24.6 m in 0.12 m quanta", () => {
    expect(decodeDepthByte(0, meta(2))).toBeCloseTo(-6, 9);
    expect(decodeDepthByte(50, meta(2))).toBeCloseTo(0, 9);
    expect(decodeDepthByte(255, meta(2))).toBeCloseTo(24.6, 9);
    expect(decodeDepthByte(51, meta(2)) - decodeDepthByte(50, meta(2))).toBeCloseTo(0.12, 9);
    expect(buriedThresholdM(meta(2))).toBe(BURIED_DEPTH_M);
  });

  it("decodes W, depth, shore and season from raw RGBA in one pass", () => {
    const m = meta(2);
    // texel 0: W = minM + 0.5 span, depth byte 50 (0 m); texel 1: dry buried
    const surf = new Uint8ClampedArray([128, 0, 50, 255, 0, 0, 0, 255, 0, 0, 255, 255, 255, 255, 25, 255]);
    const shore = new Uint8ClampedArray([255, 128, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 51, 0, 0, 255]);
    const d = decodeWaterRasters(m, surf, shore);
    expect(d.surface[0]).toBeCloseTo(-10 + (128 * 256 / 65535) * 100, 6);
    expect(d.depth[0]).toBeCloseTo(0, 5);
    expect(d.depth[1]).toBeCloseTo(-6, 5);
    expect(d.depth[2]).toBeCloseTo(24.6, 5);
    expect(d.depth[3]).toBeCloseTo(-3, 5);
    expect(d.shore[0]).toBe(160);
    expect(d.season[0]).toBeCloseTo(128 / 255, 5);
    expect(d.shore[3]).toBeCloseTo(32, 5);
  });
});
