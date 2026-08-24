import type { AnimationState } from "../core/types";
import { clipPlaybackDuration } from "../anim/animationManifest";
import { DEFAULT_ENEMY_ARCHETYPE } from "../actors/enemyArchetypes";

const GUARD_HIT_ANIMATIONS = new Set<AnimationState>(["GUARD_HIT_A", "GUARD_HIT_B"]);

export const ENEMY_GUARD_ENTER_DURATION = clipPlaybackDuration("GUARD_ENTER") ?? 0.8333;

/** Entry clip plus the archetype's tactical hold. */
export function enemyGuardTacticalDuration(guardHold: number) {
  return ENEMY_GUARD_ENTER_DURATION + guardHold;
}

export const ENEMY_GUARD_TACTICAL_DURATION = enemyGuardTacticalDuration(
  DEFAULT_ENEMY_ARCHETYPE.stateDurations.guard,
);

export type EnemyGuardVisualStep = {
  nextAnimation: AnimationState | null;
  shouldExit: boolean;
};

/**
 * Resolve the enemy guard presentation without coupling its clips to one
 * tactical timeout. The entry must finish before the loop, and a block impact
 * must finish even when it begins near the end of the intended guard hold.
 */
export function resolveEnemyGuardVisualStep({
  actionTime,
  currentAnimation,
  guardHitUntil,
  holdInitialState,
  tacticalDuration = ENEMY_GUARD_TACTICAL_DURATION,
}: {
  actionTime: number;
  currentAnimation: AnimationState;
  guardHitUntil: number;
  holdInitialState: boolean;
  tacticalDuration?: number;
}): EnemyGuardVisualStep {
  const hitActive = GUARD_HIT_ANIMATIONS.has(currentAnimation)
    && actionTime < guardHitUntil;
  if (hitActive) return { nextAnimation: null, shouldExit: false };

  if (holdInitialState) {
    return {
      nextAnimation: currentAnimation === "GUARD_ENTER" && actionTime >= ENEMY_GUARD_ENTER_DURATION
        ? "GUARD"
        : GUARD_HIT_ANIMATIONS.has(currentAnimation)
          ? "GUARD"
          : null,
      shouldExit: false,
    };
  }

  if (actionTime >= Math.max(tacticalDuration, guardHitUntil)) {
    return { nextAnimation: null, shouldExit: true };
  }

  if (
    (currentAnimation === "GUARD_ENTER" && actionTime >= ENEMY_GUARD_ENTER_DURATION)
    || GUARD_HIT_ANIMATIONS.has(currentAnimation)
  ) {
    return { nextAnimation: "GUARD", shouldExit: false };
  }

  return { nextAnimation: null, shouldExit: false };
}

