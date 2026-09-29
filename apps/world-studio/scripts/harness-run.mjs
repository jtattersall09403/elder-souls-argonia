// Subsystem harness runner (decision 0109; owner ruling: no full-studio
// headless probes, one small page per subsystem instead).
//
// Runs harness.html?sys=<name> for every scene under src/harness/scenes/ (or
// --sys a,b) on both backends of the node renderer (or --backend webgpu|webgl)
// in headless Chromium, and writes, under --out (default tmp/harness/<label>/):
//   <sys>.<backend>.png   one screenshot per run
//   summary.json          window.__HARNESS__ per run + the page's console
//   contact-sheet.png     every screenshot, labelled, one sheet per run
//
//   node scripts/harness-run.mjs [--sys smoke,water] [--backend webgpu]
//        [--label name] [--out dir] [--url http://127.0.0.1:PORT/] [--w 512 --h 288]
//
// Without --url it starts its own vite dev server on a free port on 127.0.0.1
// (scripts/dev-server.mjs; never $ES_STUDIO_PORT or 8081). With --url it
// drives an already-running harness (e.g. the same scenes on another checkout).
// WebGPU: Chromium's `--enable-unsafe-webgpu` gives a real SwiftShader WebGPU
// adapter on this VM (navigator.gpu needs a secure origin: 127.0.0.1 is one).
// WebGL: ANGLE on SwiftShader. Exit code 1 when any run is not ok.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { startStudioDevServer } from "./dev-server.mjs";

const studioDir = new URL("../", import.meta.url).pathname;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const width = Number(args.w) || 512;
const height = Number(args.h) || 288;
const label = typeof args.label === "string" ? args.label : new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(typeof args.out === "string" ? args.out : join(studioDir, "tmp/harness", label));
const backends = typeof args.backend === "string" ? args.backend.split(",") : ["webgpu", "webgl"];
const allScenes = readdirSync(join(studioDir, "src/harness/scenes"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();
const scenes = typeof args.sys === "string" ? args.sys.split(",") : allScenes;
const timeoutMs = Number(args.timeout) || 240000;
/** Above this share of drawn pixels at luma < 3 a run fails (NaN shading
 * renders black), unless its scene exports `expectDark: true`. */
const BLACK_FRACTION_MAX = 0.2;

const LAUNCH = {
  webgpu: ["--enable-unsafe-webgpu", "--enable-features=UnsafeWebGPU", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  webgl: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
};
// vite's HMR socket and the favicon are not harness errors.
// "Instance dropped in popErrorScope" is headless SwiftShader WebGPU's
// rejection of any error scope pending across a submit (src/harness/main.ts
// ENV_NOISE); the page counts it as envNoise.
const noise = (t) => /websocket|\[vite\]|favicon\.ico|Instance dropped in popErrorScope/i.test(t);

mkdirSync(outDir, { recursive: true });
const server = typeof args.url === "string" ? null : await startStudioDevServer();
const base = (typeof args.url === "string" ? args.url : server.url).replace(/\/?$/, "/");
const runs = [];
try {
  for (const backend of backends) {
    const launch = () => chromium.launch({ headless: true, args: LAUNCH[backend] ?? [] });
    let browser = await launch();
    try {
      for (const sys of scenes) {
        // A scene that crashes the GPU process takes the browser with it:
        // relaunch so one bad scene never hides the rest.
        if (!browser.isConnected()) browser = await launch();
        let page;
        try {
          page = await browser.newPage({ viewport: { width, height } });
        } catch {
          try { await browser.close(); } catch { /* already gone */ }
          browser = await launch();
          page = await browser.newPage({ viewport: { width, height } });
        }
        const consoleLines = [];
        page.on("console", (m) => {
          const t = m.text();
          if ((m.type() === "error" || m.type() === "warning") && !noise(t)
            && !/^Failed to load resource/.test(t)) {
            consoleLines.push(`${m.type()}: ${t.slice(0, 600)}`);
          }
        });
        // A failed fetch is reported with its URL; Chromium's own console line
        // for it ("Failed to load resource") names none, so it is dropped.
        page.on("response", (r) => {
          if (r.status() >= 400 && !noise(r.url())) consoleLines.push(`error: http ${r.status()} ${r.url()}`);
        });
        page.on("pageerror", (e) => { if (!noise(e.message)) consoleLines.push(`pageerror: ${e.message.slice(0, 600)}`); });
        const url = `${base}harness.html?sys=${encodeURIComponent(sys)}&renderer=${backend}&w=${width}&h=${height}`;
        const t0 = Date.now();
        let result;
        try {
          // "commit", not "load": a cold vite dev server transforms three's
          // node library on the first request, and the page's own
          // __HARNESS__ flag is the real completion signal.
          await page.goto(url, { waitUntil: "commit", timeout: timeoutMs });
          await page.waitForFunction(() => window.__HARNESS__?.done, null, { timeout: timeoutMs });
          result = await page.evaluate(() => window.__HARNESS__);
        } catch (e) {
          result = { done: false, ok: false, sys, backend: "none", errors: [`runner: ${String(e).slice(0, 400)}`], warnings: [] };
        }
        const shot = join(outDir, `${sys}.${backend}.png`);
        try { await page.screenshot({ path: shot }); } catch { /* page gone */ }
        // The asked backend must be the one that ran: a silent WebGPU->WebGL
        // fallback would make a "webgpu" pass meaningless.
        const wrongBackend = result.backend !== "none" && result.backend !== backend;
        // A black (NaN) surface keeps its mean luma plausible: fail on the
        // share of drawn pixels that came out black (main.ts blackFraction).
        const tooBlack = !result.expectDark && (result.blackFraction ?? 0) > BLACK_FRACTION_MAX;
        const ok = Boolean(result.ok) && !wrongBackend && !tooBlack
          && !consoleLines.some((l) => l.startsWith("error") || l.startsWith("pageerror"));
        runs.push({
          sys, requested: backend, ok, ms: Date.now() - t0, shot, wrongBackend, tooBlack,
          result, console: consoleLines,
        });
        const warnCount = (result.warnings?.length ?? 0);
        console.log(`${ok ? "ok  " : "FAIL"} ${sys} [${backend}${wrongBackend ? ` ran ${result.backend}` : ""}]`
          + ` compile ${result.compileMs ?? "-"} ms, calls ${result.calls ?? "-"}, tris ${result.triangles ?? "-"},`
          + ` luma ${result.meanLuma ?? "-"}, drawn ${result.drawnFraction ?? "-"}, covered ${result.coveredFraction ?? "-"}, black ${result.blackFraction ?? "-"}${tooBlack ? " (> " + BLACK_FRACTION_MAX + ")" : ""}${result.expectDark ? " (expectDark)" : ""}, errors ${result.errors?.length ?? 0}, warnings ${warnCount}, env-noise ${result.envNoise?.length ?? 0}`
          + (result.adapter ? `, adapter: ${result.adapter}` : ""));
        for (const e of (result.errors ?? []).slice(0, 5)) console.log(`     error: ${e}`);
        for (const w of (result.warnings ?? []).slice(0, 5)) console.log(`     warning: ${w}`);
        try { await page.close(); } catch { /* browser gone */ }
      }
    } finally {
      try { await browser.close(); } catch { /* already gone */ }
    }
  }
} catch (e) {
  // Still write what ran: a runner fault must not lose the finished runs.
  console.log(`runner error: ${String(e).slice(0, 400)}`);
  runs.push({ sys: "(runner)", requested: "-", ok: false, result: { errors: [String(e)] }, console: [] });
} finally {
  server?.stop();
}

writeFileSync(join(outDir, "summary.json"), JSON.stringify({ label, base, width, height, runs }, null, 2));

// Contact sheet: one labelled tile per run, scenes down, backends across.
const sheet = join(outDir, "contact-sheet.png");
const tiles = runs.filter((r) => r.shot && existsSync(r.shot));
if (tiles.length) {
  const inputs = [];
  const filters = [];
  tiles.forEach((r, i) => {
    inputs.push("-i", r.shot);
    const text = `${r.sys} ${r.requested} ${r.ok ? "ok" : "FAIL"}`.replace(/[:']/g, " ");
    filters.push(`[${i}:v]scale=${width}:${height},drawtext=text='${text}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6[t${i}]`);
  });
  const layout = tiles
    .map((r) => `${backends.indexOf(r.requested) * width}_${scenes.indexOf(r.sys) * height}`).join("|");
  const stack = tiles.length === 1
    ? `[t0]copy[out]`
    : `${tiles.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${tiles.length}:layout=${layout}:fill=black[out]`;
  const ff = spawnSync("ffmpeg", [
    "-y", "-loglevel", "error", ...inputs,
    "-filter_complex", `${filters.join(";")};${stack}`, "-map", "[out]", "-frames:v", "1", sheet,
  ], { encoding: "utf8" });
  if (ff.status !== 0) console.log(`contact sheet failed: ${ff.stderr.slice(0, 400)}`);
}

const failed = runs.filter((r) => !r.ok).length;
console.log(`harness: ${runs.length - failed}/${runs.length} ok -> ${outDir}`);
process.exit(failed ? 1 : 0);
