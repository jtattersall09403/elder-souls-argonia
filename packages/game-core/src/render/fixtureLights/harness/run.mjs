// Fixture-light bench (16k walk 5, lane L8; decision 0109 harness): drives the
// studio harness page's settlement-night scene (100 lantern lamps over real
// mud-kit pieces) once per lighting mode and backend, and prints one JSON
// line per run: CPU ms per frame (render call), GPU ms per frame (WebGPU
// timestamp queries; null on WebGL) and draw calls. SwiftShader on this VM:
// the numbers are RATIOS only. ~1-4 min per run (the shader compile).
//   node packages/game-core/src/render/fixtureLights/harness/run.mjs \
//     [--runs webgpu:field,webgpu:tiled,webgl:field] [--frames 30] [--url http://127.0.0.1:PORT/]
// `plain` (100 real PointLights in three's light list) is selectable but did
// not finish compiling within 240 s on either SwiftShader backend.
import { chromium } from "playwright";
import { startStudioDevServer } from "../../../../../../apps/world-studio/scripts/dev-server.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const runs = arg("runs", "webgpu:field,webgpu:tiled,webgl:field").split(",").map((r) => r.split(":"));
const frames = Number(arg("frames", "30"));
const LAUNCH = {
  webgpu: ["--enable-unsafe-webgpu", "--enable-features=UnsafeWebGPU", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  webgl: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
};
const server = arg("url") ? null : await startStudioDevServer();
const base = (arg("url") ?? server.url).replace(/\/?$/, "/");
try {
  for (const [backend, mode] of runs) {
    const browser = await chromium.launch({ headless: true, args: LAUNCH[backend] });
    let logs = [];
    try {
      const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
      logs = [];
      page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 200)); });
      page.on("pageerror", (e) => logs.push(String(e).slice(0, 200)));
      await page.goto(`${base}harness.html?sys=settlement-night&renderer=${backend}&w=512&h=288&lighting=${mode}&bench=${frames}`);
      const bench = await (await page.waitForFunction(() => window.__FIXTURE_BENCH__, null, { timeout: 240000 })).jsonValue();
      console.log(JSON.stringify(bench));
    } catch (e) {
      console.log(JSON.stringify({ backend, mode, error: String(e).split("\n")[0], logs: logs.slice(0, 3) }));
    } finally {
      await browser.close();
    }
  }
} finally {
  server?.stop();
}
