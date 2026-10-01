import "./probe-guard.mjs"; // job pool first (speed lane 3B)
// Headless A/B of the glow pass (decision 0108 post row): per site one paused
// night view shot off, off again (the noise floor: rain, water, flicker), then
// on at each tune, toggled in place by the debug hook's `post`. SwiftShader;
// canvas PNGs (HUD hidden) plus the exposure and HUD lines in hud.json.
// Env: SITES name:xKm:zKm:yaw[:interiorCell],...  TUNES threshold:strength,...
// T (hh:mm), HARNESS_PORT; --out <dir>. Run from apps/world-studio.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const i = process.argv.indexOf("--out");
const OUT = i > 0 ? process.argv[i + 1] : new URL("../artifacts/post/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.HARNESS_PORT ?? 8097);
const T = process.env.T ?? "22:00";
// Claywater: the north campfire, the station-house brazier and lanterns, one interior
const SITES = (process.env.SITES
  ?? "campfire:0.311:2.975:3.14,brazier:0.311:3.040:3.2,interior:0.31309:3.00629:3.14:KeebaHouseFisher").split(",");
const TUNES = (process.env.TUNES ?? "4:0.06").split(",").map((t) => t.split(":").map(Number));
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
  for (const site of SITES) {
    const [name, x, z, yaw, cell] = site.split(":");
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.addInitScript(() => localStorage.setItem("es.hud.perfOpen", "1"));
    const q = cell ? `&interior=${encodeURIComponent(cell)}` : "";
    await page.goto(`http://127.0.0.1:${PORT}/?view=character&x=${x}&z=${z}&t=${T}&q=low&aa=0&dpr=1${q}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__?.player?.() != null, undefined, { timeout: 300000 });
    if (cell) {
      await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__?.interior?.()?.cellId, undefined, { timeout: 240000, polling: 200 });
    }
    await page.waitForTimeout(30000);
    const hud = await page.evaluate(() => [...document.querySelectorAll("span")].map((s) => s.innerText)
      .filter((t) => /^post |^cpu by stage|^gpu/.test(t)));
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("body *")) {
        if (el.tagName !== "CANVAS" && !el.querySelector("canvas")) el.style.visibility = "hidden";
      }
    });
    const shot = (n) => page.screenshot({ path: `${OUT}${name}-${n}.png`, timeout: 120000 });
    await page.evaluate((y) => window.__STUDIO_CHARACTER_DEBUG__.aimCamera(Number(y)), yaw);
    await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.post(false));
    // the follow camera eases to the new yaw at software-GL frame rates
    await page.waitForTimeout(25000);
    await shot("off-a");
    await shot("off-b");
    let exposure = 0;
    for (const [threshold, strength] of TUNES) {
      await page.evaluate((t) => window.__STUDIO_CHARACTER_DEBUG__.post(true, t), { threshold, strength });
      await page.waitForTimeout(1500);
      await shot(`on-${threshold}-${strength}`);
      exposure = await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.post(true));
    }
    result[name] = { exposure, hud };
    await page.close();
  }
} finally {
  await browser.close();
  killVite();
}
writeFileSync(`${OUT}hud.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result));
process.exit(0);
