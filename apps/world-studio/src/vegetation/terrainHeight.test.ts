/**
 * perf10 O6: the per-frame sampler the occlusion-mask sweep uses gives the
 * same heights as `groundHeightM`, and so the same mask bits.
 */
import { describe, expect, it } from "vitest";
import { OcclusionMask } from "@elder-souls/game-core/vegetation/occlusionMask";
import type { ChunkStore, ChunksManifest } from "../character/chunkStore";
import { FrameGroundSampler, groundHeightM } from "./terrainHeight";

const CHUNK_M = 512;
const N = 65;
const STEP = CHUNK_M / (N - 1);

/** Four chunks of rolling hills with a ridge; chunk (1,1) undecoded. */
function fixture(): { store: ChunkStore; manifest: ChunksManifest; lookups: () => number } {
  const grids = new Map<string, unknown>();
  for (let cy = 0; cy < 2; cy++) {
    for (let cx = 0; cx < 2; cx++) {
      if (cx === 1 && cy === 1) continue;
      const heights = new Float32Array(N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = cx * CHUNK_M + i * STEP;
          const z = cy * CHUNK_M + j * STEP;
          heights[j * N + i] = 20 * Math.sin(x / 90) * Math.cos(z / 70)
            + (Math.abs(x - 420) < 30 ? 120 : 0);
        }
      }
      grids.set(`${cx},${cy},${cx === 0 ? "1" : "2"}`, {
        meta: { originM: [cx * CHUNK_M, cy * CHUNK_M] }, metresPerSample: STEP,
        nx: N, ny: N, heights,
      });
    }
  }
  let n = 0;
  const store = {
    loaded: (cx: number, cy: number, lod: string) => { n++; return grids.get(`${cx},${cy},${lod}`); },
  } as unknown as ChunkStore;
  const manifest = { grid: [2, 2], chunkMetres: CHUNK_M } as unknown as ChunksManifest;
  return { store, manifest, lookups: () => n };
}

describe("FrameGroundSampler", () => {
  it("matches groundHeightM exactly, scaled, including undecoded chunks", () => {
    const { store, manifest } = fixture();
    const sampler = new FrameGroundSampler(store, manifest, 1.25);
    for (let z = -20; z < 1050; z += 7.3) {
      for (let x = -20; x < 1050; x += 6.1) {
        const h = groundHeightM(store, manifest, x, z);
        expect(sampler.sample(x, z)).toBe(h === null ? null : h * 1.25);
      }
    }
  });

  it("gives the occlusion sweep identical mask bits with far fewer grid lookups", () => {
    const { store, manifest, lookups } = fixture();
    const occupied: number[] = [];
    for (let cz = 0; cz < 32; cz++) for (let cx = 0; cx < 32; cx++) occupied.push(cx, cz);
    const list = new Int32Array(occupied);
    const eye = { x: 60, y: 30, z: 300 };
    const plain = new OcclusionMask(32, 32);
    plain.anchor(0, 0);
    const l0 = lookups();
    plain.sweep(1024, eye, (x, z) => groundHeightM(store, manifest, x, z), 10, 120, list);
    const plainLookups = lookups() - l0;
    const cached = new OcclusionMask(32, 32);
    cached.anchor(0, 0);
    const sampler = new FrameGroundSampler(store, manifest);
    const l1 = lookups();
    cached.sweep(1024, eye, sampler.sample, 10, 120, list);
    expect(Array.from(cached.data)).toEqual(Array.from(plain.data));
    expect(plain.hiddenCount).toBeGreaterThan(0);
    expect(lookups() - l1).toBeLessThan(plainLookups / 100);
  });
});
