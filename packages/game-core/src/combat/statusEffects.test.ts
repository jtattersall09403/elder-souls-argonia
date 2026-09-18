import { describe, expect, it } from "vitest";
import { applyStatusEffects, tickStatusEffects, type ActiveStatusEffect } from "./statusEffects";

const bleed = (totalDamage: number, seconds: number): ActiveStatusEffect =>
  ({ kind: "bleed", totalDamage, seconds, remainingSeconds: seconds });

describe("status effects tick their own clocks", () => {
  it("pays out exactly the total over the full duration", () => {
    let active = [bleed(12, 4)];
    let total = 0;
    for (let i = 0; i < 400; i += 1) {
      const step = tickStatusEffects(active, 0.01);
      active = step.active;
      total += step.damage;
    }
    expect(total).toBeCloseTo(12, 6);
    expect(active).toHaveLength(0);
  });

  it("pays a partial tick in proportion to the time consumed", () => {
    const step = tickStatusEffects([bleed(12, 4)], 1);
    expect(step.damage).toBeCloseTo(3, 9);
    expect(step.active[0]?.remainingSeconds).toBeCloseTo(3, 9);
  });

  it("never pays past the end of an effect on an overlong frame", () => {
    const step = tickStatusEffects([bleed(12, 4)], 10);
    expect(step.damage).toBeCloseTo(12, 9);
    expect(step.active).toHaveLength(0);
  });

  it("stacks two applications, each on its own clock", () => {
    const active = applyStatusEffects([], [
      { kind: "bleed", totalDamage: 12, seconds: 4 },
      { kind: "bleed", totalDamage: 6, seconds: 2 },
    ]);
    expect(active).toHaveLength(2);
    const step = tickStatusEffects(active, 1);
    // 12/4 + 6/2
    expect(step.damage).toBeCloseTo(6, 9);
    const second = tickStatusEffects(step.active, 1);
    expect(second.damage).toBeCloseTo(6, 9);
    expect(second.active).toHaveLength(1);
  });

  it("appends without mutating the array it was given", () => {
    const existing: ActiveStatusEffect[] = [bleed(4, 2)];
    const next = applyStatusEffects(existing, [{ kind: "bleed", totalDamage: 3, seconds: 1 }]);
    expect(existing).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});
