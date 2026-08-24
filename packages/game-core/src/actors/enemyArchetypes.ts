import type { AnimationState } from "../core/types";
import type { Loadout } from "../equipment/types";
import { DEFAULT_RACE, type RaceId } from "./races";
import { STRAIGHT_SWORD } from "../equipment/arsenal";

/**
 * Enemy archetypes.
 *
 * Every number an enemy needs to move, decide and react lives on its
 * archetype, so a second enemy type is a data entry rather than an edit to the
 * combat scene. Nothing here is read by name from gameplay code: the scene
 * reads `runtime.archetype.<field>` and the AI reads the profile it is handed.
 */

export type EnemyLocomotionProfile = {
  /** Controller top speeds, metres/second. */
  walkSpeed: number;
  runSpeed: number;
  /**
   * Hysteresis band for breaking into a run. Separating the two edges stops an
   * enemy that hovers on one threshold from restarting its gait every frame.
   */
  runAboveDistance: number;
  walkBelowDistance: number;
  /** Radians/second the body may turn toward its target, per tactical state. */
  turnRate: {
    approach: number;
    strafe: number;
    watching: number;
    recover: number;
  };
  /** Ecctrl ramp times; larger values feel heavier. */
  accelerationSeconds: number;
  decelerationSeconds: number;
  /** Clip used below/at/above the run threshold. */
  walkAnimation: AnimationState;
  runAnimation: AnimationState;
  strafeAnimations: { left: AnimationState; right: AnimationState };
};

export type EnemyDecisionProfile = {
  /** Seconds between tactical re-decisions, plus a per-enemy spread. */
  intervalSeconds: number;
  intervalJitterSeconds: number;
  /**
   * Score bonus the currently running intent keeps while it stays viable.
   * Without it, three near-tied options swap every interval and the enemy
   * visibly stutters between approaching, strafing and swinging.
   */
  commitmentBonus: number;
  /** Beyond this range, keep closing instead of re-deciding at all. */
  closeWithoutRedecidingBeyond: number;
  /** Light attacks chained after the opener. */
  comboLength: number;
  /** Odds a backstep is a feint that chains into the dash-in attack, 0-1. */
  backstepAttackChance: number;
};

export type EnemyStateDurations = {
  strafe: number;
  guard: number;
  recover: number;
  staggerLight: number;
  staggerDefault: number;
};

export type EnemyArchetype = {
  id: string;
  label: string;
  maxHealth: number;
  maxStamina: number;
  estus: number;
  /** Which body this creature wears on the shared rig. */
  race: RaceId;
  loadout: Loadout;
  /** Worn armour, by item id. Resolved at spawn so archetypes stay pure data. */
  armour: readonly string[];
  locomotion: EnemyLocomotionProfile;
  decision: EnemyDecisionProfile;
  stateDurations: EnemyStateDurations;
  /** Initial dodge/backstep launch speeds; controllers decay these. */
  dodgeSpeed: { roll: number; backstep: number };
  /** Distance inside which a chained light attack still makes sense. */
  comboFollowUpRange: number;
  /** Range beyond which an attack windup slides the body toward its target. */
  lungeBeyondDistance: number;
};

export const HOLLOW_WARDEN: EnemyArchetype = {
  id: "hollow-warden",
  label: "The Hollow Warden",
  maxHealth: 150,
  maxStamina: 100,
  estus: 1,
  race: DEFAULT_RACE,
  loadout: { mainHand: STRAIGHT_SWORD, offHand: null },
  armour: ["iron-cuirass", "iron-gauntlets", "iron-boots"],
  locomotion: {
    walkSpeed: 1.75,
    runSpeed: 4.5,
    runAboveDistance: 6,
    walkBelowDistance: 4.5,
    turnRate: { approach: 2.15, strafe: 2.15, watching: 1.35, recover: 0.3 },
    accelerationSeconds: 0.2,
    decelerationSeconds: 0.13,
    walkAnimation: "WALK",
    runAnimation: "RUN",
    strafeAnimations: { left: "STRAFE_LEFT", right: "STRAFE_RIGHT" },
  },
  decision: {
    intervalSeconds: 0.3,
    intervalJitterSeconds: 0.2,
    commitmentBonus: 0.22,
    closeWithoutRedecidingBeyond: 5,
    comboLength: 2,
    backstepAttackChance: 0.45,
  },
  stateDurations: {
    strafe: 0.62,
    guard: 0.82,
    recover: 0.72,
    staggerLight: 0.62,
    staggerDefault: 0.58,
  },
  dodgeSpeed: { roll: 10, backstep: 7 },
  comboFollowUpRange: 2.75,
  lungeBeyondDistance: 1.05,
};

export const ENEMY_ARCHETYPES: Readonly<Record<string, EnemyArchetype>> = {
  [HOLLOW_WARDEN.id]: HOLLOW_WARDEN,
};

export const DEFAULT_ENEMY_ARCHETYPE = HOLLOW_WARDEN;

export function enemyArchetypeById(id: string): EnemyArchetype {
  const archetype = ENEMY_ARCHETYPES[id];
  if (!archetype) throw new RangeError(`unknown enemy archetype: ${id}`);
  return archetype;
}
