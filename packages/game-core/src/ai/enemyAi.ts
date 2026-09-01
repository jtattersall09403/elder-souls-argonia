import type { CombatAction, CombatPhase } from "../core/types";
import { STRAIGHT_SWORD } from "../equipment/arsenal";
import { weaponTactics, type WeaponTactics } from "./weaponTactics";

/**
 * The tactics used when nothing says otherwise.
 *
 * The sword's, which is what every threshold in this file used to be written
 * as a constant. Keeping it as the fallback means an actor whose weapon has
 * not been resolved behaves exactly as it did before this file learned about
 * weapons at all.
 */
const SWORD_TACTICS = weaponTactics(STRAIGHT_SWORD);

/**
 * How close the *player* has to be for their swing to be a threat worth
 * answering, metres.
 *
 * The enemy's own reach decides where it wants to stand; the player's decides
 * what it has to defend against, and the two are not the same weapon. Taken
 * from the reference sword's reach with a margin, because a defender reacting
 * to a swing is reacting to the swing they can see rather than measuring it.
 */
const PLAYER_THREAT_RANGE = STRAIGHT_SWORD.attacks.light1.range + 0.5;

export type EnemyIntent =
  | "approach" | "strafe" | "lightCombo" | "heavy" | "guard" | "parry"
  | "dodge" | "backstep" | "heal"
  /** Draw and loose. Bows only. */
  | "shoot"
  /** Give ground to re-open the distance a bow needs. Bows only. */
  | "withdraw";

export type EnemyAiContext = {
  distance: number;
  healthRatio: number;
  stamina: number;
  estus: number;
  playerAction: CombatAction;
  playerPhase: CombatPhase;
  playerRecovering: boolean;
  /** Stable per-enemy trait in [0, 1); see Fighter.personality. */
  personality: number;
  /** Intent the enemy is already carrying out, if any. */
  previousIntent?: EnemyIntent | null;
  /**
   * Score the previous intent keeps while it remains viable. Approach, strafe
   * and lightCombo score within noise of each other at mid range, so without
   * commitment the enemy re-picks a different one every decision tick and
   * visibly stutters toward the player instead of running at them.
   */
  commitmentBonus?: number;
  /**
   * How the equipped weapon wants to be fought with. Every distance below is
   * expressed against this rather than as a constant, because the constants
   * were a sword's and a spearman using them walks inside his own point.
   */
  tactics?: WeaponTactics;
};

export type EnemyIntentScore = { intent: EnemyIntent; score: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Deterministic per-(enemy, intent) bias so identical situations don't score identically for every enemy. */
function personalityBias(personality: number, index: number) {
  return (Math.sin(personality * 133.7 + index * 12.9898) * 0.5) * 0.16;
}

export function scoreEnemyIntents(context: EnemyAiContext): EnemyIntentScore[] {
  const tactics = context.tactics ?? SWORD_TACTICS;
  const incoming = context.playerPhase === "windup" || context.playerPhase === "active";
  const heavyIncoming = context.playerAction === "heavy" || context.playerAction === "heavy2";
  const hurt = clamp01((0.48 - context.healthRatio) / 0.36);
  // Every threshold below is the weapon's own geometry, not a constant. A
  // "close" of 1 means standing where this weapon wants to strike from.
  const close = clamp01((tactics.disengageRange - context.distance)
    / Math.max(0.4, tactics.disengageRange - tactics.engageRange));
  const far = clamp01((context.distance - tactics.engageRange)
    / Math.max(0.6, tactics.disengageRange));
  const crowded = context.distance < tactics.crowdedRange;
  // Reacting to a swing is about *the player's* reach, not the enemy's — an
  // archer at nine metres has nothing to dodge.
  const threatened = incoming && context.distance < PLAYER_THREAT_RANGE;
  const safeToHeal = context.distance > tactics.disengageRange || context.playerRecovering;

  if (tactics.ranged) return scoreRangedIntents(context, tactics, threatened, hurt, safeToHeal);

  const scores = [
    { intent: "approach" as const, score: 0.22 + far * 0.72 },
    {
      intent: "strafe" as const,
      score: context.distance > tactics.crowdedRange && context.distance < tactics.disengageRange
        ? 0.16 + tactics.circling * 0.4
        : 0.08,
    },
    {
      intent: "lightCombo" as const,
      score: context.stamina >= 66
        ? (0.18 + tactics.aggression * 0.3) + close * 0.35 + (context.playerRecovering ? 0.22 : 0)
        : 0,
    },
    {
      intent: "heavy" as const,
      // The inverse weighting of the light chain: a weapon that cannot afford
      // to flurry is the one that wants the single committed blow.
      score: context.stamina >= 45
        ? (0.34 - tactics.aggression * 0.22) + close * 0.24 + (context.playerRecovering ? 0.38 : 0)
        : 0,
    },
    { intent: "guard" as const, score: threatened && context.stamina >= 14 ? 0.48 + (heavyIncoming ? -0.12 : 0.1) : 0 },
    { intent: "parry" as const, score: threatened && !heavyIncoming && context.stamina >= 18 ? 0.64 : 0 },
    { intent: "dodge" as const, score: threatened && context.stamina >= 30 ? (heavyIncoming ? 0.92 : 0.7) : 0 },
    // Backing off is about being *fouled*, which is a property of the weapon:
    // a dagger is happy at a distance a halberd cannot use at all.
    { intent: "backstep" as const, score: crowded && context.stamina >= 24 ? (threatened ? 0.76 : 0.5) : 0 },
    { intent: "heal" as const, score: context.estus > 0 && hurt > 0 && safeToHeal ? 0.42 + hurt * 0.48 : 0 },
  ];
  return withBias(scores, context);
}

/**
 * A bow's intents, which are a different set rather than the same set retuned.
 *
 * An archer's problem is the opposite of a swordsman's: it already has the
 * range it needs and its whole job is keeping it. So closing is what it does
 * when it has drifted too far to shoot accurately, giving ground is a
 * first-class choice rather than a panic response, and there is no scoring
 * branch at all for parrying or guarding — a bow does neither.
 */
function scoreRangedIntents(
  context: EnemyAiContext,
  tactics: WeaponTactics,
  threatened: boolean,
  hurt: number,
  safeToHeal: boolean,
): EnemyIntentScore[] {
  const standoff = tactics.standoffRange ?? tactics.engageRange;
  // Nearer than it wants to be, as a 0-1 share of the gap it will tolerate.
  const crowded = clamp01((standoff - context.distance)
    / Math.max(0.5, standoff - tactics.crowdedRange));
  const scores = [
    // Only when it has drifted well beyond its own standoff. An archer that
    // walks toward you is an archer that has stopped being an archer.
    { intent: "approach" as const, score: context.distance > tactics.disengageRange ? 0.85 : 0 },
    { intent: "withdraw" as const, score: crowded > 0.15 ? 0.32 + crowded * 0.62 : 0 },
    // Shooting is the default, and it gets better the less it is being
    // crowded — a bow drawn at arm's length is not a shot.
    { intent: "shoot" as const, score: context.distance > tactics.crowdedRange ? 0.6 + (1 - crowded) * 0.34 : 0 },
    { intent: "strafe" as const, score: context.distance > tactics.crowdedRange ? 0.2 + tactics.circling * 0.22 : 0.05 },
    // At knife range a bow is a stick. Rolling away is the only real answer,
    // and the fallback swing is a last resort rather than a plan.
    { intent: "dodge" as const, score: threatened && context.stamina >= 30 ? 0.95 : 0 },
    { intent: "backstep" as const, score: context.distance < tactics.crowdedRange && context.stamina >= 24 ? 0.7 : 0 },
    { intent: "lightCombo" as const, score: context.distance < tactics.crowdedRange * 0.5 && context.stamina >= 66 ? 0.3 : 0 },
    { intent: "heal" as const, score: context.estus > 0 && hurt > 0 && safeToHeal ? 0.42 + hurt * 0.48 : 0 },
  ];
  return withBias(scores, context);
}

/** Personality spread and intent commitment, shared by both intent sets. */
function withBias(scores: EnemyIntentScore[], context: EnemyAiContext): EnemyIntentScore[] {
  const commitment = context.commitmentBonus ?? 0;
  return scores.map((entry, index) => {
    if (entry.score <= 0) return entry;
    const sticky = entry.intent === context.previousIntent ? commitment : 0;
    return {
      ...entry,
      score: entry.score + personalityBias(context.personality, index) + sticky,
    };
  });
}

export function selectEnemyIntent(context: EnemyAiContext, random = Math.random()): EnemyIntent {
  const scores = scoreEnemyIntents(context);
  // Small bounded jitter prevents a fixed loop while keeping the best tactical
  // response dominant. The state machine still supplies visible commitment and recovery.
  let best = scores[0];
  for (let index = 0; index < scores.length; index += 1) {
    const candidate = scores[index];
    const jitter = (((random * 997 + index * 0.381966) % 1) - 0.5) * 0.09;
    if (candidate.score + jitter > best.score) best = candidate;
  }
  return best.intent;
}
