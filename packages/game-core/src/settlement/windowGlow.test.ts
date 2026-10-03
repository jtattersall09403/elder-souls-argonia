import { describe, expect, it } from "vitest";
import { WINDOW_GLOW_LINEAR_RGB, windowGlowScale } from "./windowGlow";

type RGB = [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** three's ACESFilmicToneMapping (tonemapping_pars_fragment), toneMappingExposure applied. */
function acesFilmic(rgb: RGB, exposure: number): RGB {
  const [r, g, b] = rgb.map((c) => (c * exposure) / 0.6);
  const v: RGB = [
    0.59719 * r + 0.35458 * g + 0.04823 * b,
    0.076 * r + 0.90834 * g + 0.01566 * b,
    0.0284 * r + 0.13383 * g + 0.83777 * b,
  ];
  const f = v.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081));
  const o: RGB = [
    1.60475 * f[0] - 0.53108 * f[1] - 0.07367 * f[2],
    -0.10208 * f[0] + 1.10813 * f[1] - 0.00605 * f[2],
    -0.00327 * f[0] - 0.07276 * f[1] + 1.07602 * f[2],
  ];
  return o.map((x) => Math.round(255 * toSrgb(Math.min(1, Math.max(0, x))))) as RGB;
}

/** A full-night window texel on screen at `exposure`, as materials.ts glowLine draws it. */
function windowPixel(srgbTexel: RGB, exposure: number): RGB {
  const k = windowGlowScale(exposure);
  return acesFilmic(srgbTexel.map((c, i) => toLinear(c) * WINDOW_GLOW_LINEAR_RGB[i] * k) as RGB, exposure);
}

describe("window glow is exposure-anchored (perf c10 F41)", () => {
  const mid: RGB = [0.8, 0.55, 0.2];
  for (const exposure of [22, 4]) {
    it(`a mid amber texel reads amber, not white, at exposure ${exposure}`, () => {
      const [r, g, b] = windowPixel(mid, exposure);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
      expect(r).toBeLessThan(250);
      expect(r).toBeGreaterThan(180);
    });
  }

  it("is the same pixel at every exposure", () => {
    expect(windowPixel(mid, 22)).toEqual(windowPixel(mid, 4));
  });

  it("unanchored at exposure 22 it was white (the defect)", () => {
    const old = acesFilmic(mid.map((c, i) => toLinear(c) * WINDOW_GLOW_LINEAR_RGB[i] * 2.0) as RGB, 22);
    expect(Math.min(...old)).toBeGreaterThan(235);
  });
});
