import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const partsOf = (kit: string) => new URL(kitPartsDir({ id: kit, parts: `${kit}/parts/index.json`, manifest: `${kit}.kit.json` }), KITS);
const PARTS = partsOf(KIT);

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

// GLTFLoader reads `self.URL` for an embedded image (waterfall-fx-v1's PNG stubs).
(globalThis as { self?: unknown }).self ??= globalThis;

async function parse(url: URL, asked: string[] = [], ktx2: unknown = stubKtx2(asked)): Promise<GLTF> {
  const bytes = readFileSync(url);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2 as never);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => loader.parse(buffer as ArrayBuffer, url.href.replace(/[^/]*$/, ""), resolve, reject));
}

const levelCounts = (a: ArchitectureAsset) => a.levels.map((parts) => ({
  parts: parts.length,
  vertices: parts.reduce((n, p) => n + p.geometry.getAttribute("position").count, 0),
  triangles: parts.reduce((n, p) => n + p.triangles, 0),
}));

/** Every published kit (decision 0120: kits ship only as parts). */
const ALL_KITS = readdirSync(KITS).filter((f) => f.endsWith(".kit.json")).map((f) => f.slice(0, -".kit.json".length)).sort();
/** Kits whose every part is loaded through three: interior, exterior, no-sidecar camp, uncompressed waterfall. */
const LOADED_KITS = [KIT, "settlement-mud-v1", "camp-v1", "waterfall-fx-v1"];
const RAW_KITS = new URL("../../../../tooling/asset-pipeline/output/kits/", import.meta.url);

/** Per asset root: triangles per LOD tier, read from a GLB's JSON chunk (the buildArchitectureKit rule: `extras.lod`, absent 0). */
function rawLodTriangles(url: URL): Map<string, number[]> {
  const bytes = readFileSync(url);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + bytes.readUInt32LE(12))));
  const out = new Map<string, number[]>();
  for (const r of json.scenes[json.scene ?? 0].nodes) {
    const id = json.nodes[r].extras?.assetId;
    if (typeof id !== "string") continue;
    const tiers: number[] = [];
    const walk = (i: number) => {
      const n = json.nodes[i];
      if (n.mesh !== undefined) {
        const lod = typeof n.extras?.lod === "number" ? n.extras.lod : 0;
        for (const p of json.meshes[n.mesh].primitives) {
          tiers[lod] = (tiers[lod] ?? 0) + (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3;
        }
      }
      for (const c of n.children ?? []) walk(c);
    };
    walk(r);
    out.set(id, tiers.filter((t) => t !== undefined));
  }
  return out;
}

describe("every published kit ships as parts that cover its manifest", () => {
  it.each(ALL_KITS)("%s: a part per manifest asset, no whole GLB, and the raw build's LOD tiers", (kit) => {
    const index = parseKitPartsIndex(JSON.parse(readFileSync(new URL(`${kit}/parts/index.json`, KITS), "utf8")), kit, "index.json");
    const manifest = JSON.parse(readFileSync(new URL(`${kit}.kit.json`, KITS), "utf8")) as { assets: { id: string }[] };
    expect(Object.keys(index.assets).sort()).toEqual(manifest.assets.map((a) => a.id).sort());
    expect(existsSync(new URL(`${kit}.glb`, KITS))).toBe(false);
    const raw = new URL(`${kit}.glb`, RAW_KITS);
    if (!existsSync(raw)) return; // the raw build is git-ignored (absent on CI); the index's sha256 names it
    const tiers = rawLodTriangles(raw);
    // gltfpack drops degenerate triangles (watercraft-v1: 12311 of 12321), so a tier matches to 1 %
    for (const [id, row] of Object.entries(index.assets)) {
      const raw = tiers.get(id) ?? [];
      expect(row.lods.length).toBe(raw.length);
      row.lods.forEach((l, i) => expect(Math.abs(l.triangles - raw[i])).toBeLessThanOrEqual(raw[i] * 0.01));
    }
  });
});

describe.each(LOADED_KITS)("kit parts (%s): a part GLB loads on its own and carries every LOD tier of its asset", (kit) => {
  it("every part reads through buildArchitectureKit at its indexed counts; its textures resolve to the kits/tex pool", async () => {
    const parts = partsOf(kit);
    const index = parseKitPartsIndex(JSON.parse(readFileSync(new URL("index.json", parts), "utf8")), kit, "index.json");
    expect(Object.keys(index.assets).length).toBeGreaterThan(0);
    let checked = 0;
    for (const [assetId, row] of Object.entries(index.assets)) {
      const asked: string[] = [];
      const part = buildArchitectureKit(await parse(new URL(row.file, parts), asked));
      expect([...part.keys()]).toEqual([assetId]);
      const got = levelCounts(part.get(assetId)!);
      expect(got[0].vertices).toBe(row.vertices);
      expect(row.lods.map((l) => l.triangles)).toEqual(got.map((l) => l.triangles));
      for (const url of asked) {
        expect(new URL(url).href).toMatch(/\/kits\/tex\/[0-9a-f]{16}\.ktx2$/);
        expect(existsSync(new URL(url))).toBe(true);
      }
      checked += 1;
    }
    expect(checked).toBe(Object.keys(index.assets).length);
  }, 180_000);
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
