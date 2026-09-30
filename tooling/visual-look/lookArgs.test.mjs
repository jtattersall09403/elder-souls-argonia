// node --test tooling/visual-look/lookArgs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSES, classesFor, parseArgs, readLookList } from "./lookArgs.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("parseArgs: piece, place, errors", () => {
  assert.deepEqual(parseArgs(["piece", "works-v1", "a:b", "--out", "x"]).kit, "works-v1");
  const p = parseArgs(["place", "greenspring", "10", "-5", "--radius", "4"]);
  assert.equal(p.x, 10); assert.equal(p.z, -5); assert.equal(p.radius, 4);
  assert.throws(() => parseArgs(["piece", "works-v1"]));
  assert.throws(() => parseArgs(["place", "s", "a", "1"]));
  assert.throws(() => parseArgs(["piece", "k", "a", "--bogus"]));
  assert.deepEqual(parseArgs(["fixtures", "k", "a:b", "k2|c"]).fixtures, ["k|a:b", "k2|c"]);
  assert.deepEqual(parseArgs(["fixtures"]).fixtures, []);
  assert.throws(() => parseArgs(["fixtures", "k"]));
  assert.deepEqual(parseArgs(["preset", "candle"]).presets, ["candle"]);
});

test("classesFor: the published fixtures class as the look list expects", () => {
  assert.deepEqual(classesFor({ id: "vanilla:clutter/woodfires/campfire01burning", light: { fixtureKind: "campfire" }, flames: [{}] }), ["fire-fixture"]);
  assert.deepEqual(classesFor({ id: "m:argonianlanterns03", anchorClass: "hanging", light: { fixtureKind: "lantern" } }), ["fire-fixture", "hanging-fixture"]);
  assert.deepEqual(classesFor({ id: "m:argoniannest/argoniantent01", anchorClass: "ground" }), ["ground-contact"]);
  assert.ok(classesFor({ id: "kotm:boardwalk01" }).includes("walkway"));
});

test("look-lists.md: every row names a known class and a pass bar", () => {
  const rows = readLookList(join(here, "look-lists.md"));
  assert.ok(rows.length >= 15);
  for (const r of rows) {
    assert.ok(r.cls === "all" || CLASSES.includes(r.cls), `unknown class ${r.cls}`);
    assert.ok(r.question && r.bar, `row ${r.id} lacks a question or bar`);
  }
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "row ids unique");
});
