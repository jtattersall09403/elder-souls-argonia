// Parts scope (16k walk 4, lane PARTS): only kits a published interior cell
// names publish parts; any other kit's parts folder is out of scope.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drawnAssets, firesOf, scopedKits, splitKit, unscopedPartsDirs, writeGlb } from "./kit_parts.mjs";

test("the parts scope is the kits the published cells name", () => {
  const root = mkdtempSync(join(tmpdir(), "kit-parts-"));
  const cells = join(root, "interiors");
  const kits = join(root, "kits");
  mkdirSync(cells);
  writeFileSync(join(cells, "A.json"), JSON.stringify({ kits: { "int-a": {}, shared: {} } }));
  writeFileSync(join(cells, "B.json"), JSON.stringify({ kits: { shared: {} } }));
  for (const k of ["int-a", "shared", "exterior-only"]) mkdirSync(join(kits, k, "parts"), { recursive: true });
  mkdirSync(join(kits, "no-parts-folder"));
  assert.deepEqual(scopedKits(cells), ["int-a", "shared"]);
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
