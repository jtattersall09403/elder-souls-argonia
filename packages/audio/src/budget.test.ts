import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Standard 16: the shipped audio tree stays under packages/audio/budget.json (compose.mjs reads the same file). */
const files = fileURLToPath(new URL("../files/", import.meta.url));
const budget = JSON.parse(readFileSync(new URL("../budget.json", import.meta.url), "utf8"));

function bytesOf(dir: string): number {
  let sum = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    sum += e.isDirectory() ? bytesOf(p) : statSync(p).size;
  }
  return sum;
}

describe("audio download budget", () => {
  it("the shipped tree is under the fail line", () => {
    expect(budget.schemaVersion).toBe(1);
    expect(budget.warnMB).toBeLessThan(budget.failMB);
    expect(bytesOf(files)).toBeLessThanOrEqual(budget.failMB * 1_000_000);
  });

  it("the shipped tree is exactly the manifest's files at their sizes, plus the manifest", () => {
    const m = JSON.parse(readFileSync(join(files, "audio-manifest.json"), "utf8"));
    const expected = new Map<string, number>(
      Object.values(m.assets as Record<string, { file: string; bytes: number }>).map((a) => [a.file, a.bytes]),
    );
    expected.set("audio-manifest.json", statSync(join(files, "audio-manifest.json")).size);
    const shipped = new Map<string, number>();
    const walk = (dir: string, prefix: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, `${prefix}${e.name}/`);
        else shipped.set(`${prefix}${e.name}`, statSync(p).size);
      }
    };
    walk(files, "");
    expect(shipped).toEqual(expected);
  });
});
