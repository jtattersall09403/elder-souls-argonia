import { describe, expect, it } from "vitest";
import {
  ENEMY_GUARD_ENTER_DURATION,
  ENEMY_GUARD_TACTICAL_DURATION,
  resolveEnemyGuardVisualStep,
} from "./enemyGuard";

describe("enemy guard presentation", () => {
  it("finishes the complete guard entry before switching to the held loop", () => {
    expect(resolveEnemyGuardVisualStep({
      actionTime: ENEMY_GUARD_ENTER_DURATION - 0.001,
      currentAnimation: "GUARD_ENTER",
      guardHitUntil: 0,
      holdInitialState: false,
    })).toEqual({ nextAnimation: null, shouldExit: false });

    expect(resolveEnemyGuardVisualStep({
      actionTime: ENEMY_GUARD_ENTER_DURATION,
      currentAnimation: "GUARD_ENTER",
      guardHitUntil: 0,
      holdInitialState: false,
    })).toEqual({ nextAnimation: "GUARD", shouldExit: false });
    expect(ENEMY_GUARD_TACTICAL_DURATION).toBeGreaterThan(ENEMY_GUARD_ENTER_DURATION);
  });

  it("does not let the tactical timeout cut off a late guard-hit reaction", () => {
    const guardHitUntil = ENEMY_GUARD_TACTICAL_DURATION + 0.7;
    expect(resolveEnemyGuardVisualStep({
      actionTime: ENEMY_GUARD_TACTICAL_DURATION + 0.2,
      currentAnimation: "GUARD_HIT_A",
      guardHitUntil,
      holdInitialState: false,
    })).toEqual({ nextAnimation: null, shouldExit: false });

    expect(resolveEnemyGuardVisualStep({
      actionTime: guardHitUntil,
      currentAnimation: "GUARD_HIT_A",
      guardHitUntil,
      holdInitialState: false,
    })).toEqual({ nextAnimation: null, shouldExit: true });
  });

  it("returns to the guard loop after an early completed hit", () => {
    expect(resolveEnemyGuardVisualStep({
      actionTime: ENEMY_GUARD_ENTER_DURATION + 0.35,
      currentAnimation: "GUARD_HIT_B",
      guardHitUntil: ENEMY_GUARD_ENTER_DURATION + 0.3,
      holdInitialState: false,
    })).toEqual({ nextAnimation: "GUARD", shouldExit: false });
  });

  it("keeps a seeded validation prerequisite held without skipping reactions", () => {
    expect(resolveEnemyGuardVisualStep({
      actionTime: 30,
      currentAnimation: "GUARD",
      guardHitUntil: 0,
      holdInitialState: true,
    })).toEqual({ nextAnimation: null, shouldExit: false });
  });
});
