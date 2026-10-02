import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import * as THREE from "three";
import { decodeWaterRasters, flowTexture, halveRaster } from "./loadWaterAssets";
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

/** Minimal decoder for the published 8-bit RGB, non-interlaced PNG -> RGBA
 * (A = 255, as the canvas decode gives). */
function decodeRgbPng(buf: Buffer): { width: number; height: number; data: Uint8Array } {
  let off = 8, width = 0, height = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      expect([body[8], body[9], body[12]]).toEqual([8, 2, 0]);
    } else if (type === "IDAT") idat.push(body);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = 3, stride = width * bpp;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, prev = row - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0, b = y > 0 ? px[prev + i] : 0, c = i >= bpp && y > 0 ? px[prev + i - bpp] : 0;
      let p = raw[src + i];
      if (f === 1) p += a; else if (f === 2) p += b; else if (f === 3) p += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + i] = p & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) { data.set(px.subarray(i * 3, i * 3 + 3), i * 4); data[i * 4 + 3] = 255; }
  return { width, height, data };
}

describe("flow raster GPU upload", () => {
  it("keeps flow xy and fetch (B) at 25 texels of the published PNG", () => {
    const root = fileURLToPath(new URL("../../../../../apps/world-studio/public/province/water/", import.meta.url));
    const m = JSON.parse(readFileSync(`${root}water-meta.json`, "utf8"));
    const img = decodeRgbPng(readFileSync(`${root}water-flow.png`));
    const tex = flowTexture(img);
    expect(tex.format).toBe(THREE.RGBAFormat);
    const gpu = tex.image.data as Uint8Array;
    let fetchNonZero = 0;
    for (let k = 0; k < 25; k++) {
      // spread over the grid and biased onto water: texels whose B is set
      const i = ((k * 104729 + 7) % (img.width * img.height));
      for (let c = 0; c < 3; c++) expect(gpu[i * 4 + c]).toBe(img.data[i * 4 + c]);
      // the shader's reads (waterMaterial esFlowV / esFetchAt) equal the PNG's
      const flowX = (gpu[i * 4] / 255 - 0.5) * 2 * m.flow.flowMax;
      const fetch = (gpu[i * 4 + 2] / 255) ** 2 * m.flow.fetchMaxM;
      expect(flowX).toBeCloseTo((img.data[i * 4] / 255 - 0.5) * 2 * m.flow.flowMax, 9);
      expect(fetch).toBeCloseTo((img.data[i * 4 + 2] / 255) ** 2 * m.flow.fetchMaxM, 6);
      if (fetch > 0) fetchNonZero++;
    }
    // the RG8 upload read z as 0 everywhere; the published fetch is not
    // expected answers read with PIL from the same PNG at the same 25 texels
    // (a republished flow raster updates these two numbers)
    expect(fetchNonZero).toBe(12);
    let sum = 0;
    for (let k = 0; k < 25; k++) { const i = (k * 104729 + 7) % (img.width * img.height); sum += gpu[i * 4] + gpu[i * 4 + 1] + gpu[i * 4 + 2]; }
    expect(sum).toBe(8250);
  });
});

describe("habitat raster half copy", () => {
  it("halves an odd grid to ceil(n/2) and keeps a constant field and a ramp's normalised mapping", () => {
    const n = 5;
    const flat = { width: n, height: n, data: new Uint8Array(n * n * 4).fill(200) };
    const half = halveRaster(flat);
    expect([half.width, half.height]).toEqual([3, 3]);
    expect([...half.data].every((v) => v === 200)).toBe(true);
    // R ramps 0..200 in x: the half copy's centre texel reads the source centre.
    const ramp = { width: n, height: n, data: new Uint8Array(n * n * 4).map((_, i) => (i % 4 === 0 ? ((i / 4) % n) * 50 : 0)) };
    const r = halveRaster(ramp);
    expect(r.data[(1 * 3 + 1) * 4]).toBe(100);
    expect(r.data[0]).toBe(Math.round((5 / 6 - 0.5) * 50));
  });
});
