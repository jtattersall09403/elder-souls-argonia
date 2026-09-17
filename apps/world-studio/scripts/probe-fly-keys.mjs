import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.goto("http://localhost:8081/?view=fly3d&x=4.02&z=4.61&t=12:00");
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(10000);
  const s = await page.evaluate(() => { const keys = Object.keys(window).filter(k => k.startsWith("__STUDIO")); const v = window.__STUDIO_VEGETATION_DEBUG__; return { t: Math.round(performance.now()/1000), keys, veg: v ? { chunks: v.chunks, instances: v.instances, draws: v.draws, triangles: v.triangles } : null }; });
  console.log(JSON.stringify(s));
}
await browser.close();
