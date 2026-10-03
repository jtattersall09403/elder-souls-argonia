import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { staticHandler } from "./webgpu-static.mjs";

function serve(url) {
  const base = mkdtempSync(join(tmpdir(), "webgpu-static-"));
  const root = join(base, "root");
  mkdirSync(root);
  writeFileSync(join(root, "index.html"), "ok");
  writeFileSync(join(base, "secret.txt"), "secret");
  const res = { status: 0, writeHead(s) { this.status = s; }, end() {}, on() { return this; }, once() { return this; }, emit() {}, write() { return true; } };
  staticHandler([["/site/", root]])({ url }, res);
  return res.status;
}

describe("webgpu static handler", () => {
  it("refuses a decoded `..` that leaves its root", () => {
    expect(serve("/site/%2e%2e/secret.txt")).toBe(403);
    expect(serve("/site/%2e%2e%2f%2e%2e/etc/passwd")).toBe(403);
  });
  it("answers a malformed escape with 400, never a throw", () => {
    expect(serve("/site/%E0%A4%A")).toBe(400);
  });
  it("still serves a file inside its root", () => {
    expect(serve("/site/index.html")).toBe(200);
  });
});
