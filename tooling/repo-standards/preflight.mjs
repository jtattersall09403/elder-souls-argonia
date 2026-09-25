#!/usr/bin/env node
/**
 * Preflight: every gate the deploy runs, all at once, every failure listed.
 *
 *   npm run preflight
 *
 * The deploy workflow's gates, all of them (npm test, typecheck, the placement
 * suite, the water suite, the pipeline suite, the raster manifest check and the
 * credits check) — exact parity since the slow placement tier was retired on
 * 2026-09-17. `--runner` additionally hides the asset vault, the way the
 * GitHub runner has it hidden. Run one at a
 * time, each failure costs a full wait-fix-wait cycle; run here in parallel
 * the wall time is about two gates' worth (~3 min, two waves) and the report shows everything
 * that would have failed on CI, in one go. Nothing here changes what a gate
 * asserts; it only runs them together and reads out the failures.
 *
 * `npm run preflight -- --paths <pathspec...>` (decision 0087 §3): the review
 * gate hook (review_gate.py) reads the pathspec from this command and reviews
 * only those files' diff, with its own stamp; and (owner ruling 2026-09-25)
 * only the gates whose inputs intersect the changed files under that pathspec
 * run, npm test only in the touched workspaces and their dependents
 * (preflight_select.mjs holds the map; the skipped gates are printed by name).
 * No --paths runs every gate: the once-before-merge full run. A lane
 * preflights its own commit this way.
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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { availableParallelism } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { jobsCap, pinPrefix } from "./jobs.mjs";
import { loadWorkspaces, selectGates } from "./preflight_select.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = "/tmp/preflight";
mkdirSync(outDir, { recursive: true });

// name -> [command, the regexes whose matching lines are worth showing]
const GATES = {
  "npm-test":      ["npm test",                 [/FAIL/, /\[standard \d+\]/, /—/, /workspaces/, /violation/, /Error/]],
  "typecheck":     ["npm run typecheck",        [/error TS/, /workspaces/]],
  "placement":     ["npm run test:placement",   [/^FAILED/, /passed|failed/, /Error/]],
  "water":         ["npm run test:water",       [/^FAILED/, /passed|failed/, /Error/]],
  "pipeline":      ["npm run test:pipeline",    [/^FAILED/, /passed|failed/, /Error/]],
  "rasters":       ["npm run province:check",   [/province rasters/]],
  "credits":       ["cd tooling/world-generation && python3 -m worldgen.check_credits", [/FAIL/, /Error/, /missing/]],
  // Every module requirements-test.txt declares must import (16h round 16:
  // rtree was declared but missing, and trimesh failed deep in a query).
  "python-deps":   ["cd tooling/world-generation && python3 -m worldgen.check_requirements", [/FAIL/, /Error/]],
};

// RUNNER MODE: `npm run preflight -- --runner` points both vault overrides at
// a fresh empty directory, so every gate runs exactly as the GitHub Pages
// runner runs it — with no asset vault. A gate that needs the vault must
// SKIP there, never error (2026-09-17: two apron tests errored and took the
// deploy down).
const runnerMode = process.argv.includes("--runner");
// `--paths` belongs to the review gate (the hook reads it from the command
// line); preflight only reports it so the log says which review it follows.
const pathsIdx = process.argv.indexOf("--paths");
const reviewPaths = pathsIdx < 0 ? [] : process.argv.slice(pathsIdx + 1).filter((_, i, a) => !a.slice(0, i + 1).some((t) => t.startsWith("--")));
const runnerEnv = runnerMode
  ? { ES_ASSET_PIPELINE_ROOT: mkdtempSync(join(tmpdir(), "no-vault-")), ES_VAULT_ROOT: "" }
  : {};
if (runnerMode) runnerEnv.ES_VAULT_ROOT = runnerEnv.ES_ASSET_PIPELINE_ROOT;

function run(name, cmd, extraEnv = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(cmd, { cwd: repoRoot, shell: true, env: { ...process.env, FORCE_COLOR: "0", ...extraEnv } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      writeFileSync(join(outDir, `${name}.log`), out);
      resolve({ name, code, seconds: Math.round((Date.now() - t0) / 1000), out });
    });
  });
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
const pyWorkers = Math.max(1, Math.min(4, availableParallelism(), jobs,
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
const gateCmd = Object.fromEntries(Object.entries(GATES).map(([k, v]) => [k, v[0]]));
if (!selection.all) {
  gateEnv["npm-test"] = { ...env, WORKSPACE_ONLY: selection.workspaces.join(",") };
  gateCmd["npm-test"] = [selection.workspaces.length ? "node tooling/repo-standards/run-workspaces.mjs test" : "",
    selection.weapons ? "npm run weapons:reach -- --check" : ""].filter(Boolean).join(" && ");
  console.log(`preflight: scoped to ${reviewPaths.join(" ")}: running ${selection.gates.join(", ") || "no gates"}` +
    (selection.gates.includes("npm-test") ? ` (npm test in ${selection.workspaces.join(", ")}${selection.weapons ? " + weapons reach" : ""})` : ""));
  console.log(`preflight: skipped (inputs untouched): ${selection.skipped.join(", ") || "none"}`);
}
if (runnerMode) console.log("preflight: runner mode (no asset vault)");
console.log(`preflight: ${(capBytes / GIB).toFixed(1)} GiB cap, ${(usedBytes / GIB).toFixed(1)} GiB already used → ${(budget / GIB).toFixed(1)} GiB free → ${pyWorkers} pytest workers, ${wsJobs} workspace jobs, ${jobs} gates at once (ES_JOBS cap), two waves, watchdog ceiling ${ceilingGib} GiB`);
const memwatch = join(repoRoot, "tooling", "repo-standards", "memwatch.sh");
// Two waves: the placement suite (10.2 GiB beside typecheck on 2026-09-16,
// before the survey cache) now runs with the water, typecheck and raster gates.
const WAVES = [["placement", "water", "typecheck", "rasters"], ["pipeline", "npm-test", "credits", "python-deps"]];
const results = [];
for (const wave of WAVES) {
  const queue = wave.filter((name) => selection.gates.includes(name));
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      results.push(await run(name, `${pinPrefix()}${memwatch} --ceiling-gib ${ceilingGib} '${gateCmd[name]}'`, gateEnv[name] ?? env));
    }
  }));
}
let failed = 0;
console.log("\npreflight — every deploy gate, run together\n");
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.name.padEnd(10)} ${String(r.seconds).padStart(4)}s   (log: ${outDir}/${r.name}.log)`);
  if (!ok) {
    const patterns = GATES[r.name][1];
    const lines = r.out.split("\n").filter((l) => patterns.some((p) => p.test(l)));
    for (const l of [...new Set(lines)].slice(0, 25)) console.log("      " + l.trim().slice(0, 200));
  }
}
console.log(`\n${results.length - failed} passed, ${failed} failed; slowest ${Math.max(0, ...results.map((r) => r.seconds))}s` +
  (selection.skipped.length ? `; skipped ${selection.skipped.join(", ")}` : "") + "\n");
process.exit(failed ? 1 : 0);
