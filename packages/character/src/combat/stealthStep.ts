import * as THREE from "three";
import {
  perceive,
  stepAwareness,
  initialAwareness,
  type Awareness,
  type DetectionTarget,
  type Observer,
} from "@elder-souls/game-core/perception/detection";
import { NOISE_LOUDNESS, noiseHeard, type NoiseEvent } from "@elder-souls/game-core/perception/noise";
import { CHARACTER_CHEST_ABOVE_BODY_CENTRE } from "@elder-souls/game-core/physics/characterPhysics";
import { sneakMultiplier } from "@elder-souls/game-core/stats/derived";
import { sneakWeaponKindFor } from "@elder-souls/game-core/equipment/sneakWeaponKind";
import type { WeaponClass } from "@elder-souls/game-core/equipment/types";
import { engagedAwareness, type EnemyRuntime } from "./enemyRuntime";
import { PLAYER_EYE_OFFSET_Y } from "./aimRig";
import { STRIDE_RUN_ABOVE_MAGNITUDE, STRIDE_WALK_ABOVE_MAGNITUDE } from "./locomotionHelpers";

/**
 * Stealth's frame (decision 0092): each enemy looks at and listens for the
 * player through the pure detection rule (`game-core/perception`), before its
 * own step. The runtime supplies what only the world knows (a line-of-sight
 * ray, the light on the player, the loudest thing the player did); nothing
 * here decides what an aware enemy does, which stays `enemyStep`'s.
 */

/** The player as detection sees them this frame. */
export type StealthPlayer = {
  /** Body centre, world. */
  position: THREE.Vector3;
  sneakSkill: number;
  agility: number;
  bootWeightKg: number;
  sneaking: boolean;
  lightLevel: number;
  /** Loudest thing the player did since the last stealth step, 0-1 at source. */
  loudness: number;
};

export type StealthStepContext = {
  delta: number;
  player: StealthPlayer;
  /** The caller's raycast: true when nothing but actors lies between the two points. */
  lineOfSight: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  /** Scratch vectors owned by the runtime. */
  scratch: { eye: THREE.Vector3; chest: THREE.Vector3 };
};

/** Every enemy's awareness at the start of an encounter. */
export function resetAwareness(e: EnemyRuntime, stealthStart: boolean) {
  e.awareness = stealthStart ? initialAwareness() : engagedAwareness();
  e.lastKnownPlayer = null;
}

/**
 * Engage an enemy the player's blow has just landed on (`struck: true`), and
 * say whether it had not been engaged a moment before: the sneak-attack test.
 */
export function strikeAwareness(e: EnemyRuntime, playerPosition: THREE.Vector3): boolean {
  const wasUnengaged = e.awareness.awareness !== "engaged";
  e.awareness = stepAwareness(e.awareness, { seen: false, noise: 0, struck: true }, 0);
  (e.lastKnownPlayer ??= new THREE.Vector3()).copy(playerPosition);
  if (wasUnengaged) e.fighter.decisionTimer = 0;
  return wasUnengaged;
}

/** The sneak-attack table's multiplier for a weapon class at a Sneak skill (§121.5). */
export function sneakAttackMultiplier(classId: WeaponClass, sneakSkill: number): number {
  return sneakMultiplier(sneakWeaponKindFor(classId), sneakSkill);
}

/** Which footstep the player's movement makes, from the same thresholds as the stride clip. */
export function locomotionNoise(input: {
  moveMagnitude: number;
  grounded: boolean;
  sprinting: boolean;
  crouching: boolean;
}): NoiseEvent | null {
  if (!input.grounded || input.moveMagnitude <= STRIDE_WALK_ABOVE_MAGNITUDE) return null;
  if (input.crouching) return "walkSneaking";
  if (input.sprinting) return "sprint";
  return input.moveMagnitude > STRIDE_RUN_ABOVE_MAGNITUDE ? "run" : "walk";
}

/** The louder of a running loudness and an event. */
export function louder(loudness: number, event: NoiseEvent | null): number {
  return event ? Math.max(loudness, NOISE_LOUDNESS[event]) : loudness;
}

/** Advance every living enemy's awareness by one frame. */
export function stepStealth(ctx: StealthStepContext, enemies: readonly EnemyRuntime[]) {
  const { delta, player, lineOfSight, scratch } = ctx;
  const target: DetectionTarget = {
    position: player.position,
    sneakSkill: player.sneakSkill,
    agility: player.agility,
    bootWeightKg: player.bootWeightKg,
    sneaking: player.sneaking,
    lightLevel: player.lightLevel,
  };
  scratch.chest.set(player.position.x, player.position.y + CHARACTER_CHEST_ABOVE_BODY_CENTRE, player.position.z);
  for (const e of enemies) {
    const f = e.fighter;
    if (f.health <= 0) continue;
    const view = e.archetype.perception;
    scratch.eye.set(e.position.x, e.position.y + PLAYER_EYE_OFFSET_Y, e.position.z);
    // Eyes at the shared humanoid eye line (the player's aim rig uses the same).
    const observer: Observer = {
      position: scratch.eye,
      facingYaw: f.yaw,
      viewHalfAngle: THREE.MathUtils.degToRad(view.viewHalfAngleDegrees),
      viewRange: view.viewRangeMetres,
      spotScore: view.spotScore,
    };
    const distance = Math.hypot(player.position.x - e.position.x, player.position.z - e.position.z);
    // The ray is the one costly part: only cast it inside the view range.
    const inRange = distance <= view.viewRangeMetres;
    const seen = inRange && perceive(observer, target, { lineOfSight: lineOfSight(scratch.eye, scratch.chest) }).seen;
    const noise = noiseHeard(player.loudness, distance);
    const before = e.awareness.awareness;
    e.awareness = stepAwareness(e.awareness, { seen, noise }, delta);
    if (seen || noise > 0) (e.lastKnownPlayer ??= new THREE.Vector3()).copy(player.position);
    // Engaged from not engaged: the fight starts from `watching` and decides at once.
    if (before !== "engaged" && e.awareness.awareness === "engaged") f.decisionTimer = 0;
  }
}

const RANK: Readonly<Record<Awareness, number>> = { unaware: 0, suspicious: 1, engaged: 2 };

/** The HUD's detection meter: the most alert living enemy and its suspicion. */
export function detectionReadout(enemies: readonly EnemyRuntime[]): { level: number; awareness: Awareness } {
  let best: { level: number; awareness: Awareness } = { level: 0, awareness: "unaware" };
  for (const e of enemies) {
    if (e.fighter.health <= 0) continue;
    const a = e.awareness;
    if (RANK[a.awareness] > RANK[best.awareness]
      || (a.awareness === best.awareness && a.suspicion > best.level)) {
      best = { level: a.suspicion, awareness: a.awareness };
    }
  }
  return best;
}
