// Close-up look sheets (16k walk 6): one subject, six close views, the
// runtime materials and the runtime fire layer, a grid and the bounds, then
// a ready-to-paste Sonnet judge brief built from look-lists.md.
//
//   npm run look -- piece <kit> <assetId> [--class C] [--out DIR]
//   npm run look -- place <scene> <x> <z> [--radius M] [--out DIR]
//   npm run look -- fixtures [<kit> <assetId> ...]   (subjects/fixtures.mjs)
//   npm run look -- preset [<presetId> ...]          (subjects/preset.mjs)
//
// piece/composite: headless Chromium + SwiftShader draws the PUBLISHED kit
// asset (apps/world-studio/public/kits: the per-asset part GLB when the kit
// has one, else the node out of the kit GLB) through the runtime kit loader
// path (KTX2 + meshopt), and the flames through the runtime FlameSystem at
// the anchors fx/fire/flameAnchors.ts gives the manifest row (the same call
// settlement/lighting.ts makes). Day tiles use the day exposure of the light
// rig (3.9e-5), the night tile 22, as the preset subject does.
// place: a workbench scene region; delegates to wb.py render (Blender).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import ts from "typescript";
import { classesFor, FIXTURE_SHEET_KEY, PLACE_SHEET_KEY, judgeBrief, parseArgs, readLookList } from "./lookArgs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const t0 = Date.now();
let opts;
try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
const outDir = resolve(repo, opts.out);
mkdirSync(outDir, { recursive: true });
const rows = readLookList(join(here, "look-lists.md"));
const slug = (s) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(-80);

if (opts.mode === "fixtures" || opts.mode === "preset") {
  const { runFixtures } = await import("./subjects/fixtures.mjs");
  const { runPresets } = await import("./subjects/preset.mjs");
  if (opts.mode === "fixtures") {
    const sheets = await runFixtures({ fixtures: opts.fixtures, outDir, fireDir: opts.fireDir });
    console.log(`\n--- judge brief (paste to a Sonnet general-purpose agent) ---\n` + judgeBrief({
      subject: `fire fixtures: ${sheets.map((s) => s.key).join(", ")}`,
      images: sheets.map((s) => s.file), classes: opts.classes ?? ["fire-fixture"], rows,
      facts: sheets.map((s) => s.facts).join("; "), sheetKey: FIXTURE_SHEET_KEY,
    }));
  } else await runPresets({ presets: opts.presets, outDir });
  console.log(`look: ${opts.mode} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(0);
}

if (opts.mode === "seam") {
  const { runSeam } = await import("./subjects/seam.mjs");
  const { files, facts } = await runSeam({ place: opts.place, suffix: opts.suffix, bearing: opts.bearing ?? 0, outDir });
  console.log(`\n--- judge brief (paste to a Sonnet general-purpose agent) ---\n` + judgeBrief({
    subject: `${opts.place} ${opts.suffix}: the building's base on the ground (the _live image; _bare is without the ground paint)`,
    images: files, classes: opts.classes ?? ["building-seam"], rows, facts: JSON.stringify(facts),
    sheetKey: "one building's base from 6 m at 1.2 m eye, on its own padded ground (plain grass texture, no "
      + "terrain road paint, vegetation or water); _live has the place's ground paint, _bare has none. "
      + "Ignore the `all` rows about grids and bounds: this view has neither.",
  }));
  console.log(`look: seam in ${((Date.now() - t0) / 1000).toFixed(1)} s (${JSON.stringify(facts)})`);
  process.exit(0);
}

if (opts.mode === "place") {
  const sceneFile = join(repo, "tooling/placement-workbench/output/scenes", `${opts.scene}.json`);
  const scene = JSON.parse(readFileSync(sceneFile, "utf8"));
  const near = scene.pieces.filter((p) => Math.hypot(p.x - opts.x, p.z - opts.z) <= opts.radius);
  if (!near.length) { console.error(`no piece within ${opts.radius} m of ${opts.x},${opts.z} in ${opts.scene}`); process.exit(1); }
  const focus = near.map((p) => p.uid);
  const images = [];
  for (const [view, extra] of [["iso", ["--bearing", "45"]], ["iso", ["--bearing", "225"]], ["side", []], ["top", []]]) {
    const png = join(outDir, `${opts.scene}_${opts.x}_${opts.z}_${view}${extra[1] ?? ""}.png`);
    const r = spawnSync("python3", [join(repo, "tooling/placement-workbench/wb.py"), opts.scene, "render", view,
      "--focus", ...focus, "--span", String(opts.radius * 2), "--res", "900", ...extra, "--out", png],
    { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) { console.error(r.stderr.slice(-2000)); process.exit(1); }
    images.push(png);
  }
  const classes = opts.classes ?? [...new Set(near.flatMap((p) => classesFor({ id: p.asset })))];
  console.log(`\n--- judge brief (paste to a Sonnet general-purpose agent) ---\n` + judgeBrief({
    subject: `${opts.scene} region ${opts.x},${opts.z} r${opts.radius} m (${near.map((p) => `${p.uid}=${p.asset}`).join(", ")})`,
    images, classes, rows, facts: `workbench scene poses; span ${opts.radius * 2} m`, sheetKey: PLACE_SHEET_KEY,
  }));
  console.log(`look: ${images.length} views in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(0);
}

// ---- piece / composite: the three.js runtime path ----
const kitsDir = join(repo, "apps/world-studio/public/kits");
const manifest = JSON.parse(readFileSync(join(kitsDir, `${opts.kit}.kit.json`), "utf8"));
const row = manifest.assets.find((a) => a.id === opts.asset);
if (!row) { console.error(`${opts.asset} not in ${opts.kit}.kit.json`); process.exit(1); }
const partsIndex = join(kitsDir, opts.kit, "parts/index.json");
const part = existsSync(partsIndex) ? JSON.parse(readFileSync(partsIndex, "utf8")).assets[opts.asset] : undefined;
const glbUrl = part ? `/kits/${opts.kit}/parts/${part.file}` : `/kits/${opts.kit}.glb`;
const classes = opts.classes ?? classesFor(row, opts.kit);

const threeDir = join(repo, "node_modules/three");
const gcDir = join(repo, "packages/game-core/src");
// A game-core module by its path under src (no extension), served at /gc/<path>.js;
// every relative import is resolved against the module's own folder, so a fire
// module importing ../../render/post/BloomPass loads (walk 9: the page 404'd on it).
const tsFile = (rel) => ts.transpileModule(readFileSync(join(gcDir, `${rel}.ts`), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from "(\.{1,2}\/[^"]+)"/g, (_, spec) => `from "/gc/${posix.join(posix.dirname(rel), spec)}.js"`);

const page = /* html */ `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="gl" width="480" height="400"></canvas><canvas id="sheet" width="1440" height="800"></canvas>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { FlameSystem } from "/fire/FlameSystem.js";
import { pieceFlameAnchorsLocal, manifestBoxYUp, isFlameCardMaterial, flameCardBedAnchorLocal, flameAnchorFailures } from "/fire/flameAnchors.js";
import { FIRE_PRESETS } from "/fire/fireTypes.js";
const TW = 480, TH = 400;
const gl = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const sheet = document.getElementById("sheet").getContext("2d");
window.look = async ({ url, node, row, fromPart }) => {
  const loader = new GLTFLoader();
  loader.setKTX2Loader(new KTX2Loader().setTranscoderPath("/basis/").detectSupport(renderer));
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  let obj = gltf.scene;
  if (!fromPart) {
    obj = gltf.scene.getObjectByName(node) ?? gltf.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(node));
    if (!obj) throw new Error("node " + node + " not in kit GLB");
    obj.removeFromParent(); obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.setScalar(1);
  }
  const hidden = [];
  obj.traverse((m) => {
    if (!m.isMesh) return;
    for (const mat of [m.material].flat()) if (isFlameCardMaterial(row, mat.name)) { m.visible = false; hidden.push(mat.name); }
  });
  obj.updateMatrixWorld(true);
  const measured = new THREE.Box3().setFromObject(obj);
  const box = manifestBoxYUp(row) ?? measured.clone();
  const bed = flameCardBedAnchorLocal(row, box);
  const anchors = bed ? [bed] : pieceFlameAnchorsLocal(row, box, !!row.light);
  // layer 0: this page has no post-water pass, and the camera sees layer 0
  // only; the runtime default (FIRE_LAYER) would hide every flame here.
  const fire = new FlameSystem(undefined, 0);
  fire.setEmitters(anchors.map((a, i) => ({ position: a.local.clone(), preset: a.preset, scale: 1, seed: 0.37 + i * 0.11, owner: 0 })));
  fire.update(0.6, () => 1);
  const size = box.getSize(new THREE.Vector3());
  // frame the piece AND its flames (an anchor above the bounds must show)
  const frame = box.clone();
  for (const a of anchors) frame.expandByPoint(a.local).expandByPoint(a.local.clone().add(new THREE.Vector3(0, FIRE_PRESETS[a.preset]?.shape?.heightM ?? 0, 0)));
  const centre = frame.getCenter(new THREE.Vector3());
  const r = Math.max(frame.getSize(new THREE.Vector3()).length() / 2, 0.15);
  const span = Math.max(size.x, size.z), step = span < 1.5 ? 0.1 : span < 5 ? 0.25 : 1;
  const extent = Math.max(4 * step, Math.ceil((Math.max(size.x, size.z) * 1.6) / step) * step);
  const scene = new THREE.Scene();
  scene.add(obj, fire.group);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(extent * 2, extent * 2),
    new THREE.MeshBasicMaterial({ color: 0x6b6247, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const grid = new THREE.GridHelper(extent * 2, Math.round((extent * 2) / step), 0xffffff, 0x999999);
  grid.material.toneMapped = false; scene.add(grid);
  const bw = new THREE.Box3Helper(box, 0x00ff66); bw.material.toneMapped = false; scene.add(bw);
  for (const a of anchors) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r * 0.012, 0.004), 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    d.position.copy(a.local); scene.add(d);
  }
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x5a4a30, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1); sun.position.set(0.6, 1, 0.8).multiplyScalar(100); scene.add(sun);
  // a piece with a flame or any emissive map (window glass, glow maps) gets
  // the night tile, so a glow that should or should not show is judged (audit10 c3)
  let emits = false;
  scene.traverse((o) => { for (const m of [o.material].flat()) if (m && m.emissiveMap) emits = true; });
  const isFire = anchors.length > 0 || emits;
  const fov = 35, dist = (r / Math.sin((fov * Math.PI) / 360)) * 1.05;
  const at = (bearing, elev, d = dist, target = centre) => {
    const b = (bearing * Math.PI) / 180, e = (elev * Math.PI) / 180;
    return { pos: new THREE.Vector3(target.x + Math.sin(b) * Math.cos(e) * d, target.y + Math.sin(e) * d, target.z + Math.cos(b) * Math.cos(e) * d), target };
  };
  const eyeD = Math.max(1.2, r * 2.2);
  const views = [
    ["front", at(0, 10)], ["3/4", at(45, 25)], ["side", at(90, 10)], ["top-down", at(30, 70)],
    ["eye 1.7 m", { pos: new THREE.Vector3(centre.x, 1.7, centre.z + eyeD), target: new THREE.Vector3(centre.x, Math.min(centre.y, 1.7), centre.z) }],
    isFire ? ["night 3/4", at(45, 20), true]
      : ["low grazing front", { pos: new THREE.Vector3(centre.x, 0.05, centre.z + box.max.z - centre.z + dist * 0.9), target: new THREE.Vector3(centre.x, 0.05, centre.z) }],
  ];
  sheet.fillStyle = "#000"; sheet.fillRect(0, 0, 1440, 800);
  views.forEach(([name, v, night], i) => {
    const exposure = night ? 22 : 3.9e-5;
    renderer.toneMappingExposure = exposure;
    hemi.intensity = night ? 0.02 : 0.9 / exposure; sun.intensity = night ? 0 : 2.2 / exposure;
    scene.background = new THREE.Color(night ? 0x05070d : 0x6f8396); // a clear colour is not tone-mapped
    const cam = new THREE.PerspectiveCamera(fov, TW / TH, Math.max(0.005, r * 0.01), dist * 20);
    cam.position.copy(v.pos); cam.lookAt(v.target);
    fire.update(0.4 + i * 0.2, () => 1);
    renderer.render(scene, cam);
    const x = (i % 3) * TW, y = Math.floor(i / 3) * TH;
    sheet.drawImage(gl, x, y);
    sheet.fillStyle = "rgba(0,0,0,0.6)"; sheet.fillRect(x, y, TW, 20);
    sheet.fillStyle = "#fff"; sheet.font = "13px monospace";
    sheet.fillText(name + " | grid " + (step >= 1 ? step + " m" : Math.round(step * 100) + " cm") + " | bounds " + size.toArray().map((s) => s.toFixed(2)).join("x") + " m", x + 6, y + 14);
  });
  const flameCards = fire.flameInstances, flameIntensity0 = fire.flameInstances ? +fire.flameIntensity(0).toFixed(3) : null, flamePos0 = fire.flameInstances ? fire.flamePosition(0).toArray().map((v) => +v.toFixed(3)) : null;
  fire.dispose();
  return {
    url: document.getElementById("sheet").toDataURL("image/png"),
    facts: { boundsM: size.toArray().map((s) => +s.toFixed(3)), boundsMinY: +box.min.y.toFixed(3),
      measuredBoundsM: measured.getSize(new THREE.Vector3()).toArray().map((s) => +s.toFixed(3)),
      anchorFailures: flameAnchorFailures(row.id, row, box, anchors),
      presetHeightsM: Object.fromEntries(anchors.map((a) => [a.preset, FIRE_PRESETS[a.preset]?.shape?.heightM])),
      anchors: anchors.map((a) => ({ preset: a.preset, local: a.local.toArray().map((v) => +v.toFixed(3)), record: a.record })),
      hiddenFlameCards: hidden, flameCards, flameIntensity0, flamePos0, gridStepM: step, glError: renderer.getContext().getError() },
  };
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({ headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const tab = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = [];
  tab.on("pageerror", (e) => errors.push(e.message));
  tab.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text().slice(0, 2000)); });
  await tab.route("http://look.local/**", (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = (p, type) => route.fulfill({ contentType: type, body: readFileSync(p) });
    if (path === "/") return route.fulfill({ contentType: "text/html", body: page });
    if (path.startsWith("/three/")) return file(join(threeDir, path.slice(7)), "text/javascript");
    if (path.startsWith("/basis/")) return file(join(threeDir, "examples/jsm/libs/basis", path.slice(7)),
      path.endsWith(".wasm") ? "application/wasm" : "text/javascript");
    if (path.startsWith("/kits/")) return file(join(kitsDir, path.slice(6)), path.endsWith(".ktx2") ? "image/ktx2" : "model/gltf-binary");
    // a JSON import (BloomPass's bloom.config.json) is served as an ES module
    const j = path.match(/^\/gc\/([\w/.-]+\.json)\.js$/);
    if (j) return route.fulfill({ contentType: "text/javascript",
      body: `export default ${readFileSync(join(gcDir, j[1]), "utf8")};` });
    const m = path.match(/^\/fire\/(\w+)\.js$/) ?? path.match(/^\/gc\/([\w/]+)\.js$/);
    if (m) return route.fulfill({ contentType: "text/javascript", body: tsFile(path.startsWith("/fire/") ? `fx/fire/${m[1]}` : m[1]) });
    if (path === "/favicon.ico") return route.fulfill({ status: 204, body: "" });
    errors.push(`404 ${path}`);
    return route.fulfill({ status: 404, body: "" });
  });
  await tab.goto("http://look.local/");
  await tab.waitForFunction(() => window.ready === true, null, { timeout: 30000 }).catch(() => {});
  if (errors.length) throw new Error(`page errors:\n${errors.join("\n")}`);
  const { url, facts } = await tab.evaluate((a) => window.look(a),
    { url: glbUrl, node: row.node, row, fromPart: !!part });
  if (errors.length) console.error(`page warnings:\n${errors.join("\n")}`);
  const png = join(outDir, `${opts.kit}__${slug(opts.asset)}.png`);
  writeFileSync(png, Buffer.from(url.split(",")[1], "base64"));
  const factLine = JSON.stringify({ source: part ? "part GLB" : "kit GLB node", fixtureKind: row.light?.fixtureKind ?? null,
    anchorClass: row.anchorClass, ...facts });
  writeFileSync(png.replace(/\.png$/, ".json"), factLine + "\n");
  console.log(`sheet: ${png}`);
  console.log(`\n--- judge brief (paste to a Sonnet general-purpose agent) ---\n` + judgeBrief({
    subject: `${opts.kit} ${opts.asset}`, images: [png], classes, rows, facts: factLine }));
  console.log(`look: 1 sheet in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  await browser.close();
}
