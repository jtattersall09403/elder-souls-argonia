// Flame check (16k walk 7): are the flames VISIBLE in the studio that will
// deploy? It loads the composed Pages site (site/, what
// `npm run build -w @elder-souls/world-studio` + `npm run site:compose`
// produce and the deploy uploads) or a deployed studio URL headless
// (Chromium + SwiftShader), opens one interior cell or one outdoor spot, and
// measures the frame the player sees:
//   flameSystems  FlameSystem groups ("fire-flames") under the subject
//   emitters      flame card instances those systems draw
//   draws         draw calls of the flame-card mesh
//   onScreen      cards 2-30 m away whose position (the system's instance
//                 data through the group's world matrix: where the flames
//                 belong) projects inside the frame
//   visible       on-screen cards whose pixels change when the flames are
//                 shown (read back from the default framebuffer right after
//                 the pipeline's on-screen passes: flames off, on, off; the
//                 off/off difference is the noise floor)
// It FAILS (exit 1) when any of these is zero, and writes the frame (flames
// on) as a PNG beside the JSON result.
//
//   node tooling/visual-look/flames.mjs interior <cellId> <xKm> <zKm> [--site DIR | --url BASE]
//   node tooling/visual-look/flames.mjs place <xKm> <zKm> [--t 22] [--site DIR | --url BASE]
//   flags: --out DIR (default tooling/.reports/flames), --force (ignore the
//   key), --data-base URL (fetch province data for the key from here, not
//   the page base: the webgpu build serves its data under /studio/),
//   --empty-fires (serve every kit parts index with an empty fires
//   map: the check must FAIL; proves it can)
//
// Cheap by design (owner ruling, 16k walk 7): one cell or spot, a 400 x 225
// viewport at quality tier low, measured at the first stable frame (camera
// still for two frames), at most four quarter turns when no card is on
// screen. It is never time-boxed and never runs in preflight or CI. Target:
// under 60 s on this machine (measured 2026-10-01: see the report's elapsedS
// line). A run over its target is fixed by shrinking the method, never by
// raising the target.
// Keyed: a sha256 over the fire sources (packages/game-core/src/fx/fire,
// flame materials included), this script, and for an interior the cell's
// bundle plus the fires map of every kit it draws (read from the target
// site). The key is stored in the result JSON; an unchanged key prints the
// stored verdict and exits with it without opening a browser.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const FIRE_DIR = join(repo, "packages/game-core/src/fx/fire");
const COUNTS = ["flameSystems", "emitters", "draws", "onScreen", "visible"];

export function parseFlameArgs(argv) {
  const [mode, ...rest] = argv;
  const flags = {}; const pos = [];
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) { pos.push(rest[i]); continue; }
    const name = rest[i].slice(2);
    if (name === "force" || name === "empty-fires") flags[name] = true;
    else { flags[name] = rest[i + 1]; i++; }
  }
  if (mode === "interior" && pos.length === 3) return { mode, cell: pos[0], x: pos[1], z: pos[2], ...common(flags, "12") };
  if (mode === "place" && pos.length === 2) return { mode, cell: null, x: pos[0], z: pos[1], ...common(flags, "22") };
  throw new Error("usage: flames.mjs interior <cellId> <xKm> <zKm> | place <xKm> <zKm> [--site DIR | --url BASE] [--data-base URL] [--t H] [--out DIR] [--force] [--empty-fires]");
}
function common(f, t) {
  return {
    site: resolve(repo, f.site ?? "site"), url: f.url ?? null, dataBase: f["data-base"] ?? null, t: f.t ?? t,
    out: resolve(repo, f.out ?? "tooling/.reports/flames"), minDelta: Number(f["min-delta"] ?? 12),
    force: !!f.force, emptyFires: !!f["empty-fires"],
  };
}

/** True when `t` (`H` or `HH:MM`) falls in the lamps-out day, 06:30-17:30 (0105 R3). */
/** The run's measured target (header): every wait is bounded by it, so a subject that never arrives fails with a reason instead of hanging. */
export const TARGET_MS = 60_000;

/** `page.waitForFunction` bounded by TARGET_MS; a miss throws `what` (the check's failure line). */
export async function waitOrFail(page, fn, what, polling = 250, timeoutMs = TARGET_MS) {
  try {
    await page.waitForFunction(fn, undefined, { timeout: timeoutMs, polling });
  } catch (e) {
    if (e?.name !== "TimeoutError") throw e;
    throw new Error(`${what} within the ${timeoutMs / 1000} s target`);
  }
}

export function isLampDay(t) {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(t));
  if (!m) return false;
  const min = Number(m[1]) * 60 + Number(m[2] ?? 0);
  return min > 6 * 60 + 30 && min < 17 * 60 + 30;
}

/** The verdict of one result: the zero counts, or the failure. A place by
 * day expects its fixtures drawn but not seen: lanterns and candles are out
 * from 06:30 to 17:30 (0105 R3), so `visible` is reported, not required. */
export function verdict(result) {
  if (result.failed) return result.failed;
  const day = result.mode === "place" && isLampDay(result.t);
  const zero = COUNTS.filter((k) => !(day && (k === "visible" || k === "onScreen")) && !(result[k] > 0));
  return zero.length ? `zero: ${zero.join(", ")}` : null;
}

/** Per card: is it seen? Pixels differ flames-on vs each flames-off frame by
 * at least `minDelta` luminance over the off/off noise in its window. */
export function seenCards(on, offA, offB, minDelta) {
  const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return on.map((w, k) => {
    const a = offA[k]; const b = offB[k];
    if (!w || !a || !b || w.length !== a.length || w.length !== b.length) return { delta: 0, noise: 0, seen: false };
    // per pixel: the flame's change against that pixel's own off/off change
    // (a flickering lamp moves the lit wall beside the flame between frames;
    // a window-wide noise floor hid every night flame, walk 7)
    let delta = 0; let noise = 0; let margin = -Infinity;
    for (let i = 0; i < w.length; i += 4) {
      const d = Math.min(Math.abs(lum(w, i) - lum(a, i)), Math.abs(lum(w, i) - lum(b, i)));
      const n = Math.abs(lum(a, i) - lum(b, i));
      if (d - n > margin) { margin = d - n; delta = d; noise = n; }
    }
    return { delta: Math.round(delta), noise: Math.round(noise), seen: margin >= minDelta };
  });
}

/** The pixel windows of the cards out of one RGBA frame (`width` wide, rows
 * top-down, as a screenshot gives it): each card's `win` is [x0, yTop, w, h]. */
export function windowsFrom(rgba, width, cards) {
  return cards.map(({ win: [x0, y0, w, h] }) => {
    const out = new Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w * 4; x++) out[(y * w) * 4 + x] = rgba[((y0 + y) * width + x0) * 4 + x];
    return out;
  });
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".ktx2": "image/ktx2", ".glb": "model/gltf-binary" };
/** Serves `dir` at /elder-souls-argonia/ (the Pages path the build is made for). */
function serveSite(dir) {
  const prefix = "/elder-souls-argonia/";
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!path.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
    let file = join(dir, path.slice(prefix.length));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/** The key: fire sources, this script, and (interior) the cell bundle and its kits' fires maps at the target. */
async function keyOf(opts, studioBase) {
  const h = createHash("sha256");
  h.update(JSON.stringify({ target: opts.url ?? "site", mode: opts.mode, cell: opts.cell, x: opts.x, z: opts.z, t: opts.t, emptyFires: opts.emptyFires }));
  for (const f of readdirSync(FIRE_DIR).filter((n) => n.endsWith(".ts") && !n.includes(".test.")).sort()) {
    h.update(f); h.update(readFileSync(join(FIRE_DIR, f)));
  }
  h.update(readFileSync(fileURLToPath(import.meta.url)));
  if (opts.cell) {
    const get = async (rel) => {
      const r = await fetch(new URL(rel, studioBase));
      if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
      return r.text();
    };
    const bundleText = await get(`province/interiors/${encodeURIComponent(opts.cell)}.json`);
    h.update(bundleText);
    const bundle = JSON.parse(bundleText);
    for (const id of Object.keys(bundle.kits).sort()) {
      const index = JSON.parse(await get(`${bundle.kits[id].glb.slice(0, -4)}/parts/index.json`));
      h.update(id); h.update(JSON.stringify(index.fires ?? null));
    }
  }
  return h.digest("hex").slice(0, 16);
}

// ---- in the page ------------------------------------------------------------
/** Installs the probe: the subject's flame systems, a draw counter, and a
 * hook on renderer.render that, after every on-screen render while armed,
 * reads a small window round each on-screen card from the default
 * framebuffer (the last on-screen render of a frame overwrites the earlier
 * ones, so a capture is the finished frame). */
function installProbe(cell) {
  const RANGE_M = 30; // farther, a candle or lantern is a pixel or two: no measure of whether it draws
  const NEAR_M = 2; // nearer, the camera is inside the fixture (its glow shell clips the pixels white)
  const scene = window.__SCENE__; const r = window.__RENDERER__; const T = window.__THREE__;
  const root = cell ? scene.getObjectByName(`interior:${cell}`) : scene;
  const systems = [];
  root?.traverse((o) => { if (o.name === "fire-flames") systems.push(o); });
  const P = { systems, draws: 0, armed: false, capture: null, camPos: null };
  window.__FLAME_PROBE__ = P;
  let emitters = 0;
  for (const g of systems) {
    const cards = g.getObjectByName("fire-flame-cards");
    if (!cards) continue;
    emitters += cards.geometry.instanceCount ?? 0;
    const prev = cards.onBeforeRender;
    cards.onBeforeRender = function (...args) { P.draws += 1; return prev.apply(this, args); };
  }
  // WebGPU has no synchronous read-back: the page records each card's window
  // and the driver fills it from a screenshot of the canvas (windowsFrom)
  const webgpu = !!(r.isWebGPURenderer || r.backend?.isWebGPUBackend || r.backend);
  P.webgpu = webgpu;
  const gl = webgpu ? null : r.getContext();
  const render = r.render.bind(r);
  const v = new T.Vector3();
  r.render = (s, camera) => {
    render(s, camera);
    if (!P.armed || r.getRenderTarget() !== null || !camera.isPerspectiveCamera) return;
    const W = webgpu ? r.domElement.width : gl.drawingBufferWidth; const H = webgpu ? r.domElement.height : gl.drawingBufferHeight; const R = 4;
    const cards = [];
    for (const g of systems) {
      const mesh = g.getObjectByName("fire-flame-cards");
      const a = mesh?.geometry.getAttribute("iPosSeed");
      if (!a) continue;
      for (let i = 0; i < mesh.geometry.instanceCount; i++) {
        v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(mesh.matrixWorld);
        const dist = v.distanceTo(camera.position);
        v.project(camera);
        if (dist > RANGE_M || dist < NEAR_M || !(v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.9)) continue;
        const px = Math.round((v.x + 1) / 2 * W); const py = Math.round((v.y + 1) / 2 * H);
        const x0 = Math.max(0, px - R); const y0 = Math.max(0, py - R); // flames rise: window from the root up
        const w = Math.min(W, px + R + 1) - x0; const h = Math.min(H, py + 3 * R + 1) - y0;
        if (webgpu) { cards.push({ px, py: H - py, dist: +dist.toFixed(2), win: [x0, H - (y0 + h), w, h] }); continue; }
        const px8 = new Uint8Array(w * h * 4);
        gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px8);
        cards.push({ px, py: H - py, dist: +dist.toFixed(2), pixels: Array.from(px8) });
      }
    }
    P.capture = cards; P.camPos = camera.position.toArray();
  };
  const g0 = systems[0];
  const mesh0 = g0?.getObjectByName("fire-flame-cards");
  const a0 = mesh0?.geometry.getAttribute("iPosSeed");
  const world0 = g0 ? new T.Vector3().setFromMatrixPosition(g0.matrixWorld).toArray().map((x) => +x.toFixed(1)) : null;
  return { flameSystems: systems.length, emitters, rootFound: !!root, groupWorld: world0,
    firstCardRaw: a0 ? [a0.getX(0), a0.getY(0), a0.getZ(0)].map((x) => +x.toFixed(2)) : null,
    uMaxDistance: mesh0?.material.uniforms?.uMaxDistance?.value ?? null };
}

/** Points the follow camera at the `k`-th nearest flame card 3-25 m from the
 * player (horizontal); returns its distance, or null when there is none. */
function aimAtEmitter(k) {
  const D = window.__STUDIO_CHARACTER_DEBUG__; const p = D.player(); const T = window.__THREE__;
  const v = new T.Vector3(); const found = [];
  for (const g of window.__FLAME_PROBE__.systems) {
    const mesh = g.getObjectByName("fire-flame-cards"); const a = mesh?.geometry.getAttribute("iPosSeed");
    if (!a) continue;
    for (let i = 0; i < mesh.geometry.instanceCount; i++) {
      v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(mesh.matrixWorld);
      const dx = v.x - p[0]; const dz = v.z - p[2]; const d = Math.hypot(dx, dz);
      if (d >= 3 && d <= 25 && !found.some((f) => Math.abs(f.d - d) < 0.5)) found.push({ d, yaw: Math.atan2(-dx, -dz) });
    }
  }
  found.sort((a, b) => a.d - b.d);
  const f = found[k];
  if (!f) return null;
  D.aimCamera(f.yaw);
  return +f.d.toFixed(1);
}

/** One capture with the flames shown or hidden: the first whole frame drawn
 * after the toggle; with `still`, the first one whose camera has not moved
 * since the frame before (the camera settles once, before the first capture). */
async function captureIn({ show, still }) {
  const P = window.__FLAME_PROBE__;
  const frame = () => new Promise((ok) => requestAnimationFrame(() => ok()));
  for (const g of P.systems) g.visible = show;
  await frame(); // the toggle lands before the frame that is read
  P.armed = true;
  let last = null;
  for (;;) {
    P.capture = null;
    await frame();
    if (!P.capture) continue;
    const pos = P.camPos;
    if (!still || (last && Math.hypot(pos[0] - last[0], pos[1] - last[1], pos[2] - last[2]) < 0.01)) break;
    last = pos;
  }
  P.armed = false;
  return P.capture;
}
// -----------------------------------------------------------------------------

async function run(opts) {
  const started = Date.now();
  const result = { mode: opts.mode, cell: opts.cell, x: opts.x, z: opts.z, t: opts.t, target: opts.url ?? opts.site, emptyFires: opts.emptyFires, stage: "boot" };
  const name = `flames-${opts.cell ?? `place-${opts.x}-${opts.z}`}${opts.emptyFires ? "-empty-fires" : ""}`;
  const jsonPath = join(opts.out, `${name}.json`);
  let server = null; let browser = null;
  const finish = (skipped = false) => {
    result.elapsedS = +((Date.now() - started) / 1000).toFixed(1);
    const why = verdict(result);
    if (!skipped) { mkdirSync(opts.out, { recursive: true }); writeFileSync(jsonPath, JSON.stringify(result, null, 1) + "\n"); }
    console.log(`flames: ${why ? "FAIL" : "PASS"}${skipped ? " (unchanged key, stored result)" : ""} ${opts.cell ?? `place ${opts.x},${opts.z}`} `
      + COUNTS.map((k) => `${k} ${result[k] ?? 0}`).join(" ") + (result.mode === "place" && isLampDay(result.t) ? " (day: lamps out, visible not required)" : "") + `${why ? ` (${why})` : ""} in ${result.elapsedS} s -> ${jsonPath}`);
    browser?.close().catch(() => undefined); server?.close();
    process.exit(why ? 1 : 0);
  };
  try {
    let base = opts.url;
    if (!base) {
      if (!existsSync(join(opts.site, "studio", "index.html"))) throw new Error(`${opts.site}/studio/index.html missing: run npm run build -w @elder-souls/world-studio && npm run site:compose`);
      server = await serveSite(opts.site);
      base = `http://127.0.0.1:${server.address().port}/elder-souls-argonia/studio/`;
    }
    if (!base.endsWith("/")) base += "/";
    let dataBase = opts.dataBase ?? base;
    if (!dataBase.endsWith("/")) dataBase += "/";
    result.key = await keyOf(opts, dataBase);
    if (!opts.force && existsSync(jsonPath)) {
      const prior = JSON.parse(readFileSync(jsonPath, "utf8"));
      if (prior.key === result.key && prior.stage === "done") { Object.assign(result, prior, { key: result.key }); return finish(true); }
    }
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 300)));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
    if (opts.emptyFires) {
      await page.route("**/parts/index.json", async (route) => {
        const res = await route.fetch(); const body = await res.json();
        await route.fulfill({ response: res, json: { ...body, fires: {} } });
      });
    }
    // no HUD; in a cell no vegetation (hidden behind the cell anyway); the
    // water pipeline stays on: its on-screen pass is the one that draws flames
    const q = opts.cell ? `&interior=${encodeURIComponent(opts.cell)}&veg=0&hud=0` : "&hud=0";
    result.url = `${base}?view=character&x=${opts.x}&z=${opts.z}&t=${opts.t}&q=low&aa=0&dpr=1${q}`;
    await page.goto(result.url, { waitUntil: "domcontentloaded" });
    await waitOrFail(page, () => window.__STUDIO_CHARACTER_DEBUG__?.player?.() != null && window.__SCENE__ && window.__RENDERER__,
      "no player in the studio");
    result.stage = "player-ready"; result.playerReadyS = +((Date.now() - started) / 1000).toFixed(1);
    if (opts.cell) {
      await waitOrFail(page, () => { const s = window.__STUDIO_CHARACTER_DEBUG__?.interior?.(); return s?.cellId && s.fade === 0; },
        `cell ${opts.cell} did not open`);
    } else {
      // the settlement's fixtures streamed: a flame system with cards
      await waitOrFail(page, () => { let n = 0; window.__SCENE__.traverse((o) => { if (o.name === "fire-flame-cards" && o.visible) n++; }); return n > 0; },
        "no flame cards streamed at the place", 500);
    }
    result.stage = "subject-ready"; result.subjectReadyS = +((Date.now() - started) / 1000).toFixed(1);
    Object.assign(result, await page.evaluate(installProbe, opts.cell));
    // the screenshot shows the world canvas alone (no HUD, no minimap canvas)
    await page.addStyleTag({ content: "* { visibility: hidden !important; } canvas { visibility: visible !important; }" });
    await page.evaluate(() => { for (const c of document.querySelectorAll("canvas")) if (c !== window.__RENDERER__.domElement) c.style.setProperty("visibility", "hidden", "important"); });
    // WebGPU: the cards' windows come from a CDP screenshot clip of the canvas
    // taken while the toggled state holds (the camera is still by then)
    const cdp = await page.context().newCDPSession(page);
    const grab = async (cards) => {
      if (!cards?.length || cards[0].pixels) return cards;
      const rect = await page.evaluate(() => { const c = window.__RENDERER__.domElement; const b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, W: c.width }; });
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: rect.W / rect.w } });
      const img = await page.evaluate(async (b64) => {
        const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext("2d"); x.drawImage(bm, 0, 0);
        return { width: bm.width, data: Array.from(x.getImageData(0, 0, bm.width, bm.height).data) };
      }, shot.data);
      const wins = windowsFrom(img.data, img.width, cards);
      return cards.map((c, k) => ({ ...c, pixels: wins[k] }));
    };
    let views = 0;
    for (;;) {
      const at = () => +((Date.now() - started) / 1000).toFixed(1);
      const offA = await grab(await page.evaluate(captureIn, { show: false, still: true }));
      result.stillS = at();
      const on = await grab(await page.evaluate(captureIn, { show: true, still: false }));
      const offB = await grab(await page.evaluate(captureIn, { show: false, still: false }));
      result.capturedS = at();
      await page.evaluate(() => { for (const g of window.__FLAME_PROBE__.systems) g.visible = true; });
      views += 1;
      if (on?.length && offA?.length === on.length && offB?.length === on.length) {
        const seen = seenCards(on.map((c) => c.pixels), offA.map((c) => c.pixels), offB.map((c) => c.pixels), opts.minDelta);
        result.onScreen = on.length; result.visible = seen.filter((s) => s.seen).length;
        result.cards = on.slice(0, 24).map((c, k) => ({ px: c.px, py: c.py, dist: c.dist, ...seen[k] }));
      }
      if (result.onScreen > 0 || views >= 4 || !(result.emitters > 0)) break;
      // face the next-nearest emitter 3-25 m from the player (a blind turn
      // from a spawn on a lantern finds none: walk 7)
      result.aimedAt = await page.evaluate(aimAtEmitter, views - 1);
      await page.waitForTimeout(600);
    }
    result.views = views;
    Object.assign(result, { draws: await page.evaluate(() => window.__FLAME_PROBE__.draws), errors: errs.slice(0, 8) });
    result.png = join(opts.out, `${name}.png`);
    mkdirSync(opts.out, { recursive: true });
    await page.screenshot({ path: result.png, timeout: 0 });
    result.stage = "done";
  } catch (e) {
    result.failed = String(e).slice(0, 500);
  }
  finish();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let opts;
  try { opts = parseFlameArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  await run(opts);
}
