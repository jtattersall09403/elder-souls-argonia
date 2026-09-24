// Settlement flash + camera-collision probe (16h check-in 2 items 2 and 3).
//
// Flash: the settlement layer counts, every frame, whether its live group is
// empty while the last finished build drew something
// (`__STUDIO_SETTLEMENT_DEBUG__.frames.blankFrames`). The old build effect's
// cleanup emptied the live group on every rebuild (each 40 m of walking,
// every 2 s while terrain streamed in), so on that code this count rises on
// the first rebuild. The probe forces REBUILDS rebuilds through the layer's
// injected probe handle, then walks and stands. PASS: blankFrames stays 0,
// the layer never fails, and every forced rebuild finished.
//
// Camera: the camera's ball cast (`__STUDIO_CHARACTER_DEBUG__.cameraCast`)
// is aimed at the nearest fixed, camera-blocking, non-terrain colliders (the
// settlement pieces): down from 30 m and level from 6 m on four sides.
// PASS: at least one piece stops a cast.
//
// No GPU on this VM (SwiftShader): numbers only, one screenshot at the end.
//
//   node apps/world-studio/scripts/probe-settlement-flash.mjs [x] [z]
import { chromium } from "playwright";
import { startStudioDevServer } from "./dev-server.mjs";

const X = Number(process.argv[2] ?? 4.31);
const Z = Number(process.argv[3] ?? 5.74);
const WALK_MS = Number(process.env.WALK_MS ?? 20000);
const REBUILDS = Number(process.env.REBUILDS ?? 2);
const STAND_MS = Number(process.env.STAND_MS ?? 15000);
const HEIGHTFIELD = "7";          // rapier ShapeType.HeightField
const CAMERA_BIT = 1 << 15;       // game-core camera/cameraCollision.ts

const server = process.env.SHOT_BASE ? null : await startStudioDevServer();
const BASE = process.env.SHOT_BASE ?? server.url;
const out = { site: [X, Z] };
try {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 400)));
  await page.goto(`${BASE}?view=character&x=${X.toFixed(3)}&z=${Z.toFixed(3)}&t=12:00&w=clear&hud=0`,
    { waitUntil: "domcontentloaded", timeout: 180000 });
  const proof = () => page.evaluate(() => {
    const p = window.__STUDIO_SETTLEMENT_DEBUG__;
    return p ? { status: p.status, draws: p.draws, error: p.error ?? null, ...p.frames } : null;
  });
  const t0 = Date.now();
  let p = null;
  while (Date.now() - t0 < 300000) {
    p = await proof();
    const character = await page.evaluate(() => !!window.__STUDIO_CHARACTER_DEBUG__);
    if (p && p.status !== "loading" && p.draws > 0 && character) break;
    await page.waitForTimeout(5000);
  }
  out.loadMs = Date.now() - t0;
  out.loaded = p;

  // Camera: cast at the nearest settlement-like collider.
  out.camera = await page.evaluate(({ HEIGHTFIELD, CAMERA_BIT }) => {
    const d = window.__STUDIO_CHARACTER_DEBUG__;
    if (!d?.cameraCast) return { error: "no cameraCast hook" };
    const all = d.colliders();
    const player = all.find((c) => !c.fixed) ?? all[0];
    const blocking = all.filter((c) => c.fixed && c.shape !== HEIGHTFIELD
      && ((c.groups >>> 16) & CAMERA_BIT) && (c.groups >>> 0) !== 0x7fffffff);
    const transparent = all.filter((c) => (c.groups >>> 16) === (0xffff & ~CAMERA_BIT)).length;
    blocking.sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z)
      - Math.hypot(b.x - player.x, b.z - player.z));
    // Distinct pieces; per piece one cast down from 30 m (a roof or deck
    // stops it above the pivot) and four level casts from 6 m at 1.5 m.
    const seen = new Set();
    const targets = blocking.filter((t) => {
      const key = `${Math.round(t.x)}|${Math.round(t.z)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
    const casts = targets.map((t) => {
      const down = d.cameraCast([t.x, t.y + 30, t.z], [t.x, t.y + 0.5, t.z]);
      const level = [[6, 0], [-6, 0], [0, 6], [0, -6]].map(([dx, dz]) =>
        d.cameraCast([t.x + dx, t.y + 1.5, t.z + dz], [t.x, t.y + 1.5, t.z]));
      const hit = [down, ...level].some((h) => h !== null && h < 29);
      return { target: [t.x, t.y, t.z].map((v) => Math.round(v * 10) / 10), down, level, hit };
    });
    return { blocking: blocking.length, transparent, casts, arm: d.cameraArm() };
  }, { HEIGHTFIELD, CAMERA_BIT });

  // Flash: force rebuilds through the layer's injected probe handle (at
  // SwiftShader's ~0.3 fps a walk never reaches the 40 m rebuild step), then
  // walk a little and stand. The old cleanup blanked the layer from the
  // rebuild's first frame until its swap.
  const before = await proof();
  const rebuilds = [];
  for (let i = 0; i < REBUILDS; i++) {
    const start = await proof();
    const fired = await page.evaluate(() => window.__STUDIO_CHARACTER_DEBUG__?.settlementRebuild?.() ?? false);
    const t1 = Date.now();
    let now = start;
    while (Date.now() - t1 < 240000) {
      await page.waitForTimeout(5000);
      now = await proof();
      if (now.swaps + now.skippedSwaps > start.swaps + start.skippedSwaps || now.status === "failed") break;
    }
    rebuilds.push({ fired, ms: Date.now() - t1, after: now });
  }
  await page.mouse.click(400, 225);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(WALK_MS);
  await page.keyboard.up("KeyW");
  const walked = await proof();
  await page.waitForTimeout(STAND_MS);
  const stood = await proof();
  out.flash = { before, rebuilds, walked, stood };
  out.errors = errors;
  try {
    await page.screenshot({ path: "/tmp/probe-settlement-flash.png", timeout: 300000 });
    out.screenshot = "/tmp/probe-settlement-flash.png";
  } catch (err) { out.screenshot = `failed: ${String(err?.message ?? err)}`; }
  await browser.close();
} finally {
  server?.stop();
}
const blank = out.flash?.stood?.blankFrames ?? null;
const rebuilds = (out.flash?.stood?.swaps ?? 0) + (out.flash?.stood?.skippedSwaps ?? 0);
const hits = (out.camera?.casts ?? []).filter((c) => c.hit).length;
out.verdict = {
  flash: blank === 0 && out.flash?.stood?.status !== "failed" && rebuilds > REBUILDS ? "PASS" : "FAIL",
  camera: hits > 0 ? "PASS" : "FAIL",
};
console.log(JSON.stringify(out, null, 1));
if (out.verdict.flash !== "PASS" || out.verdict.camera !== "PASS") process.exitCode = 1;
