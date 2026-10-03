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

  it("stays closed while shader builds are pending, opens at 0 once stable, and the cap still opens it", () => {
    const g = new WarmGate({ minFrames: 1, stableFrames: 5, maxFrames: 100 });
    for (let i = 0; i < 50; i++) expect(g.step(8, 3)).toBe(false); // stable work, builds still queued
    expect(g.step(8, 0)).toBe(true);
    expect(g.state.reason).toBe("stable");
    const c = new WarmGate({ minFrames: 1, stableFrames: 5, maxFrames: 20 });
    for (let i = 0; i < 19; i++) expect(c.step(8, 1)).toBe(false);
    expect(c.step(8, 1)).toBe(true);
    expect(c.state.reason).toBe("cap");
  });

  it("holds while spawn-ring pieces are pending, then needs a fresh stable run (decision 0120)", () => {
    const g = new WarmGate({ minFrames: 5, stableFrames: 5, maxFrames: 900 });
    for (let i = 0; i < 100; i++) expect(g.step(8, 0, 3)).toBe(false);   // flat work, ring still streaming
    expect(g.state.reason).toBe("ring");
    for (let i = 0; i < 4; i++) expect(g.step(8, 0, 0)).toBe(false);    // ring in: a new run of stable frames
    expect(g.step(8, 0, 0)).toBe(true);
    expect(g.state.reason).toBe("stable");
  });
});
