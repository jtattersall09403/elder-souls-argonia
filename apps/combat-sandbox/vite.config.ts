import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Analytical Platform exposes local dev servers through this fixed
// VS Code tunnel host, terminating TLS in front of a plain-http dev server.
const TUNNEL_HOST = "jtattersall09403-vscode-tunnel.tools.analytical-platform.service.justice.gov.uk";
const TUNNEL_PORT = 8081;

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the build from a subpath; local dev/preview through
  // the tunnel is accessed at its root, so only `vite build` uses the subpath.
  base: command === "build" ? "/elder-souls-argonia/" : "/",
  plugins: [react()],
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
