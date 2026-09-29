// Parts scope (16k walk 4, lane PARTS): only kits a published interior cell
// names publish parts; any other kit's parts folder is out of scope.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scopedKits, unscopedPartsDirs } from "./kit_parts.mjs";

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
