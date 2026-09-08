// Screenshot the interactive blueprint view (Phase 11 Part 7 Round A) so an
// agent can sanity-check legibility without the owner. Usage:
//   node scripts/probe-blueprints.mjs [slug[,slug...]] [zoomClicks]
// Writes artifacts/blueprint-<slug>.png. Needs `npm run build` first (vite preview).
// A combined probe may provide STUDIO_REUSE_SERVER=1 and STUDIO_PORT=<port>
// so several suites share one production preview server.
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const slugs = (process.argv[2] ?? "nine-trunks").split(",").filter(Boolean);
const zoomClicks = Number(process.argv[3] ?? 0);
const probeSettlements = process.env.PHASE11_SETTLEMENT_PROBE === "1";
const out = new URL("../artifacts/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.STUDIO_PORT ?? 4323);
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;
const studioDir = new URL("../", import.meta.url).pathname;
const reuse = process.env.STUDIO_REUSE_SERVER === "1";
const server = reuse ? null : spawn("npx", ["vite", "preview", "--base", "/elder-souls-argonia/studio/", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: studioDir, stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = "";
server?.stdout.on("data", (c) => { log += c; });
server?.stderr.on("data", (c) => { log += c; });
const waitFor = async (url, ms = 30000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server never came up\n${log}`);
};
const errors = [];
try {
  await waitFor(BASE);
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    // One browser/page and one app load for a batch: the blueprint picker is
    // the real navigation path, and reloading the 113 MB province bundle for
    // every screenshot adds no coverage.
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
    for (const [index, slug] of slugs.entries()) {
      const errorsBefore = errors.length;
      let priorMap = null;
      if (index === 0) {
        await page.goto(`${BASE}?bp=1&blueprint=${slug}`, { waitUntil: "domcontentloaded" });
      } else {
        priorMap = await page.locator("svg image").getAttribute("href");
        const option = await page.locator("select option").evaluateAll((options, wanted) =>
          options.find((node) => node.value === wanted || node.value.endsWith(`.${wanted}`))?.value ?? null, slug);
        if (!option) throw new Error(`blueprint picker has no option for ${slug}`);
        await page.locator("select").selectOption(option);
      }
      // Wait for the requested blueprint AND its real province-map crop. This
      // replaces a blind 6.8-second sleep without taking away either view.
      await page.waitForFunction(({ wanted, previous }) => {
        const selected = document.querySelector("select")?.value ?? "";
        const map = document.querySelector("svg image")?.getAttribute("href") ?? null;
        return (selected === wanted || selected.endsWith(`.${wanted}`))
          && map !== null && (previous === null || map !== previous);
      }, { wanted: slug, previous: priorMap }, { timeout: 30_000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      for (let i = 0; i < zoomClicks; i++) {
        await page.keyboard.press("+");
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      }
      await page.screenshot({ path: `${out}blueprint-${slug}.png` });
      const newErrors = errors.slice(errorsBefore);
      console.log(`wrote artifacts/blueprint-${slug}.png; page errors: ${newErrors.length}`);
      for (const e of newErrors.slice(0, 5)) console.log("  " + e);
    }
    if (probeSettlements) {
      // Reuse the same browser and page for the heavier 3D proof. The running
      // scene then teleports between places, avoiding a second shader/terrain
      // startup while still proving the actual SettlementLayer drew each one.
      const sites = [
        { id: "place.mercantile-coast.lilmoth", slug: "lilmoth", x: 3.6108, z: 6.3847 },
        { id: "place.hist-heartland.nine-trunks", slug: "nine-trunks", x: 4.9729, z: 3.7559 },
      ];
      await page.goto(`${BASE}?view=fly3d&cam=orbit&x=${sites[0].x}&z=${sites[0].z}&hud=0`,
        { waitUntil: "domcontentloaded" });
      for (const [index, site] of sites.entries()) {
        if (index) {
          await page.evaluate((next) => {
            if (!window.__STUDIO_GOTO__) throw new Error("studio teleport hook is unavailable");
            return window.__STUDIO_GOTO__({
              view: "fly3d", cam: "orbit", x: next.x, z: next.z, frames: 6, timeoutMs: 180_000,
            });
          }, site);
        }
        await page.waitForFunction((placeId) => {
          const proof = window.__STUDIO_SETTLEMENT_DEBUG__;
          const place = proof?.grounding?.find((row) => row.settlementId === placeId);
          return proof?.status === "loaded" && proof.renderedPlacements > 0
            && proof.draws > 0 && proof.triangles > 0
            && place?.placementsAudited > 0;
        }, site.id, { timeout: 180_000 });
        const proof = await page.evaluate((placeId) => {
          const state = window.__STUDIO_SETTLEMENT_DEBUG__;
          return { state, place: state?.grounding?.find((row) => row.settlementId === placeId) };
        }, site.id);
        if (!proof.place || proof.place.terrainUnavailable || proof.place.floating || proof.place.overBuried) {
          throw new Error(`${site.id} settlement grounding failed: ${JSON.stringify(proof)}`);
        }
        await page.screenshot({ path: `${out}settlement-${site.slug}.png` });
        console.log(`wrote artifacts/settlement-${site.slug}.png; ${proof.place.placementsAudited} placements grounded`);
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  if (server) try { process.kill(-server.pid); } catch { /* already gone */ }
}
if (errors.length) process.exitCode = 1;
