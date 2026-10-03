import { describe, expect, it } from "vitest";
import { FOG_NOISE, FogDrift, bakeFogShape, bakeFogWarp, fogShapeNoise } from "./fogNoise";
import { CanopyMap, CANOPY_TEXELS } from "./canopyMap";
import { FOG_TERMS, SHAFT_NEAR_M, SKY_INSCATTER, canopyUnder, ignCpu, shaftSampleT, fogSkyIrradianceInto, fogTermsAt, sunInscatterGain, sunPhaseCpu, type FogTermPoint, type FogTerms } from "./froxelGrid";

// marsh-cove-06 at 06:00 clear (/tmp/vol10/r7/compact.txt vol20): cover mist .731 steam .952 marsh .715
// sea .144, canopy .952, sun 0.29 deg, no burn; camera over coast water 0.84 m deep, floor at the water
// surface (F-1), the studio's dawn mist depth 6 m (F-2). Shape noise at its median.
const base: Omit<FogTermPoint, "y"> = {
  ground: -0.84, floor: 0, waterH: 0, waterMask: 1, moist: 1, sea: 1, under: 0, distM: 0,
  cover: [0.731, 0.952, 0.715, 0.144], canopyHaze: 0.952, noise: 0.5, noiseLow: 0.5, capBelt: [470, 150, 55], capCover: 0,
  mistDepth: 6, mistHeightScale: 1, mistBurn: 0, wetHaze: 0, sunY: Math.sin((0.29 * Math.PI) / 180),
};
const out: FogTerms = { mist: 0, marsh: 0, sea: 0, wet: 0, canopy: 0, cap: 0 };
const total = (y: number, over: Partial<FogTermPoint> = {}) => {
  const t = fogTermsAt({ ...base, ...over, y }, out);
  return t.mist + t.marsh + t.sea + t.wet + t.canopy + t.cap;
};
/** Optical depth of a 100 m horizontal ray at height y over uniform water. */
const tau100 = (y: number) => 100 * total(y);
/** Transmittance of a horizontal ray of `len` m from an eye at height y over uniform water (1 m steps). */
const horizT = (y: number, len: number) => {
  let tau = 0;
  for (let d = 0.5; d < len; d++) tau += total(y, { distM: d });
  return Math.exp(-tau);
};

describe("dawn marsh mist over water (vol10 diag8 F-1/F-2)", () => {
  it("is a thin dense bank the 1.6 m eye looks over: tau100 0.5 m >= 2, T400 at 1.6 m >= 0.9, top <= 1.5 m (vol10 c8 veil2)", () => {
    const t100 = horizT(1.6, 100), t400 = horizT(1.6, 400);
    console.log(`tau100 0.5 m ${tau100(0.5).toFixed(3)}, T100 1.6 m ${t100.toFixed(3)}, T400 1.6 m ${t400.toFixed(3)}`);
    expect(tau100(0.5)).toBeGreaterThanOrEqual(2);
    expect(t400).toBeGreaterThanOrEqual(0.9);
    let top = 0;
    for (let y = 0; y < 10; y += 0.05) if (total(y) >= 0.1 * FOG_TERMS.marshPeakPerM) top = y;
    expect(top).toBeLessThanOrEqual(1.5);
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

describe("canopy shafts have a medium in the gaps (vol10 c9 C)", () => {
  // a forest: 6 m crowns on a 10 m grid (2 m between crowns), bottom 6 m, top 15 m, over ground 0
  const crowns: { x: number; z: number; radiusM: number; bottomM: number; topM: number }[] = [];
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) crowns.push({ x: i * 10, z: j * 10, radiusM: 6, bottomM: 6, topM: 15 });
  const map = new CanopyMap(() => crowns);
  map.update(0, 0, true);
  const at = (x: number, z: number) => {
    const i = Math.floor(x - map.origin.x), j = Math.floor(z - map.origin.y), o = (j * CANOPY_TEXELS + i) * 4;
    return { r: map.data[o], bottom: map.data[o + 1], top: map.data[o + 2], forest: map.data[o + 3] };
  };
  it("a leaf-gap texel and the ground between crowns under a forest are under (> 0.5)", () => {
    const between = at(5.5, 5.5); // 7.1 m from the nearest crown centre: outside every disc
    expect(between.r).toBe(0);
    expect(canopyUnder(between.forest, between.top, 0)).toBeGreaterThan(0.5);
    let gap = null as ReturnType<typeof at> | null;
    for (let x = -4.5; x <= 4.5 && !gap; x += 1) for (let z = -4.5; z <= 4.5 && !gap; z += 1) { const t = at(x, z); if (t.r === 0) gap = t; }
    expect(gap).not.toBeNull();
    expect(canopyUnder(gap!.forest, gap!.top, 0)).toBeGreaterThan(0.5);
    // a glade: well past the forest's edge
    expect(canopyUnder(at(-127, 127).forest, at(-127, 127).top, 0)).toBeLessThan(0.5);
  });
  it("sunlit dust at 2 m in a gap (canopyHaze 0.5, sunY 0.5) is >= 0.02 /m and 40 m of it takes <= 0.6", () => {
    const air = { ...base, cover: [0, 0, 0, 0] as [number, number, number, number], waterMask: 0, ground: 0, canopyHaze: 0.5, sunY: 0.5 };
    const c = fogTermsAt({ ...air, y: 2, under: canopyUnder(0.4, 15, 0) }, { ...out }).canopy;
    console.log(`canopy dust 2 m ${c.toFixed(4)} /m, 40 m extinction ${(1 - Math.exp(-40 * c)).toFixed(3)}`);
    expect(c).toBeGreaterThanOrEqual(0.02);
    expect(1 - Math.exp(-40 * c)).toBeLessThanOrEqual(0.6);
  });
});

describe("shaft march spacing (vol10 c9 C)", () => {
  it("high band: 16 steps over 24 m (1.5 m), start jittered per pixel over a whole step", () => {
    expect(shaftSampleT(1, 16, SHAFT_NEAR_M, 0) - shaftSampleT(0, 16, SHAFT_NEAR_M, 0)).toBeLessThanOrEqual(1.5);
    const js: number[] = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) js.push(ignCpu(x, y));
    const mean = js.reduce((a, b) => a + b, 0) / js.length;
    expect(Math.min(...js)).toBeLessThan(0.15);
    expect(Math.max(...js)).toBeGreaterThan(0.85);
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.1);
    // a 0.5 m gap at any depth is sampled by some pixel of an 8x8 block
    for (const g0 of [3.2, 10.7, 17.9]) expect(js.some((j) => { for (let k = 0; k < 16; k++) { const t = shaftSampleT(k, 16, SHAFT_NEAR_M, j); if (t >= g0 && t <= g0 + 0.5) return true; } return false; })).toBe(true);
  });
});

describe("layer tops from the low octaves (vol10 diag9 S4)", () => {
  // the low-octave shape along a 1500 m line at 1 m (CPU twin of fogShapeAt .z), drift at rest
  const TEX = { shape: bakeFogShape(64), shapeTexels: 64, warp: bakeFogWarp() };
  const d = new FogDrift(0), o = new Float64Array(2), lows: number[] = [];
  for (let i = 0; i < 300; i++) { fogShapeNoise(TEX, d, FOG_NOISE.bands.high, i * 5, 1, 0, 0, o); lows.push(o[1]); }
  it("moves the marsh top by +-marshReliefM, varying over 50-200 m", () => {
    // just above the median top: no marsh at the bottom of the low-octave range, marsh at the top
    const at = (noiseLow: number) => fogTermsAt({ ...base, noiseLow, y: FOG_TERMS.marshTopM + 0.2 }, { ...out }).marsh;
    expect(at(0)).toBe(0);
    expect(at(1)).toBeGreaterThan(0);
    // relief varies along the line: the sign of (low - 0.5) changes within 200 m somewhere, not every 5 m
    let flips = 0;
    for (let i = 1; i < lows.length; i++) if ((lows[i] - 0.5) * (lows[i - 1] - 0.5) < 0) flips++;
    expect(flips).toBeGreaterThan(0);
    console.log(`low-octave sign flips over 1500 m: ${flips}`);
    expect(flips).toBeLessThan(1500 / 50);
  });
  it("keeps the dawn bar on the mean over the low-octave field: tau100 0.5 m >= 2, 2 m <= 0.1", () => {
    const mean = (y: number) => lows.reduce((s, nl) => s + 100 * total(y, { noiseLow: nl }), 0) / lows.length;
    console.log(`mean tau100 0.5 m ${mean(0.5).toFixed(3)}, 2 m ${mean(2).toFixed(3)}`);
    expect(mean(0.5)).toBeGreaterThanOrEqual(2);
    expect(mean(2)).toBeLessThanOrEqual(0.1);
  });
});

describe("cap cloud (vol10 diag9 S3)", () => {
  it("is zero below the belt ramp and 0.02 x burn at the belt centre on ground in the belt", () => {
    const cap = { capCover: 1, cover: [0, 0, 0, 0] };
    expect(fogTermsAt({ ...base, ...cap, ground: 100, y: 101 }, { ...out }).cap).toBe(0);
    expect(fogTermsAt({ ...base, ...cap, ground: 470, y: 470 }, { ...out }).cap).toBeCloseTo(0.02 * 0.5, 6);
  });
});

describe("saturated fog colour (vol10 c8 veil2)", () => {
  it("at sun 0.5 deg, looking away from the sun, T->0 radiance is no brighter than the horizon sky", () => {
    const sunY = Math.sin((0.5 * Math.PI) / 180), sky = [1, 0.9, 0.8], sun = [6, 3, 1.5];
    const skyIrr = fogSkyIrradianceInto(sky, sun, sunY, [0, 0, 0]);
    const g = sunInscatterGain(1, sunPhaseCpu(-Math.cos((0.5 * Math.PI) / 180), sunY));
    for (let i = 0; i < 3; i++) expect(sun[i] * g + skyIrr[i] * SKY_INSCATTER).toBeLessThanOrEqual(sky[i] + 1e-9);
    // the sun ray through the bank itself (sunT 0): isotropic share, same bound
    for (let i = 0; i < 3; i++) expect(sun[i] * sunInscatterGain(0, 0) + skyIrr[i] * SKY_INSCATTER).toBeLessThanOrEqual(sky[i] + 1e-9);
  });
});
