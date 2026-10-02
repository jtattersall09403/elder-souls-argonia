import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The studio's <Physics> mount (perf10, walk 10). The driver steps and
 * interpolates the world itself, so the library must neither step on its own
 * (`paused`) nor snapshot every body before each step (`interpolate`): that
 * snapshot walks the ~1400 fixed flora bodies through two wasm getters each,
 * 7.6x the cost of the step it precedes.
 */
describe("CharacterMode <Physics> mount", () => {
  const src = readFileSync(new URL("./CharacterMode.tsx", import.meta.url), "utf8");
  const tags = src.match(/<Physics\s[^>]*>/g) ?? [];

  it("mounts exactly one Physics, paused and without library interpolation", () => {
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatch(/\bpaused\b/);
    expect(tags[0]).toMatch(/interpolate=\{false\}/);
  });
});
