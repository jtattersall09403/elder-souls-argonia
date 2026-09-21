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
// One window is enough for a shader-compile check.
const WINDOWS = Number(process.env.WINDOWS ?? 2);

/**
 * A shader that fails to compile is SILENT in every CPU counter: the gating
 * loop keeps reporting healthy draws/instances/triangles while the GPU draws
 * nothing. A float->int mix escaped three sessions of SwiftShader probes, so
 * the console is now a gate (round 2).
 */
const isShaderError = (text) =>
  text.includes("THREE.WebGLProgram")
  || text.includes("Shader Error")
  || /(FRAGMENT|VERTEX)\b.*(ERROR|error|not compile)/.test(text)
  || (text.includes("[vegetation") && text.toLowerCase().includes("error"));

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
  // Every tree/palm species, plus the eight heaviest drawers: an aggregate
  // count cannot tell a missing species from a distant one.
  const all = Object.entries(veg?.bySpecies ?? {});
  const top = new Set(
    [...all].sort((a, b) => b[1].drawn - a[1].drawn).slice(0, 8).map(([id]) => id));
  const bySpecies = {};
  for (const [id, v] of all) {
    if (top.has(id) || /tree|palm/i.test(id)) bySpecies[id] = v;
  }
  return {
    bySpecies,
    speciesCount: all.length,
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
    // Cell renderer (decision 0082).
    drawsFallback: veg?.drawsFallback ?? null,
    cellBuilds: veg?.cellBuilds ?? null,
    cellRebuilds: veg?.cellRebuilds ?? null,
    cellRebuildReasons: veg?.cellRebuildReasons ?? null,
    gatingMs: veg?.gatingMs ?? null,
    gatingMaxMs: veg?.gatingMaxMs ?? null,
    maskMs: veg?.maskMs ?? null,
    batches: veg?.batches ?? null,
    copiesTotal: veg?.copiesTotal ?? null,
    cellsPending: veg?.cellsPending ?? null,
    vegetationFrame: veg?.frame ?? null,
  };
};

try {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const rows = [];
    // VARIANTS="&a=1,&b=2": the SAME site once per URL suffix (no +200 m
    // move), labelled by the suffix. An empty suffix is allowed.
  const variants = (process.env.VARIANTS ?? "").split(",");
  const windows = process.env.VARIANTS
    ? variants.map((suffix) => [suffix || "(none)", X, suffix])
    : [["site", X, ""], ["site+200m", X + STEP_KM, ""]].slice(0, WINDOWS);
  for (const [label, x, suffix] of windows) {
    const shaderErrors = [];
    const onShader = (msg) => {
      const text = msg.text();
      if (isShaderError(text)) shaderErrors.push(text.slice(0, 4000));
    };
    page.on("console", onShader);
    page.on("pageerror", (err) => {
      const text = String(err?.message ?? err);
      if (isShaderError(text)) shaderErrors.push(text.slice(0, 4000));
    });
    try {
      await page.goto(`${BASE}?view=character&x=${x.toFixed(2)}&z=${Z.toFixed(2)}&t=12:00&w=clear&hud=0&markers=0${suffix}`, {
        waitUntil: "domcontentloaded",
        timeout: 180000,
      });
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        const ready = await page.evaluate(() => !!window.__STUDIO_VEGETATION_DEBUG__);
        if (ready) break;
        await page.waitForTimeout(5000);
      }
      // Wait for a BUILT steady state before recording: on SwiftShader the
      // first cells take tens of seconds, and a window that starts before them
      // measures loading, not walking.
      const readyStart = Date.now();
      const readyDeadline = readyStart + 170000;
      let steady = false;
      while (Date.now() < readyDeadline) {
        steady = await page.evaluate(() => {
          const veg = window.__STUDIO_VEGETATION_DEBUG__;
          if (!veg) return false;
          return (veg.cellBuilds ?? 0) > 0 && veg.cellsPending === 0;
        });
        if (steady) break;
        await page.waitForTimeout(5000);
      }
      const readyMs = Date.now() - readyStart;
      const shot = `/tmp/probe-${label.replace(/[^a-z0-9]+/gi, "-")}.png`;
      // A software-rendered frame of the built world takes minutes, and a
      // failed grab must never lose the window's numbers.
      try {
        await page.screenshot({ path: shot, timeout: 300000 });
        console.error(`screenshot: ${shot}`);
      } catch (err) {
        console.error(`screenshot failed: ${String(err?.message ?? err)}`);
      }
      await page.evaluate(install);
      let cellBuiltLines = 0;
      let cellRebuiltLines = 0;
      const onConsole = (msg) => {
        const text = msg.text();
        if (text.startsWith("vegetation cell built")) cellBuiltLines++;
        else if (text.startsWith("vegetation cell rebuilt")) cellRebuiltLines++;
      };
      page.on("console", onConsole);
      await page.waitForTimeout(RECORD_MS);
      page.off("console", onConsole);
      rows.push({
        label, x: +x.toFixed(2),
        readyMs, steady, shaderErrors,
        cellBuiltLines, cellRebuiltLines,
        ...(await page.evaluate(readout)),
      });
    } catch (err) {
      rows.push({
        label, x: +x.toFixed(2), shaderErrors,
        error: String(err?.message ?? err),
      });
    } finally {
      page.off("console", onShader);
    }
  }
  console.log(JSON.stringify(rows, null, 2));
  await browser.close();
  if (rows.some((r) => (r.shaderErrors ?? []).length > 0)) {
    console.error("SHADER ERRORS: the batched foliage programs did not compile");
    process.exitCode = 2;
  }
} finally {
  server?.stop();
}
