// Shared probe helper (2026-09-20): start the World Studio DEV server for a
// probe and hand back its URL.
//
// Why the dev server and not `vite preview`: the debug handles the probes read
// (window.__SCENE__, __RENDERER__, __STUDIO_SKY_DEBUG__, set by WorldSky) are
// guarded by `import.meta.env.DEV`, so a production build tree-shakes them
// away and every one of those probes reads `undefined`.
//
// Why no `--base`: dev serves at "/" (apps/world-studio/vite.config.ts sets
// the studio base for `build` only). Forcing a sub-path base in dev is what
// broke probe-sampler-count on 2026-09-20 — assets served by middleware that
// matched the un-based URL 404'd into the SPA fallback.
//
// The port is chosen free by the OS, so two probes never collide, and never
// the shared $ES_STUDIO_PORT. `stop()` kills only this helper's own child
// process group; it never touches another server.
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const studioDir = new URL("../", import.meta.url).pathname;

async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * @returns {Promise<{url: string, port: number, log: () => string, stop: () => void}>}
 *   `url` ends in "/" and is the studio root; append `?view=character&…`.
 */
export async function startStudioDevServer({ timeoutMs = 60000 } = {}) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn("npx", [
    "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort",
  ], {
    cwd: studioDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    // ES_PROBE turns HMR off in vite.config.ts: HMR is pointed at the tunnel
    // host, which this headless browser on 127.0.0.1 cannot reach, and every
    // failed reconnect landed in the probe's page-error list (2026-09-20).
    env: { ...process.env, ES_PROBE: "1" },
  });
  let log = "";
  child.stdout.on("data", (c) => { log += c; });
  child.stderr.on("data", (c) => { log += c; });

  const stop = () => {
    try { process.kill(-child.pid); } catch { /* already gone */ }
  };

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) break;
    } catch { /* retry */ }
    if (Date.now() > deadline) {
      stop();
      throw new Error(`studio dev server never came up at ${url}\n${log}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { url, port, log: () => log, stop };
}
