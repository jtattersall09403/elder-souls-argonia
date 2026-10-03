import { describe, expect, it, vi } from "vitest";
import { drawMinimapOverlay, MINIMAP_HEADING_STEP_DEG, minimapView, type ViewPoint } from "./minimapOverlay";

describe("minimap redraw key (perf10 diag10 C3b)", () => {
  it("sub-pixel moves and sub-bucket turns keep the same view", () => {
    const a = minimapView(1000.2, 2000.1, 10.4, 8);
    expect(minimapView(1000.9, 2000.6, 9.8, 8)).toEqual(a);
    expect(minimapView(1009, 2000.1, 10.4, 8).cx).not.toBe(a.cx);
    expect(minimapView(1000.2, 2000.1, 10.4 + MINIMAP_HEADING_STEP_DEG, 8).heading).not.toBe(a.heading);
    expect(minimapView(0, 0, -1, 8).heading).toBe(minimapView(0, 0, 359, 8).heading);
  });
  it("draws through one reused point (no object per vertex)", () => {
    const ctx = new Proxy({}, { get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : () => undefined), set: (t, k, v) => { t[k as string] = v; return true; } }) as unknown as CanvasRenderingContext2D;
    const outs = new Set<ViewPoint>();
    const toView = vi.fn((px: number, py: number, out: ViewPoint) => { outs.add(out); out.x = px; out.y = py; });
    drawMinimapOverlay(ctx, {
      dots: [{ id: "a", name: "A", u: 0.1, v: 0.1, tier: 1, colour: "#fff", dead: true }],
      lines: [{ mode: "road", px: [[1, 1], [2, 2], [3, 3]] }],
    }, { imageWidth: 100, imageHeight: 100, metresPerPixel: 1 }, toView, 180, 10);
    expect(toView).toHaveBeenCalledTimes(4);
    expect(outs.size).toBe(1);
  });
});
