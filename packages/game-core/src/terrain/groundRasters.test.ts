import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { png } from "./__fixtures__/png";
import { GroundRasterLoader, PngCache, decodePng, foldMacroIntoTint, groundRasterKey, packControl, packGradient, textureResidentBytes, type GroundTextures } from "./groundRasters";


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

describe("PngCache", () => {
  it("decodes ground-control once for its three readers (ground material, walk world, groundcover)", async () => {
    const calls: string[] = [];
    const img = (n: number) => ({ width: n, height: n, data: new Uint8Array(n * n * 4).fill(64) });
    const cache = new PngCache(async (url) => { calls.push(url); return img(url.includes("tint") ? 4 : 2); });
    const loader = new GroundRasterLoader();
    loader.png = (u) => cache.decode(u);
    const ground = new Promise<GroundTextures>((res, rej) => loader.load(groundRasterKey("ctrl.png", "tint.png", "grad.png"), res, undefined, rej));
    const [, walk, cover] = await Promise.all([ground, cache.decode("ctrl.png"), cache.decode("ctrl.png")]);
    expect(walk).toBe(cover);
    expect(calls.filter((u) => u === "ctrl.png")).toHaveLength(1);
    // a reader arriving while the decode is still held gets it without a refetch
    expect(await cache.decode("ctrl.png")).toBe(walk);
    expect(calls).toHaveLength(3);
  });

  it("retries after a failed load", async () => {
    let n = 0;
    const cache = new PngCache(async () => { if (n++ === 0) throw new Error("404"); return { width: 1, height: 1, data: new Uint8Array(4) }; });
    await expect(cache.decode("a")).rejects.toThrow("404");
    expect((await cache.decode("a")).width).toBe(1);
  });
});
