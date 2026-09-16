#!/usr/bin/env node
/**
 * Preflight: every gate the deploy runs, all at once, every failure listed.
 *
 *   npm run preflight
 *
 * The deploy workflow runs five independent gates (npm test, typecheck, the
 * placement suite, the water suite, the raster manifest check). Run one at a
 * time, each failure costs a full wait-fix-wait cycle; run here in parallel
 * the wall time is about two gates' worth (~3 min, two waves) and the report shows everything
 * that would have failed on CI, in one go. Nothing here changes what a gate
 * asserts; it only runs them together and reads out the failures.
 *
 * Exit code is non-zero if any gate failed. Each gate's full log is kept at
 * /tmp/preflight/<gate>.log; the summary prints the lines that matter.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
};

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
const budget = memoryBudgetBytes();
// Measured 2026-09-16: the editor session and its agents hold ~3.5 GiB
// before a gate starts; a placement worker peaks near 1 GiB on the province
// rasters (the apron test's 5 GiB spike was fixed at the root, see
// build_border_apron.apron_height). Budget: 4 GiB reserved, 2 GiB per pytest
// worker, at most 4 workers; and every gate runs under memwatch.sh, which
// kills THE GATE if the cgroup passes the ceiling, never the session.
// Measured 2026-09-16 on the placement suite alone: 3 workers → 10.5 GiB
// (the idle session already holds ~4.4 GiB), 2 workers fit. Per worker
// budget 3 GiB over a 4.5 GiB reserve; at most 2 workers on this box.
const pyWorkers = Math.max(1, Math.min(2, availableParallelism(),
  Math.floor((budget - 4.5 * GIB) / (3 * GIB))));
const wsJobs = Math.max(2, Math.min(4, availableParallelism()));
const ceilingGib = Math.max(6, Math.floor(budget / GIB) - 2);
const env = { PYTEST_XDIST_AUTO_NUM_WORKERS: String(pyWorkers), WORKSPACE_JOBS: String(wsJobs) };
console.log(`preflight: memory budget ${(budget / GIB).toFixed(1)} GiB → ${pyWorkers} pytest workers, ${wsJobs} workspace jobs, three waves, watchdog ceiling ${ceilingGib} GiB`);
const memwatch = join(repoRoot, "tooling", "repo-standards", "memwatch.sh");
// The placement suite runs ALONE: at 4 workers beside typecheck it still
// reached 10.2 GiB (measured 2026-09-16); the rest pair up.
const WAVES = [["placement"], ["water", "typecheck", "rasters"], ["pipeline", "npm-test"]];
const results = [];
for (const wave of WAVES) {
  results.push(...await Promise.all(wave.map((name) =>
    run(name, `${memwatch} --ceiling-gib ${ceilingGib} '${GATES[name][0]}'`, env))));
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
console.log(`\n${results.length - failed} passed, ${failed} failed; slowest ${Math.max(...results.map((r) => r.seconds))}s\n`);
process.exit(failed ? 1 : 0);
