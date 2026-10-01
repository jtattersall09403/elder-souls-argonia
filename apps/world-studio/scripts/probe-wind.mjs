// Fast vegetation wind check: displacement per wind strength and shader cost,
// in seconds, without loading the province. Starts a vite dev server on a
// spare port, opens wind-harness.html (src/windHarness.ts), prints
// one JSON line. Usage from apps/world-studio: node scripts/probe-wind.mjs
import "./probe-guard.mjs"; // job pool first (speed lane 3B)
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.HARNESS_PORT ?? 8094);
const variants = JSON.parse('{"wind":""}');

const vite = spawn("npx", ["vite", "--port", String(PORT), "--host", "127.0.0.1"], {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BROWSER: "none" },
  shell: true,
  // Its own process group, so the whole vite tree dies with one signal —
  // killing only the shell wrapper leaves vite holding the port.
  detached: true,
});
const log = [];
const ready = new Promise((resolve, reject) => {
  const onData = (d) => { log.push(String(d)); if (String(d).includes("Local:") || String(d).includes(`:${PORT}`)) resolve(); };
  vite.stdout.on("data", onData);
  vite.stderr.on("data", onData);
  vite.on("exit", (code) => reject(new Error(`vite exited ${code}`)));
  setTimeout(() => reject(new Error("vite did not start in 60 s:\n" + log.join(""))), 60000);
});
try {
  await ready;
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const [id, q] of Object.entries(variants)) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errs = [];
    // vite's HMR socket points at the owner's tunnel host and fails here; that
    // noise is not a harness error.
    const keep = (t) => !/websocket|vite\] failed to connect/i.test(t);
    page.on("pageerror", (e) => { if (keep(e.message)) errs.push(e.message.slice(0, 300)); });
    page.on("console", (m) => { if (m.type() === "error" && keep(m.text())) errs.push(m.text().slice(0, 300)); });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${PORT}/wind-harness.html?${q}`);
    await page.waitForFunction(() => window.__WIND_HARNESS__?.done, null, { timeout: 400000 });
    const result = await page.evaluate(() => window.__WIND_HARNESS__);
    console.log(`== ${id} (${((Date.now() - t0) / 1000).toFixed(1)}s) ?${q}`);
    console.log(JSON.stringify(result));
    if (errs.length) console.log("errors:", errs.slice(0, 5).join("\n  "));
    await page.close();
  }
  await browser.close();
} finally {
  try { process.kill(-vite.pid, "SIGTERM"); } catch { vite.kill("SIGTERM"); }
}
