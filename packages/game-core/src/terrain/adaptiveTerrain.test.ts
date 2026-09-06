import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { AdaptiveTerrainLoader, buildAdaptiveTerrainGeometry, decodeAdaptiveTerrain, validateAdaptiveTerrainManifest,
  type AdaptiveTerrainManifest } from "./adaptiveTerrain";
import { terrainGridIndices } from "./gridGeometry";

const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
function fixture() {
  const indices = terrainGridIndices(3, 3, new Set([0]));
  const buffer = new ArrayBuffer(32 + 9 * 8 + indices.length * 2), header = new DataView(buffer);
  new Uint8Array(buffer, 0, 8).set(new TextEncoder().encode("ESATLOD1"));
  [1, 9, indices.length, 2, 2, 2].forEach((value, i) => header.setUint32(8 + i * 4, value, true));
  const lattice = new Uint16Array(buffer, 32, 18), heights = new Float32Array(buffer, 68, 9);
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
    lattice.set([x, z], (z * 3 + x) * 2); heights[z * 3 + x] = x + z * 2;
  }
  new Uint16Array(buffer, 104).set(indices);
  const source = new TextEncoder().encode("source dependency"), sourceHash = digest(source);
  const asset = { file: "mesh.bin", bytes: buffer.byteLength, vertices: 9, triangles: 8, sha256: digest(new Uint8Array(buffer)), minM: 0, maxM: 6 };
  const manifest: AdaptiveTerrainManifest = { schemaVersion: 1, format: "es-adaptive-terrain-v1", gridSize: 9,
    chunkSamples: 2, nativeMetresPerSample: 1.5,
    sources: { nativeManifest: { file: "chunks/manifest.json", sha256: sourceHash },
      bedOverlay: { file: "water/overlay.json", sha256: sourceHash }, topology: { file: "water/topology.json", sha256: sourceHash },
      protectionMaskSha256: sourceHash },
    chunks: Array.from({ length: 16 }, (_, i) => ({ cx: i % 4, cy: Math.floor(i / 4), originM: [i % 4 * 3, Math.floor(i / 4) * 3],
      cells: [2, 2], flippedCells: [0], lods: { "2": asset, "4": asset } })) };
  return { buffer, source, manifest };
}

describe("versioned adaptive terrain", () => {
  it('cancels obsolete queued view work, evicts old view cache and safely reloads on return', async () => {
    const { buffer, manifest, source } = fixture();
    let release!: () => void, started!: () => void, chunks = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const start = new Promise<void>(resolve => { started = resolve; });
    const loader = new AdaptiveTerrainLoader('/province/', { concurrency: 1, fetch: (async input => {
      const url = String(input);
      if (url.endsWith('terrain/manifest.json')) return Response.json(manifest);
      if (url.endsWith('mesh.bin')) { chunks++; started(); await gate; return new Response(buffer.slice(0)); }
      return new Response(source.slice());
    }) as typeof fetch });
    const first = loader.load(0, 0, '4'), obsolete = loader.load(1, 0, '4'), retained = loader.load(2, 0, '4');
    await start;
    loader.retainWanted(new Set(['0,0,4', '2,0,4']));
    expect(await obsolete).toBeNull();
    expect(loader.diagnostics.queuedRequests).toBe(1);
    release(); await Promise.all([first, retained]);
    expect(chunks).toBe(2);
    loader.retainWanted(new Set(['2,0,4']));
    expect(loader.loaded(0, 0, '4')).toBeUndefined();
    expect(loader.diagnostics.cachedChunks).toBe(1);
    loader.retainWanted(new Set(['1,0,4']));
    expect(await loader.load(1, 0, '4')).not.toBeNull();
    expect(chunks).toBe(3);
    expect(loader.diagnostics.cachedChunks).toBe(1);
    loader.dispose();
  });

  it("decodes exact native heights/diagonals and applies only display scale and world origin", () => {
    const { buffer, manifest } = fixture(), chunk = manifest.chunks[1];
    const data = decodeAdaptiveTerrain(buffer, chunk, "4", 1.5);
    expect([...data.indices.slice(0, 6)]).toEqual([0, 3, 4, 0, 4, 1]);
    expect([...data.indices.slice(6, 12)]).toEqual([1, 4, 2, 2, 4, 5]);
    const geometry = buildAdaptiveTerrainGeometry(data, 2, 12), positions = geometry.getAttribute("position");
    expect(positions.getX(0)).toBe(3); expect(positions.getY(8)).toBe(12); expect(positions.getZ(8)).toBe(3);
    expect(geometry.boundingBox!.max.y).toBe(12);
    expect(data.heights[8]).toBe(6); // rendering never rewrites true metres
    geometry.dispose();
  });

  it("rejects malformed versions, path traversal, bytes and indices before rendering", () => {
    const { buffer, manifest } = fixture();
    expect(validateAdaptiveTerrainManifest(manifest)).toBe(manifest);
    expect(() => validateAdaptiveTerrainManifest({ ...manifest, schemaVersion: 2 })).toThrow();
    expect(() => validateAdaptiveTerrainManifest({ ...manifest, sources: { ...manifest.sources,
      topology: { file: "../other-world.json", sha256: manifest.sources.topology.sha256 } } })).toThrow();
    expect(() => decodeAdaptiveTerrain(buffer.slice(0, -1), manifest.chunks[0], "4", 1.5)).toThrow(/disagrees/);
    new Uint16Array(buffer, 104)[0] = 999;
    expect(() => decodeAdaptiveTerrain(buffer, manifest.chunks[0], "4", 1.5)).toThrow(/index/);
  });

  it("deduplicates loads, caps chunk concurrency/cache, verifies dependencies and releases data", async () => {
    const { buffer, manifest, source } = fixture();
    const compressed = new Uint8Array(gzipSync(new Uint8Array(buffer)));
    for (const chunk of manifest.chunks) for (const asset of Object.values(chunk.lods)) {
      asset.compression = "gzip"; asset.downloadBytes = compressed.byteLength; asset.sha256 = digest(compressed);
    }
    let active = 0, peak = 0, chunks = 0;
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("terrain/manifest.json")) return Response.json(manifest);
      if (url.endsWith("mesh.bin")) {
        active++; peak = Math.max(peak, active); chunks++;
        await new Promise(resolve => setTimeout(resolve, 2)); active--;
        return new Response(compressed.slice());
      }
      return new Response(source.slice());
    }) as typeof fetch;
    const loader = new AdaptiveTerrainLoader("/province/", { fetch: fetcher, concurrency: 2, maxCacheBytes: buffer.byteLength * 2 });
    const first = loader.load(0, 0, "4"), duplicate = loader.load(0, 0, "4");
    expect(duplicate).toBe(first);
    await Promise.all([first, ...[1, 2, 3].map(x => loader.load(x, 0, "4"))]);
    expect(chunks).toBe(4); expect(peak).toBeLessThanOrEqual(2);
    expect(loader.diagnostics.cachedBytes).toBeLessThanOrEqual(buffer.byteLength * 2);
    loader.dispose(); expect(loader.diagnostics.cachedBytes).toBe(0);
    const invalid = new AdaptiveTerrainLoader("/province/", { fetch: (async (input) => String(input).endsWith("terrain/manifest.json")
      ? Response.json(manifest) : new Response("other world's overlay")) as typeof fetch });
    await expect(invalid.manifest()).rejects.toThrow(/dependency mismatch/); invalid.dispose();
    const missing = new AdaptiveTerrainLoader("/province/", { fetch: (async () => new Response(null, { status: 404 })) as typeof fetch });
    expect(await missing.load(0, 0, "4")).toBeNull(); missing.dispose();
  });
});
