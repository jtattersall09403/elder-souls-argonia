/**
 * Shared bits for the province raster artefact (publish/fetch).
 *
 * The generated rasters are ~120 MB of rebuild output. They are defined once
 * in set.json as five GROUPS (chunks, refined, water, vegetation, apron),
 * hashed per group into rasters-manifest.json (which IS committed), and
 * shipped as one release asset PER GROUP, so a scatter-only rebuild uploads
 * only the vegetation archive rather than the whole province.
 *
 * Root and set can be overridden with PROVINCE_ARTEFACT_ROOT (an absolute
 * path to the province dir) and PROVINCE_ARTEFACT_SET (a set.json path); the
 * default behaviour is unchanged. Tests use these to point at a fixture.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = fileURLToPath(new URL(".", import.meta.url));
export const ROOT = join(HERE, "..", "..");

export const SET_PATH = process.env.PROVINCE_ARTEFACT_SET || join(HERE, "set.json");
export const SET = JSON.parse(readFileSync(SET_PATH, "utf8"));
export const PROVINCE = process.env.PROVINCE_ARTEFACT_ROOT || join(ROOT, SET.root);
export const MANIFEST = join(PROVINCE, "rasters-manifest.json");
export const TAG = "province-rasters";
export const GROUPS = Object.keys(SET.groups);

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

const GROUP_RES = Object.fromEntries(
  Object.entries(SET.groups).map(([name, pats]) => [name, pats.map(globToRe)]),
);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

/**
 * Every file under the province dir matching the set, grouped:
 * `{ [group]: [posix relative paths, sorted] }`. Every group is present, even
 * when empty. A file matching two groups is an authoring error and throws:
 * it would be uploaded twice and its two copies could disagree.
 */
export function matchedFiles() {
  const out = Object.fromEntries(GROUPS.map((g) => [g, []]));
  for (const abs of walk(PROVINCE)) {
    const rel = posix(relative(PROVINCE, abs));
    const hits = GROUPS.filter((g) => GROUP_RES[g].some((re) => re.test(rel)));
    if (hits.length > 1)
      throw new Error(
        `${SET_PATH}: ${rel} matches more than one group (${hits.join(", ")}); groups must not overlap.`,
      );
    if (hits.length === 1) out[hits[0]].push(rel);
  }
  for (const g of GROUPS) out[g].sort();
  return out;
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const fileSha = (abs) => sha256(readFileSync(abs));

/** Combined sha over the sorted `path\nsha\n` lines (per group). */
export const combinedSha = (files) =>
  sha256(files.map((f) => `${f.path}\n${f.sha256}\n`).join(""));

export function readManifest() {
  if (!existsSync(MANIFEST)) return null;
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  if (m.schemaVersion !== 2)
    throw new Error(
      `${MANIFEST}: schemaVersion ${m.schemaVersion} is not supported — this tooling reads schemaVersion 2 (per-group manifests). Run \`npm run province:publish\` to rewrite it.`,
    );
  return m;
}

/**
 * Compare the working tree against a manifest, per group.
 * `{ groups: { [name]: { missing, wrong, extra, ok } }, ok }`.
 */
export function verify(manifest) {
  const present = matchedFiles();
  const groups = {};
  let ok = true;
  for (const name of GROUPS) {
    const entry = manifest.groups?.[name];
    const files = entry?.files ?? [];
    const missing = [];
    const wrong = [];
    for (const f of files) {
      const abs = join(PROVINCE, f.path);
      if (!existsSync(abs)) { missing.push(f.path); continue; }
      if (fileSha(abs) !== f.sha256) wrong.push(f.path);
    }
    const extra = (present[name] ?? []).filter((p) => !files.some((f) => f.path === p));
    const gOk = !missing.length && !wrong.length && !extra.length;
    if (!gOk) ok = false;
    groups[name] = { missing, wrong, extra, ok: gOk };
  }
  return { groups, ok };
}

export function ownerRepo() {
  const url = String(
    execSync("git remote get-url origin", { cwd: ROOT, encoding: "utf8" }),
  ).trim();
  const m = url.match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) throw new Error(`cannot derive owner/repo from origin: ${url}`);
  return { owner: m[1], repo: m[2] };
}
