import { afterEach, describe, expect, it, vi } from "vitest";
import { disposeWaterAssets, loadWaterAssets, validateWaterMeta } from "./loadWaterAssets";
import type { WaterMeta } from "../waterData";

function metadata(): WaterMeta {
  return {
    schemaVersion: 2,
    surface: { file: "surface.png", size: 2, metresPerPixel: 1, gridOriginM: 0,
      minM: 0, maxM: 10, buryM: 3, depthMinM: -6.3, shoreMaxM: 160,
      shoreFile: "shore.png", supportFile: "support.png" },
    flow: { file: "flow.png", size: 2, metresPerPixel: 1, gridOriginM: 0, flowMax: 3, shoreMaxM: 160 },
    klass: { file: "class.png", size: 2, metresPerPixel: 1, gridOriginM: 0,
      classes: ["none", "coast", "estuary", "river", "lake"], characterFile: "character.png" },
    bodies: [{ index: 1, id: "water.test.lake" }],
  };
}

type Bitmap = { width: number; height: number; pixels: Uint8ClampedArray; close: ReturnType<typeof vi.fn> };
function browserFixture(wrongSize = false) {
  const pixels = (rgba: number[]) => new Uint8ClampedArray([...rgba, ...rgba, ...rgba, ...rgba]);
  const rasters: Record<string, Uint8ClampedArray> = {
    "surface.png": pixels([0, 0, 83, 255]), // 8.3 - 6.3 = 2 m signed depth
    "shore.png": pixels([255, 255, 64, 255]),
    "support.png": pixels([255, 0, 1, 255]),
    "flow.png": pixels([128, 128, 0, 255]),
    "class.png": pixels([4, 50, 0, 255]),
    "character.png": pixels([0, 3, 128, 255]),
  };
  const bitmaps: Bitmap[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("water-meta.json")) return Response.json(metadata());
    if (url.endsWith("flood-states.json")) return Response.json({ basins: [{ tidalAmplitudeM: 0.5, seasonalAmplitudeM: 1.4 }] });
    return new Response(url.split("/").at(-1)!);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
    const name = await blob.text();
    const bitmap: Bitmap = { width: wrongSize && name === "surface.png" ? 3 : 2,
      height: 2, pixels: rasters[name], close: vi.fn() };
    bitmaps.push(bitmap);
    return bitmap;
  });
  vi.stubGlobal("OffscreenCanvas", class {
    private bitmap!: Bitmap;
    constructor(public width: number, public height: number) {}
    getContext() {
      return {
        drawImage: (bitmap: Bitmap) => { this.bitmap = bitmap; },
        getImageData: () => ({ width: this.width, height: this.height, data: this.bitmap.pixels }),
      };
    }
  });
  return { rasters, bitmaps, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe("water bundle loader", () => {
  it("rejects channel geometry missing native ground before it reaches the GPU", () => {
    const meta = metadata();
    meta.ribbons = [{ id: "water.channel.test", bodyIndex: 1, riverBand: 1,
      points: [{ x: 0, y: 1, z: 0, halfWidthM: 1 }, { x: 1, y: 0, z: 1, halfWidthM: 1 }] }];
    expect(() => validateWaterMeta(meta)).toThrow("requires finite native ground");
    meta.ribbons[0].points.forEach(p => { p.groundM = p.y - 0.1; });
    expect(() => validateWaterMeta(meta)).not.toThrow();
  });
  it("rejects incompatible encoding and grid alignment before allocating images", () => {
    expect(() => validateWaterMeta({ ...metadata(), schemaVersion: 1 })).toThrow("schemaVersion 2");
    const mismatched = metadata();
    mismatched.klass.gridOriginM = 0.5;
    expect(() => validateWaterMeta(mismatched)).toThrow("share size, scale and origin");
    const broken = metadata();
    broken.surface.size = 1;
    expect(() => validateWaterMeta(broken)).toThrow("invalid dimensions");
    delete broken.surface.depthMinM;
    broken.surface.size = 2;
    expect(() => validateWaterMeta(broken)).toThrow("signed depth");
  });

  it("preserves signed depth, semantic bytes, authoritative ranges and live providers without copying pixels", async () => {
    const { rasters, bitmaps } = browserFixture();
    let season = 1;
    const assets = await loadWaterAssets({ baseUrl: "/game/", seasonScalar: () => season,
      groundHeight: () => -3, waveTimeS: () => 0 });
    expect(assets.data.sample(0, 0)).toMatchObject({ depthProxy: 2,
      waterBodyId: "water.test.lake", region: 3 });
    expect(assets.data.sample(0, 0).tannin).toBeCloseTo(64 / 255, 6);
    expect(assets.tidalAmplitudeM).toBe(0.5);
    expect(assets.seasonalAmplitudeM).toBe(1.4);
    expect(assets.world.sampleBoundary(0, 0, 0).surfaceHeight).toBeCloseTo(1.4);
    expect(assets.world.sampleBoundary(0, 0, 0).depth).toBeCloseTo(4.4);
    season = -1;
    expect(assets.world.sampleBoundary(0, 0, 0).surfaceHeight).toBeCloseTo(-0.28); // Existing 20% dry drawdown.
    expect(assets.flowTex.image.data?.buffer).toBe(rasters["flow.png"].buffer);
    expect(assets.surfaceTex.image.data?.buffer).toBe(rasters["surface.png"].buffer);
    expect(bitmaps).toHaveLength(6);
    bitmaps.forEach((bitmap) => expect(bitmap.close).toHaveBeenCalledOnce());
    const dispose = vi.spyOn(assets.surfaceTex, "dispose");
    disposeWaterAssets(assets);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("releases decoded bitmaps when a raster does not match its metadata", async () => {
    const { bitmaps } = browserFixture(true);
    await expect(loadWaterAssets({ baseUrl: "/game/", seasonScalar: () => 0 })).rejects.toThrow("expected 2×2, received 3×2");
    bitmaps.forEach((bitmap) => expect(bitmap.close).toHaveBeenCalledOnce());
  });

  it("does not silently replace missing authored tidal/season ranges", async () => {
    browserFixture();
    vi.stubGlobal("fetch", async (url: string) => url.endsWith("water-meta.json")
      ? Response.json(metadata()) : new Response("missing", { status: 404 }));
    await expect(loadWaterAssets({ baseUrl: "/game/", seasonScalar: () => 0 })).rejects.toThrow("HTTP 404");
  });
});
