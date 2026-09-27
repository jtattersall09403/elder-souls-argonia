// Not a probe: the job-pool guard every headless-Chrome probe imports FIRST
// (speed lane 3B, 2026-09-27; speed lane 2 rec 4: Chrome and SwiftShader ran
// unpinned beside the pinned jobs and held the machine at 88-95 %).
//
//   import "./probe-guard.mjs";   // before any other import
//
// A probe started outside a job (no ES_JOB_CORES in its environment) re-runs
// itself through tooling/repo-standards/job_guard.sh and exits with its code,
// so node, vite, Chrome and SwiftShader all inherit the job pool (cores
// 1-<n-1>, nice 10, idle I/O) and take one of the machine's heavy-job slots,
// leaving core 0 to the planner, the agents and the owner's studio.
// ES_PROBE_NO_GUARD=1 runs a probe unguarded (a one-off on a quiet machine).
import { spawnSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = process.argv[1] ? resolve(process.argv[1]) : "";

/** The shell command job_guard runs (`bash -c "$*"`): this node, the probe, its arguments. */
export function guardedCommand(argv = process.argv) {
  const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  return [process.execPath, resolve(argv[1]), ...argv.slice(2)].map(quote).join(" ");
}

if (!process.env.ES_JOB_CORES && process.env.ES_PROBE_NO_GUARD !== "1"
    && dirname(script) === here && /^probe-.*\.mjs$/.test(basename(script))
    && basename(script) !== "probe-guard.mjs") {
  const guard = resolve(here, "../../../tooling/repo-standards/job_guard.sh");
  const lane = basename(script, ".mjs");
  // A probe waits at most ES_JOB_WAIT_S (default here 120 s, job_guard's own
  // is 30 min) for a slot, then job_guard fails loudly (exit 75): a caller
  // under a shell time cap is never left hanging on a busy machine.
  const env = { ...process.env, ES_JOB_WAIT_S: process.env.ES_JOB_WAIT_S || "120" };
  const run = spawnSync("bash", [guard, lane, "--", guardedCommand()], { stdio: "inherit", env });
  process.exit(run.status ?? 1);
}
