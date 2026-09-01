import type { AnimationState, CombatAction } from "../core/types";
import type {
  AttackDefinition,
  PairedCriticalProfile,
  ParryProfile,
  WeaponDefinition,
} from "../equipment/types";
import { clipConfig, clipPlaybackSourceSpan } from "../anim/animationManifest";
import { STRAIGHT_SWORD } from "../equipment/arsenal";

/**
 * Weapon-agnostic moveset rules. Everything here reads an `AttackDefinition`
 * or a `PairedCriticalProfile`; none of it knows which weapon it came from, so
 * a new weapon is data (see `src/game/equipment/`) rather than a branch.
 */

export type ComboInput = "light" | "heavy";

export const CRITICAL_DAMAGE_MULTIPLIER = STRAIGHT_SWORD.stats.criticalMultiplier;
export const LIGHT_ATTACK_BASE_DAMAGE = STRAIGHT_SWORD.attacks.light1.damage;
export const CRITICAL_ATTACK_DAMAGE = STRAIGHT_SWORD.attacks.riposte.damage;

export type CriticalVictimPlayback = {
  phase: "leadIn" | "reaction";
  action: AnimationState;
  startAt: number;
};

export type CriticalVictimOutcomePlayback = {
  action: AnimationState;
  startAt: number;
  crossFadeDuration?: number;
  /** Absolute action-clock boundary; remaining time is `endAt - startAt`. */
  endAt: number;
};

/**
 * Resolves victim choreography from the attacker's authoritative clock.
 *
 * Backstab is a genuinely paired HKX, so both roles begin at zero. Rim's
 * execution is event-driven: Skyrim holds the parried actor vulnerable, then
 * dispatches a separate hit reaction at the attacker's contact annotation.
 * Keeping that distinction in profile data prevents the victim from reacting
 * or recovering while the attacker is still winding up.
 */
export function criticalVictimPlaybackAt(
  attackerTime: number,
  attack: Pick<AttackDefinition, "windup" | "active" | "recovery">,
  profile: PairedCriticalProfile,
): CriticalVictimPlayback {
  const duration = attack.windup + attack.active + attack.recovery;
  const reactionStart = duration * profile.victimActionStartProgress;
  if (profile.victimLeadIn && attackerTime < reactionStart) {
    return {
      phase: "leadIn",
      action: profile.victimLeadIn.action,
      startAt: profile.victimLeadIn.holdTime,
    };
  }
  return {
    phase: "reaction",
    action: profile.victimAction,
    startAt: profile.victimActionStartAt + Math.max(0, attackerTime - reactionStart),
  };
}

/** Resolve the post-alignment action and its complete playback boundary. */
export function criticalVictimRecoveryPlayback(
  profile: PairedCriticalProfile,
): CriticalVictimOutcomePlayback {
  return criticalVictimOutcomePlayback(profile.victimRecovery);
}

/** Resolve the prone-ending outcome used by a lethal critical. */
export function criticalVictimDeathPlayback(
  profile: PairedCriticalProfile,
): CriticalVictimOutcomePlayback {
  return criticalVictimOutcomePlayback(profile.victimDeath);
}

function criticalVictimOutcomePlayback(
  outcome: PairedCriticalProfile["victimRecovery"] | PairedCriticalProfile["victimDeath"],
): CriticalVictimOutcomePlayback {
  const { action, startAt, crossFadeDuration } = outcome;
  const config = clipConfig(action);
  const sourceSpan = clipPlaybackSourceSpan(action);
  return {
    action,
    startAt,
    crossFadeDuration,
    endAt: sourceSpan == null || config.playbackRate <= 0
      ? Number.POSITIVE_INFINITY
      : sourceSpan / config.playbackRate,
  };
}

/**
 * The next attack in a chain, for the weapon actually being swung.
 *
 * `weapon` is required rather than defaulted. It used to fall back to the
 * reference sword, which was invisible while there was one moveset and became
 * a real defect the moment there were three: a greatsword opened with its own
 * two-handed swing and then chained into the one-handed clips, because the
 * successor was looked up on a weapon nobody was holding.
 */
export function getComboSuccessor(
  current: AttackDefinition,
  queued: ComboInput | null,
  weapon: WeaponDefinition,
) {
  if (queued === "light" && current.id === "light1") return weapon.attacks.light2;
  if (queued === "light" && current.id === "light2") return weapon.attacks.light3;
  if (queued === "heavy" && current.id === "heavy") return weapon.attacks.heavy2;
  return null;
}

/** Total action lock, independent of how it splits into phases. */
export function attackDuration(attack: AttackDefinition) {
  return attack.windup + attack.active + attack.recovery;
}

/**
 * When the current attack hands over to its queued successor.
 *
 * Deliberately not the end of the contact window. The hitbox closes when the
 * blade stops cutting; the chain branches later, once the body has carried the
 * follow-through the next swing grows out of.
 */
export function comboTransitionTime(attack: AttackDefinition) {
  const duration = attackDuration(attack);
  return attack.comboBranchProgress == null
    ? attack.windup + attack.active
    : duration * attack.comboBranchProgress;
}

/** A queued successor starts at its authored chain-entry pose. */
export function comboEntryTime(_attack: AttackDefinition) {
  return 0;
}

/** Transition-specific pose blend; null falls back to the incoming manifest. */
export function comboCrossFadeDuration(
  current: AttackDefinition,
  successor: AttackDefinition,
) {
  // HEAVY finishes in a deep forward lunge with the sword behind the body,
  // while vanilla HEAVY_2 opens in an overhead wind-up. Its generic 120 ms
  // blend collapses that large authored pose distance into one bad reset
  // frame. Give this specific chain enough time to read as a continuous
  // circular recovery into the overhead wind-up; standalone HEAVY_2 keeps its
  // normal entry timing.
  return current.id === "heavy" && successor.id === "heavy2" ? 0.24 : null;
}

/**
 * Input is accepted from the moment the swing commits until the frame that
 * crosses the branch point, so a player who presses during the visible arc
 * always chains even though the contact window itself is short.
 */
export function comboQueueOpen(
  elapsed: number,
  previousElapsed: number,
  attack: AttackDefinition,
) {
  return elapsed >= comboQueueOpenTime(attack) && previousElapsed < comboTransitionTime(attack);
}

/** When the next swing's input starts being accepted. See `comboQueueOpenProgress`. */
export function comboQueueOpenTime(attack: AttackDefinition) {
  return attack.comboQueueOpenProgress == null
    ? attack.windup
    : attackDuration(attack) * attack.comboQueueOpenProgress;
}

export function comboSuccessorStartTime(elapsed: number, attack: AttackDefinition) {
  return Math.max(0, elapsed - comboTransitionTime(attack));
}

export function hitReactionForAttack(attack: AttackDefinition | null): {
  action: Extract<CombatAction, "hit" | "hitHeavy">;
  animation: Extract<AnimationState, "HIT" | "HIT_HEAVY">;
} {
  const heavy = attack?.id === "heavy" || attack?.id === "heavy2";
  return heavy
    ? { action: "hitHeavy", animation: "HIT_HEAVY" }
    : { action: "hit", animation: "HIT" };
}

export const COMBAT_TUNING = {
  maxHealth: 100,
  maxStamina: 100,
  staminaRegenPerSecond: 24,
  staminaRegenDelay: 1.05,
  sprintDrainPerSecond: 15,
  rollCost: 32,
  backstepCost: 26,
  parryCost: 18,
  jumpCost: 15,
  rollDuration: 0.72,
  rollIFrameStart: 0.12,
  rollIFrameEnd: 0.43,
  // Gameplay commitment stays stable when the semantic parry clips are
  // reskinned. A shorter authored pair holds its recovered end pose rather
  // than silently shrinking the defender's punish window.
  parryDuration: 1.1,
  // Fallback catch window, for an actor with no resolved guard profile. Real
  // parries use the family's own measured window — see `ParryProfile.active`
  // and `isParryActive`.
  parryActiveStart: 0.1,
  parryActiveEnd: 0.29,
  healDuration: 1.55,
  healAmount: 45,
  comboQueueWindow: 0.25,
} as const;

export function phaseAt(elapsed: number, attack: AttackDefinition) {
  if (elapsed < attack.windup) return "windup" as const;
  if (elapsed < attack.windup + attack.active) return "active" as const;
  if (elapsed < attackDuration(attack)) return "recovery" as const;
  return "none" as const;
}

export function isWeaponHitboxActive(elapsed: number, attack: AttackDefinition) {
  return phaseAt(elapsed, attack) === "active";
}

export function isRollInvulnerable(elapsed: number) {
  return elapsed >= COMBAT_TUNING.rollIFrameStart && elapsed <= COMBAT_TUNING.rollIFrameEnd;
}

/**
 * When a family's parry is catching: the whole of its follow-through clip.
 *
 * A parry is two authored clips on one gameplay clock — the raise, then the
 * catch — so the boundary between them *is* the boundary of the window, and
 * the end of the second clip is the end of it. Owner ruling, round 4, and it
 * replaced three rounds of trying to measure the catching part of the pair,
 * each of which got at least one family wrong.
 *
 * Derived rather than authored, so it cannot drift out of step with the clips
 * and a reskin or a new family needs no tuning pass.
 */
export function parryCatchWindow(profile: ParryProfile) {
  const start = clipConfig(profile.intro).sourceDuration ?? COMBAT_TUNING.parryActiveStart;
  const duration = clipConfig(profile.followThrough).sourceDuration
    ?? COMBAT_TUNING.parryActiveEnd - start;
  return { start, duration };
}

/**
 * How long the whole parry action lasts, for this family.
 *
 * The pair's own length. It used to be one shared constant (1.1 s), which was
 * shorter than the two-handed pairs — so a greatsword's catch would have been
 * cut off 0.23 s before its clip finished, and "active for the whole
 * follow-through" would have been quietly untrue for exactly the weapons the
 * window was already wrong on.
 */
export function parryActionDuration(profile: ParryProfile) {
  const { start, duration } = parryCatchWindow(profile);
  return Math.max(COMBAT_TUNING.parryDuration, start + duration);
}

/**
 * Whether the parry is catching, for the thing actually being parried with.
 *
 * Omitting `profile` falls back to the shared constants, which is only right
 * for an actor with no resolved guard profile at all.
 */
export function isParryActive(elapsed: number, profile?: ParryProfile) {
  if (!profile) {
    return elapsed >= COMBAT_TUNING.parryActiveStart && elapsed <= COMBAT_TUNING.parryActiveEnd;
  }
  const { start, duration } = parryCatchWindow(profile);
  return elapsed >= start && elapsed <= start + duration;
}

export function isBackstabPosition(
  enemyForward: { x: number; z: number },
  enemyToPlayer: { x: number; z: number },
  distance: number,
  range = STRAIGHT_SWORD.attacks.backstab.range,
) {
  if (distance < 0.25 || distance > range) return false;
  const forwardLength = Math.hypot(enemyForward.x, enemyForward.z);
  const playerLength = Math.hypot(enemyToPlayer.x, enemyToPlayer.z);
  if (forwardLength < 0.001 || playerLength < 0.001) return false;
  const facingDot = (enemyForward.x * enemyToPlayer.x + enemyForward.z * enemyToPlayer.z) / (forwardLength * playerLength);
  return facingDot <= -0.6;
}

export { STRAIGHT_SWORD };
