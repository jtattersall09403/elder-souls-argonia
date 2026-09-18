import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import characterAssets from "@elder-souls/character-assets/plugin";

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
        try { stat = statSync(file); } catch { return next(); }
        if (!stat.isFile()) return next();
        res.setHeader("Content-Type", MIME[ext]);
        res.setHeader("Content-Length", String(stat.size));
        res.setHeader("Cache-Control", "no-cache");
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
  base: command === "build" ? "/elder-souls-argonia/studio/" : "/",
  plugins: [freshPublicFiles(), react(), characterAssets()],
  build: { target: "es2022", sourcemap: false },
  // Pre-bundle the heavy deps up front: discovering them on the first page
  // load makes the dev server re-optimise and reload the page mid-load.
  optimizeDeps: { include: ["three", "@react-three/fiber", "@react-three/drei", "@dimforge/rapier3d-compat", "react", "react-dom/client"] },
  server: {
    host: "0.0.0.0",
    port: TUNNEL_PORT,
    strictPort: true,
    allowedHosts: [TUNNEL_HOST],
    hmr: { host: TUNNEL_HOST, protocol: "wss", clientPort: 443 },
    fs: { allow: ["../.."] },
  },
  preview: {
    host: "0.0.0.0",
    port: TUNNEL_PORT,
    strictPort: true,
    allowedHosts: [TUNNEL_HOST],
  },
}));
