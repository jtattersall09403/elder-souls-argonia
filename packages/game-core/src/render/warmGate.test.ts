import { describe, expect, it } from "vitest";
import { WarmGate } from "./warmGate";

describe("WarmGate", () => {
  it("stays closed through a tier-up burst and opens after a stable run", () => {
    const g = new WarmGate({ minFrames: 10, stableFrames: 20, maxFrames: 500 });
    for (let i = 0; i < 100; i++) expect(g.step(i % 3 === 0 ? 16 : 9)).toBe(false);
    let opened = -1;
    for (let i = 0; i < 100 && opened < 0; i++) if (g.step(9 + (i % 2) * 0.5)) opened = i;
    expect(opened).toBe(19);
    expect(g.state).toMatchObject({ open: true, reason: "stable", frames: 120 });
  });

  it("never opens before minFrames even when work is flat", () => {
    const g = new WarmGate({ minFrames: 50, stableFrames: 5 });
    for (let i = 0; i < 49; i++) expect(g.step(8)).toBe(false);
    expect(g.step(8)).toBe(true);
  });

  it("opens at the cap when work never settles", () => {
    const g = new WarmGate({ minFrames: 1, stableFrames: 10, maxFrames: 30 });
    for (let i = 0; i < 29; i++) expect(g.step(i % 2 ? 30 : 5)).toBe(false);
    expect(g.step(5)).toBe(true);
    expect(g.state.reason).toBe("cap");
  });
});
