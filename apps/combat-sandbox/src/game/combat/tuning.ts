import type { CombatAction } from "../core/types";
import { clipConfig, clipPlaybackDuration } from "../anim/animationManifest";
import { DEFAULT_ENEMY_ARCHETYPE } from "../actors/enemyArchetypes";
import { STRAIGHT_SWORD } from "../equipment/arsenal";
import { BLOCK_RECOIL_DURATION } from "./blockReaction";
import { COMBAT_TUNING } from "./weapon";

export const PLAYER_MAX_HEALTH = COMBAT_TUNING.maxHealth;
export const PLAYER_ESTUS = 3;

/**
 * How long a broken guard leaves an actor open.
 *
 * This is the authored stagger, played at its native speed rather than
 * compressed into a shorter window, so the opening reads as a real Souls-style
 * punish. Both actors and the riposte window derive from it, so retiming the
 * clip retimes the whole interaction.
 */
export const GUARD_BREAK_STUN_DURATION = clipPlaybackDuration(
  STRAIGHT_SWORD.animations.guardBreak,
) ?? 2.4667;

/**
 * How late into that stagger a riposte may still be started. Ending slightly
 * before the stagger does keeps the execution from beginning on a victim who
 * is already standing back up.
 */
export const RIPOSTE_WINDOW = GUARD_BREAK_STUN_DURATION * 0.9;

// Fixed durations for the actions whose length is not encoded in a weapon
// definition. Attack lengths come from the weapon moveset instead. EQUIP and
// UNEQUIP must match their clip's actual source duration (playback rate 1) —
// a shorter fixed value here cuts the draw/sheathe animation off partway
// through.
export const ACTION_DURATIONS: Partial<Record<CombatAction, number>> = {
  roll: COMBAT_TUNING.rollDuration,
  backstep: 0.52,
  parry: COMBAT_TUNING.parryDuration,
  heal: COMBAT_TUNING.healDuration,
  equip: clipConfig("EQUIP").sourceDuration ?? 0.62,
  unequip: clipConfig("UNEQUIP").sourceDuration ?? 0.62,
  hit: 0.62,
  hitHeavy: 0.62,
  recoil: BLOCK_RECOIL_DURATION,
  guardBreak: GUARD_BREAK_STUN_DURATION,
};

/**
 * Backstep travel, and the dash that a follow-up attack covers.
 *
 * The dash deliberately falls short of the retreat so the exchange still gives
 * up ground overall — it is a re-engage, not a free reset.
 */
export const BACKSTEP_DISTANCE_MULTIPLIER = 2;
export const BACKSTEP_ATTACK_DASH_FRACTION = 0.9;

// Initial dodge/backstep launch speeds. The controllers decay these over the
// action's duration.
export const PLAYER_DODGE_SPEED = {
  roll: 10.0,
  backstep: 7.0 * BACKSTEP_DISTANCE_MULTIPLIER,
} as const;

export const DEFAULT_ENEMY_COUNT = 1;
export const MAX_ENEMIES = 3;

/** Convenience for the sandbox's single enemy type; scenes read archetypes. */
export const ENEMY_MAX_HEALTH = DEFAULT_ENEMY_ARCHETYPE.maxHealth;
export const ENEMY_ESTUS = DEFAULT_ENEMY_ARCHETYPE.estus;

/**
 * Enemy state timeouts that are not archetype-specific because they are owned
 * by an authored clip or a shared combat rule rather than by the creature.
 */
export const ENEMY_SHARED_DURATIONS = {
  parry: COMBAT_TUNING.parryDuration,
  recoil: BLOCK_RECOIL_DURATION,
  parried: GUARD_BREAK_STUN_DURATION,
} as const;
