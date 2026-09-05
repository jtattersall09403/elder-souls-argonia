// Frame cost of the TEMPORARY ground-painted blueprint layer (owner ask
// 2026-09-05). Walks into Lilmoth in character mode, samples frame times with
// the layer off, then on, and prints the difference.
//   node scripts/probe-bpground.mjs         (needs `npx vite build` first)
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 4325;
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;
const studioDir = new URL("../", import.meta.url).pathname;
// Lilmoth's blueprint boundary centroid, in km (the marker now stands here).
const AT = { x: 3.759, z: 6.365 };

const server = spawn("npx", ["vite", "preview", "--base", "/elder-souls-argonia/studio/",
  "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: studioDir, stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = "";
server.stdout.on("data", (c) => { log += c; });
server.stderr.on("data", (c) => { log += c; });
const waitFor = async (url, ms = 30000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server never came up\n${log}`);
};
const sampleMs = (page, ms) => page.evaluate((duration) => new Promise((resolve) => {
  const frames = [];
  let last = performance.now();
  const tick = (now) => {
    frames.push(now - last);
    last = now;
    if (now - start < duration) requestAnimationFrame(tick);
    else {
      frames.sort((a, b) => a - b);
      resolve({ n: frames.length, median: frames[Math.floor(frames.length / 2)], max: frames[frames.length - 1], mean: frames.reduce((a, b) => a + b, 0) / frames.length });
    }
  };
  const start = performance.now();
  requestAnimationFrame(tick);
}), ms);

try {
  await waitFor(BASE);
  const browser = await chromium.launch({ headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); if (m.text().includes("bpground")) console.log(new Date().toISOString().slice(14,23), m.text()); });
  // The blueprint export is mid-rev this hour (file says schemaVersion 1, the
  // loader wants 2). Nudge the number so the layer can be measured today;
  // delete this route once export_blueprints has been re-run.
  await page.route("**/province/blueprints.json", async (route) => {
    const r = await route.fetch();
    const j = JSON.parse(await r.text());
    j.schemaVersion = 2;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(j) });
  });
  await page.goto(`${BASE}?view=character&x=${AT.x}&z=${AT.z}&q=medium`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("chunk "), undefined, { timeout: 90000 });
  await page.waitForTimeout(6000);

  const off = await sampleMs(page, 4000);
  await page.getByText("bp ground").click();
  await page.waitForTimeout(12000);
  const on = await sampleMs(page, 4000);
  console.log(`frames: off median ${off.median.toFixed(1)} mean ${off.mean.toFixed(1)} max ${off.max.toFixed(1)} n=${off.n} | on median ${on.median.toFixed(1)} mean ${on.mean.toFixed(1)} max ${on.max.toFixed(1)} n=${on.n}`);
  console.log(`layer cost ≈ ${(on.median - off.median).toFixed(2)} ms/frame (software GL — a real GPU is faster)`);
  console.log(`page errors: ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log("  " + e);
  await browser.close();
} finally {
  try { process.kill(-server.pid); } catch { /* already gone */ }
}
