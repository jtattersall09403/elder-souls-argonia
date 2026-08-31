import type {
  Absorption,
  DamageType,
  GuardAnimationProfile,
  GuardProfile,
  Loadout,
} from "./types";

/**
 * Stability bands, documented so a new item is statted against a scale rather
 * than against whichever item happened to be implemented first.
 *
 * Stability is the fraction of an incoming hit's stamina load a guard soaks.
 * A weapon guards with its edge and a braced forearm; a shield guards with a
 * face designed for it, so shields sit strictly above the weapon band. Nothing
 * reaches 1: a perfect guard would make blocking free.
 */
export const WEAPON_STABILITY_BAND = { min: 0.3, max: 0.62 } as const;
export const SHIELD_STABILITY_BAND = { min: 0.64, max: 0.9 } as const;

/** Multiplier from an attack's damage to the stamina it loads onto a guard. */
export const GUARD_STAMINA_LOAD = 1.25;

/**
 * Hold a stability value inside its band.
 *
 * The bands are the design contract, not a description of whatever the numbers
 * happened to produce: material scaling can otherwise push a heavy weapon past
 * the top of the weapon band and into shield territory, which quietly removes
 * the reason to carry a shield at all.
 */
export function clampToBand(
  stability: number,
  band: { readonly min: number; readonly max: number },
) {
  return Number(Math.min(band.max, Math.max(band.min, stability)).toFixed(4));
}

/** Fraction of `type` damage this guard absorbs. Unlisted types absorb none. */
export function absorbedFraction(absorption: Absorption, type: DamageType) {
  return absorption[type] ?? 0;
}

/**
 * The guard an actor is actually holding. A shield in the off hand always
 * wins: it is the thing physically between the actor and the blow.
 */
export function activeGuardProfile(loadout: Loadout): GuardProfile {
  return loadout.offHand?.stats.guard ?? loadout.mainHand.stats.guard;
}

/**
 * The block/parry *motion* for whatever is actually being guarded with.
 *
 * The same rule as `activeGuardProfile`, and deliberately its neighbour: if the
 * shield decides the numbers it has to decide the animation too, or the actor
 * angles a sword edge it is not using while a shield hangs unused on its arm.
 * Every guard read in combat goes through here rather than through
 * `weapon.animations.guard`, so a future off-hand item — a torch, a second
 * blade, a spell — brings its own block by supplying this profile and nothing
 * in the combat FSM changes.
 */
export function activeGuardAnimations(loadout: Loadout): GuardAnimationProfile {
  const shield = loadout.offHand;
  if (shield) return shield.animations;
  const weapon = loadout.mainHand.animations;
  return {
    enter: weapon.guard.enter,
    loop: weapon.guard.loop,
    hitVariants: weapon.guard.hitVariants,
    parry: weapon.parry,
  };
}

/** Stamina an incoming hit costs the defender, given the guard's stability. */
export function guardStaminaCost(incomingDamage: number, guard: GuardProfile) {
  return incomingDamage * GUARD_STAMINA_LOAD * (1 - guard.stability);
}
