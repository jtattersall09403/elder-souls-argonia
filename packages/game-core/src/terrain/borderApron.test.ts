import { afterEach, describe, expect, it } from "vitest";
import { decodeHeightPng } from "./chunkStore";
import { terrainGridIndices } from "./gridGeometry";
import { apronSkipQuad, maskBounds, paintFrameExtent, type ApronTile } from "./apronManifest";
import { APRON_SECTORS, buildApronTileGeometry, buildApronTileSectors } from "./BorderApron";

const tile = (mask: number[] | undefined, shape: [number, number] = [9, 9]): ApronTile => ({
  id: "ring1", file: "ring1-height.png", originM: [-100, -100], shape,
  metresPerSample: 10, minM: -40, maxM: 200, maskInnerSamples: mask, paint: "near",
});

/** A synthetic RG16 raster: the decoder never sees a real PNG in the tests,
 * only the pixels a decoded one would yield. */
function fakeImage(px: Uint8ClampedArray, width: number, height: number) {
  const g = globalThis as unknown as Record<string, unknown>;
  g.createImageBitmap = async () => ({ width, height, close() {} });
  g.OffscreenCanvas = class {
    width = width; height = height;
    getContext() { return { drawImage() {}, getImageData: () => ({ data: px }) }; }
  };
}
afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.createImageBitmap; delete g.OffscreenCanvas;
});

describe("the apron tile index", () => {
  it("reads both mask forms", () => {
    expect(maskBounds(tile([2, 7]))).toEqual([2, 7, 2, 7]);
    expect(maskBounds(tile([1, 4, 2, 6]))).toEqual([1, 4, 2, 6]);
    expect(maskBounds(tile(undefined))).toBeNull();
  });

  it("omits every quad whose four corners are inside the mask, and no others", () => {
    const t = tile([2, 7]);
    const [ny, nx] = t.shape;
    const full = terrainGridIndices(nx + 2, ny + 2).length / 6;
    const skip = apronSkipQuad(t)!;
    const kept = terrainGridIndices(nx + 2, ny + 2, skip).length / 6;
    // Corner samples run 2..6 inside the mask, so quads spanning samples
    // (2..6)² in the padded frame drop: 4 × 4 = 16 quads.
    expect(full - kept).toBe(16);
    // A quad on the mask's edge keeps one corner outside and is drawn.
    expect(skip(3, 3)).toBe(true);
    expect(skip(3, 7)).toBe(false);
  });

  it("builds a tile geometry whose index is the masked one", () => {
    const t = tile([2, 7]);
    const heights = new Float32Array(t.shape[0] * t.shape[1]).fill(10);
    const geometry = buildApronTileGeometry(t, heights, 5, [-100, -100], 1000);
    expect(geometry.getIndex()!.count / 6).toBe(terrainGridIndices(11, 11, apronSkipQuad(t)!).length / 6);
    const uv = geometry.getAttribute("uv");
    // UVs are measured from the paint frame's own origin, not the province's.
    expect(uv.getX(0)).toBeCloseTo(0, 6);
    geometry.dispose();
  });

  it("reads the far set's rectangular paint extent and the near set's square one", () => {
    expect(paintFrameExtent({ originM: [0, 0], extentM: 9709.4, control: "", tint: "", grad: "" })).toEqual([9709.4, 9709.4]);
    expect(paintFrameExtent({ originM: [0, 0], extentM: [37318.2, 29830.4], control: "", tint: "", grad: "" }))
      .toEqual([37318.2, 29830.4]);
  });
});

describe("decodeHeightPng", () => {
  it("round-trips a 16-bit RG height raster to true metres", async () => {
    const lodMeta = { file: "t.png", shape: [2, 3] as [number, number], metresPerSample: 10, minM: -40, maxM: 200 };
    const wanted = [-40, 0, 37.5, 100, 199.9, 200];
    const px = new Uint8ClampedArray(6 * 4);
    wanted.forEach((h, i) => {
      const q = Math.round(((h - lodMeta.minM) / (lodMeta.maxM - lodMeta.minM)) * 65535);
      px[i * 4] = q >> 8; px[i * 4 + 1] = q & 255; px[i * 4 + 3] = 255;
    });
    fakeImage(px, 3, 2);
    const heights = await decodeHeightPng(new Blob(), lodMeta);
    expect(heights.length).toBe(6);
    const step = (lodMeta.maxM - lodMeta.minM) / 65535;
    wanted.forEach((h, i) => expect(Math.abs(heights[i] - h)).toBeLessThanOrEqual(step));
  });

  it("refuses a raster whose dimensions are not the ones the manifest declares", async () => {
    fakeImage(new Uint8ClampedArray(4), 1, 1);
    await expect(decodeHeightPng(new Blob(), {
      file: "t.png", shape: [2, 3], metresPerSample: 10, minM: 0, maxM: 1,
    })).rejects.toThrow(/unexpected raster dimensions/);
  });
});

describe("the apron ring's frustum sectors", () => {
  const t = tile([2, 7], [17, 17]);
  const heights = new Float32Array(t.shape[0] * t.shape[1]);
  for (let i = 0; i < heights.length; i++) heights[i] = (i % 17) * 2;

  it("draws every quad the single mesh drew, once, across its sectors", () => {
    const whole = buildApronTileGeometry(t, heights, 1, [-100, -100], 1000);
    const sectors = buildApronTileSectors(t, heights, 1, [-100, -100], 1000);
    const total = sectors.reduce((n, s) => n + s.getIndex()!.count, 0);
    expect(total).toBe(whole.getIndex()!.count);
    const seen = new Set<string>();
    for (const sector of sectors) {
      const index = sector.getIndex()!;
      for (let i = 0; i < index.count; i += 3) {
        const key = `${index.getX(i)},${index.getX(i + 1)},${index.getX(i + 2)}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    whole.dispose();
    for (const sector of sectors) sector.dispose();
  });

  it("gives each sector its own bounding sphere, not the whole ring's", () => {
    const sectors = buildApronTileSectors(t, heights, 1, [-100, -100], 1000);
    expect(sectors.length).toBeGreaterThan(1);
    expect(sectors.length).toBeLessThanOrEqual(APRON_SECTORS * APRON_SECTORS);
    const whole = buildApronTileGeometry(t, heights, 1, [-100, -100], 1000);
    whole.computeBoundingSphere();
    for (const sector of sectors) {
      expect(sector.boundingSphere!.radius).toBeLessThan(whole.boundingSphere!.radius);
      // the sphere must actually contain the sector's own vertices
      const index = sector.getIndex()!;
      const position = sector.getAttribute("position");
      for (let i = 0; i < index.count; i++) {
        const v = index.getX(i);
        const d = Math.hypot(
          position.getX(v) - sector.boundingSphere!.center.x,
          position.getY(v) - sector.boundingSphere!.center.y,
          position.getZ(v) - sector.boundingSphere!.center.z);
        expect(d).toBeLessThanOrEqual(sector.boundingSphere!.radius + 1e-4);
      }
    }
    whole.dispose();
    for (const sector of sectors) sector.dispose();
  });

  it("shares one position and uv buffer across the sectors", () => {
    const sectors = buildApronTileSectors(t, heights, 1, [-100, -100], 1000);
    for (const sector of sectors) {
      expect(sector.getAttribute("position")).toBe(sectors[0].getAttribute("position"));
      expect(sector.getAttribute("uv")).toBe(sectors[0].getAttribute("uv"));
    }
    for (const sector of sectors) sector.dispose();
  });
});
