// Seam look (16k walk 9): the base of one placed building on its own ground,
// with the published ground paint (ways, trampled ring, contact shade) and
// without it, through the runtime kit loader and paint material. Headless
// Chromium + SwiftShader, no studio.
//   npm run look -- seam <placeId> <placement-id-suffix> [--bearing DEG] [--out DIR]
// Writes <place>__<suffix>__b<bearing>_{live,bare}.png and prints the timing.
import { build } from "vite";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(here, "../../..");
const pub = join(repo, "apps/world-studio/public");

export async function runSeam({ place, suffix, bearing = 0, outDir, width = 480, height = 270, distM = 6, eyeM = 1.2 }) {
  const t0 = Date.now();
  const py = spawnSync("python3", [join(here, "seam_ground.py"), place, suffix], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (py.status !== 0) throw new Error(py.stderr.slice(-2000));
  const g = JSON.parse(py.stdout);
  const row = g.row;
  const partsIndex = join(pub, "kits", row.kit, "parts/index.json");
  const part = existsSync(partsIndex) ? JSON.parse(readFileSync(partsIndex, "utf8")).assets[row.assetId] : undefined;
  if (!part) throw new Error(`${row.assetId} has no part in kits/${row.kit}/parts/index.json`);
  const set = JSON.parse(readFileSync(join(pub, "textures/ground/index.json"), "utf8")).default;
  const rows = JSON.parse(readFileSync(join(pub, "textures/ground", set, "materials.json"), "utf8")).materials;
  const dist = join(tmpdir(), "es-seam-look");
  await build({ logLevel: "error", root: here, configFile: false, define: { "process.env.NODE_ENV": '"production"' },
    build: { outDir: dist, emptyOutDir: true, minify: false,
      lib: { entry: join(here, "seamEntry.ts"), formats: ["iife"], name: "S", fileName: () => "s.js" } } });
  const tBuilt = Date.now();
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 500)); });
    const types = { ".png": "image/png", ".json": "application/json", ".js": "text/javascript", ".wasm": "application/wasm",
      ".ktx2": "image/ktx2", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".webp": "image/webp" };
    await page.route("http://seam.local/**", (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname);
      if (path === "/") return route.fulfill({ contentType: "text/html", body: "<html><body style='margin:0'></body></html>" });
      if (path === "/s.js") return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(dist, "s.js")) });
      const file = path.startsWith("/basis/")
        ? join(repo, "node_modules/three/examples/jsm/libs/basis", path.slice(7)) : join(pub, path);
      if (!existsSync(file)) { errors.push(`404 ${path}`); return route.fulfill({ status: 404, body: "" }); }
      return route.fulfill({ contentType: types[extname(path)] ?? "application/octet-stream", body: readFileSync(file) });
    });
    await page.goto("http://seam.local/");
    await page.addScriptTag({ url: "http://seam.local/s.js" });
    const res = await page.evaluate((o) => window.runSeam(o), {
      base: "http://seam.local/", set, rows, entries: g.paint.entries,
      grid: { x0: g.x0, z0: g.z0, step: g.step, n: g.n, heights: g.heights, wet: g.wet },
      place: row, glbUrl: `/kits/${row.kit}/parts/${part.file}`,
      bearingDeg: bearing, distM, eyeM, width, height });
    if (errors.length) console.error(`page errors:\n${errors.join("\n")}`);
    const slug = `${place.split(".").pop()}__${suffix.replace(/[^a-z0-9]+/gi, "_")}__b${bearing}`;
    const files = Object.entries(res.shots).map(([k, url]) => {
      const f = join(outDir, `${slug}_${k}.png`);
      writeFileSync(f, Buffer.from(url.split(",")[1], "base64"));
      return f;
    });
    const timing = { groundS: +((tBuilt - t0) / 1000).toFixed(1), totalS: +((Date.now() - t0) / 1000).toFixed(1),
      frameMs: res.frameMs, setupMs: res.setupMs };
    return { files, facts: { paintEntries: res.paintEntries, paintVertices: res.paintVertices, wallM: res.wallM, eyeM: res.eyeM, ...timing } };
  } finally {
    await browser.close();
  }
}
