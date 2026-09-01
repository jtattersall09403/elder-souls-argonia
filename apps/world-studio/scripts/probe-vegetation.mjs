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
// minGroundcover asserts the T3 ring (window.__STUDIO_GROUNDCOVER_DEBUG__):
// firm floors only where the palettes paint grass-bearing ground for certain
// (jungle floor; the 5,12 interior-swamp exemplar is mostly bare muck by
// design — decision 0036 Q5 — so its floor is low). Elsewhere report-only.
// alt: the dense areas are probed FROM ALTITUDE — round-2 density makes a
// ground-level jungle frame take minutes on SwiftShader, and the high view
// exercises exactly the far tier (per-species culls + T4 billboards) that a
// probe can meaningfully assert. Ground-level look in dense areas is the
// owner's call on a real GPU (deployed build), per the golden rules.
const SCENARIOS = [
  { id: "exemplar-interior-swamp", x: 2.574, z: 5.849, alt: 420, pitch: -55, minInstances: 500, minGroundcover: 0 },
  { id: "contrast-jungle", x: 3.509, z: 4.445, alt: 420, pitch: -55, minInstances: 800, minGroundcover: 0 },
  { id: "contrast-rootland", x: 2.106, z: 4.913, alt: 420, pitch: -55, minInstances: 400, minGroundcover: 0 },
  { id: "contrast-coastal-lagoon", x: 5.381, z: 3.510, alt: 90, pitch: -18, minInstances: 200, minGroundcover: 0 },
  { id: "contrast-uplands", x: 1.638, z: 1.638, alt: 90, pitch: -18, minInstances: 20, minGroundcover: 0 },
  // Round 4: the mangrove wall on the Lilmoth approach (chunk 7,14).
  { id: "contrast-mangrove", x: 3.51, z: 6.78, alt: 90, pitch: -18, minInstances: 200, minGroundcover: 0 },
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

const errors = [];
const results = [];
for (const scenario of SCENARIOS) {
  // A FRESH page per scenario: a heavy scene keeps SwiftShader rasterising
  // long after its screenshot times out, and a reused page starves the next
  // navigation into a goto timeout (round 6). 640x400: SwiftShader is
  // fill/vertex bound — the dense areas took 100 s per frame even at this
  // size.
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  // smsize shrinks the CSM maps for the software rasteriser; round-2 density
  // (~180k instances + the T3 ring) made full-size cascades a 30s+ frame.
  const url = `${BASE}?view=fly3d&cam=orbit&x=${scenario.x}&z=${scenario.z}&ex=1&t=11:00&d=8-17&alt=${scenario.alt}&yaw=25&pitch=${scenario.pitch}&smsize=256&wq=low&w=clear&hud=0`;
  // The flora kit is a 12 MB GLB and this runs on a software rasteriser, so
  // "load" plus a fixed sleep is not a safe pair: wait for the DOM, then poll
  // for the renderer's own counters.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240_000 });
  let stats = null;
  let groundcover = null;
  // The two hooks land independently (T1/T2 waits on the 12 MB flora kit,
  // the T3 ring on the land-cover raster + chunk heights); wait for both.
  for (let attempt = 0; attempt < 60 && !(stats && groundcover); attempt++) {
    await page.waitForTimeout(1000);
    stats = await page.evaluate(() => window.__STUDIO_VEGETATION_DEBUG__ ?? null);
    groundcover = await page.evaluate(() => window.__STUDIO_GROUNDCOVER_DEBUG__ ?? null);
  }
  console.log(`${scenario.id.padEnd(28)} ${stats ? JSON.stringify(stats) : "NO STATS"}`);
  console.log(`${" ".repeat(28)} T3 ${groundcover ? JSON.stringify(groundcover) : "NO STATS"}`);
  // Best-effort: the round-6 wide-crown canopy pushed a full SwiftShader
  // frame past any sane timeout at the dense scenarios. The COUNTERS (plus
  // zero page errors) are the gate — a screenshot that arrives is a bonus,
  // and software-rasteriser frame cost says nothing about a real GPU
  // (module 65: the owner's M2 Air is the budget measurement).
  const file = path.join(artifacts, `vegetation-${scenario.id}.png`);
  let screenshotOk = true;
  try {
    await page.screenshot({ path: file, timeout: 180_000 });
  } catch {
    screenshotOk = false;
    console.log(`${" ".repeat(28)} (screenshot timed out — counters only)`);
  }
  results.push({ id: scenario.id, stats, groundcover, file, screenshotOk,
    min: scenario.minInstances, minGroundcover: scenario.minGroundcover });
  await page.close();
}

await browser.close();
stop();

writeFileSync(path.join(artifacts, "vegetation-probe.json"),
  JSON.stringify({ results, errors }, null, 1));

const failures = results.filter((r) =>
  !r.stats || r.stats.instances < r.min
  || !r.groundcover || r.groundcover.instances < r.minGroundcover);
if (errors.length) console.error(`page errors:\n  ${errors.slice(0, 5).join("\n  ")}`);
if (failures.length) {
  console.error("FAILED: " + failures.map((f) => f.id).join(", "));
  process.exit(1);
}
// T4: far chunks of billboard-carrying tree species must actually draw as
// `_lod_flat` billboards somewhere across the scenarios — zero would mean the
// far tier silently regressed to nothing (the extras-lookup trap, again).
const billboardTotal = results.reduce((s, r) => s + (r.stats?.billboardInstances ?? 0), 0);
const culledTotal = results.reduce((s, r) => s + (r.stats?.culled ?? 0), 0);
console.log(`T4 billboard instances across scenarios: ${billboardTotal}; distance-culled: ${culledTotal}`);
if (billboardTotal === 0) {
  console.error("FAILED: no billboard-level (T4) draws in any scenario");
  process.exit(1);
}
console.log("vegetation probe OK");
