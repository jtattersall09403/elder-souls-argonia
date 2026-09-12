#!/usr/bin/env node
/**
 * Start the World Studio dev server for LOCAL testing (owner, 2026-09-12:
 * test locally; deploy only when the owner says so).
 *
 *   npm run studio            # serves on $ES_STUDIO_PORT, reachable at $ES_TUNNEL_URL
 *
 * Both values come from the environment and are never committed (agents: the
 * gitignored .claude/settings.local.json `env` block). One dev server at a
 * time on the shared port; this script refuses if the port is already bound.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const port = Number(process.env.ES_STUDIO_PORT);
const url = process.env.ES_TUNNEL_URL;
if (!url || !Number.isFinite(port)) {
  console.error("ES_STUDIO_PORT and ES_TUNNEL_URL must be set (see CLAUDE.md, local testing).");
  process.exit(2);
}
await new Promise((resolve) => {
  const probe = createServer().once("error", () => {
    console.error(`port ${port} is already in use: another dev server is running on the shared tunnel port; stop it first (find its PID with 'ss -ltnp | grep :${port}'; never pkill -f).`);
    process.exit(3);
  }).once("listening", () => probe.close(resolve)).listen(port, "0.0.0.0");
});
console.log(`World Studio: local dev server on port ${port}; open ${url}  (add ?view=character&x=..&z=..&t=12:00 as usual)`);
const child = spawn("npm", ["run", "dev", "-w", "@elder-souls/world-studio"], { stdio: "inherit", shell: true });
child.on("close", (code) => process.exit(code ?? 0));
