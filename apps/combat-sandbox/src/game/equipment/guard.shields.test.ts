import { describe, expect, it } from "vitest";

import { ARSENAL_SHIELDS, ARSENAL_WEAPONS, weaponById } from "./arsenal";
import { SHIELD_STABILITY_BAND, WEAPON_STABILITY_BAND, activeGuardProfile } from "./guard";
import { resolveGuardImpact } from "../combat/blockReaction";

/**
 * What carrying a shield is actually worth.
 *
 * The stability bands are a contract rather than a hope — material scaling can
 * push a heavy weapon's guard upward, and if it ever reached shield territory
 * there would be no reason to carry one.
 */

const SWORD = weaponById("steel-sword");
const SHIELD = ARSENAL_SHIELDS["steel-shield"];

describe("a shield in the off hand", () => {
  it("is what the actor guards with, not the weapon", () => {
    expect(activeGuardProfile({ mainHand: SWORD, offHand: SHIELD })).toBe(SHIELD.stats.guard);
    expect(activeGuardProfile({ mainHand: SWORD, offHand: null })).toBe(SWORD.stats.guard);
  });

  it("costs less stamina to block with than the weapon does", () => {
    const withShield = resolveGuardImpact({
      health: 100, stamina: 100, incomingDamage: 30, guard: SHIELD.stats.guard,
    });
    const withSword = resolveGuardImpact({
      health: 100, stamina: 100, incomingDamage: 30, guard: SWORD.stats.guard,
    });
    expect(withShield.staminaDamage).toBeLessThan(withSword.staminaDamage);
  });

  it("lets less through when it does block", () => {
    const withShield = resolveGuardImpact({
      health: 100, stamina: 100, incomingDamage: 30, guard: SHIELD.stats.guard,
    });
    const withSword = resolveGuardImpact({
      health: 100, stamina: 100, incomingDamage: 30, guard: SWORD.stats.guard,
    });
    expect(withShield.damage).toBeLessThanOrEqual(withSword.damage);
    expect(withShield.blocked).toBe(true);
  });

  it("holds every shield above every weapon, whatever the material", () => {
    const bestWeapon = Math.max(
      ...Object.values(ARSENAL_WEAPONS).map((weapon) => weapon.stats.guard.stability),
    );
    const worstShield = Math.min(
      ...Object.values(ARSENAL_SHIELDS).map((shield) => shield.stats.guard.stability),
    );
    expect(bestWeapon).toBeLessThanOrEqual(WEAPON_STABILITY_BAND.max);
    expect(worstShield).toBeGreaterThanOrEqual(SHIELD_STABILITY_BAND.min);
    expect(worstShield).toBeGreaterThan(bestWeapon);
  });

  it("breaks when the guard cannot pay for the blow", () => {
    const broken = resolveGuardImpact({
      health: 100, stamina: 1, incomingDamage: 60, guard: SHIELD.stats.guard, guardBreakDamage: 18,
    });
    expect(broken.blocked).toBe(false);
    expect(broken.stamina).toBe(0);
    expect(broken.health).toBe(82);
  });

  it("is given up by a two-handed weapon", () => {
    expect(weaponById("steel-greatsword").stats.occupiesOffHand).toBe(true);
    expect(SWORD.stats.occupiesOffHand).toBe(false);
  });
});
