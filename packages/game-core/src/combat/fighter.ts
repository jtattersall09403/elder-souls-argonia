import type { CombatAction } from "../core/types";
import type { AttackDefinition } from "../equipment/types";
import type { EnemyArchetype } from "../actors/enemyArchetypes";
import { DEFAULT_ENEMY_ARCHETYPE } from "../actors/enemyArchetypes";
import { COMBAT_TUNING } from "./weapon";
import { createPoise, resetPoise, type PoiseState } from "./poise";
import { wornArmourFor } from "../inventory/store";
import { PLAYER_ESTUS, PLAYER_MAX_HEALTH } from "./tuning";

// The enemy state machine owns a few locomotion/decision states the player
// never enters. Both actors otherwise share the CombatAction vocabulary.
export type EnemyMode =
  | "watching"
  | "approach"
  | "strafe"
  | "attack"
  | "recover"
  | "guard"
  | "parry"
  | "dodge"
  | "backstep"
  | "heal"
  | "stagger"
  | "recoil"
  /** Drawing and loosing a bow. Ranged loadouts only. */
  | "shoot"
  /** Giving ground to re-open the distance a bow needs to work. */
  | "withdraw"
  | "parried"
  | "critical"
  | "criticalRecovery"
  | "dead";

export type FighterState = CombatAction | EnemyMode;

export type Team = "player" | "enemy";

/** All mutable combat state for one actor. Replaces the scattered per-actor refs. */
export type Fighter = {
  id: string;
  team: Team;
  /** Stat/behaviour source. Players ignore it; enemies take every pool from it. */
  archetype: EnemyArchetype;
  maxHealth: number;
  health: number;
  maxStamina: number;
  stamina: number;
  staminaCooldown: number;
  estus: number;
  equipped: boolean;
  /**
   * Poise pool (module 76 §121.3). Whether a blow interrupts this actor is
   * decided here rather than by a damage threshold: while the pool holds, a hit
   * costs health and plays no reaction. Enemies derive theirs from the same
   * formula the player does — worn armour and (at 10c) Agility.
   */
  poise: PoiseState;

  state: FighterState;
  actionTime: number;
  attack: AttackDefinition | null;
  attackHit: boolean;
  healed: boolean;

  comboQueued: "light" | "heavy" | null;
  comboRemaining: number;

  yaw: number;
  attackDirection: { x: number; y: number; z: number };
  dodgeDirection: { x: number; y: number; z: number };

  decisionTimer: number;
  strafeSide: number;
  staggerDuration: number;

  criticalType: "riposte" | "backstab" | null;
  criticalVictimYaw: number;

  /** Intent currently being carried out, so the AI can commit to it. */
  lastIntent: string | null;

  // Stable per-instance bias so identically-positioned enemies (e.g. the two
  // mirrored side spawns) don't score every intent identically and act like
  // clones. Persists across resetFighter; only real per-encounter randomness
  // (decisionTimer spread below) resets.
  personality: number;
};

/**
 * Build a fighter. An enemy takes every pool from its archetype, so a new
 * creature type is a data entry rather than another branch here.
 */
export function createFighter(
  id: string,
  team: Team,
  archetype: EnemyArchetype = DEFAULT_ENEMY_ARCHETYPE,
): Fighter {
  const player = team === "player";
  const maxHealth = player ? PLAYER_MAX_HEALTH : archetype.maxHealth;
  return {
    id,
    team,
    archetype,
    maxHealth,
    health: maxHealth,
    maxStamina: player ? COMBAT_TUNING.maxStamina : archetype.maxStamina,
    stamina: player ? COMBAT_TUNING.maxStamina : archetype.maxStamina,
    staminaCooldown: 0,
    estus: player ? PLAYER_ESTUS : archetype.estus,
    equipped: true,
    poise: createPoise(wornArmourFor(archetype.armour)),
    state: player ? "idle" : "watching",
    actionTime: 0,
    attack: null,
    attackHit: false,
    healed: false,
    comboQueued: null,
    comboRemaining: 0,
    yaw: 0,
    attackDirection: { x: 0, y: 0, z: 1 },
    dodgeDirection: { x: 0, y: 0, z: -1 },
    decisionTimer: 0.4 + Math.random() * 0.6,
    strafeSide: 1,
    staggerDuration: archetype.stateDurations.staggerDefault,
    criticalType: null,
    criticalVictimYaw: 0,
    lastIntent: null,
    personality: Math.random(),
  };
}

/** Restores a fighter to full readiness without reallocating the object. */
export function resetFighter(fighter: Fighter) {
  fighter.health = fighter.maxHealth;
  fighter.stamina = fighter.maxStamina;
  fighter.staminaCooldown = 0;
  fighter.estus = fighter.team === "player" ? PLAYER_ESTUS : fighter.archetype.estus;
  fighter.equipped = true;
  resetPoise(fighter.poise);
  fighter.state = fighter.team === "player" ? "idle" : "watching";
  fighter.actionTime = 0;
  fighter.attack = null;
  fighter.attackHit = false;
  fighter.healed = false;
  fighter.comboQueued = null;
  fighter.comboRemaining = 0;
  fighter.yaw = 0;
  fighter.attackDirection = { x: 0, y: 0, z: 1 };
  fighter.dodgeDirection = { x: 0, y: 0, z: -1 };
  fighter.decisionTimer = 0.4 + Math.random() * 0.6;
  fighter.strafeSide = 1;
  fighter.staggerDuration = 0.58;
  fighter.criticalType = null;
  fighter.criticalVictimYaw = 0;
}

export function isAlive(fighter: Fighter) {
  return fighter.health > 0;
}

/** Spends stamina and arms the regen delay. Returns false when insufficient. */
export function spendStamina(fighter: Fighter, amount: number): boolean {
  if (fighter.stamina < amount) return false;
  fighter.stamina -= amount;
  fighter.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
  return true;
}

export function regenStamina(fighter: Fighter, delta: number) {
  if (fighter.staminaCooldown > 0) return;
  fighter.stamina = Math.min(
    fighter.maxStamina,
    fighter.stamina + COMBAT_TUNING.staminaRegenPerSecond * delta,
  );
}
