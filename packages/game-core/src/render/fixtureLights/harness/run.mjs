// Fixture-light harness (16k walk 5; no studio, owner ruling): bundles
// entry.ts with vite, runs it in headless Chromium on SwiftShader (CPU GL:
// frame ms are RATIOS only) and prints JSON: programs and useProgram calls
// per frame for 0/5/40/100 lamps, pixel parity against real PointLights, and
// the frame cost of 16 PointLights vs 16 field lamps. ~20 s.
//   node packages/game-core/src/render/fixtureLights/harness/run.mjs
import { build } from "vite";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
await build({ logLevel: "error", root: here, build: { outDir: `${tmpdir()}/es-fixture-lights-harness`, emptyOutDir: true, minify: false,
  lib: { entry: `${here}/entry.ts`, formats: ["iife"], name: "H", fileName: () => "h.js" } } });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.error("[page]", m.text()); });
await page.setContent("<html><body></body></html>");
await page.addScriptTag({ content: readFileSync(`${tmpdir()}/es-fixture-lights-harness/h.js`, "utf8") });
const out = {
  programs: await page.evaluate(() => window.runPrograms(false)),
  programsSharedMaterial: await page.evaluate(() => window.runPrograms(true)),
  baselineUseProgram: await page.evaluate(() => window.runBaseline()),
  parity: await page.evaluate(() => window.runParity()),
  sharedParity: await page.evaluate(() => window.runSharedParity()),
  cost: await page.evaluate(() => window.runCost(20)),
};
console.log(JSON.stringify(out, null, 1));
await browser.close();
