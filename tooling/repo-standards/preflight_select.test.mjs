// node --test: preflight's path scoping picks the gates a fixture path list needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectGates, rerunOnlyFailed } from "./preflight_select.mjs";
import { jobsCap, pinPrefix } from "./jobs.mjs";

const GATES = ["placement", "water", "typecheck", "rasters", "pipeline", "workbench", "npm-test", "credits", "python-deps"];
const WS = [
  { dir: "packages/contracts", test: false, deps: [] },
  { dir: "packages/text-catalogue", test: true, deps: [] },
  { dir: "packages/game-core", test: true, deps: ["packages/contracts", "packages/text-catalogue"] },
  { dir: "packages/audio", test: true, deps: [] },
  { dir: "apps/world-studio", test: true, deps: ["packages/game-core"] },
  { dir: "apps/stats-lab", test: true, deps: ["packages/text-catalogue"] },
  { dir: "tooling/repo-standards", test: true, deps: [] },
];
const sel = (files) => selectGates(files, WS, GATES);

test("bootstrap shell scripts and docs run only the repo-wide standards", () => {
  const r = sel(["tooling/bootstrap/on-start.sh", "docs/phases/lanes/README.md", "tooling/repo-standards/cpu_watchdog.py"]);
  assert.deepEqual(r.gates, ["npm-test"]);
  assert.deepEqual(r.workspaces, ["tooling/repo-standards"]);
  assert.equal(r.weapons, false);
  assert.deepEqual(r.skipped, ["placement", "water", "typecheck", "rasters", "pipeline", "workbench", "credits", "python-deps"]);
});

test("a package change tests its dependents and typechecks", () => {
  const r = sel(["packages/contracts/src/index.ts"]);
  assert.deepEqual(r.gates, ["typecheck", "npm-test"]);
  assert.deepEqual(r.workspaces, ["packages/game-core", "apps/world-studio", "tooling/repo-standards"]);
});

test("a world record runs the suites that read it; code folders run every Python suite", () => {
  const r = sel(["world/sources/places/foo.json"]);
  assert.deepEqual(r.gates, ["placement", "workbench", "npm-test"]);
  assert.deepEqual(r.workspaces, ["apps/world-studio", "tooling/repo-standards"]);
  assert.deepEqual(sel(["tooling/asset-pipeline/pipeline/placement_metadata.py"]).gates.slice(0, 3), ["placement", "pipeline", "workbench"]);
  assert.deepEqual(sel(["tooling/world-generation/worldgen/scale.py"]).gates.slice(0, 4), ["placement", "water", "pipeline", "workbench"]);
  assert.deepEqual(sel(["apps/world-studio/public/kits/x.glb"]).gates.slice(0, 3), ["placement", "pipeline", "workbench"]);
  assert.deepEqual(sel(["world/sources/hydrology/hydrology-graph.json"]).gates.slice(0, 3), ["placement", "water", "workbench"]);
  assert.deepEqual(sel(["apps/world-studio/public/province/water/x.bin"]).gates, ["placement", "water", "rasters", "pipeline", "workbench", "npm-test"]);
  const credits = sel(["world/sources/assets/pools.json", "README.md"]);
  assert.ok(credits.gates.includes("credits"));
});

test("a place change (blueprint, published settlements) never runs water", () => {
  for (const f of ["world/sources/blueprints/place.imperial-fringe.claywater-station.json",
    "apps/world-studio/public/province/settlements.json", "apps/world-studio/public/province/blueprints.json",
    "apps/world-studio/public/province/settlements/x.json"]) {
    const r = sel([f]);
    assert.ok(!r.gates.includes("water"), f);
    assert.ok(r.gates.includes("placement") && r.gates.includes("workbench"), f);
  }
  assert.ok(sel(["world/sources/blueprints/x.json"]).gates.includes("pipeline"));
  assert.ok(sel(["packages/game-core/src/equipment/generated/weapon-records.json"]).gates.includes("pipeline"));
  assert.deepEqual(sel(["tooling/placement-workbench/workbench/render.py"]).gates, ["placement", "workbench", "npm-test"]);
});

test("a directory pathspec counts the inputs under it; audio pytest is audio's", () => {
  assert.deepEqual(sel(["tooling/province-artefact"]).gates, ["rasters", "npm-test"]);
  assert.deepEqual(sel(["tooling/audio-pipeline/x.py"]).workspaces, ["packages/audio", "tooling/repo-standards"]);
  assert.deepEqual(sel(["tooling/world-generation/requirements-test.txt"]).gates, ["placement", "water", "pipeline", "workbench", "npm-test", "python-deps"]);
  assert.ok(sel(["apps/world-studio/public"]).gates.includes("water"));
});

test("global files and no paths run everything", () => {
  for (const files of [[], ["package.json"], ["tooling/repo-standards/preflight.mjs"]]) {
    const r = sel(files);
    assert.equal(r.all, true);
    assert.deepEqual(r.gates, GATES);
    assert.equal(r.workspaces, null);
  }
});

test("jobs cap: ES_JOBS, else half the cores, at least one", () => {
  assert.equal(jobsCap({}, 4), 2);
  assert.equal(jobsCap({}, 1), 1);
  assert.equal(jobsCap({}, 7), 3);
  assert.equal(jobsCap({ ES_JOBS: "3" }, 4), 3);
  assert.equal(jobsCap({ ES_JOBS: "0" }, 4), 2);
});

test("pin: upper half of the cores unless already confined", () => {
  assert.equal(pinPrefix(4, 4), "nice -n 10 taskset -c 1-3 ");
  assert.equal(pinPrefix(4, 2), "");
  assert.equal(pinPrefix(1, 1), "");
});

test("inside an open batch a re-run keeps only last run's red gates and gates it did not run (0118)", () => {
  const last = { batchId: "b1", runner: false, gates: [["typecheck", 30], ["npm-test", 50], ["placement", 200]], failed: ["typecheck"] };
  assert.deepEqual(rerunOnlyFailed(["typecheck", "npm-test", "placement", "water"], last, "b1"),
    { gates: ["typecheck", "water"], skipped: ["npm-test", "placement"] });
  const all = ["typecheck", "npm-test"];
  assert.deepEqual(rerunOnlyFailed(all, last, "b2").gates, all);                       // another batch
  assert.deepEqual(rerunOnlyFailed(all, { ...last, failed: [] }, "b1").gates, all);    // last run green
  assert.deepEqual(rerunOnlyFailed(all, last, null).gates, all);                       // no open batch
  assert.deepEqual(rerunOnlyFailed(all, { ...last, runner: true }, "b1").gates, all);  // runner rows never narrow
  const scoped = { ...last, paths: ["packages/game-core/src/a.ts"] };
  assert.deepEqual(rerunOnlyFailed(all, scoped, "b1", ["apps/world-studio/src/b.ts"]).gates, all); // other scope
  assert.deepEqual(rerunOnlyFailed(all, scoped, "b1", ["packages/game-core/src/a.ts"]).gates, ["typecheck"]);
});
