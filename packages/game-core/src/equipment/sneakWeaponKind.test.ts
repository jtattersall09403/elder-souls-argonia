import { describe, expect, it } from "vitest";
import { sneakWeaponKindFor } from "./sneakWeaponKind";
import { sneakMultiplier } from "../stats/derived";
import type { WeaponClass } from "./types";

/**
 * Expected answers, written before the code (combat-sandbox lane round 4):
 * which of Skyrim's sneak-attack weapon kinds each class falls under
 * (module 76 §121.5), and the multiplier that gives at Sneak 50.
 */
const EXPECTED: Record<WeaponClass, string> = {
  dagger: "dagger",
  shortSword: "shortBlade",
  claw: "shortBlade",
  straightSword: "oneHanded",
  scimitar: "oneHanded",
  rapier: "oneHanded",
  katana: "oneHanded",
  axe: "oneHanded",
  mace: "oneHanded",
  greatsword: "twoHanded",
  greataxe: "twoHanded",
  warhammer: "twoHanded",
  staff: "twoHanded",
  spear: "twoHanded",
  pike: "twoHanded",
  halberd: "twoHanded",
  shortbow: "bow",
  longbow: "bow",
  warbow: "bow",
};

describe("sneakWeaponKindFor", () => {
  it("maps every class to its sneak kind", () => {
    for (const [classId, kind] of Object.entries(EXPECTED)) {
      expect(sneakWeaponKindFor(classId as WeaponClass), classId).toBe(kind);
    }
  });
  it("feeds the stats model's table: a dagger at Sneak 50 is ×7", () => {
    expect(sneakMultiplier(sneakWeaponKindFor("dagger"), 50)).toBe(7);
    expect(sneakMultiplier(sneakWeaponKindFor("greatsword"), 50)).toBe(3);
    expect(sneakMultiplier(sneakWeaponKindFor("longbow"), 50)).toBe(4);
  });
});
