// node --test tooling/gpu-lane/tunnels.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeTunnels, isOurSsh, tunnelArgs } from "./tunnels.mjs";

test("tunnelArgs: forward local to the pod's port, host last", () => {
  const a = tunnelArgs("ssh -i /tmp/k -p 2222 root@1.2.3.4", 9300, 9222);
  assert.deepEqual(a.slice(0, 4), ["-i", "/tmp/k", "-p", "2222"]);
  assert.equal(a.at(-1), "root@1.2.3.4"); assert.ok(a.includes("9300:127.0.0.1:9222")); assert.ok(a.includes("-N"));
  assert.throws(() => tunnelArgs("scp x", 1, 2));
});
test("closeTunnels kills only matching recorded live PIDs and prunes dead entries", () => {
  const reg = join(mkdtempSync(join(tmpdir(), "tun-")), "t.json");
  writeFileSync(reg, JSON.stringify([{ pid: 11, purpose: "cdp" }, { pid: 12, purpose: "site" }, { pid: 13, purpose: "cdp" }]));
  const killed = [];
  const closed = closeTunnels({ purpose: "cdp", reg, kill: (p) => killed.push(p), alive: (p) => p !== 13 });
  assert.deepEqual(killed, [11]); assert.deepEqual(closed.map((t) => t.pid), [11]);
  assert.deepEqual(JSON.parse(readFileSync(reg, "utf8")).map((t) => t.pid), [12]);
});
test("closeTunnels --local closes only the tunnel on that local port", () => {
  const reg = join(mkdtempSync(join(tmpdir(), "tun-")), "t.json");
  writeFileSync(reg, JSON.stringify([{ pid: 21, purpose: "cdp", localPort: 9242 }, { pid: 22, purpose: "cdp", localPort: 9243 }, { pid: 23, purpose: "cdp", localPort: 9244 }]));
  const killed = [];
  closeTunnels({ localPort: 9243, reg, kill: (p) => killed.push(p), alive: () => true });
  assert.deepEqual(killed, [22]);
  assert.deepEqual(JSON.parse(readFileSync(reg, "utf8")).map((t) => t.pid), [21, 23]);
});
test("isOurSsh: this node process is not ssh", () => assert.equal(isOurSsh(process.pid), false));
