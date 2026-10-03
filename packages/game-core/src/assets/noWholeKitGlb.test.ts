import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Decision 0120: every kit ships only as parts, so no runtime source names a
 * whole kit GLB (`kits/<id>.glb`, literal or templated). Runtime sources are
 * game-core and the studio, tests excluded. The interior test checks the
 * same on what one cell actually fetches; this covers every other reader.
 */
const ROOT = resolve(import.meta.dirname, "../../../..");
const ROOTS = ["packages/game-core/src", "apps/world-studio/src"];
export const WHOLE_KIT_GLB = /kits\/(?:[\w.-]+|\$\{[^}]+\})\.glb\b/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("no whole kit GLB is read at runtime", () => {
  it("the pattern catches the forms the whole-kit readers used", () => {
    expect(WHOLE_KIT_GLB.test("`${baseUrl}kits/flora-province-v1.glb`")).toBe(true);
    expect(WHOLE_KIT_GLB.test("`${baseUrl}kits/${id}.glb`")).toBe(true);
    expect(WHOLE_KIT_GLB.test("kits/flora-province-v1/parts/abc.glb")).toBe(false);
  });

  it("no game-core or studio source names one", () => {
    const hits = ROOTS.flatMap((root) => sources(resolve(ROOT, root)))
      .flatMap((path) => readFileSync(path, "utf8").split("\n")
        .map((line, i) => (WHOLE_KIT_GLB.test(line) ? `${path.slice(ROOT.length + 1)}:${i + 1}` : null))
        .filter((hit): hit is string => hit !== null));
    expect(hits).toEqual([]);
  });
});
