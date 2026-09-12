#!/usr/bin/env node
/**
 * Preflight: every gate the deploy runs, all at once, every failure listed.
 *
 *   npm run preflight
 *
 * The deploy workflow runs five independent gates (npm test, typecheck, the
 * placement suite, the water suite, the raster manifest check). Run one at a
 * time, each failure costs a full wait-fix-wait cycle; run here in parallel
 * the wall time is the slowest gate (~2 min) and the report shows everything
 * that would have failed on CI, in one go. Nothing here changes what a gate
 * asserts; it only runs them together and reads out the failures.
 *
 * Exit code is non-zero if any gate failed. Each gate's full log is kept at
 * /tmp/preflight/<gate>.log; the summary prints the lines that matter.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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

function run(name, cmd) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(cmd, { cwd: repoRoot, shell: true, env: { ...process.env, FORCE_COLOR: "0" } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      writeFileSync(join(outDir, `${name}.log`), out);
      resolve({ name, code, seconds: Math.round((Date.now() - t0) / 1000), out });
    });
  });
}

const results = await Promise.all(Object.entries(GATES).map(([name, [cmd]]) => run(name, cmd)));
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
