// On/off test for the ambient air layer on the deployed studio (or SHOT_BASE).
// At Q, wait for the character, dump each swarm's live state from the scene,
// then shoot the same paused frame with window.__STUDIO_AIR__ = 0 and = GAIN
// to /tmp/shots/air-off.png and air-on.png. Diff them outside (PIL/numpy):
// a layer that draws changes centre-screen pixels; one that does not, cannot.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const BASE = process.env.SHOT_BASE ?? "https://jtattersall09403.github.io/elder-souls-argonia/studio/";
const q = process.env.Q;
const GAIN = Number(process.env.GAIN ?? 6);
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 400)); });
await page.goto(`${BASE}?${q}&hud=0&markers=0`);
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(10000);
  const ok = await page.evaluate(() => {
    const c = window.__STUDIO_CHARACTER_DEBUG__; const s = window.__STUDIO_SKY_DEBUG__;
    return !!(c?.groundMeshes ?? c?.chunks) && !!s?.airAmounts;
  });
  if (ok && i >= 3) break;
}
const state = await page.evaluate(() => {
  const s = window.__STUDIO_SKY_DEBUG__;
  const out = { air: s?.airAmounts, humidity: s?.humidityAtCamera, exposure: s?.exposure, swarms: [], caps: null };
  try {
    const c = document.createElement("canvas").getContext("webgl2");
    const dbg = c.getExtension("WEBGL_debug_renderer_info");
    out.caps = { pointSize: Array.from(c.getParameter(c.ALIASED_POINT_SIZE_RANGE)), renderer: dbg ? c.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null };
  } catch (e) { out.caps = String(e); }
  window.__SCENE__?.traverse((o) => {
    if (!o.name?.startsWith("air:")) return;
    const u = o.material?.uniforms;
    if (!u?.uAmount) { out.swarms.push({ name: o.name, visible: o.visible }); return; }
    out.swarms.push({
      name: o.name, visible: o.visible, parentVisible: o.parent?.visible, amount: u.uAmount.value,
      cam: u.uCam.value.toArray().map((v) => +v.toFixed(1)), yOff: u.uYOffset.value,
      core: u.uCore.value.toArray().map((v) => +v.toExponential(2)), opacity: u.uOpacity.value,
      count: o.geometry.attributes.position.count, layers: o.layers.mask,
    });
  });
  return out;
});
console.log("state:", JSON.stringify(state));
const shot = async (gain, name) => {
  await page.evaluate((g) => { window.__STUDIO_AIR__ = g; }, gain);
  await page.waitForTimeout(4000);
  writeFileSync(`${process.env.SHOT_DIR ?? "/tmp/shots"}/${name}.png`, await page.screenshot({ timeout: 420000 }));
};
await shot(0, "air-off");
await shot(GAIN, "air-on");
console.log("errors:", errs.slice(0, 6).join("\n  "));
await browser.close();
