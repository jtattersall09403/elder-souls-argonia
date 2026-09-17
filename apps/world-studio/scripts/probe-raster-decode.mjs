import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.goto("http://localhost:8081/?view=character&x=4.02&z=4.61");
await page.waitForTimeout(3000);
const out = await page.evaluate(async () => {
  async function px(url, x, z, ext) {
    const res = await fetch(url); const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const c = new OffscreenCanvas(bitmap.width, bitmap.height); const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0);
    const mpp = ext / bitmap.width; const tx = Math.floor(x / mpp), tz = Math.floor(z / mpp);
    const d = ctx.getImageData(tx, tz, 1, 1).data; return { w: bitmap.width, rgba: Array.from(d) };
  }
  const ext = 7369.85;
  return { control: await px("/province/refined/ground-control.png", 4020, 4610, ext), region: await px("/province/hydro-regions.png", 4020, 4610, ext), tint: await px("/province/refined/ground-tint.png", 4020, 4610, ext) };
});
console.log(JSON.stringify(out));
await browser.close();
