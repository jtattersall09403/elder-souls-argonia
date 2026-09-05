/**
 * What an arrow in the *real build* actually does in the air.
 *
 * Fires one slow shot in a running game, records the live rigid body's height
 * and velocity every physics step, and compares it with the offline integrator
 * (`integrateTrajectory`). Written because "arrows float down" is a claim about
 * the shipped scene, not about the maths, and only the scene can answer it.
 *
 *   node scripts/probe-arrow-flight.mjs [speed] [angleDeg]
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const speed = Number(process.argv[2] ?? 10);
const angleDeg = Number(process.argv[3] ?? 45);
const port = Number(process.env.VISUAL_PORT ?? 4177);
const url = `http://127.0.0.1:${port}/elder-souls-argonia/`;

const require_ = createRequire(import.meta.url);
const vitePackagePath = require_.resolve("vite/package.json");
const vitePackage = JSON.parse(await readFile(vitePackagePath, "utf8"));
const viteBin = join(dirname(vitePackagePath), typeof vitePackage.bin === "string" ? vitePackage.bin : vitePackage.bin.vite);

const server = spawn(process.execPath, [viteBin, "preview", "--base", "/elder-souls-argonia/", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "inherit" });
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("preview server never came up");
}
await waitForServer();

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
page.on("pageerror", (error) => console.error("page error:", error.message));
 page.on("console", (m) => console.log("console:", m.text().slice(0, 200)));
await page.goto(`${url}?fast=1`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__fireProbeArrow === "function", null, { timeout: 150_000 });
await page.evaluate(([s, a]) => window.__fireProbeArrow(s, a), [speed, angleDeg]);
await page.waitForFunction(() => (window.__arrowProbe?.samples.length ?? 0) > 150, null, { timeout: 150_000 });
const samples = await page.evaluate(() => window.__arrowProbe.samples);
const shaftLength = await page.evaluate(() => window.__arrowProbe.shaftLengthMeters ?? null);
await browser.close();
stop();

// The analytic arc, integrated here with the *measured* body mass so the
// comparison cannot hide a mass problem behind a matching curve.
const AIR_DENSITY = 1.225;
const DRAG_COEFFICIENT = 1.1;
const SHAFT_DIAMETER_M = 0.0111;
const area = Math.PI * (SHAFT_DIAMETER_M / 2) ** 2;
const massKg = samples[0].massKg;
const analytic = [];
{
  let vx = 0;
  let vy = speed * Math.sin((angleDeg * Math.PI) / 180);
  let vz = speed * Math.cos((angleDeg * Math.PI) / 180);
  let y = 20;
  const dt = 1 / 60;
  for (let step = 0; step < 400; step += 1) {
    const v = Math.hypot(vx, vy, vz);
    const k = (0.5 * AIR_DENSITY * DRAG_COEFFICIENT * area * v) / massKg;
    vy += (-9.81 - k * vy) * dt;
    vz += (-k * vz) * dt;
    y += vy * dt;
    analytic.push({ y, vy });
  }
}

console.log(`\nrendered shaft length: ${shaftLength === null ? "n/a" : shaftLength.toFixed(3)} m`);
console.log(`mass=${massKg.toFixed(5)} kg  gravityScale=${samples[0].gravityScale}  linearDamping=${samples[0].linearDamping}`);
console.log("t      y(sim)   vy(sim)   y(analytic)  vy(analytic)  dragY(sim)");
for (let i = 0; i < Math.min(samples.length, 200); i += 10) {
  const s = samples[i];
  const a = analytic[i];
  console.log(
    `${s.t.toFixed(2)}  ${s.y.toFixed(3)}  ${s.vy.toFixed(3)}  ${a.y.toFixed(3)}  ${a.vy.toFixed(3)}  vz=${s.vz.toFixed(3)}  m=${s.massKg.toExponential(3)}  dragY=${s.dragY.toExponential(2)}`,
  );
}
const dvy = (samples[30].vy - samples[10].vy) / (samples[30].t - samples[10].t);
console.log(`\nmeasured dvy/dt over steps 10..30: ${dvy.toFixed(3)} m/s^2 (expect ~ -9.8)`);
