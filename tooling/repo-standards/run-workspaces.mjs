#!/usr/bin/env node
/**
 * Run one npm script across every workspace that defines it, in parallel.
 *
 * `npm run <script> --workspaces` is serial: nine workspaces each pay npm's
 * start-up cost and then a whole tsc/vitest run end to end. The gates are
 * independent of each other (nothing a workspace test writes is read by
 * another), so they parallelise safely; the only shared resource is the CPU,
 * hence the job cap.
 *
 *   node tooling/repo-standards/run-workspaces.mjs <script> [--jobs N]
 *
 * Jobs default to one per core (floor of 2). Each workspace gate is a single
 * long-lived process (tsc is single-threaded; vitest sizes its own worker pool
 * from the same core count), so one lane per core is the setting that measured
 * fastest here. Override with --jobs N or WORKSPACE_JOBS=N on a small or
 * memory-tight machine.
 *
 * Output is buffered per workspace and printed when that workspace finishes,
 * so parallel runs stay readable. Exit code is non-zero if any workspace
 * failed, and every failure is reported rather than only the first.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const args = process.argv.slice(2);
const script = args[0];
if (!script || script.startsWith("-")) {
  console.error("usage: run-workspaces.mjs <script> [--jobs N]");
  process.exit(2);
}
const jobsFlag = args.indexOf("--jobs");
const jobsValue =
  jobsFlag >= 0
    ? args[jobsFlag + 1]
    : process.env.WORKSPACE_JOBS ?? Math.max(2, availableParallelism());
const jobs = Number(jobsValue);
if (!Number.isSafeInteger(jobs) || jobs < 1) {
  console.error(`--jobs/WORKSPACE_JOBS must be a positive integer (got ${String(jobsValue)})`);
  process.exit(2);
}

const root = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
/** Expand the root manifest's workspace patterns (only "dir/*" and plain paths are used here). */
const dirs = root.workspaces
  .flatMap((pattern) => {
    if (!pattern.endsWith("/*")) return [pattern];
    const parent = pattern.slice(0, -2);
    return readdirSync(join(repoRoot, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}`);
  })
  .sort();

const targets = [];
for (const dir of dirs) {
  const manifest = join(repoRoot, dir, "package.json");
  if (!existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  if (pkg.scripts?.[script]) targets.push({ dir, name: pkg.name ?? dir });
}
if (targets.length === 0) {
  console.error(`no workspace defines the ${JSON.stringify(script)} script`);
  process.exit(2);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/** Run one workspace, buffering its output so parallel logs stay readable. */
function run({ dir, name }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(npm, ["run", script], {
      cwd: join(repoRoot, dir),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => chunks.push(c));
    child.on("close", (code) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const status = code === 0 ? "ok" : `FAILED (exit ${code})`;
      process.stdout.write(
        `\n== ${name} · ${script} · ${status} · ${seconds}s\n` +
          Buffer.concat(chunks).toString("utf8"),
      );
      resolve({ name, code: code ?? 1 });
    });
  });
}

const queue = [...targets];
const results = [];
const wallStart = Date.now();
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      results.push(await run(next));
    }
  }),
);

const failed = results.filter((r) => r.code !== 0);
const wall = ((Date.now() - wallStart) / 1000).toFixed(1);
console.log(
  `\n${script}: ${results.length - failed.length}/${results.length} workspaces passed in ${wall}s (jobs=${jobs})`,
);
if (failed.length) {
  console.error(`failed: ${failed.map((r) => r.name).join(", ")}`);
  process.exit(1);
}
