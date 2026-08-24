import { describe, expect, it } from "vitest";

import { ARMOUR_HALF_MITIGATION_RATING, armourMitigation, damageAfterArmour } from "./armourMitigation";

describe("armour mitigation", () => {
  it("does nothing when nothing is worn", () => {
    expect(damageAfterArmour(40, 0)).toBe(40);
    expect(armourMitigation(0)).toBe(0);
  });

  it("stops exactly half at its stated half point", () => {
    expect(armourMitigation(ARMOUR_HALF_MITIGATION_RATING)).toBeCloseTo(0.5, 9);
  });

  it("never reaches immunity, however much is worn", () => {
    expect(armourMitigation(100_000)).toBeLessThan(1);
    expect(damageAfterArmour(40, 100_000)).toBeGreaterThan(0);
  });

  it("gives every extra point less than the last", () => {
    const first = armourMitigation(20) - armourMitigation(0);
    const later = armourMitigation(120) - armourMitigation(100);
    expect(later).toBeLessThan(first);
  });

  it("turns roughly a quarter of a blow in a full steel set", () => {
    // Steel cuirass 30, gauntlets 10, boots 10 = 50.
    expect(armourMitigation(50)).toBeGreaterThan(0.2);
    expect(armourMitigation(50)).toBeLessThan(0.3);
  });

  it("treats a negative rating as none, rather than healing the target", () => {
    expect(damageAfterArmour(40, -50)).toBe(40);
  });
});
