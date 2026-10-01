// Headless interior probe (walk 2 D2), SwiftShader. Starts a vite dev server
// on a spare port and runs one of two checks, printing one JSON line:
//   PROBE=cell  CELL=KeebaHouseFisher X=0.31309 Z=3.00629  -> opens the cell
//     directly (?interior=), logs the camera against the cell's drawn bounds,
//     the mesh count, and the frame's luminance mean / std-dev.
//   PROBE=door  X=0.31743 Z=3.065945 -> stands at an exterior door, logs the
//     door candidate / focus / prompt, the physics floor there, then presses E
//     and logs whether the cell opened, the seconds from the press to the
//     cell opening and to the fade clearing, and the interior/kit files and
//     bytes fetched after the press (`fetchedAfterPress`); PROFILE=1 adds the
//     main thread's top self-time functions over that wait (`profile`).
// Usage from apps/world-studio: PROBE=cell node scripts/probe-interior.mjs [--timeout <s>] [--out <file>]
//   --timeout <s>  hard wall-clock limit (default 120): past it the browser and
//                  vite are killed and the script exits 124 with one
//                  "probe-interior: TIMEOUT ..." line, so a caller under the
//                  600 s Bash cap is never left waiting (speed lane 2 item g).
//   --out <file>   writes the full result JSON (and vite's log) there; stdout
//                  keeps a one-line summary, so a caller never tails the log.
import "./probe-guard.mjs"; // job pool first (speed lane 3B)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) { console.error(`probe-interior: ${name} needs a value`); process.exit(2); }
  return v;
}
const TIMEOUT_S = Number(flag("--timeout", "120"));
if (!(TIMEOUT_S > 0)) { console.error("probe-interior: --timeout must be a positive number of seconds"); process.exit(2); }
const OUT_FILE = flag("--out", null) && resolve(flag("--out", null));

const PORT = Number(process.env.HARNESS_PORT ?? 8094);
const PROBE = process.env.PROBE ?? "cell";
const CELL = process.env.CELL ?? "KeebaHouseFisher";
const X = process.env.X ?? (PROBE === "cell" ? "0.31309" : "0.31743");
const Z = process.env.Z ?? (PROBE === "cell" ? "3.00629" : "3.065945");
const OUT = new URL("../artifacts/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const vite = spawn("npx", ["vite", "--port", String(PORT), "--host", "127.0.0.1"], {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" }, shell: true, detached: true,
});
const log = [];
let startTimer = null;
const ready = new Promise((resolve, reject) => {
  const onData = (d) => { log.push(String(d)); if (String(d).includes(`:${PORT}`)) resolve(); };
  vite.stdout.on("data", onData);
  vite.stderr.on("data", onData);
  vite.on("exit", (code) => reject(new Error(`vite exited ${code}`)));
  startTimer = setTimeout(() => reject(new Error("vite did not start in 60 s:\n" + log.join(""))), 60000);
});

const debug = (page, expr) => page.evaluate(`(() => { const d = window.__STUDIO_CHARACTER_DEBUG__; return d ? (${expr}) : null; })()`);

async function luminance(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    // The canvas region no HUD panel covers at 960×540 (x 200–600, y 150–480).
    const [x0, y0, x1, y1] = [200, 150, 600, 480].map((v, i) => Math.round(v * (i % 2 ? c.height / 540 : c.width / 960)));
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let n = 0; let sum = 0; let sq = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      n += 1; sum += y; sq += y * y;
    }
    const mean = sum / n;
    return { mean: +mean.toFixed(2), std: +Math.sqrt(Math.max(0, sq / n - mean * mean)).toFixed(2) };
  }, png.toString("base64"));
}

const inside = (p, b, pad = 0) => b && p.every((v, i) => v >= b[0][i] - pad && v <= b[1][i] + pad);

const result = { probe: PROBE, x: X, z: Z, stage: "boot" };
let page = null;
let browser = null;
const errs = [];
const started = Date.now();

// Full result to --out (with vite's log), one line to stdout; plain JSON to
// stdout when there is no --out (the old contract).
function report(code) {
  // the main path, unblocked by the killed browser, can get here first
  if (result.timedOut) code = 124;
  result.elapsedS = +((Date.now() - started) / 1000).toFixed(1);
  if (OUT_FILE) {
    mkdirSync(dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify({ ...result, viteLog: log.join("").slice(-8000) }, null, 1) + "\n");
    const verdict = result.timedOut ? "TIMEOUT" : result.failed ? "FAILED" : "ok";
    console.log(`probe-interior: ${PROBE} ${verdict} at stage ${result.stage} in ${result.elapsedS} s -> ${OUT_FILE}`);
  } else {
    console.log(JSON.stringify(result));
  }
  process.exit(code);
}

function killVite() { try { process.kill(-vite.pid, "SIGKILL"); } catch { /* gone */ } }

// The hard limit: whatever the probe is waiting on (vite, the page, a
// 240 s waitForFunction), kill the browser and vite and exit non-zero.
const hardTimer = setTimeout(async () => {
  result.timedOut = true;
  result.failed = `hard timeout ${TIMEOUT_S} s (stage ${result.stage})`;
  console.error(`probe-interior: TIMEOUT after ${TIMEOUT_S} s at stage ${result.stage}; browser and vite killed`);
  killVite();
  await Promise.race([browser?.close().catch(() => undefined), new Promise((r) => setTimeout(r, 3000))]);
  report(124);
}, TIMEOUT_S * 1000);

try {
  await ready;
  browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const keep = (t) => !/websocket|vite\] failed to connect/i.test(t);
  page.on("pageerror", (e) => { if (keep(e.message)) errs.push(e.message.slice(0, 300)); });
  page.on("console", (m) => { if (m.type() === "error" && keep(m.text())) errs.push(m.text().slice(0, 300)); });
  // the default 250-entry resource buffer fills with terrain tiles before the cell's fetches
  await page.addInitScript(() => performance.setResourceTimingBufferSize(20000));
  // T=hh:mm sets the clock (walk 9 lights: the cell at night and by day)
  const q = (PROBE === "cell" ? `&interior=${encodeURIComponent(CELL)}` : "") + (process.env.T ? `&t=${process.env.T}` : "");
  // Cheapest render settings: SwiftShader shares the CPU with the physics.
  await page.goto(`http://127.0.0.1:${PORT}/?view=character&x=${X}&z=${Z}&q=low&aa=0&dpr=0.5${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__?.player?.() != null, undefined, { timeout: 240000 });
  result.stage = "player-ready";
  var playerReadyAtS = +((Date.now() - started) / 1000).toFixed(1);

  if (PROBE === "cell") {
    await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__?.interior?.()?.cellId, undefined, { timeout: 240000, polling: 100 });
    var cellOpenedAtS = +((Date.now() - started) / 1000).toFixed(1);
    await page.waitForFunction(() => {
      const s = window.__STUDIO_CHARACTER_DEBUG__?.interior?.();
      return s && s.cellId && s.fade === 0;
    }, undefined, { timeout: 240000, polling: 100 });
    var fadeClearAtS = +((Date.now() - started) / 1000).toFixed(1);
    result.playerReadyAtS = playerReadyAtS;
    const samples = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(1500);
      const s = await debug(page, "{ camera: d.camera(), player: d.player(), arm: d.cameraArm(), interior: d.interior() }");
      samples.push({ ...s, cameraInside: inside(s.camera, s.interior.boundsM), playerInside: inside(s.player, s.interior.boundsM) });
    }
    const png = await page.screenshot({ path: `${OUT}interior-${CELL}.png` });
    // the second frame (walk 9 lights): the camera turned half round, the room's other side
    const turned = await page.evaluate(() => {
      const d = window.__STUDIO_CHARACTER_DEBUG__;
      if (!d.aimCamera) return false;
      const c = d.camera(); const p = d.player();
      // aimCamera looks along (-sin yaw, -cos yaw): turn to look from the player back past the camera
      d.aimCamera(Math.atan2(p[0] - c[0], p[2] - c[2]));
      return true;
    });
    await page.waitForTimeout(4000);
    const png2 = await page.screenshot({ path: `${OUT}interior-${CELL}-2.png` });
    result.frame2 = { turned, luminance: await luminance(page, png2) };
    // walk 4 lane INTERIOR: fog, render stats, the group's visibility chain, load timings
    result.scene = await page.evaluate((cell) => {
      const scene = window.__SCENE__; const gl = window.__RENDERER__;
      const out = {};
      if (scene) {
        const f = scene.fog; out.fog = f ? { near: f.near, far: f.far, color: f.color?.getHexString?.(), density: f.density } : null;
        out.background = scene.background?.getHexString?.() ?? String(scene.background);
        const g = scene.getObjectByName(`interior:${cell}`);
        if (g) {
          const chain = []; for (let o = g; o; o = o.parent) chain.push({ name: o.name || o.type, visible: o.visible });
          let meshes = 0, visible = 0, instances = 0, tris = 0; const mats = {};
          g.traverse((o) => { if (o.isMesh) { meshes++; if (o.visible) visible++; instances += o.count ?? 1;
            const idx = o.geometry.index; tris += (idx ? idx.count : o.geometry.getAttribute("position").count) / 3;
            const m = Array.isArray(o.material) ? o.material[0] : o.material; const k = `${m.type}:${m.side}:${m.visible}:${m.opacity}`; mats[k] = (mats[k] ?? 0) + 1; } });
          g.updateMatrixWorld(true);
          out.group = { chain, meshes, visible, instances, tris, mats, worldPos: g.getWorldPosition(new window.__THREE__.Vector3()).toArray() };
        } else out.group = null;
      }
      if (gl) out.render = { calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length };
      const res = performance.getEntriesByType("resource").filter((r) => /interiors\/|kits\/.*\.glb|\.ktx2/.test(r.name));
      out.resources = res.map((r) => ({ url: r.name.replace(/^.*?\/(province|kits)\//, "$1/"), start: Math.round(r.startTime), end: Math.round(r.responseEnd), kb: Math.round(r.transferSize / 1024), status: r.responseStatus }));
      return out;
    }, CELL);
    result.cellOpenedAtS = cellOpenedAtS; result.fadeClearAtS = fadeClearAtS;
    Object.assign(result, {
      cell: CELL, meshes: samples[0].interior.meshes, originM: samples[0].interior.originM,
      boundsM: samples[0].interior.boundsM, samples: samples.map(({ camera, player, arm, cameraInside, playerInside }) => ({
        camera: camera.map((v) => +v.toFixed(2)), player: player.map((v) => +v.toFixed(2)), arm: +arm.toFixed(2), cameraInside, playerInside,
      })),
      luminance: await luminance(page, png), screenshot: `${OUT}interior-${CELL}.png`,
    });
  } else {
    await page.waitForTimeout(20000); // settle on the ground, doors streamed
    const [x, z] = [Number(X) * 1000, Number(Z) * 1000];
    const before = await debug(page, `{ player: d.player(), grounded: d.grounded(), interior: d.interior(),
      rayDown: d.rayDown(${x}, ${z}), groundAt: d.groundAt(${x}, ${z}),
      promptInDom: !!document.querySelector("[data-door-prompt]") }`);
    // Time the entry from the key press (walk 4 lane INTERIOR2): cell opened,
    // fade clear, and every interior/kit byte fetched after the press.
    // PROFILE=1: a main-thread CPU profile from the press to the fade clearing,
    // reduced to the top self-time functions (where the wait at black goes).
    const cdp = process.env.PROFILE ? await page.context().newCDPSession(page) : null;
    if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 1000 }); await cdp.send("Profiler.start"); }
    const pressAtMs = await page.evaluate(() => performance.now());
    const pressWall = Date.now();
    await page.keyboard.down("KeyE");
    await page.waitForTimeout(400);
    await page.keyboard.up("KeyE");
    const since = () => +((Date.now() - pressWall) / 1000).toFixed(1);
    await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__?.interior?.()?.cellId, undefined, { timeout: 90000, polling: 100 })
      .then(() => { result.cellOpenedAfterPressS = since(); }, () => { result.cellOpenedAfterPressS = null; });
    await page.waitForFunction(() => { const s = window.__STUDIO_CHARACTER_DEBUG__?.interior?.(); return s?.cellId && s.fade === 0; },
      undefined, { timeout: 30000, polling: 100 })
      .then(() => { result.fadeClearAfterPressS = since(); }, () => { result.fadeClearAfterPressS = null; });
    if (cdp) {
      const { profile } = await cdp.send("Profiler.stop");
      const self = new Map();
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const dt = profile.timeDeltas; let total = 0;
      profile.samples.forEach((id, i) => {
        const n = byId.get(id); const f = n.callFrame;
        const key = `${f.functionName || "(anon)"} ${f.url.replace(/^.*\//, "").replace(/\?.*$/, "")}:${f.lineNumber + 1}`;
        self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0)); total += dt[i] ?? 0;
      });
      result.profile = { totalS: +(total / 1e6).toFixed(1), top: [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)
        .map(([k, us]) => `${(us / 1e6).toFixed(2)} s ${k}`) };
    }
    await page.waitForTimeout(1500);
    const after = await debug(page, "{ player: d.player(), interior: d.interior() }");
    result.fetchedAfterPress = await page.evaluate((t0) => {
      const res = performance.getEntriesByType("resource")
        .filter((r) => r.startTime >= t0 && /interiors\/|kits\/.*\.(glb|ktx2|json)/.test(r.name));
      const sum = (f) => res.filter(f).reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0);
      return {
        files: res.length, bytes: sum(() => true),
        wholeKitGlbs: res.filter((r) => /kits\/[^/]+\.glb$/.test(r.name)).map((r) => r.name.replace(/^.*\/kits\//, "")),
        wholeKitBytes: sum((r) => /kits\/[^/]+\.glb$/.test(r.name)),
        partGlbs: res.filter((r) => /\/parts\/[^/]+\.glb$/.test(r.name)).length,
        partBytes: sum((r) => /\/parts\/[^/]+\.glb$/.test(r.name)),
        textureFiles: res.filter((r) => /\/parts\/tex\//.test(r.name)).length,
        textureBytes: sum((r) => /\/parts\/tex\//.test(r.name)),
        lastEndS: +((Math.max(0, ...res.map((r) => r.responseEnd)) - t0) / 1000).toFixed(1),
        timeline: res.map((r) => ({ url: r.name.replace(/^.*\/(province|kits)\//, "$1/"),
          startS: +((r.startTime - t0) / 1000).toFixed(2), endS: +((r.responseEnd - t0) / 1000).toFixed(2),
          kb: Math.round((r.transferSize || r.encodedBodySize || 0) / 1024) })),
      };
    }, pressAtMs);
    const png = await page.screenshot({ path: `${OUT}door-${X}-${Z}.png` });
    Object.assign(result, { before, after, luminance: await luminance(page, png) });
  }
  result.errors = errs.slice(0, 8);
} catch (e) {
  if (!result.timedOut) result.failed = String(e).slice(0, 600);
  if (page && !result.timedOut) {
    result.atFailure = await debug(page, "{ frames: d.frames(), player: d.player(), camera: d.camera(), interior: d.interior() }")
      .catch((err) => String(err).slice(0, 200));
    result.errors = errs.slice(0, 8);
    result.bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => null);
    await page.screenshot({ path: `${OUT}interior-probe-failure.png` }).catch(() => undefined);
  }
} finally {
  clearTimeout(startTimer);
  await browser?.close().catch(() => undefined);
  try { process.kill(-vite.pid, "SIGTERM"); } catch { /* gone */ }
}
clearTimeout(hardTimer);
report(result.failed ? 1 : 0);
