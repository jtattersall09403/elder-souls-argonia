import { describe, expect, it } from "vitest";
import { assertVisualRunId, visualRunDirectory } from "./visual-run-directory.mjs";

describe("visual run directory", () => {
  it("keeps the two stable gate aliases at the visual-validation root", () => {
    expect(visualRunDirectory("/repo", "latest"))
      .toBe("/repo/artifacts/visual-validation/latest");
    expect(visualRunDirectory("/repo", "smoke-latest"))
      .toBe("/repo/artifacts/visual-validation/smoke-latest");
  });

  it("nests named diagnostic runs under runs", () => {
    expect(visualRunDirectory("/repo", "roll-before-20260821"))
      .toBe("/repo/artifacts/visual-validation/runs/roll-before-20260821");
  });

  it("rejects path-like or invalid run ids", () => {
    for (const runId of [".", "..", "nested/run", "", "has space", null]) {
      expect(() => assertVisualRunId(runId)).toThrow(/Run ID/);
    }
  });
});
