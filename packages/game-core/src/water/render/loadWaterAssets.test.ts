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
function browserFixture(wrongSize = false, meta = metadata()) {
  const pixels = (rgba: number[]) => new Uint8ClampedArray([...rgba, ...rgba, ...rgba, ...rgba]);
  const rasters: Record<string, Uint8ClampedArray> = {
    "surface.png": pixels([0, 0, 83, 255]), // 8.3 - 6.3 = 2 m signed depth
    "shore.png": pixels([255, 255, 64, 255]),
    "support.png": pixels([255, 0, 1, 255]),
    "flow.png": pixels([128, 128, 0, 255]),
    "class.png": pixels([4, 50, 0, 255]),
    "character.png": pixels([0, 3, 128, 255]),
    "water-access.png": pixels([96, 0, 255, 255]),
  };
  const bitmaps: Bitmap[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("water-meta.json")) return Response.json(meta);
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
  it("uses compiled peak bounds and preserves lows despite the older basin file", async () => {
    const meta = metadata();
    meta.stageRange = { tidalAmplitudeM: 1.2, seasonalAmplitudeM: 4, lowTideAmplitudeM: .5, drySeasonAmplitudeM: .28 };
    browserFixture(false, meta);
    let season = 1;
    const assets = await loadWaterAssets({ baseUrl: '/game/', seasonScalar: () => season });
    expect(assets.seasonalAmplitudeM).toBe(4);
    expect(assets.lowTideAmplitudeM).toBe(.5);
    expect(assets.world.levelOffsets(0).season).toBe(4);
    season = -1;
    expect(assets.world.levelOffsets(0).season).toBe(-.28);
    disposeWaterAssets(assets);
  });

  it("rejects raised stages encoded with the old inaccessible sentinel", () => {
    const meta = metadata();
    meta.stageRange = { tidalAmplitudeM: .5, seasonalAmplitudeM: 4, lowTideAmplitudeM: .5, drySeasonAmplitudeM: .28 };
    Object.assign(meta.surface, { accessFile: 'water-access.png', accessMinOffsetM: -2, accessSpanM: 4 });
    expect(() => validateWaterMeta(meta)).toThrow(/peak stage/);
    meta.surface.accessSpanM = 6.6;
    expect(() => validateWaterMeta(meta)).not.toThrow();
  });

  it("rejects incomplete or invalid compiled stage bounds", () => {
    const meta = metadata();
    for (const stageRange of [{ seasonalAmplitudeM: 4 },
      { tidalAmplitudeM: .5, seasonalAmplitudeM: 4, lowTideAmplitudeM: -.5, drySeasonAmplitudeM: .28 }]) {
      expect(() => validateWaterMeta({ ...meta, stageRange })).toThrow(/stage range/);
    }
  });

  it('loads compact bank profiles before sampling without expanding serializable metadata', async () => {
    const meta = metadata();
    meta.crossSections = { schemaVersion: 1, file: 'water-cross-sections.bin', encoding: 'float32-le-offset-ground-access', sampleCount: 6 };
    meta.ribbons = [{ id: 'water-ribbon.packed', bodyIndex: 1, riverBand: 1, points: [0, 1].map((z, i) => ({
      x: 0.5, y: 1, z, halfWidthM: 0.2, groundM: 0, crossSectionStart: i * 3, crossSectionCount: 3 })) }];
    const binary = new Float32Array([-0.2, 0, -1, 0, 0, -1, 0.2, 0, -1, -0.2, 0, -1, 0, 0, -1, 0.2, 0, -1]);
    const { fetchMock } = browserFixture(false, meta), original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(url => url.endsWith('.bin') ? Promise.resolve(new Response(binary.buffer)) : original(url));
    const assets = await loadWaterAssets({ baseUrl: '/game/', seasonScalar: () => 0 });
    expect(assets.data.sample(0.5, 0.5).surfaceBase).toBe(1);
    expect(assets.meta.ribbons![0].points[0].crossSection).toHaveLength(3);
    expect(JSON.stringify(assets.meta)).toBe(JSON.stringify(meta));
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/water/v2/water-cross-sections.bin'))).toBe(true);
    disposeWaterAssets(assets);
  });

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

  it("loads fine access/tidal fields without copying source bytes or changing optical salinity", async () => {
    const meta = metadata();
    Object.assign(meta.surface, { accessFile: "water-access.png", accessMinOffsetM: -2, accessSpanM: 4 });
    const { rasters, bitmaps } = browserFixture(false, meta);
    const assets = await loadWaterAssets({ baseUrl: "/game/", seasonScalar: () => 0 });
    const sample = assets.data.sample(0, 0);
    expect(sample.floodAccessOffsetM).toBeCloseTo(-0.5, 4);
    expect(sample.tideResponse).toBe(1);
    expect(sample.salinity).toBe(0);
    expect(assets.accessTex!.image.data?.buffer).toBe(rasters["water-access.png"].buffer);
    expect(bitmaps).toHaveLength(7);
    bitmaps.forEach(bitmap => expect(bitmap.close).toHaveBeenCalledOnce());
    const dispose = vi.spyOn(assets.accessTex!, "dispose");
    disposeWaterAssets(assets);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("rejects malformed access/ownership declarations and native proxies without geometry", async () => {
    const meta = metadata();
    expect(() => validateWaterMeta({ ...meta, surface: { ...meta.surface, nativeChannelCoverage: "true" } })).toThrow("nativeChannelCoverage");
    expect(() => validateWaterMeta({ ...meta, surface: { ...meta.surface, accessFile: "water-access.png" } })).toThrow("access encoding");
    expect(() => validateWaterMeta({ ...meta, surface: { ...meta.surface, accessMinOffsetM: -2, accessSpanM: 4 } })).toThrow("raster file");
    meta.surface.nativeChannelCoverage = true;
    const { rasters } = browserFixture(false, meta);
    rasters["support.png"][0] = 128;
    await expect(loadWaterAssets({ baseUrl: "/game/", seasonScalar: () => 0 })).rejects.toThrow("explicit ribbon geometry");
  });
});
