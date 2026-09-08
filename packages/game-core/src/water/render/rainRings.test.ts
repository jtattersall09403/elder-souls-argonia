import { describe, expect, it } from "vitest";
import { RAIN_RINGS, RAIN_RINGS_GLSL, rainRingGradient, rainRingSlope } from "./rainRings";

const code = (src: string) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("analytic rain drop rings (study §3.1 (6))", () => {
  it("is silent with no rain and beyond the fade distance, bounded in slope inside it", () => {
    expect(rainRingGradient(3.3, 4.4, 10, 0, 5)).toEqual([0, 0]);
    expect(rainRingGradient(3.3, 4.4, 10, 1, RAIN_RINGS.fadeEndM + 1)).toEqual([0, 0]);
    let peak = 0;
    let energy = 0;
    for (let i = 0; i < 4000; i++) {
      const g = rainRingGradient(i * 0.037, i * 0.011, i * 0.013, 1, 3);
      expect(Number.isFinite(g[0]) && Number.isFinite(g[1])).toBe(true);
      peak = Math.max(peak, Math.hypot(g[0], g[1]));
      energy += Math.hypot(g[0], g[1]);
    }
    expect(peak).toBeLessThan(0.6);   // a slope, never a firefly
    expect(energy / 4000).toBeGreaterThan(0.005); // and visibly there under full rain
  });

  it("rings grow with age from their cell centre and fade as they age", () => {
    // one ring in isolation: the slope peaks a half-width either side of the
    // ring radius, and that peak decays as (1 − age)²
    const peakSlope = (age: number, dist: number) => {
      let best = 0;
      for (let s = -0.3; s <= 0.3; s += 0.001) best = Math.max(best, Math.abs(rainRingSlope(s, age, dist, 1)));
      return best;
    };
    expect(peakSlope(0.5, 0)).toBeLessThan(peakSlope(0.1, 0));
    expect(peakSlope(0.5, 0) / peakSlope(0.1, 0)).toBeCloseTo((0.5 * 0.5) / (0.9 * 0.9), 6);
    expect(rainRingSlope(0, 0.3, 0, 1)).toBeCloseTo(0, 12);      // flat on the ring crest
    expect(rainRingSlope(0.01, 0.3, 0, 1)).toBeLessThan(0);   // falling outward
    expect(rainRingSlope(-0.01, 0.3, 0, 1)).toBeGreaterThan(0);
    // in the field: the strongest gradient along a ray from a cell centre
    // moves outward with time inside one drop cycle
    const cell = RAIN_RINGS.cellM;
    const cx = 12, cz = 7;
    const ox = (cx + 0.5) * cell, oz = (cz + 0.5) * cell;
    const ringRadius = (t: number) => {
      let best = 0, bestR = 0;
      for (let r = 0.02; r < 0.6; r += 0.005) {
        const g = rainRingGradient(ox + r, oz, t, 1, 0);
        const m = Math.hypot(g[0], g[1]);
        if (m > best) { best = m; bestR = r; }
      }
      return { r: bestR, m: best };
    };
    let grew = false;
    for (let t = 0; t < RAIN_RINGS.periodS * 2 && !grew; t += 0.02) {
      const early = ringRadius(t);
      const late = ringRadius(t + 0.4);
      grew = early.m > 0.01 && late.m > 0.005 && late.r > early.r + 0.05;
    }
    expect(grew).toBe(true);
  });

  it("scales with rain intensity and widens with distance", () => {
    let light = 0, heavy = 0, near = 0, far = 0;
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.041, z = i * 0.017, t = i * 0.01;
      const gl = rainRingGradient(x, z, t, 0.3, 2);
      const gh = rainRingGradient(x, z, t, 1.0, 2);
      const gn = rainRingGradient(x, z, t, 1.0, 2);
      const gf = rainRingGradient(x, z, t, 1.0, 60);
      light += Math.hypot(gl[0], gl[1]); heavy += Math.hypot(gh[0], gh[1]);
      near = Math.max(near, Math.hypot(gn[0], gn[1])); far = Math.max(far, Math.hypot(gf[0], gf[1]));
    }
    expect(heavy).toBeGreaterThan(light * 2);
    expect(far).toBeLessThan(near * 0.5); // wider, lower rings at distance
  });

  it("GLSL twin bakes the same cell, period, radius and fade constants", () => {
    const glsl = code(RAIN_RINGS_GLSL);
    expect(glsl).toContain("vec2 esRainRings(vec2 wp, float t, float intensity, float dist)");
    expect(glsl).toContain(`float cell = ${RAIN_RINGS.cellM.toFixed(2)};`);
    expect(glsl).toContain(`floor(t / ${RAIN_RINGS.periodS.toFixed(2)} + phase)`);
    expect(glsl).toContain(`age * ${RAIN_RINGS.maxRadiusM.toFixed(2)}`);
    expect(glsl).toContain(`smoothstep(${RAIN_RINGS.fadeStartM.toFixed(1)}, ${RAIN_RINGS.fadeEndM.toFixed(1)}, dist)`);
    expect(glsl).toContain("esHash21(c + cyc * vec2(0.618, 0.414))");
    expect(glsl).toContain("float gs = -2.0 * s * A * exp(-(s * s) / (w * w)) / (w * w);");
  });
});
