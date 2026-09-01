import { describe, expect, it } from "vitest";
import { BLOCK_HIT_STOP, BLOCK_RECOIL_DURATION, BLOCK_RECOIL_SPEED, blockRecoilVelocity, forwardFromYaw, guardCovers, resolveGuardImpact } from "./blockReaction";
import { SHIELD_STABILITY_BAND, WEAPON_STABILITY_BAND } from "../equipment/guard";
import { STRAIGHT_SWORD } from "../equipment/arsenal";

const WEAPON_GUARD = { stability: 0.55, absorption: { physical: 0.72 } };

describe("blocked-attack recoil", () => {
  it("moves the attacker away from the defender while preserving vertical speed", () => {
    const velocity = blockRecoilVelocity({ x: 2, z: 1 }, { x: 1, z: 1 }, -0.7);
    expect(velocity).toEqual({ x: BLOCK_RECOIL_SPEED, y: -0.7, z: 0 });
  });

  it("normalizes diagonal separation and has a stable coincident fallback", () => {
    const diagonal = blockRecoilVelocity({ x: 2, z: 2 }, { x: 0, z: 0 }, 0);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(BLOCK_RECOIL_SPEED, 8);
    expect(blockRecoilVelocity({ x: 0, z: 0 }, { x: 0, z: 0 }, 1)).toEqual({ x: 0, y: 1, z: BLOCK_RECOIL_SPEED });
  });

  it("uses a short readable recovery and contact stop", () => {
    expect(BLOCK_RECOIL_DURATION).toBeGreaterThan(0.3);
    expect(BLOCK_RECOIL_DURATION).toBeLessThan(0.5);
    expect(BLOCK_HIT_STOP).toBeGreaterThan(0);
    expect(BLOCK_HIT_STOP).toBeLessThan(BLOCK_RECOIL_DURATION);
  });

  it("marks a successful block for recoil without a wound vignette", () => {
    const impact = resolveGuardImpact({
      health: 100,
      stamina: 100,
      incomingDamage: 24,
      guard: WEAPON_GUARD,
    });
    expect(impact.blocked).toBe(true);
    expect(impact.recoilAttacker).toBe(true);
    expect(impact.triggerDamageVignette).toBe(false);
    expect(impact.health).toBe(93);
  });

  it("preserves lethal chip damage and distinguishes guard break feedback", () => {
    const lethalChip = resolveGuardImpact({
      health: 4,
      stamina: 100,
      incomingDamage: 24,
      guard: WEAPON_GUARD,
    });
    expect(lethalChip.blocked).toBe(true);
    expect(lethalChip.health).toBe(0);

    const guardBreak = resolveGuardImpact({
      health: 100,
      stamina: 0,
      incomingDamage: 24,
      guard: WEAPON_GUARD,
      guardBreakDamage: 18,
    });
    expect(guardBreak.blocked).toBe(false);
    expect(guardBreak.recoilAttacker).toBe(false);
    expect(guardBreak.triggerDamageVignette).toBe(true);
    expect(guardBreak.health).toBe(82);
  });

  it("charges less stamina to a steadier guard", () => {
    const impact = (stability: number) => resolveGuardImpact({
      health: 100,
      stamina: 100,
      incomingDamage: 24,
      guard: { stability, absorption: { physical: 0.72 } },
    });
    const weapon = impact(WEAPON_STABILITY_BAND.max);
    const shield = impact(SHIELD_STABILITY_BAND.min);
    expect(shield.staminaDamage).toBeLessThan(weapon.staminaDamage);
    expect(shield.stamina).toBeGreaterThan(weapon.stamina);
  });

  it("keeps the reference weapon inside the weapon stability band", () => {
    const { stability } = STRAIGHT_SWORD.stats.guard;
    expect(stability).toBeGreaterThanOrEqual(WEAPON_STABILITY_BAND.min);
    expect(stability).toBeLessThanOrEqual(WEAPON_STABILITY_BAND.max);
    // The whole point of the stat: a shield must be steadier than any weapon.
    expect(stability).toBeLessThan(SHIELD_STABILITY_BAND.min);
  });
});

describe("a guard only covers what the defender is facing", () => {
  // The reported defect: a shield stopped a sword swung into its owner's back.
  // The facing test existed but was only ever applied to arrows.
  const defender = { x: 0, z: 0 };
  const facingNorth = forwardFromYaw(0);

  it("covers a blow from ahead", () => {
    expect(guardCovers(facingNorth, defender, { x: 0, z: 3 })).toBe(true);
  });

  it("does not cover a blow from behind", () => {
    expect(guardCovers(facingNorth, defender, { x: 0, z: -3 })).toBe(false);
  });

  it("does not cover a blow from directly beside", () => {
    expect(guardCovers(facingNorth, defender, { x: 3, z: 0 })).toBe(false);
    expect(guardCovers(facingNorth, defender, { x: -3, z: 0 })).toBe(false);
  });

  it("covers the whole arc a raised guard physically spans", () => {
    // About 70 degrees either side, symmetrically.
    for (const sign of [1, -1]) {
      expect(guardCovers(facingNorth, defender, { x: sign * Math.sin(1.1), z: Math.cos(1.1) })).toBe(true);
      expect(guardCovers(facingNorth, defender, { x: sign * Math.sin(1.35), z: Math.cos(1.35) })).toBe(false);
    }
  });

  it("reads any facing convention the same way", () => {
    // An enemy carries a yaw and the player carries a body axis; both have to
    // get the same answer for the same geometry.
    const yaw = 2.1;
    expect(guardCovers(forwardFromYaw(yaw), defender, { x: Math.sin(yaw) * 2, z: Math.cos(yaw) * 2 })).toBe(true);
    expect(guardCovers(forwardFromYaw(yaw), defender, { x: -Math.sin(yaw) * 2, z: -Math.cos(yaw) * 2 })).toBe(false);
  });

  it("counts a threat standing on top of the defender as covered", () => {
    // No direction to test; failing open would make point-blank clashes
    // randomly unblockable.
    expect(guardCovers(facingNorth, defender, { x: 0, z: 0 })).toBe(true);
  });
});
