#!/usr/bin/env node
/**
 * Deployed-build request audit (16f round 4, lane D).
 *
 * Serves `apps/world-studio/dist` exactly as GitHub Pages does — under the
 * `/elder-souls-argonia/studio/` base path, plain static files, no dev
 * middleware — then opens a studio URL in headless Chromium and logs every
 * request the app makes until the network goes quiet: URL, HTTP status,
 * bytes, time-to-response. Any non-2xx is a file that would 404 on Pages.
 * There is no GPU here (SwiftShader), so it proves what is FETCHED, never
 * what is drawn.
 *
 *   node scripts/probe-deployed-requests.mjs "?view=character&x=6.12&z=1.63&t=10:00" [--port 8765] [--quiet-ms 8000] [--max-ms 240000]
 *   node scripts/probe-deployed-requests.mjs "?view=..." --url http://127.0.0.1:8766/   # any running server (dev-server timing)
 *
 * Prints a table (largest first) and a summary: request count, total bytes,
 * wall time to network-quiet, and the failures. `--reloads N` re-opens the
 * same URL N more times in the same browser profile, so the second and later
 * loads show what the HTTP cache (ETag / 304) saves. Run `npx vite build`
 * first when serving dist.
 */
import { createReadStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = resolve(here, "..", "dist");
// The composed site: the sandbox dist at SITE_BASE, the studio under it. The
// studio's production build resolves the character files (races, armour,
// rig) against the sandbox's copy (one set on the site, owner 2026-09-18),
// so those requests are served from the sandbox dist when it has been built;
// without it they 404 here exactly as they would on Pages.
const SITE_BASE = "/elder-souls-argonia/";
const BASE = `${SITE_BASE}studio/`;
const sandboxDist = resolve(here, "..", "..", "combat-sandbox", "dist");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const query = args.find((a) => a.startsWith("?")) ?? "?view=character&x=6.12&z=1.63&t=10:00";
const port = Number(opt("--port", 8765));
const quietMs = Number(opt("--quiet-ms", 8000));
const maxMs = Number(opt("--max-ms", 240000));
const externalUrl = opt("--url", null);
const reloads = Number(opt("--reloads", 0));

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".bin": "application/octet-stream", ".npy": "application/octet-stream", ".wasm": "application/wasm",
  ".txt": "text/plain", ".csv": "text/csv", ".svg": "image/svg+xml",
};
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split("?")[0]);
  let root;
  let file;
  if (pathname.startsWith(BASE)) { root = dist; file = normalize(join(dist, pathname.slice(BASE.length))); }
  else if (pathname.startsWith(SITE_BASE)) { root = sandboxDist; file = normalize(join(sandboxDist, pathname.slice(SITE_BASE.length))); }
  else { res.statusCode = 404; res.end("outside base"); return; }
  if (!file.startsWith(root)) { res.statusCode = 403; res.end(); return; }
  let st; try { st = statSync(file); } catch { res.statusCode = 404; res.end("not found"); return; }
  if (st.isDirectory()) { file = join(file, "index.html"); try { st = statSync(file); } catch { res.statusCode = 404; res.end(); return; } }
  res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
  res.setHeader("Content-Length", String(st.size));
  createReadStream(file).pipe(res);
});
if (!externalUrl) await new Promise((r) => server.listen(port, "127.0.0.1", r));
const target = externalUrl ? `${externalUrl.replace(/\/$/, "")}/${query}` : `http://127.0.0.1:${port}${BASE}${query}`;

// A persistent profile: the default (incognito-style) context has a small
// memory-only cache that a 200 MB load evicts wholesale, which would make
// the warm load look uncached. A real browser has a disk cache.
const profile = mkdtempSync(join(tmpdir(), "es-probe-profile-"));
const context = await chromium.launchPersistentContext(profile, {
  headless: true, viewport: { width: 1280, height: 720 },
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disk-cache-size=2000000000"],
});
const browser = context;
const consoleLines = [];

async function load(label) {
  const page = await context.newPage();
  const rows = new Map();
  const t0 = Date.now();
  let last = t0;
  // Bytes come from CDP's loadingFinished.encodedDataLength — what actually
  // crossed the wire. A revalidated file (server 304) is reported to the
  // page as its stored 200 with the full Content-Length, so header-based
  // accounting hides exactly the saving this probe exists to measure.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const byId = new Map();
  cdp.on("Network.requestWillBeSent", (e) => {
    const url = e.request.url;
    if (url.startsWith("blob:") || url.startsWith("data:")) return; // in-memory, not the network
    const row = { url, start: Date.now() - t0, status: 0, bytes: 0, ms: 0 };
    rows.set(url, row); byId.set(e.requestId, row); last = Date.now();
  });
  cdp.on("Network.responseReceived", (e) => {
    const row = byId.get(e.requestId); if (!row) return;
    row.status = e.response.status; last = Date.now();
  });
  cdp.on("Network.loadingFinished", (e) => {
    const row = byId.get(e.requestId); if (!row) return;
    row.bytes = e.encodedDataLength; row.ms = Date.now() - t0 - row.start;
    // a revalidation costs a few hundred header bytes; count it as such
    if (row.status === 200 && e.encodedDataLength < 1024 && row.bytes < 1024) row.revalidated = true;
    last = Date.now();
  });
  cdp.on("Network.loadingFailed", (e) => { const row = byId.get(e.requestId); if (row) { row.status = -1; row.error = e.errorText; } last = Date.now(); });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleLines.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => consoleLines.push(`pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(target, { waitUntil: "domcontentloaded" });
  while (Date.now() - t0 < maxMs && Date.now() - last < quietMs) await new Promise((r) => setTimeout(r, 250));
  const wall = Date.now() - t0;
  await page.close();
  const list = [...rows.values()].map((r) => ({ ...r, path: r.url.replace(/^https?:\/\/[^/]+/, "") }));
  list.sort((a, b) => b.bytes - a.bytes);
  const total = list.reduce((s, r) => s + r.bytes, 0);
  const notModified = list.filter((r) => r.status === 304 || r.revalidated).length;
  const failures = list.filter((r) => r.status !== 304 && (r.status < 200 || r.status >= 300));
  console.log(`\n== ${label}: requests ${list.length} (${notModified} revalidated from cache), ${(total / 1048576).toFixed(1)} MB on the wire, network quiet after ${((wall - quietMs) / 1000).toFixed(1)} s (cap ${maxMs / 1000} s)`);
  return { list, failures };
}

const first = await load("load 1 (cold)");
console.log("status   MB     ms   path");
for (const r of first.list) console.log(`${String(r.status).padStart(6)} ${(r.bytes / 1048576).toFixed(2).padStart(6)} ${String(r.ms).padStart(6)}   ${r.path}`);
console.log(`\nfailures (${first.failures.length}):`);
for (const r of first.failures) console.log(`  ${r.status} ${r.path} ${r.error ?? ""}`);
for (let i = 0; i < reloads; i++) {
  const again = await load(`load ${i + 2} (warm)`);
  for (const r of again.failures) console.log(`  FAIL ${r.status} ${r.path} ${r.error ?? ""}`);
}
console.log(`\nconsole errors/warnings (${consoleLines.length}, deduped):`);
for (const l of [...new Set(consoleLines)].slice(0, 40)) console.log("  " + l);
await browser.close();
rmSync(profile, { recursive: true, force: true });
if (!externalUrl) server.close();
