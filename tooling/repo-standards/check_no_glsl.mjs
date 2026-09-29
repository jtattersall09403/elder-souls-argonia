#!/usr/bin/env node
/**
 * No WebGL-only shader code in the app and package sources (webgpu branch).
 *
 *   node tooling/repo-standards/check_no_glsl.mjs
 *
 * Walks packages/*\/src/** and apps/*\/src/** (.ts .tsx .js .mjs .jsx, tests
 * included; node_modules and dist skipped) and reports `path:line: <token>`
 * for every line naming a WebGL renderer, a GLSL material hook or GLSL
 * source. Each line is reported once, under its most specific token
 * (RawShaderMaterial before ShaderMaterial). Exit 1 on any hit.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".jsx"]);
const SKIP = new Set(["node_modules", "dist"]);
// Most specific first: a line is reported under the first token it contains.
const TOKENS = [
  ["RawShaderMaterial", /\bRawShaderMaterial\b/],
  ["ShaderMaterial", /\bShaderMaterial\b/],
  ["onBeforeCompile", /\bonBeforeCompile\b/],
  ["customProgramCacheKey", /\bcustomProgramCacheKey\b/],
  ["ShaderChunk", /\bShaderChunk\b/],
  ["WebGLRenderTarget", /\bWebGLRenderTarget\b/],
  ["WebGLRenderer", /\bWebGLRenderer\b/],
  ["gl_FragColor", /\bgl_FragColor\b/],
  ["gl_Position", /\bgl_Position\b/],
  ["#include <", /#include </],
];
const ANY = new RegExp(TOKENS.map(([, re]) => re.source).join("|"));

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXT.has(extname(e.name))) out.push(p);
  }
  return out;
}

const files = [];
for (const top of ["packages", "apps"]) {
  let ws;
  try { ws = readdirSync(join(root, top), { withFileTypes: true }); } catch { continue; }
  for (const w of ws) if (w.isDirectory()) walk(join(root, top, w.name, "src"), files);
}

const self = fileURLToPath(import.meta.url);
let hits = 0;
const hitFiles = new Set();
for (const f of files) {
  if (f === self) continue;
  const text = readFileSync(f, "utf8");
  if (!ANY.test(text)) continue;
  const rel = relative(root, f).split("\\").join("/");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!ANY.test(lines[i])) continue;
    const [token] = TOKENS.find(([, re]) => re.test(lines[i]));
    console.log(`${rel}:${i + 1}: ${token}`);
    hits++;
    hitFiles.add(rel);
  }
}
console.log(`check_no_glsl: ${hits} hits in ${hitFiles.size} files`);
process.exit(hits ? 1 : 0);
