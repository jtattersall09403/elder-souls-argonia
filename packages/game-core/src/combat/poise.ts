import type { ArmourDefinition } from "../equipment/armour";
import type { AttackId, WeaponClass } from "../equipment/types";

/**
 * Poise — whether a blow interrupts you.
 *
 * Dark Souls 1's model, adopted by the owner at workstream S round 4
 * (module 76 §121.3, decision 0037; mechanics research in
 * `docs/research/dark-souls-poise-mechanics.md`). One system, shared by the
 * player and every NPC:
 *
 * - Every character has a hidden pool. Each incoming hit subtracts that
 *   attack's *poise damage*, which is independent of health damage.
 * - While the pool holds, a hit interrupts nothing — hit flash and sound, no
 *   reaction animation. When it empties, the character staggers (the existing
 *   heavy reaction; no new animation) and the pool resets.
 * - The pool does not trickle back. It refills **instantly, in full**, after a
 *   quiet interval, and every hit restarts that timer.
 *
 * ## What is settled and what is a placeholder
 *
 * The *shape* is settled design. The *numbers* are explicitly provisional
 * until sandbox calibration at Phase 10c (§121.3: "poise is feel, and feel is
 * tuned with a controller in hand"). Everything tunable is a named constant or
 * a table in this file so 10c can move it without touching combat code.
 *
 * ## The seam to the stat system (Phase 10c)
 *
 * There are no character attributes yet, so `PoiseModifiers` is the contract
 * the stat system fills in rather than a place a multiplier will have to be
 * retro-fitted. §121.3's formula is
 *
 *     maxPoise = Agility/2
 *              + Σ worn pieces: lo + (hi − lo) × k(armour-class score)
 *              + effects
 *
 * and `resolveMaxPoise` is exactly that, with today's stand-ins for the two
 * terms that do not exist: a neutral Agility and a mid-band armour-class
 * score. Filling the stat system in means passing a populated
 * `PoiseModifiers`, not hunting for where a term should have gone — the same
 * seam `RangedModifiers` already provides for archery.
 */

/** Live pool for one actor. Owned by whoever owns that actor's combat state. */
export type PoiseState = {
  /** Full pool, recomputed when equipment or effects change. */
  max: number;
  /** What is left. Frozen between hits; never trickles back. */
  current: number;
  /** Seconds until the instant refill. Restarted by every hit. */
  refillIn: number;
  /** How long the quiet interval is for this actor, given what it wears. */
  refillSeconds: number;
  /**
   * False for boss-grade actors that cannot be staggered at all — DS1 flags
   * its largest bosses this way and §121.3 keeps that escape hatch.
   */
  staggerable: boolean;
};

/**
 * Provisional constants (§121.3: calibrated at 10c, not decided here).
 *
 * `baseRefillSeconds` and `refillFactorPerPiece` are DS1's own: a 5 s player
 * timer cut 10 % multiplicatively by each poise-granting armour piece, which
 * takes a fully armoured character to about 3.3 s.
 */
export const POISE_TUNING = {
  baseRefillSeconds: 5,
  refillFactorPerPiece: 0.9,
  minimumRefillSeconds: 2.5,
  /**
   * Naked poise when no Agility is known. §121.3 bases it on Agility/2, which
   * re-houses Morrowind's `Agility × 0.5` knockdown threshold; a neutral
   * Morrowind attribute is 50, so this is that formula at its neutral point
   * rather than a number picked to feel right.
   */
  neutralAgility: 50,
  /**
   * Where in each armour piece's poise band an actor sits before the armour
   * skills exist. Mid-band, so 10c moves characters both ways off today's
   * calibration instead of only upward.
   */
  neutralArmourClassScore: 0.5,
  /**
   * Poise a worn piece is worth per point of its armour rating, at the top of
   * its band. Armour rating already carries the slot's bulk and the material's
   * quality, so poise rides it rather than restating both axes.
   *
   * First calibration point, and the number most likely to move at 10c. At 1.1
   * the sandbox's *starting* steel kit came to 69 poise against a 20-point
   * sword light, so a new character shrugged off four hits in a row and combat
   * stopped answering. DS1 makes that a build you commit heavy armour to, not
   * the default; 0.55 puts starting steel at about 50 — enough that a sword
   * needs three hits, a greatsword two and a warhammer one, which is a table a
   * player can feel and read.
   */
  poisePerArmourRating: 0.55,
  /** Bottom of a piece's band as a fraction of its top. */
  bandFloorFraction: 0.6,
} as const;

/**
 * What the stat system will supply. Every field is optional *today* and none
 * of them will be optional to the compiler at 10c — that is the point of the
 * type: the call sites already pass this object through.
 */
export type PoiseModifiers = {
  /** 0-100. Base poise is `agility / 2` (§121.3). */
  agility?: number;
  /**
   * 0-1 placement inside every worn piece's band, from the wearer's skill in
   * that armour class. One value today because there is one armour class;
   * §121.3's per-class scores arrive with the class tag at 10c.
   */
  armourClassScore?: number;
  /**
   * Flat poise from enchantments, spells, potions, rings and rites — the
   * `StatEffect.poise` field of §127. Drain effects are negative.
   */
  effectBonus?: number;
  /** Multiplier on the refill interval; a "steady" effect shortens it. */
  refillScale?: number;
};

/**
 * A worn piece's poise band.
 *
 * §121.3 stores `poiseLo`/`poiseHi` per piece and lets armour skill decide
 * where in the range you sit. Nothing is authored per item: the band is
 * derived from the rating the piece already has, exactly as its rating is
 * derived from slot and material. When 10c introduces armour classes with
 * their own tiers, this is the one function that changes.
 */
export function armourPoiseBand(piece: ArmourDefinition) {
  const hi = piece.armourRating * POISE_TUNING.poisePerArmourRating;
  return { lo: hi * POISE_TUNING.bandFloorFraction, hi };
}

/** §121.3's `maxPoise` formula, with today's stand-ins for the missing terms. */
export function resolveMaxPoise(
  pieces: readonly ArmourDefinition[],
  modifiers: PoiseModifiers = {},
) {
  const agility = modifiers.agility ?? POISE_TUNING.neutralAgility;
  const score = clamp01(modifiers.armourClassScore ?? POISE_TUNING.neutralArmourClassScore);
  let total = agility / 2;
  for (const piece of pieces) {
    const band = armourPoiseBand(piece);
    total += band.lo + (band.hi - band.lo) * score;
  }
  return Math.max(0, total + (modifiers.effectBonus ?? 0));
}

/** DS1's multiplicative per-piece shortening of the refill timer. */
export function poiseRefillSeconds(pieceCount: number, modifiers: PoiseModifiers = {}) {
  const worn = POISE_TUNING.baseRefillSeconds
    * POISE_TUNING.refillFactorPerPiece ** Math.max(0, pieceCount)
    * (modifiers.refillScale ?? 1);
  return Math.max(POISE_TUNING.minimumRefillSeconds, worn);
}

export function createPoise(
  pieces: readonly ArmourDefinition[],
  modifiers: PoiseModifiers = {},
  staggerable = true,
): PoiseState {
  const max = resolveMaxPoise(pieces, modifiers);
  return {
    max,
    current: max,
    refillIn: 0,
    refillSeconds: poiseRefillSeconds(pieces.length, modifiers),
    staggerable,
  };
}

/**
 * Recompute the pool after an equipment or effect change, keeping the *deficit*
 * rather than the absolute value. Putting a helmet on mid-fight should not
 * refill the pool you have already spent, and taking one off should not leave
 * you holding more poise than you now have.
 */
export function refreshPoise(
  state: PoiseState,
  pieces: readonly ArmourDefinition[],
  modifiers: PoiseModifiers = {},
) {
  const spent = Math.max(0, state.max - state.current);
  state.max = resolveMaxPoise(pieces, modifiers);
  state.refillSeconds = poiseRefillSeconds(pieces.length, modifiers);
  state.current = Math.max(0, state.max - spent);
}

/** Back to full, immediately. Used on spawn, reset and after a stagger. */
export function resetPoise(state: PoiseState) {
  state.current = state.max;
  state.refillIn = 0;
}

/**
 * Advance the refill timer.
 *
 * Deliberately not a regen rate. DS1 freezes the pool at whatever the last hit
 * left and snaps it back to full when the timer completes, which is what makes
 * poise a *breakpoint* stat — "can I survive one more of those" — instead of a
 * second stamina bar. Returns true on the frame it refilled.
 */
export function advancePoise(state: PoiseState, delta: number) {
  if (state.refillIn <= 0) return false;
  state.refillIn -= delta;
  if (state.refillIn > 0) return false;
  state.refillIn = 0;
  state.current = state.max;
  return true;
}

export type PoiseImpact = {
  /** The blow broke through: play the stagger reaction. */
  staggered: boolean;
  /** Poise left after the hit, for HUD/telemetry. */
  remaining: number;
};

/**
 * Apply one hit's poise damage.
 *
 * Excess never carries over (DS1): a great hammer that empties a pool worth 30
 * does not also eat into the refilled one. `ignoresPoise` is the DS1 escape
 * hatch for blows that stagger regardless — a kick, or an arrow to the head.
 */
export function applyPoiseDamage(
  state: PoiseState,
  amount: number,
  { ignoresPoise = false }: { ignoresPoise?: boolean } = {},
): PoiseImpact {
  state.refillIn = state.refillSeconds;
  if (!state.staggerable) {
    state.current = Math.max(0, state.current - Math.max(0, amount));
    return { staggered: false, remaining: state.current };
  }
  if (ignoresPoise) {
    resetPoise(state);
    return { staggered: true, remaining: state.max };
  }
  state.current -= Math.max(0, amount);
  if (state.current > 0) return { staggered: false, remaining: state.current };
  resetPoise(state);
  return { staggered: true, remaining: state.max };
}

/**
 * Poise damage by weapon class, DS1's shape: a class-level base, never
 * authored per item (§121.3). The tiers are DS1's own — dagger lowest, great
 * hammer highest — mapped onto our class list, and provisional until 10c.
 */
export const WEAPON_CLASS_POISE_DAMAGE: Readonly<Record<WeaponClass, number>> = {
  dagger: 5,
  shortSword: 15,
  straightSword: 20,
  scimitar: 20,
  spear: 20,
  axe: 25,
  mace: 30,
  halberd: 35,
  greatsword: 35,
  greataxe: 45,
  warhammer: 50,
  staff: 20,
  // A bow's melee numbers exist only so a bow in hand is a describable object;
  // what a bow actually delivers is on the arrow (`ARROW_POISE_DAMAGE`).
  shortbow: 10,
  longbow: 10,
  warbow: 10,
};

/**
 * Attack-type factor on top of the class base (§121.3: light ×1.0, heavy
 * ~×1.5). Criticals are paired choreography that always breaks a defender, so
 * their factor is only a floor for anything that reads it generically.
 */
export const ATTACK_POISE_FACTOR: Readonly<Record<AttackId, number>> = {
  light1: 1,
  light2: 1,
  light3: 1.2,
  heavy: 1.5,
  heavy2: 1.5,
  riposte: 4,
  backstab: 4,
};

/** DS1's arrow value. A head hit ignores poise entirely instead of scaling. */
export const ARROW_POISE_DAMAGE = 20;

/** What one attack takes off a defender's pool. */
export function attackPoiseDamage(weaponClass: WeaponClass, attack: AttackId) {
  return WEAPON_CLASS_POISE_DAMAGE[weaponClass] * ATTACK_POISE_FACTOR[attack];
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
