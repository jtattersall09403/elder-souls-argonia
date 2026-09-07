import { chromium } from "playwright";
const BASE = process.env.SHOT_BASE ?? "https://jtattersall09403.github.io/elder-souls-argonia/studio/";
const variants = JSON.parse(process.env.SHOT_VARIANTS);
const waitMs = Number(process.env.SHOT_WAIT ?? 45000);
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
for (const [id, q] of Object.entries(variants)) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on("pageerror", e => errs.push("pageerror: " + e.message.slice(0,300)));
  page.on("console", m => { if (m.type()==="error") errs.push("console: " + m.text().slice(0,300)); });
  const t0 = Date.now();
  await page.goto(`${BASE}?${q}`);
  const samples = [];
  for (let i = 0; i < waitMs/5000; i++) {
    await page.waitForTimeout(5000);
    samples.push(await page.evaluate(() => {
      const w = window.__STUDIO_WATER_DEBUG__, c = window.__STUDIO_CHARACTER_DEBUG__;
      return { t: Math.round(performance.now()/1000), frames: w?.frames, wkeys: w ? Object.keys(w).length : 0, ground: c?.groundMeshes ?? c?.chunks ?? null, fps: w?.fps ?? null };
    }));
  }
  await page.screenshot({ path: `/tmp/shots/${id}.png`, timeout: 420000 });
  const dbg = await page.evaluate(() => JSON.stringify(window.__STUDIO_WATER_DEBUG__ ?? null).slice(0, 1500));
  console.log(`== ${id} (${Math.round((Date.now()-t0)/1000)}s)`);
  console.log(JSON.stringify(samples));
  console.log("water dbg:", dbg);
  console.log("errors:", errs.slice(0,8).join("\n  "));
  await page.close();
}
await browser.close();
