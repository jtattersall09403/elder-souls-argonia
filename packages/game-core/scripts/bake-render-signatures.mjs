#!/usr/bin/env node
// Bake apps/world-studio/public/render-signatures.json from the published kit parts' GLB JSON chunks (kits/<id>/parts, decision 0120)
// (packages/game-core/src/render/renderSignatures.ts; read at boot by precompileSignatures.ts).
//   node packages/game-core/scripts/bake-render-signatures.mjs [--check]
// --check exits 1 when the file on disk differs from a fresh bake (stale). Never touches a kit file.
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKitPartsIndex } from "../src/assets/kitParts.ts";
import { glbJson, kitSignatures, mergeSignatures, NON_SETTLEMENT_KITS } from "../src/render/renderSignatures.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const kitsDir = join(root, "apps/world-studio/public/kits");
const out = join(root, "apps/world-studio/public/render-signatures.json");

/** The GLB header and JSON chunk only (20 + chunk length bytes). */
export function readGlbHead(path) {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(20);
    readSync(fd, head, 0, 20, 0);
    const bytes = Buffer.alloc(20 + head.readUInt32LE(12));
    readSync(fd, bytes, 0, bytes.length, 0);
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  } finally { closeSync(fd); }
}

/** Published kit ids: every kits/<id>/parts/index.json (decision 0120; no whole-kit GLBs ship). */
export function publishedKits(dir = kitsDir) {
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "parts/index.json")))
    .map((d) => d.name).sort();
}

/** One kit's signatures, read from the JSON chunk of every part GLB its parts index names. */
export function kitPartSignatures(kit, dir = kitsDir) {
  const partsDir = join(dir, kit, "parts");
  const index = parseKitPartsIndex(JSON.parse(readFileSync(join(partsDir, "index.json"), "utf8")), kit, `${kit}/parts/index.json`);
  const files = [...new Set(Object.values(index.assets).map((a) => a.file))].sort();
  return mergeSignatures(files.map((f) => kitSignatures(glbJson(readGlbHead(join(partsDir, f))), kit))).signatures;
}

/** The bake over a kits folder: the settlement-path kits' merged signatures. */
export function bakeSignatures(dir = kitsDir) {
  const kits = publishedKits(dir).filter((k) => !NON_SETTLEMENT_KITS.includes(k));
  return { kits, baked: mergeSignatures(kits.map((k) => kitPartSignatures(k, dir))) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

function main() {
const { kits, baked } = bakeSignatures();
const text = JSON.stringify(baked) + "\n";
if (process.argv.includes("--check")) {
  let disk = "";
  try { disk = readFileSync(out, "utf8"); } catch { /* missing = stale */ }
  if (disk !== text) { console.error(`render-signatures.json is stale: re-run node packages/game-core/scripts/bake-render-signatures.mjs`); process.exit(1); }
  console.log(`render-signatures.json current: ${baked.signatures.length} signatures`);
} else {
  writeFileSync(out, text);
  console.log(`render-signatures.json: ${baked.signatures.length} signatures from ${kits.length} kits, ${text.length} bytes`);
}
}
