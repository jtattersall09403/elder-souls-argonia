// Phase 10 vegetation probe: boots the built studio over the exemplar and
// contrast areas, screenshots them, and reads
// window.__STUDIO_VEGETATION_DEBUG__ for instance/draw/triangle counts.
// Numbers first — a screenshot proves it drew *something*, the counters prove
// it drew the right amount (CLAUDE.md: agents read measurements).
// Run from apps/combat-sandbox (owns the playwright dep):
//   node ../world-studio/scripts/probe-vegetation.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(studioDir, "artifacts");
mkdirSync(artifacts, { recursive: true });

const PORT = 4341;
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;

// Chunk centres for the areas decision 0036 Q3 signed off. Chunk n spans
// 467.9 m, so the centre of chunk (cx,cz) is ((cx+0.5)*467.9)/1000 km.
const SCENARIOS = [
  { id: "exemplar-interior-swamp", x: 2.574, z: 5.849, minInstances: 500 },
  { id: "contrast-jungle", x: 3.509, z: 4.445, minInstances: 800 },
  { id: "contrast-rootland", x: 2.106, z: 4.913, minInstances: 400 },
  { id: "contrast-coastal-lagoon", x: 5.381, z: 3.510, minInstances: 200 },
  { id: "contrast-uplands", x: 1.638, z: 1.638, minInstances: 20 },
];

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort",
  // preview runs with command="serve", so the build-time base is NOT applied
  // and the built index.html's absolute asset paths would 404 without this.
  "--base", "/elder-souls-argonia/studio/"], {
  cwd: studioDir, stdio: "ignore", shell: false,
});
const stop = () => { try { server.kill("SIGTERM"); } catch { /* already gone */ } };
process.on("exit", stop);

const { chromium } = await import("playwright");
// Wait for the preview server to actually answer, rather than guessing:
// a short fixed sleep meant every scenario 404'd against a port that had not
// bound yet, and the failure looked like a missing asset.
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const probe = await fetch(BASE);
    if (probe.ok) break;
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const results = [];
for (const scenario of SCENARIOS) {
  const url = `${BASE}?view=fly3d&cam=orbit&x=${scenario.x}&z=${scenario.z}&ex=1&t=11:00&d=8-17&alt=90`;
  // The flora kit is a 12 MB GLB and this runs on a software rasteriser, so
  // "load" plus a fixed sleep is not a safe pair: wait for the DOM, then poll
  // for the renderer's own counters.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  let stats = null;
  for (let attempt = 0; attempt < 60 && !stats; attempt++) {
    await page.waitForTimeout(1000);
    stats = await page.evaluate(() => window.__STUDIO_VEGETATION_DEBUG__ ?? null);
  }
  const file = path.join(artifacts, `vegetation-${scenario.id}.png`);
  await page.screenshot({ path: file });
  results.push({ id: scenario.id, stats, file, min: scenario.minInstances });
  console.log(`${scenario.id.padEnd(28)} ${stats ? JSON.stringify(stats) : "NO STATS"}`);
}

await browser.close();
stop();

writeFileSync(path.join(artifacts, "vegetation-probe.json"),
  JSON.stringify({ results, errors }, null, 1));

const failures = results.filter((r) => !r.stats || r.stats.instances < r.min);
if (errors.length) console.error(`page errors:\n  ${errors.slice(0, 5).join("\n  ")}`);
if (failures.length) {
  console.error("FAILED: " + failures.map((f) => f.id).join(", "));
  process.exit(1);
}
console.log("vegetation probe OK");
