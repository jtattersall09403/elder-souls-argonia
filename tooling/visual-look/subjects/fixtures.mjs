// `npm run look -- fixtures [<kit> <assetId> ...]`: the REAL flame shader
// (FlameSystem) burning on the REAL kit piece, at the anchors the interior
// loader computes (interiorFires.ts `interiorFlameAnchorsLocal` over the
// manifest row), so a flame's size against its fuel, wick or glass is judged
// on the geometry. Headless Chromium (SwiftShader), no studio, no world;
// ~0.4 s per fixture (the piece cut from the raw kit GLB,
// tooling/asset-pipeline/output/kits). Each sheet is 2 rows (day, night) x 3
// columns (front, three-quarter from above, close-up on the flame), one PNG
// per fixture. The fixture is drawn with its diffuse and alpha mode under a
// plain key light; the flame is drawn after it, depth-tested against it, as
// the game's post-water pass draws it (the flame layer here is 0: no pipeline).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");

const FIXTURES = [
  "works-v1|vanilla:clutter/woodfires/campfire01burning",
  "works-v1|vanilla:clutter/imperial/impbrazier01",
  "interior-farmhouse-v1|vanilla:clutter/common/torchpermanent01",
  "interior-farmhouse-v1|vanilla:clutter/woodfires/fireplacewood01burning",
  "settlement-imperial-v1|vanilla:clutter/common/candlelanternwithcandle01",
  "settlement-mud-v1|mudmother:gv_meshes/argoniannest/argonianlanterns03",
  "interior-farmhouse-v1|vanilla:clutter/candles/candlehorntable01",
  "interior-kotm-v1|vanilla:clutter/glazedcandles01",
  "interior-farmhouse-v1|vanilla:clutter/imperial/impcandle01",
  "mudmother-hut-int|mudmother:gv_meshes/argoniannest/argonianlanterns04",
  "settlement-mud-v1|mudmother:gv_meshes/argoniannest/argonianlanterns04",
  "interior-kotm-v1|kotm:argonia/clutter/townlantern04",
];

const threeDir = join(repo, "node_modules/three");
const kitsRaw = join(repo, "tooling/asset-pipeline/output/kits");
const kitsPublic = join(repo, "apps/world-studio/public/kits");
const tsFileIn = (fireDir) => (name) => ts.transpileModule(readFileSync(join(fireDir, name), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from "\.\/(\w+)"/g, 'from "/fire/$1.js"');

// One piece of a kit GLB as its own small GLB (geometry, diffuse, alpha mode):
// SwiftShader cannot hold a whole 80 MB kit, and size is judged on geometry.
// The piece's node is found as the studio names it (es|<hash>|<id tail>).
function pieceGlb(kitName, assetId) {
  const glb = readFileSync(join(kitsRaw, `${kitName}.glb`));
  const jsonLen = glb.readUInt32LE(12);
  const src = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
  const bin = glb.subarray(20 + jsonLen + 8);
  const tail = assetId.replace(":", "__").replace(/\//g, "_");
  const root = src.nodes.findIndex((n) => { const p = (n.name ?? "").split("|"); return p.length === 3 && tail.endsWith(p[2]); });
  if (root < 0) throw new Error(`no glb node for ${kitName}|${assetId}`);
  const out = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [], meshes: [], accessors: [],
    bufferViews: [], buffers: [{ byteLength: 0 }], materials: [{ pbrMetallicRoughness: {
      baseColorFactor: [0.55, 0.47, 0.38, 1], metallicFactor: 0, roughnessFactor: 0.9 } }] };
  // one flat material per source material, keeping its name: the page hides
  // a piece's own flame cards as the loader does (isFlameCardMaterial)
  const materials = new Map();
  const blob = (data) => {
    const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    chunks.push(data); offset += data.length;
  };
  const textures = new Map();
  const texture = (ti) => {
    if (!textures.has(ti)) {
      const img = src.images[src.textures[ti].source]; const v = src.bufferViews[img.bufferView];
      const start = offset + ((4 - (offset % 4)) % 4);
      blob(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
      out.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: v.byteLength });
      (out.images ??= []).push({ bufferView: out.bufferViews.length - 1, mimeType: img.mimeType });
      (out.textures ??= []).push({ source: out.images.length - 1 });
      textures.set(ti, out.textures.length - 1);
    }
    return textures.get(ti);
  };
  const material = (mi) => {
    if (mi === undefined) return 0;
    if (!materials.has(mi)) {
      // the source's diffuse and alpha mode ride along: an alpha-cut piece
      // (the torch's MASK wraps) drawn flat and opaque reads as a skeleton
      const sm = src.materials[mi]; const tex = sm.pbrMetallicRoughness?.baseColorTexture;
      // extras ride along too: the runtime reads the NIF shader flags there (fixtureGlow.ts)
      const m = { ...out.materials[0], name: sm.name, doubleSided: sm.doubleSided,
        ...(sm.extras ? { extras: sm.extras } : {}),
        ...(sm.alphaMode ? { alphaMode: sm.alphaMode, alphaCutoff: sm.alphaCutoff } : {}) };
      if (tex !== undefined) m.pbrMetallicRoughness = { ...m.pbrMetallicRoughness,
        baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: texture(tex.index) } };
      out.materials.push(m);
      materials.set(mi, out.materials.length - 1);
    }
    return materials.get(mi);
  };
  const chunks = []; let offset = 0;
  const accessor = (ai) => {
    const a = src.accessors[ai]; const v = src.bufferViews[a.bufferView];
    const data = bin.subarray((v.byteOffset ?? 0), (v.byteOffset ?? 0) + v.byteLength);
    const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    out.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: v.byteLength, ...(v.byteStride ? { byteStride: v.byteStride } : {}) });
    chunks.push(data); offset += data.length;
    out.accessors.push({ ...a, bufferView: out.bufferViews.length - 1 });
    return out.accessors.length - 1;
  };
  const copy = (ni) => {
    const n = src.nodes[ni]; const idx = out.nodes.length; const node = { ...n }; out.nodes.push(node);
    delete node.children; delete node.mesh;
    if (n.mesh !== undefined) {
      const m = src.meshes[n.mesh];
      out.meshes.push({ primitives: m.primitives.map((p) => ({ mode: p.mode, material: material(p.material),
        attributes: Object.fromEntries(Object.entries(p.attributes).filter(([k]) => k === "POSITION" || k === "NORMAL" || k === "TEXCOORD_0").map(([k, ai]) => [k, accessor(ai)])),
        ...(p.indices !== undefined ? { indices: accessor(p.indices) } : {}) })) });
      node.mesh = out.meshes.length - 1;
    }
    if (n.children) node.children = n.children.map(copy);
    return idx;
  };
  copy(root);
  const body = Buffer.concat(chunks); out.buffers[0].byteLength = body.length;
  let text = Buffer.from(JSON.stringify(out), "utf8");
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const binPad = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + text.length + 8 + binPad.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  return Buffer.concat([head, ch(text.length, 0x4e4f534a), text, ch(binPad.length, 0x004e4942), binPad]);
}

const page = /* html */ `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="1200" height="800"></canvas>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FlameSystem } from "/fire/FlameSystem.js";
import { FIRE_PRESETS } from "/fire/fireTypes.js";
import { interiorFlameAnchorsLocal } from "/fire/interiorFires.js";
import { isFlameCardMaterial, manifestBoxYUp } from "/fire/flameAnchors.js";
import { applyLanternShell, isLanternShellMaterial } from "/settlement/fixtureGlow.js";
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.autoClear = false;
const COLS = 3, ROWS = 2, TW = 400, TH = 400;
const LOOKS = [
  { exposure: 3.9e-5, bg: 0x9fb8d0, key: 2.2, amb: 0.9 },
  { exposure: 22, bg: 0x06070b, key: 0.05, amb: 0.08 },
];
const kits = new Map();
async function kit(name) {
  if (!kits.has(name)) {
    const manifest = await fetch("/pub/" + name + ".kit.json").then((r) => r.json());
    kits.set(name, { rows: new Map(manifest.assets.map((a) => [a.id, a])) });
  }
  return kits.get(name);
}
window.renderFixture = async (key) => {
  const [kitName, assetId] = key.split("|");
  const k = await kit(kitName);
  const row = k.rows.get(assetId);
  if (!row) throw new Error("no manifest row " + key);
  const gltf = await new GLTFLoader().loadAsync("/piece/" + encodeURIComponent(key));
  const node = gltf.scene.children[0];
  node.traverse((o) => { if (o.isMesh && isFlameCardMaterial(row, o.material.name)) o.visible = false; });
  // a lantern's shell glows as the runtime patch makes it (fixtureGlow.ts),
  // on the lamp clock: out in the day row, lit in the night row
  const shells = [];
  node.traverse((o) => { if (o.isMesh && isLanternShellMaterial(o.material, row)) { applyLanternShell(o.material); shells.push(o.material); } });
  const piece = node.clone(true);
  piece.position.set(0, 0, 0);
  piece.updateMatrixWorld(true);
  const want = manifestBoxYUp(row);
  const got = new THREE.Box3().setFromObject(piece);
  piece.position.copy(want.min).sub(got.min);
  const scene = new THREE.Scene();
  scene.add(piece);
  const amb = new THREE.AmbientLight(0xffffff, 1);
  const sun = new THREE.DirectionalLight(0xfff1dd, 1);
  sun.position.set(2, 4, 3);
  scene.add(amb, sun);
  const anchors = interiorFlameAnchorsLocal(row, want);
  const fire = new FlameSystem(undefined, 0);
  fire.setEmitters(anchors.map((a, i) => ({ position: a.local, preset: a.preset, scale: 1, seed: 0.37 + i * 0.13, owner: 0 })));
  const fireScene = new THREE.Scene();
  fireScene.add(fire.group);
  const size = want.getSize(new THREE.Vector3());
  const top = Math.max(want.max.y, ...anchors.map((a) => a.local.y + FIRE_PRESETS[a.preset].shape.heightM));
  const centre = new THREE.Vector3((want.min.x + want.max.x) / 2, (want.min.y + top) / 2, (want.min.z + want.max.z) / 2);
  const span = Math.max(size.x, size.z, top - want.min.y) * 1.25;
  const flameAt = anchors.length ? anchors[0].local.clone() : centre.clone();
  const flameH = anchors.length ? FIRE_PRESETS[anchors[0].preset].shape.heightM : span / 4;
  flameAt.y += flameH * 0.35;
  const views = [
    { at: centre, dir: new THREE.Vector3(0, 0.05, 1), span },
    { at: centre, dir: new THREE.Vector3(0.7, 0.55, 0.7), span },
    // the close-up is a section: geometry more than 1.2 flame heights in front
    // of the flame is clipped, so a cage bar nearer the camera never reads as
    // a bar the flame touches (argonianlanterns04, walk 6)
    { at: flameAt, dir: new THREE.Vector3(0.3, 0.15, 1), span: Math.max(flameH * 2.4, 0.12), sectionM: flameH * 1.2 },
  ];
  renderer.setScissorTest(true);
  for (let r = 0; r < ROWS; r++) {
    const look = LOOKS[r];
    amb.intensity = look.amb; sun.intensity = look.key;
    for (const s of shells) s.emissiveIntensity = r === 1 ? 1 : 0;
    for (let c = 0; c < COLS; c++) {
      const v = views[c];
      const fov = 35;
      const dist = v.span / (2 * Math.tan((fov * Math.PI) / 360));
      const near = v.sectionM ? Math.max(dist * 0.02, dist - v.sectionM) : dist * 0.02;
      const cam = new THREE.PerspectiveCamera(fov, TW / TH, near, dist * 20);
      cam.position.copy(v.at).addScaledVector(v.dir.clone().normalize(), dist);
      cam.lookAt(v.at);
      const x = c * TW, y = (ROWS - 1 - r) * TH;
      renderer.setViewport(x, y, TW, TH); renderer.setScissor(x, y, TW, TH);
      renderer.setClearColor(look.bg); renderer.clear();
      renderer.toneMappingExposure = 1;
      renderer.render(scene, cam);
      renderer.toneMappingExposure = look.exposure;
      fire.update(0.3 + c * 0.4, () => 1);
      renderer.render(fireScene, cam);
    }
  }
  fire.dispose();
  return { url: canvas.toDataURL("image/png"), shells: shells.length, anchors: anchors.map((a) => ({ preset: a.preset, y: +a.local.y.toFixed(3) })),
    box: { min: want.min.toArray().map((n) => +n.toFixed(3)), max: want.max.toArray().map((n) => +n.toFixed(3)) } };
};
window.ready = true;
</script></body></html>`;

/** Sheets for `fixtures` ("kit|assetId" keys; empty = FIXTURES) into outDir.
 * fireDir: another copy of fx/fire (e.g. HEAD's, for a before/after pair). */
export async function runFixtures({ fixtures, outDir, fireDir }) {
const list = fixtures.length ? fixtures : FIXTURES;
const tsFile = tsFileIn(fireDir ? resolve(fireDir) : join(repo, "packages/game-core/src/fx/fire"));
const browser = await chromium.launch({ headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const tab = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  tab.on("pageerror", (e) => errors.push(e.message));
  tab.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 4000)); });
  await tab.route("http://fire.local/**", (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/") return route.fulfill({ contentType: "text/html", body: page });
    if (path.startsWith("/three/")) return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(threeDir, path.slice(7)), "utf8") });
    if (path.startsWith("/piece/")) {
      const [kitName, assetId] = path.slice(7).split("|");
      return route.fulfill({ contentType: "model/gltf-binary", body: pieceGlb(kitName, assetId) });
    }
    if (path.startsWith("/pub/")) return route.fulfill({ contentType: "application/json", body: readFileSync(join(kitsPublic, path.slice(5))) });
    if (path === "/settlement/fixtureGlow.js") return route.fulfill({ contentType: "text/javascript",
      body: tsFileIn(join(repo, "packages/game-core/src/settlement"))("fixtureGlow.ts") });
    const m = path.match(/^\/fire\/(\w+)\.js$/);
    if (m) return route.fulfill({ contentType: "text/javascript", body: tsFile(`${m[1]}.ts`) });
    return route.fulfill({ status: 404, body: "" });
  });
  const t0 = Date.now();
  await tab.goto("http://fire.local/");
  await tab.waitForFunction(() => window.ready === true, null, { timeout: 60000 }).catch(() => {});
  if (errors.length) throw new Error(`page errors:\n${errors.join("\n")}`);
  mkdirSync(outDir, { recursive: true });
  const sheets = [];
  for (const key of list) {
    const { url, shells, anchors, box } = await tab.evaluate((k) => window.renderFixture(k), key);
    const file = join(outDir, `${key.split("|")[0]}__${key.split("|")[1].split("/").pop()}.png`);
    writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
    console.log(`${key}: ${file} shells ${shells} box ${JSON.stringify(box)} anchors ${JSON.stringify(anchors)}`);
    sheets.push({ key, file, facts: `${key}: box ${JSON.stringify(box)} anchors ${JSON.stringify(anchors)} shells ${shells}` });
  }
  if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
  console.log(`${list.length} sheets in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return sheets;
} finally {
  await browser.close();
}
}
