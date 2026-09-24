import { solveBowAim } from "@elder-souls/game-core/combat/solveBowAim";
import { combatAudio } from "@elder-souls/game-core/fx/audio";
import { directionTo } from "@elder-souls/game-core/combat/aimConvergence";
import { launchSpeed } from "@elder-souls/game-core/combat/ballistics";
import { fireArrow } from "@elder-souls/game-core/combat/arrowStore";
import { bowAimSpread } from "@elder-souls/game-core/ai/enemyBow";
import { DEFAULT_ARROW } from "@elder-souls/game-core/equipment/arrows";
import type { RangedStats } from "@elder-souls/game-core/equipment/types";
import type { AnimationState } from "@elder-souls/game-core/core/types";
import * as THREE from "three";
import { ARROW_SPAWN_AHEAD_METERS } from "./aimRig";
import { EnemyRuntime } from "./enemyRuntime";

/**
 * An archer looses at the player.
 *
 * The shot leaves along the direction the bow is *pointing* — the archer's
 * facing, at the elevation `aimElevation` solved for the range — and from the
 * nock of the shaft it has been holding on the string, not from a point near
 * its eye. The spread is applied to the aim rather than to the arrow, so a miss
 * is still a real trajectory the player can watch go past.
 */
export function looseEnemyArrow(
  runtime: EnemyRuntime,
  ranged: RangedStats,
  distance: number,
  /** No aim spread: a validation scene is deterministic by contract. */
  exact = false,
) {
  // What every archer in the sandbox shoots. A per-archetype quiver is a
  // Phase 13 loot question, not a combat one.
  const arrow = DEFAULT_ARROW;
  const speed = launchSpeed(ranged, arrow.physics, 1);
  const spread = exact ? 0 : bowAimSpread(runtime.fighter.personality, distance);
  // Deterministic per-shot rather than per-frame: one wobble, applied to the
  // whole shot, so the arrow flies straight along a slightly wrong line.
  const yawError = (Math.random() - 0.5) * 2 * spread;
  const pitchError = (Math.random() - 0.5) * 2 * spread;
  // The shot line runs from the NOCK to the target, not down the body's
  // centre line: the string hand is a third of a metre off that line, and a
  // shaft loosed parallel to the facing passed the player's shoulder by
  // exactly that (measured, round 8). The body still faces the bearing; the
  // two differ by a couple of degrees at bow range.
  const yaw = runtime.aimYaw.current + yawError;
  const pitch = runtime.aimPitch.current + pitchError;
  const horizontal = Math.cos(pitch) * speed;
  const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const origin = runtime.nockWorld.current.clone().addScaledVector(direction, ARROW_SPAWN_AHEAD_METERS);
  fireArrow({
    arrow,
    // The HURTBOX name: strikes resolve against hurtboxes, so the exclusion
    // has to name the same body.
    shooter: runtime.hurtboxName,
    origin: [origin.x, origin.y, origin.z],
    velocity: [Math.sin(yaw) * horizontal, Math.sin(pitch) * speed, Math.cos(yaw) * horizontal],
  });
  combatAudio.play("swing");
}

/**
 * Where an archer's shaft points while it is on the string: its facing, at the
 * elevation the shot needs. Kept current through the draw so the nocked arrow
 * and the upper-body lean track the target, and so the loose has a pitch that
 * was solved for *this* range.
 */
export function aimEnemyBow(
  runtime: EnemyRuntime,
  ranged: RangedStats,
  target: THREE.Vector3,
  /** The host's arrow gravity multiplier; the solve must match the flight. */
  gravityScale: number,
) {
  const arrow = DEFAULT_ARROW;
  const origin = runtime.nockWorld.current;
  const speed = launchSpeed(ranged, arrow.physics, 1);
  // Aimed at the chest: `target` is the capsule centre, a little below the
  // sternum. The old +0.9 aimed a head's height above the crown, which is why
  // a standing player was "almost always" missed. Range and bearing are
  // taken from the nock, which is where the shaft actually starts.
  const point = { x: target.x, y: target.y + ARCHER_AIM_ABOVE_CENTRE, z: target.z };
  const direction = solveBowAim(origin, point, speed, arrow.physics, gravityScale)
    ?? directionTo(origin, point);
  runtime.aimPitch.current = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  runtime.aimYaw.current = Math.atan2(direction.x, direction.z);
  runtime.aimDirection.current.set(direction.x, direction.y, direction.z);
}

/** Where on the player an archer aims, above the capsule centre, metres. */
export const ARCHER_AIM_ABOVE_CENTRE = 0.25;
export const COMMITTED_BOW_FOOTWORK: ReadonlySet<AnimationState> = new Set<AnimationState>([
  "BOW_DRAW", "BOW_RELEASE", "BOW_EQUIP", "BOW_UNEQUIP",
]);
/** How far off its target an archer may still be facing when it looses, radians. */
export const BOW_LOOSE_FACING_TOLERANCE = 0.06;
/** The longest an archer waits at full draw for its turn to finish, seconds. */
export const BOW_LOOSE_FACING_MAX_WAIT = 1.2;
