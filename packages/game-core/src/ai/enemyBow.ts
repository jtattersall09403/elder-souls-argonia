import { GRAVITY, type ArrowPhysics } from "../combat/ballistics";
import type { AnimationState } from "../core/types";
import type { RangedStats } from "../equipment/types";

/**
 * An NPC shooting a bow.
 *
 * Deliberately not the player's `bowShot` cycle. That one is driven by a held
 * button and has to answer a player who changes their mind mid-draw — partial
 * releases, cancelling into a guard, holding at full draw and paying stamina
 * for it. An archer NPC has none of those problems and one the player does not:
 * it has to *decide where to point*. So this is the small state machine that
 * remains once the input handling is gone, plus the aiming.
 */

export type EnemyBowPhase = "draw" | "hold" | "release" | "done";

export type EnemyBowStep = {
  phase: EnemyBowPhase;
  animation: AnimationState;
  /** True on the single step the string is let go. */
  loosed: boolean;
};

/**
 * How long an archer holds at full draw before loosing, seconds.
 *
 * Not zero, and the reason is legibility rather than realism: the draw is the
 * telegraph, and a player needs a beat at full draw to read "that one is aimed
 * at me" and start moving. It is the archer's equivalent of a wind-up.
 */
export const ENEMY_BOW_HOLD_SECONDS = 0.45;

export function advanceEnemyBow(
  elapsed: number,
  previousElapsed: number,
  ranged: RangedStats,
  holdSeconds = ENEMY_BOW_HOLD_SECONDS,
): EnemyBowStep {
  const drawEnds = ranged.drawSeconds;
  const holdEnds = drawEnds + holdSeconds;
  const releaseEnds = holdEnds + ranged.releaseRecoverySeconds;
  if (elapsed < drawEnds) return { phase: "draw", animation: "BOW_DRAW", loosed: false };
  if (elapsed < holdEnds) return { phase: "hold", animation: "BOW_DRAWN", loosed: false };
  return {
    phase: elapsed < releaseEnds ? "release" : "done",
    animation: "BOW_RELEASE",
    // Exactly once, on the step that crosses the boundary.
    loosed: previousElapsed < holdEnds && elapsed >= holdEnds,
  };
}

/**
 * The elevation an arrow has to leave at to arrive where it is aimed.
 *
 * An archer that fires flat at a target thirty metres away misses low by
 * several metres and looks broken. Arrows fly a plain gravity arc (no drag —
 * `combat/arrowFlight`), so this is the closed-form vacuum solution: of the
 * two launch angles that reach a point, the flatter one, which is the one an
 * archer takes. Returns null when the shot is out of reach at this speed, which
 * the caller should treat as "do not take it".
 */
export function aimElevation(
  speed: number,
  _arrow: ArrowPhysics,
  horizontalRange: number,
  heightDifference: number,
): number | null {
  if (!(speed > 0) || !(horizontalRange > 0)) return null;
  const v2 = speed * speed;
  const discriminant = v2 * v2 - GRAVITY * (GRAVITY * horizontalRange * horizontalRange + 2 * heightDifference * v2);
  if (discriminant < 0) return null;
  return Math.atan2(v2 - Math.sqrt(discriminant), GRAVITY * horizontalRange);
}

/**
 * How much an archer misses by, in radians of aim error.
 *
 * A shot that is exactly right every time is not a fight, it is a tax. The
 * spread is applied to the *aim*, not to the arrow, so a miss still flies a
 * real trajectory the player can watch go past them.
 */
export function bowAimSpread(personality: number, distance: number) {
  // Wider the further out, which is both true and the thing that makes closing
  // the distance the right answer.
  const base = 0.012 + distance * 0.0016;
  return base * (0.6 + personality * 0.8);
}
