import { describe, expect, it } from "vitest";
import { createSparkles, sparklePixelSize, sparkleStrength } from "./sparkles";

describe("sparkles (drei Sparkles twin)", () => {
  it("keeps drei's fragment falloff and point size", () => {
    expect(sparkleStrength(0.5, 0)).toBeCloseTo(0);
    expect(sparkleStrength(0.5, 0.25)).toBeCloseTo(0.1);
    expect(sparklePixelSize(0.9, 1.5, -10)).toBeCloseTo(3.375);
  });

  it("builds one instanced sprite with the node slots filled", () => {
    let seed = 0;
    const s = createSparkles({ count: 28, scale: [25, 5, 25], size: 0.9, opacity: 0.16, random: () => (seed = (seed + 0.37) % 1) });
    expect(s.object.count).toBe(28);
    expect(s.object.frustumCulled).toBe(false);
    const m = s.object.material as unknown as { positionNode: unknown; sizeNode: unknown; colorNode: unknown; transparent: boolean; depthWrite: boolean };
    expect(m.positionNode).toBeTruthy();
    expect(m.sizeNode).toBeTruthy();
    expect(m.colorNode).toBeTruthy();
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    s.time.value = 3;
    s.dispose();
  });
});
