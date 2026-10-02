import { describe, expect, it } from "vitest";
import { samePositionKm } from "./positionKm";

describe("samePositionKm (perf10 Q2)", () => {
  it("an unchanged report keeps the stored object, a moved one does not", () => {
    expect(samePositionKm({ x: 7.1971, z: 0.584 }, 7.1971, 0.584)).toBe(true);
    expect(samePositionKm({ x: 7.1971, z: 0.584 }, 7.1972, 0.584)).toBe(false);
  });
});
