#!/usr/bin/env node
/**
 * Publish the generated province rasters as assets of a rolling GitHub release.
 *
 * One asset per group (chunks, refined, water, vegetation, apron): a group
 * whose asset name is already on the release is unchanged and is skipped, so a
 * scatter-only chain run uploads the vegetation archive alone.
 *
 * Run this after ANY terrain/water/vegetation chain run, then commit the
 * regenerated rasters-manifest.json. The rasters themselves are gitignored.
 *
 *   npm run province:publish
 *   node tooling/province-artefact/publish.mjs --dry-run   # plan only, no gh, no write
 */
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, statSync, rmSync, mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROVINCE, MANIFEST, TAG, GROUPS, matchedFiles, fileSha, combinedSha, ownerRepo,
} from "./common.mjs";

const dryRun = process.argv.includes("--dry-run");
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

const grouped = matchedFiles();
const total = GROUPS.reduce((n, g) => n + grouped[g].length, 0);
if (total === 0) {
  console.error(`province:publish: no files matched under ${PROVINCE}. Nothing to publish.`);
  process.exit(1);
}

const groups = {};
for (const name of GROUPS) {
  const files = grouped[name].map((p) => {
    const abs = join(PROVINCE, p);
    return { path: p, sha256: fileSha(abs), bytes: statSync(abs).size };
  });
  const sha = combinedSha(files);
  groups[name] = {
    sha256: sha,
    sizeBytes: files.reduce((n, f) => n + f.bytes, 0),
    asset: `province-${name}-${sha.slice(0, 12)}.tar.gz`,
    files,
  };
}

const manifest = { schemaVersion: 2, release: { tag: TAG }, groups };

for (const name of GROUPS)
  console.log(`  ${name}: ${groups[name].files.length} files, ${mb(groups[name].sizeBytes)}, ${groups[name].asset}`);
console.log(`manifest: ${total} files, ${mb(GROUPS.reduce((n, g) => n + groups[g].sizeBytes, 0))}`);

if (dryRun) {
  // Plan against the committed manifest: which groups' content changed?
  let old = null;
  if (existsSync(MANIFEST)) {
    try { old = JSON.parse(readFileSync(MANIFEST, "utf8")); } catch { old = null; }
  }
  // A v1 manifest has no groups, but it does have per-file shas, so the plan
  // can still be honest about which groups actually changed.
  const v1 = old?.schemaVersion === 1 ? new Map(old.files.map((f) => [f.path, f.sha256])) : null;
  const changed = (name) => {
    if (old?.schemaVersion === 2) return old.groups?.[name]?.asset !== groups[name].asset;
    if (!v1) return true;
    const files = groups[name].files;
    return files.some((f) => v1.get(f.path) !== f.sha256);
  };
  let upload = 0;
  console.log(`\nplan (vs the committed manifest${v1 ? ", schemaVersion 1: compared file by file" : ""}; the release is not queried in --dry-run):`);
  for (const name of GROUPS) {
    if (!changed(name)) console.log(`  ${name}: unchanged, would skip`);
    else {
      upload += groups[name].sizeBytes;
      console.log(`  ${name}: would upload ${groups[name].asset} (${mb(groups[name].sizeBytes)})`);
    }
  }
  console.log(`  total to upload: ${mb(upload)} of ${mb(GROUPS.reduce((n, g) => n + groups[g].sizeBytes, 0))}`);
  process.exit(0);
}

// Written BEFORE any upload, so a partial failure still leaves a truthful
// record of what the tree contains.
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const { owner, repo } = ownerRepo();

// Does the release exist? Which assets does it already carry?
let existing = [];
try {
  const json = execSync(`gh release view ${TAG} --json assets`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  existing = JSON.parse(json).assets.map((a) => a.name);
} catch {
  console.log(`creating release ${TAG}…`);
  execSync(
    `gh release create ${TAG} --title "Province rasters" ` +
      `--notes "Generated terrain/water/vegetation rasters; see apps/world-studio/public/province/rasters-manifest.json" --latest=false`,
    { stdio: "inherit" },
  );
}

let uploaded = 0;
const tmp = mkdtempSync(join(tmpdir(), "province-rasters-"));
try {
  for (const name of GROUPS) {
    const g = groups[name];
    if (existing.includes(g.asset)) {
      console.log(`${name}: unchanged (asset present), skipped`);
      continue;
    }
    const archive = join(tmp, g.asset);
    // -T - keeps the argument list bounded and the member order deterministic.
    execFileSync("tar", ["-czf", archive, "-C", PROVINCE, "-T", "-"], { input: g.files.map((f) => f.path).join("\n") });
    const bytes = statSync(archive).size;
    console.log(`${name}: ${g.files.length} files, archive ${mb(bytes)} — uploading ${g.asset}…`);
    execSync(`gh release upload ${TAG} ${JSON.stringify(archive)} --clobber`, { stdio: "inherit" });
    uploaded += bytes;
    rmSync(archive, { force: true });
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`uploaded ${mb(uploaded)} in total`);
console.log(`https://github.com/${owner}/${repo}/releases/tag/${TAG}`);
