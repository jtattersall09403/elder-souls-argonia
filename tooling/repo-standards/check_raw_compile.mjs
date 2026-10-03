#!/usr/bin/env node
/**
 * Tripwire `raw-compile`: a bare `renderer.compileAsync(` / `gl.compileAsync(` skips runFirstUse
 * (seen three times in perf10). Only drawTargetLinker.ts and RippleSim.ts may call it; every other
 * call goes through the linker. Scans tracked packages/ and apps/ .ts/.tsx, tests excluded; <1 s.
 *   node tooling/repo-standards/check_raw_compile.mjs [--root <dir>]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const t0 = performance.now();
const a = process.argv.slice(2);
const root = a[0] === "--root" ? resolve(a[1]) : resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const RAW = /\b(renderer|gl)\.compileAsync\(/;
const ALLOWED = [/^packages\/game-core\/src\/.*drawTargetLinker\.ts$/, /^packages\/game-core\/src\/water\/render\/RippleSim\.ts$/];
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "--", "packages", "apps"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\n").filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !/(^|\/)(node_modules|__tests__)\//.test(f));
const bad = [];
for (const f of files) {
  if (ALLOWED.some((r) => r.test(f))) continue;
  readFileSync(join(root, f), "utf8").split("\n").forEach((l, i) => { if (RAW.test(l)) bad.push(`${f}:${i + 1}: ${l.trim()}`); });
}
if (bad.length) { console.error(`raw-compile: raw compileAsync skips runFirstUse; use the drawTargetLinker:\n${bad.join("\n")}`); process.exit(1); }
console.log(`raw-compile: ${files.length} files clean (${Math.round(performance.now() - t0)} ms)`);
