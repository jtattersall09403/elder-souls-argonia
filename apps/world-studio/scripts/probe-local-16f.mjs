import { chromium } from "playwright";
const BASE = "http://localhost:8081/";
const q = process.argv[2] ?? "view=character&x=4.02&z=4.61&t=12:00";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message.slice(0,400)));
page.on("console", m => { if (m.type()==="error" || m.type()==="warning") errs.push(m.type()+": " + m.text().slice(0,400)); });
await page.goto(`${BASE}?${q}`);
for (let i = 0; i < 9; i++) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => ({ veg: window.__STUDIO_VEGETATION_DEBUG__ ?? null, gc: window.__STUDIO_GROUNDCOVER_DEBUG__ ?? null, water: window.__STUDIO_WATER_DEBUG__ ? { frames: window.__STUDIO_WATER_DEBUG__.frames, fps: window.__STUDIO_WATER_DEBUG__.fps } : null }));
  console.log(i*5+5, "s", JSON.stringify(s).slice(0, 700));
}
const uniq = [...new Set(errs)];
console.log("errors:", uniq.length); for (const e of uniq.slice(0, 25)) console.log("  ", e);
await browser.close();
