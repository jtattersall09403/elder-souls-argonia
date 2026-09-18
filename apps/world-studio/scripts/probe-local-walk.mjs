// Throwaway (16f round 3): load a character-view site, sprint forward, and
// report the vegetation rebuild timings and flora-collider costs.
import { chromium } from "playwright";
const BASE = "http://localhost:8081/";
const q = process.argv[2] ?? "view=character&x=4.02&z=4.61&t=12:00";
const waitS = Number(process.argv[3] ?? 90);
const walkS = Number(process.argv[4] ?? 90);
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const msgs = [];
page.on("pageerror", e => msgs.push("pageerror: " + e.message.slice(0,600)));
page.on("console", m => { const t=m.text(); if (/^vegetation rebuild|^flora colliders/.test(t)) msgs.push(t.slice(0,200)); });
await page.goto(`${BASE}?${q}`);
const read = () => page.evaluate(() => {
  const v = window.__STUDIO_VEGETATION_DEBUG__; const c = window.__STUDIO_VEG_COLLIDERS_DEBUG__; const ch = window.__STUDIO_CHARACTER_DEBUG__;
  return { frames: ch ? ch.frames() : null, veg: v ? { chunks: v.chunks, instances: v.instances, draws: v.draws, rebuildMs: v.rebuildMs ?? null } : null, col: c ?? null };
});
const t0 = Date.now();
let s = null;
while ((Date.now() - t0) / 1000 < waitS) {
  await page.waitForTimeout(5000);
  s = await read();
  if (s.veg && s.veg.instances > 0) break;
}
console.log("loaded", Math.round((Date.now()-t0)/1000), "s", JSON.stringify(s));
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.__STUDIO_VEGETATION_REBUILD__?.());
  await page.waitForTimeout(6000);
  console.log("forced rebuild", i + 1, JSON.stringify(await read()));
}
await page.mouse.click(400, 225);
await page.keyboard.down("KeyW");
await page.keyboard.down("Space");
const t1 = Date.now();
while ((Date.now() - t1) / 1000 < walkS) {
  await page.waitForTimeout(5000);
  console.log("walk", Math.round((Date.now()-t1)/1000), "s", JSON.stringify(await read()));
}
await page.keyboard.up("KeyW");
await page.keyboard.up("Space");
console.log("rebuild lines:"); for (const m of msgs) console.log("  ", m);
await browser.close();
