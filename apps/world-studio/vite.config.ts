import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import characterAssets from "@elder-souls/character-assets/plugin";

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
  plugins: [react(), characterAssets()],
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
