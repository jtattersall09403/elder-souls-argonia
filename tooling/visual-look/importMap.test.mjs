// node --test tooling/visual-look/importMap.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LOOK_IMPORT_MAP } from "./importMap.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../../packages/game-core/src");
const SOURCE_FILE = /\.(ts|js|mjs)$/;
const THREE_SPECIFIER = /\bfrom\s*["'](three(?:\/[^"']*)?)["']|\bimport\s*\(\s*["'](three(?:\/[^"']*)?)["']\s*\)|\bimport\s*["'](three(?:\/[^"']*)?)["']/g;

function* sources(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sources(p);
    else if (SOURCE_FILE.test(e.name)) yield p;
  }
}
const resolves = (spec) =>
  Object.keys(LOOK_IMPORT_MAP.imports).some((k) => (k.endsWith("/") ? spec.startsWith(k) : spec === k));

test("every bare three specifier in game-core resolves through the look import map", () => {
  const unresolved = new Map();
  let seen = 0;
  for (const file of sources(SRC)) {
    for (const m of readFileSync(file, "utf8").matchAll(THREE_SPECIFIER)) {
      const spec = m[1] ?? m[2] ?? m[3];
      seen++;
      if (!resolves(spec)) unresolved.set(spec, file);
    }
  }
  assert.ok(seen > 0, "the scan found no three imports");
  assert.deepEqual([...unresolved], [], "specifiers missing from LOOK_IMPORT_MAP");
});
