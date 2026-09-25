// node --test: preflight's path scoping picks the gates a fixture path list needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectGates } from "./preflight_select.mjs";
import { jobsCap, pinPrefix } from "./jobs.mjs";

const GATES = ["placement", "water", "typecheck", "rasters", "pipeline", "npm-test", "credits", "python-deps"];
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
  assert.deepEqual(r.skipped, ["placement", "water", "typecheck", "rasters", "pipeline", "credits", "python-deps"]);
});

test("a package change tests its dependents and typechecks", () => {
  const r = sel(["packages/contracts/src/index.ts"]);
  assert.deepEqual(r.gates, ["typecheck", "npm-test"]);
  assert.deepEqual(r.workspaces, ["packages/game-core", "apps/world-studio", "tooling/repo-standards"]);
});

test("a world record runs the Python world suites, pipeline and the studio tests", () => {
  const r = sel(["world/sources/places/foo.json"]);
  assert.deepEqual(r.gates, ["placement", "water", "pipeline", "npm-test"]);
  assert.deepEqual(r.workspaces, ["apps/world-studio", "tooling/repo-standards"]);
  assert.deepEqual(sel(["tooling/asset-pipeline/pipeline/placement_metadata.py"]).gates.slice(0, 3), ["placement", "water", "pipeline"]);
  assert.deepEqual(sel(["apps/world-studio/public/kits/x.glb"]).gates.slice(0, 3), ["placement", "water", "pipeline"]);
  const credits = sel(["world/sources/assets/pools.json", "README.md"]);
  assert.ok(credits.gates.includes("credits"));
});

test("a directory pathspec counts the inputs under it; audio pytest is audio's", () => {
  assert.deepEqual(sel(["tooling/province-artefact"]).gates, ["rasters", "npm-test"]);
  assert.deepEqual(sel(["tooling/audio-pipeline/x.py"]).workspaces, ["packages/audio", "tooling/repo-standards"]);
  assert.deepEqual(sel(["tooling/world-generation/requirements-test.txt"]).gates, ["placement", "water", "pipeline", "npm-test", "python-deps"]);
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
  assert.equal(pinPrefix(4, 4), "nice -n 10 taskset -c 2-3 ");
  assert.equal(pinPrefix(4, 2), "");
  assert.equal(pinPrefix(1, 1), "");
});
