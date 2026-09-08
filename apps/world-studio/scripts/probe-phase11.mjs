// Run Phase 11's browser evidence as one workload: build once, serve once,
// capture all five exemplar blueprints in one browser, then run the complete
// water suite against that same immutable production preview.
//
//   node scripts/probe-phase11.mjs
//   node scripts/probe-phase11.mjs --prebuilt
//   node scripts/probe-phase11.mjs --prebuilt --without-water
//
// PHASE11_WATER_SITE may hold the same comma-list accepted by WATER_SITE for
// a focused diagnosis. An ordinary close-out leaves it unset and covers all
// water sites.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(studioDir, "../..");
const port = Number(process.env.PHASE11_PROBE_PORT ?? 4391);
const base = `http://127.0.0.1:${port}/elder-souls-argonia/studio/`;
const prebuilt = process.argv.includes("--prebuilt");
const withWater = !process.argv.includes("--without-water");
const unknown = process.argv.slice(2).filter((arg) => !["--prebuilt", "--without-water"].includes(arg));
if (unknown.length) {
  console.error(`unknown option(s): ${unknown.join(", ")}`);
  process.exit(2);
}

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: repoRoot, stdio: "inherit", ...options });
  child.on("error", reject);
  child.on("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(" ")} exited ${code ?? signal}`));
  });
});

async function waitFor(url, server, getLog) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`preview exited ${server.exitCode}\n${getLog()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`preview never came up at ${url}\n${getLog()}`);
}

if (!prebuilt) {
  await run("npm", ["run", "build", "-w", "@elder-souls/world-studio"]);
}

const viteBin = path.join(repoRoot, "node_modules/vite/bin/vite.js");
const server = spawn(process.execPath, [viteBin, "preview", "--base", "/elder-souls-argonia/studio/",
  "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: studioDir,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

const sharedEnv = {
  ...process.env,
  STUDIO_REUSE_SERVER: "1",
  STUDIO_PORT: String(port),
};
const exemplars = ["mazzatun", "nine-trunks", "sap-tapping-licensed", "lilmoth", "wamasu-pond-adult"];
const started = Date.now();
try {
  await waitFor(base, server, () => serverLog);
  await run(process.execPath, [path.join(studioDir, "scripts/probe-blueprints.mjs"), exemplars.join(",")], {
    env: sharedEnv,
  });
  if (withWater) {
    await run(process.execPath, [path.join(studioDir, "scripts/probe-water.mjs")], {
      env: {
        ...sharedEnv,
        WATER_REUSE_SERVER: "1",
        WATER_PORT: String(port),
        ...(process.env.PHASE11_WATER_SITE ? { WATER_SITE: process.env.PHASE11_WATER_SITE } : {}),
      },
    });
  }
  console.log(`Phase 11 browser probes passed in ${((Date.now() - started) / 1000).toFixed(1)}s${withWater ? "" : " (water skipped)"}`);
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}
