#!/usr/bin/env node
/**
 * Compose the GitHub Pages site from the two built apps, carrying only what
 * the shipped ladder can display (16f round 4, decision 0073).
 *
 *   node tooling/pages-site/compose.mjs [--out site] [--warn-mb 750] [--fail-mb 900]
 *
 * Layout (unchanged since the first deploy): combat sandbox at the root path,
 * world studio under /studio/.
 *
 * WHY THIS EXISTS. GitHub Pages publishes at most 1 GB. The raw compose was
 * measured at 1,041 MB on 2026-09-18 (999 MB after two orphan probe kits went)
 * and ~430 MB of that was architecture kits that the deployed studio CANNOT
 * request: `packages/game-core/src/settlement/SettlementLayer.tsx` is their
 * only loader, it mounts only when the ladder shows the `settlements` layer
 * (apps/world-studio/src/ladder.ts), and `province/ladder.json` hides that
 * layer until 16h rebuilds settlements on the frozen ground.
 *
 * THE RULE, derived at build time from the shipped records, never from a
 * hand-written list:
 *   1. `province/ladder.json` says which layers are hidden. A record that
 *      exists only to feed a hidden layer is DARK (table below).
 *   2. A kit under `kits/` ships iff some shipped text file (JS, HTML, CSS,
 *      JSON) that is not dark and not itself under `kits/` names `kits/<id>`.
 *      Kits the app names in code (flora, groundcover, underwater, waterfall)
 *      are therefore always kept, even though the settlement record also
 *      lists flora; kits named only by a dark record, or by nothing at all
 *      (a build-side product no runtime reads yet), are excluded.
 *   3. When 16h un-hides `settlements`, the record stops being dark, its kit
 *      table becomes a root and every kit it names ships again. Nothing to
 *      edit.
 *
 * GATES (each exits non-zero; a wrong derivation must fail the build, never
 * ship a site that 404s):
 *   - the ladder names a layer this table does not know;
 *   - a dark record is missing from the build;
 *   - a kit the shipped code or a live record names is absent on disk;
 *   - after pruning, any shipped text file still names an excluded kit;
 *   - a chain-only raster is named by anything but the provenance manifest;
 *   - the composed site exceeds --fail-mb (warns above --warn-mb);
 *   - audio (standard 16, decision 0094): the shipped audio tree, counted
 *     ONCE from `packages/audio/files` and reserved in the site total even
 *     before an app ships it; more than one shipped copy (an app must pass
 *     the plugin's `sharedBase`), a copy that differs from the manifest, or
 *     audio over `packages/audio/budget.json` fails.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = resolve(root, opt("--out", "site"));
const SANDBOX_DIST = resolve(root, "apps/combat-sandbox/dist");
const STUDIO_DIST = resolve(root, "apps/world-studio/dist");
// GitHub Pages' documented limit is 1 GB (1,000 MB in their prose; treated as
// 1,000,000,000 bytes here to be safe against either reading). Fail at 900 MB
// so a deploy never lands within a single kit (10–80 MB) of the cliff; warn at
// 750 MB so growth is visible two or three kits before it fails.
const WARN_MB = Number(opt("--warn-mb", 750));
const FAIL_MB = Number(opt("--fail-mb", 900));
const MB = 1_000_000;

/**
 * Records that exist only to feed a ladder layer. Mirrors the mount gates in
 * apps/world-studio/src/{Fly3D,character/CharacterMode}.tsx: the settlement
 * bundle (and the route-structure placements that ride in it) mounts only
 * when `settlements` is shown. Add a row when a new layer gets its own record
 * whose kits nothing else names.
 */
const LAYER_RECORDS = [
  { layer: "settlements", record: "province/settlements.json" },
];
/** Every layer the ladder may hide — a copy of LADDER_LAYERS in ladder.ts; an unknown name fails. */
const KNOWN_LAYERS = new Set(["apron", "settlements", "vegetation", "water", "route-structures", "places", "waterways", "services"]);
/**
 * Rasters the terrain chain writes into the public folder for its own next
 * run and no runtime reads (rasters-manifest.json names them so
 * `province:fetch` restores them for the chain). Each is dropped only after
 * the gate proves that nothing shipped but the provenance manifest names it,
 * so a runtime that starts reading one turns this into a build failure, not
 * a 404.
 */
const CHAIN_ONLY = [];
const PROVENANCE_RECORDS = new Set(["province/rasters-manifest.json"]);
const TEXT_EXT = new Set([".js", ".mjs", ".html", ".css", ".json", ".svg", ".txt", ".csv"]);

const failures = [];
const fail = (msg) => failures.push(msg);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const bytesOf = (dir) => walk(dir).reduce((s, f) => s + statSync(f).size, 0);
const fmt = (b) => `${(b / MB).toFixed(1)} MB (${b.toLocaleString("en-GB")} B)`;

for (const d of [SANDBOX_DIST, STUDIO_DIST]) {
  if (!existsSync(d)) { console.error(`compose: missing build ${d} (run npm run build)`); process.exit(2); }
}
const before = bytesOf(SANDBOX_DIST) + bytesOf(STUDIO_DIST);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "studio"), { recursive: true });
cpSync(SANDBOX_DIST, OUT, { recursive: true });
cpSync(STUDIO_DIST, join(OUT, "studio"), { recursive: true });
const studio = join(OUT, "studio");

// 1. The ladder → dark records.
const ladderPath = join(studio, "province/ladder.json");
let hidden = [];
if (existsSync(ladderPath)) {
  const ladder = JSON.parse(readFileSync(ladderPath, "utf8"));
  if (ladder.schemaVersion !== 1) fail(`ladder.json schemaVersion ${ladder.schemaVersion}: this script reads schema 1`);
  hidden = ladder.hiddenLayers ?? [];
  for (const l of hidden) if (!KNOWN_LAYERS.has(l)) fail(`ladder hides unknown layer "${l}": add it to KNOWN_LAYERS and decide whether it has a dark record`);
} else {
  console.warn("compose: no province/ladder.json — nothing hidden, every named kit ships");
}
const dark = new Set(LAYER_RECORDS.filter((r) => hidden.includes(r.layer)).map((r) => r.record));
for (const r of dark) if (!existsSync(join(studio, r))) fail(`dark record ${r} is hidden by the ladder but missing from the build`);

// 2. Kit reachability from every shipped text file that is not dark and not a kit file.
const rel = (f) => relative(studio, f).split("\\").join("/");
const isText = (f) => TEXT_EXT.has(f.slice(f.lastIndexOf(".")));
const allFiles = walk(studio);
const roots = allFiles.filter((f) => { const r = rel(f); return isText(f) && !r.startsWith("kits/") && !dark.has(r); });
const KIT_REF = /kits\/([A-Za-z0-9_-]+)/g;
const referenced = new Map(); // id -> first referencing file
for (const f of roots) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(KIT_REF)) if (!referenced.has(m[1])) referenced.set(m[1], rel(f));
}
const darkNamed = new Set();
for (const r of dark) for (const m of readFileSync(join(studio, r), "utf8").matchAll(KIT_REF)) darkNamed.add(m[1]);

const kitsDir = join(studio, "kits");
const kitEntries = existsSync(kitsDir) ? readdirSync(kitsDir, { withFileTypes: true }) : [];
const kitIds = new Set(kitEntries.map((e) => e.isDirectory() ? e.name : e.name.split(".")[0]));
for (const [id, by] of referenced) if (!kitIds.has(id)) fail(`${by} names kits/${id} but no such kit is in the build`);

const excluded = [...kitIds].filter((id) => !referenced.has(id)).sort();
let excludedBytes = 0;
for (const e of kitEntries) {
  const id = e.isDirectory() ? e.name : e.name.split(".")[0];
  if (referenced.has(id)) continue;
  const p = join(kitsDir, e.name);
  excludedBytes += e.isDirectory() ? bytesOf(p) : statSync(p).size;
  rmSync(p, { recursive: true, force: true });
}

// 3. Chain-only rasters: drop only if nothing but the provenance manifest names them.
const chainDropped = [];
for (const r of CHAIN_ONLY) {
  const p = join(studio, r);
  if (!existsSync(p)) continue;
  const base = r.slice(r.lastIndexOf("/") + 1);
  const namedBy = roots.filter((f) => !PROVENANCE_RECORDS.has(rel(f)) && readFileSync(f, "utf8").includes(base)).map(rel);
  if (namedBy.length) { fail(`chain-only raster ${r} is named by ${namedBy.join(", ")}: it is no longer chain-only, remove it from CHAIN_ONLY`); continue; }
  excludedBytes += statSync(p).size;
  rmSync(p);
  chainDropped.push(r);
}

// 4. Post-prune gate: nothing shipped may still name an excluded kit.
const excludedSet = new Set(excluded);
for (const f of walk(studio).filter(isText)) {
  for (const m of readFileSync(f, "utf8").matchAll(KIT_REF)) {
    if (excludedSet.has(m[1]) && !dark.has(rel(f)) && !rel(f).startsWith("kits/")) fail(`${rel(f)} names excluded kit ${m[1]}`);
  }
}

// 5. Audio: counted once, reserved before any app ships it, one copy only.
const audioRoot = resolve(root, "packages/audio/files");
const audioManifestPath = join(audioRoot, "audio-manifest.json");
const audioBudget = JSON.parse(readFileSync(resolve(root, "packages/audio/budget.json"), "utf8"));
const audioBytes = existsSync(audioRoot) ? bytesOf(audioRoot) : 0;
const audioCopies = [join(OUT, "audio"), join(studio, "audio")].filter((d) => existsSync(join(d, "audio-manifest.json")));
const siteRel = (d) => relative(OUT, d).split("\\").join("/");
if (audioCopies.length > 1) fail(`audio ships ${audioCopies.length} times (${audioCopies.map(siteRel).join(", ")}); the second app must use the plugin's sharedBase`);
if (existsSync(audioManifestPath)) {
  // A shipped copy must be exactly the manifest's files at their sizes, plus the manifest: no file missing, none extra.
  const m = JSON.parse(readFileSync(audioManifestPath, "utf8"));
  const expected = new Map(Object.values(m.assets).map((a) => [a.file, a.bytes]));
  expected.set("audio-manifest.json", statSync(audioManifestPath).size);
  for (const d of audioCopies) {
    const shipped = new Map(walk(d).map((f) => [relative(d, f).split("\\").join("/"), statSync(f).size]));
    const missing = [...expected].filter(([f, b]) => shipped.get(f) !== b).map(([f]) => f);
    const extra = [...shipped.keys()].filter((f) => !expected.has(f));
    if (missing.length || extra.length) {
      fail(`${siteRel(d)} differs from the audio manifest: ${missing.length} missing or resized (${missing.slice(0, 3).join(", ")}), ${extra.length} extra (${extra.slice(0, 3).join(", ")})`);
    }
  }
}
// An app loads audio by fetching `<base>audio/audio-manifest.json` (the package exports no JSON to
// inline, so that URL is the only way in): an app naming it needs some app to ship the tree.
const loadsAudio = walk(OUT).filter((f) => /\.(js|html)$/.test(f) && !f.startsWith(join(OUT, "audio")) && !f.startsWith(join(studio, "audio")))
  .find((f) => readFileSync(f, "utf8").includes("audio-manifest.json"));
if (loadsAudio && audioCopies.length === 0) fail(`${siteRel(loadsAudio)} loads audio but no app ships packages/audio/files (add audioFiles() to one app; the other passes sharedBase)`);
if (audioBytes > audioBudget.failMB * MB) fail(`audio ${fmt(audioBytes)} exceeds its ${audioBudget.failMB} MB budget (packages/audio/budget.json)`);
else if (audioBytes > audioBudget.warnMB * MB) console.warn(`::warning::audio ${fmt(audioBytes)} is above its ${audioBudget.warnMB} MB warning line`);
console.log(`compose: audio ${fmt(audioBytes)} (budget ${audioBudget.failMB} MB); shipped by ${audioCopies.map(siteRel).join(", ") || "no app yet (reserved in the total)"}`);

// 6. Report and the size gate.
const after = bytesOf(OUT) + (audioCopies.length ? 0 : audioBytes);
console.log(`compose: ladder through ${existsSync(ladderPath) ? JSON.parse(readFileSync(ladderPath, "utf8")).through : "(none)"}; hidden layers: ${hidden.join(", ") || "none"}; dark records: ${[...dark].join(", ") || "none"}`);
console.log(`compose: kits kept (${referenced.size}): ${[...referenced].map(([id, by]) => `${id} <- ${by}`).join("; ")}`);
console.log(`compose: kits excluded (${excluded.length}): ${excluded.map((id) => `${id}${darkNamed.has(id) ? "" : " (named by nothing)"}`).join(", ") || "none"}`);
if (chainDropped.length) console.log(`compose: chain-only rasters excluded: ${chainDropped.join(", ")}`);
console.log(`compose: excluded ${fmt(excludedBytes)}`);
// Kit sidecars (connectors/footprints/interiors) ship beside every kept kit
// pair since 16h and are inside `after` like everything else under kits/;
// report them so the budget's composition is visible when it moves.
const sidecarBytes = (existsSync(kitsDir) ? walk(kitsDir) : []).filter((f) => /\.(connectors|footprints|interiors)\.json$/.test(f))
  .reduce((s, f) => s + statSync(f).size, 0);
console.log(`compose: kit sidecars ${fmt(sidecarBytes)} of the kept kits`);
console.log(`compose: site size before ${fmt(before)} -> after ${fmt(after)}${audioCopies.length ? "" : " incl. reserved audio"} (warn > ${WARN_MB} MB, fail > ${FAIL_MB} MB, Pages limit 1,000 MB)`);
if (after > FAIL_MB * MB) fail(`composed site ${fmt(after)} exceeds the ${FAIL_MB} MB gate (GitHub Pages limit 1 GB)`);
else if (after > WARN_MB * MB) console.warn(`::warning::composed site ${fmt(after)} is above the ${WARN_MB} MB warning line (fails at ${FAIL_MB} MB, Pages limit 1 GB)`);

if (failures.length) {
  for (const f of failures) console.error(`::error::compose: ${f}`);
  process.exit(1);
}
