import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import characterAssets from "@elder-souls/character-assets/plugin";

// Same Analytical Platform tunnel arrangement as the combat sandbox; run only
// one dev server at a time on the shared port.
const TUNNEL_HOST = "jtattersall09403-vscode-tunnel.tools.analytical-platform.service.justice.gov.uk";
const TUNNEL_PORT = 8081;

export default defineConfig(({ command }) => ({
  // Deployed under the Pages site at /studio/; local dev serves from root.
  base: command === "build" ? "/elder-souls-argonia/studio/" : "/",
  plugins: [react(), characterAssets()],
  build: { target: "es2022", sourcemap: false },
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
