import { describe, expect, it } from "vitest";
import {
  ANIMATION_PACKS,
  CORE_ANIMATION_PACK,
  MANIFEST_STATES,
  clipPack,
  resolveAnimationPacks,
} from "../anim/animationManifest";
import { ARSENAL_SHIELDS, ARSENAL_WEAPONS } from "./arsenal";
import { loadoutAnimationPacks } from "./animationPacks";
import { CROUCH_STATES } from "../locomotion/stance";
import type { AnimationState, WeaponDefinition } from "../core/types";
import type { PairedCriticalProfile, ShieldDefinition } from "./types";

/**
 * The rig ships as several GLBs and an actor loads only the ones its loadout
 * needs, so "can this actor play this clip?" stopped being automatically true.
 *
 * It fails *silently*: a mixer asked for an action it does not have leaves the
 * previous one playing, so a missing pack looks like a riposte that renders the
 * idle pose rather than like an error. That is exactly what happened when the
 * `requires` links were emitted by the pipeline but not yet present in a built
 * manifest — every one-handed critical quietly played the sword idle, and only
 * a geometry probe three layers away noticed.
 *
 * These checks make the same mistake impossible to ship: every clip a weapon or
 * shield can ask for must be in a pack that weapon's loadout actually resolves.
 */

function criticalStates(profile: PairedCriticalProfile): AnimationState[] {
  return [
    profile.attackerAction,
    profile.victimAction,
    profile.victimRecovery.action,
    profile.victimDeath.action,
    ...(profile.victimLeadIn ? [profile.victimLeadIn.action] : []),
  ];
}

/** Every semantic state holding this weapon can put on screen. */
function weaponStates(weapon: WeaponDefinition): AnimationState[] {
  const a = weapon.animations;
  return [
    a.combatIdle,
    ...(a.sprintOverride ? [a.sprintOverride] : []),
    ...(a.crouchIdle ? [a.crouchIdle] : []),
    ...Object.values(a.locomotion ?? {}),
    a.guard.enter,
    a.guard.loop,
    ...a.guard.hitVariants,
    a.parry.intro,
    a.parry.followThrough,
    ...a.lightAttacks,
    ...a.heavyAttacks,
    a.guardBreak,
    a.equip,
    a.unequip,
    ...criticalStates(a.riposte),
    ...criticalStates(a.backstab),
    ...Object.values(weapon.attacks).map((attack) => attack.animation),
    ...(a.bow
      ? [a.bow.idle, a.bow.draw, a.bow.drawn, a.bow.release, ...Object.values(a.bow.locomotion)]
      : []),
  ];
}

function shieldStates(shield: ShieldDefinition): AnimationState[] {
  const a = shield.animations;
  return [a.enter, a.loop, ...a.hitVariants, a.parry.intro, a.parry.followThrough];
}

describe("animation packs", () => {
  it("declares a pack for every clip the manifest ships", () => {
    const packed = new Set(Object.values(ANIMATION_PACKS).flatMap((pack) => pack.clips));
    expect(MANIFEST_STATES.filter((state) => !packed.has(state))).toEqual([]);
  });

  it("always resolves the core pack, and resolves it first", () => {
    expect(resolveAnimationPacks([])).toEqual([CORE_ANIMATION_PACK]);
    expect(resolveAnimationPacks(["greataxe"])[0]).toBe(CORE_ANIMATION_PACK);
  });

  it("pulls in what a pack depends on", () => {
    // A haft weapon borrows the greatsword's carriage, which in turn borrows
    // the shared criticals. Missing either is an actor that cannot play its
    // own moveset — and does so without an error.
    expect([...resolveAnimationPacks(["greataxe"])].sort())
      .toEqual(["core", "criticals", "greataxe", "greatsword"]);
    expect([...resolveAnimationPacks(["oneHanded"])].sort())
      .toEqual(["core", "criticals", "oneHanded"]);
  });

  it("gives every weapon in the arsenal a loadout that can play its whole moveset", () => {
    for (const weapon of Object.values(ARSENAL_WEAPONS)) {
      const loaded = new Set(loadoutAnimationPacks({ mainHand: weapon, offHand: null })
        .flatMap((pack) => ANIMATION_PACKS[pack]?.clips ?? []));
      const missing = [...new Set(weaponStates(weapon))].filter((state) => !loaded.has(state));
      expect(missing, `${weapon.id} cannot play`).toEqual([]);
    }
  });

  it("gives every shield a loadout that can play its block", () => {
    const weapon = Object.values(ARSENAL_WEAPONS)
      .find((candidate) => !candidate.stats.occupiesOffHand)!;
    for (const shield of Object.values(ARSENAL_SHIELDS)) {
      const loaded = new Set(loadoutAnimationPacks({ mainHand: weapon, offHand: shield })
        .flatMap((pack) => ANIMATION_PACKS[pack]?.clips ?? []));
      const missing = shieldStates(shield).filter((state) => !loaded.has(state));
      expect(missing, `${shield.id} cannot play`).toEqual([]);
    }
  });

  it("keeps crouch in the core pack, so any actor can sneak", () => {
    // Crouching is not a weapon skill. The one exception is the drawn-blade
    // hold, which belongs with the blade.
    for (const state of CROUCH_STATES) {
      const expected = state === "SWORD_CROUCH_IDLE" ? "oneHanded" : CORE_ANIMATION_PACK;
      expect(clipPack(state), state).toBe(expected);
    }
  });
});
