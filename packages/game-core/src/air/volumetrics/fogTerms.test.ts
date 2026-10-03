import { describe, expect, it } from "vitest";
import { canopyUnder, fogTermsAt, type FogTermPoint, type FogTerms } from "./froxelGrid";

// marsh-cove-06 at 06:00 clear (/tmp/vol10/r7/compact.txt vol20): cover mist .731 steam .952 marsh .715
// sea .144, canopy .952, sun 0.29 deg, no burn; camera over coast water 0.84 m deep, floor at the water
// surface (F-1), the studio's dawn mist depth 6 m (F-2). Shape noise at its median.
const base: Omit<FogTermPoint, "y"> = {
  ground: -0.84, floor: 0, waterH: 0, waterMask: 1, moist: 1, sea: 1, under: 0, distM: 0,
  cover: [0.731, 0.952, 0.715, 0.144], canopyHaze: 0.952, noise: 0.5,
  mistDepth: 6, mistHeightScale: 1, mistBurn: 0, wetHaze: 0, sunY: Math.sin((0.29 * Math.PI) / 180),
};
const out: FogTerms = { mist: 0, marsh: 0, sea: 0, wet: 0, canopy: 0 };
const total = (y: number, over: Partial<FogTermPoint> = {}) => {
  const t = fogTermsAt({ ...base, ...over, y }, out);
  return t.mist + t.marsh + t.sea + t.wet + t.canopy;
};
/** Optical depth of a 100 m horizontal ray at height y over uniform water. */
const tau100 = (y: number) => 100 * total(y);

describe("dawn marsh mist over water (vol10 diag8 F-1/F-2)", () => {
  it("is thick at 1 m and clear at 10 m along a 100 m horizontal ray", () => {
    expect(tau100(1)).toBeGreaterThanOrEqual(2);
    expect(tau100(10)).toBeLessThanOrEqual(0.3);
    console.log(`tau100 1 m ${tau100(1).toFixed(3)}, 2 m ${tau100(2).toFixed(3)}, 10 m ${tau100(10).toFixed(3)}`);
  });
  it("falls with height (a gradient, not a slab)", () => {
    expect(total(0.5)).toBeGreaterThan(total(2));
    expect(total(2)).toBeGreaterThan(total(5));
  });
  it("burns off land and shore before water", () => {
    const burn = { mistBurn: 0.6 };
    const water = fogTermsAt({ ...base, ...burn, y: 0.5 }, { ...out }).mist;
    const shore = fogTermsAt({ ...base, ...burn, y: 0.5, ground: 0.2, waterMask: 0, moist: 0.3 }, { ...out }).mist;
    expect(shore).toBeLessThan(water);
  });
  it("mist past the far cap is not integrated", () => {
    expect(fogTermsAt({ ...base, y: 0.5, distM: 400 }, { ...out }).mist).toBe(0);
  });
});

describe("sea fog bank and rain haze (vol10 diag8 F-5/F-6)", () => {
  const fog = { cover: [0, 0, 0, 1], moist: 0, waterMask: 0, ground: -5 } as const;
  it("the bank holds to ~14 m and is gone above ~26 m", () => {
    expect(fogTermsAt({ ...base, ...fog, y: 10 }, { ...out }).sea).toBeCloseTo(0.03 * 0.5, 6);
    expect(fogTermsAt({ ...base, ...fog, y: 21 }, { ...out }).sea).toBe(0);
  });
  it("heavy rain gives ~0.4 optical depth over 200 m at the ground", () => {
    const wet = fogTermsAt({ ...base, cover: [0, 0, 0, 0], wetHaze: 1.632, y: -0.84 }, { ...out }).wet;
    expect(200 * wet).toBeGreaterThan(0.35);
  });
});

describe("canopy haze needs crowns (vol10 c8 V1)", () => {
  const air = { ...base, cover: [0, 0, 0, 0] as [number, number, number, number], waterMask: 0, y: 9.28 };
  it("an empty canopy texel over low ground (-0.72 m) gives no canopy haze", () => {
    const under = canopyUnder(0, 0, -0.72);
    expect(fogTermsAt({ ...air, ground: -0.72, under }, { ...out }).canopy).toBe(0);
  });
  it("a covered texel (r 1, crown top 15 m, ground 0) gives canopy haze", () => {
    const under = canopyUnder(1, 15, 0);
    expect(fogTermsAt({ ...air, ground: 0, y: 10, under }, { ...out }).canopy).toBeGreaterThan(0);
  });
});
