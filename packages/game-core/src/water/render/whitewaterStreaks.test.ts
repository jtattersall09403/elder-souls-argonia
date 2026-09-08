import { describe, expect, it } from "vitest";
import {
  STREAK_BREATHE_AMPLITUDE, STREAK_BREATHE_PERIOD_S, STREAK_LAYERS, STREAK_RATE_SPREAD, STREAK_RATE_TILES_S,
  STREAK_U_DRIFT_UVS, WHITEWATER_GLSL, streakBreathe, streakSpeedGain, streakUv,
} from "./whitewaterStreaks";

describe("whitewater streak layers (vault audit §4, research §2.3)", () => {
  it("scrolls three layers at the measured tile rates with at least a 6.7x spread", () => {
    expect(STREAK_LAYERS).toHaveLength(3);
    const tilesPerS = STREAK_LAYERS.map((l) => l.rateMS / l.tileM);
    expect(tilesPerS[0]).toBeCloseTo(STREAK_RATE_TILES_S.body, 6);   // 0.313 body shell
    expect(tilesPerS[1]).toBeCloseTo(STREAK_RATE_TILES_S.sheet, 6);  // 0.857 thin sheet
    expect(tilesPerS[2]).toBeCloseTo(STREAK_RATE_TILES_S.slow, 6);   // 0.075 crest slow plane
    expect(Math.max(...tilesPerS) / Math.min(...tilesPerS)).toBeGreaterThanOrEqual(6.7);
    expect(STREAK_RATE_SPREAD).toBeGreaterThanOrEqual(6.7);
    // and no two layers within 10 % of each other in metres/s either
    const ms = STREAK_LAYERS.map((l) => l.rateMS).sort((a, b) => a - b);
    for (let i = 1; i < ms.length; i++) expect(ms[i] / ms[i - 1]).toBeGreaterThan(1.1);
  });

  it("breathes the U scale 1.00 -> 1.05 -> 1.00 over 8.33 s", () => {
    expect(STREAK_BREATHE_PERIOD_S).toBeCloseTo(8.33, 2);
    expect(streakBreathe(0)).toBeCloseTo(1, 9);
    expect(streakBreathe(STREAK_BREATHE_PERIOD_S / 2)).toBeCloseTo(1 + STREAK_BREATHE_AMPLITUDE, 9);
    expect(streakBreathe(STREAK_BREATHE_PERIOD_S)).toBeCloseTo(1, 9);
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 60; t += 0.05) { const b = streakBreathe(t); lo = Math.min(lo, b); hi = Math.max(hi, b); }
    expect(lo).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(hi).toBeLessThanOrEqual(1.05 + 1e-9);
  });

  it("drifts U at 0.030 tiles/s and scrolls V strictly down the arc", () => {
    expect(STREAK_U_DRIFT_UVS).toBeCloseTo(0.03, 9);
    for (let layer = 0; layer < 3; layer++) {
      const L = STREAK_LAYERS[layer];
      // no wobble, breathing at the same phase: the only u change over one
      // breathe period is the drift
      const a = streakUv(layer, 0.5, 10, 0, 1, 0);
      const b = streakUv(layer, 0.5, 10, STREAK_BREATHE_PERIOD_S, 1, 0);
      expect(b.u - a.u).toBeCloseTo(STREAK_U_DRIFT_UVS * STREAK_BREATHE_PERIOD_S, 6);
      // a feature at arc a at t sits at a + rate·dt at t + dt: same v
      const dt = 1.5;
      expect(streakUv(layer, 0.5, 10 + L.rateMS * dt, dt, 1, 0).v).toBeCloseTo(streakUv(layer, 0.5, 10, 0, 1, 0).v, 9);
      // v decreases with time (motion is downhill = increasing arc)
      expect(streakUv(layer, 0.5, 10, 1, 1, 0).v).toBeLessThan(streakUv(layer, 0.5, 10, 0, 1, 0).v);
      // arc, not world position, is the only spatial input: doubling the arc doubles v
      expect(streakUv(layer, 0.5, 8, 0, 1, 0).v).toBeCloseTo(2 * streakUv(layer, 0.5, 4, 0, 1, 0).v, 9);
    }
  });

  it("scales all layers by the local speed gain, floored so a slow lip still moves", () => {
    expect(streakSpeedGain(0)).toBe(0.25);
    expect(streakSpeedGain(3)).toBeCloseTo(0.5, 9);
    expect(streakSpeedGain(30)).toBe(1);
    const slow = streakUv(0, 0.5, 10, 2, streakSpeedGain(3), 0).v;
    const fast = streakUv(0, 0.5, 10, 2, streakSpeedGain(30), 0).v;
    expect(fast).toBeLessThan(slow);
  });

  it("does not repeat: the combined layer phase has no autocorrelation peak under 20 s", () => {
    // sample the three v offsets (fractional tile phase) over 60 s and check the
    // conveyor-belt signature (a lag < 20 s where every layer is back in phase)
    const dt = 0.1;
    const N = Math.round(60 / dt);
    const phase = (t: number) => STREAK_LAYERS.map((_, l) => {
      const s = streakUv(l, 0.5, 0, t, 1, 0);
      return [s.v - Math.floor(s.v), s.u - Math.floor(s.u)];
    }).flat();
    const samples = Array.from({ length: N }, (_, i) => phase(i * dt));
    const wrapDist = (a: number, b: number) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
    let worst = 0;
    for (let lag = 1; lag * dt < 20; lag++) {
      let acc = 0;
      let n = 0;
      for (let i = 0; i + lag < N; i++) {
        const a = samples[i];
        const b = samples[i + lag];
        let same = 1;
        for (let k = 0; k < a.length; k++) same *= 1 - 2 * wrapDist(a[k], b[k]);
        acc += same; n++;
      }
      worst = Math.max(worst, acc / n);
    }
    expect(worst).toBeLessThan(0.9);
  });

  it("compiles the same constants into the GLSL twin", () => {
    expect(WHITEWATER_GLSL).toContain(`const vec3 ES_STREAK_TILE = vec3(${STREAK_LAYERS.map((l) => l.tileM.toFixed(2)).join(", ")});`);
    expect(WHITEWATER_GLSL).toContain(`const vec3 ES_STREAK_RATE = vec3(${STREAK_LAYERS.map((l) => l.rateMS.toFixed(2)).join(", ")});`);
    expect(WHITEWATER_GLSL).toContain("0.030 * tp");
    expect(WHITEWATER_GLSL).toContain("cos(6.2831853 * t / 8.33)");
    expect(WHITEWATER_GLSL).toContain("float vv = arcM / tile - (rate * gain * t) / tile;");
    // texture slot with a procedural fallback
    expect(WHITEWATER_GLSL).toContain("#ifdef ES_STREAK_TEX");
    expect(WHITEWATER_GLSL).toContain("uniform sampler2D uStreakTex;");
  });
});
