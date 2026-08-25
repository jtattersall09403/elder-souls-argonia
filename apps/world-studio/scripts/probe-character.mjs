import { mkdirSync } from "node:fs";
mkdirSync(new URL("../artifacts/", import.meta.url).pathname, { recursive: true });
// Headless probe: does the studio's character mode boot on the real chunks,
// does the character land on the ground, and does it walk? Run from
// apps/combat-sandbox (playwright dep): node ../world-studio/scripts/probe-character.mjs
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;
const studioDir = new URL("../", import.meta.url).pathname;

const server = spawn("npx", [
  "vite", "preview", "--base", "/elder-souls-argonia/studio/",
  "--host", "127.0.0.1", "--port", String(PORT), "--strictPort",
], { cwd: studioDir, stdio: ["ignore", "pipe", "pipe"], detached: true });
let serverLog = "";
server.stdout.on("data", (c) => { serverLog += c; });
server.stderr.on("data", (c) => { serverLog += c; });

const waitFor = async (url, ms = 20000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server never came up\n${serverLog}`);
};

try {
  await waitFor(BASE);
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));

  // Spawn near Helstrom-ish mid-province on land.
  // Same relative spot as the Phase 7 probe point, at the x1 map scale
  // (10.40/8.40 km on the old 22 km map -> 3.47/2.80 km on 7.37 km, 0015).
  await page.goto(`${BASE}?view=character&x=3.47&z=2.80`, { waitUntil: "domcontentloaded" });

  // Wait for the HUD to report a chunk (terrain + physics + rig all up).
  await page.waitForFunction(
    () => document.body.innerText.includes("chunk "),
    undefined,
    { timeout: 90000 },
  );
  await page.waitForTimeout(8000); // let the character settle onto the ground
  const hudBefore = await page.evaluate(() =>
    [...document.querySelectorAll("span")].map((s) => s.innerText).find((t) => t.includes("chunk")) ?? "");

  // Walk forward (W). Long window: software-GL probes render at ~2-6 fps and
  // the physics delta clamps at 1/30 s per frame, so wall seconds != sim seconds.
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(25000);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(700);
  const hudAfter = await page.evaluate(() =>
    [...document.querySelectorAll("span")].map((s) => s.innerText).find((t) => t.includes("chunk")) ?? "");

  // Sprint (hold Space) + jump (J).
  await page.keyboard.down("Space");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(15000);
  const hudSprint = await page.evaluate(() =>
    [...document.querySelectorAll("span")].map((s) => s.innerText).find((t) => t.includes("chunk")) ?? "");
  await page.keyboard.up("Space");
  await page.keyboard.up("KeyW");

  await page.screenshot({ path: new URL("../artifacts/character-mode-probe.png", import.meta.url).pathname });
  await browser.close();

  const parse = (t) => {
    const m = t.match(/([\d.]+) km E · ([\d.]+) km S · alt ([-\d.]+) m.*?· (airborne|([\d.]+) m\/s)/);
    return m ? { x: +m[1], z: +m[2], alt: +m[3], speed: m[5] ? +m[5] : null, raw: t } : { raw: t };
  };
  const before = parse(hudBefore);
  const after = parse(hudAfter);
  const sprint = parse(hudSprint);
  console.log("BEFORE:", hudBefore);
  console.log("AFTER :", hudAfter);
  console.log("SPRINT:", hudSprint);

  const moved = Math.hypot((after.x - before.x) * 1000, (after.z - before.z) * 1000);
  const failures = [];
  if (!hudBefore) failures.push("HUD never reported");
  if (before.alt !== undefined && (before.alt < -50 || before.alt > 700)) failures.push(`implausible settle altitude ${before.alt}`);
  if (moved < 3) failures.push(`character barely moved: ${moved.toFixed(1)} m of walking`);
  if (moved > 130) failures.push(`character moved too far: ${moved.toFixed(1)} m (walk is 4.5 m/s, window 25 s)`);
  if (sprint.speed !== null && sprint.speed > 6.5) failures.push(`sprint speed ${sprint.speed} m/s exceeds tuning`);
  const fatal = errors.filter((e) => !e.includes("favicon"));
  if (fatal.length) failures.push(...fatal.slice(0, 6));
  const verdict = failures.length ? `FAIL\n${failures.join("\n")}` : `PASS (walked ${moved.toFixed(1)} m; sprint ${sprint.speed ?? "?"} m/s)`;
  console.log(verdict);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(new URL("../artifacts/probe-result.txt", import.meta.url).pathname,
    `${verdict}\nBEFORE: ${hudBefore}\nAFTER : ${hudAfter}\nSPRINT: ${hudSprint}\n`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill(); }
  setTimeout(() => process.exit(process.exitCode ?? 0), 1500).unref();
}
