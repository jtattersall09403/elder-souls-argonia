// Headless shader compile check (loop rule h): builds every shader the volumetrics/fire/interior/water
// work touches from the REAL package node graphs and compiles it on a real SwiftShader WebGPU device
// (WGSL through three's WGSLNodeBuilder, then Tint) via the subsystem harness (decision 0111), and fails
// on any shader error. Run after any commit touching a shader or material, before any pod capture.
//
//   node tooling/gpu-lane/shader-compile-check.mjs [--backend webgpu|webgl] [--sys a,b]
//
// Scenes -> shaders: volumetrics-forest-morning-shafts (fog inject with the canopy CSM textureLoad
// compare, skyAirlight, applyVolumetrics), volumetrics-lanterns-night-mist (lamp halo inject),
// interior-light (InteriorLoader: CellSunOccluder + CellSunShadowNode, interior fog), fire (fireNodes
// flame cards), fire-diag-vol (volumeFire march), water (waterMaterial field/strip).
// Judges compile only (harness look bars such as tooBlack are not this gate): exit 1 when a scene timed out,
// ran on the wrong backend, reports any console/shader error, or holds no shader program.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCENES = ["volumetrics-forest-morning-shafts", "volumetrics-lanterns-night-mist", "interior-light", "fire", "fire-diag-vol", "water"];
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const r = spawnSync("node", ["scripts/harness-run.mjs", "--sys", arg("sys", SCENES.join(",")), "--backend", arg("backend", "webgpu"),
  "--label", "shader-compile", "--out", "/tmp/shader-compile-check"], { cwd: resolve(repo, "apps/world-studio"), stdio: "inherit" });
const { runs } = JSON.parse(readFileSync("/tmp/shader-compile-check/summary.json", "utf8"));
const bad = runs.filter((x) => x.timedOut || x.wrongBackend || !x.result?.done || x.result.errors.length > 0 || !(x.result.programs > 0));
for (const x of bad) console.log(`compile FAIL ${x.sys}: ${(x.result?.errors ?? ["no result"]).slice(0, 3).join(" | ")}`);
console.log(`shader-compile-check: ${bad.length === 0 && runs.length > 0 ? "PASS" : "FAIL"} (${runs.length} scenes, harness exit ${r.status})`);
process.exit(bad.length === 0 && runs.length > 0 ? 0 : 1);
