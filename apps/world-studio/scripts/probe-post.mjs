import "./probe-guard.mjs"; // job pool first (speed lane 3B)
// Headless A/B of the glow pass (decision 0108 post row): one paused night
// view per yaw shot off, off again (noise floor) and on, toggled in place by
// the debug hook's `post`; SwiftShader, canvas PNGs plus the
// HUD's post and cpu-by-stage lines. Pixel metrics: tooling/.reports or the
// caller's script. Env: X, Z (km), T (hh:mm), HARNESS_PORT; --out <dir>.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const i = process.argv.indexOf("--out");
const OUT = i > 0 ? process.argv[i + 1] : new URL("../artifacts/post/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.HARNESS_PORT ?? 8097);
const X = process.env.X ?? "0.318", Z = process.env.Z ?? "3.035", T = process.env.T ?? "22:00";
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
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.addInitScript(() => localStorage.setItem("es.hud.perfOpen", "1"));
  await page.goto(`http://127.0.0.1:${PORT}/?view=character&x=${X}&z=${Z}&t=${T}&q=low&aa=0&dpr=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__?.player?.() != null, undefined, { timeout: 300000 });
  await page.waitForTimeout(30000);
  result.hud = await page.evaluate(() => [...document.querySelectorAll("span")].map((s) => s.innerText)
    .filter((t) => /^post |^cpu by stage|^gpu/.test(t)));
  await page.evaluate(() => { for (const el of document.querySelectorAll("body *")) if (el.tagName !== "CANVAS" && !el.querySelector("canvas")) el.style.visibility = "hidden"; });
  const shot = (name) => page.screenshot({ path: `${OUT}${name}.png`, timeout: 120000 });
  // per yaw: off, off again (the noise floor: rain, water, flicker), on
  for (const yaw of (process.env.YAWS ?? "3.14,2.5,3.8").split(",")) {
    await page.evaluate((y) => window.__STUDIO_CHARACTER_DEBUG__.aimCamera(Number(y)), yaw);
    await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.post(false));
    await page.waitForTimeout(4000);
    await shot(`y${yaw}-off-a`);
    await shot(`y${yaw}-off-b`);
    await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__.post(true));
    await page.waitForTimeout(1500);
    await shot(`y${yaw}-on`);
  }
} finally {
  await browser.close();
  killVite();
}
writeFileSync(`${OUT}hud.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result));
process.exit(0);
