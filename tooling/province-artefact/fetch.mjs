#!/usr/bin/env node
/**
 * Fetch (or verify) the generated province rasters named by
 * apps/world-studio/public/province/rasters-manifest.json.
 *
 * The manifest is per group (chunks, refined, water, vegetation, apron) and so
 * is the work: only groups that are missing or stale are downloaded.
 *
 *   npm run province:fetch   — download and extract the groups that need it
 *   npm run province:check   — verify only; used as an `npm test` gate
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  PROVINCE, MANIFEST, TAG, GROUPS, readManifest, verify, sha256, ownerRepo,
} from "./common.mjs";

const checkOnly = process.argv.includes("--check");

let manifest;
try {
  manifest = readManifest();
} catch (err) {
  console.error(`province rasters: ${err.message}`);
  process.exit(1);
}
if (!manifest) {
  console.error(`province: ${MANIFEST} is missing. Run \`npm run province:publish\` after a chain run to create it.`);
  process.exit(1);
}

const state = verify(manifest);
if (state.ok) {
  console.log("province rasters current");
  process.exit(0);
}

const describe = (s) => {
  const bits = [];
  if (s.missing.length) bits.push(`${s.missing.length} missing (e.g. ${s.missing[0]})`);
  if (s.wrong.length) bits.push(`${s.wrong.length} differ from the manifest (e.g. ${s.wrong[0]})`);
  if (s.extra.length) bits.push(`${s.extra.length} not in the manifest (e.g. ${s.extra[0]})`);
  return bits.join(", ");
};

// A group whose files are present but DIFFERENT, or which has files matching
// the set that the manifest does not name, is a rebuild nobody published.
const needsPublish = GROUPS.filter((g) => {
  const s = state.groups[g];
  const count = manifest.groups?.[g]?.files?.length ?? 0;
  const allMissing = count > 0 && s.missing.length === count;
  return !allMissing && (s.wrong.length > 0 || s.extra.length > 0);
});
const needsFetch = GROUPS.filter((g) => !state.groups[g].ok && !needsPublish.includes(g));

if (needsPublish.length) {
  for (const g of needsPublish)
    console.error(`province rasters: group ${g} differs from rasters-manifest.json (${describe(state.groups[g])}) — a rebuild that was not published. Run \`npm run province:publish\`, then commit the manifest.`);
  process.exit(1);
}

if (checkOnly) {
  for (const g of needsFetch)
    console.error(`province rasters: group ${g} is out of date against rasters-manifest.json (${describe(state.groups[g])}) — run \`npm run province:fetch\``);
  process.exit(1);
}

const { owner, repo } = ownerRepo();
for (const g of needsFetch) {
  const entry = manifest.groups[g];
  const url = `https://github.com/${owner}/${repo}/releases/download/${TAG}/${entry.asset}`;
  console.log(`province rasters: group ${g} — ${describe(state.groups[g])} — downloading ${url}`);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    console.error(`province rasters: download failed (HTTP ${res.status}) for ${url}`);
    process.exit(1);
  }
  const bytes = Buffer.from(await res.arrayBuffer());

  const tmp = mkdtempSync(join(tmpdir(), "province-fetch-"));
  try {
    const archive = join(tmp, entry.asset);
    writeFileSync(archive, bytes);
    const stage = join(tmp, "stage");
    mkdirSync(stage);
    execFileSync("tar", ["-xzf", archive, "-C", stage]);

    // Verify the archive BEFORE anything lands in the working tree.
    let failed = null;
    for (const f of entry.files) {
      const abs = join(stage, f.path);
      if (!existsSync(abs)) { failed = `archive is missing ${f.path}`; break; }
      if (sha256(readFileSync(abs)) !== f.sha256) { failed = `archive sha mismatch for ${f.path}`; break; }
    }
    if (failed) {
      console.error(`province rasters: group ${g}: ${failed} — the release asset does not match the committed manifest.`);
      process.exit(1);
    }

    for (const f of entry.files) {
      const dest = join(PROVINCE, f.path);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(stage, f.path), dest);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const after = verify(manifest).groups[g];
  if (!after.ok) {
    console.error(`province rasters: group ${g}: extraction did not satisfy the manifest (${after.missing.length} missing, ${after.wrong.length} wrong).`);
    process.exit(1);
  }
  console.log(`province rasters: group ${g} current (${entry.files.length} files, ${(entry.sizeBytes / 1e6).toFixed(1)} MB)`);
}

const final = verify(manifest);
if (!final.ok) {
  const bad = GROUPS.filter((g) => !final.groups[g].ok);
  console.error(`province rasters: still out of date after fetching (${bad.join(", ")}).`);
  process.exit(1);
}
const count = GROUPS.reduce((n, g) => n + (manifest.groups[g]?.files.length ?? 0), 0);
const size = GROUPS.reduce((n, g) => n + (manifest.groups[g]?.sizeBytes ?? 0), 0);
console.log(`province rasters current (${count} files, ${(size / 1e6).toFixed(1)} MB)`);
