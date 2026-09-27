// preflight_heads.mjs: pre-existing reds (speed lane 2, S4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { byFile, failedIds, headOutcomes, readRecord, writeRecord, unchecked, firstSeen, testTarget, label } from "./preflight_heads.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG = [
  "....F..E",
  "FAILED worldgen/test_mine_abuts.py::test_the_record_single_use_is_the_derived_set - AssertionError: x",
  "FAILED worldgen/test_blueprint.py::test_live_dir_validates[claywater - station] - assert 1",
  "\x1b[31mERROR\x1b[0m worldgen/test_pads.py::\x1b[1mtest_setup\x1b[0m",
  "3 failed, 10 passed in 2.0s",
].join("\n");

test("failedIds reads FAILED and ERROR node ids, parameters with spaces kept", () => {
  assert.deepEqual(failedIds(LOG), [
    "worldgen/test_mine_abuts.py::test_the_record_single_use_is_the_derived_set",
    "worldgen/test_blueprint.py::test_live_dir_validates[claywater - station]",
    "worldgen/test_pads.py::test_setup",
  ]);
});

test("headOutcomes: red on HEAD, green on HEAD, or not provable (collection error)", () => {
  const ids = failedIds(LOG).slice(0, 2);
  const head = "FAILED worldgen/test_mine_abuts.py::test_the_record_single_use_is_the_derived_set - x\n1 failed, 1 passed";
  assert.deepEqual(headOutcomes(ids, head, 1), { [ids[0]]: "failed", [ids[1]]: "passed" });
  // pytest could not run the batch (an id not on HEAD, the timeout): nothing is proven or cached
  assert.deepEqual(headOutcomes(ids, "ERROR: not found", 4), {});
  assert.deepEqual(headOutcomes(ids, "", 124), {});
  assert.deepEqual(byFile(["a.py::x", "b.py::y", "a.py::z"]), [["a.py::x", "a.py::z"], ["b.py::y"]]);
});

test("a red also red on HEAD is PRE-EXISTING with its first-seen sha and owner; others NEW or UNCHECKED", () => {
  const dir = mkdtempSync(join(tmpdir(), "heads-"));
  const [a, b, c] = failedIds(LOG);
  writeRecord(dir, { sha: "aaaa1111", created: 1, gates: { placement: { [a]: "failed" } } });
  const rec = readRecord(dir, "bbbb2222");
  assert.deepEqual(rec.gates, {});
  assert.deepEqual(unchecked(rec, "placement", [a, b, c]), [a, b, c]);
  rec.gates.placement = { [a]: "failed", [b]: "passed" };
  rec.created = 2;
  writeRecord(dir, rec);
  assert.deepEqual(unchecked(readRecord(dir, "bbbb2222"), "placement", [a, b, c]), [c]);
  assert.equal(firstSeen(dir, "placement", a), "aaaa1111");
  assert.equal(firstSeen(dir, "placement", b), null);
  const got = label("placement", [a, b, c], rec, dir, repoRoot, (f) => `abc123 subject of ${f}`);
  assert.equal(got[0].label, "PRE-EXISTING");
  assert.equal(got[0].firstSeen, "aaaa1111");
  assert.equal(got[0].owner, "the lane that changed tooling/world-generation/worldgen/mine_abuts.py (abc123 subject of tooling/world-generation/worldgen/mine_abuts.py)");
  assert.equal(got[1].label, "NEW");
  assert.equal(got[2].label, "UNCHECKED");
});

test("testTarget: the module a test file is named for, else the test file", () => {
  assert.equal(testTarget("placement", "worldgen/test_blueprint.py::t", repoRoot), "tooling/world-generation/worldgen/blueprint.py");
  assert.equal(testTarget("placement", "worldgen/test_no_such_module_zz.py::t", repoRoot), "tooling/world-generation/worldgen/test_no_such_module_zz.py");
});

test("a corrupt record reads as empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "heads-"));
  writeFileSync(join(dir, "head-cccc.json"), "{");
  assert.deepEqual(readRecord(dir, "cccc").gates, {});
  assert.equal(firstSeen(dir, "placement", "x"), null);
});
