/**
 * Unit tests for the province artefact set logic (no network, no gh).
 *
 * common.mjs reads its root and set once at import, so each case writes a
 * fixture tree, sets PROVINCE_ARTEFACT_ROOT/PROVINCE_ARTEFACT_SET and imports
 * a fresh copy of the module via a cache-busting query.
 *
 *   node --test tooling/province-artefact/common.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const SET = {
  schemaVersion: 2,
  root: "unused",
  groups: { water: ["water/**/*.png"], vegetation: ["vegetation/**"] },
};

let n = 0;
/** Build a fixture province dir + set.json and import a fresh common.mjs. */
async function load(files, set = SET) {
  const dir = mkdtempSync(join(tmpdir(), "province-set-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  const setPath = join(dir, "set.json");
  writeFileSync(setPath, JSON.stringify(set));
  process.env.PROVINCE_ARTEFACT_ROOT = dir;
  process.env.PROVINCE_ARTEFACT_SET = setPath;
  const mod = await import(`./common.mjs?fixture=${n++}`);
  return { dir, mod, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("matchedFiles groups files and ignores non-matching ones", async () => {
  const { mod, cleanup } = await load({
    "water/level/a.png": "a",
    "water/b.png": "b",
    "vegetation/scatter.bin": "c",
    "places.json": "{}",
  });
  try {
    assert.deepEqual(mod.matchedFiles(), {
      water: ["water/b.png", "water/level/a.png"],
      vegetation: ["vegetation/scatter.bin"],
    });
  } finally { cleanup(); }
});

test("a file matching two groups throws", async () => {
  const { mod, cleanup } = await load(
    { "water/a.png": "a" },
    { schemaVersion: 2, root: "unused", groups: { water: ["water/**/*.png"], both: ["**/*.png"] } },
  );
  try {
    assert.throws(() => mod.matchedFiles(), /more than one group/);
  } finally { cleanup(); }
});

test("verify reports missing, wrong and extra per group", async () => {
  const { mod, cleanup } = await load({
    "water/kept.png": "kept",
    "water/changed.png": "changed on disk",
    "water/extra.png": "extra",
    "vegetation/v.bin": "v",
  });
  try {
    const sha = (s) => mod.sha256(Buffer.from(s));
    const manifest = {
      schemaVersion: 2,
      release: { tag: "t" },
      groups: {
        water: {
          sha256: "x", sizeBytes: 0, asset: "a.tar.gz",
          files: [
            { path: "water/kept.png", sha256: sha("kept"), bytes: 4 },
            { path: "water/changed.png", sha256: sha("original"), bytes: 8 },
            { path: "water/gone.png", sha256: sha("gone"), bytes: 4 },
          ],
        },
        vegetation: {
          sha256: "y", sizeBytes: 1, asset: "b.tar.gz",
          files: [{ path: "vegetation/v.bin", sha256: sha("v"), bytes: 1 }],
        },
      },
    };
    const state = mod.verify(manifest);
    assert.equal(state.ok, false);
    assert.deepEqual(state.groups.water.missing, ["water/gone.png"]);
    assert.deepEqual(state.groups.water.wrong, ["water/changed.png"]);
    assert.deepEqual(state.groups.water.extra, ["water/extra.png"]);
    assert.equal(state.groups.water.ok, false);
    assert.deepEqual(state.groups.vegetation, { missing: [], wrong: [], extra: [], ok: true });
  } finally { cleanup(); }
});

test("readManifest rejects schemaVersion 1", async () => {
  const { dir, mod, cleanup } = await load({ "water/a.png": "a" });
  try {
    writeFileSync(join(dir, "rasters-manifest.json"), JSON.stringify({ schemaVersion: 1, files: [] }));
    assert.throws(() => mod.readManifest(), /schemaVersion 1 is not supported/);
  } finally { cleanup(); }
});

test("combinedSha is stable over the path/sha lines", async () => {
  const { mod, cleanup } = await load({ "water/a.png": "a" });
  try {
    const files = [{ path: "water/a.png", sha256: "aa" }, { path: "water/b.png", sha256: "bb" }];
    assert.equal(mod.combinedSha(files), mod.combinedSha(files.map((f) => ({ ...f }))));
    assert.notEqual(mod.combinedSha(files), mod.combinedSha(files.slice(0, 1)));
  } finally { cleanup(); }
});
