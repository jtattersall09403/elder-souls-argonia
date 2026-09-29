#!/usr/bin/env node
/**
 * Compose the GitHub Pages site from the two built apps, carrying only what
 * the shipped ladder can display (16f round 4, decision 0073).
 *
 *   node tooling/pages-site/compose.mjs [--out site] [--warn-mb 750] [--fail-mb 900]
 *     [--studio-dist apps/world-studio/dist] [--sandbox-dist apps/combat-sandbox/dist]
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
 *      JSON) that is not dark and not itself under `kits/` names `kits/<id>`;
 *      then every file a kept kit's JSON names by a path relative to itself
 *      (a sidecar folder such as `works-v1-fx/`, named only inside the
 *      works-v1 manifest's `effectTextures`) ships too, to a fixpoint
 *      (kit-reach.mjs). A folder's NAME is never evidence of use: pruning
 *      `works-v1-fx/` by name emptied every deployed place (16k walk 3).
 *      Kits the app names in code (flora, groundcover, underwater, waterfall)
 *      are therefore always kept, even though the settlements index and
 *      its bundles also list flora; kits named only by a dark record, or by nothing at all
 *      (a build-side product no runtime reads yet), are excluded.
 *   3. When 16h un-hides `settlements`, the settlements index and its
 *      bundles stop being dark, their kit tables become roots and every kit
 *      they name ships again. Nothing to edit.
 *
 * GATES (each exits non-zero; a wrong derivation must fail the build, never
 * ship a site that 404s):
 *   - the ladder names a layer this table does not know;
 *   - a dark record is missing from the build;
 *   - a kit the shipped code or a live record names is absent on disk;
 *   - after pruning, any shipped text file still names an excluded kit;
 *   - after pruning, any live JSON holds a reference that does not resolve in
 *     the composed site (a kit manifest's relative asset path, a bundle's
 *     `kits/…` glb or manifest): kit-reach.mjs `danglingRefs`;
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
import { kitRefs } from "./kit-ref.mjs";
import { danglingRefs, kitIdOf, kitReach } from "./kit-reach.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = resolve(root, opt("--out", "site"));
// The two builds (overridable so the gates can be made to fail on a copy).
const SANDBOX_DIST = resolve(root, opt("--sandbox-dist", "apps/combat-sandbox/dist"));
const STUDIO_DIST = resolve(root, opt("--studio-dist", "apps/world-studio/dist"));
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
 * whose kits nothing else names. A row with `index` names a bundle index
 * (`{places, routes: [{bundle}]}`, bundle paths relative to the index's
 * parent's parent): the index and every bundle it names are the layer's
 * records (the per-place settlement bundles, worldgen/settlement_bundles.py).
 */
const LAYER_RECORDS = [
  { layer: "settlements", index: "province/settlements/index.json" },
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
/** The records a LAYER_RECORDS row stands for (an index expands to itself plus its bundles). */
function layerRecords(row) {
  if (!row.index) return [row.record];
  const at = join(studio, row.index);
  if (!existsSync(at)) return [row.index];
  const index = JSON.parse(readFileSync(at, "utf8"));
  if (index.schemaVersion !== 1) fail(`${row.index} schemaVersion ${index.schemaVersion}: this script reads schema 1`);
  const base = row.index.split("/").slice(0, -2).join("/");
  return [row.index, ...[...(index.places ?? []), ...(index.routes ?? [])].map((e) => `${base}/${e.bundle}`)];
}
const dark = new Set(LAYER_RECORDS.filter((r) => hidden.includes(r.layer)).flatMap(layerRecords));
for (const r of dark) if (!existsSync(join(studio, r))) fail(`dark record ${r} is hidden by the ladder but missing from the build`);

// 2. Kit reachability from every shipped text file that is not dark and not a kit file.
const rel = (f) => relative(studio, f).split("\\").join("/");
const isText = (f) => TEXT_EXT.has(f.slice(f.lastIndexOf(".")));
const allFiles = walk(studio);
const roots = allFiles.filter((f) => { const r = rel(f); return isText(f) && !r.startsWith("kits/") && !dark.has(r); });
const referenced = new Map(); // id -> first referencing file
for (const f of roots) {
  const text = readFileSync(f, "utf8");
  for (const id of kitRefs(text)) if (!referenced.has(id)) referenced.set(id, rel(f));
}
const darkNamed = new Set();
for (const r of dark) for (const id of kitRefs(readFileSync(join(studio, r), "utf8"))) darkNamed.add(id);

const kitsDir = join(studio, "kits");
const kitRel = (f) => relative(kitsDir, f).split("\\").join("/");
const kitFiles = existsSync(kitsDir) ? walk(kitsDir).map(kitRel) : [];
const kitIds = new Set(kitFiles.map(kitIdOf));
for (const [id, by] of referenced) if (!kitIds.has(id)) fail(`${by} names kits/${id} but no such kit is in the build`);

// Keep by resolved reference, never by folder name (kit-reach.mjs): the named
// kits' files, then every file their JSON resolves to, to a fixpoint.
const readKitJson = (r) => JSON.parse(readFileSync(join(kitsDir, r), "utf8"));
const reach = kitReach(kitFiles, new Set(referenced.keys()), readKitJson);
const prunedFiles = kitFiles.filter((f) => !reach.keep.has(f));
const keptIds = new Set([...reach.keep].map(kitIdOf));
const excluded = [...kitIds].filter((id) => !keptIds.has(id)).sort();
const reachedBy = new Map();   // kit id kept only through a manifest reference -> that manifest
for (const { from, to } of reach.resolved) if (!referenced.has(kitIdOf(to)) && !reachedBy.has(kitIdOf(to))) reachedBy.set(kitIdOf(to), `kits/${from}`);
let excludedBytes = 0;
for (const f of prunedFiles) {
  const p = join(kitsDir, f);
  excludedBytes += statSync(p).size;
  rmSync(p, { force: true });
}
// Folders left empty by the prune go too.
function sweep(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(dir, e.name);
    sweep(p);
    if (readdirSync(p).length === 0) rmSync(p, { recursive: true, force: true });
  }
}
if (existsSync(kitsDir)) sweep(kitsDir);

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

// 4. Post-prune gates: nothing shipped may still name an excluded kit, and no
// shipped JSON may hold a reference that does not resolve (kit-reach.mjs
// danglingRefs: kit manifests' relative asset paths, every `kits/…` string in
// a live record such as the settlement and interior bundles' kit tables).
const excludedSet = new Set(excluded);
for (const f of walk(studio).filter(isText)) {
  for (const id of kitRefs(readFileSync(f, "utf8"))) {
    if (excludedSet.has(id) && !dark.has(rel(f)) && !rel(f).startsWith("kits/")) fail(`${rel(f)} names excluded kit ${id}`);
  }
}
const shippedRel = new Set(walk(studio).map(rel));
const liveJson = [...shippedRel].filter((r) => r.endsWith(".json") && !dark.has(r));
const t4 = performance.now();
const dangling = danglingRefs(shippedRel, liveJson, (r) => JSON.parse(readFileSync(join(studio, r), "utf8")));
for (const d of dangling) fail(`dangling reference: ${d.from} names ${d.ref}, which is not in the composed site`);
console.log(`compose: dangling-reference gate over ${liveJson.length} JSON files: ${dangling.length} dangling (${Math.round(performance.now() - t4)} ms)`);

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
if (reachedBy.size) console.log(`compose: kept by manifest reference (${reachedBy.size}): ${[...reachedBy].map(([id, by]) => `${id} <- ${by}`).join("; ")}`);
console.log(`compose: kits excluded (${excluded.length}): ${excluded.map((id) => `${id}${darkNamed.has(id) ? "" : " (named by nothing)"}`).join(", ") || "none"}; files pruned ${prunedFiles.length}`);
if (chainDropped.length) console.log(`compose: chain-only rasters excluded: ${chainDropped.join(", ")}`);
console.log(`compose: excluded ${fmt(excludedBytes)}`);
// Kit sidecars (connectors/footprints/interiors) ship beside every kept kit
// pair since 16h and are inside `after` like everything else under kits/;
// report them so the budget's composition is visible when it moves.
const sidecarBytes = (existsSync(kitsDir) ? walk(kitsDir) : []).filter((f) => /\.(connectors|footprints|interiors)\.json$/.test(f))
  .reduce((s, f) => s + statSync(f).size, 0);
console.log(`compose: kit sidecars ${fmt(sidecarBytes)} of the kept kits`);
// Kit parts (`kits/<kit>/parts/`, pipeline/kit_parts.mjs) ship inside a kept
// kit's own folder: the interior loader's per-asset GLBs and their KTX2 files,
// a second copy of the kit's LOD0 geometry and textures, published only for
// the assets an interior cell draws (kit_parts.mjs `drawnAssets`; walk 4:
// 131.7 MB for every asset of 10 kits, site 709.0 MB; review 5536a1d9, drawn
// assets only: 19.3 MB, site 597.3 MB). Reported so the budget's composition
// is visible when it moves.
const partsBytes = (existsSync(kitsDir) ? walk(kitsDir) : []).filter((f) => /[\\/]parts[\\/]/.test(kitRel(f)))
  .reduce((s, f) => s + statSync(f).size, 0);
console.log(`compose: kit parts ${fmt(partsBytes)} of the kept kits`);
console.log(`compose: site size before ${fmt(before)} -> after ${fmt(after)}${audioCopies.length ? "" : " incl. reserved audio"} (warn > ${WARN_MB} MB, fail > ${FAIL_MB} MB, Pages limit 1,000 MB)`);
if (after > FAIL_MB * MB) fail(`composed site ${fmt(after)} exceeds the ${FAIL_MB} MB gate (GitHub Pages limit 1 GB)`);
else if (after > WARN_MB * MB) console.warn(`::warning::composed site ${fmt(after)} is above the ${WARN_MB} MB warning line (fails at ${FAIL_MB} MB, Pages limit 1 GB)`);

if (failures.length) {
  for (const f of failures) console.error(`::error::compose: ${f}`);
  process.exit(1);
}
