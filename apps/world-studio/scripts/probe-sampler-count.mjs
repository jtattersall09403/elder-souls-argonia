// Measurement only (2026-09-20): how many texture samplers does each live
// material's compiled program actually bind? Counts, per material in the
// character-mode scene, the sampler uniforms its COMPILED program binds, and
// compares the worst case against the driver's MAX_TEXTURE_IMAGE_UNITS.
//
// Finding, 2026-09-20: sampler pressure is NOT the cause of the studio's
// "THREE.WebGLRenderer: Context Lost". The census peaked at 16 of 32 units.
// The context loss was the canvas UNMOUNTING after a throw inside the R3F
// tree — a rig GLB that 404'd into the SPA fallback because this probe ran
// the dev server under a non-root `--base` the asset middleware ignored.
// The probe now uses the same base as `npm run dev` (root), via the shared
// helper in dev-server.mjs.
//
// Run from apps/combat-sandbox (that workspace holds the playwright dep):
//   node ../world-studio/scripts/probe-sampler-count.mjs
import { chromium } from "playwright";
import { startStudioDevServer } from "./dev-server.mjs";

const server = await startStudioDevServer();
const BASE = server.url;

try {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.error(`pageerror: ${e.message}`));

  await page.goto(`${BASE}?view=character&x=3.47&z=2.80`, { waitUntil: "domcontentloaded" });
  // Wait for the renderer, not the HUD: the character rig is not required for
  // a sampler census, and a missing rig asset must not fail the measurement.
  await page.waitForFunction(() => !!document.querySelector("canvas"),
    undefined, { timeout: 60000 });
  await page.waitForTimeout(Number(process.env.ES_PROBE_SOAK_MS ?? 45000));

  const report = await page.evaluate(() => {
    // Dev-only debug handles set by WorldSky (owner 2026-09-20); the canvas
    // r3f store is the fallback for a build that lacks them.
    const canvas = document.querySelector("canvas");
    const r3f = canvas?.__r3f;
    const root = r3f?.root ?? r3f?.store;
    const state = typeof root?.getState === "function" ? root.getState() : null;
    const renderer = window.__RENDERER__ ?? state?.gl;
    const scene = window.__SCENE__ ?? state?.scene;
    if (!renderer || !scene) return { error: "no r3f renderer/scene handle" };
    const gl = renderer.getContext();
    if (!gl || gl.isContextLost?.()) {
      return { error: `WebGL context lost before the census (isContextLost=${gl?.isContextLost?.()})` };
    }
    const SAMPLERS = new Set([
      gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW,
      gl.SAMPLER_2D_ARRAY, gl.SAMPLER_3D,
    ].filter((v) => v !== undefined));

    const rows = [];
    const seen = new Set();
    scene.traverse((obj) => {
      const mats = Array.isArray(obj.material) ? obj.material
        : obj.material ? [obj.material] : [];
      for (const mat of mats) {
        if (!mat || seen.has(mat.uuid)) continue;
        seen.add(mat.uuid);
        const props = renderer.properties.get(mat);
        const program = props?.currentProgram;
        const handle = program?.program;
        if (!handle) continue;
        const n = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
        let count = 0;
        for (let i = 0; i < n; i++) {
          const info = gl.getActiveUniform(handle, i);
          if (info && SAMPLERS.has(info.type)) count += info.size;
        }
        rows.push({
          label: `${mat.name || "(unnamed)"}/${mat.type}`,
          count,
        });
      }
    });
    rows.sort((a, b) => b.count - a.count);
    return {
      rows,
      materials: rows.length,
      maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      maxCombined: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    };
  });

  await browser.close();
  if (report.error) {
    console.log(`FAIL ${report.error}`);
  } else {
    console.log(`MAX_TEXTURE_IMAGE_UNITS = ${report.maxTextureImageUnits}`);
    console.log(`MAX_COMBINED_TEXTURE_IMAGE_UNITS = ${report.maxCombined}`);
    console.log(`materials with a compiled program: ${report.materials}`);
    for (const row of report.rows.slice(0, 15)) {
      console.log(`${row.label}: ${row.count}`);
    }
  }
} finally {
  server.stop();
}
