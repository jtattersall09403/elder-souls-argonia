import { describe, expect, it } from "vitest";

import { damageRangePosition, marksmanScalars, meleeScalars, SKILL_CAP, SKILL_FLOOR } from "./skillScalars";

describe("damageRangePosition", () => {
  it("runs 0.40 → 1.00 across the whole skill, not from the floor", () => {
    expect(damageRangePosition(0)).toBeCloseTo(0.4, 6);
    expect(damageRangePosition(SKILL_FLOOR)).toBeCloseTo(0.46, 6);
    expect(damageRangePosition(55)).toBeCloseTo(0.73, 6);
    expect(damageRangePosition(SKILL_CAP)).toBeCloseTo(1, 6);
  });

  it("clamps above the cap", () => {
    expect(damageRangePosition(140)).toBeCloseTo(1, 6);
  });
});

describe("marksmanScalars", () => {
  it("is neutral at the starting skill for nock and draw", () => {
    const at10 = marksmanScalars(SKILL_FLOOR);
    expect(at10.nockSpeed).toBeCloseTo(1, 6);
    expect(at10.drawSpeed).toBeCloseTo(1, 6);
    expect(at10.drawStrength).toBe(1);
  });

  it("holds the floor value below the floor (damage excepted: it runs from zero)", () => {
    const { damage: _below, ...below } = marksmanScalars(0);
    const { damage: _floor, ...atFloor } = marksmanScalars(SKILL_FLOOR);
    expect(below).toEqual(atFloor);
    expect(marksmanScalars(0).damage).toBeCloseTo(0.4, 6);
  });

  it("reaches the owner's mastery numbers", () => {
    const at100 = marksmanScalars(SKILL_CAP);
    expect(at100.nockSpeed).toBeCloseTo(1.6, 6);
    expect(at100.drawSpeed).toBeCloseTo(2, 6);
    expect(at100.sway).toBeCloseTo(0.6, 6);
    expect(at100.drawStaminaCost).toBeCloseTo(0.8, 6);
    expect(at100.damage).toBeCloseTo(1, 6);
  });

  it("is halfway at 55", () => {
    const at55 = marksmanScalars(55);
    expect(at55.nockSpeed).toBeCloseTo(1.3, 6);
    expect(at55.drawSpeed).toBeCloseTo(1.5, 6);
    expect(at55.sway).toBeCloseTo(1, 6);
    expect(at55.drawStaminaCost).toBeCloseTo(1.025, 6);
  });

  it("clamps above the cap", () => {
    expect(marksmanScalars(140)).toEqual(marksmanScalars(SKILL_CAP));
  });

  it("is monotone the right way in every field", () => {
    for (let skill = 0; skill < SKILL_CAP; skill += 5) {
      const lo = marksmanScalars(skill);
      const hi = marksmanScalars(skill + 5);
      expect(hi.nockSpeed).toBeGreaterThanOrEqual(lo.nockSpeed);
      expect(hi.drawSpeed).toBeGreaterThanOrEqual(lo.drawSpeed);
      expect(hi.damage).toBeGreaterThanOrEqual(lo.damage);
      expect(hi.sway).toBeLessThanOrEqual(lo.sway);
      expect(hi.drawStaminaCost).toBeLessThanOrEqual(lo.drawStaminaCost);
    }
  });
});

describe("meleeScalars", () => {
  it("costs more and hits softer at the floor than at mastery", () => {
    const at10 = meleeScalars(SKILL_FLOOR);
    expect(at10.damagePosition).toBeCloseTo(0.46, 6);
    expect(at10.staminaCost).toBeCloseTo(1.25, 6);
    const at100 = meleeScalars(SKILL_CAP);
    expect(at100.damagePosition).toBeCloseTo(1, 6);
    expect(at100.staminaCost).toBeCloseTo(0.8, 6);
  });

  it("holds the floor below it and clamps above the cap", () => {
    expect(meleeScalars(0).staminaCost).toBeCloseTo(1.25, 6);
    expect(meleeScalars(0).damagePosition).toBeCloseTo(0.4, 6);
    expect(meleeScalars(140)).toEqual(meleeScalars(SKILL_CAP));
  });

  it("is monotone", () => {
    for (let skill = 0; skill < SKILL_CAP; skill += 5) {
      expect(meleeScalars(skill + 5).damagePosition).toBeGreaterThanOrEqual(meleeScalars(skill).damagePosition);
      expect(meleeScalars(skill + 5).staminaCost).toBeLessThanOrEqual(meleeScalars(skill).staminaCost);
    }
  });
});
