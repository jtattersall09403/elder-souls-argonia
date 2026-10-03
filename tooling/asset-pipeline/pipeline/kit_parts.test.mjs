// Parts scope (16k walk 4, lane PARTS): only kits a published interior cell
// names publish parts; any other kit's parts folder is out of scope.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXTERIOR_PARTS_KITS, drawnAssets, firesOf, orphanPoolFiles, readGlb, scopedKits, splitKit, unscopedPartsDirs, writeGlb } from "./kit_parts.mjs";

test("the parts scope is the kits the published cells name", () => {
  const root = mkdtempSync(join(tmpdir(), "kit-parts-"));
  const cells = join(root, "interiors");
  const kits = join(root, "kits");
  mkdirSync(cells);
  writeFileSync(join(cells, "A.json"), JSON.stringify({ kits: { "int-a": {}, shared: {} } }));
  writeFileSync(join(cells, "B.json"), JSON.stringify({ kits: { shared: {} } }));
  for (const k of ["int-a", "shared", "exterior-only"]) mkdirSync(join(kits, k, "parts"), { recursive: true });
  mkdirSync(join(kits, "no-parts-folder"));
  assert.deepEqual(scopedKits(cells), ["int-a", "shared", ...EXTERIOR_PARTS_KITS].sort());
  assert.deepEqual(unscopedPartsDirs(kits, cells), ["exterior-only"]);
});

// Review 5536a1d9: parts only for the assets a cell DRAWS (placements,
// stand-ins, swing doors: interiorLoader.ts drawnPlacements + swingDoorAssets),
// never every asset of a kit it names.
test("the drawn assets are placements, stand-ins and swing doors per kit", () => {
  const root = mkdtempSync(join(tmpdir(), "kit-parts-drawn-"));
  const cells = join(root, "interiors");
  mkdirSync(cells);
  writeFileSync(join(cells, "A.json"), JSON.stringify({
    kits: { big: {}, int: {} },
    placements: [{ kit: "big", assetId: "big:a" }, { kit: "int", assetId: "int:x" }],
    substitutions: [{ kit: "big", standInAsset: "big:b" }],
    doors: [{ doorType: "swing", kit: "int", assetId: "int:door" }, { doorType: "load", loadDoor: {} }],
  }));
  writeFileSync(join(cells, "B.json"), JSON.stringify({ kits: { big: {} }, placements: [{ kit: "big", assetId: "big:a" }] }));
  const drawn = drawnAssets(cells);
  assert.deepEqual([...drawn.keys()].sort(), ["big", "int"]);
  assert.deepEqual([...drawn.get("big")].sort(), ["big:a", "big:b"]);
  assert.deepEqual([...drawn.get("int")].sort(), ["int:door", "int:x"]);
});

test("splitKit with a drawn set emits only those assets and refuses a missing one", () => {
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0, 1, 2] }],
    nodes: [{ extras: { assetId: "k:a" } }, { extras: { assetId: "k:b" } }, { extras: { assetId: "k:c" } }] };
  const glb = new Uint8Array(writeGlb(json, new Uint8Array(0)));
  assert.deepEqual(Object.keys(splitKit("k", glb).index.assets).sort(), ["k:a", "k:b", "k:c"]);
  assert.deepEqual(Object.keys(splitKit("k", glb, new Set(["k:b"])).index.assets), ["k:b"]);
  assert.throws(() => splitKit("k", glb, new Set(["k:z"])), /lacks: k:z/);
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
  const { index, files, textures } = splitKit("k", new Uint8Array(writeGlb(json, all)), null, null, true);
  const row = index.assets["k:a"];
  assert.equal(index.schemaVersion, 3);
  assert.equal(index.exterior, true);
  assert.deepEqual(row.lods, [{ lod: 0, vertices: 3, triangles: 1 }, { lod: 1, vertices: 3, triangles: 1 }]);
  assert.equal(row.vertices, 3);
  const part = readGlb(new Uint8Array(files.get(row.file))).json;
  assert.equal(part.nodes[part.scenes[0].nodes[0]].extras.assetId, "k:a");
  assert.deepEqual(part.nodes.map((n) => n.extras?.lod ?? null), [null, null, 1, null]);
  assert.equal(part.images[0].uri, `../../tex/${row.textures[0]}.ktx2`);
  assert.deepEqual([...textures.keys()], row.textures);
  assert.ok(![...files.keys()].some((f) => f.startsWith("tex/")));
});

test("orphanPoolFiles names pool files no parts index references", () => {
  const kits = mkdtempSync(join(tmpdir(), "kit-pool-"));
  mkdirSync(join(kits, "a", "parts"), { recursive: true });
  mkdirSync(join(kits, "tex"));
  writeFileSync(join(kits, "a", "parts", "index.json"), JSON.stringify({ assets: { x: { textures: ["used"] } } }));
  writeFileSync(join(kits, "tex", "used.ktx2"), "u");
  writeFileSync(join(kits, "tex", "stale.ktx2"), "s");
  assert.deepEqual(orphanPoolFiles(kits), ["stale.ktx2"]);
  assert.deepEqual(unscopedPartsDirs(kits, join(kits, "none")), ["a"]);
});
