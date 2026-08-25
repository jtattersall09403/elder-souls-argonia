// One-off Phase 8a light-defect diagnosis: opens CHARACTER view at three
// instants, dumps every light, the exposure, the terrain material patch state
// and the moon meshes. Run from apps/combat-sandbox (owns playwright):
//   node ../world-studio/scripts/diagnose-sky.mjs
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
  { id: "char-morning", q: "view=character&x=2.93&z=5.46&ex=1&t=10:00&d=6-17" },
  { id: "char-night", q: "view=character&x=2.94&z=5.46&ex=1&t=01:08&d=6-7" },
  { id: "char-dusk-moonrise", q: "view=character&x=2.93&z=5.46&ex=1&t=17:00&d=6-17" },
];

const server = spawn(
  "npx",
  ["vite", "preview", "--base", "/elder-souls-argonia/studio/", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: studioDir, detached: true, stdio: "ignore" },
);
async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server never came up at ${url}`);
}

const { chromium } = await import("playwright");
const report = [];
try {
  await waitFor(BASE);
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      pageErrors.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });

  for (const s of SCENARIOS) {
    await page.goto(`${BASE}?${s.q}&smsize=256`, { timeout: 180_000 });
    await page.waitForFunction(
      () => window.__STUDIO_SKY_DEBUG__ && window.__STUDIO_SKY_DEBUG__.envBakes >= 1,
      undefined, { timeout: 240_000 },
    );
    await page.waitForTimeout(8_000);
    const dump = await page.evaluate(() => {
      const scene = window.__SCENE__;
      const lights = [];
      const meshes = [];
      scene.traverse((o) => {
        if (o.isLight) {
          lights.push({
            type: o.type, intensity: o.intensity,
            color: o.color?.getHexString?.(),
            ground: o.groundColor?.getHexString?.(),
            castShadow: !!o.castShadow, visible: o.visible,
          });
        } else if (o.isMesh || o.isPoints) {
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          meshes.push({
            type: o.type,
            mat: m?.type,
            usesCsm: !!(m?.defines && "USE_CSM" in m.defines),
            cacheKey: typeof m?.customProgramCacheKey === "function" ? m.customProgramCacheKey() : null,
            visible: o.visible,
            name: o.name || m?.name || "",
            renderOrder: o.renderOrder,
          });
        }
      });
      const gd = window.__GROUND_DEBUG__ ? window.__GROUND_DEBUG__() : null;
      return {
        sky: window.__STUDIO_SKY_DEBUG__,
        groundDebug: gd,
        hasEnvironment: !!scene.environment,
        lights,
        meshCount: meshes.length,
        meshes: meshes.slice(0, 40),
      };
    });
    const shot = path.join(artifacts, `diag-${s.id}.png`);
    await page.screenshot({ path: shot, timeout: 240_000 });
    report.push(`## ${s.id}\nurl: ?${s.q}\n${JSON.stringify(dump, null, 1)}\nscreenshot: ${path.basename(shot)}\n`);
  }
  if (pageErrors.length) report.push(`## page errors/warnings\n${pageErrors.slice(0, 20).join("\n")}`);
  await browser.close();
} catch (e) {
  report.push(`## crash\n${String(e)}`);
} finally {
  try { process.kill(-server.pid); } catch { /* gone */ }
}
writeFileSync(path.join(artifacts, "diagnose-result.txt"), report.join("\n"));
console.log(report.join("\n").slice(0, 400));
