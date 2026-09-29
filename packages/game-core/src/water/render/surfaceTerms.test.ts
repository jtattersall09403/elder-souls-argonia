import { describe, expect, it } from "vitest";
import { MENISCUS, meniscusBand, meniscusRim } from "./meniscus";
import { CREST_SSS, SPARKLE, crestSssTerm, sparkleTerm, sparkleWindow } from "./sparkleSss";
import { HORIZON, horizonBlendWeight } from "./horizonBlend";
import { SHORE_FROTH, shoreFroth, shoreFrothBand } from "./shoreFroth";
import { CONTACT_FOAM_M } from "./waterMaterial";


describe("sparkle (study §3.1 (5))", () => {
  it("lives inside its own 10–500 m window, independent of any roughness LOD", () => {
    expect(sparkleWindow(2)).toBe(0);
    expect(sparkleWindow(100)).toBe(1);
    expect(sparkleWindow(600)).toBe(0);
    expect(sparkleWindow(SPARKLE.minDistM)).toBe(0);
    expect(sparkleWindow(SPARKLE.fadeEndM)).toBe(0);
    // power 512: a tight spot
    expect(sparkleTerm(1, 100, 1)).toBeCloseTo(SPARKLE.strength, 9);
    expect(sparkleTerm(0.99, 100, 1)).toBeLessThan(0.01);
    expect(sparkleTerm(1, 100, 0)).toBe(0);
    expect(sparkleTerm(-1, 100, 1)).toBe(0);
  });
});

describe("crest subsurface scatter (study §3.1 (4))", () => {
  it("glows only on exposed water, against the sun, on a real crest, with the sun up", () => {
    expect(crestSssTerm(1, 0.3, 1, 0.5)).toBeCloseTo(CREST_SSS.strength, 9);
    expect(crestSssTerm(1, 0.3, 0, 0.5)).toBe(0);      // still marsh water never glows
    expect(crestSssTerm(1, 0, 1, 0.5)).toBe(0);        // no crest, no glow
    expect(crestSssTerm(0, 0.3, 1, 0.5)).toBe(0);      // side-lit, no glow
    expect(crestSssTerm(1, 0.3, 1, 0)).toBe(0);        // sun on the horizon
    expect(crestSssTerm(1, 0.3, 1, -0.2)).toBe(0);     // night
    expect(crestSssTerm(1, CREST_SSS.ampRefM / 2, 1, 0.5)).toBeCloseTo(CREST_SSS.strength / 2, 9);
    expect(crestSssTerm(0.5, 0.3, 1, 0.5)).toBeCloseTo(CREST_SSS.strength * Math.pow(0.5, CREST_SSS.power), 9);
  });
});

describe("horizon convergence (study §3.1 (7))", () => {
  it("blends toward the sky over 1.5–3.5 km, never fully", () => {
    expect(horizonBlendWeight(500)).toBe(0);
    expect(horizonBlendWeight(HORIZON.startM)).toBe(0);
    // audit root cause 3: the blend erased the sea from 1.5 km; now the
    // swell reads to 2 km at least, and the sky never wholly replaces it
    expect(horizonBlendWeight(2000)).toBeLessThan(0.2);
    expect(horizonBlendWeight(8000)).toBeGreaterThan(0.2);
    expect(horizonBlendWeight(8000)).toBeLessThan(HORIZON.maxBlend);
    expect(horizonBlendWeight(20000)).toBe(HORIZON.maxBlend);
    expect(HORIZON.maxBlend).toBeLessThanOrEqual(0.7);
  });
});

describe("waterline meniscus (study §3.1 (8))", () => {
  it("is a band about the camera height within arm's reach, and nowhere else", () => {
    expect(meniscusBand(0, 0.1)).toBe(1);
    expect(meniscusBand(MENISCUS.thicknessM, 0.1)).toBe(0);
    expect(meniscusBand(-MENISCUS.thicknessM, 0.1)).toBe(0);
    expect(meniscusBand(0, MENISCUS.reachM)).toBe(0);
    expect(meniscusBand(0.1, 1)).toBeGreaterThan(0);
    expect(meniscusBand(0.1, 1)).toBeLessThan(1);
    expect(meniscusRim(1)).toBe(MENISCUS.rimStrength);
    expect(meniscusRim(0.5)).toBeCloseTo(MENISCUS.rimStrength * Math.pow(0.5, MENISCUS.sharpness), 9);
    expect(meniscusRim(0)).toBe(0);
  });
});

describe("shoreline depth-range froth (study §4 (2))", () => {
  it("is a wider, lower, noise-broken band behind the 12 cm contact line", () => {
    expect(SHORE_FROTH.rangeM).toBeGreaterThan(CONTACT_FOAM_M * 10);
    expect(SHORE_FROTH.rangeM).toBeGreaterThanOrEqual(1.5);
    expect(SHORE_FROTH.rangeM).toBeLessThanOrEqual(2);
    expect(shoreFrothBand(0, 0.5)).toBe(1);
    expect(shoreFrothBand(SHORE_FROTH.rangeM, 0.5)).toBe(0);
    expect(shoreFrothBand(SHORE_FROTH.rangeM * 3, 1)).toBe(0);
    expect(shoreFrothBand(0.9, 0.5)).toBeGreaterThan(0);
    // the noise moves the band edge by up to ± noiseM/2 of depth
    expect(shoreFrothBand(1.2, 1)).toBeLessThan(shoreFrothBand(1.2, 0));
    // monotone in depth at fixed noise
    let last = 2;
    for (let d = 0; d <= 3; d += 0.1) {
      const v = shoreFrothBand(d, 0.5);
      expect(v).toBeLessThanOrEqual(last + 1e-12);
      last = v;
    }
    // coverage well under the contact line's peak (0.68 at full fetch)
    expect(shoreFroth(0, 0.5, 1)).toBeCloseTo(SHORE_FROTH.coverage, 9);
    expect(SHORE_FROTH.coverage).toBeLessThan(0.45);
    // a still marsh margin keeps a faint fringe; fetch brings it up
    expect(shoreFroth(0, 0.5, 0)).toBeCloseTo(SHORE_FROTH.coverage * 0.25, 9);
  });
});
