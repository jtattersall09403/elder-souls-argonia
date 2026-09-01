import { WEAPON_CLASSES } from "../equipment/weaponClasses";
import { isBowClass, type Loadout, type WeaponDefinition } from "../equipment/types";
import { SHIELD_STABILITY_BAND, WEAPON_STABILITY_BAND } from "../equipment/guard";

/**
 * How a weapon wants to be fought with.
 *
 * The enemy AI used to score its intents against hard-coded distances — 3.1 m
 * to want to swing, 2.2 m to want to close, 1.35 m to back off. Those are a
 * *sword's* numbers, and they were written when a sword was the only thing
 * anybody held. Hand them to a spearman and he walks inside his own point;
 * hand them to an archer and he charges.
 *
 * ## The model, and where it comes from
 *
 * Skyrim splits this in two, and the split is worth keeping. A **Combat Style**
 * (`CSTY`) carries the fighter's disposition — offensive against defensive,
 * how much they circle, how far they fall back, how long they stalk — and is
 * assigned per actor, not per weapon. The weapon then supplies the *geometry*:
 * the engine reads reach and speed off the equipped item and decides when a
 * swing can land. (CreationKit wiki, "Combat Style".)
 *
 * So: `EnemyCombatStyle` is disposition and lives on the archetype;
 * `WeaponTactics` is geometry and cadence and is derived here from the weapon
 * itself. Nothing is authored per weapon — a new one gets sensible behaviour
 * from its class profile the moment it exists, which is the same rule the
 * arsenal already follows for damage and reach.
 */

export type WeaponTactics = {
  /**
   * Where this weapon wants to stand to strike, metres between actor centres.
   * A little inside its own reach, so an ordinary approach ends in range
   * rather than a hair outside it.
   */
  engageRange: number;
  /** Below this it is too close to use properly and wants to back off. */
  crowdedRange: number;
  /** Above this, closing beats everything else. */
  disengageRange: number;
  /**
   * A ranged weapon's preferred distance. Null for melee. An archer holds this
   * and retreats when it is broken, rather than closing to swing.
   */
  standoffRange: number | null;
  /**
   * How readily it commits to an attack, 0-1. A dagger throws out attacks it
   * can recover from; a warhammer has to mean it.
   */
  aggression: number;
  /**
   * How much it circles rather than closing head-on, 0-1. Short weapons have
   * to work for their angle; long ones hold the line.
   */
  circling: number;
  /** True for bows: the whole intent set changes shape. */
  ranged: boolean;
  /**
   * How good this loadout is at simply *taking* a blow, 0-1.
   *
   * The one number on here that is not a property of the main hand, because
   * blocking is the one thing the off hand does. It was missing entirely, and
   * the consequence was reported straight back from playtesting: the shield
   * warden "tries to parry a lot but always gets it wrong and never seems to
   * try to block". It had no idea it was carrying a shield — `loadoutTactics`
   * read the sword and threw the off hand away — so it scored guarding exactly
   * as a two-handed fighter would, which is to say below parrying and dodging.
   *
   * Derived from the stability of whatever is actually between it and the
   * blow, normalised across the weapon and shield bands so that "a good shield"
   * reads near 1 and "a dagger" near 0.
   */
  guarding: number;
};

/**
 * How much of its own reach a fighter wants to be inside when it swings.
 *
 * Not 1.0: an attack begun at maximum reach lands at maximum reach only if
 * nothing moves, and something always moves.
 */
const ENGAGE_SHARE = 0.82;
/** Inside this share of reach, a weapon is fouled and wants room. */
const CROWDED_SHARE = 0.42;
/** Beyond this multiple of engage range, close instead of manoeuvring. */
const DISENGAGE_MULTIPLE = 1.7;

/**
 * A bow's preferred distance, metres.
 *
 * Far enough that a charging player takes a second or two to arrive — which is
 * the archer's whole contribution to a fight — and close enough that a shot is
 * a threat rather than a formality. Held rather than maximised: an archer who
 * retreats forever is not a fight, it is an errand.
 */
const BOW_STANDOFF_RANGE = 9;
/** Inside this, an archer stops shooting and gives ground. */
const BOW_CROWDED_RANGE = 4.5;

export function weaponTactics(weapon: WeaponDefinition): WeaponTactics {
  const profile = WEAPON_CLASSES[weapon.stats.class];
  if (isBowClass(weapon.stats.class)) {
    return {
      engageRange: BOW_STANDOFF_RANGE,
      crowdedRange: BOW_CROWDED_RANGE,
      disengageRange: BOW_STANDOFF_RANGE * 1.8,
      standoffRange: BOW_STANDOFF_RANGE,
      aggression: 0.5,
      circling: 0.55,
      ranged: true,
      // A bow blocks nothing. The ranged intent set has no guard branch at all,
      // so this is documentation rather than arithmetic.
      guarding: 0,
    };
  }
  // Reach comes from the moveset the weapon actually swings, which already has
  // the class's reach bonus folded into it.
  const reach = weapon.attacks.light1.range;
  const engageRange = reach * ENGAGE_SHARE;
  return {
    engageRange,
    crowdedRange: reach * CROWDED_SHARE,
    disengageRange: engageRange * DISENGAGE_MULTIPLE,
    standoffRange: null,
    // A quick weapon can afford to throw attacks out; a slow one is committing
    // most of a second every time. `speedScale` is the class's own multiplier
    // on how long its swings take, so a low one is a fast weapon.
    aggression: clamp01(1.05 - profile.speedScale * 0.45),
    // Short weapons have to earn an angle; a halberd holds the line it is on.
    circling: clamp01(0.85 - reach * 0.28),
    ranged: false,
    guarding: guardingFromStability(profile.stability),
  };
}

/**
 * Stability as a 0-1 "how much do I want to just block this".
 *
 * Normalised *within* each band rather than across both, because the two bands
 * are a deliberate step and not a continuum: everything you can block with is
 * either an edge or a braced face, and the whole reason `SHIELD_STABILITY_BAND`
 * sits clear above `WEAPON_STABILITY_BAND` is that the difference is a kind
 * rather than a degree. Interpolating straight across the gap loses that step
 * and leaves a good sword rating almost as blockable as a shield.
 *
 * So a weapon spans the bottom 45% of the scale and a shield the top 45%, each
 * ranked within its own kind. A new class needs no new number.
 */
function guardingFromStability(stability: number) {
  if (stability <= WEAPON_STABILITY_BAND.max) {
    return clamp01((stability - WEAPON_STABILITY_BAND.min)
      / (WEAPON_STABILITY_BAND.max - WEAPON_STABILITY_BAND.min)) * 0.45;
  }
  return 0.55 + clamp01((stability - SHIELD_STABILITY_BAND.min)
    / (SHIELD_STABILITY_BAND.max - SHIELD_STABILITY_BAND.min)) * 0.45;
}

/**
 * The tactics for what an actor is actually holding — **both hands**.
 *
 * Everything except `guarding` is the main hand's, because reach, cadence and
 * standoff are properties of the thing you swing. `guarding` is the off hand's
 * when there is something in it, because that is the thing you block with.
 */
export function loadoutTactics(loadout: Loadout): WeaponTactics {
  const tactics = weaponTactics(loadout.mainHand);
  if (!loadout.offHand || tactics.ranged) return tactics;
  return { ...tactics, guarding: guardingFromStability(loadout.offHand.stats.guard.stability) };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
