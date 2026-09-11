// Numeric presence probe for the ambient air layer on the DEPLOYED studio (or
// SHOT_BASE): for each URL variant in SHOT_VARIANTS='{"id":"view=...&x=..."}'
// prints window.__STUDIO_SKY_DEBUG__.airAmounts with the conditions that
// produced them (sun altitude, weather, rain, wind, cloud, humidity). Answers
// "should fireflies be here?" with a number, so the owner's visual check is
// only ever confirming a positive.
import { chromium } from "playwright";
const BASE = process.env.SHOT_BASE ?? "https://jtattersall09403.github.io/elder-souls-argonia/studio/";
const variants = JSON.parse(process.env.SHOT_VARIANTS);
const waitMs = Number(process.env.SHOT_WAIT ?? 60000);
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
for (const [id, q] of Object.entries(variants)) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on("pageerror", e => errs.push("pageerror: " + e.message.slice(0,200)));
  const t0 = Date.now();
  await page.goto(`${BASE}?${q}`);
  let last = null;
  for (let i = 0; i < waitMs/5000; i++) {
    await page.waitForTimeout(5000);
    last = await page.evaluate(() => {
      const s = window.__STUDIO_SKY_DEBUG__; if (!s) return null;
      const r = (v) => typeof v === "number" ? Math.round(v*1000)/1000 : v;
      return { sunAlt: r(s.sunAltitudeDeg), weather: s.weatherState, rain: r(s.rainIntensity), wind: r(s.windSpeedMS),
        cloud: r(s.cloudCover), humidity: r(s.humidityAtCamera), canopy: r(s.canopyAtCamera), shafts: r(s.sunShafts),
        air: Object.fromEntries(Object.entries(s.airAmounts ?? {}).map(([k,v]) => [k, r(v)])) };
    });
    // Do NOT break on the first sample with amounts: in character mode the
    // sky runs before the character has spawned and samples the raster at
    // the origin. Wait for the ground to be up, then one more sample.
    const ready = await page.evaluate(() => { const c = window.__STUDIO_CHARACTER_DEBUG__; return !!(c?.groundMeshes ?? c?.chunks); });
    if ((ready || i >= 11) && last?.air && i > 0) { await page.waitForTimeout(5000); last = await page.evaluate(() => {
      const s = window.__STUDIO_SKY_DEBUG__; const r = (v) => typeof v === "number" ? Math.round(v*1000)/1000 : v;
      return { sunAlt: r(s.sunAltitudeDeg), weather: s.weatherState, rain: r(s.rainIntensity), wind: r(s.windSpeedMS),
        cloud: r(s.cloudCover), humidity: r(s.humidityAtCamera), canopy: r(s.canopyAtCamera), shafts: r(s.sunShafts),
        air: Object.fromEntries(Object.entries(s.airAmounts ?? {}).map(([k,v]) => [k, r(v)])) }; }); break; }
  }
  if (process.env.SHOT_PNG) await page.screenshot({ path: `/tmp/shots/${id}.png`, timeout: 420000 });
  console.log(`== ${id} (${Math.round((Date.now()-t0)/1000)}s) ?${q}`);
  console.log(JSON.stringify(last));
  if (errs.length) console.log("errors:", errs.slice(0,4).join("\n  "));
  await page.close();
}
await browser.close();
