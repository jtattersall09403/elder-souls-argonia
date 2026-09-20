import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import characterAssets from "@elder-souls/character-assets/plugin";
import basisTranscoder from "@elder-souls/basis-transcoder/plugin";

// The composed Pages site: sandbox at SANDBOX_BASE, studio at STUDIO_BASE.
// The studio's production build resolves the character files (races,
// armour, rig, bow rigs — 112 MB) against the sandbox's copy instead of
// shipping its own (owner 2026-09-18); dev still serves them itself.
const SANDBOX_BASE = "/elder-souls-argonia/";
const STUDIO_BASE = `${SANDBOX_BASE}studio/`;

/**
 * Serve `public/` from the DISK, not from Vite's start-up file list.
 *
 * Vite caches the set of public files when the dev server starts and only
 * updates it from watcher events. The kit builders and the chain rewrite
 * `public/kits/*.kit.json`, the province rasters and the vegetation bundles
 * while a server is running (the shared-port server lives across sessions),
 * and a rewrite the watcher misses leaves the file "unknown": Vite then
 * falls through to the SPA fallback and answers the request with
 * index.html. On 2026-09-18 that served the flora kit manifest as HTML and
 * every tree, rock and sea-bed piece silently disappeared from the studio.
 * This middleware runs before Vite's own and streams any file that exists
 * under `public/` as it is on disk right now.
 *
 * It validates, it never blindly re-sends (16f round 4): the first version
 * streamed every byte on every load, so a reload re-downloaded ~110 MB of
 * kits and rasters that had not changed. Like Vite's own public serving it
 * answers with `Cache-Control: no-cache` (the browser MUST revalidate every
 * time — nothing stale is ever shown) plus a weak ETag built from the file's
 * size and mtime and a Last-Modified header; a request carrying a matching
 * `If-None-Match` / `If-Modified-Since` gets a 304 and no body. A rewrite
 * by the chain or a kit builder changes the mtime, so the next request is a
 * fresh 200. The production build (Pages) does not use this: its files are
 * copied into dist/ and GitHub serves them with its own ETags.
 */
const MIME: Record<string, string> = {
  ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png",
  ".bin": "application/octet-stream", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".npy": "application/octet-stream", ".txt": "text/plain", ".csv": "text/csv",
};
function freshPublicFiles(): Plugin {
  return {
    name: "es-fresh-public-files",
    configureServer(server) {
      const publicDir = server.config.publicDir;
      server.middlewares.use((req, res, next) => {
        if (!publicDir || (req.method !== "GET" && req.method !== "HEAD") || !req.url) return next();
        const pathname = decodeURIComponent(req.url.split("?")[0]);
        const ext = extname(pathname);
        if (!MIME[ext]) return next();
        const file = normalize(join(publicDir, pathname));
        if (!file.startsWith(publicDir)) return next();
        let stat;
        try { stat = statSync(file); } catch { stat = null; }
        if (!stat || !stat.isFile()) {
          // A missing file inside one of public/'s own folders (kits/,
          // province/, textures/) is a 404, never Vite's SPA fallback: the
          // fallback answers index.html with a 200, the loader parses HTML
          // as JSON and a whole layer vanishes silently (round 3's defect).
          // Paths outside those folders (/src/, /@fs/, the character-assets
          // plugin's rig and armour files) fall through to Vite as before.
          const top = pathname.split("/")[1];
          let topIsPublicDir = false;
          try { topIsPublicDir = !!top && statSync(join(publicDir, top)).isDirectory(); } catch { /* not ours */ }
          if (!topIsPublicDir) return next();
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end(`not found under public/: ${pathname}`);
          return;
        }
        const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
        const lastModified = new Date(stat.mtimeMs);
        lastModified.setMilliseconds(0);
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("ETag", etag);
        res.setHeader("Last-Modified", lastModified.toUTCString());
        const inm = req.headers["if-none-match"];
        const ims = req.headers["if-modified-since"];
        const fresh = inm ? inm.split(",").some((t) => t.trim() === etag) :
          ims ? Date.parse(ims) >= lastModified.getTime() : false;
        if (fresh) { res.statusCode = 304; res.end(); return; }
        res.setHeader("Content-Type", MIME[ext]);
        res.setHeader("Content-Length", String(stat.size));
        if (req.method === "HEAD") { res.end(); return; }
        createReadStream(file).pipe(res);
      });
    },
  };
}

// Same Analytical Platform tunnel arrangement as the combat sandbox; run only
// one dev server at a time on the shared port.
// The port and the tunnel are ENVIRONMENT, never committed (owner, 2026-09-12):
// ES_STUDIO_PORT and ES_TUNNEL_URL come from the machine (for agents, the
// gitignored .claude/settings.local.json `env` block). `npm run studio` at the
// repo root checks them and starts the server.
// A production build (CI, Pages) serves nothing and needs neither; only the
// dev server and preview do, and they refuse to start without them.
const TUNNEL_URL = process.env.ES_TUNNEL_URL;
const TUNNEL_PORT = Number(process.env.ES_STUDIO_PORT);
const serving = process.argv.some((a) => /(^|\/)(vite|dev|preview|serve)$/.test(a) || a === "preview") && !process.argv.includes("build");
if (serving && (!TUNNEL_URL || !Number.isFinite(TUNNEL_PORT))) {
  throw new Error("ES_TUNNEL_URL and ES_STUDIO_PORT must be set in the environment (see CLAUDE.md, local testing)");
}
const TUNNEL_HOST = TUNNEL_URL ? new URL(TUNNEL_URL).host : "localhost";

export default defineConfig(({ command }) => ({
  // Deployed under the Pages site at /studio/; local dev serves from root.
  base: command === "build" ? STUDIO_BASE : "/",
  plugins: [freshPublicFiles(), react(), characterAssets({ sharedBase: SANDBOX_BASE }), basisTranscoder()],
  build: { target: "es2022", sourcemap: false },
  // Pre-bundle the heavy deps up front: discovering them on the first page
  // load makes the dev server re-optimise and reload the page mid-load.
  optimizeDeps: { include: ["three", "@react-three/fiber", "@react-three/drei", "@dimforge/rapier3d-compat", "react", "react-dom/client"] },
  server: {
    host: "0.0.0.0",
    port: TUNNEL_PORT,
    strictPort: true,
    allowedHosts: [TUNNEL_HOST],
    // HMR talks to the browser over the tunnel. A probe (scripts/dev-server.mjs)
    // drives a headless browser on 127.0.0.1 that cannot reach the tunnel host,
    // and every failed reconnect lands in the probe's page-error list — so
    // probes turn HMR off; they never edit source mid-run (2026-09-20).
    hmr: process.env.ES_PROBE === "1"
      ? false
      : { host: TUNNEL_HOST, protocol: "wss", clientPort: 443 },
    fs: { allow: ["../.."] },
  },
  preview: {
    host: "0.0.0.0",
    port: TUNNEL_PORT,
    strictPort: true,
    allowedHosts: [TUNNEL_HOST],
  },
}));
