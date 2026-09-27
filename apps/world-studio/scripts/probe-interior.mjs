// Headless interior probe (walk 2 D2), SwiftShader. Starts a vite dev server
// on a spare port and runs one of two checks, printing one JSON line:
//   PROBE=cell  CELL=KeebaHouseFisher X=0.31309 Z=3.00629  -> opens the cell
//     directly (?interior=), logs the camera against the cell's drawn bounds,
//     the mesh count, and the frame's luminance mean / std-dev.
//   PROBE=door  X=0.31743 Z=3.065945 -> stands at an exterior door, logs the
//     door candidate / focus / prompt, the physics floor there, then presses E
//     and logs whether the cell opened.
// Usage from apps/world-studio: PROBE=cell node scripts/probe-interior.mjs [--timeout <s>] [--out <file>]
//   --timeout <s>  hard wall-clock limit (default 120): past it the browser and
//                  vite are killed and the script exits 124 with one
//                  "probe-interior: TIMEOUT ..." line, so a caller under the
//                  600 s Bash cap is never left waiting (speed lane 2 item g).
//   --out <file>   writes the full result JSON (and vite's log) there; stdout
//                  keeps a one-line summary, so a caller never tails the log.
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
  const q = PROBE === "cell" ? `&interior=${encodeURIComponent(CELL)}` : "";
  // Cheapest render settings: SwiftShader shares the CPU with the physics.
  await page.goto(`http://127.0.0.1:${PORT}/?view=character&x=${X}&z=${Z}&q=low&aa=0&water=0&dpr=0.5${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__STUDIO_CHARACTER_DEBUG__?.player?.() != null, undefined, { timeout: 240000 });
  result.stage = "player-ready";

  if (PROBE === "cell") {
    await page.waitForFunction(() => {
      const s = window.__STUDIO_CHARACTER_DEBUG__?.interior?.();
      return s && s.cellId && s.fade === 0;
    }, undefined, { timeout: 240000 });
    const samples = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(1500);
      const s = await debug(page, "{ camera: d.camera(), player: d.player(), arm: d.cameraArm(), interior: d.interior() }");
      samples.push({ ...s, cameraInside: inside(s.camera, s.interior.boundsM), playerInside: inside(s.player, s.interior.boundsM) });
    }
    const png = await page.screenshot({ path: `${OUT}interior-${CELL}.png` });
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
    await page.keyboard.down("KeyE");
    await page.waitForTimeout(400);
    await page.keyboard.up("KeyE");
    await page.waitForTimeout(12000);
    const after = await debug(page, "{ player: d.player(), interior: d.interior() }");
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
