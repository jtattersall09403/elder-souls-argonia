// The machine-wide cap on parallel work (owner ruling 2026-09-25, after two
// codespace crashes at 100 % CPU): ES_JOBS, else max(1, floor(nproc / 2)),
// so a test or preflight run never takes every core and the editor tunnel and
// the Claude CLI keep the rest. preflight.mjs caps its concurrent gates and
// pytest workers with it, run-workspaces.mjs its workspace jobs and every
// vitest pool (VITEST_MAX_WORKERS, which vitest 4 reads over its config).
import { existsSync } from "node:fs";
import { availableParallelism, cpus } from "node:os";

// The machine's cores, not this process's affinity: under job_guard's taskset
// (half the cores) availableParallelism() would halve the cap a second time.
export function jobsCap(env = process.env, cores = cpus().length) {
  const v = Number(env.ES_JOBS);
  if (env.ES_JOBS !== undefined && env.ES_JOBS !== "" && Number.isSafeInteger(v) && v >= 1) return v;
  return Math.max(1, Math.floor(cores / 2));
}

// The caps multiply (gates x pytest workers, workspaces x vitest workers), so
// the CPU bound is the pin: a shell prefix that runs a child at nice 10 on
// the upper half of the cores, the cores job_guard.sh uses, leaving the lower
// half to the editor tunnel and the CLI. Empty when this process is already
// confined (under job_guard, or a nested runner), on one core, or without taskset.
export function pinPrefix(cores = cpus().length, allowed = availableParallelism()) {
  if (allowed < cores || cores < 2 || !existsSync("/usr/bin/taskset")) return "";
  return `nice -n 10 taskset -c ${Math.floor(cores / 2)}-${cores - 1} `;
}
