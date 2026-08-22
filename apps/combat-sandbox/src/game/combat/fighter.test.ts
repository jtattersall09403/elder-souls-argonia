import { describe, expect, it } from "vitest";
import { createFighter, regenStamina, resetFighter, spendStamina } from "./fighter";
import { ENEMY_MAX_HEALTH, PLAYER_MAX_HEALTH } from "./tuning";
import { COMBAT_TUNING } from "./weapon";

describe("fighter", () => {
  it("creates player and enemy with the right pools", () => {
    const player = createFighter("player", "player");
    const enemy = createFighter("enemy-1", "enemy");
    expect(player.health).toBe(PLAYER_MAX_HEALTH);
    expect(player.state).toBe("idle");
    expect(enemy.health).toBe(ENEMY_MAX_HEALTH);
    expect(enemy.state).toBe("watching");
  });

  it("spends stamina only when affordable and arms the regen delay", () => {
    const fighter = createFighter("player", "player");
    fighter.stamina = 20;
    expect(spendStamina(fighter, 30)).toBe(false);
    expect(fighter.stamina).toBe(20);
    expect(spendStamina(fighter, 15)).toBe(true);
    expect(fighter.stamina).toBe(5);
    expect(fighter.staminaCooldown).toBe(COMBAT_TUNING.staminaRegenDelay);
  });

  it("holds regen until the cooldown elapses", () => {
    const fighter = createFighter("player", "player");
    fighter.stamina = 10;
    fighter.staminaCooldown = 1;
    regenStamina(fighter, 0.5);
    expect(fighter.stamina).toBe(10);
    fighter.staminaCooldown = 0;
    regenStamina(fighter, 1);
    expect(fighter.stamina).toBeCloseTo(10 + COMBAT_TUNING.staminaRegenPerSecond);
  });

  it("resets mutated state back to fresh", () => {
    const fighter = createFighter("enemy-1", "enemy");
    fighter.health = 1;
    fighter.state = "dead";
    fighter.stamina = 0;
    resetFighter(fighter);
    expect(fighter.health).toBe(ENEMY_MAX_HEALTH);
    expect(fighter.state).toBe("watching");
    expect(fighter.stamina).toBe(COMBAT_TUNING.maxStamina);
  });
});
