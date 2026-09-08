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
//       pixel attribution at the fall-78 chute (field/strips/falls/effects)
//   WATER_REUSE_SERVER=1 WATER_PORT=4323 ...                  # server already up
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
  { id: "strip-64", q: "view=fly3d&cam=orbit&x=1.75&z=1.74&t=12:00", expect: "any", strips: true },
  { id: "fall-78", q: "view=fly3d&cam=fly&x=1.827&z=2.093&alt=54&yaw=270&pitch=4&t=12:00", expect: "any", falls: true, layerDiff: true },
  { id: "fall-60", q: "view=fly3d&cam=fly&x=1.816&z=1.810&alt=84&yaw=311&pitch=3&t=12:00", expect: "any", falls: true },
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
const t0 = Date.now();
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
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message.slice(0, 400)}`));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console: ${m.text().slice(0, 400)}`); });

  for (const s of RUN) {
    const ts = Date.now();
    const errBefore = pageErrors.length;
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
        SETTLE_FRAMES, { timeout: SITE_TIMEOUT_MS, polling: 250 });
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
      // never let a stuck navigation queue behind the next site
      try { await page.goto("about:blank", { timeout: 10_000 }); } catch { /* ignore */ }
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
          else fail(`fall kit out of spec: ${JSON.stringify(dbg.falls)}`);
        }
      }
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

    // Optional per-layer pixel attribution at the chute (folded from the old
    // probe-water-chute.mjs): hide each water layer in turn and difference.
    if (s.layerDiff && process.env.WATER_LAYER_DIFF === "1" && dbg) {
      const grab = async (spec) => {
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
        frames[id] = await grab(spec);
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
