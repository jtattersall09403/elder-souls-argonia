// Screenshot the interactive blueprint view (Phase 11 Part 7 Round A) so an
// agent can sanity-check legibility without the owner. Usage:
//   node scripts/probe-blueprints.mjs [slug] [zoomClicks]
// Writes artifacts/blueprint-<slug>.png. Needs `npm run build` first (vite preview).
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const slug = process.argv[2] ?? "nine-trunks";
const zoomClicks = Number(process.argv[3] ?? 0);
const out = new URL("../artifacts/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const PORT = 4323;
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;
const studioDir = new URL("../", import.meta.url).pathname;
const server = spawn("npx", ["vite", "preview", "--base", "/elder-souls-argonia/studio/", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: studioDir, stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = "";
server.stdout.on("data", (c) => { log += c; });
server.stderr.on("data", (c) => { log += c; });
const waitFor = async (url, ms = 30000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server never came up\n${log}`);
};
try {
  await waitFor(BASE);
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto(`${BASE}?bp=1&blueprint=${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  for (let i = 0; i < zoomClicks; i++) { await page.keyboard.press("+"); await page.waitForTimeout(150); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}blueprint-${slug}.png` });
  console.log(`wrote artifacts/blueprint-${slug}.png; page errors: ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log("  " + e);
  await browser.close();
} finally {
  try { process.kill(-server.pid); } catch { /* already gone */ }
}
