#!/usr/bin/env node
// Bake apps/world-studio/public/render-signatures.json from the published kit GLBs' JSON chunks
// (packages/game-core/src/render/renderSignatures.ts; read at boot by precompileSignatures.ts).
//   node packages/game-core/scripts/bake-render-signatures.mjs [--check]
// --check exits 1 when the file on disk differs from a fresh bake (stale). Never touches a kit file.
import { closeSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const kits = readdirSync(kitsDir).filter((f) => f.endsWith(".glb")).map((f) => f.slice(0, -4))
  .filter((k) => !NON_SETTLEMENT_KITS.includes(k)).sort();
const baked = mergeSignatures(kits.map((k) => kitSignatures(glbJson(readGlbHead(join(kitsDir, `${k}.glb`))), k)));
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
