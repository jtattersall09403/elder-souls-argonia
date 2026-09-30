import { describe, expect, it } from "vitest";
import { decideRecovery, isGpuOriginError, MAX_RECOVERIES, WINDOW_MS } from "./gpuRecovery";

describe("decideRecovery", () => {
  it("ignores a loss our own dispose caused", () => {
    expect(decideRecovery({ disposedByUs: true, recent: [], now: 0 })).toBe("ignore");
  });
  it("recovers a first unexpected loss", () => {
    expect(decideRecovery({ disposedByUs: false, recent: [], now: 1000 })).toBe("recover");
  });
  it("gives up after MAX_RECOVERIES inside the window", () => {
    const recent = Array.from({ length: MAX_RECOVERIES }, (_, i) => 1000 + i);
    expect(decideRecovery({ disposedByUs: false, recent, now: 2000 })).toBe("give-up");
  });
  it("forgets recoveries older than the window", () => {
    const recent = Array.from({ length: MAX_RECOVERIES }, () => 0);
    expect(decideRecovery({ disposedByUs: false, recent, now: WINDOW_MS + 1 })).toBe("recover");
  });
});

describe("isGpuOriginError", () => {
  it("tells GPU errors from scene errors", () => {
    expect(isGpuOriginError("WebGPU Device Lost")).toBe(true);
    expect(isGpuOriginError("Cannot read properties of undefined")).toBe(false);
  });
});
