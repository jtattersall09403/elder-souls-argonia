// Water probe (decision 0047 item 8): ONE browser session against the BUILT
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
/** Largest luminance step allowed across the lip / plunge joins. */
const JOIN_STEP = 0.25;
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
/** Luminances of the pixels in `frame` at `points` that a water layer owns (differ from `none`). */
function ownedLuminance(frame, none, points, r, cam, w, h) {
  const out = [];
  let onScreen = 0;
  for (const p of points) {
    const pt = project(cam, p, w, h);
    if (!pt) continue;
    onScreen++;
    for (const i of window2(pt, r, w, h)) {
      const d = Math.abs(frame[i] - none[i]) + Math.abs(frame[i + 1] - none[i + 1]) + Math.abs(frame[i + 2] - none[i + 2]);
      if (d >= OWNED_DELTA) out.push(lum(frame, i));
    }
  }
  return { lums: out, onScreen };
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
  /** One browser context (renderer process) per site: a tab whose main thread
   * hangs on software GL must not queue its navigation behind every later
   * site (one hang turned into six "interrupted by another navigation"). */
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

  for (const s of RUN) {
    const ts = Date.now();
    const errBefore = pageErrors.length;
    await freshPage();
    const url = `${BASE}?${s.q}&${COMMON}`;
    const checks = [];
    const fail = (msg) => { checks.push(`FAIL ${msg}`); failures.push(`${s.id}: ${msg}`); };
    const ok = (msg) => checks.push(`ok   ${msg}`);
    console.log(`== ${s.id}`);
    let dbg = null;
    let probe = null;
    try {
      // "commit", not "load": chunk streaming keeps the load event away for
      // minutes on software GL; the frame counter below is the real gate.
      await page.goto(url, { waitUntil: "commit", timeout: SITE_TIMEOUT_MS });
      await page.waitForFunction(
        (n) => window.__STUDIO_WATER_DEBUG__ && window.__STUDIO_WATER_DEBUG__.frames >= n && !!window.__STUDIO_WATER_PROBE__,
        SETTLE_FRAMES, { timeout: s.q.includes("view=fly3d") ? FLY_SETTLE_TIMEOUT_MS : SITE_TIMEOUT_MS, polling: 250 });
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
          // The compiled depth saturates at the encoding cap (v1 25.5 m, v2
          // 24.6 m): a deeper basin is registered when the real depth is at
          // least the cap, not when it equals it.
          const cap = probe.depthMinM + probe.depthSpanM - 0.5; // bilinear across texels clamped at the cap can read up to ~0.5 m under it
          const saturated = c.rawDepthM >= cap;
          const gap = saturated ? Math.max(0, cap - c.physicalDepthM) : Math.abs(c.physicalDepthM - c.depthM);
          const label = saturated ? `depth saturated at the ${cap.toFixed(1)} m cap, physical ${c.physicalDepthM.toFixed(2)} m` : `|still − ground − depth| = ${gap.toFixed(2)} m`;
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
        const bodyL = brightHalf(body.lums);
        const foamL = brightHalf(foam.lums);
        const ratio = bodyL / foamL;
        checks.push(`     fit: fall body ${body.lums.length} px (${body.onScreen} marks on screen) mean lum ${mean(body.lums).toFixed(1)} bright-half ${bodyL.toFixed(1)}`
          + ` · foam ${foam.lums.length} px (${foam.onScreen}/${stripPts.length + poolPts.length} marks; strip ${strip ? strip.id : "none"}) mean ${mean(foam.lums).toFixed(1)} bright-half ${foamL.toFixed(1)}`);
        if (body.lums.length < 10) fail(`fit: no fall pixels on screen for ${fitFall.id} (${body.onScreen} marks visible)`);
        else if (foam.lums.length < 10) fail(`fit: no adjacent foam pixels on screen for ${fitFall.id}`);
        else if (ratio >= FIT_BAND.min && ratio <= FIT_BAND.max) ok(`fit: fall / foam luminance x${ratio.toFixed(2)} (band x${FIT_BAND.min}-x${FIT_BAND.max})`);
        else fail(`fit: fall / foam luminance x${ratio.toFixed(2)} outside x${FIT_BAND.min}-x${FIT_BAND.max}`);
        // (b) lip join: 2 m upstream on the strip (or the field) vs 2 m down the sheet
        const upstream = strip
          ? [strip.points.reduce((b, q) => (Math.abs((q.arcM ?? 0) - (lipArc - 2)) < Math.abs((b.arcM ?? 0) - (lipArc - 2)) ? q : b))].map((q) => [q.x, q.y, q.z])[0]
          : [marks.lip[0] - marks.direction[0] * 2, marks.lip[1], marks.lip[2] - marks.direction[1] * 2];
        const joinStep = (label, pA, pB) => {
          const a = project(cam, pA, scale.w, scale.h);
          const b = project(cam, pB, scale.w, scale.h);
          if (!a || !b) { checks.push(`     ${label} join: mark off screen (${a ? "" : "upstream "}${b ? "" : "downstream"}) — not measured here`); return; }
          const la = mean(window2(a, 2, scale.w, scale.h).map((i) => lum(frames.all, i)));
          const lb = mean(window2(b, 2, scale.w, scale.h).map((i) => lum(frames.all, i)));
          const step = Math.abs(la - lb) / Math.max(la, lb, 1e-6);
          if (step <= JOIN_STEP) ok(`${label} join: lum ${la.toFixed(1)} vs ${lb.toFixed(1)}, step ${(step * 100).toFixed(0)} % (<= ${JOIN_STEP * 100} %)`);
          else fail(`${label} join: lum ${la.toFixed(1)} vs ${lb.toFixed(1)}, step ${(step * 100).toFixed(0)} % > ${JOIN_STEP * 100} %`);
        };
        joinStep("lip", upstream, marks.lipPlus2M);
        // (c) plunge join: 2 m up the sheet vs the pool 2 m past the foot
        joinStep("plunge", marks.footMinus2M, [marks.foot[0] + marks.direction[0] * 2, marks.plunge[1], marks.foot[2] + marks.direction[1] * 2]);
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
        const noFalls = await grab("field,strips,effects");
        const none = await grab("none");
        await page.evaluate(() => { window.__STUDIO_WATER_LAYERS__ = undefined; });
        const slabs = meanDiff(all, noFalls);
        const surface = meanDiff(all, none);
        checks.push(`     under: hiding the falls changes mean |dRGB| ${slabs.toFixed(2)}; hiding all water ${surface.toFixed(2)}`);
        if (slabs < 3) ok(`under: no opaque sheets/mist through the water (mean |dRGB| ${slabs.toFixed(2)} < 3)`);
        else fail(`under: falls paint the submerged frame (mean |dRGB| ${slabs.toFixed(2)})`);
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

    const secs = ((Date.now() - ts) / 1000).toFixed(1);
    report.push(`## ${s.id} (${secs} s)\nurl: ?${s.q}&${COMMON}\n${checks.join("\n")}\nscreenshot: water-${s.id}.png\n`);
    console.log(checks.join("\n"));
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
