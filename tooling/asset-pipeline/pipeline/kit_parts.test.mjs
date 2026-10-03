// kit_parts.mjs (decision 0120, schema 4): every kit ships only as parts,
// one part per asset root of the packed GLB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firesOf, orphanPoolFiles, readGlb, splitKit, strayPartsDirs, writeGlb } from "./kit_parts.mjs";

test("splitKit cuts every asset root and refuses a manifest asset the GLB lacks", () => {
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0, 1, 2] }],
    nodes: [{ extras: { assetId: "k:a" } }, { extras: { assetId: "k:b" } }, { extras: { assetId: "k:c" } }] };
  const glb = new Uint8Array(writeGlb(json, new Uint8Array(0)));
  const manifest = { assets: [{ id: "k:a" }, { id: "k:b" }, { id: "k:c" }] };
  assert.deepEqual(Object.keys(splitKit("k", glb, { manifest }).index.assets).sort(), ["k:a", "k:b", "k:c"]);
  assert.throws(() => splitKit("k", glb, { manifest: { assets: [{ id: "k:z" }] } }), /lacks: k:z/);
  const { index } = splitKit("k", glb, { source: { bytes: 9, sha256: "r".repeat(64) } });
  assert.equal(index.source.sha256, "r".repeat(64));
  assert.equal(index.packed.bytes, glb.length);
  assert.equal("exterior" in index, false);
});

// Walk 6: the parts index carries the drawn assets' fire rows, so the interior
// loader never fetches the whole kit manifest.
test("firesOf keeps only drawn assets that burn, reduced to the anchor fields", () => {
  const manifest = { assets: [
    { id: "k:hearth", flames: [{ at: [0, 0, 0] }], sizeM: [1, 1, 1], triangles: 99 },
    { id: "k:lamp", light: { fixtureKind: "lantern" } },
    { id: "k:cards", flameCardMaterials: ["m"] },
    { id: "k:barrel", sizeM: [1, 1, 1] },
    { id: "k:undrawn", flames: [{}] },
  ] };
  const fires = firesOf(manifest, ["k:hearth", "k:lamp", "k:cards", "k:barrel"]);
  assert.deepEqual(Object.keys(fires), ["k:cards", "k:hearth", "k:lamp"]);
  assert.deepEqual(fires["k:hearth"], { id: "k:hearth", flames: [{ at: [0, 0, 0] }], sizeM: [1, 1, 1] });
  assert.deepEqual(firesOf(null, ["k:a"]), {});
  assert.throws(() => firesOf({}, []), /no assets list/);
});

// Decision 0120: a part keeps every LOD tier under its asset root, so the
// runtime reads it exactly as the whole kit GLB; textures go to the pool.
test("a part keeps every LOD node, rows carry lods, images point at the pool", () => {
  const bin = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const all = new Uint8Array(bin.length + 4); all.set(bin); all.set([1, 2, 3, 4], bin.length);
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ extras: { assetId: "k:a" }, children: [1, 2, 3] }, { mesh: 0 }, { mesh: 1, extras: { lod: 1 } }, { name: "empty" }],
    buffers: [{ byteLength: all.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }, { buffer: 0, byteOffset: bin.length, byteLength: 4 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    images: [{ bufferView: 1, mimeType: "image/ktx2" }], textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }, { primitives: [{ attributes: { POSITION: 0 } }] }] };
  const { index, files, textures } = splitKit("k", new Uint8Array(writeGlb(json, all)));
  const row = index.assets["k:a"];
  assert.equal(index.schemaVersion, 4);
  assert.deepEqual(row.lods, [{ lod: 0, vertices: 3, triangles: 1 }, { lod: 1, vertices: 3, triangles: 1 }]);
  assert.equal(row.vertices, 3);
  const part = readGlb(new Uint8Array(files.get(row.file))).json;
  assert.equal(part.nodes[part.scenes[0].nodes[0]].extras.assetId, "k:a");
  assert.deepEqual(part.nodes.map((n) => n.extras?.lod ?? null), [null, null, 1, null]);
  assert.equal(part.images[0].uri, `../../tex/${row.textures[0]}.ktx2`);
  assert.deepEqual([...textures.keys()], row.textures);
  assert.ok(![...files.keys()].some((f) => f.startsWith("tex/")));
});

// An uncompressed kit (config `compression: false`, waterfall-fx-v1) keeps its
// images embedded in the part; only KTX2 bytes go to the pool.
test("a non-KTX2 image stays embedded in the part, never in the pool", () => {
  const bin = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const png = [137, 80, 78, 71];
  const all = new Uint8Array(bin.length + 4); all.set(bin); all.set(png, bin.length);
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ extras: { assetId: "k:a" }, mesh: 0 }],
    buffers: [{ byteLength: all.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }, { buffer: 0, byteOffset: bin.length, byteLength: 4 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    images: [{ bufferView: 1, mimeType: "image/png" }], textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }] };
  const { index, files, textures } = splitKit("k", new Uint8Array(writeGlb(json, all)));
  assert.equal(textures.size, 0);
  assert.deepEqual(index.assets["k:a"].textures, []);
  const { json: part, bin: partBin } = readGlb(new Uint8Array(files.get(index.assets["k:a"].file)));
  const view = part.bufferViews[part.images[0].bufferView];
  assert.equal(part.images[0].mimeType, "image/png");
  assert.deepEqual([...partBin.subarray(view.byteOffset, view.byteOffset + view.byteLength)], png);
});

test("orphanPoolFiles names pool files no parts index references; strayPartsDirs names folders with no manifest", () => {
  const kits = mkdtempSync(join(tmpdir(), "kit-pool-"));
  mkdirSync(join(kits, "a", "parts"), { recursive: true });
  mkdirSync(join(kits, "b", "parts"), { recursive: true });
  mkdirSync(join(kits, "tex"));
  writeFileSync(join(kits, "a.kit.json"), "{}");
  writeFileSync(join(kits, "a", "parts", "index.json"), JSON.stringify({ assets: { x: { textures: ["used"] } } }));
  writeFileSync(join(kits, "tex", "used.ktx2"), "u");
  writeFileSync(join(kits, "tex", "stale.ktx2"), "s");
  assert.deepEqual(orphanPoolFiles(kits), ["stale.ktx2"]);
  assert.deepEqual(strayPartsDirs(kits), ["b"]);
});
