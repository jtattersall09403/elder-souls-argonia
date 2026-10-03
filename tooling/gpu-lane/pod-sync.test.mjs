// node --test tooling/gpu-lane/pod-sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("./pod-sync.sh", import.meta.url).pathname;

// diag22 C1: --data refuses (before any ssh) while the build tree has uncommitted kit data, naming the paths
test("pod-sync --data refuses a dirty kits/ and lists the path", () => {
  const d = mkdtempSync(join(tmpdir(), "podsync-"));
  const git = (...a) => execFileSync("git", ["-C", d, ...a], { encoding: "utf8" });
  git("init", "-q");
  mkdirSync(join(d, "apps/world-studio/public/kits/mud/parts"), { recursive: true });
  mkdirSync(join(d, "tooling/gpu-lane"), { recursive: true });
  copyFileSync(script, join(d, "tooling/gpu-lane/pod-sync.sh"));
  const idx = join(d, "apps/world-studio/public/kits/mud/parts/index.json");
  writeFileSync(idx, '{"schemaVersion":3}');
  git("add", "."); git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x");
  writeFileSync(idx, '{"schemaVersion":2}');
  const r = spawnSync("bash", ["tooling/gpu-lane/pod-sync.sh", "--data", "podsync-test"], { cwd: d, encoding: "utf8", env: { ...process.env, POD_SSH: "ssh -p 1 root@0.0.0.0" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refusing --data/);
  assert.match(r.stderr, /kits\/mud\/parts\/index\.json/);
});
