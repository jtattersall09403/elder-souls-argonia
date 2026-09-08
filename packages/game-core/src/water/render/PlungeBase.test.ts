import { describe, expect, it } from "vitest";
import {
  BASE_DEPTH_FADE_M, BASE_QUADS, BASE_QUAD_SIZE_M, BASE_SCROLL_GAIN, buildPlungeBaseGeometry, plungeBaseAlpha,
  plungeBaseLayout, plungeBaseQuadCount, plungeBaseRadiusM, type PlungeSite,
} from "./PlungeBase";

const site = (over: Partial<PlungeSite> = {}): PlungeSite => ({
  id: "fall-a", plunge: { x: 100, y: 12, z: 50 }, direction: { x: 1, z: 0 }, widthM: 6, dropM: 16, ...over,
});

describe("plunge base kit (vault audit §2.5: geometry, not particles)", () => {
  it("lays 12–19 quads per fall, 12 under a 16 m body and 19 under a 34 m body", () => {
    expect(plungeBaseQuadCount(5)).toBe(BASE_QUADS.min);
    expect(plungeBaseQuadCount(16)).toBe(12);
    expect(plungeBaseQuadCount(34)).toBe(19);
    expect(plungeBaseQuadCount(260)).toBe(BASE_QUADS.max);
    for (const d of [3, 10, 20, 25, 30, 60, 150]) {
      const n = plungeBaseQuadCount(d);
      expect(n).toBeGreaterThanOrEqual(12);
      expect(n).toBeLessThanOrEqual(19);
    }
  });

  it("sizes every quad 2.9–5.7 m, spreading outward from the impact, deterministically", () => {
    const quads = plungeBaseLayout(site());
    expect(quads).toHaveLength(12);
    const R = plungeBaseRadiusM(6, 16);
    for (const q of quads) {
      expect(q.sizeM).toBeGreaterThanOrEqual(BASE_QUAD_SIZE_M.min - 1e-9);
      expect(q.sizeM).toBeLessThanOrEqual(BASE_QUAD_SIZE_M.max + 1e-9);
      expect(q.distM).toBeGreaterThan(0);
      expect(q.distM).toBeLessThanOrEqual(R + 1e-9);
      // the quad's v axis is the outward radial from the impact
      const dx = q.x - 100, dz = q.z - 50;
      const len = Math.hypot(dx, dz);
      expect(dx / len).toBeCloseTo(q.rx, 6);
      expect(dz / len).toBeCloseTo(q.rz, 6);
    }
    expect(plungeBaseLayout(site())).toEqual(quads);
    expect(plungeBaseLayout(site({ id: "fall-b" }))).not.toEqual(quads);
    // more quads land downstream than upstream (the upstream sector is the cliff)
    const down = quads.filter((q) => q.rx > 0).length;
    expect(down).toBeGreaterThan(quads.length / 2);
  });

  it("merges every site into one geometry with the measured quad counts", () => {
    const built = buildPlungeBaseGeometry([site(), site({ id: "fall-b", dropM: 34, plunge: { x: 400, y: 3, z: 9 } })]);
    expect(built.quadCount).toBe(12 + 19);
    expect(built.triangleCount).toBe(built.quadCount * 2);
    expect(built.quadsPerFall).toEqual({ "fall-a": 12, "fall-b": 19 });
    const pos = built.geometry.getAttribute("position");
    expect(pos.count).toBe(built.quadCount * 4);
    // every quad lies flat just above its pool
    const ys = new Set<number>();
    for (let i = 0; i < pos.count; i++) ys.add(Math.round(pos.getY(i) * 1000));
    expect([...ys].sort((a, b) => a - b)).toEqual([3050, 12050]);
    for (const name of ["aBaseUv", "aBaseFade", "aBaseLocal"]) expect(built.geometry.getAttribute(name).count).toBe(pos.count);
  });

  it("fades with distance from the impact, at its own soft edges and over 0.6 m of depth", () => {
    expect(BASE_DEPTH_FADE_M).toBeCloseTo(0.6, 9);
    expect(plungeBaseAlpha(0.5, 0.5, 0.3, 1)).toBeGreaterThan(0.6);
    expect(plungeBaseAlpha(0.5, 0.5, 1.05, 1)).toBe(0);
    expect(plungeBaseAlpha(0.5, 0.5, 0.8, 1)).toBeLessThan(plungeBaseAlpha(0.5, 0.5, 0.3, 1));
    expect(plungeBaseAlpha(0, 0.5, 0.3, 1)).toBe(0);
    expect(plungeBaseAlpha(0.5, 1, 0.3, 1)).toBe(0);
    expect(plungeBaseAlpha(0.5, 0.5, 0.3, 1, 0.05)).toBeLessThan(plungeBaseAlpha(0.5, 0.5, 0.3, 1, 1) * 0.2);
    // the ring's counter-scrolling foam rate: +0.375 tiles/s over the 0.313 body rate
    expect(BASE_SCROLL_GAIN).toBeCloseTo(0.375 / 0.313, 1);
  });
});
