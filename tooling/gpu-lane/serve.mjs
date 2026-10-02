#!/usr/bin/env node
// Serve a composed Pages site (npm run build && npm run site:compose -- --out <site>) the way
// GitHub Pages does: <site> at /elder-souls-argonia/ (combat sandbox and character files at the
// root, the studio at studio/), index.html for directories and for unknown extension-less routes.
//   node serve.mjs <site> [--port 8099] [--host 127.0.0.1]
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json",
  ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".ktx2": "image/ktx2",
  ".glb": "model/gltf-binary", ".svg": "image/svg+xml", ".ogg": "audio/ogg" };
export const PREFIX = "/elder-souls-argonia/";

export function siteHandler(site) {
  return (req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0]);
    if (!path.startsWith(PREFIX)) { res.writeHead(404); res.end(); return; }
    const rel = normalize(path.slice(PREFIX.length)).replace(/^(\.\.[/\\])+/, "");
    let file = join(site, rel);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) && !extname(rel)) file = join(site, rel.startsWith("studio") ? "studio" : "", "index.html");
    if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache",
      "Last-Modified": statSync(file).mtime.toUTCString() });
    createReadStream(file).pipe(res);
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const site = argv[0] && !argv[0].startsWith("--") ? resolve(argv[0]) : null;
  if (!site || !existsSync(join(site, "studio/index.html"))) {
    console.error("usage: serve.mjs <composed site dir> [--port N] [--host H]"); process.exit(2);
  }
  const port = Number(opt("port", 8099)), host = opt("host", "127.0.0.1");
  createServer(siteHandler(site)).listen(port, host, () => console.log(`serve: http://${host}:${port}${PREFIX}studio/ (${site})`));
}
