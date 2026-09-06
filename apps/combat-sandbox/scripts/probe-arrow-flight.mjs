/** Measure the production arrow body through apex and descent.
 * Run after building: node scripts/probe-arrow-flight.mjs [speed] [angleDeg].
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const speed = Number(process.argv[2] ?? 5);
const angleDeg = Number(process.argv[3] ?? 80);
const port = Number(process.env.VISUAL_PORT ?? 4177);
const url = `http://127.0.0.1:${port}/elder-souls-argonia/`;
const require_ = createRequire(import.meta.url);
const vitePackagePath = require_.resolve("vite/package.json");
const vitePackage = JSON.parse(await readFile(vitePackagePath, "utf8"));
const viteBin = join(dirname(vitePackagePath), typeof vitePackage.bin === "string" ? vitePackage.bin : vitePackage.bin.vite);
const server = spawn(process.execPath, [viteBin, "preview", "--base", "/elder-souls-argonia/", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", chunk => { serverLog += chunk; });
server.stderr.on("data", chunk => { serverLog += chunk; });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    if (serverLog.includes("Local:")) {
      try { ready = (await fetch(url)).ok; } catch { /* still starting */ }
    }
    if (!ready) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, "preview server did not start");
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${url}?scenario=bow-aim-idle&fast=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__fireProbeArrow === "function", null, { timeout: 120_000 });
  await page.evaluate(([s, a]) => window.__fireProbeArrow(s, a), [speed, angleDeg]);
  await page.waitForFunction(() => (window.__arrowProbe?.samples.length ?? 0) >= 80, null, { timeout: 120_000 });
  const { samples, physics } = await page.evaluate(() => window.__arrowProbe);
  assert.deepEqual(errors, []);
  const first = samples[0], last = samples[79];
  // Rapier refreshes collider mass properties inside the first world step.
  // The pre-step sample still exposes the construction-time density cache.
  assert(samples.slice(1).every(s => Math.abs(s.massKg - physics.massKg) < 1e-6),
    "integrated body mass differs from arrow definition");
  assert.equal(first.gravityScale, 2, "shared gameplay default must be 2x");
  assert.equal(first.linearDamping, 0, "unaccounted damping changes flight");
  const accelerations = [];
  for (let i = 0; i < 79; i++) {
    const a = samples[i], b = samples[i + 1];
    const gravity = (b.vy - a.vy) / (b.t - a.t) - a.dragY / physics.massKg;
    assert(Math.abs(gravity + 19.62) < 0.05, `unexpected vertical acceleration ${gravity}`);
    accelerations.push(gravity);
  }
  assert(last.vy < 0 && last.y < first.y, "low-power arrow did not complete apex and descend");
  console.log(JSON.stringify({ speed, angleDeg, samples: 80, massKg: samples[1].massKg,
    gravityScale: first.gravityScale, measuredGravity: accelerations.reduce((a,b)=>a+b,0)/accelerations.length,
    apexRiseMeters: Math.max(...samples.slice(0,80).map(s=>s.y)) - first.y,
    elapsed: last.t-first.t, descentSpeed: last.vy, dropMeters: first.y-last.y }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
