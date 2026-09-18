import { describe, expect, it } from "vitest";
import { bleedFromLandedDamage, effectiveArmourRating } from "./classEffects";
import { WEAPON_CLASSES } from "../equipment/weaponClasses";

describe("weapon class effects", () => {
  it("leaves the rating alone when there are no effects", () => {
    expect(effectiveArmourRating(150, [])).toBe(150);
  });

  it("takes each pierce share off the rating and sums them", () => {
    expect(effectiveArmourRating(150, [{ kind: "armourPierce", share: 0.25 }])).toBeCloseTo(112.5, 9);
    expect(
      effectiveArmourRating(150, [
        { kind: "armourPierce", share: 0.25 },
        { kind: "armourPierce", share: 0.35 },
      ]),
    ).toBeCloseTo(60, 9);
  });

  it("clamps at zero rather than going negative", () => {
    expect(effectiveArmourRating(150, [{ kind: "armourPierce", share: 1.4 }])).toBe(0);
    expect(effectiveArmourRating(-20, [])).toBe(0);
  });

  it("scales a bleed by what landed, and applies none for nothing landed", () => {
    expect(bleedFromLandedDamage(40, [{ kind: "bleed", fraction: 0.25, seconds: 4 }])).toEqual([
      { kind: "bleed", totalDamage: 10, seconds: 4 },
    ]);
    expect(bleedFromLandedDamage(0, [{ kind: "bleed", fraction: 0.25, seconds: 4 }])).toEqual([]);
    expect(bleedFromLandedDamage(40, [])).toEqual([]);
  });

  it("ignores kinds the helper is not about", () => {
    expect(bleedFromLandedDamage(40, [{ kind: "armourPierce", share: 0.25 }])).toEqual([]);
    expect(effectiveArmourRating(150, [{ kind: "bleed", fraction: 0.25, seconds: 4 }])).toBe(150);
  });

  it("every class carries an effects list", () => {
    for (const profile of Object.values(WEAPON_CLASSES)) {
      expect(Array.isArray(profile.effects)).toBe(true);
    }
    expect(WEAPON_CLASSES.warhammer.effects).toEqual([{ kind: "armourPierce", share: 0.35 }]);
    expect(WEAPON_CLASSES.axe.effects).toEqual([{ kind: "bleed", fraction: 0.25, seconds: 4 }]);
    expect(WEAPON_CLASSES.straightSword.effects).toEqual([]);
  });
});
