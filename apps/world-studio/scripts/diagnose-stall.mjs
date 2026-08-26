// One-off: reproduce the round-1 render-loop stall (tarn-fly) and separate
// "browser RAF stopped" from "r3f loop stopped" from "our useFrame stopped".
// Run from apps/combat-sandbox: node ../world-studio/scripts/diagnose-stall.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4324;
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;
const Q = process.env.STALL_Q ?? "view=fly3d&cam=orbit&x=0.38&z=1.44&ex=1&t=12:00&d=8-17&wq=high";

const server = spawn(
  "npx",
  ["vite", "preview", "--base", "/elder-souls-argonia/studio/", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: studioDir, detached: true, stdio: "ignore" },
);

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no server");
}

const { chromium } = await import("playwright");
try {
  await waitFor(BASE);
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.log("CON", m.type(), m.text().slice(0, 200));
  });
  await page.goto(`${BASE}?${Q}&smsize=512`);
  await page.evaluate(() => {
    window.__RAF_COUNT__ = 0;
    const tick = () => {
      window.__RAF_COUNT__++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let s = 0; s < 24; s++) {
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => ({
      raf: window.__RAF_COUNT__,
      water: window.__STUDIO_WATER_DEBUG__?.frames ?? -1,
      skyExp: window.__STUDIO_SKY_DEBUG__?.exposure ?? -1,
      lost: window.__STUDIO_WATER_DEBUG__?.contextLost ?? false,
    }));
    console.log(`t=${(s + 1) * 1.5}s raf=${st.raf} waterFrames=${st.water} exp=${st.skyExp.toExponential?.(2) ?? st.skyExp} lost=${st.lost}`);
  }
  await browser.close();
} finally {
  try { process.kill(-server.pid); } catch { /* gone */ }
}
