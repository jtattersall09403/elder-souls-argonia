#!/usr/bin/env node
/**
 * Publish the generated province rasters as a rolling GitHub release asset.
 *
 * Run this after ANY terrain/water/vegetation chain run, then commit the
 * regenerated rasters-manifest.json. The rasters themselves are gitignored.
 *
 *   npm run province:publish
 */
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, statSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROVINCE, MANIFEST, TAG, matchedFiles, fileSha, combinedSha, ownerRepo,
} from "./common.mjs";

const paths = matchedFiles();
if (paths.length === 0) {
  console.error(`province:publish: no files matched under ${PROVINCE}. Nothing to publish.`);
  process.exit(1);
}

const files = paths.map((p) => {
  const abs = join(PROVINCE, p);
  return { path: p, sha256: fileSha(abs), bytes: statSync(abs).size };
});
const sha = combinedSha(files);
const sizeBytes = files.reduce((n, f) => n + f.bytes, 0);
const asset = `province-rasters-${sha.slice(0, 12)}.tar.gz`;

const manifest = {
  schemaVersion: 1,
  sha256: sha,
  sizeBytes,
  release: { tag: TAG, asset },
  files,
};
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest: ${files.length} files, ${(sizeBytes / 1e6).toFixed(1)} MB, sha ${sha}`);

const { owner, repo } = ownerRepo();
const url = `https://github.com/${owner}/${repo}/releases/download/${TAG}/${asset}`;

// Does the release exist? Does it already carry this exact asset?
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

if (existing.includes(asset)) {
  console.log(`asset ${asset} already published — upload skipped.`);
  console.log(url);
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "province-rasters-"));
const archive = join(tmp, asset);
try {
  // -T - keeps the argument list bounded and the member order deterministic.
  execFileSync("tar", ["-czf", archive, "-C", PROVINCE, "-T", "-"], { input: paths.join("\n") });
  console.log(`archive: ${(statSync(archive).size / 1e6).toFixed(1)} MB — uploading…`);
  execSync(`gh release upload ${TAG} ${JSON.stringify(archive)} --clobber`, { stdio: "inherit" });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(url);
