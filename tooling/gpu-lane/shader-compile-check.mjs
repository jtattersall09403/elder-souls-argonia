// Headless shader compile check: every water tier x above/below x field/strip material goes through a
// WebGLRenderer on SwiftShader with debug.onShaderError. Exit 1 on any shader error or when nothing compiled.
// Usage: node tooling/gpu-lane/shader-compile-check.mjs [--entry <dir with index.html + entry.ts>]
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const ai = process.argv.indexOf("--entry");
const entryDir = ai > 0 ? path.resolve(process.argv[ai + 1]) : path.join(here, "shader-compile");
const TIMEOUT_MS = 240000;

const { chromium } = await import(pathToFileURL(path.join(repo, "node_modules/playwright/index.mjs")));
const { build } = await import(pathToFileURL(path.join(repo, "node_modules/vite/dist/node/index.js")));

const out = fs.mkdtempSync(path.join(os.tmpdir(), "shader-compile-"));
let srv = null;
let browser = null;
let closing = false;
async function cleanup() {
  if (closing) return;
  closing = true;
  try { await browser?.close(); } catch {}
  try { srv?.close(); } catch {}
  try { fs.rmSync(out, { recursive: true, force: true }); } catch {}
}
// Parent death or a signal ends the run; the overall timeout does too.
for (const sig of ["SIGTERM", "SIGINT", "disconnect"]) process.on(sig, () => { cleanup().finally(() => process.exit(2)); });
const killer = setTimeout(() => { console.error("shader-compile-check: overall timeout"); cleanup().finally(() => process.exit(2)); }, TIMEOUT_MS + 120000);
killer.unref();

let code = 1;
try {
  await build({
    root: entryDir, configFile: false, logLevel: "error", base: "./",
    build: { outDir: out, emptyOutDir: true, minify: false, target: "esnext", reportCompressedSize: false },
  });
  const mime = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css" };
  srv = http.createServer((q, s) => {
    const rel = decodeURIComponent((q.url || "/").split("?")[0]);
    const p = path.join(out, rel === "/" ? "index.html" : rel);
    if (!p.startsWith(out) || !fs.existsSync(p)) { s.statusCode = 404; s.end(); return; }
    s.setHeader("content-type", mime[path.extname(p)] || "application/octet-stream");
    s.end(fs.readFileSync(p));
  }).listen(0);
  const port = srv.address().port;
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const pg = await browser.newPage();
  pg.on("pageerror", (e) => console.log("pageerror", e.message));
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForFunction(() => window.__done, null, { timeout: TIMEOUT_MS });
  const d = await pg.evaluate(() => window.__done);
  console.log("compiled", d.n, "errors", d.errs.length);
  for (const e of d.errs) console.log(e.slice(0, 600));
  code = d.errs.length > 0 || d.n === 0 ? 1 : 0;
} catch (e) {
  console.error("shader-compile-check failed:", e?.message ?? e);
  code = 1;
} finally {
  await cleanup();
}
process.exit(code);
