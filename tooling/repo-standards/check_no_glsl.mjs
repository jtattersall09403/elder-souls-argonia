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
 *
 * `--root <dir>` scans every source file under <dir> instead (node_modules
 * skipped, dist NOT skipped), e.g. a built webgpu dist. The summary line names
 * the files scanned as well as the files with hits, and the run exits 1 when it
 * scanned none (a gate that reads nothing cannot fail).
 *
 * Also flags a TSL `select(` call (bare or `.select(` on a node) in any file
 * that imports from "three/tsl" or "three/webgpu", except materialNodes.ts, home of the
 * branch-free `sel()`: three 0.184 may lower select() on computed operands
 * to an if/else reading unassigned temporaries (silent NaN, decision 0111).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".jsx"]);
const rootArg = process.argv.indexOf("--root");
const SCAN_ROOT = rootArg > 0 ? resolve(process.argv[rootArg + 1]) : null;
const SKIP = new Set(SCAN_ROOT ? ["node_modules"] : ["node_modules", "dist"]);
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
const TSL_IMPORT = /from\s+["']three\/(?:tsl|webgpu)["']/;
// A call, not the word in a comment or a destructuring list.
const SELECT_CALL = /(?:^|[^\w$])select\s*\(/;
const SELECT_EXEMPT = "materialNodes.ts";
const SELECT_MSG = "select() call: use sel() from render/nodes/materialNodes (decision 0111 gotcha)";
const stripComment = (line) => line.replace(/\/\/.*$/, "");

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
if (SCAN_ROOT) walk(SCAN_ROOT, files);
else for (const top of ["packages", "apps"]) {
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
  const checkSelect = TSL_IMPORT.test(text) && !f.endsWith(SELECT_EXEMPT);
  if (!ANY.test(text) && !(checkSelect && SELECT_CALL.test(text))) continue;
  const rel = relative(SCAN_ROOT ?? root, f).split("\\").join("/");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let token;
    if (ANY.test(lines[i])) [token] = TOKENS.find(([, re]) => re.test(lines[i]));
    else if (checkSelect && SELECT_CALL.test(stripComment(lines[i]))) token = SELECT_MSG;
    else continue;
    console.log(`${rel}:${i + 1}: ${token}`);
    hits++;
    hitFiles.add(rel);
  }
}
console.log(`check_no_glsl: ${hits} hits in ${hitFiles.size} files (${files.length} files scanned)`);
if (!files.length) console.log("check_no_glsl: scanned 0 files, the gate read nothing");
process.exit(hits || !files.length ? 1 : 0);
