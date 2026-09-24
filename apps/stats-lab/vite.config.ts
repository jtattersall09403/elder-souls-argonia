import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same serving contract as the other apps (CLAUDE.md, local testing): the dev
// server listens on ES_STUDIO_PORT behind the ES_TUNNEL_URL host, both
// environment, never committed. A build needs neither. Relative base so the
// build works from any subpath once the Pages composer includes it.
const TUNNEL_URL = process.env.ES_TUNNEL_URL;
const TUNNEL_PORT = Number(process.env.ES_STUDIO_PORT);
const serving = process.argv.some((a) => /(^|\/)(vite|dev|preview|serve)$/.test(a) || a === "preview") && !process.argv.includes("build");
if (serving && (!TUNNEL_URL || !Number.isFinite(TUNNEL_PORT))) {
  throw new Error("ES_TUNNEL_URL and ES_STUDIO_PORT must be set in the environment (see CLAUDE.md, local testing)");
}
const TUNNEL_HOST = TUNNEL_URL ? new URL(TUNNEL_URL).host : "localhost";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2022", sourcemap: false },
  server: {
    host: "0.0.0.0",
    port: TUNNEL_PORT,
    strictPort: true,
    allowedHosts: [TUNNEL_HOST],
    hmr: { host: TUNNEL_HOST, protocol: "wss", clientPort: 443 },
  },
  preview: { host: "0.0.0.0", port: TUNNEL_PORT, strictPort: true, allowedHosts: [TUNNEL_HOST] },
});
