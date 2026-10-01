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
    const tag = t.replace(":", "");
    await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.post(true, { skyMask: 0 }));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, `${tag}-before.png`), timeout: 180000 });
    await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.post(true, { skyMask: 1 }));
    await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus());
    await page.waitForTimeout(1500);
    const census = await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.postSkyCensus());
    await page.screenshot({ path: join(OUT, `${tag}-after.png`), timeout: 180000 });
    result[t] = { sun, census };
    console.log(t, JSON.stringify(result[t]));
  }
  await page.close();
} finally {
  await browser.close();
  killVite();
}
writeFileSync(join(OUT, "census.json"), JSON.stringify(result, null, 1));
process.exit(0);
