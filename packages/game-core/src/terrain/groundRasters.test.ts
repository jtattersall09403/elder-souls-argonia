import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import * as THREE from "three";
import { decodePng, foldMacroIntoTint, packControl, packGradient, textureResidentBytes } from "./groundRasters";

/** Minimal PNG writer (CRCs are not checked by the decoder). */
function png(w: number, h: number, colourType: 2 | 6, rows: number[][], filter = 0): Uint8Array {
  const bpp = colourType === 6 ? 4 : 3;
  const raw: number[] = [];
  rows.forEach((r, y) => {
    raw.push(filter);
    r.forEach((v, i) => {
      const left = i >= bpp ? r[i - bpp] : 0;
      const up = y > 0 ? rows[y - 1][i] : 0;
      raw.push(filter === 1 ? (v - left) & 255 : filter === 2 ? (v - up) & 255 : v);
    });
  });
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    new DataView(out.buffer).setUint32(0, body.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(body, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w); new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, colourType, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Uint8Array.from(raw))), chunk("IEND", new Uint8Array())];
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
}

describe("ground rasters", () => {
  it("decodes RGBA exactly, alpha-0 texels keep their colour (the canvas path zeroed them)", async () => {
    for (const filter of [0, 1, 2]) {
      const d = await decodePng(png(2, 2, 6, [[30, 7, 99, 0, 1, 2, 3, 255], [5, 6, 7, 8, 63, 63, 127, 0]], filter));
      expect([...d.data]).toEqual([30, 7, 99, 0, 1, 2, 3, 255, 5, 6, 7, 8, 63, 63, 127, 0]);
    }
    const rgb = await decodePng(png(1, 1, 2, [[9, 8, 7]]));
    expect([...rgb.data]).toEqual([9, 8, 7, 255]);
  });

  it("packs control ids exactly and the blend to 16 levels the shader decodes", () => {
    const rg = packControl(Uint8Array.from([37, 12, 127, 200, 0, 63, 0, 0, 5, 5, 64, 0]));
    const decode = (r: number, g: number) => [r & 63, g & 63, ((r >> 6) | ((g >> 6) << 2)) * 127 / 15 / 255];
    const [a0, a1, ab] = decode(rg[0], rg[1]);
    expect([a0, a1]).toEqual([37, 12]);
    expect(ab).toBeCloseTo(127 / 255, 6);
    expect(decode(rg[2], rg[3]).slice(0, 2)).toEqual([0, 63]);
    expect(Math.abs(decode(rg[4], rg[5])[2] - 64 / 255)).toBeLessThan(0.5 * 127 / 15 / 255 + 1e-9);
  });

  it("folds the macro brightness into the tint and keeps the gradient's R,G", () => {
    const ctrl = { width: 2, height: 2, data: Uint8Array.from([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]) };
    const tint = { width: 1, height: 1, data: Uint8Array.from([100, 100, 100, 9]) };
    expect([...foldMacroIntoTint(tint, ctrl)]).toEqual([116, 116, 116, 9]);
    expect([...packGradient(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))]).toEqual([1, 2, 5, 6]);
  });

  it("counts resident bytes by format with the mip chain", () => {
    const t = new THREE.DataTexture(new Uint8Array(8), 2, 2, THREE.RGFormat);
    t.generateMipmaps = true;
    expect(textureResidentBytes(t)).toEqual({ format: "rg8unorm", bytes: 10 });
  });
  it("counts a compressed (KTX2) texture as the transcoded levels it carries", () => {
    const mip = (n: number) => ({ data: new Uint8Array(n), width: 1, height: 1 });
    const t = new THREE.CompressedTexture([mip(4096), mip(1024), mip(256)] as unknown as ImageData[], 64, 64, THREE.RGBA_BPTC_Format);
    expect(textureResidentBytes(t).bytes).toBe(5376);
  });
});
