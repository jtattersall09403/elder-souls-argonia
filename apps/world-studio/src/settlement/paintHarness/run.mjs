// Path-paint harness (16k walk 7; no studio): bundles entry.ts with vite,
// draws a place's PUBLISHED ground paint through WorldSky's material chain in
// headless Chromium on SwiftShader, writes one PNG per view and prints the
// paint's and a control track strip's contrast against the bare ground at
// each range (they must fall off together: the paint hazes like the ground).
//   node apps/world-studio/src/settlement/paintHarness/run.mjs [placeId] [--wiped] [--out DIR]
// --wiped skips the paint's reapply (the walk-7 defect, for a before image).
import { build } from "vite";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(here, "../../../../..");
const pub = join(repo, "apps/world-studio/public");
const args = process.argv.slice(2);
const placeId = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--out"))
  ?? "place.imperial-fringe.claywater-station";
const outDir = resolve(repo, args.includes("--out") ? args[args.indexOf("--out") + 1] : "tmp/paint-harness");
mkdirSync(outDir, { recursive: true });
const dist = join(tmpdir(), "es-paint-harness");
await build({ logLevel: "error", root: here, configFile: false, define: { "process.env.NODE_ENV": '"production"' },
  build: { outDir: dist, emptyOutDir: true, minify: false,
    lib: { entry: join(here, "entry.ts"), formats: ["iife"], name: "P", fileName: () => "p.js" } } });
const find = (o) => { if (o && typeof o === "object") { if (o.groundPaint) return o;
  for (const v of Object.values(o)) { const r = find(v); if (r) return r; } } return null; };
const bundle = find(JSON.parse(readFileSync(join(pub, "province/settlements", `${placeId}.json`), "utf8")));
// the vocabulary as it stands NOW (texture, soft edge, strength by way kind),
// so a vocab change is judged before the places are re-exported
const vocab = JSON.parse(readFileSync(join(repo, "world/sources/vocab/ground-paint.json"), "utf8")).kinds;
const entries = bundle.groundPaint.entries.map((e) => ({ ...e, ...(vocab[e.kind] ?? {}) }));
const set = JSON.parse(readFileSync(join(pub, "textures/ground/index.json"), "utf8")).default;
const rows = JSON.parse(readFileSync(join(pub, "textures/ground", set, "materials.json"), "utf8")).materials;
// the longest way: the camera looks along it from its first point
const longest = entries.reduce((a, e) => ((e.centrelineM?.length ?? 0) > (a.centrelineM?.length ?? 0) ? e : a));
const c = longest.centrelineM ?? longest.polygonM;
const [ax, az] = c[0]; const [bx, bz] = c[c.length - 1];
const len = Math.hypot(bx - ax, bz - az) || 1; const ux = (bx - ax) / len; const uz = (bz - az) / len;
const mid = [(ax + bx) / 2, 0, (az + bz) / 2];
const shot = (d, h) => ({ eye: [mid[0] - ux * d, h, mid[2] - uz * d], at: mid });
// ground level beside the way, then along it from 40, 150 and 300 m
const shots = [{ eye: [mid[0] - uz * 5 - ux * 6, 1.7, mid[2] + ux * 5 - uz * 6], at: mid },
  { eye: [mid[0] + 0.01, 45, mid[2] + 30], at: mid }, shot(40, 8), shot(150, 12), shot(300, 18)];
// control: a strip of opaque track texture 12 m to the side of the way's middle
const sx = mid[0] - uz * 12; const sz = mid[2] + ux * 12;
const control = [sx - 4, sz - 30, sx + 4, sz + 30];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.error("[page]", m.text()); });
const types = { ".png": "image/png", ".json": "application/json", ".js": "text/javascript" };
await page.route("http://paint.local/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/") return route.fulfill({ contentType: "text/html", body: "<html><body style='margin:0'></body></html>" });
  if (path === "/p.js") return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(dist, "p.js")) });
  return route.fulfill({ contentType: types[extname(path)] ?? "application/octet-stream", body: readFileSync(join(pub, path)) });
});
await page.goto("http://paint.local/");
await page.addScriptTag({ url: "http://paint.local/p.js" });
const res = await page.evaluate((o) => window.runPaint(o), {
  base: "http://paint.local/", set, rows, entries, shots, mist: 0.6, control, wiped: args.includes("--wiped") });
const tag = args.includes("--wiped") ? "wiped" : "live";
const report = res.map((r, i) => {
  const file = join(outDir, `${placeId}_${tag}_${i}_${r.dist}m.png`);
  writeFileSync(file, Buffer.from(r.img.split(",")[1], "base64"));
  return { file, dist: r.dist, paint: r.paint, control: r.control };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
