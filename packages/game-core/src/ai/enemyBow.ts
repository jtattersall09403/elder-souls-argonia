import { dragDeceleration, GRAVITY, type ArrowPhysics } from "../combat/ballistics";
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
 * 0.6 s (was 0.45; round 8): a rigged bow at full draw is the telegraph now,
 * and a beat and a half is what lets it read at bow range.
 */
export const ENEMY_BOW_HOLD_SECONDS = 0.6;

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
 * Solved against the *same drag model the arrow flies under*
 * (`integrateTrajectory`), because the vacuum answer undershoots by enough to
 * miss at any range worth shooting at: a bisection on launch angle, converging
 * on the trajectory that passes through the target's height at its distance.
 * Returns null when the shot is out of reach at this speed.
 */
export function aimElevation(
  speed: number,
  arrow: ArrowPhysics,
  horizontalRange: number,
  heightDifference: number,
  gravityScale = 1,
): number | null {
  if (!(speed > 0) || !(horizontalRange > 0)) return null;
  let low = -Math.PI / 2 + 0.001;
  let high = Math.PI / 4 + Math.atan2(heightDifference, horizontalRange) / 2;
  if (dropAt(speed, arrow, horizontalRange, high, gravityScale) < heightDifference) return null;
  for (let step = 0; step < 18; step += 1) {
    const middle = (low + high) / 2;
    if (dropAt(speed, arrow, horizontalRange, middle, gravityScale) < heightDifference) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Integrate to the target plane, including targets below the launch height. */
function dropAt(speed: number, arrow: ArrowPhysics, range: number, angle: number, gravityScale: number) {
  let vx = speed * Math.cos(angle), vy = speed * Math.sin(angle);
  let x = 0, y = 0;
  const dt = 1 / 240;
  for (let t = 0; t < 8 && vx > 1e-5; t += dt) {
    const v = Math.hypot(vx, vy);
    const drag = dragDeceleration(v, arrow) / Math.max(v, 1e-9);
    vx -= drag * vx * dt;
    vy -= (drag * vy + GRAVITY * gravityScale) * dt;
    const nextX = x + vx * dt;
    if (nextX >= range) return y + vy * dt * (range - x) / (nextX - x);
    x = nextX;
    y += vy * dt;
  }
  return -Infinity;
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
