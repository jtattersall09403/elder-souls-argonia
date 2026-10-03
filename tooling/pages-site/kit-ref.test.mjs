import assert from "node:assert/strict";
import { test } from "node:test";
import { kitRefs } from "./kit-ref.mjs";

test("a kit path names its kit", () => {
  assert.deepEqual(kitRefs('fetch(`${base}kits/works-v1/parts/index.json`); "/studio/kits/flora-province-v1.kit.json"'),
    ["works-v1", "flora-province-v1"]);
});

test("an asset id containing 'kits/' names no kit", () => {
  assert.deepEqual(kitRefs('{"assetRef":"vanilla:dungeons/imperial/clutterkits/impfreewall01"}'), []);
});
