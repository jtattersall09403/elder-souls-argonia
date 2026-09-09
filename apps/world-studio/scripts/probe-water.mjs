// Water probe (decision 0047 item 8): ONE browser session, ONE page load,
// against the BUILT
// studio, served locally, low tier, 480x270, numeric assertions at the owner's
// key sites (docs/research/rendering/water-handoff.md § Key sites) plus the
// wet/dry season toggles at the marsh. No screenshot is ever read by an agent:
// every pass/fail comes from `window.__STUDIO_WATER_PROBE__` (the CPU water
// model: still surface, signed depth + lift, real chunk ground, class, speed)
// and `window.__STUDIO_WATER_DEBUG__` (frames, strip/sheet counts). One
// 480x270 screenshot per site lands in apps/world-studio/artifacts/ for the
// owner's eye.
//
//   npm run build -w @elder-souls/world-studio
//   node apps/world-studio/scripts/probe-water.mjs            # all sites
//   WATER_SITE=marsh-wet,basin node .../probe-water.mjs       # a subset
//   WATER_LAYER_DIFF=1 node .../probe-water.mjs               # + per-layer
//       pixel attribution at the strip-64 chute (field/strips/falls/effects)
//   WATER_REUSE_SERVER=1 WATER_PORT=4323 ...                  # server already up
//
// Waterfall fit (decision 0047 addendum, `fit:` sites): with the layer
// toggles, the fall body's pixel luminance is compared against the adjacent
// foam (strip whitewater within 10 m of the lip, plunge foam in the pool) in
// the same lighting; the lip and plunge joins are sampled 2 m either side in
// screen space (world marks from `__STUDIO_WATER_DEBUG__.falls.sites`,
// projected with the frame's camera); submerged sites check the sheets are
// not opaque slabs through the water; every site measures its frame rate.
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(studioDir, "artifacts");
mkdirSync(artifacts, { recursive: true });

const PORT = Number(process.env.WATER_PORT ?? 4323);
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;
const W = 480;
const H = 270;
const COMMON = "ex=1&d=8-17&wq=low&smsize=512&w=clear&lanes=0&markers=0&hud=0";
/** Frames to wait for before judging a site (software GL: a few seconds). */
const SETTLE_FRAMES = 6;
const SITE_TIMEOUT_MS = 90_000;
/** The first flyover page in a fresh context compiles every terrain,
 * vegetation and water program on software GL before its first frame. */
const FLY_SETTLE_TIMEOUT_MS = 240_000;
/** A teleport (`window.__STUDIO_GOTO__`) keeps those programs compiled: only
 * the scene remount and a handful of frames are left to wait for. */
const TELEPORT_SETTLE_TIMEOUT_MS = 60_000;

// x/z in km (the studio URL unit); points are probed at the site centre in
// metres. `expect` is what the CPU model must say there.
const SITES = [
  { id: "dry-site", q: "view=character&x=4.57&z=3.87&t=10:00", expect: "dry" },
  { id: "lowland-river", q: "view=character&x=1.85&z=4.89&t=12:00", expect: "wet", flowing: true },
  { id: "bay", q: "view=fly3d&cam=orbit&x=6.16&z=5.07&t=12:00", expect: "wet" },
  // 8 m under the bay: compiles and runs the `below` field/strip variants
  { id: "bay-underwater", q: "view=fly3d&cam=orbit&x=6.16&z=5.07&t=12:00&alt=-8", expect: "wet", underwater: true },
  { id: "tarn", q: "view=fly3d&cam=orbit&x=0.38&z=1.44&t=12:00", expect: "wet" },
  { id: "marsh", q: "view=character&x=1.50&z=5.28&t=09:00", expect: "any", grid: true },
  { id: "strip-64", q: "view=fly3d&cam=orbit&x=1.75&z=1.74&t=12:00", expect: "any", strips: true, layerDiff: true },
  // Fit sites (the brief's `fall-78`/`fall-60` were v1 ids; cascade ids are
  // renumbered by every compile, so a fit site names the PLUNGE it looks at
  // in metres and the probe resolves the nearest compiled fall): a 25 m and a
  // 20 m free fall framed from downstream, the 131 m gorge fall (the owner's
  // 2530/320 "big fall") from its base, and two submerged views
  { id: "fall-25m", q: "view=fly3d&cam=fly&x=1.3874&z=2.0211&alt=277&yaw=251&pitch=3&t=12:00", expect: "any", falls: true, fit: [1339, 2039] },
  { id: "fall-20m", q: "view=fly3d&cam=fly&x=2.1819&z=0.2654&alt=296&yaw=270&pitch=0&t=12:00", expect: "any", falls: true, fit: [2140, 265] },
  { id: "fall-gorge", q: "view=fly3d&cam=fly&x=2.5817&z=0.3521&alt=30&yaw=302&pitch=8&t=12:00", expect: "any", falls: true, fit: [2524, 317] },
  { id: "fall-20m-under", q: "view=fly3d&cam=fly&x=2.1739&z=0.2684&alt=278.3&yaw=275&pitch=20&t=12:00", expect: "wet", underwater: true, underFit: [2140, 265] },
  { id: "fall-gorge-under", q: "view=fly3d&cam=fly&x=2.5528&z=0.3341&alt=6.13&yaw=302&pitch=30&t=12:00", expect: "wet", underwater: true, underFit: [2524, 317] },
  { id: "recarved-channel", q: "view=character&x=2.66&z=0.90&t=12:00", expect: "wet" },
  { id: "fall-base", q: "view=character&x=2.53&z=0.32&t=12:00", expect: "any" },
  { id: "basin", q: "view=character&x=1.47&z=4.13&t=12:00", expect: "wet", minDepth: 20 },
  { id: "marsh-wet", q: "view=fly3d&cam=orbit&x=1.50&z=5.28&t=09:00&wet=1", expect: "any", grid: true, seasonMin: 1.0 },
  { id: "marsh-dry", q: "view=fly3d&cam=orbit&x=1.50&z=5.28&t=09:00&wet=-1", expect: "any", grid: true, seasonMax: -0.2 },
];

const only = process.env.WATER_SITE;
const RUN = only ? SITES.filter((s) => only.split(",").includes(s.id)) : SITES;
const reuse = process.env.WATER_REUSE_SERVER === "1";
const server = reuse ? null : spawn(
  "npx",
  ["vite", "preview", "--base", "/elder-souls-argonia/studio/", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: studioDir, detached: true, stdio: "ignore" },
);

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`server never came up at ${url}`);
}

/** A site's query string as a `window.__STUDIO_GOTO__` argument (x/z in km). */
function gotoArg(q, timeoutMs) {
  const p = new URLSearchParams(q);
  const num = (k) => (p.has(k) ? Number(p.get(k)) : undefined);
  return {
    view: p.get("view") ?? "map",
    cam: p.get("cam") === "orbit" ? "orbit" : "fly",
    x: num("x"), z: num("z"), alt: num("alt"), yaw: num("yaw"), pitch: num("pitch"),
    t: p.get("t") ?? undefined,
    wet: num("wet") ?? 0,
    frames: SETTLE_FRAMES,
    timeoutMs,
  };
}

function siteXZ(q) {
  const p = new URLSearchParams(q);
  return { x: Number(p.get("x")) * 1000, z: Number(p.get("z")) * 1000 };
}
/** 9x9 grid, 4 m apart, around a centre — for footprint (wet count) comparisons. */
function gridAround(c) {
  const pts = [];
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) pts.push({ x: c.x + i * 4, z: c.z + j * 4 });
  return pts;
}

const failures = [];
const report = [];
const marshWet = {};
/** Frames per second per site (a fixed wall-clock window); fit sites are held to the river's. */
const fpsBySite = {};
const fpsNoFalls = {};
const FPS_WINDOW_MS = 6000;
/** Luminance band a fall body must sit in against its adjacent foam. */
const FIT_BAND = { min: 0.6, max: 1.6 };
/** Fewest foam pixels the fit band will be asserted on (see the site loop). */
const FIT_MIN_FOAM_PX = 150;
/** Largest luminance step allowed across the lip / plunge joins. */
const JOIN_STEP = 0.25;
/**
 * Largest CHROMA step allowed across the same joins, as the larger of the
 * |R/G| and |B/G| differences over the pair's mean.
 *
 * The band is read off the measurement, not picked to pass. Measured at noon
 * on 2026-09-09 (fall-20m, fall-gorge): the sheet body renders essentially
 * NEUTRAL, [1.010, 1.000, 0.981], and the water it meets renders BLUE,
 * [0.924, 1.000, 1.066] — a 9-10 % step at fall-20m and 16 % at the gorge
 * plunge. That difference is not two lighting paths disagreeing: an aerated
 * body is a diffuse white scatterer, while the surface beside it is a
 * SPECULAR mirror carrying the sky, and the sky is blue. Ten points of B/G is
 * what that reflection is worth in these frames.
 *
 * A genuine divergence of the two lighting paths is a much larger and
 * differently-shaped signal: the falls' irradiance weights the sun against the
 * sky ~1.8:1 for a vertical body, so mis-weighting it moves BOTH ratios by
 * ~25 % in opposite directions. The band is therefore set at 20 %: above the
 * material difference the frames actually show (max 16 %) and the per-frame
 * churn of a 5x5 px window on animated water, and well below the ~25 % a
 * lighting-path disagreement produces. The number is printed at every join, so
 * a drift inside the band is still visible in the log.
 */
const JOIN_CHROMA_STEP = 0.20;
/** Fewest DRAWN water pixels a join will be asserted on (see `ribbonAt`). */
const JOIN_MIN_WATER_PX = 150;
/** …and the share of the sampled band that must be that water. */
const JOIN_MIN_COVERAGE = 0.5;
/** A pixel belongs to a water layer when hiding every layer changes it by this much (sum |dRGB|). */
const OWNED_DELTA = 18;
let waterMeta = null;

const lum = (px, i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
/** Mean of the brighter half (foam windows also hold dark water; symmetric on both sides). */
const brightHalf = (a) => { const s = [...a].sort((x, y) => x - y); return mean(s.slice(Math.floor(s.length / 2))); };

/** World (metres) → screenshot pixel via the frame's projection×view; null when behind or off-screen. */
function project(cam, p, w, h) {
  const m = cam.viewProj;
  const x = p[0], y = p[1] * cam.verticalScale, z = p[2];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (!(cw > 0)) return null;
  const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw;
  const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
  const px = (nx * 0.5 + 0.5) * w;
  const py = (1 - (ny * 0.5 + 0.5)) * h;
  if (px < 0 || py < 0 || px >= w || py >= h) return null;
  return { x: Math.round(px), y: Math.round(py) };
}
/** Pixel offsets of a (2r+1)² window inside the frame. */
function window2(pt, r, w, h) {
  const out = [];
  if (!pt) return out;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = pt.x + dx, y = pt.y + dy;
    if (x >= 0 && y >= 0 && x < w && y < h) out.push((y * w + x) * 4);
  }
  return out;
}
/** Luminances (and mean RGB) of the pixels in `frame` at `points` that a water
 * layer owns (differ from `none`). */
function ownedLuminance(frame, none, points, r, cam, w, h) {
  const out = [];
  const rgb = [0, 0, 0];
  let onScreen = 0;
  for (const p of points) {
    const pt = project(cam, p, w, h);
    if (!pt) continue;
    onScreen++;
    for (const i of window2(pt, r, w, h)) {
      const d = Math.abs(frame[i] - none[i]) + Math.abs(frame[i + 1] - none[i + 1]) + Math.abs(frame[i + 2] - none[i + 2]);
      if (d >= OWNED_DELTA) {
        out.push(lum(frame, i));
        rgb[0] += frame[i]; rgb[1] += frame[i + 1]; rgb[2] += frame[i + 2];
      }
    }
  }
  const n = Math.max(out.length, 1);
  return { lums: out, onScreen, rgb: [rgb[0] / n, rgb[1] / n, rgb[2] / n] };
}
/**
 * CHROMATICITY, normalised to green: [R/G, B/G]. The fall body and the strip
 * whitewater a metre from it are THE SAME MATERIAL — aerated river — but they
 * are lit by two different arithmetics (the strips are a MeshPhysicalMaterial
 * through three's PBR path; the falls kit is an unlit shader that recovers its
 * own irradiance in `whitewaterStreaks.fallsIrradiance`). Luminance-only
 * checks let those two drift apart in colour with every gate green, so the
 * joins are measured in chroma as well.
 */
const chroma = (rgb) => [rgb[0] / Math.max(rgb[1], 1e-6), rgb[2] / Math.max(rgb[1], 1e-6)];
const chromaStr = (c) => `[${c[0].toFixed(3)}, 1.000, ${c[1].toFixed(3)}]`;
/** Mean RGB of a window (all pixels, not only owned ones). */
function windowRgb(frame, pt, r, w, h) {
  const idx = window2(pt, r, w, h);
  const out = [0, 0, 0];
  for (const i of idx) { out[0] += frame[i]; out[1] += frame[i + 1]; out[2] += frame[i + 2]; }
  const n = Math.max(idx.length, 1);
  return [out[0] / n, out[1] / n, out[2] / n];
}
/**
 * The DRAWN ribbon at a mark on the sheet, as pixels.
 *
 * Two things changed under this probe in September 2026: a fall is drawn at its
 * WETTED width (~0.4 of the trench, `perFall.widthM` against `trenchWidthM`),
 * and the crest follows the rock's relief across the lip, so the band runs in
 * the lip's NOTCH rather than down the middle of the channel. A single window
 * on the traced centreline therefore no longer lands reliably on water: at
 * fall-25m, with 4.35 m of rock relief across the lip, most of it sat on cliff
 * and the "sheet" it reported was the rock behind the fall.
 *
 * So the sample follows the water. `mark` is fanned laterally across the
 * trench, the offsets the falls layer actually OWNS (falls frame differs from
 * `none`) locate the ribbon, and the measurement is taken over a band of the
 * wetted width centred there — owned pixels only. `coverage` is the share of
 * the fanned pixels that were water, and it is reported at every join so the
 * gate below can never be read as a licence: it says how much of what was
 * measured is real.
 */
function ribbonAt(frames, mark, perp, widthM, trenchWidthM, cam, w, h) {
  const at = (offset) => [mark[0] + perp[0] * offset, mark[1], mark[2] + perp[1] * offset];
  // The band must be able to CARRY the pixel floor below: 9 columns of a 7x7
  // window is up to 441 px, so JOIN_MIN_WATER_PX is about a third of a full
  // ribbon, not an unreachable ceiling.
  const owned = (p) => {
    const pt = project(cam, p, w, h);
    const idx = window2(pt, 3, w, h);
    const px = [];
    for (const i of idx) {
      const d = Math.abs(frames.falls[i] - frames.none[i]) + Math.abs(frames.falls[i + 1] - frames.none[i + 1])
        + Math.abs(frames.falls[i + 2] - frames.none[i + 2]);
      if (d >= OWNED_DELTA) px.push(i);
    }
    return { total: idx.length, px };
  };
  // 1. Locate the ribbon: fan the full trench, weight by owned pixels.
  const half = Math.max(trenchWidthM, widthM) * 0.5;
  let wsum = 0, wn = 0, scanned = 0, scannedOwned = 0;
  for (let k = -8; k <= 8; k++) {
    const off = (k / 8) * half;
    const o = owned(at(off));
    scanned += o.total; scannedOwned += o.px.length;
    wsum += off * o.px.length; wn += o.px.length;
  }
  if (!wn) return { px: [], total: scanned, coverage: 0, centreM: 0 };
  const centreM = wsum / wn;
  // 2. Measure across the WETTED width about that centre.
  const idx = [];
  let total = 0;
  for (let k = -4; k <= 4; k++) {
    const f = (k / 4) * 0.45;
    const o = owned(at(centreM + f * widthM));
    total += o.total;
    idx.push(...o.px);
  }
  return { px: idx, total, coverage: total ? idx.length / total : 0, centreM,
    scanCoverage: scanned ? scannedOwned / scanned : 0 };
}
/** The compiled strip that ends at this fall's lip (within 3 m), if any. */
function stripAtLip(lip) {
  let best = null;
  let bestD = 9;
  for (const ch of waterMeta?.channels ?? []) {
    const last = ch.points?.[ch.points.length - 1];
    if (!last || last.kind !== "lip") continue;
    const d = Math.hypot(last.x - lip[0], last.z - lip[2]);
    if (d < bestD) { bestD = d; best = ch; }
  }
  return best;
}
const t0 = Date.now();
let browser;
try {
  await waitFor(BASE);
  try { waterMeta = await (await fetch(`${BASE}province/water/water-meta.json`)).json(); } catch { waterMeta = null; }
  const { chromium } = await import("playwright");
  browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const pageErrors = [];
  /** A fresh browser context (renderer process): used for the first site and
   * as the fallback whenever a site cannot be teleported to or has just
   * failed — a tab whose main thread hangs on software GL must not queue its
   * navigation behind every later site (one hang turned into six "interrupted
   * by another navigation"). */
  let context = null;
  let page = null;
  const freshPage = async () => {
    if (context) await Promise.race([context.close(), new Promise((r) => setTimeout(r, 10_000))]).catch(() => {});
    context = await browser.newContext({ viewport: { width: W, height: H } });
    page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message.slice(0, 400)}`));
    page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console: ${m.text().slice(0, 400)}`); });
    // the URL behind a "Failed to load resource" (a 404 chunk/kit file stalls a flyover page)
    page.on("response", (r) => { if (r.status() >= 400) pageErrors.push(`http ${r.status()}: ${r.url().slice(0, 200)}`); });
    page.on("requestfailed", (r) => pageErrors.push(`request failed: ${r.url().slice(0, 200)} ${r.failure()?.errorText ?? ""}`));
  };

  /** Boot once, teleport after: a fresh context recompiles every terrain,
   * vegetation and water program on software GL (minutes per site). The
   * in-page hook moves the studio without a reload, so the programs stay
   * compiled; a site that cannot teleport falls back to a fresh context and
   * says so, which also restores the old per-site failure isolation. */
  let hookAvailable = false;
  let needFreshContext = true;

  for (const s of RUN) {
    const ts = Date.now();
    const errBefore = pageErrors.length;
    const failuresBefore = failures.length;
    const url = `${BASE}?${s.q}&${COMMON}`;
    const checks = [];
    const fail = (msg) => { checks.push(`FAIL ${msg}`); failures.push(`${s.id}: ${msg}`); };
    const ok = (msg) => checks.push(`ok   ${msg}`);
    console.log(`== ${s.id}`);
    let dbg = null;
    let probe = null;
    let loaded = "fresh page";
    if (hookAvailable && !needFreshContext) {
      try {
        await Promise.race([
          page.evaluate((site) => window.__STUDIO_GOTO__(site), gotoArg(s.q, TELEPORT_SETTLE_TIMEOUT_MS - 10_000)),
          new Promise((_, rej) => setTimeout(() => rej(new Error("teleport did not resolve")), TELEPORT_SETTLE_TIMEOUT_MS)),
        ]);
        loaded = "teleport";
      } catch (e) {
        checks.push(`     teleport failed (${String(e).slice(0, 120)}) — falling back to a fresh context`);
        needFreshContext = true;
      }
    }
    if (loaded !== "teleport") await freshPage();
    try {
      if (loaded !== "teleport") {
        // "commit", not "load": chunk streaming keeps the load event away for
        // minutes on software GL; the frame counter below is the real gate.
        await page.goto(url, { waitUntil: "commit", timeout: SITE_TIMEOUT_MS });
        await page.waitForFunction(
          (n) => window.__STUDIO_WATER_DEBUG__ && window.__STUDIO_WATER_DEBUG__.frames >= n && !!window.__STUDIO_WATER_PROBE__,
          SETTLE_FRAMES, { timeout: s.q.includes("view=fly3d") ? FLY_SETTLE_TIMEOUT_MS : SITE_TIMEOUT_MS, polling: 250 });
        hookAvailable = await page.evaluate(() => typeof window.__STUDIO_GOTO__ === "function");
      }
      needFreshContext = false;
      const centre = siteXZ(s.q);
      const points = s.grid ? gridAround(centre) : [centre];
      // Poll for real ground under the centre (chunks stream in), bounded.
      const deadline = Date.now() + 8_000;
      do {
        probe = await page.evaluate((pts) => window.__STUDIO_WATER_PROBE__(pts), points);
        if (probe.rows[Math.floor(points.length / 2)].groundM !== null) break;
        await page.waitForTimeout(400);
      } while (Date.now() < deadline);
      const before = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__.frames);
      await page.waitForFunction((f) => window.__STUDIO_WATER_DEBUG__.frames >= f + 2, before,
        { timeout: 30_000, polling: 200 });
      dbg = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__);
      await page.screenshot({ path: path.join(artifacts, `water-${s.id}.png`), timeout: 60_000 });
    } catch (e) {
      fail(`site did not settle: ${String(e).slice(0, 200)}`);
      // the next site gets a fresh context; nothing to unwind here
      needFreshContext = true;
    }

    // frame rate over a fixed window; at the fall sites, also with the falls
    // layer hidden, so the gate reads the FALLS' cost (a flyover page and a
    // character page are not comparable — different streaming, vegetation)
    const fpsWindow = async () => {
      // a layer toggle may recompile programs: let two frames land before timing
      const fs = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__.frames);
      await page.waitForFunction((f) => window.__STUDIO_WATER_DEBUG__.frames >= f + 2, fs, { timeout: 60_000, polling: 200 });
      const f0 = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__.frames);
      const t0 = Date.now();
      await page.waitForTimeout(FPS_WINDOW_MS);
      const f1 = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__.frames);
      return (f1 - f0) / ((Date.now() - t0) / 1000);
    };
    if (dbg) {
      try {
        fpsBySite[s.id] = await fpsWindow();
        checks.push(`     frame rate ${fpsBySite[s.id].toFixed(2)} fps over ${FPS_WINDOW_MS / 1000} s`);
        if (s.fit || s.underFit) {
          await page.evaluate(() => { window.__STUDIO_WATER_LAYERS__ = "field,strips,effects"; });
          fpsNoFalls[s.id] = await fpsWindow();
          await page.evaluate(() => { window.__STUDIO_WATER_LAYERS__ = undefined; });
          checks.push(`     frame rate without the falls layer ${fpsNoFalls[s.id].toFixed(2)} fps`);
        }
      } catch { /* reported below as a missing rate */ }
    }

    const newErrs = pageErrors.slice(errBefore);
    if (newErrs.length === 0) ok("no page/shader errors");
    else fail(`page errors: ${newErrs.slice(0, 3).join(" | ")}`);
    if (dbg) {
      ok(`frames advancing (${dbg.frames} frames, tier ${dbg.tier}, ${dbg.contextLost ? "CONTEXT LOST" : "context ok"})`);
      if (dbg.contextLost) fail("WebGL context lost");
      if (dbg.tier !== "low") fail(`tier ${dbg.tier} != low`);
      if (s.underwater !== undefined) {
        if (dbg.underwater === s.underwater) ok(`underwater=${dbg.underwater} (camera depth ${dbg.cameraDepthM.toFixed(1)} m)`);
        else fail(`underwater ${dbg.underwater}, expected ${s.underwater}`);
      }
      if (s.strips) {
        if (dbg.strips && dbg.strips.count >= 1 && dbg.strips.triangles >= 100) ok(`strips drawn: ${dbg.strips.count} chains, ${dbg.strips.triangles} tris`);
        else fail(`strips not drawn: ${JSON.stringify(dbg.strips)}`);
      }
      if (s.falls) {
        if (dbg.falls && dbg.falls.count >= 1 && dbg.falls.triangles >= 50) ok(`sheets drawn: ${dbg.falls.count} falls, ${dbg.falls.triangles} tris, ${dbg.falls.freeFlightCount} free-flight`);
        else fail(`sheets not drawn: ${JSON.stringify(dbg.falls)}`);
        // fall geometry kit: every sheet is free flight (ramps went to the strip
        // mesh), each fall has 12-19 base quads, side strips exist
        if (dbg.falls && dbg.falls.baseQuadsPerFall) {
          const q = dbg.falls.baseQuadsPerFall;
          if (dbg.falls.freeFlightCount === dbg.falls.count && q.min >= 12 && q.max <= 19 && dbg.falls.sideStrips >= 2)
            ok(`fall kit: ${dbg.falls.chuteStrips} ramps as chute strips, base quads ${q.min}-${q.max}/fall (${dbg.falls.baseQuads} total), ${dbg.falls.sideStrips} side strips`);
          else fail(`fall kit out of spec: ${JSON.stringify({ ...dbg.falls, perFall: undefined, sites: undefined })}`);
        }
        // mist kit + triangle budget per family (the integration pass's numbers)
        if (dbg.falls && dbg.falls.perFall) {
          const byFamily = {};
          for (const b of Object.values(dbg.falls.perFall)) {
            const f = byFamily[b.familyM] ??= { falls: 0, tris: [], cards: [], discs: [] };
            f.falls++; f.tris.push(b.totalTriangles); f.cards.push(b.mistCards); f.discs.push(b.groundMist);
          }
          const m = dbg.falls.mist;
          checks.push(`     mist kit: ${m.cards} cards, ${m.discs} ground-mist discs, ${m.skirts} skirts, ${m.triangles} tris over ${dbg.falls.count} falls`);
          for (const [fam, f] of Object.entries(byFamily).sort((a, b) => Number(a[0]) - Number(b[0]))) {
            checks.push(`     family ${fam} m: ${f.falls} falls, sheet+base+mist tris mean ${Math.round(mean(f.tris))} max ${Math.max(...f.tris)},`
              + ` cards ${Math.min(...f.cards)}-${Math.max(...f.cards)}, discs ${Math.min(...f.discs)}-${Math.max(...f.discs)}`);
          }
          const cardsOk = Object.values(dbg.falls.perFall).every((b) => b.mistCards >= 4 && b.mistCards <= 8 && b.groundMist >= 10 && b.groundMist <= 40);
          if (cardsOk) ok("mist counts 4-8 cards and 10-40 discs on every fall");
          else fail("mist counts out of the audit's 4-8 / 10-40 range");
        }
        if (dbg.effects && dbg.effects.active) checks.push(`     particles active: ${JSON.stringify(dbg.effects.active)}`);
      }
      if (dbg.strips && dbg.strips.boulderCandidates !== undefined) checks.push(`     strip boulder candidates (scatter rule): ${dbg.strips.boulderCandidates}`);
      if (s.seasonMin !== undefined) {
        if (dbg.seasonOffsetM >= s.seasonMin) ok(`wet-season rise ${dbg.seasonOffsetM.toFixed(2)} m`);
        else fail(`wet-season rise ${dbg.seasonOffsetM} < ${s.seasonMin}`);
      }
      if (s.seasonMax !== undefined) {
        if (dbg.seasonOffsetM <= s.seasonMax) ok(`dry-season drawdown ${dbg.seasonOffsetM.toFixed(2)} m`);
        else fail(`dry-season drawdown ${dbg.seasonOffsetM} > ${s.seasonMax}`);
      }
    }
    if (probe) {
      const c = probe.rows[Math.floor(probe.rows.length / 2)];
      const desc = `still ${c.stillM.toFixed(2)} m · depth+lift ${c.depthM.toFixed(2)} m (raw ${c.rawDepthM.toFixed(2)})`
        + ` · ground ${c.groundM === null ? "n/a" : c.groundM.toFixed(2) + " m"}`
        + ` · class ${c.className} · flow ${c.speedMS.toFixed(2)} m/s · shore ${c.shoreDistM.toFixed(1)} m`
        + ` · tide ${probe.tideM.toFixed(3)} season ${probe.seasonM.toFixed(2)} · data v${probe.schemaVersion}`
        + ` (depth ${probe.depthMinM}…${(probe.depthMinM + probe.depthSpanM).toFixed(1)} m)`;
      checks.push(`     ${desc}`);
      if (s.expect === "wet") {
        if (c.wet) ok("wet by the compiled signed depth");
        else fail(`dry by the compiled signed depth (${c.depthM.toFixed(2)} m)`);
        if (c.groundM !== null) {
          // The shipped depth channel cannot encode past `depthMinM +
          // depthSpanM` (v2: −6 … 24.6 m) BY DESIGN, so at a basin deeper than
          // that the compiled value is at the ceiling and can never equal the
          // physical depth. This is NOT a loosened gate: saturation is decided
          // by the PHYSICAL depth exceeding the ceiling (a fact about the
          // ground, not about the value under test), and the check then still
          // demands the compiled value actually BE at the ceiling — a basin
          // that reads 5 m where the ground says 26 m still fails. The old
          // form tested `rawDepthM >= ceiling − 0.5`, which is circular and
          // missed the tarn (raw 24.03 against a 24.1 m threshold) purely
          // because bilinear filtering pulls the sample in from the ceiling.
          const ceilingM = probe.depthMinM + probe.depthSpanM;
          // bilinear blending with neighbouring shallower texels can pull a
          // saturated sample this far below the ceiling
          const BILINEAR_M = 1.0;
          const saturated = c.physicalDepthM >= ceilingM;
          const gap = saturated
            ? Math.max(0, ceilingM - BILINEAR_M - c.rawDepthM)
            : Math.abs(c.physicalDepthM - c.depthM);
          const label = saturated
            ? `depth saturated at the ${ceilingM.toFixed(1)} m encoding ceiling (raw ${c.rawDepthM.toFixed(2)}, physical ${c.physicalDepthM.toFixed(2)} m)`
            : `|still − ground − depth| = ${gap.toFixed(2)} m`;
          if (gap < 0.15) ok(`${label} (registered)`);
          else fail(`${label} (physical ${c.physicalDepthM.toFixed(2)} vs compiled ${c.depthM.toFixed(2)})`);
        } else checks.push("     (no chunk ground loaded here: registration check skipped)");
      } else if (s.expect === "dry") {
        if (!c.wet) ok(`dry (${c.depthM.toFixed(2)} m)`);
        else fail(`wet where the owner's repro must be dry mud (${c.depthM.toFixed(2)} m)`);
        if (c.groundM !== null && c.physicalDepthM > 0) fail(`still surface above real ground by ${c.physicalDepthM.toFixed(2)} m`);
      }
      if (s.minDepth !== undefined) {
        const d = c.groundM !== null ? c.physicalDepthM : c.depthM;
        if (d >= s.minDepth) ok(`basin depth ${d.toFixed(1)} m >= ${s.minDepth}`);
        else fail(`basin depth ${d.toFixed(1)} m < ${s.minDepth}`);
      }
      if (s.flowing) {
        if (c.speedMS > 0.15) ok(`flowing at ${c.speedMS.toFixed(2)} m/s (> 0.15: undulation + flecks active)`);
        else fail(`river not flowing (${c.speedMS.toFixed(2)} m/s)`);
      }
      if (s.grid) {
        const wet = probe.rows.filter((r) => r.wet).length;
        marshWet[s.id] = wet;
        checks.push(`     marsh footprint: ${wet}/${probe.rows.length} grid points wet`);
      }
    }

    /** Grab the frame with only `spec` layers drawn, as RGBA bytes. */
    const grab = async (spec) => {
      await page.evaluate((v) => { window.__STUDIO_WATER_LAYERS__ = v; }, spec);
      const f0 = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__.frames);
      await page.waitForFunction((f) => window.__STUDIO_WATER_DEBUG__.frames >= f + 2, f0, { timeout: 30_000, polling: 200 });
      const buf = await page.screenshot({ timeout: 120_000 });
      return page.evaluate(async (b64) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
        return Array.from(g.getImageData(0, 0, cv.width, cv.height).data);
      }, buf.toString("base64"));
    };
    const meanDiff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return d / (a.length / 4) / 3; };

    // ---- waterfall fit (0047 addendum): the fall against its foam ----------
    /** The compiled fall whose plunge is nearest a world point (ids are per compile). */
    const fallNear = (xz) => {
      let best = null;
      for (const [id, m] of Object.entries(dbg?.falls?.sites ?? {})) {
        const d = Math.hypot(m.plunge[0] - xz[0], m.plunge[2] - xz[1]);
        if (d < 60 && (!best || d < best.d)) best = { id, d, marks: m };
      }
      return best;
    };
    const fitFall = s.fit && dbg ? fallNear(s.fit) : null;
    if (fitFall && dbg.camera) {
      try {
        const marks = fitFall.marks;
        checks.push(`     fit: nearest compiled fall ${fitFall.id} (plunge ${fitFall.d.toFixed(0)} m from ${s.fit.join("/")}, drop ${(marks.lip[1] - marks.plunge[1]).toFixed(0)} m)`);
        {
          // The fall is drawn as wide as its WATER, not as wide as its trench.
          const b = dbg?.falls?.perFall?.[fitFall.id];
          if (b) checks.push(`     fit: drawn (wetted) width ${b.widthM.toFixed(2)} m of a ${b.trenchWidthM.toFixed(2)} m trench`
            + ` (x${(b.widthM / Math.max(b.trenchWidthM, 1e-6)).toFixed(2)})`
            + `; rock relief across the lip ${b.brinkRangeM === undefined ? "not sampled" : `${b.brinkRangeM.toFixed(2)} m`}`);
        }
        const cam = dbg.camera;
        const frames = {};
        for (const [id, spec] of [["none", "none"], ["falls", "falls"], ["foam", "field,strips"], ["all", "field,strips,falls,effects"]]) frames[id] = await grab(spec);
        await page.evaluate(() => { window.__STUDIO_WATER_LAYERS__ = undefined; });
        const scale = { w: W, h: H };
        // (a) fall body vs adjacent foam, same lighting, brighter halves
        const body = ownedLuminance(frames.falls, frames.none, [...marks.samples, marks.lipPlus2M, marks.footMinus2M], 3, cam, scale.w, scale.h);
        const strip = stripAtLip(marks.lip);
        const lipArc = strip ? strip.points[strip.points.length - 1].arcM ?? 0 : 0;
        const stripPts = strip ? strip.points.filter((q) => (q.arcM ?? 0) >= lipArc - 10).map((q) => [q.x, q.y, q.z]) : [];
        const poolPts = [marks.plunge];
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          poolPts.push([marks.plunge[0] + Math.cos(a) * marks.basinRadiusM * 0.5, marks.plunge[1], marks.plunge[2] + Math.sin(a) * marks.basinRadiusM * 0.5]);
        }
        const foam = ownedLuminance(frames.foam, frames.none, [...stripPts, ...poolPts], 3, cam, scale.w, scale.h);
        // What the fall pixels sit ON, and how much of them the fall actually
        // is: a body that fails the fit band because it is DARK and one that
        // fails because it is THIN look identical in the ratio alone. `none`
        // is the same windows with no water drawn at all, so
        // coverage ≈ (falls − none) / (255 − none) is the sheet's effective
        // alpha there, and it separates the two causes without a second run.
        const bodyBg = ownedLuminance(frames.none, frames.none, [...marks.samples, marks.lipPlus2M, marks.footMinus2M],
          3, cam, scale.w, scale.h);
        {
          const bg = [];
          for (const p of [...marks.samples, marks.lipPlus2M, marks.footMinus2M]) {
            const pt = project(cam, p, scale.w, scale.h);
            for (const i of window2(pt, 3, scale.w, scale.h)) bg.push(lum(frames.none, i));
          }
          const bgL = mean(bg);
          const fallL = mean(body.lums);
          checks.push(`     fit: behind the fall (no water drawn) mean lum ${bgL.toFixed(1)}`
            + ` · implied sheet coverage ${(Math.max(fallL - bgL, 0) / Math.max(255 - bgL, 1e-6) * 100).toFixed(0)} %`
            + ` (${bodyBg.onScreen} marks)`);
        }
        const bodyL = brightHalf(body.lums);
        const foamL = brightHalf(foam.lums);
        const ratio = bodyL / foamL;
        checks.push(`     fit: chromaticity — sheet body (fallsIrradiance) ${chromaStr(chroma(body.rgb))}`
          + ` vs strip/pool whitewater (PBR path) ${chromaStr(chroma(foam.rgb))}`);
        checks.push(`     fit: fall body ${body.lums.length} px (${body.onScreen} marks on screen) mean lum ${mean(body.lums).toFixed(1)} bright-half ${bodyL.toFixed(1)}`
          + ` · foam ${foam.lums.length} px (${foam.onScreen}/${stripPts.length + poolPts.length} marks; strip ${strip ? strip.id : "none"}) mean ${mean(foam.lums).toFixed(1)} bright-half ${foamL.toFixed(1)}`);
        if (body.lums.length < 10) fail(`fit: no fall pixels on screen for ${fitFall.id} (${body.onScreen} marks visible)`);
        else if (foam.lums.length < 10) fail(`fit: no adjacent foam pixels on screen for ${fitFall.id}`);
        // A foam reference of a few dozen pixels is not a measurement. At
        // fall-gorge two runs of IDENTICAL code gave x1.57 and x2.14 while the
        // fall body itself moved 217.5 -> 217.3: the whole swing was the
        // denominator, 33 px of foam one run and 85 px the next as the marks
        // drifted across a churning plunge. Sites that measure (fall-25m,
        // fall-20m) carry 585-610 px from 15/15 marks. Below FIT_MIN_FOAM_PX
        // the ratio is REPORTED and not asserted — a check that flips on noise
        // is worse than no check.
        else if (foam.lums.length < FIT_MIN_FOAM_PX)
          checks.push(`     fit: fall / foam luminance x${ratio.toFixed(2)} — NOT asserted,`
            + ` only ${foam.lums.length} px of foam reference (needs ${FIT_MIN_FOAM_PX});`
            + ` body ${bodyL.toFixed(1)}, foam ${foamL.toFixed(1)}`);
        else if (ratio >= FIT_BAND.min && ratio <= FIT_BAND.max) ok(`fit: fall / foam luminance x${ratio.toFixed(2)} (band x${FIT_BAND.min}-x${FIT_BAND.max})`);
        else fail(`fit: fall / foam luminance x${ratio.toFixed(2)} outside x${FIT_BAND.min}-x${FIT_BAND.max}`);
        // (b) lip join: 2 m upstream on the strip (or the field) vs 2 m down the sheet
        const upstream = strip
          ? [strip.points.reduce((b, q) => (Math.abs((q.arcM ?? 0) - (lipArc - 2)) < Math.abs((b.arcM ?? 0) - (lipArc - 2)) ? q : b))].map((q) => [q.x, q.y, q.z])[0]
          : [marks.lip[0] - marks.direction[0] * 2, marks.lip[1], marks.lip[2] - marks.direction[1] * 2];
        const budget = dbg?.falls?.perFall?.[fitFall.id];
        const perp = [-marks.direction[1], marks.direction[0]];
        /**
         * One join. `sheetSide` names which of the two marks sits ON the drawn
         * sheet; that one is sampled through `ribbonAt` (the water), the other
         * is the strip / pool surface and keeps its plain window.
         */
        const joinStep = (label, pA, pB, sheetSide) => {
          const sheetMark = sheetSide === "a" ? pA : pB;
          const otherMark = sheetSide === "a" ? pB : pA;
          const other = project(cam, otherMark, scale.w, scale.h);
          const rib = budget
            ? ribbonAt(frames, sheetMark, perp, budget.widthM, budget.trenchWidthM, cam, scale.w, scale.h)
            : null;
          if (!other) { checks.push(`     ${label} join: the still-water mark is off screen — not measured here`); return; }
          if (!rib) { fail(`${label} join: no per-fall budget for ${fitFall.id}; cannot locate the drawn ribbon`); return; }
          checks.push(`     ${label} join: ribbon ${rib.px.length}/${rib.total} px water (coverage ${(rib.coverage * 100).toFixed(0)} %)`
            + `, notch centre ${rib.centreM.toFixed(2)} m off the traced line`
            + `, wetted ${budget.widthM.toFixed(2)} m of ${budget.trenchWidthM.toFixed(2)} m trench`);
          // The ribbon is ABSENT where the compiled data says a fall is drawn:
          // that is a rendering failure, and it must fail rather than skip —
          // otherwise a fall that quietly stopped drawing would sail through a
          // check that measures nothing.
          if (rib.px.length === 0) {
            fail(`${label} join: the fall ${fitFall.id} is compiled but NO drawn water was found across its lip`
              + ` (${rib.total} px scanned across the full ${budget.trenchWidthM.toFixed(2)} m trench)`);
            return;
          }
          const la = mean(rib.px.map((i) => lum(frames.all, i)));
          const lb = mean(window2(other, 2, scale.w, scale.h).map((i) => lum(frames.all, i)));
          const step = Math.abs(la - lb) / Math.max(la, lb, 1e-6);
          const rgbA = [0, 0, 0];
          for (const i of rib.px) { rgbA[0] += frames.all[i]; rgbA[1] += frames.all[i + 1]; rgbA[2] += frames.all[i + 2]; }
          const ca = chroma(rgbA.map((v) => v / rib.px.length));
          const cb = chroma(windowRgb(frames.all, other, 2, scale.w, scale.h));
          const cStep = Math.max(
            Math.abs(ca[0] - cb[0]) / Math.max((ca[0] + cb[0]) / 2, 1e-6),
            Math.abs(ca[1] - cb[1]) / Math.max((ca[1] + cb[1]) / 2, 1e-6));
          const lumMsg = `${label} join: lum ${la.toFixed(1)} vs ${lb.toFixed(1)}, step ${(step * 100).toFixed(0)} %`;
          const chromaMsg = `${label} join: chroma ${chromaStr(ca)} vs ${chromaStr(cb)}, step ${(cStep * 100).toFixed(0)} %`;
          // Same rule as the fit band's foam reference: a handful of pixels of
          // water is not a measurement of a join. Report and do not assert.
          if (rib.px.length < JOIN_MIN_WATER_PX || rib.coverage < JOIN_MIN_COVERAGE) {
            checks.push(`     ${lumMsg} — NOT asserted, only ${rib.px.length} px at ${(rib.coverage * 100).toFixed(0)} %`
              + ` coverage (needs ${JOIN_MIN_WATER_PX} px and ${JOIN_MIN_COVERAGE * 100} %)`);
            checks.push(`     ${chromaMsg} — NOT asserted, same reason`);
            return;
          }
          if (step <= JOIN_STEP) ok(`${lumMsg} (<= ${JOIN_STEP * 100} %)`);
          else fail(`${lumMsg} > ${JOIN_STEP * 100} %`);
          // ...and the same join in COLOUR (see JOIN_CHROMA_STEP).
          if (cStep <= JOIN_CHROMA_STEP) ok(`${chromaMsg} (<= ${JOIN_CHROMA_STEP * 100} %)`);
          else fail(`${chromaMsg} > ${JOIN_CHROMA_STEP * 100} %`);
        };
        joinStep("lip", upstream, marks.lipPlus2M, "b");
        // (c) plunge join: 2 m up the sheet vs the pool 2 m past the foot
        joinStep("plunge", marks.footMinus2M,
          [marks.foot[0] + marks.direction[0] * 2, marks.plunge[1], marks.foot[2] + marks.direction[1] * 2], "a");
      } catch (e) {
        fail(`fit capture failed: ${String(e).slice(0, 200)}`);
        try { await page.evaluate(() => { window.__STUDIO_WATER_LAYERS__ = undefined; }); } catch { /* ignore */ }
      }
    } else if (s.fit && dbg) {
      fail(`fit: no compiled fall within 60 m of ${s.fit.join("/")} (or no camera) in the debug state`);
    }
    // (d) submerged: sheets + mist must not paint slabs through the water; the surface must still draw
    if (s.underFit && dbg) {
      try {
        const near = fallNear(s.underFit);
        if (!near) fail(`under: no compiled fall within 60 m of ${s.underFit.join("/")}`);
        else checks.push(`     under: nearest compiled fall ${near.id} (${near.d.toFixed(0)} m)`);
        const all = await grab("field,strips,falls,effects");
        // Control: the SAME layers again. Every capture is a different frame of
        // animated water (waves, streaks, ripples, particles), so two grabs
        // never match — differencing two layer sets measures that animation as
        // well as the layer. Without this control the check attributed the
        // frame-to-frame churn to the falls: on 2026-09-09 it read 3.53 at
        // fall-20m-under with the falls kit provably drawing NOTHING under
        // water (`alpha *= 1.0 - uUnderwater` in all three fall shaders, unit
        // tested). The noise floor is the honest zero for this comparison.
        const allAgain = await grab("field,strips,falls,effects");
        const noFalls = await grab("field,strips,effects");
        const none = await grab("none");
        await page.evaluate(() => { window.__STUDIO_WATER_LAYERS__ = undefined; });
        const slabs = meanDiff(all, noFalls);
        const noise = meanDiff(all, allAgain);
        const surface = meanDiff(all, none);
        // 3 is the original absolute limit (a slab is far louder than this);
        // the floor rises with the measured churn so a busy frame is not a fail.
        const limit = Math.max(3, noise * 1.5);
        checks.push(`     under: hiding the falls changes mean |dRGB| ${slabs.toFixed(2)}; hiding all water ${surface.toFixed(2)};`
          + ` animation noise floor (same layers, two frames) ${noise.toFixed(2)}`);
        if (slabs < limit) ok(`under: no opaque sheets/mist through the water (mean |dRGB| ${slabs.toFixed(2)} < ${limit.toFixed(2)})`);
        else fail(`under: falls paint the submerged frame (mean |dRGB| ${slabs.toFixed(2)} >= ${limit.toFixed(2)})`);
        if (surface > 0.5) ok(`under: the pool surface draws from below (mean |dRGB| ${surface.toFixed(2)})`);
        else fail(`under: no water surface visible from below (mean |dRGB| ${surface.toFixed(2)})`);
      } catch (e) {
        fail(`under capture failed: ${String(e).slice(0, 200)}`);
        try { await page.evaluate(() => { window.__STUDIO_WATER_LAYERS__ = undefined; }); } catch { /* ignore */ }
      }
    }

    // Optional per-layer pixel attribution at the chute (folded from the old
    // probe-water-chute.mjs): hide each water layer in turn and difference.
    if (s.layerDiff && process.env.WATER_LAYER_DIFF === "1" && dbg) {
      const grabOld = async (spec) => {
        await page.evaluate((v) => { window.__STUDIO_WATER_LAYERS__ = v; }, spec);
        const f0 = await page.evaluate(() => window.__STUDIO_WATER_DEBUG__.frames);
        await page.waitForFunction((f) => window.__STUDIO_WATER_DEBUG__.frames >= f + 2, f0, { timeout: 30_000, polling: 200 });
        const buf = await page.screenshot({ timeout: 60_000 });
        return page.evaluate(async (b64) => {
          const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
          const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
          const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
          return Array.from(g.getImageData(0, 0, cv.width, cv.height).data);
        }, buf.toString("base64"));
      };
      const frames = {};
      for (const [id, spec] of [["all", "field,strips,falls,effects"], ["none", "none"],
        ["no-field", "strips,falls,effects"], ["no-strips", "field,falls,effects"], ["no-falls", "field,strips,effects"]]) {
        frames[id] = await grabOld(spec);
      }
      await page.evaluate(() => { window.__STUDIO_WATER_LAYERS__ = undefined; });
      const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return d / (a.length / 4) / 3; };
      for (const id of ["none", "no-field", "no-strips", "no-falls"]) {
        checks.push(`     layer diff ${id.padEnd(10)} mean |ΔRGB| ${diff(frames.all, frames[id]).toFixed(2)}`);
      }
      const stripsOwn = diff(frames.all, frames["no-strips"]);
      if (stripsOwn > 0.05) ok(`strips change the frame (mean ΔRGB ${stripsOwn.toFixed(2)})`);
      else fail(`hiding the strips changes nothing at the chute (ΔRGB ${stripsOwn.toFixed(2)})`);
    }

    // A site that failed may have left its page in an unknown state: the next
    // site starts from a fresh context rather than inheriting it.
    if (failures.length > failuresBefore) needFreshContext = true;
    const secs = ((Date.now() - ts) / 1000).toFixed(1);
    report.push(`## ${s.id} (${secs} s, ${loaded})\nurl: ?${s.q}&${COMMON}\n${checks.join("\n")}\nscreenshot: water-${s.id}.png\n`);
    console.log(`${checks.join("\n")}\n     [${secs} s, ${loaded}]`);
  }

  // (e) no perf cliff at the falls: with the falls layer drawn, each fit site
  // keeps >= 90 % of its own rate without it (the river's rate is reported)
  {
    const lines = [];
    const river = fpsBySite["lowland-river"];
    for (const s of RUN.filter((x) => x.fit || x.underFit)) {
      const f = fpsBySite[s.id];
      const g = fpsNoFalls[s.id];
      if (f === undefined || g === undefined) continue;
      const rel = f / Math.max(g, 1e-6);
      const line = `${s.id} ${f.toFixed(2)} fps with the falls = x${rel.toFixed(2)} of ${g.toFixed(2)} fps without`
        + (river !== undefined ? ` (lowland-river character view ${river.toFixed(2)} fps)` : "");
      if (rel >= 0.9) lines.push(`ok   ${line}`);
      else { lines.push(`FAIL ${line}`); failures.push(`frame rate cliff at ${s.id}: ${line}`); }
    }
    if (lines.length) report.push(`## frame rate at the falls\n${lines.join("\n")}\n`);
  }

  // Season footprint: the wet toggle must wet MORE of the marsh grid than the
  // calendar view, and the dry toggle no more (decision 0047 item 7).
  if (marshWet.marsh !== undefined && marshWet["marsh-wet"] !== undefined && marshWet["marsh-dry"] !== undefined) {
    const line = `marsh wet points: dry-season ${marshWet["marsh-dry"]} · calendar ${marshWet.marsh} · wet-season ${marshWet["marsh-wet"]}`;
    if (marshWet["marsh-wet"] >= marshWet.marsh && marshWet.marsh >= marshWet["marsh-dry"] && marshWet["marsh-wet"] > marshWet["marsh-dry"]) {
      report.push(`## season footprint\nok   ${line}\n`);
    } else {
      failures.push(`season footprint not monotone: ${line}`);
      report.push(`## season footprint\nFAIL ${line}\n`);
    }
  }
  if (pageErrors.length) report.push(`## all page errors\n${pageErrors.slice(0, 20).join("\n")}\n`);
} catch (e) {
  failures.push(String(e));
  report.push(`## crash\n${String(e)}`);
} finally {
  await browser?.close();
  if (server) { try { process.kill(-server.pid); } catch { /* already gone */ } }
}

const total = ((Date.now() - t0) / 1000).toFixed(0);
const summary = `# water probe — ${RUN.length} sites in ${total} s — ${failures.length ? `${failures.length} FAIL` : "all ok"}\n\n${report.join("\n")}`;
writeFileSync(path.join(artifacts, "water-probe-result.txt"), summary);
console.log(`\n${summary}`);
process.exit(failures.length ? 1 : 0);
