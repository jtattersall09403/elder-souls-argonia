#!/usr/bin/env node
/**
 * Fetch (or verify) the generated province rasters named by
 * apps/world-studio/public/province/rasters-manifest.json.
 *
 *   npm run province:fetch   — download and extract if anything is missing/stale
 *   npm run province:check   — verify only; used as an `npm test` gate
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  PROVINCE, MANIFEST, TAG, readManifest, verify, sha256, ownerRepo,
} from "./common.mjs";

const checkOnly = process.argv.includes("--check");

const manifest = readManifest();
if (!manifest) {
  console.error(`province: ${MANIFEST} is missing. Run \`npm run province:publish\` after a chain run to create it.`);
  process.exit(1);
}

const state = verify(manifest);
if (state.ok) {
  console.log("province rasters current");
  process.exit(0);
}

// Which of the two commands does this tree need? Files the manifest names but
// the tree lacks (or whose bytes are stale) => fetch. Files present but
// DIFFERENT, or files matching the set that the manifest does not name => a
// rebuild nobody published.
const allMissing = state.missing.length === manifest.files.length;
const needsPublish = !allMissing && (state.wrong.length > 0 || state.extra.length > 0);

const describe = () => {
  const bits = [];
  if (state.missing.length) bits.push(`${state.missing.length} missing (e.g. ${state.missing[0]})`);
  if (state.wrong.length) bits.push(`${state.wrong.length} differ from the manifest (e.g. ${state.wrong[0]})`);
  if (state.extra.length) bits.push(`${state.extra.length} not in the manifest (e.g. ${state.extra[0]})`);
  return bits.join(", ");
};

if (checkOnly || needsPublish) {
  const what = describe();
  if (allMissing) {
    console.error(`province rasters: none of the ${manifest.files.length} generated rasters are present — run \`npm run province:fetch\``);
  } else if (needsPublish) {
    console.error(`province rasters: local files differ from rasters-manifest.json (${what}) — a rebuild that was not published. Run \`npm run province:publish\`, then commit the manifest.`);
  } else {
    console.error(`province rasters: out of date against rasters-manifest.json (${what}) — run \`npm run province:fetch\``);
  }
  process.exit(1);
}

const { owner, repo } = ownerRepo();
const url = `https://github.com/${owner}/${repo}/releases/download/${TAG}/${manifest.release.asset}`;
console.log(`province rasters: ${describe()} — downloading ${url}`);

const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.error(`province rasters: download failed (HTTP ${res.status}) for ${url}`);
  process.exit(1);
}
const bytes = Buffer.from(await res.arrayBuffer());

const tmp = mkdtempSync(join(tmpdir(), "province-fetch-"));
let failed = null;
try {
  const archive = join(tmp, manifest.release.asset);
  writeFileSync(archive, bytes);
  const stage = join(tmp, "stage");
  mkdirSync(stage);
  execFileSync("tar", ["-xzf", archive, "-C", stage]);

  // Verify the archive BEFORE anything lands in the working tree.
  for (const f of manifest.files) {
    const abs = join(stage, f.path);
    if (!existsSync(abs)) { failed = `archive is missing ${f.path}`; break; }
    if (sha256(readFileSync(abs)) !== f.sha256) { failed = `archive sha mismatch for ${f.path}`; break; }
  }
  if (failed) {
    console.error(`province rasters: ${failed} — the release asset does not match the committed manifest.`);
    process.exit(1);
  }

  for (const f of manifest.files) {
    const dest = join(PROVINCE, f.path);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(stage, f.path), dest);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const after = verify(manifest);
if (!after.ok) {
  console.error(`province rasters: extraction did not satisfy the manifest (${after.missing.length} missing, ${after.wrong.length} wrong).`);
  process.exit(1);
}
console.log(`province rasters current (${manifest.files.length} files, ${(manifest.sizeBytes / 1e6).toFixed(1)} MB)`);
