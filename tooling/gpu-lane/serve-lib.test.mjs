// node --test tooling/gpu-lane/serve-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { distBase, siteRoots } from "./serve-lib.mjs";

const dist = (base) => {
  const d = mkdtempSync(join(tmpdir(), "serve-lib-"));
  writeFileSync(join(d, "index.html"), `<script type="module" crossorigin src="${base}assets/index-X.js"></script>`);
  return d;
};

test("distBase reads the built base", () => {
  assert.equal(distBase(dist("/elder-souls-argonia/studio/")), "/elder-souls-argonia/studio/");
});
test("siteRoots: dev and branch side by side, dev before its data at /studio/", () => {
  const dev = dist("/elder-souls-argonia/studio/"), br = dist("/elder-souls-argonia/webgpu/");
  const r = siteRoots([br, dev], "/data", "/chars");
  assert.deepEqual(r.map(([p]) => p), ["/elder-souls-argonia/webgpu/", "/elder-souls-argonia/studio/", "/elder-souls-argonia/studio/", "/elder-souls-argonia/"]);
  assert.equal(r[1][1], dev);
});
test("siteRoots fails on two dists built for one base", () => {
  assert.throws(() => siteRoots([dist("/a/"), dist("/a/")], "/d", "/c"), /both built for \/a\//);
});
test("distBase fails on an index.html with no assets script", () => {
  const d = mkdtempSync(join(tmpdir(), "serve-lib-"));
  mkdirSync(d, { recursive: true }); writeFileSync(join(d, "index.html"), "<html></html>");
  assert.throws(() => distBase(d), /no \/<base>\/assets\//);
});
