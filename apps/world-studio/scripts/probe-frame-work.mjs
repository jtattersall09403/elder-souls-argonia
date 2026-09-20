// Walking-stutter measurement (owner 2026-09-20, "option 1"): how much of the
// main thread the per-crossing rebuilds take, before and after the frame-work
// scheduler. Modelled on probe-air-diff.mjs: starts a studio DEV server (the
// debug handles it reads are `import.meta.env.DEV`-only) unless SHOT_BASE is
// set, opens a jungle character site, waits for the vegetation debug hook and
// then records long tasks for 20 s. It then reloads 200 m along +x (the studio
// takes the focus from the URL only) and records the same again.
//
// No GPU on this VM (SwiftShader), so every millisecond here is a RATIO
// against the other run at the same site, never a real frame time.
//
//   node apps/world-studio/scripts/probe-frame-work.mjs [x] [z]
import { chromium } from "playwright";
import { startStudioDevServer } from "./dev-server.mjs";

const X = Number(process.argv[2] ?? 4.02);
const Z = Number(process.argv[3] ?? 4.61);
const STEP_KM = 0.2; // 200 m along +x
const RECORD_MS = 20000;

const server = process.env.SHOT_BASE ? null : await startStudioDevServer();
const BASE = process.env.SHOT_BASE ?? server.url;

const install = () => {
  window.__LONGTASKS__ = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__LONGTASKS__.push(e.duration);
    }).observe({ entryTypes: ["longtask"] });
  } catch { window.__LONGTASKS__ = null; }
};

const readout = () => {
  const tasks = window.__LONGTASKS__ ?? [];
  const veg = window.__STUDIO_VEGETATION_DEBUG__;
  return {
    longTasks: tasks.length,
    longTaskMaxMs: tasks.length ? Math.round(Math.max(...tasks)) : 0,
    longTaskTotalMs: Math.round(tasks.reduce((n, d) => n + d, 0)),
    vegetationRebuildMs: veg?.rebuildMs ?? null,
    vegetationFrames: veg?.rebuildMs?.frames ?? null,
    vegetationElapsedMs: veg?.rebuildMs?.elapsedMs ?? null,
    floraColliderElapsedMs: window.__STUDIO_VEG_COLLIDERS_DEBUG__?.elapsedMs ?? null,
    floraCollidersMs: window.__STUDIO_VEG_COLLIDERS_DEBUG__?.lastBuildMs ?? null,
    frameWork: window.__STUDIO_FRAME_WORK__ ?? null,
    vegetationChunks: veg?.chunks ?? null,
    vegetationInstances: veg?.instances ?? null,
    vegetationDraws: veg?.draws ?? null,
    vegetationTriangles: veg?.triangles ?? null,
    vegetationCulled: veg?.culled ?? null,
    vegetationOccluded: veg?.occluded ?? null,
    vegetationBucketMs: veg?.rebuildMs?.bucket ?? null,
    vegetationFillMs: veg?.rebuildMs?.fill ?? null,
  };
};

try {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const rows = [];
  for (const [label, x] of [["site", X], ["site+200m", X + STEP_KM]]) {
    try {
      await page.goto(`${BASE}?view=character&x=${x.toFixed(2)}&z=${Z.toFixed(2)}&t=12:00&hud=0&markers=0`, {
        waitUntil: "domcontentloaded",
        timeout: 180000,
      });
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        const ready = await page.evaluate(() => !!window.__STUDIO_VEGETATION_DEBUG__);
        if (ready) break;
        await page.waitForTimeout(5000);
      }
      await page.evaluate(install);
      let vegetationRebuilds = 0;
      const onConsole = (msg) => {
        if (msg.text().startsWith("vegetation rebuild")) vegetationRebuilds++;
      };
      page.on("console", onConsole);
      await page.waitForTimeout(RECORD_MS);
      page.off("console", onConsole);
      rows.push({ label, x: +x.toFixed(2), vegetationRebuilds, ...(await page.evaluate(readout)) });
    } catch (err) {
      rows.push({ label, x: +x.toFixed(2), error: String(err?.message ?? err) });
    }
  }
  console.log(JSON.stringify(rows, null, 2));
  await browser.close();
} finally {
  server?.stop();
}
