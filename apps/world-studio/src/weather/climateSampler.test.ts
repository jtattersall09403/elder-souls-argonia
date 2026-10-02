import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { REGION_FOG_NEUTRAL } from "@elder-souls/game-core/air/volumetrics/fogField";
import { bilinearInto, OnshoreProbe, onshoreFromGradient, RegionFogProbe, smoothBeltMask, type RasterPixels, type RegionClimateMeta } from "./climateSampler";

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

/** Minimal 8-bit RGBA, non-interlaced PNG decode (filters 0-4), for reading the published region map. */
function decodePng(buf: Buffer): RasterPixels {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8);
    if (type === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? data[dst + x - 4] : 0, b = y > 0 ? data[dst - stride + x] : 0;
      const c = x >= 4 && y > 0 ? data[dst - stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      data[dst + x] = (raw[src + x] + pred) & 255;
    }
  }
  return { data, w, h };
}

describe("region fog probe on the published region map", () => {
  const province = resolve(__dirname, "../../public/province");
  const meta = JSON.parse(readFileSync(resolve(province, "hydrology-meta.json"), "utf8")) as RegionClimateMeta & { imageWidth: number; metresPerPixel: number };
  const px = decodePng(readFileSync(resolve(province, "hydro-regions.png")));
  const extentM = meta.imageWidth * meta.metresPerPixel;

  it("reads row 0 as world z = 0 (no flipY): Andalen Plantation stands on firm lowland, class 11", () => {
    // place.dunmer-north.andalen-plantation positionM [2305.8, 1464.7]: a 7x7-texel block of class 11;
    // the row-flipped texel is interior swamp / lake / floodplain (7, 12, 9)
    const probe = new RegionFogProbe(meta);
    const fog = probe.atRaster(px, 2305.8, 1464.7, extentM);
    expect(probe.regionClass).toBe(11);
    expect(fog).toEqual(meta.climateProfiles["firm lowland"].fog);
    expect(probe.atRaster(px, 2305.8, 1464.7, extentM)).toBe(fog); // same cell: cached, no allocation
  });

  it("every legend class has a published fog profile", () => {
    for (const row of Object.values(meta.regionsLegend)) expect(meta.climateProfiles[row.name]?.fog).toBeDefined();
  });

  it("transparent texels are ocean and the probe stays neutral before any profile is known", () => {
    const empty = new RegionFogProbe({ regionsLegend: {}, climateProfiles: {} });
    expect(empty.atRaster({ data: new Uint8ClampedArray(4), w: 1, h: 1 }, 0, 0, 10)).toBe(REGION_FOG_NEUTRAL);
    expect(empty.regionClass).toBe(0);
  });
});
