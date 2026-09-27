import { afterEach, describe, expect, it, vi } from "vitest";
import { ChunkStore, type ChunksManifest } from "./chunkStore";
import { GroundOverlayRegistry, overlayHeight, type GroundOverlay } from "./heightOverlays";

const PAD: GroundOverlay = {
  id: "patch.pad.settlement.place.t.b1", bboxM: [10, 10, 14, 14], blendM: 3, hardM: 0,
  pieces: [{ polygonM: [[10, 10], [14, 10], [14, 14], [10, 14]], datumM: 12 }],
};

const MANIFEST = {
  chunkSamples: 17, chunkMetres: 32, grid: [1, 1],
  chunks: [{ cx: 0, cy: 0, originM: [0, 0], lods: {
    "1": { file: "c1.png", shape: [17, 17], metresPerSample: 2, minM: 0, maxM: 20 },
    "4": { file: "c4.png", shape: [5, 5], metresPerSample: 8, minM: 0, maxM: 20 },
  } }],
} as unknown as ChunksManifest;

function stubFetch(): void {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => MANIFEST,
    blob: async () => new Blob([url]),
  })));
}

const flat = async (_blob: Blob, meta: { shape: [number, number] }) =>
  new Float32Array(meta.shape[0] * meta.shape[1]).fill(10);

afterEach(() => { vi.unstubAllGlobals(); });

describe("ChunkStore ground overlays (decision 0102)", () => {
  it("serves every LOD with the place's pads applied, one surface for all readers", async () => {
    stubFetch();
    const overlays = new GroundOverlayRegistry();
    const store = new ChunkStore("/", { overlays, decodeHeights: flat });
    overlays.set(new Map([["place.t", [PAD]]]));
    const fine = await store.load(0, 0, "1");
    // sample (6, 6) is (12 m, 12 m): inside the pad
    expect(fine.heights[6 * 17 + 6]).toBeCloseTo(12, 5);
    expect(fine.heights[0]).toBe(10);                    // beyond the blend
    const coarse = await store.load(0, 0, "4");
    // (8, 8) is 2.83 m out, inside the 3 m blend: a small pull, the twin's number
    expect(coarse.heights[1 * 5 + 1]).toBeCloseTo(overlayHeight(10, 8, 8, [PAD]), 5);
    expect(coarse.heights[1 * 5 + 1]).toBeGreaterThan(10);
  });

  it("waits for the overlays before decoding, so no chunk is served unpadded", async () => {
    stubFetch();
    const overlays = new GroundOverlayRegistry();
    const store = new ChunkStore("/", { overlays, decodeHeights: flat });
    const pending = store.load(0, 0, "1");
    overlays.set(new Map([["place.t", [PAD]]]));
    expect((await pending).heights[6 * 17 + 6]).toBeCloseTo(12, 5);
  });
});
