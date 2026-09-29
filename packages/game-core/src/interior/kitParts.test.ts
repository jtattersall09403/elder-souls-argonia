import { existsSync, readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { describe, expect, it } from "vitest";
import { buildArchitectureKit, type ArchitectureAsset } from "../settlement/kit";
import { kitPartsDir, parseKitPartsIndex } from "./kitParts";
import { SharedKtx2Textures } from "./sharedTextures";

// A kit FIRE republished at output format 2 (16k walk 4); its parts are written
// by tooling/asset-pipeline/pipeline/kit_parts.mjs.
const KIT = "interior-kotm-v1"; // the kit whose parts the cells draw most of (121)
const KITS = new URL("../../../../apps/world-studio/public/kits/", import.meta.url);
const PARTS = new URL(kitPartsDir({ id: KIT, glb: `${KIT}.glb`, manifest: "" }), KITS);

/** A KTX2 stand-in: records the URL three asks for and answers an empty compressed texture. */
function stubKtx2(asked: string[]) {
  return {
    load(url: string, onLoad: (t: THREE.Texture) => void) {
      asked.push(url);
      onLoad(new THREE.CompressedTexture([], 4, 4));
    },
    detectSupport() { return this; },
    dispose() { /* nothing */ },
  };
}

// GLTFLoader reads `self.URL` for an embedded image (the whole kit's KTX2 bufferViews).
(globalThis as { self?: unknown }).self ??= globalThis;

async function parse(url: URL, asked: string[] = [], ktx2: unknown = stubKtx2(asked)): Promise<GLTF> {
  const bytes = readFileSync(url);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2 as never);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => loader.parse(buffer as ArrayBuffer, url.href.replace(/[^/]*$/, ""), resolve, reject));
}

/** Triangles with each rotated to start at its lowest index: meshopt's index codec may rotate a triangle, never flip it. */
function canonicalTriangles(g: THREE.BufferGeometry): number[] {
  const a = Array.from(g.index?.array ?? []);
  const out: number[] = [];
  for (let i = 0; i < a.length; i += 3) {
    const t = [a[i], a[i + 1], a[i + 2]];
    const r = t.indexOf(Math.min(...t));
    out.push(t[r], t[(r + 1) % 3], t[(r + 2) % 3]);
  }
  return out;
}

const level0 = (a: ArchitectureAsset) => ({
  parts: a.levels[0]?.length ?? 0,
  vertices: (a.levels[0] ?? []).reduce((n, p) => n + p.geometry.getAttribute("position").count, 0),
  triangles: (a.levels[0] ?? []).reduce((n, p) => n + p.triangles, 0),
});

describe(`kit parts (${KIT}): a part GLB loads on its own and carries its asset's LOD0 mesh`, () => {
  it("every part matches the whole kit's LOD0 parts, vertices and triangles; its textures resolve to tex/ files", async () => {
    const index = parseKitPartsIndex(JSON.parse(readFileSync(new URL("index.json", PARTS), "utf8")), KIT, "index.json");
    const whole = buildArchitectureKit(await parse(new URL(`${KIT}.glb`, KITS)));
    expect(index.source.bytes).toBe(readFileSync(new URL(`${KIT}.glb`, KITS)).length);
    // parts are cut only for the assets the interior cells draw (review 5536a1d9)
    expect(Object.keys(index.assets).length).toBeGreaterThan(0);
    for (const id of Object.keys(index.assets)) expect(whole.has(id)).toBe(true);
    let checked = 0;
    let vertices = 0;
    for (const [assetId, row] of Object.entries(index.assets)) {
      const asked: string[] = [];
      const part = buildArchitectureKit(await parse(new URL(row.file, PARTS), asked));
      expect([...part.keys()]).toEqual([assetId]);
      const got = level0(part.get(assetId)!);
      expect(got).toEqual(level0(whole.get(assetId)!));
      expect(got.vertices).toBe(row.vertices);
      expect(part.get(assetId)!.levels.length).toBe(1);          // LOD0 only
      // the same vertices and triangles, not only as many (re-encoding is lossless)
      part.get(assetId)!.levels[0].forEach((p, i) => {
        const w = whole.get(assetId)!.levels[0][i];
        expect(Array.from(p.geometry.getAttribute("position").array)).toEqual(Array.from(w.geometry.getAttribute("position").array));
        expect(canonicalTriangles(p.geometry)).toEqual(canonicalTriangles(w.geometry));
        expect(p.localMatrix.equals(w.localMatrix)).toBe(true);
      });
      vertices += got.vertices;
      for (const url of asked) {
        expect(url).toMatch(/\/parts\/tex\/[0-9a-f]{16}\.ktx2$/);
        expect(existsSync(new URL(url))).toBe(true);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
    expect(vertices).toBeGreaterThan(10_000);
  }, 60_000);
});

describe("parts share their kit's textures (sharedTextures.ts)", () => {
  it("two parts naming one texture transcode it once and draw it from one Source", async () => {
    const index = parseKitPartsIndex(JSON.parse(readFileSync(new URL("index.json", PARTS), "utf8")), KIT, "index.json");
    const rows = Object.entries(index.assets);
    const pair = rows.flatMap(([a, ra]) => rows.filter(([b, rb]) => a < b && rb.textures.some((h) => ra.textures.includes(h)))
      .map(([b]) => [a, b] as const))[0];
    expect(pair).toBeDefined();
    const asked: string[] = [];
    const stub = stubKtx2(asked);
    const shared = new SharedKtx2Textures({ loadAsync: (url) => new Promise((resolve) => stub.load(url, resolve)) });
    const maps = new Map<string, unknown[]>();
    for (const id of pair!) {
      const gltf = await parse(new URL(index.assets[id].file, PARTS), [], shared);
      gltf.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m?.map) maps.set(id, [...(maps.get(id) ?? []), m.map.source]);
      });
    }
    const union = new Set([...index.assets[pair![0]].textures, ...index.assets[pair![1]].textures]);
    expect(asked.length).toBe(shared.size);              // one transcode per distinct URL
    expect(asked.length).toBeLessThanOrEqual(union.size);
    const [a, b] = pair!.map((id) => new Set(maps.get(id)));
    expect([...a].some((src) => b.has(src))).toBe(true);  // the shared texture is one Source in both parts
  });
});
