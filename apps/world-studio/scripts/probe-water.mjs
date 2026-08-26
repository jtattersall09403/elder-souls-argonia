// Phase 8b water probe: boots the built studio at fixed WorldInstants over
// real water bodies (bay, major river, Blackrose basin, mountain tarn,
// marsh), reads window.__STUDIO_WATER_DEBUG__ and __STUDIO_SKY_DEBUG__, and
// fails on any page/shader error. Covers BOTH fly and character views (the
// 8a lesson: per-mode canvas wiring hides per-mode defects), including a
// deep-water character spawn that exercises the underwater pipeline.
// Run from apps/combat-sandbox (owns the playwright dep):
//   node ../world-studio/scripts/probe-water.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(studioDir, "artifacts");
mkdirSync(artifacts, { recursive: true });

const PORT = 4323;
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;

const SCENARIOS = [
  {
    id: "bay-noon-fly",
    q: "view=fly3d&cam=orbit&x=6.16&z=5.07&ex=1&t=12:00&d=8-17&wq=high",
    underwater: false,
    surfaceAtCam: [-1.2, 1.2], // open sea: 0 ± tide
    brightness: [25, 235],
    // bottom half of frame = open water at noon: must read blue/teal (not
    // brown/grey), not blown out, and textured (waves/ripples, not flat)
    waterRegion: { coolMin: 0.95, meanMax: 210, stdMin: 3 },
  },
  {
    id: "river-walk",
    q: "view=character&x=1.85&z=4.89&ex=1&t=12:00&d=8-17&wq=high",
    underwater: false,
    surfaceAtCam: [0.5, 3.5], // river surface ≈ 1.65 m
    brightness: [25, 235],
  },
  {
    id: "blackrose-dusk-fly",
    q: "view=fly3d&cam=orbit&x=2.74&z=3.15&ex=1&t=18:00&d=8-17&wq=high",
    underwater: false,
    brightness: [2, 200],
  },
  {
    id: "tarn-fly",
    q: "view=fly3d&cam=orbit&x=0.38&z=1.44&ex=1&t=12:00&d=8-17&wq=high",
    underwater: false,
    surfaceAtCam: [250, 320], // the mountain tarn holds water at ~290 m
    brightness: [25, 235],
  },
  {
    id: "marsh-morning-walk",
    q: "view=character&x=1.50&z=5.28&ex=1&t=09:00&d=8-17&wq=high",
    underwater: false,
    brightness: [20, 235],
  },
  {
    id: "underwater-bay-fly",
    q: "view=fly3d&cam=orbit&x=6.16&z=5.07&ex=1&t=12:00&d=8-17&wq=high&alt=-8",
    underwater: true, // underwater free camera 8 m down in the bay
    brightness: [0.2, 200],
  },
  {
    // PointerLock fly camera (cam=fly is the default mode the owner uses):
    // the render loop must keep advancing even without pointer lock — round-1
    // defect 7 was fly view freezing.
    id: "bay-noon-flycam",
    q: "view=fly3d&cam=fly&x=6.16&z=5.07&ex=1&t=12:00&d=8-17&wq=high",
    underwater: false,
    brightness: [25, 235],
  },
  {
    id: "marsh-wet-season-fly",
    q: "view=fly3d&cam=orbit&x=1.50&z=5.28&ex=1&t=09:00&d=8-17&wet=1&wq=high",
    underwater: false,
    seasonMin: 1.0, // the wet toggle raises fresh lowland water by ~1.4 m
    brightness: [20, 235],
  },
  {
    id: "bay-lowtier-fly",
    q: "view=fly3d&cam=orbit&x=6.16&z=5.07&ex=1&t=12:00&d=8-17&wq=low",
    underwater: false,
    tier: "low",
    brightness: [25, 235],
  },
];

const server = spawn(
  "npx",
  ["vite", "preview", "--base", "/elder-souls-argonia/studio/", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: studioDir, detached: true, stdio: "ignore" },
);

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`server never came up at ${url}`);
}

const only = process.env.WATER_SCENARIO;
const RUN = only ? SCENARIOS.filter((s) => s.id === only) : SCENARIOS;
const { chromium } = await import("playwright");
const failures = [];
const report = [];
try {
  await waitFor(BASE);
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") pageErrors.push(`console: ${m.text().slice(0, 500)}`);
  });

  for (const s of RUN) {
    const errBefore = pageErrors.length;
    await page.goto(`${BASE}?${s.q}&smsize=512`);
    await page.waitForFunction(
      () => window.__STUDIO_WATER_DEBUG__ && window.__STUDIO_WATER_DEBUG__.frames > 5,
      undefined,
      { timeout: 180_000 },
    );
    await page.waitForTimeout(9_000);
    const dbg = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__);
    const sky = await page.evaluate(() => window.__STUDIO_SKY_DEBUG__);
    await page.waitForTimeout(5_000);
    const dbg2 = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__);
    const shot = path.join(artifacts, `water-${s.id}.png`);
    const buf = await page.screenshot({ path: shot, timeout: 180_000 });
    const brightness = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = 90;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, 160, 90);
      const d = g.getImageData(0, 0, 160, 90).data;
      let sum = 0;
      for (let i = 0; i < 160 * 90 * 4; i += 4)
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      // bottom-half stats for water-colour sanity
      let r = 0, gg = 0, b = 0, n = 0, lsum = 0, lsq = 0;
      for (let y = 50; y < 90; y++) {
        for (let x = 20; x < 140; x++) {
          const i = (y * 160 + x) * 4;
          r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          lsum += l; lsq += l * l;
        }
      }
      const lm = lsum / n;
      return {
        mean: sum / (160 * 90),
        water: { r: r / n, g: gg / n, b: b / n, mean: lm, std: Math.sqrt(Math.max(lsq / n - lm * lm, 0)) },
      };
    }, buf.toString("base64"));

    const checks = [];
    const fail = (msg) => {
      checks.push(`FAIL ${msg}`);
      failures.push(`${s.id}: ${msg}`);
    };
    const ok = (msg) => checks.push(`ok   ${msg}`);

    const newErrs = pageErrors.slice(errBefore);
    if (newErrs.length === 0) ok("no page/shader errors");
    else fail(`page errors: ${newErrs.slice(0, 3).join(" | ")}`);
    if (dbg && dbg.frames > 5) ok(`pipeline live (${dbg.frames} frames, tier ${dbg.tier})`);
    else fail("water pipeline never rendered");
    // software GL can crawl at ~1 fps on heavy scenes — only a DEAD loop
    // (zero new frames in 5 s) is a defect
    if (dbg2 && dbg2.frames > dbg.frames + 1) ok(`render loop advancing (${dbg2.frames - dbg.frames} frames / 5 s)`);
    else fail(`render loop stalled at frame ${dbg2?.frames} (was ${dbg?.frames})`);
    if (dbg2?.contextLost) fail("WebGL context lost during scenario");
    if (s.tier && dbg.tier !== s.tier) fail(`tier ${dbg.tier} != ${s.tier}`);
    if (dbg.underwater === s.underwater) ok(`underwater=${dbg.underwater}`);
    else fail(`underwater ${dbg.underwater}, expected ${s.underwater}`);
    if (s.surfaceAtCam) {
      if (dbg.surfaceAtCameraM >= s.surfaceAtCam[0] && dbg.surfaceAtCameraM <= s.surfaceAtCam[1])
        ok(`surface@cam ${dbg.surfaceAtCameraM.toFixed(2)} m in [${s.surfaceAtCam}]`);
      else fail(`surface@cam ${dbg.surfaceAtCameraM.toFixed(2)} m outside [${s.surfaceAtCam}]`);
    }
    if (Number.isFinite(dbg.tideOffsetM) && Math.abs(dbg.tideOffsetM) <= 0.75)
      ok(`tide ${dbg.tideOffsetM.toFixed(3)} m`);
    else fail(`tide offset bad: ${dbg.tideOffsetM}`);
    if (s.seasonMin !== undefined) {
      if (dbg.seasonOffsetM >= s.seasonMin) ok(`wet-season rise ${dbg.seasonOffsetM.toFixed(2)} m`);
      else fail(`wet-season rise ${dbg.seasonOffsetM} < ${s.seasonMin}`);
    }
    if (brightness.mean >= s.brightness[0] && brightness.mean <= s.brightness[1])
      ok(`screen brightness ${brightness.mean.toFixed(1)} in [${s.brightness}]`);
    else fail(`screen brightness ${brightness.mean.toFixed(1)} outside [${s.brightness}]`);
    if (s.waterRegion) {
      const w = brightness.water;
      const cool = (w.g + w.b) / Math.max(2 * w.r, 1);
      const desc = `rgb(${w.r.toFixed(0)},${w.g.toFixed(0)},${w.b.toFixed(0)}) std ${w.std.toFixed(1)}`;
      if (cool >= s.waterRegion.coolMin && w.mean <= s.waterRegion.meanMax && w.std >= s.waterRegion.stdMin)
        ok(`water colour sane: ${desc}`);
      else fail(`water colour suspicious: ${desc} (cool ${cool.toFixed(2)})`);
    }
    if (sky && Math.abs(sky.exposure - sky.exposureTarget) < sky.exposureTarget * 0.05 + 1e-6)
      ok("sky exposure still converges with the water pipeline active");
    else fail("sky exposure did not converge under the water pipeline");

    report.push(
      `## ${s.id}\nurl: ?${s.q}\n` +
        checks.join("\n") +
        `\nsurface@cam ${dbg.surfaceAtCameraM?.toFixed?.(2)} m · camDepth ${dbg.cameraDepthM?.toFixed?.(2)} m` +
        ` · tide ${dbg.tideOffsetM?.toFixed?.(3)} m · season ${dbg.seasonOffsetM?.toFixed?.(2)} m` +
        ` · rtSamples ${dbg.rtSamples}\nscreenshot: ${path.basename(shot)}\n`,
    );
  }
  if (pageErrors.length) {
    report.push(`## all page errors\n${pageErrors.slice(0, 20).join("\n")}`);
  }
  await browser.close();
} catch (e) {
  failures.push(String(e));
  report.push(`## crash\n${String(e)}`);
} finally {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
}

const summary = `\n\n${report.join("\n")}`;
writeFileSync(path.join(artifacts, "water-probe-result.txt"), summary);
console.log(summary);
process.exit(failures.length ? 1 : 0);
