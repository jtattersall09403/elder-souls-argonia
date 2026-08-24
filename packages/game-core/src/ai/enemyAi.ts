import type { CombatAction, CombatPhase } from "../core/types";

export type EnemyIntent = "approach" | "strafe" | "lightCombo" | "heavy" | "guard" | "parry" | "dodge" | "backstep" | "heal";

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
};

export type EnemyIntentScore = { intent: EnemyIntent; score: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Deterministic per-(enemy, intent) bias so identical situations don't score identically for every enemy. */
function personalityBias(personality: number, index: number) {
  return (Math.sin(personality * 133.7 + index * 12.9898) * 0.5) * 0.16;
}

export function scoreEnemyIntents(context: EnemyAiContext): EnemyIntentScore[] {
  const incoming = context.playerPhase === "windup" || context.playerPhase === "active";
  const heavyIncoming = context.playerAction === "heavy" || context.playerAction === "heavy2";
  const close = clamp01((3.1 - context.distance) / 1.6);
  const far = clamp01((context.distance - 2.2) / 3.4);
  const hurt = clamp01((0.48 - context.healthRatio) / 0.36);
  const safeToHeal = context.distance > 3.3 || context.playerRecovering;

  const scores = [
    { intent: "approach" as const, score: 0.22 + far * 0.72 },
    { intent: "strafe" as const, score: context.distance > 1.6 && context.distance < 3.8 ? 0.34 : 0.08 },
    { intent: "lightCombo" as const, score: context.stamina >= 66 ? 0.3 + close * 0.35 + (context.playerRecovering ? 0.22 : 0) : 0 },
    { intent: "heavy" as const, score: context.stamina >= 45 ? 0.2 + close * 0.24 + (context.playerRecovering ? 0.38 : 0) : 0 },
    { intent: "guard" as const, score: incoming && context.distance < 2.5 && context.stamina >= 14 ? 0.48 + (heavyIncoming ? -0.12 : 0.1) : 0 },
    { intent: "parry" as const, score: incoming && !heavyIncoming && context.distance < 2.25 && context.stamina >= 18 ? 0.64 : 0 },
    { intent: "dodge" as const, score: incoming && context.distance < 2.8 && context.stamina >= 30 ? (heavyIncoming ? 0.92 : 0.7) : 0 },
    { intent: "backstep" as const, score: incoming && context.distance < 1.35 && context.stamina >= 24 ? 0.76 : 0 },
    { intent: "heal" as const, score: context.estus > 0 && hurt > 0 && safeToHeal ? 0.42 + hurt * 0.48 : 0 },
  ];
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
