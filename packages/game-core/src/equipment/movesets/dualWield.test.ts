import { describe, expect, it } from "vitest";
import { clipConfig } from "../../anim/animationManifest";
import { attackClipTiming, clipSecondsAt } from "../../anim/clipTiming";
import { attackDuration } from "../../combat/weapon";
import { ARSENAL_SHIELDS, weaponById } from "../arsenal";
import { loadoutAnimationPacks } from "../animationPacks";
import { activeGuardProfile } from "../guard";
import type { AttackSpec } from "../types";
import { WEAPON_CLASSES } from "../weaponClasses";
import { DUAL_WIELD_ATTACKS, loadoutCombatIdle, offHandWeapon, resolveDualWield } from "./dualWield";
import { REFERENCE_MOVESET } from "./oneHanded";

/** Where in the clip an attack's hitbox opens and closes, as a fraction (as attackTiming.test.ts). */
function clipFractions(spec: AttackSpec) {
  const timing = attackClipTiming(spec);
  const total = clipSecondsAt(attackDuration(spec as never), timing);
  return {
    open: clipSecondsAt(spec.windup, timing) / total,
    close: clipSecondsAt(spec.windup + spec.active, timing) / total,
  };
}

const sword = weaponById("steel-sword");
const dagger = weaponById("iron-dagger");
const dualWield = { mainHand: sword, offHand: offHandWeapon(dagger) };

describe("the dual-wield moveset (decision 0091)", () => {
  it("costs and hits as the one-handed light and heavy", () => {
    expect(DUAL_WIELD_ATTACKS.offLight).toMatchObject({
      motionValue: REFERENCE_MOVESET.light1.motionValue, stamina: REFERENCE_MOVESET.light1.stamina, hand: "off",
    });
    for (const id of ["offPower", "dualPower"] as const) {
      expect(DUAL_WIELD_ATTACKS[id], id).toMatchObject({
        motionValue: REFERENCE_MOVESET.heavy.motionValue, stamina: REFERENCE_MOVESET.heavy.stamina,
      });
    }
    expect(DUAL_WIELD_ATTACKS.dualPower.hand).toBe("both");
  });

  it("plays each attack on its own clip, whole, with the contact inside it", () => {
    const clips = { offLight: "DW_ATTACK_LEFT", offPower: "DW_POWER_LEFT", dualPower: "DW_POWER_DUAL" } as const;
    for (const [id, clip] of Object.entries(clips) as [keyof typeof clips, string][]) {
      const spec = DUAL_WIELD_ATTACKS[id];
      const length = clipConfig(clip as never).sourceDuration ?? 0;
      expect(spec.animation, id).toBe(clip);
      expect(spec.windup + spec.active + spec.recovery, id).toBeCloseTo(length, 6);
      expect(spec.windup + spec.active, id).toBeLessThanOrEqual(length + 1e-6);
    }
  });

  it("scales the off hand's attacks by the off weapon's class and the dual power by the main hand's", () => {
    const attacks = resolveDualWield(dualWield);
    expect(attacks).not.toBeNull();
    if (!attacks) return;
    const daggerSpeed = WEAPON_CLASSES.dagger.speedScale / WEAPON_CLASSES.straightSword.speedScale;
    expect(attacks.offLight.timeScale?.windup).toBeCloseTo(daggerSpeed, 6);
    expect(attacks.offPower.timeScale?.windup).toBeCloseTo(daggerSpeed, 6);
    expect(attacks.dualPower.timeScale?.windup).toBeCloseTo(1, 6);
    // The same part of the clip cuts at every weapon speed.
    for (const id of ["offLight", "offPower", "dualPower"] as const) {
      const authored = clipFractions(DUAL_WIELD_ATTACKS[id]);
      const scaled = clipFractions(attacks[id]);
      expect(scaled.open, id).toBeCloseTo(authored.open, 6);
      expect(scaled.close, id).toBeCloseTo(authored.close, 6);
    }
    // Damage from the hand that swings: the dagger's light is weaker than the sword's.
    expect(attacks.offLight.damage).toBeLessThan(sword.attacks.light1.damage);
    expect(attacks.dualPower.damage).toBe(sword.attacks.heavy.damage);
    expect(attacks.dualPowerOffHandDamage).toBe(attacks.offPower.damage);
  });

  it("is only dual wield with a weapon in the off hand", () => {
    const shield = Object.values(ARSENAL_SHIELDS)[0];
    expect(resolveDualWield({ mainHand: sword, offHand: shield })).toBeNull();
    expect(resolveDualWield({ mainHand: sword, offHand: null })).toBeNull();
    expect(loadoutCombatIdle(dualWield)).toBe("DW_IDLE");
    expect(loadoutCombatIdle({ mainHand: sword, offHand: shield })).toBe(sword.animations.combatIdle);
    // Two blades do not guard with the off hand, and load the dual-wield clips.
    expect(activeGuardProfile(dualWield)).toBe(sword.stats.guard);
    expect(loadoutAnimationPacks(dualWield)).toContain("dualWield");
  });

  it("holds the off-hand weapon on the left hand's node", () => {
    expect(dualWield.offHand.visual.held.socket).toBe("Shield");
    expect(dualWield.offHand.visual.sheathed.socket).toBe("Shield");
    expect(dualWield.offHand.visual.asset).toBe(dagger.visual.asset);
  });
});
