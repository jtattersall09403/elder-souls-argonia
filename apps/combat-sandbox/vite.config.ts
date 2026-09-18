import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import characterAssets from "@elder-souls/character-assets/plugin";
import basisTranscoder from "@elder-souls/basis-transcoder/plugin";

// The Analytical Platform exposes local dev servers through this fixed
// VS Code tunnel host, terminating TLS in front of a plain-http dev server.
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
  // GitHub Pages serves the build from a subpath; local dev/preview through
  // the tunnel is accessed at its root, so only `vite build` uses the subpath.
  base: command === "build" ? "/elder-souls-argonia/" : "/",
  // basisTranscoder: any kit the sandbox ever loads is KTX2-compressed
  // (game-core/assets/kitLoader.ts); the transcoder ships beside the app.
  plugins: [react(), characterAssets(), basisTranscoder()],
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 4000 },
  server: {
    host: "0.0.0.0",
    port: TUNNEL_PORT,
    strictPort: true,
    allowedHosts: [TUNNEL_HOST],
    hmr: { host: TUNNEL_HOST, protocol: "wss", clientPort: 443 },
  },
  preview: {
    host: "0.0.0.0",
    port: TUNNEL_PORT,
    strictPort: true,
    allowedHosts: [TUNNEL_HOST],
  },
}));
