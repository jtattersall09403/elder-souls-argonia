/**
 * Shared bits for the province raster artefact (publish/fetch).
 *
 * The generated rasters are ~110 MB of rebuild output. They are defined once
 * in set.json, hashed into rasters-manifest.json (which IS committed), and
 * shipped as an asset of a rolling GitHub release.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = fileURLToPath(new URL(".", import.meta.url));
export const ROOT = join(HERE, "..", "..");

export const SET = JSON.parse(readFileSync(join(HERE, "set.json"), "utf8"));
export const PROVINCE = join(ROOT, SET.root);
export const MANIFEST = join(PROVINCE, "rasters-manifest.json");
export const TAG = "province-rasters";

const posix = (p) => p.split(sep).join("/");

/** Glob subset: `**` (any depth), `*` (one segment, no `/`). */
function globToRe(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      // `**/` matches zero or more directories; a bare `**` matches anything.
      if (pattern[i + 2] === "/") { re += "(?:[^/]+/)*"; i += 2; }
      else { re += ".*"; i += 1; }
    } else if (c === "*") re += "[^/]*";
    else re += c.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const RES = SET.patterns.map(globToRe);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

/** Every file under the province dir matching the set, as posix relative paths, sorted. */
export function matchedFiles() {
  return walk(PROVINCE)
    .map((abs) => posix(relative(PROVINCE, abs)))
    .filter((rel) => RES.some((re) => re.test(rel)))
    .sort();
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const fileSha = (abs) => sha256(readFileSync(abs));

/** Combined sha over the sorted `path\nsha\n` lines. */
export const combinedSha = (files) =>
  sha256(files.map((f) => `${f.path}\n${f.sha256}\n`).join(""));

export function readManifest() {
  if (!existsSync(MANIFEST)) return null;
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

/** Compare the working tree against a manifest. */
export function verify(manifest) {
  const missing = [];
  const wrong = [];
  for (const f of manifest.files) {
    const abs = join(PROVINCE, f.path);
    if (!existsSync(abs)) { missing.push(f.path); continue; }
    if (fileSha(abs) !== f.sha256) wrong.push(f.path);
  }
  const extra = matchedFiles().filter(
    (p) => !manifest.files.some((f) => f.path === p),
  );
  return { missing, wrong, extra, ok: !missing.length && !wrong.length && !extra.length };
}

export function ownerRepo() {
  const url = String(
    execSync("git remote get-url origin", { cwd: ROOT, encoding: "utf8" }),
  ).trim();
  const m = url.match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) throw new Error(`cannot derive owner/repo from origin: ${url}`);
  return { owner: m[1], repo: m[2] };
}
