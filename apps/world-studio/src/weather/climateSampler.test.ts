import { describe, expect, it } from "vitest";
import { bilinearInto, OnshoreProbe, onshoreFromGradient, smoothBeltMask, type RasterPixels } from "./climateSampler";

/** w x h raster whose R and B channels come from `f(ix, iz)` (0..255). */
function raster(w: number, h: number, f: (ix: number, iz: number) => number): RasterPixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let iz = 0; iz < h; iz++) for (let ix = 0; ix < w; ix++) {
    const i = (iz * w + ix) * 4, v = f(ix, iz);
    data[i] = v; data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, w, h };
}

describe("belt mask smoothing", () => {
  // a binary blocky mask (the climate-vis R belt): a 4x4-texel square of 1s
  const px = raster(16, 16, (x, z) => (x >= 6 && x < 10 && z >= 6 && z < 10 ? 255 : 0));
  const ext = 1500; // 100 m texels

  it("has no step larger than 0.1 across any raster cell edge (sampled every 2 m)", () => {
    let worst = 0;
    for (const zM of [700, 760, 800, 850]) {
      let prev = smoothBeltMask(px, 300, zM, ext);
      for (let xM = 302; xM <= 1200; xM += 2) {
        const v = smoothBeltMask(px, xM, zM, ext);
        worst = Math.max(worst, Math.abs(v - prev));
        prev = v;
      }
    }
    expect(worst).toBeLessThan(0.1);
  });

  it("isolines are round, not square: the 0.5 contour's corner sits inside the square's corner", () => {
    // on the square's diagonal the mask must fall below 0.5 before the texel corner does
    expect(smoothBeltMask(px, 800, 800, ext)).toBeGreaterThan(0.9);
    const cornerDiag = smoothBeltMask(px, 600, 600, ext), edgeMid = smoothBeltMask(px, 600, 800, ext);
    expect(cornerDiag).toBeLessThan(edgeMid);
  });

  it("bilinear sampling is continuous across a texel edge", () => {
    const out = [0, 0, 0];
    const a = bilinearInto(px, 499.9, 800, ext, out)[0], b = bilinearInto(px, 500.1, 800, ext, out)[0];
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
});

describe("onshore", () => {
  it("is 1 for wind blowing straight inland off a coast, 0 offshore and along the shore", () => {
    // propensity high in the south (+z low), falling north: grad points -z... B decreases as z grows
    expect(onshoreFromGradient(0.8, 0, -1e-3, [0, 1])).toBeCloseTo(1, 5);
    expect(onshoreFromGradient(0.8, 0, -1e-3, [0, -1])).toBe(0);
    expect(onshoreFromGradient(0.8, 0, -1e-3, [1, 0])).toBeCloseTo(0, 5);
    expect(onshoreFromGradient(0, 0, -1e-3, [0, 1])).toBe(0);
  });

  it("the probe reads the gradient of climate-weather B (cell-cached)", () => {
    const px = raster(64, 64, (x) => Math.max(0, 255 - x * 8)); // coast in the west, B falls eastward
    const probe = new OnshoreProbe();
    // the probe reads the shared decoded raster; inject it through the same map the decoder fills
    const at = (wind: [number, number]) => probe.atRaster(px, 1000, 1000, 6300, wind);
    expect(at([1, 0])).toBeGreaterThan(0.9);
    expect(at([-1, 0])).toBe(0);
  });
});
