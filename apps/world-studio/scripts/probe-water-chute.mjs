// Chute attribution probe: at ONE fixed camera looking up the steep chute of
// cascade `fall-78`, capture the frame with every water layer drawing and then
// with each layer hidden in turn (`window.__STUDIO_WATER_LAYERS__`, the live
// twin of `?waterLayers=`), and difference them.
//
// Why: the water pass draws four things over the same ground — the province
// field grid, the compiled steep-reach strips, the cascade sheets and the
// particle stack. A screenshot of a wrong-looking chute cannot say which one
// owns the white edges, the see-through centre or the grey slab; only the
// per-layer difference can. No image is ever viewed: every number here comes
// from pixel statistics, and the ribbon's own pixel boxes are DERIVED from the
// water mask (all-layers minus no-layers), never eyeballed.
//
// Run from apps/combat-sandbox (owns the playwright dep):
//   node ../world-studio/scripts/probe-water-chute.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(studioDir, "artifacts");
mkdirSync(artifacts, { recursive: true });

const PORT = Number(process.env.WATER_PORT ?? 4323);
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;
const W = 960;
const H = 540;

/** The owner's chute camera (cascade fall-78, 42 m drop, terrain-following). */
const QUERY = "view=fly3d&cam=fly&x=1.827&z=2.093&alt=54&yaw=270&pitch=4&ex=1"
  + "&t=12:00&d=8-17&hud=0&lanes=0&markers=0&w=clear&wq=low&smsize=512";

/** The grey slab reported by the owner, in 960x540 pixels. */
const SLAB = { x0: 300, x1: 400, y0: 470, y1: 510 };

// The minimum attribution set: everything, nothing (the water mask that the
// ribbon boxes are derived from), and the two layers that can own a chute.
// WATER_FULL_SET=1 adds the falls/effects columns.
const CONFIGS = [
  { id: "all", spec: "field,strips,falls,effects" },
  { id: "none", spec: "none" },
  { id: "no-field", spec: "strips,falls,effects" },
  { id: "no-strips", spec: "field,falls,effects" },
  ...(process.env.WATER_FULL_SET === "1" ? [
    { id: "no-falls", spec: "field,strips,effects" },
    { id: "no-effects", spec: "field,strips,falls" },
  ] : []),
];

const reuse = process.env.WATER_REUSE_SERVER === "1";
const server = reuse ? null : spawn(
  "npx",
  ["vite", "preview", "--base", "/elder-souls-argonia/studio/", "--host", "127.0.0.1",
    "--port", String(PORT), "--strictPort"],
  { cwd: studioDir, detached: true, stdio: "ignore" },
);

async function waitFor(url) {
  for (let i = 0; i < 240; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`server never came up at ${url}`);
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** Achromatic whiteness: 1 = pure grey/white, 0 = fully saturated colour. */
const whiteness = (r, g, b) => Math.min(r, g, b) / Math.max(Math.max(r, g, b), 1);

function stats(px, boxPixels) {
  let l = 0, w = 0, n = 0;
  for (const i of boxPixels) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    l += lum(r, g, b); w += whiteness(r, g, b); n++;
  }
  return n ? { lum: l / n, white: w / n, n } : { lum: 0, white: 0, n: 0 };
}

/** Mean absolute RGB difference between two frames over a pixel set. */
function delta(a, b, boxPixels) {
  let d = 0, n = 0;
  for (const i of boxPixels) {
    d += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    n++;
  }
  return n ? d / n : 0;
}

const failures = [];
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };

let browser;
try {
  await waitFor(BASE);
  const { chromium } = await import("playwright");
  browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console: ${m.text().slice(0, 300)}`); });

  await page.goto(`${BASE}?${QUERY}`);
  await page.waitForFunction(
    () => window.__STUDIO_WATER_DEBUG__ && window.__STUDIO_WATER_DEBUG__.frames > 70,
    undefined, { timeout: 240_000 });
  await page.waitForTimeout(8_000);
  const dbg = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__);
  say(`tier ${dbg.tier} · strips ${JSON.stringify(dbg.strips)} · falls ${JSON.stringify(dbg.falls)}`);

  const frames = {};
  for (const c of CONFIGS) {
    await page.evaluate((s) => { window.__STUDIO_WATER_LAYERS__ = s; }, c.spec);
    await page.waitForTimeout(9_000); // software GL renders ~2 fps
    const buf = await page.screenshot({ path: path.join(artifacts, `chute-${c.id}.png`), timeout: 420_000 });
    frames[c.id] = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext("2d");
      g.drawImage(img, 0, 0);
      return Array.from(g.getImageData(0, 0, cv.width, cv.height).data);
    }, buf.toString("base64"));
    const live = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__?.layers);
    say(`captured ${c.id} (${c.spec}) · debug layers ${JSON.stringify(live)}`);
  }
  await page.evaluate(() => { window.__STUDIO_WATER_LAYERS__ = undefined; });

  const all = frames.all, none = frames.none;
  // ---- derive the ribbon boxes from the water mask, not from an eyeball ----
  const isWater = new Uint8Array(W * H);
  let waterCount = 0;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const d = Math.max(Math.abs(all[i] - none[i]), Math.abs(all[i + 1] - none[i + 1]),
      Math.abs(all[i + 2] - none[i + 2]));
    // A high threshold: at ~2 fps the animated frames differ by a few levels
    // everywhere, and a low cut turns that noise into a full-frame "mask".
    if (d > 60) { isWater[p] = 1; waterCount++; }
  }
  const centre = [], edges = [];
  let rows = 0;
  // The chute occupies a known band of the frame at this fixed camera; the
  // ribbon's own extent inside it is measured, never assumed.
  const BAND = { x0: 430, x1: 660, y0: 200, y1: 464 };
  for (let y = BAND.y0; y <= BAND.y1; y++) {
    let lo = -1, hi = -1, n = 0;
    for (let x = BAND.x0; x <= BAND.x1; x++) if (isWater[y * W + x]) { if (lo < 0) lo = x; hi = x; n++; }
    const run = hi - lo + 1;
    // A chute row: one narrow horizontal run of water.
    if (lo < 0 || n < 4 || run < 5 || run > 140) continue;
    rows++;
    const cLo = lo + Math.floor(run * 0.35), cHi = lo + Math.ceil(run * 0.65);
    const eW = Math.max(1, Math.round(run * 0.18));
    for (let x = cLo; x <= cHi; x++) centre.push((y * W + x) * 4);
    for (let x = lo; x < lo + eW; x++) edges.push((y * W + x) * 4);
    for (let x = hi - eW + 1; x <= hi; x++) edges.push((y * W + x) * 4);
  }
  say(`water pixels ${waterCount} · ribbon rows ${rows} · centre px ${centre.length} · edge px ${edges.length}`);
  if (rows < 20) failures.push(`ribbon not found (only ${rows} usable rows)`);

  const slab = [], around = [];
  for (let y = SLAB.y0 - 20; y <= SLAB.y1 + 20; y++) {
    for (let x = SLAB.x0 - 30; x <= SLAB.x1 + 30; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      const inside = x >= SLAB.x0 && x <= SLAB.x1 && y >= SLAB.y0 && y <= SLAB.y1;
      (inside ? slab : around).push(i);
    }
  }

  const boxes = { centre, edges, slab, around };
  say("\n== per-box stats (all layers) ==");
  const s = {};
  for (const [name, box] of Object.entries(boxes)) {
    s[name] = stats(all, box);
    say(`${name.padEnd(7)} lum ${s[name].lum.toFixed(1)} · whiteness ${s[name].white.toFixed(3)} · px ${s[name].n}`);
  }

  say("\n== ownership: mean RGB change when a layer is hidden ==");
  for (const [name, box] of Object.entries(boxes)) {
    const per = CONFIGS.filter((c) => c.id.startsWith("no-")).map((c) =>
      `${c.id.slice(3)} ${delta(all, frames[c.id], box).toFixed(1)}`);
    say(`${name.padEnd(7)} ${per.join(" · ")} (vs none ${delta(all, none, box).toFixed(1)})`);
  }

  say("\n== acceptance ==");
  const check = (ok, msg) => { say(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failures.push(msg); };
  check(s.centre.white > s.edges.white,
    `centre whiteness ${s.centre.white.toFixed(3)} > edge ${s.edges.white.toFixed(3)}`);
  check(s.centre.lum >= 0.8 * s.edges.lum,
    `centre luminance ${s.centre.lum.toFixed(1)} >= 0.8 x edge ${(0.8 * s.edges.lum).toFixed(1)}`);
  const slabRatio = Math.abs(s.slab.lum - s.around.lum) / Math.max(s.around.lum, 1e-6);
  check(slabRatio <= 0.15,
    `slab box luminance within 15% of surroundings (${(slabRatio * 100).toFixed(1)}%)`);
  check(pageErrors.length === 0, `no page/shader errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(" | ")}` : ""}`);
} catch (e) {
  failures.push(String(e));
  say(`crash: ${String(e)}`);
} finally {
  await browser?.close();
  if (server) { try { process.kill(-server.pid); } catch { /* already gone */ } }
}

writeFileSync(path.join(artifacts, "water-chute-result.txt"), lines.join("\n"));
process.exit(failures.length ? 1 : 0);
