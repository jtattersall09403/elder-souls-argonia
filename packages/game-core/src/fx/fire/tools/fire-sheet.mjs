// Fire contact sheets (16k walk 5): every fire preset over time, by day and
// by night, rendered by the REAL flame shader (flameMaterial.ts) in headless
// Chromium (SwiftShader), in seconds. A minimal standalone page: the fire
// module, a plain backdrop, and the two exposures the light rig spans
// (world-studio sky/lightRig.ts: 3.9e-5 at a 45 deg sun, 22 at a moonless
// night). No studio, no vite, no world (owner ruling: no GPU on this VM).
//
// Usage (repo root):
//   node packages/game-core/src/fx/fire/tools/fire-sheet.mjs [preset ...] [--out DIR]
// Default: every preset, DIR tooling/.reports/16k/walk5/fire/sheets.
// Each sheet is 6 frames (0.2 s apart) x {day, night} = 12 tiles, one PNG
// per preset; the flame's own height fills ~60 % of a tile, and the white
// tick at each tile's centre marks the emitter (the wick).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../../..");
const fireDir = resolve(here, "..");
const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outDir = resolve(repo, outAt >= 0 ? args[outAt + 1] : "tooling/.reports/16k/walk5/fire/sheets");
const wanted = args.filter((a, i) => !a.startsWith("--") && (outAt < 0 || i !== outAt + 1));

const threeDir = join(repo, "node_modules/three/build");
const files = {
  "/three.module.js": () => readFileSync(join(threeDir, "three.module.js"), "utf8"),
  "/three.core.js": () => readFileSync(join(threeDir, "three.core.js"), "utf8"),
};
const tsFile = (name) => ts.transpileModule(readFileSync(join(fireDir, name), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from "\.\/(\w+)"/g, 'from "/fire/$1.js"');

const page = /* html */ `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="1200" height="600"></canvas>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">
import * as THREE from "three";
import { FlameSystem } from "/fire/FlameSystem.js";
import { FIRE_PRESETS } from "/fire/fireTypes.js";
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.autoClear = false;
const COLS = 6, ROWS = 2, TW = 200, TH = 300;
// the backdrop as the tone-mapped scene would show it: sky over ground
const LOOKS = [
  { exposure: 3.9e-5, sky: 0x9fb8d0, ground: 0x6b6247 },   // day, 45 deg sun
  { exposure: 22, sky: 0x05070d, ground: 0x0b0a08 },       // night, moonless
];
function backdrop(look) {
  const scene = new THREE.Scene();
  const mk = (color, y, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, h), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    m.position.set(0, y, 0); scene.add(m);
  };
  mk(look.sky, 0.35, 1.3); mk(look.ground, -0.65, 0.7);
  return scene;
}
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2); ortho.position.z = 1;
window.renderSheet = (preset) => {
  const c = FIRE_PRESETS[preset];
  const fire = new FlameSystem(undefined, 0); // no pipeline here: layer 0
  fire.setEmitters([{ position: new THREE.Vector3(0, 0, 0), preset, scale: 1, seed: 0.37, owner: 0 }]);
  const scene = new THREE.Scene();
  scene.add(fire.group);
  const tick = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  scene.add(tick);
  const h = c.shape.heightM * 1.35;
  const fov = 30;
  const dist = (h / 0.6) / (2 * Math.tan((fov * Math.PI) / 360));
  const cam = new THREE.PerspectiveCamera(fov, TW / TH, dist * 0.05, dist * 10);
  cam.position.set(0, h * 0.35, dist);
  cam.lookAt(0, h * 0.35, 0);
  tick.scale.setScalar(h * 0.012);
  renderer.setScissorTest(true);
  for (let row = 0; row < ROWS; row++) {
    const look = LOOKS[row];
    renderer.toneMappingExposure = look.exposure;
    const bg = backdrop(look);
    for (let col = 0; col < COLS; col++) {
      const x = col * TW, y = (ROWS - 1 - row) * TH;
      renderer.setViewport(x, y, TW, TH); renderer.setScissor(x, y, TW, TH);
      renderer.clear();
      renderer.render(bg, ortho);
      renderer.clearDepth();
      fire.update(col * 0.2, () => 1);
      renderer.render(scene, cam);
    }
  }
  fire.dispose();
  const gl = renderer.getContext();
  return { url: canvas.toDataURL("image/png"), error: gl.getError() };
};
window.presets = Object.keys(FIRE_PRESETS);
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({ headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const tab = await browser.newPage({ viewport: { width: 1200, height: 600 } });
  const errors = [];
  tab.on("pageerror", (e) => errors.push(e.message));
  tab.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text().slice(0, 4000)); });
  await tab.route("http://fire.local/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: page });
    if (files[path]) return route.fulfill({ contentType: "text/javascript", body: files[path]() });
    const m = path.match(/^\/fire\/(\w+)\.js$/);
    if (m) return route.fulfill({ contentType: "text/javascript", body: tsFile(`${m[1]}.ts`) });
    return route.fulfill({ status: 404, body: "" });
  });
  const t0 = Date.now();
  await tab.goto("http://fire.local/");
  await tab.waitForFunction(() => window.ready === true, null, { timeout: 30000 }).catch(() => {});
  if (errors.length) throw new Error(`page errors:\n${errors.join("\n")}`);
  const presets = wanted.length ? wanted : await tab.evaluate(() => window.presets);
  mkdirSync(outDir, { recursive: true });
  for (const preset of presets) {
    const { url, error } = await tab.evaluate((p) => window.renderSheet(p), preset);
    if (errors.length) throw new Error(`${preset}: shader or page errors:\n${errors.join("\n")}`);
    const file = join(outDir, `${preset}.png`);
    writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
    console.log(`${preset}: ${file}${error ? ` (gl error ${error})` : ""}`);
  }
  console.log(`${presets.length} sheets in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  await browser.close();
}
