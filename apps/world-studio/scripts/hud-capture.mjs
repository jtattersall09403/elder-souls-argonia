/**
 * The studio's HUD perf lines (fps, GPU per pass, CPU per stage) from a remote real-GPU Chrome
 * (CHROME_CDP, e.g. the RunPod loop in docs/research/infrastructure/runpod-gpu-loop.md), for the
 * WebGL studio built from dev (`vite build --outDir <dist>`, base /elder-souls-argonia/studio/).
 * Serves <dist> on 127.0.0.1:8099 (reach it from the pod with `ssh -R 8099:127.0.0.1:8099`),
 * opens the perf block, reads the page text four times over <settleS> and writes it to <out>.txt
 * with a screenshot beside it (<out>.jpg).
 *
 *   CHROME_CDP=http://127.0.0.1:9222 node scripts/hud-capture.mjs <dist> "<query>" <out>.txt <settleS>
 */
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { staticHandler } from "./lib/webgpu-static.mjs";
import { resolve } from "node:path";
const [dist, query, out, settleS] = process.argv.slice(2);
const roots = [["/elder-souls-argonia/studio/", dist], ["/elder-souls-argonia/", resolve("../../packages/character-assets/files")]];
const server = createServer(staticHandler(roots));
await new Promise((r) => server.listen(8099, "127.0.0.1", r));
const browser = await chromium.connectOverCDP(process.env.CHROME_CDP);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => localStorage.setItem("es.hud.perfOpen", "1"));
page.goto(`http://127.0.0.1:8099/elder-souls-argonia/studio/?${query}`, { timeout: 120000 }).catch(() => {});
const reads = [];
for (let i = 0; i < 4; i++) {
  await new Promise((r) => setTimeout(r, Number(settleS) * 250));
  reads.push(await page.evaluate(() => document.body.innerText).catch((e) => String(e)));
}
await page.screenshot({ path: out.replace(/\.txt$/, ".jpg"), type: "jpeg", quality: 70 }).catch(() => {});
writeFileSync(out, reads.join("\n=====\n"));
await page.close(); server.close(); process.exit(0);
