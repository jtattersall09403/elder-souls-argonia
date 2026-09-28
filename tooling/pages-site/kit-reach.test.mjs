import assert from "node:assert/strict";
import { test } from "node:test";
import { danglingRefs, kitReach, resolveRelative } from "./kit-reach.mjs";

// A fixture kits/ tree: works-v1 names its sidecar -fx folder only inside its
// manifest (the 16k walk 3 shape); orphan-fx is named by nothing.
const FILES = [
  "works-v1.kit.json", "works-v1.glb", "works-v1.connectors.json",
  "works-v1-fx/candleflame01.png", "works-v1-fx/smokeparticles01.png",
  "orphan-fx/unused.png", "orphan-v1.kit.json", "orphan-v1.glb",
  "waterfall-fx-textures/manifest.json", "waterfall-fx-textures/foam.png",
];
const JSON_OF = {
  "works-v1.kit.json": {
    assets: [{ id: "vanilla:clutter/x", textures: ["stonewall01.dds"] }],
    outputGlb: "Z:\\build\\output\\kits\\works-v1.glb",
    effectTextures: { "fx:flame-billboard": { file: "works-v1-fx/candleflame01.png" },
      "fx:smoke-column": { file: "works-v1-fx/smokeparticles01.png" } },
  },
  "works-v1.connectors.json": { schemaVersion: 1 },
  "orphan-v1.kit.json": { assets: [] },
  "waterfall-fx-textures/manifest.json": { files: ["foam.png"] },
};
const read = (r) => { if (!(r in JSON_OF)) throw new Error(`no ${r}`); return JSON_OF[r]; };

test("a sidecar folder a kept manifest names by relative path survives", () => {
  const { keep } = kitReach(FILES, new Set(["works-v1"]), read);
  assert.ok(keep.has("works-v1-fx/candleflame01.png"));
  assert.ok(keep.has("works-v1-fx/smokeparticles01.png"));
  assert.ok(keep.has("works-v1.connectors.json"));
});

test("a folder nothing resolves to is pruned, whatever its name", () => {
  const { keep } = kitReach(FILES, new Set(["works-v1"]), read);
  for (const f of ["orphan-fx/unused.png", "orphan-v1.kit.json", "orphan-v1.glb"]) assert.ok(!keep.has(f), f);
});

test("a folder named in code keeps its files, and its own manifest resolves beside itself", () => {
  const { keep } = kitReach(FILES, new Set(["waterfall-fx-textures"]), read);
  assert.ok(keep.has("waterfall-fx-textures/foam.png"));
  assert.equal(resolveRelative("waterfall-fx-textures/manifest.json", "foam.png"), "waterfall-fx-textures/foam.png");
});

test("URLs, ids with a scheme and Windows build paths never resolve", () => {
  for (const s of ["vanilla:clutter/x", "fx:flame-billboard", "Z:\\a\\b.glb", "/abs.png", "https://x/y.png", "../../escape.png"]) {
    assert.equal(resolveRelative("works-v1.kit.json", s), null, s);
  }
});

test("the post-prune gate names a reference whose file did not ship", () => {
  const shipped = new Set(["kits/works-v1.kit.json", "kits/works-v1.glb", "kits/works-v1-fx/smokeparticles01.png",
    "province/settlements/place.a.json"]);
  const json = {
    "kits/works-v1.kit.json": JSON_OF["works-v1.kit.json"],
    "province/settlements/place.a.json": { kits: { "works-v1": { glb: "kits/works-v1.glb", manifest: "kits/works-v1.kit.json" },
      "docks-v1": { glb: "kits/docks-v1.glb", manifest: "kits/docks-v1.kit.json" } } },
  };
  const out = danglingRefs(shipped, Object.keys(json), (r) => json[r]);
  assert.deepEqual(out.map((d) => d.ref).sort(),
    ["kits/docks-v1.glb", "kits/docks-v1.kit.json", "works-v1-fx/candleflame01.png"]);
});
