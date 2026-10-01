import "./probe-guard.mjs"; // job pool first (speed lane 3B)
// Headless sky census of the glow pass (walk 9 sun blob; BloomPass
// `measureSky`): one page at a site, the clock set in place to each time, the
// camera aimed at the sun, then one census per time: the share of SKY texels
// the scene threshold would glow (the walk-9 blob) and the share that glows
// now (the sun's disc only), plus a canvas PNG with the sky mask off and on.
// Env: X, Z (km), TIMES (hh:mm,...), HARNESS_PORT; --out <dir>. SwiftShader,
// 480x270. Run from apps/world-studio.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

/** The shipped sky constants (the sweep restores these for its "config" row). */
const CONFIG = JSON.parse(readFileSync(new URL("../../../packages/game-core/src/render/post/bloom.config.json", import.meta.url), "utf8"));

const i = process.argv.indexOf("--out");
const OUT = i > 0 ? process.argv[i + 1] : new URL("../artifacts/bloom-sky/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.HARNESS_PORT ?? 8098);
const X = process.env.X ?? "0.311";
const Z = process.env.Z ?? "2.975";
const TIMES = (process.env.TIMES ?? "06:30,12:00,14:30,18:30").split(",");
const vite = spawn("npx", ["vite", "--port", String(PORT), "--host", "127.0.0.1"], {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" }, shell: true, detached: true,
});
const killVite = () => { try { process.kill(-vite.pid, "SIGKILL"); } catch { /* gone */ } };
await new Promise((res, rej) => {
  const on = (d) => { if (String(d).includes(`:${PORT}`)) res(); };
  vite.stdout.on("data", on); vite.stderr.on("data", on);
  setTimeout(() => rej(new Error("vite did not start")), 60000);
});
const result = {};
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.goto(`http://127.0.0.1:${PORT}/?view=character&x=${X}&z=${Z}&t=${TIMES[0]}&w=${process.env.W ?? "clear"}&q=low&aa=0&dpr=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__?.player?.() != null, undefined, { timeout: 300000 });
  await page.waitForTimeout(20000);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body *")) {
      if (el.tagName !== "CANVAS" && !el.querySelector("canvas")) el.style.visibility = "hidden";
    }
    // the minimap is a canvas too: only the WebGL canvas stays
    for (const c of document.querySelectorAll("canvas")) if (!c.getContext("webgl2")) c.style.visibility = "hidden";
  });
  for (const t of TIMES) {
    const [hh, mm] = t.split(":").map(Number);
    const sun = await page.evaluate(async (minute) => {
      const ts = await import("/src/sky/timeState.ts");
      const rig = await import("/src/sky/lightRig.ts");
      ts.setClockInstant({ ...ts.worldClock.now(), minuteOfDay: minute });
      const d = rig.computeLightRig(ts.worldClock.epochMinutes(), 0.5, 0.5).sun.direction;
      const yaw = Math.atan2(-d.x, -d.z);
      const alt = Math.asin(Math.max(-1, Math.min(1, d.y)));
      window.__STUDIO_CHARACTER_DEBUG__.aimCamera(yaw, -alt);
      return { yaw, altDeg: (alt * 180) / Math.PI };
    }, hh * 60 + mm);
    await page.waitForTimeout(15000);
    // The follow camera's pitch is not the view's elevation (the look target
    // rises past minPosPitch), so steer on the census's own sun pixel until
    // the disc sits mid-frame; a sun still off-frame is reported, not measured.
    let pitch = -sun.altDeg * Math.PI / 180;
    const census = async () => {
      await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus(true));
      await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus() != null, undefined, { timeout: 180000, polling: 500 });
      return page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus());
    };
    const VFOV = 60 * Math.PI / 180; // only the steering gain
    for (let k = 0; k < 6; k++) {
      const c = await census();
      // the disc sits in the upper quarter: mid-frame is the player's body (walk 9: sunBr 0 at 06:30/14:30)
      const err = c.sunPx ? (c.sunPx[1] / 135 - 0.75) * VFOV : null;
      if (err !== null && Math.abs(err) < 0.05) break;
      pitch = Math.max(-1.15, Math.min(0.78, pitch - (err ?? 0.25)));
      await page.evaluate(({ yaw, p }) => window.__STUDIO_CHARACTER_DEBUG__.aimCamera(yaw, p), { yaw: sun.yaw, p: pitch });
      await page.waitForTimeout(4000);
    }
    sun.pitch = pitch;
    // the clock the frame was drawn at (walk 9: a stale census repeated 14:30 as 18:30)
    const clockMinute = await page.evaluate(async () => (await import("/src/sky/timeState.ts")).worldClock.now().minuteOfDay);
    const tag = t.replace(":", "");
    await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.post(true, { skyMask: 0 }));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, `${tag}-before.png`), timeout: 180000 });
    // one census per candidate sky threshold (SKY_SWEEP, comma list; else the config's)
    const sweep = {};
    for (const st of (process.env.SKY_SWEEP ?? "").split(",").filter(Boolean).map(Number).concat([NaN])) {
      const threshold = Number.isNaN(st) ? CONFIG.skyThreshold : st;
      await page.evaluate((v) => window.__STUDIO_CHARACTER_DEBUG__.post(true, { skyMask: 1, skyThreshold: v }), threshold);
      await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus(true));
      // a census drawn after this request, never the previous time's
      await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus() != null, undefined, { timeout: 180000, polling: 500 });
      sweep[Number.isNaN(st) ? "config" : st] = await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus());
    }
    await page.screenshot({ path: join(OUT, `${tag}-after.png`), timeout: 180000 });
    // HUNT=1: a sun texel with a near depth is covered by some drawable that
    // writes depth; hide depth writers by top-level group, then bisect inside
    // the guilty group, until the texel reads the far clear.
    let hunt;
    if (process.env.HUNT && sweep.config.sunTexel && sweep.config.sunTexel.depth < 0.9999999) {
      const writers = await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.depthWriters());
      const depthWith = async (hidden) => {
        await page.evaluate((u) => window.__STUDIO_CHARACTER_DEBUG__.setVisible(u, false), hidden);
        await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus(true));
        await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus() != null, undefined, { timeout: 180000, polling: 500 });
        const c = await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus());
        await page.evaluate((u) => window.__STUDIO_CHARACTER_DEBUG__.setVisible(u, true), hidden);
        return c.sunTexel?.depth ?? null;
      };
      const far = (d) => d !== null && d >= 0.9999999;
      let set = writers;
      if (!far(await depthWith(set.map((w) => w.uuid)))) hunt = { writers: writers.length, result: "not a depth writer in the scene graph" };
      else {
        while (set.length > 1) {
          const half = set.slice(0, Math.ceil(set.length / 2));
          set = far(await depthWith(half.map((w) => w.uuid))) ? half : set.slice(half.length);
        }
        hunt = { writers: writers.length, culprit: set[0] };
      }
      console.log("hunt", JSON.stringify(hunt));
    }
    result[t] = { sun, clockMinute, census: sweep, hunt };
    console.log(t, JSON.stringify(result[t]));
  }
  await page.close();
} finally {
  await browser.close();
  killVite();
}
writeFileSync(join(OUT, "census.json"), JSON.stringify(result, null, 1));
process.exit(0);
