import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "check_no_glsl.mjs");
const run = (...a) => spawnSync("node", [script, ...a], { encoding: "utf8" });
const tmp = () => mkdtempSync(join(tmpdir(), "glsl-"));

test("repo sources: scans files and passes", () => {
  const r = run();
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /\((\d+) files scanned\)/);
  assert.ok(Number(/\((\d+) files scanned\)/.exec(r.stdout)[1]) > 0);
});

test("a banned GLSL marker fails with a hit", () => {
  const d = tmp();
  mkdirSync(join(d, "assets"));
  writeFileSync(join(d, "assets", "a.js"), "const m = new ShaderMaterial({});\n");
  const r = run("--root", d);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /assets\/a\.js:1: ShaderMaterial/);
});

test("scanning 0 files fails", () => {
  const r = run("--root", tmp());
  assert.equal(r.status, 1);
  assert.match(r.stdout, /scanned 0 files/);
});
