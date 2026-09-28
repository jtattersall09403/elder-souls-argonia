#!/usr/bin/env node
/**
 * Preflight gate `site-refs` (decision 0052 addendum 2026-09-28): the composer's
 * kit reach and dangling-reference gate, run over the SOURCES so it needs no
 * `npm run build` (sub-second). compose.mjs runs the same two functions over
 * the built site on every deploy; this is the copy that fails before a merge.
 *
 * Roots (what compose reads from the built JS and the live records): every
 * `kits/<id>` a studio or package source file, the studio's index.html, or a
 * public record outside `kits/` names. Dark records count as live here, which
 * can only keep more and check more than compose does.
 *
 *   node tooling/repo-standards/check_site_refs.mjs [--public <dir>]
 *
 * Exit 1 lists every dangling reference; exit 0 prints the counts and the time.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { kitRefs } from "../pages-site/kit-ref.mjs";
import { danglingRefs, kitIdOf, kitReach } from "../pages-site/kit-reach.mjs";

const t0 = performance.now();
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const at = args.indexOf("--public");
const PUBLIC = resolve(root, at >= 0 ? args[at + 1] : "apps/world-studio/public");
const SOURCE_EXT = /\.(ts|tsx|js|mjs|html|json)$/;
const RECORD_EXT = /\.(json|js|mjs|html|css|svg|txt|csv)$/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const pub = (f) => relative(PUBLIC, f).split("\\").join("/");

const sources = [
  ...walk(join(root, "apps/world-studio/src")),
  ...readdirSync(join(root, "packages")).flatMap((p) => walk(join(root, "packages", p, "src"))),
  join(root, "apps/world-studio/index.html"),
].filter((f) => SOURCE_EXT.test(f) && !/\.test\.[a-z]+$|\.testHelper\.|\/__fixtures__\//.test(f) && existsSync(f));
const publicFiles = walk(PUBLIC);
const records = publicFiles.filter((f) => RECORD_EXT.test(f) && !pub(f).startsWith("kits/"));

const literal = new Map();
for (const f of [...sources, ...records]) {
  for (const id of kitRefs(readFileSync(f, "utf8"))) if (!literal.has(id)) literal.set(id, relative(root, f));
}
const kitFiles = publicFiles.map(pub).filter((r) => r.startsWith("kits/")).map((r) => r.slice(5));
const kitIds = new Set(kitFiles.map(kitIdOf));
const failures = [];
for (const [id, by] of literal) if (!kitIds.has(id)) failures.push(`${by} names kits/${id} but no such kit is published`);

const readPub = (r) => JSON.parse(readFileSync(join(PUBLIC, r), "utf8"));
const reach = kitReach(kitFiles, new Set(literal.keys()), (r) => readPub(`kits/${r}`));
const shipped = new Set([...publicFiles.map(pub).filter((r) => !r.startsWith("kits/")), ...[...reach.keep].map((r) => `kits/${r}`)]);
const liveJson = [...shipped].filter((r) => r.endsWith(".json"));
for (const d of danglingRefs(shipped, liveJson, readPub)) failures.push(`dangling reference: ${d.from} names ${d.ref}, which a composed site would not carry`);

const ms = Math.round(performance.now() - t0);
if (failures.length) {
  for (const f of failures) console.error(`site-refs FAIL: ${f}`);
  console.error(`site-refs: ${failures.length} failure(s) (${ms} ms)`);
  process.exit(1);
}
console.log(`site-refs: ${literal.size} kits named, ${reach.keep.size}/${kitFiles.length} kit files kept, ${liveJson.length} JSON files checked, 0 dangling (${ms} ms)`);
