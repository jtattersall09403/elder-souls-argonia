#!/usr/bin/env node
/**
 * Preflight: every gate the deploy runs, all at once, every failure listed.
 *
 *   npm run preflight
 *
 * The deploy workflow's gates, all of them (npm test, typecheck, the placement
 * suite, the water suite, the pipeline suite, the raster manifest check and the
 * credits check) — exact parity since the slow placement tier was retired on
 * 2026-09-17 — plus the placement workbench suite, which runs here only.
 * `--runner` runs the gates the way the GitHub runner does: from a clean
 * clone of the COMMITTED tree (HEAD), with the asset vault hidden, so an
 * untracked or gitignored artefact on this machine cannot make a gate pass. Run one at a time, each failure costs a full wait-fix-wait cycle; run here in parallel
 * the wall time is about two gates' worth (~3 min; one wave when memory allows, else two) and the report shows everything
 * that would have failed on CI, in one go. Nothing here changes what a gate
 * asserts; it only runs them together and reads out the failures.
 *
 * `npm run preflight -- --paths <pathspec...>` (decision 0087 §3): the review
 * gate hook (review_gate.py) reads the pathspec from this command and reviews
 * only those files' diff, with its own stamp; and (owner ruling 2026-09-25)
 * only the gates whose inputs intersect the changed files under that pathspec
 * run, npm test only in the touched workspaces and their dependents
 * (preflight_select.mjs holds the map; the skipped gates are printed by name).
 * No --paths is refused (decision 0106): the full run is `--runner`, once
 * before a merge to main; the planner's `preflight` agent runs one scoped
 * preflight per commit batch, and a scoped run over 60 s wall is a FAIL. Within a selected pytest gate
 * (placement, water, pipeline, workbench) only the test files the changed
 * files reach run (speed lane 2 S3: static import graph plus the tests'
 * literal paths, tooling/world-generation/scripts/select_tests.py, handed the
 * files in ES_TEST_CHANGED); a gate none of whose tests they reach is skipped.
 *
 * A failing pytest test is re-run once on a clean clone of HEAD and labelled
 * NEW or PRE-EXISTING (red on HEAD too, with the sha it was first seen red on
 * and "the lane that changed <file>"); results are cached per HEAD sha under
 * tooling/.reports/preflight/ (preflight_heads.mjs). A red on HEAD BLOCKS
 * (decision 0106): it is listed by name and fixed at source, never tolerated.
 *
 * Parallelism is capped by jobs.mjs (ES_JOBS, else half the cores): at most
 * that many gates at once, pytest workers and vitest workers likewise, so a
 * preflight never takes every core (two codespace crashes at 100 % CPU,
 * 2026-09-25).
 *
 * Exit code is non-zero if any gate failed. Each gate's full log is kept at
 * /tmp/preflight/<gate>.log; the summary prints the lines that matter.
 */
import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { availableParallelism } from "node:os";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { jobsCap, pinPrefix } from "./jobs.mjs";
import { loadWorkspaces, rerunOnlyFailed, selectGates } from "./preflight_select.mjs";
import { PYTEST_CWD, byFile, failedIds, headOutcomes, readRecord, writeRecord, unchecked, label } from "./preflight_heads.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Runner mode keeps its logs apart: a working-tree preflight in another lane
// would otherwise overwrite them mid-read (2026-09-27).
const outDir = process.argv.includes("--runner") ? "/tmp/preflight/runner" : "/tmp/preflight";
mkdirSync(outDir, { recursive: true });

// name -> [command, the regexes whose matching lines are worth showing]
const GATES = {
  "npm-test":      ["npm test",                 [/FAIL/, /\[standard \d+\]/, /—/, /workspaces/, /violation/, /Error/]],
  "typecheck":     ["npm run typecheck",        [/error TS/, /workspaces/]],
  "placement":     ["npm run test:placement",   [/^FAILED/, /passed|failed/, /Error/]],
  "water":         ["npm run test:water",       [/^FAILED/, /passed|failed/, /Error/]],
  "pipeline":      ["npm run test:pipeline",    [/^FAILED/, /passed|failed/, /Error/]],
  // tooling/placement-workbench/tests: preflight-only (not a deploy job yet; it
  // needs the local raw kit builds). Collected by no gate before 2026-09-26.
  "workbench":     ["npm run test:workbench",   [/^FAILED/, /passed|failed/, /Error/]],
  "rasters":       ["npm run province:check",   [/province rasters/]],
  "credits":       ["cd tooling/world-generation && python3 -m worldgen.check_credits", [/FAIL/, /Error/, /missing/]],
  // Every module requirements-test.txt declares must import (16h round 16:
  // rtree was declared but missing, and trimesh failed deep in a query).
  "python-deps":   ["cd tooling/world-generation && python3 -m worldgen.check_requirements", [/FAIL/, /Error/]],
  // The composer's kit reach + dangling-reference gate over the sources, no
  // build needed (<1 s; decision 0052 addendum 2026-09-28): a kit file the
  // deployed site would prune while a manifest or bundle still names it.
  // Also in repo-standards' npm test (so CI runs it); this entry names it.
  "site-refs":     ["node tooling/repo-standards/check_site_refs.mjs", [/site-refs/]],
  // The published place bundles through the runtime's own load checks, no
  // WebGL, plus the two other tests that read the published bundles
  // (decision 0052 addendum 2026-09-28); path-selected on the bundles, the
  // kits and the settlement runtime, since game-core's npm test is not.
  "bundle-load":   ["cd packages/game-core && npx vitest run src/settlement/publishedLoad.test.ts src/settlement/publishedResolve.test.ts src/settlement/shippedBundle.test.ts", [/FAIL/, /Error/, /Tests/]],
  // webgpu branch only (walk 8): every built place booted headless on WebGPU with a 60 s hold.
  // Each place is cached on the renderer sources and its own bundle and kit GLBs, so an
  // unchanged place is a skip; never in CI or --runner (planner ruling 2026-10-01). Its own
  // time is outside the scoped limit (a changed renderer is minutes of SwiftShader by nature).
  ...(process.argv.includes("--runner") ? {} : {
    "webgpu-boot": ["cd apps/world-studio && ../../tooling/repo-standards/job_guard.sh webgpu-boot --mem 8 -- node scripts/webgpu-boot-check.mjs --place all", [/^place\./, /webgpu-boot-check: (FAIL|OK|SKIP)/]] }),
};

// RUNNER MODE: `npm run preflight -- --runner` runs every gate exactly as the
// GitHub Pages runner runs it (2026-09-27: run 36327676173 went red on six
// tests that read kits and outputs present only on this machine, after a
// `--runner` preflight that ran in the working tree had passed them):
//  * from a clean clone of HEAD in a temp directory whose parent holds nothing
//    (the runner's checkout has no sibling vault), so untracked and gitignored
//    files — built kits under tooling/asset-pipeline/output, local outputs,
//    uncommitted edits — are absent;
//  * with only what the workflow itself adds: the province raster groups the
//    `rasters` job restores from its cache (tooling/province-artefact/set.json,
//    copied from here and still verified by the `rasters` gate) and the
//    node_modules trees `npm ci` would install (copied, build caches dropped,
//    so typecheck runs cold as on CI);
//  * with both vault overrides pointed at an empty directory. A gate that
//    needs the vault must SKIP there, never error (2026-09-17).
// Commit first: runner mode tests HEAD, never the working tree.
const runnerMode = process.argv.includes("--runner");
// `--paths` belongs to the review gate (the hook reads it from the command
// line); preflight only reports it so the log says which review it follows.
const pathsIdx = process.argv.indexOf("--paths");
const reviewPaths = pathsIdx < 0 ? [] : process.argv.slice(pathsIdx + 1).filter((_, i, a) => !a.slice(0, i + 1).some((t) => t.startsWith("--")));
// Decision 0106 (owner 2026-09-28): a working-tree preflight is scoped, always.
// The full run is the merge-day `--runner`; a bare `npm run preflight` is refused.
if (!runnerMode && !reviewPaths.length) {
  console.error("preflight: refused (decision 0106): name the batch's paths, `npm run preflight -- --paths <pathspec...>`; the full run is `npm run preflight -- --runner`, once before a merge to main.");
  process.exit(2);
}
const startedAt = Date.now();
// A scoped run over this many seconds is itself a red (0106: target < 30 s).
const SCOPED_LIMIT_S = 60;
const runnerEnv = runnerMode
  ? { ES_ASSET_PIPELINE_ROOT: mkdtempSync(join(tmpdir(), "no-vault-")), ES_VAULT_ROOT: "" }
  : {};
if (runnerMode) runnerEnv.ES_VAULT_ROOT = runnerEnv.ES_ASSET_PIPELINE_ROOT;
// Everything runner mode creates goes on exit, however the run ends (a throw
// part-way through the export, Ctrl-C, a watchdog kill of this process).
const scratch = runnerMode ? [runnerEnv.ES_ASSET_PIPELINE_ROOT] : [];
process.on("exit", () => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => process.exit(130));

function exportCommittedTree() {
  const sh = (cmd, args, cwd = repoRoot) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const head = sh("git", ["rev-parse", "HEAD"]).trim();
  const parent = mkdtempSync(join(tmpdir(), "preflight-runner-"));
  scratch.push(parent);
  const tree = join(parent, basename(repoRoot));
  sh("git", ["clone", "--quiet", "--shared", "--no-checkout", repoRoot, tree]);
  sh("git", ["-c", "advice.detachedHead=false", "checkout", "--quiet", "--detach", head], tree);
  // The raster groups, exactly the cache paths the workflow restores. Copies
  // are hard links (same volume; no gate writes a raster or a dependency), so
  // an export costs seconds and next to no disk.
  const set = JSON.parse(readFileSync(join(repoRoot, "tooling", "province-artefact", "set.json"), "utf8"));
  const globs = Object.values(set.groups).flat().map((g) => `:(glob)${set.root}/${g}`);
  const rasters = sh("git", ["ls-files", "-o", "-i", "--exclude-standard", "-z", "--", ...globs]).split("\0").filter(Boolean);
  execFileSync("rsync", ["-a", `--link-dest=${repoRoot}`, "--from0", "--files-from=-", "./", tree + "/"], { cwd: repoRoot, input: rasters.join("\0") });
  // What `npm ci` installs: every node_modules tree, without build caches.
  const modules = ["node_modules", ...loadWorkspaces(repoRoot).map((w) => join(w.dir, "node_modules"))]
    .filter((d, i, a) => a.indexOf(d) === i && existsSync(join(repoRoot, d)));
  for (const d of modules) {
    execFileSync("rsync", ["-a", `--link-dest=${join(repoRoot, d)}`, "--exclude=/.cache", "--exclude=/.vite", join(repoRoot, d) + "/", join(tree, d) + "/"]);
  }
  console.log(`preflight: runner mode: clean clone of ${head.slice(0, 8)} at ${tree} (+${rasters.length} rasters, ${modules.length} node_modules trees)`);
  return tree;
}

// The workbench gate is preflight-only (no deploy job runs it, and it needs
// the local raw kit builds), so runner mode leaves it in the working tree.
const gateCwd = (name) => (runnerTree && name !== "workbench" ? runnerTree : repoRoot);

function run(name, cmd, extraEnv = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    // PY_COLORS=0: pytest reads FORCE_COLOR's mere presence as "force colour",
    // and coloured "FAILED" lines matched neither the summary filter nor the
    // pre-existing-red parser (2026-09-27)
    const child = spawn(cmd, { cwd: gateCwd(name), shell: true, env: { ...process.env, FORCE_COLOR: "0", PY_COLORS: "0", ...extraEnv } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      writeFileSync(join(outDir, `${name}.log`), out);
      resolve({ name, code, seconds: Math.round((Date.now() - t0) / 1000), out });
    });
  });
}

function runIn(cwd, cmd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, env: { ...process.env, FORCE_COLOR: "0", PY_COLORS: "0", ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

// A clean clone of HEAD with every gitignored path of this tree (built kits,
// survey caches, outputs, node_modules; not bytecode) symlinked in at the
// same place, so a test differs from the working tree only by the committed
// code and data. Removed on exit.
function headTreeWithArtefacts(head) {
  const parent = mkdtempSync(join(tmpdir(), "preflight-head-"));
  scratch.push(parent);
  const tree = join(parent, basename(repoRoot));
  execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", repoRoot, tree]);
  execFileSync("git", ["-c", "advice.detachedHead=false", "checkout", "--quiet", "--detach", head], { cwd: tree });
  const ignored = execFileSync("git", ["ls-files", "-o", "-i", "--exclude-standard", "--directory", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0").filter((p) => p && !/(^|\/)__pycache__\/?$|\.pyc$|^\.pytest_cache/.test(p));
  for (const p of ignored) {
    const rel = p.replace(/\/$/, "");
    const dst = join(tree, rel);
    if (existsSync(dst)) continue;
    mkdirSync(dirname(dst), { recursive: true });
    symlinkSync(join(repoRoot, rel), dst);
  }
  return tree;
}

// MEMORY BUDGET (2026-09-16). Six gates at once, two of them pytest suites
// at `-n auto` (8 workers each, every worker holding the 4033² province
// rasters), plus eight vitest workspaces and nine tsc projects, peaked past
// the 12 GiB the session's cgroup allows and the kernel killed the whole
// process tree — the editor session with it. So the pytest worker count and
// the workspace job count are derived from the memory the cgroup actually
// grants (memory.max, else MemAvailable), and the gates run in two waves so
// the two raster-heavy suites never share the budget with everything else.
function memoryBudgetBytes() {
  for (const f of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const v = readFileSync(f, "utf8").trim();
      if (v !== "max" && Number(v) > 0 && Number(v) < 2 ** 50) return Number(v);
    } catch { /* no cgroup file */ }
  }
  const m = /MemAvailable:\s+(\d+) kB/.exec(readFileSync("/proc/meminfo", "utf8"));
  return m ? Number(m[1]) * 1024 : 16 * 2 ** 30;
}
const GIB = 2 ** 30;
// The budget is what is FREE under the cap right now, not the cap: the dev
// server, headless browsers and other sessions in the same cgroup already
// hold several GiB (measured 1.9–4 GiB idle on 2026-09-16/17). "Used" is the
// UNRECLAIMABLE part of memory.stat (anon + shmem + kernel): memory.current
// also counts the file cache of every raster read, which the kernel reclaims
// under pressure long before it kills anything (3.1 GiB of cache idle on
// 2026-09-17 made preflight run one worker for nothing).
function memoryUsedBytes() {
  try {
    const stat = readFileSync("/sys/fs/cgroup/memory.stat", "utf8");
    let used = 0;
    for (const key of ["anon", "shmem", "kernel"]) {
      const m = new RegExp(`^${key} (\\d+)`, "m").exec(stat);
      if (m) used += Number(m[1]);
    }
    return used;
  } catch { return 0; }
}
const capBytes = memoryBudgetBytes();
const usedBytes = memoryUsedBytes();
const budget = capBytes - usedBytes;
// Measured 2026-09-23 on the placement suite, two workers: 3.07 GiB peak
// private memory for the whole pytest tree, ~1.5 GiB per worker, now that the
// province survey is served memory-mapped from output/survey-cache (shared
// page cache, 0.06 GiB private per process; site_fields.shared_survey,
// water_report.ArrayCache). Budget: 1.5 GiB reserve for the other gates,
// 1.5 GiB per pytest worker, at most 4 workers; and every gate runs under
// memwatch.sh, which kills THE GATE if the unreclaimable memory passes the
// ceiling, never the session.
const jobs = jobsCap();
// Under job_guard, the slot's core share (ES_JOB_CORES, method review C1) caps it too.
const slotCores = Number(process.env.ES_JOB_CORES) > 0 ? Number(process.env.ES_JOB_CORES) : Infinity;
const pyWorkers = Math.max(1, Math.min(4, availableParallelism(), jobs, slotCores,
  Math.floor((budget - 1.5 * GIB) / (1.5 * GIB))));
const wsJobs = Math.min(4, jobs);
// Under an outer memwatch (job_guard), each gate's ceiling sits 0.25 GiB below
// the outer one, so the gate is killed and reported, never the whole preflight.
const outerMib = Number(process.env.MEMWATCH_OUTER_CEILING_MIB);
const ceilingGib = Math.min(Math.max(6, Math.floor(capBytes / GIB) - 2),
  outerMib > 0 ? Math.floor((outerMib / 1024 - 0.25) * 100) / 100 : Infinity);
const env = { PYTEST_XDIST_AUTO_NUM_WORKERS: String(pyWorkers), WORKSPACE_JOBS: String(wsJobs),
  VITEST_MAX_WORKERS: String(jobs), ...runnerEnv };

// PATH SCOPING: the changed files under the pathspec (tracked changes against
// HEAD plus untracked files); a pathspec with nothing changed counts as itself.
function changedFiles(pathspec) {
  if (!pathspec.length) return [];
  const git = (...a) => execFileSync("git", a, { cwd: repoRoot, encoding: "utf8" }).split("\n").filter(Boolean);
  const files = [...new Set([...git("diff", "--name-only", "HEAD", "--", ...pathspec),
    ...git("ls-files", "-o", "--exclude-standard", "--", ...pathspec)])];
  return files.length ? files : pathspec.map((p) => p.replace(/^\.\//, ""));
}
const selection = selectGates(changedFiles(reviewPaths), loadWorkspaces(repoRoot), Object.keys(GATES));
const gateEnv = {};
// The workbench gate runs in the working tree for the local raw kit builds
// (gateCwd), so it must see them: the vault-hiding overrides stay off it, or
// blueprint_footprints finds no <kit>.footprints.json under the empty scratch
// root (the 2026-09-30 --runner run: six test_walk2_rules/test_walk4_compile reds).
if (runnerMode) gateEnv.workbench = Object.fromEntries(Object.entries(env).filter(([k]) => !(k in runnerEnv)));
const gateCmd = Object.fromEntries(Object.entries(GATES).map(([k, v]) => [k, v[0]]));
if (!selection.all) {
  gateEnv["npm-test"] = { ...env, WORKSPACE_ONLY: selection.workspaces.join(",") };
  gateCmd["npm-test"] = [selection.workspaces.length ? "node tooling/repo-standards/run-workspaces.mjs test" : "",
    selection.weapons ? "npm run weapons:reach -- --check" : ""].filter(Boolean).join(" && ");
  console.log(`preflight: scoped to ${reviewPaths.join(" ")}: running ${selection.gates.join(", ") || "no gates"}` +
    (selection.gates.includes("npm-test") ? ` (npm test in ${selection.workspaces.join(", ")}${selection.weapons ? " + weapons reach" : ""})` : ""));
  console.log(`preflight: skipped (inputs untouched): ${selection.skipped.join(", ") || "none"}`);
}
// TEST SELECTION inside the pytest gates (S3): each selected suite runs only
// the test files the changed files reach; a suite with none is skipped.
if (!selection.all) {
  const changed = changedFiles(reviewPaths);
  for (const gate of Object.keys(PYTEST_CWD)) {
    if (!selection.gates.includes(gate)) continue;
    const suiteEnv = { ...env, ES_TEST_CHANGED: changed.join("\n") };
    let sum;
    try {
      sum = JSON.parse(execFileSync("python3", ["tooling/world-generation/scripts/select_tests.py", gate, "--summary"],
        { cwd: repoRoot, encoding: "utf8", env: { ...process.env, ES_TEST_CHANGED: suiteEnv.ES_TEST_CHANGED } }));
    } catch (e) {
      console.log(`preflight: ${gate}: test selection failed (${String(e.message).split("\n")[0]}); running the whole suite`);
      continue;
    }
    if (!sum.selected.length) {
      selection.gates = selection.gates.filter((g) => g !== gate);
      selection.skipped.push(gate);
      console.log(`preflight: ${gate}: no test reaches the changed files; skipped`);
      continue;
    }
    gateEnv[gate] = suiteEnv;
    console.log(`preflight: ${gate}: ${sum.selected.length} of ${sum.total} test files` +
      (sum.all ? ` (whole suite: ${sum.reasons["*"]})` : "") +
      (sum.deselect.length ? `; slow deselected: ${sum.deselect.join(", ")}` : ""));
  }
}
// One close per batch (decision 0118): inside the open review batch, a re-run
// runs only last run's red gates (and gates it did not run); `--all-gates` opts out.
const RUNS_LOG = join(repoRoot, "tooling", ".reports", "preflight", "runs.jsonl");
const batchId = (() => {
  try {
    const s = JSON.parse(readFileSync(join(repoRoot, "tooling", ".reports", "review", "stamp.json"), "utf8"));
    return s.open && s.batchId ? s.batchId : null;
  } catch { return null; }
})();
if (!runnerMode && !process.argv.includes("--all-gates")) {
  let last = null;
  try {
    const rows = readFileSync(RUNS_LOG, "utf8").trim().split("\n");
    last = JSON.parse(rows[rows.length - 1]);
  } catch { /* no log yet */ }
  const narrowed = rerunOnlyFailed(selection.gates, last, batchId, reviewPaths);
  if (narrowed.skipped.length) {
    selection.gates = narrowed.gates;
    selection.skipped.push(...narrowed.skipped);
    console.log(`preflight: re-run inside batch ${batchId}: only last run's red gates; green last time, skipped: ${narrowed.skipped.join(", ")} (--all-gates runs them)`);
  }
}
const runnerTree = runnerMode ? exportCommittedTree() : null;
console.log(`preflight: ${(capBytes / GIB).toFixed(1)} GiB cap, ${(usedBytes / GIB).toFixed(1)} GiB already used → ${(budget / GIB).toFixed(1)} GiB free → ${pyWorkers} pytest workers, ${wsJobs} workspace jobs, ${jobs} gates at once (ES_JOBS cap), watchdog ceiling ${ceilingGib} GiB`);
const memwatch = join(repoRoot, "tooling", "repo-standards", "memwatch.sh");
// Two waves: the placement suite (10.2 GiB beside typecheck on 2026-09-16,
// before the survey cache) now runs with the water, typecheck and raster gates.
// Measured alone under memwatch's own-tree figure (2026-09-26): placement
// 3.8 GiB, water 4.4, typecheck 1.2, so wave 1 is ~10 GiB of its own under a
// 22 GiB ceiling and needs no further serialising; the "12.7 GiB" once logged
// for placement was the whole machine.
// ONE wave when the selected gates' own peaks fit (tool-speed review S5b):
// the memory already used plus the sum of those peaks plus a 1.5 GiB reserve
// must sit under memwatch's ceiling, the figure that kills a gate. The
// peaks are memwatch's own-tree figures (2026-09-26; pipeline, npm-test from
// tool-timings.jsonl, workbench 0.74 GiB at 4 workers on 2026-09-26, the
// small gates rounded up); the order puts the heavy gates first.
const GATE_PEAK_GIB = { placement: 3.8, water: 4.4, pipeline: 1.5, workbench: 1.0, typecheck: 1.2,
  "npm-test": 2.0, rasters: 1.0, credits: 0.5, "python-deps": 0.5, "site-refs": 0.2, "bundle-load": 0.5, "webgpu-boot": 3.0 };
// Every gate in GATES runs in some wave: a gate missing from the lists below
// joins the last wave (2026-09-28: two new gates were selected and never run
// because the waves were a hand list).
const TWO_WAVES = [["placement", "water", "typecheck", "rasters"], ["pipeline", "workbench", "npm-test", "credits", "python-deps"]];
for (const g of Object.keys(GATES)) if (!TWO_WAVES.flat().includes(g)) TWO_WAVES[1].push(g);
const plannedGib = selection.gates.reduce((sum, g) => sum + (GATE_PEAK_GIB[g] ?? 2), 0);
const oneWave = usedBytes + (plannedGib + 1.5) * GIB <= ceilingGib * GIB;
const WAVES = oneWave
  ? [[...new Set([...Object.keys(GATE_PEAK_GIB), ...Object.keys(GATES)])].filter((g) => g in GATES)] : TWO_WAVES;
console.log(`preflight: ${oneWave ? "one wave" : "two waves"} (selected gates' own peaks ${plannedGib.toFixed(1)} GiB + 1.5 reserve + ${(usedBytes / GIB).toFixed(1)} used vs ${ceilingGib} GiB ceiling)`);
const results = [];
for (const wave of WAVES) {
  const queue = wave.filter((name) => selection.gates.includes(name));
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      results.push(await run(name, `${pinPrefix()}${memwatch} --ceiling-gib ${ceilingGib} '${gateCmd[name]}'`, gateEnv[name] ?? env));
    }
  }));
}
// PRE-EXISTING REDS (S4): the failing pytest ids of each red gate, re-run once
// per HEAD sha on a clean clone of HEAD with this tree's ignored artefacts
// linked in; the outcome is cached in tooling/.reports/preflight/head-<sha>.json.
const headDir = join(repoRoot, "tooling", ".reports", "preflight");
const labels = {};
if (!runnerMode) {
  const reds = results.filter((r) => r.code !== 0 && PYTEST_CWD[r.name]).map((r) => [r.name, failedIds(r.out)]).filter(([, ids]) => ids.length);
  if (reds.length) {
    const git = (...a) => execFileSync("git", a, { cwd: repoRoot, encoding: "utf8" }).trim();
    const head = git("rev-parse", "HEAD");
    const record = readRecord(headDir, head);
    const todo = reds.map(([g, ids]) => [g, unchecked(record, g, ids)]).filter(([, ids]) => ids.length);
    if (todo.length) {
      let tree = null;
      try {
        tree = headTreeWithArtefacts(head);
        for (const [g, ids] of todo) {
          const present = ids.filter((id) => existsSync(join(tree, PYTEST_CWD[g], id.split("::")[0])));
          const outcomes = Object.fromEntries(ids.filter((id) => !present.includes(id)).map((id) => [id, "absent"]));
          const t0 = Date.now();
          for (const batch of byFile(present)) {   // one run per file: a bad id never condemns another file's
            const r = await runIn(join(tree, PYTEST_CWD[g]),
              `${pinPrefix()}timeout 600 python3 -m pytest -q -p no:cacheprovider -p no:randomly ${batch.map((id) => `'${id.replace(/'/g, "'\\''")}'`).join(" ")}`);
            Object.assign(outcomes, headOutcomes(batch, r.out, r.code));
          }
          if (present.length) console.log(`preflight: re-ran ${present.length} failing ${g} test(s) on HEAD ${head.slice(0, 8)} in ${Math.round((Date.now() - t0) / 1000)}s`);
          record.gates[g] = { ...record.gates[g], ...outcomes };
        }
        writeRecord(headDir, record);
      } catch (e) {
        console.log(`preflight: could not check the reds on HEAD (${String(e.message).split("\n")[0]})`);
      }
    }
    const owner = (file) => { try { return git("log", "-1", "--format=%h %s", "--", file).slice(0, 90) || "no commit"; } catch { return "unknown"; } };
    for (const [g, ids] of reds) labels[g] = label(g, ids, record, headDir, repoRoot, owner);
  }
}

let failed = 0;
const headReds = [];
console.log("\npreflight — every deploy gate, run together\n");
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) failed++;
  // The gate's own memory (its process tree), from its memwatch's last line;
  // the machine figure beside it holds every other gate and lane, so it is
  // never a per-gate number (2026-09-26).
  const own = [...r.out.matchAll(/own peak ([\d.]+) GiB/g)].pop()?.[1];
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.name.padEnd(10)} ${String(r.seconds).padStart(4)}s ${own ? `${own.padStart(6)} GiB own` : "".padStart(14)}   (log: ${outDir}/${r.name}.log)`);
  if (!ok) {
    const patterns = GATES[r.name][1];
    const lines = r.out.split("\n").filter((l) => patterns.some((p) => p.test(l)));
    const tagged = new Map((labels[r.name] ?? []).map((x) => [x.id, x]));
    // the failing test ids first (they carry the NEW / PRE-EXISTING label), then the rest
    const uniq = [...new Set(lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "")))];
    const ordered = [...uniq.filter((l) => failedIds(l).length), ...uniq.filter((l) => !failedIds(l).length)];
    for (const l of ordered.slice(0, 25)) {
      const id = failedIds(l)[0];
      const x = id && tagged.get(id);
      const tag = !x ? "" : x.label === "PRE-EXISTING"
        ? `RED ON HEAD (first seen ${x.firstSeen.slice(0, 8)}; last touched by: ${x.owner}) `
        : x.label === "NEW" ? "NEW " : "";
      console.log("      " + (tag + l.trim()).slice(0, 320));
    }
    const pre = (labels[r.name] ?? []).filter((x) => x.label === "PRE-EXISTING");
    if (pre.length) headReds.push(...pre.map((x) => x.id));
  }
}
// Decision 0106: a test red on HEAD blocks. It is fixed at source now, by
// whoever meets it, never labelled and tolerated (16 runs on 2026-09-28 each
// re-reported the same two HEAD reds).
if (headReds.length) {
  console.log(`\nBLOCKED: ${headReds.length} test(s) red on HEAD: fix at source before anything else (decision 0106):`);
  for (const id of headReds) console.log(`      ${id}`);
}
const wallS = Math.round((Date.now() - startedAt) / 1000);
const slow = !runnerMode && wallS - (results.find((r) => r.name === "webgpu-boot")?.seconds ?? 0) > SCOPED_LIMIT_S;
if (slow) console.log(`\nFAIL  scoped preflight took ${wallS}s, over the ${SCOPED_LIMIT_S}s limit (decision 0106): the selection is too wide; fix select_tests.py or the pathspec, never re-run as is.`);
console.log(`\n${results.length - failed} passed, ${failed} failed; slowest ${Math.max(0, ...results.map((r) => r.seconds))}s; wall ${wallS}s` +
  (selection.skipped.length ? `; skipped ${selection.skipped.join(", ")}` : "") + "\n");
if (!runnerMode) writeStamp(reviewPaths, !failed && !slow);
// One line per run for the weekly drift check (cost-review § Workflow drift).
try {
  appendFileSync(RUNS_LOG, JSON.stringify({
    at: new Date().toISOString(), runner: runnerMode, paths: reviewPaths, wallS, passed: !failed && !slow,
    gates: results.map((r) => [r.name, r.seconds]), headReds: headReds.length, batchId,
    failed: results.filter((r) => r.code !== 0).map((r) => r.name) }) + "\n");
} catch { /* a log line never fails a run */ }
process.exit(failed || slow ? 1 : 0);

// The once-per-batch stamp preflight_guard.py reads (decision 0106): the
// pathspec, HEAD and a hash of the diff under it. The guard refuses the same
// run again until a commit or an edit under those paths.
function writeStamp(paths, passed) {
  try {
    const out = execFileSync("python3", [join(repoRoot, "tooling", "repo-standards", "hooks", "preflight_guard.py"), "--stamp", String(passed), ...paths],
      { cwd: repoRoot, encoding: "utf8" });
    if (out.trim()) console.log(out.trim());
  } catch (e) { console.log(`preflight: stamp not written (${String(e.message).split("\n")[0]})`); }
}
