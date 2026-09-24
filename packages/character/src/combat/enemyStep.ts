import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import * as THREE from "three";
import { clipConfig } from "@elder-souls/game-core/anim/animationManifest";
import { combatAudio } from "@elder-souls/game-core/fx/audio";
import { BLOCK_RECOIL_DURATION, PARRY_RECOIL_SPEED, blockRecoilVelocity } from "@elder-souls/game-core/combat/blockReaction";
import { enemyGuardTacticalDuration, resolveEnemyGuardVisualStep } from "@elder-souls/game-core/combat/enemyGuard";
import { BACKSTEP_DISTANCE_MULTIPLIER, ENEMY_SHARED_DURATIONS } from "@elder-souls/game-core/combat/tuning";
import { NOCK_REVEAL_FRACTION, bowLocomotionClip } from "@elder-souls/game-core/combat/bowShot";
import { tickStatusEffects } from "@elder-souls/game-core/combat/statusEffects";
import { activeGuardAnimations } from "@elder-souls/game-core/equipment/guard";
import { advancePoise } from "@elder-souls/game-core/combat/poise";
import { locomotionSpeedMultiplier } from "@elder-souls/game-core/anim/locomotionCadence";
import { selectEnemyIntent, type EnemyIntent } from "@elder-souls/game-core/ai/enemyAi";
import { loadoutTactics } from "@elder-souls/game-core/ai/weaponTactics";
import { ENEMY_BOW_HOLD_SECONDS, advanceEnemyBow } from "@elder-souls/game-core/ai/enemyBow";
import { COMBAT_TUNING, comboEntryTime, comboSuccessorStartTime, comboTransitionTime, criticalVictimDeathPlayback, criticalVictimPlaybackAt, criticalVictimRecoveryPlayback, isParryActive, isWeaponHitboxActive, parryActionDuration, phaseAt } from "@elder-souls/game-core/combat/weapon";
import { footAnchoredVelocity, hasGroundTrack, localMotionToWorld } from "@elder-souls/game-core/locomotion/footAnchoredMotion";
import { ENEMY_CONTACT_STOP_DISTANCE } from "./locomotionHelpers";
import { BOW_LOOSE_FACING_MAX_WAIT, BOW_LOOSE_FACING_TOLERANCE, aimEnemyBow, looseEnemyArrow } from "./enemyBow";

import type { MutableRefObject } from "react";
import type { ClipTiming } from "@elder-souls/game-core/anim/clipTiming";
import type { AnimationState, CombatAction } from "@elder-souls/game-core/core/types";
import type { EnemyMode } from "@elder-souls/game-core/combat/fighter";
import type { OverlapCounter } from "@elder-souls/game-core/combat/overlaps";
import type { HitShakeKind } from "@elder-souls/game-core/fx/cameraShake";
import type { AttackDefinition, WeaponDefinition } from "@elder-souls/game-core/equipment/types";
import type { GuardAnimationProfile } from "@elder-souls/game-core/equipment/types";
import type { VisualScenario, VisualScenarioDriver } from "@elder-souls/game-core/validation/visualScenarios";
import type { EnemyRuntime } from "./enemyRuntime";
import { ENEMY_FELLED_MESSAGE_DURATION, PARRY_HIT_GRACE_SECONDS, PLAYER_HURTBOX_NAME } from "./combatConstants";

/** World up, for yaw rotations. Module-private and never written. */
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Everything one enemy's frame reads from the encounter. The player's state
 * comes as refs, not values: an earlier enemy's blow can change the player's
 * action within the same frame, and a later enemy must see that.
 */
export type EnemyStepContext = {
  delta: number;
  playerPos: THREE.Vector3;
  enemyEnabled: boolean;
  enemyAiEnabled: boolean;
  footDrivenMotion: boolean;
  arrowGravityScale: number;
  visualScenario: VisualScenario | null;
  visualDriver: MutableRefObject<VisualScenarioDriver | null>;
  /** Scratch vectors owned by the runtime, reused every frame. */
  tmp: MutableRefObject<{ forward: THREE.Vector3; quaternion: THREE.Quaternion }>;
  playerAction: MutableRefObject<CombatAction>;
  playerActionTime: MutableRefObject<number>;
  playerAttack: MutableRefObject<AttackDefinition | null>;
  playerAttackHit: MutableRefObject<boolean>;
  playerWeapon: WeaponDefinition;
  playerGuardAnimations: GuardAnimationProfile;
  playerParryOverlaps: MutableRefObject<OverlapCounter>;
  playerWeaponOverlaps: MutableRefObject<OverlapCounter>;
  executionVictim: MutableRefObject<EnemyRuntime | null>;
  setEnemyMode: (e: EnemyRuntime, mode: EnemyMode, animation: AnimationState, startAt?: number, crossFadeDuration?: number | null) => void;
  setEnemyAnim: (e: EnemyRuntime, animation: AnimationState, startAt?: number, restart?: boolean, crossFadeDuration?: number | null, timing?: ClipTiming) => void;
  clearLockIfTarget: (e: EnemyRuntime) => void;
  announce: (text: string, duration?: number) => void;
  triggerShake: (kind: HitShakeKind, worldDirection?: { x: number; z: number }) => void;
  /** Resolve this enemy's blade against the player (`resolveHit`). */
  attemptEnemyHit: (e: EnemyRuntime) => void;
};

/**
 * One enemy's frame. Utility selection chooses a tactical intent; the state
 * machine below owns readable telegraphs, commitment, collision windows and
 * recovery. Every enemy runs this independently against the shared player.
 */
export function stepEnemy(ctx: EnemyStepContext, e: EnemyRuntime) {
  const {
    delta, playerPos, enemyEnabled, enemyAiEnabled, footDrivenMotion, arrowGravityScale, visualScenario, visualDriver, tmp,
    playerAction, playerActionTime, playerAttack, playerAttackHit, playerWeapon, playerGuardAnimations,
    playerParryOverlaps, playerWeaponOverlaps, executionVictim,
    setEnemyMode, setEnemyAnim, clearLockIfTarget, announce, triggerShake, attemptEnemyHit,
  } = ctx;
  const f = e.fighter;
  const archetype = f.archetype;
  const weapon = archetype.loadout.mainHand;
  f.actionTime += delta;
  f.decisionTimer -= delta;
  f.staminaCooldown -= delta;
  // A bleed keeps working between blows, and can finish what a blow
  // started: the death path below is the one any hit uses.
  const statusTick = tickStatusEffects(f.status, delta);
  f.status = statusTick.active;
  if (statusTick.damage > 0 && f.health > 0) {
    f.health = Math.max(0, f.health - statusTick.damage);
    if (f.health <= 0) {
      clearLockIfTarget(e);
      setEnemyMode(e, "dead", "DEATH");
      combatAudio.play("death");
      announce(text(CATALOGUE, "text.combat.enemy-felled"), ENEMY_FELLED_MESSAGE_DURATION);
    }
  }
  advancePoise(f.poise, delta);
  const enemyHandle = e.handle.current;
  const toPlayerX = playerPos.x - e.position.x;
  const toPlayerZ = playerPos.z - e.position.z;
  const distance = Math.hypot(toPlayerX, toPlayerZ) || 0.0001;
  const dirX = toPlayerX / distance;
  const dirZ = toPlayerZ / distance;
  let enemyMoveX = 0;
  let enemyMoveY = 0;
  let enemyRunning = false;
  const criticalVictimFrozen = f.state === "critical" || f.state === "criticalRecovery";
  if (f.state !== "shoot" && (e.nockVisible.current || e.bowFacingDelay > 0 || e.aimPitch.current !== 0)) {
    // Leaving the shot by any route (hit, stagger, death) drops the shaft
    // and the lean; the shot cycle itself resets these when it completes.
    e.nockVisible.current = false;
    e.bowFacingDelay = 0;
    e.aimPitch.current = 0;
    e.bowDrawFraction.current = 0;
  }
  // The fighter owns the desired yaw, while Ecctrl is the sole writer of
  // the live body's non-critical rotation. Ecctrl's lock-forward path
  // applies a damped Y-axis torque every physics step; force-setting the
  // same rigid-body rotation here every render frame resets that solve and
  // leaves its angular velocity fighting the teleport, which reads as run
  // and turn jitter. Critical/dead poses are the deliberate exception
  // below: they are frozen choreography, so they zero angular velocity and
  // pin one exact facing instead of asking the locomotion controller to
  // turn them.
  if (!(f.state === "dead" || criticalVictimFrozen)) {
    const targetYaw = Math.atan2(dirX, dirZ);
    const yawDelta = Math.atan2(Math.sin(targetYaw - f.yaw), Math.cos(targetYaw - f.yaw));
    const turnRates = archetype.locomotion.turnRate;
    const turnRate = f.state === "approach" || f.state === "withdraw"
      // Giving ground is walking backwards while still facing the threat,
      // so it turns at the same rate as closing does.
      ? turnRates.approach
      : f.state === "strafe"
        ? turnRates.strafe
        // Tracking a target with a drawn bow is the same act as watching
        // one. Leaving `shoot` at zero was why the archer could not even
        // turn to follow the player.
        : f.state === "watching" || f.state === "shoot"
          ? turnRates.watching
          : f.state === "recover"
            ? turnRates.recover
            : 0;
    f.yaw += THREE.MathUtils.clamp(yawDelta, -turnRate * delta, turnRate * delta);
  }
  if (enemyHandle) {
    const frozenYaw = criticalVictimFrozen ? f.criticalVictimYaw : f.yaw;
    if (criticalVictimFrozen || f.state === "dead") {
      tmp.current.forward.set(Math.sin(frozenYaw), 0, Math.cos(frozenYaw));
      enemyHandle.setForwardDir(tmp.current.forward);
      enemyHandle.setLockForward(true);
      enemyHandle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      tmp.current.quaternion.setFromAxisAngle(UP, frozenYaw);
      enemyHandle.body.setRotation(tmp.current.quaternion, true);
      // Position is frozen too, not just facing. The rotation was already
      // pinned here; leaving the translation to physics meant the attacker
      // arriving at its authored separation shoved the victim backwards,
      // so every paired critical landed further out than it was measured
      // to. See `Fighter.criticalVictimAnchor`.
      const anchor = f.criticalVictimAnchor;
      if (anchor) {
        enemyHandle.body.setTranslation({ x: anchor.x, y: e.position.y, z: anchor.z }, true);
        enemyHandle.body.setLinvel({ x: 0, y: enemyHandle.body.linvel().y, z: 0 }, true);
      }
    } else {
      tmp.current.forward.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      enemyHandle.setForwardDir(tmp.current.forward);
      enemyHandle.setLockForward(true);
      // And pinned outright. The controller's turning torque does not turn
      // a body that is not also moving — measured on the player in
      // bow-aim-turn and on the archer, whose `fighter.yaw` swung onto the
      // player while its body stayed put with only the nocked arrow
      // turning. `fighter.yaw` is already rate-limited, so this is the
      // turn the archetype asked for and nothing faster.
      enemyHandle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      tmp.current.quaternion.setFromAxisAngle(UP, f.yaw);
      enemyHandle.body.setRotation(tmp.current.quaternion, true);
    }
  }
  if (f.staminaCooldown <= 0 && !(f.state === "attack" || f.state === "guard" || f.state === "parry" || f.state === "dodge" || f.state === "backstep")) {
    f.stamina = Math.min(COMBAT_TUNING.maxStamina, f.stamina + COMBAT_TUNING.staminaRegenPerSecond * delta);
  }

  e.hitboxActive.current = false;
  e.parryActive.current = false;
  if (!enemyEnabled) {
    // The debug toggle removes the enemy bodies below and suspends state.
  } else if (!enemyAiEnabled && !visualScenario && f.health > 0 && !(f.state === "critical" || f.state === "criticalRecovery" || f.state === "stagger" || f.state === "parried")) {
    f.state = "watching";
    f.actionTime = 0;
    setEnemyAnim(e, weapon.animations.combatIdle);
  } else if (f.state === "watching" || f.state === "approach") {
    // Scenarios replace only the nondeterministic intent choice. Both
    // scripted and AI choices go through this one production dispatcher,
    // so a visual test cannot make an animation pass by setting it directly.
    const scriptedCue = visualScenario ? visualDriver.current?.takeEnemyCue() : null;
    let enemyIntent: EnemyIntent | null = scriptedCue?.intent ?? null;
    // Out at closing range, approach/strafe/lightCombo all score within
    // noise of each other, so re-deciding every 0.3s made the enemy swap
    // gait several times a second and stutter toward the player instead of
    // running at them. Keep closing while still far, and give whatever it
    // is already doing a commitment bonus once it is in range.
    const stillClosing = f.state === "approach"
      && distance > archetype.decision.closeWithoutRedecidingBeyond;
    if (!enemyIntent && enemyAiEnabled && f.decisionTimer <= 0 && !stillClosing) {
      const playerPhase = playerAttack.current ? phaseAt(playerActionTime.current, playerAttack.current) : "none";
      enemyIntent = selectEnemyIntent({
        distance,
        healthRatio: f.health / f.maxHealth,
        stamina: f.stamina,
        estus: f.estus,
        playerAction: playerAction.current,
        playerPhase,
        playerAttackReach: playerAttack.current?.range ?? playerWeapon.attacks.light1.range,
        playerRecovering: playerPhase === "recovery" || playerAction.current === "heal",
        personality: f.personality,
        previousIntent: f.lastIntent as EnemyIntent | null,
        commitmentBonus: archetype.decision.commitmentBonus,
        // Every distance the scoring uses is in units of this, so an
        // archer keeps its range and a spearman keeps its point out.
        tactics: loadoutTactics(archetype.loadout),
      });
      f.decisionTimer = archetype.decision.intervalSeconds
        + Math.random() * archetype.decision.intervalJitterSeconds;
    }
    if (enemyIntent) f.lastIntent = enemyIntent;
    if (enemyIntent) {
      if (enemyIntent === "lightCombo") {
        f.attack = weapon.attacks[scriptedCue?.attack ?? "light1"];
        f.comboRemaining = scriptedCue?.comboRemaining ?? archetype.decision.comboLength;
        f.stamina -= f.attack.stamina;
        f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
        setEnemyMode(e, "attack", f.attack.animation);
      } else if (enemyIntent === "heavy") {
        const scriptedHeavy = scriptedCue?.attack === "heavy" || scriptedCue?.attack === "heavy2"
          ? scriptedCue.attack
          : null;
        f.attack = weapon.attacks[scriptedHeavy ?? (Math.random() > 0.55 ? "heavy2" : "heavy")];
        f.comboRemaining = 0;
        f.stamina -= f.attack.stamina;
        f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
        setEnemyMode(e, "attack", f.attack.animation);
      } else if (enemyIntent === "guard") {
        setEnemyMode(e, "guard", activeGuardAnimations(archetype.loadout).enter);
      } else if (enemyIntent === "parry") {
        f.stamina -= COMBAT_TUNING.parryCost;
        f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
        setEnemyMode(e, "parry", activeGuardAnimations(archetype.loadout).parry.intro);
      } else if (enemyIntent === "dodge") {
        const side = scriptedCue?.side ?? (Math.random() > 0.5 ? 1 : -1);
        e.dodgeDirection.set(dirZ * side, 0, -dirX * side);
        f.stamina -= COMBAT_TUNING.rollCost;
        f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
        setEnemyMode(e, "dodge", "ROLL");
        combatAudio.play("roll");
      } else if (enemyIntent === "backstep") {
        e.dodgeDirection.set(-dirX, 0, -dirZ);
        f.stamina -= COMBAT_TUNING.backstepCost;
        f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
        // Decide up front whether this retreat is a reset or a feint into
        // the dash-in attack, so the follow-up is telegraphed by the same
        // stamina reservation the player has to make.
        e.backstepAttackQueued.current = !scriptedCue
          && f.stamina >= weapon.attacks.light1.stamina
          && Math.random() < archetype.decision.backstepAttackChance;
        setEnemyMode(e, "backstep", "BACKSTEP");
        combatAudio.play("roll");
      } else if (enemyIntent === "heal") {
        f.estus -= 1;
        f.healed = false;
        setEnemyMode(e, "heal", "HEAL");
      } else if (enemyIntent === "strafe") {
        f.strafeSide = scriptedCue?.side ?? (Math.random() > 0.5 ? 1 : -1);
        setEnemyMode(e, "strafe", f.strafeSide < 0 ? "STRAFE_LEFT" : "STRAFE_RIGHT");
      } else if (enemyIntent === "shoot") {
        setEnemyMode(e, "shoot", "BOW_DRAW");
      } else if (enemyIntent === "withdraw") {
        setEnemyMode(e, "withdraw", "BOW_WALK_BACK");
      } else {
        f.state = "approach";
        setEnemyAnim(e, "WALK");
      }
    }
    if (f.state === "approach") {
      enemyMoveY = 1;
      // Hysteresis, not one threshold: an enemy hovering on a single
      // distance flipped between the run and walk clip every frame.
      const gait = archetype.locomotion;
      enemyRunning = e.running.current
        ? distance > gait.walkBelowDistance
        : distance > gait.runAboveDistance;
      e.running.current = enemyRunning;
      setEnemyAnim(e, enemyRunning ? gait.runAnimation : gait.walkAnimation);
    } else if (f.state === "watching") {
      setEnemyAnim(e, weapon.animations.combatIdle);
    }
  } else if (f.state === "strafe") {
    enemyMoveX = f.strafeSide;
    // An archer strafes on its own set: the bow-carry strafe with the
    // string at rest, the drawn strafe if it is repositioning mid-draw.
    // It used to strafe on the shared (sword) clips, which put the bow
    // through the body.
    const bowStrafe = weapon.animations.bow
      ? bowLocomotionClip(
        weapon.animations.bow,
        f.strafeSide < 0 ? "strafeLeft" : "strafeRight",
        e.bowDrawFraction.current > 0,
      )
      : null;
    setEnemyAnim(e, bowStrafe ?? (f.strafeSide < 0
      ? archetype.locomotion.strafeAnimations.left
      : archetype.locomotion.strafeAnimations.right));
    if (f.actionTime > archetype.stateDurations.strafe) {
      setEnemyMode(e, "watching", weapon.animations.combatIdle);
    }
  } else if (f.state === "shoot") {
    // The shot cycle: draw, hold at full draw so the player can read it,
    // loose, recover. Without this the archer entered `shoot`, played the
    // first frame of BOW_DRAW and stood there forever — the state was
    // emitted by the AI and never implemented.
    const ranged = weapon.stats.ranged;
    if (!ranged) {
      setEnemyMode(e, "watching", weapon.animations.combatIdle);
    } else {
      // A bow shoots where it points. While the archer is still turning
      // onto the player, the full-draw hold is stretched (up to a limit)
      // so the loose waits for the facing instead of leaving sideways.
      const targetYaw = Math.atan2(dirX, dirZ);
      const facingError = Math.abs(Math.atan2(Math.sin(targetYaw - f.yaw), Math.cos(targetYaw - f.yaw)));
      const holdEnds = ranged.drawSeconds + ENEMY_BOW_HOLD_SECONDS;
      const bowTime = f.actionTime - e.bowFacingDelay;
      if (bowTime >= holdEnds && facingError > BOW_LOOSE_FACING_TOLERANCE
        && e.bowFacingDelay < BOW_LOOSE_FACING_MAX_WAIT) {
        e.bowFacingDelay += delta;
      }
      const elapsed = f.actionTime - e.bowFacingDelay;
      const step = advanceEnemyBow(elapsed, elapsed - delta, ranged);
      setEnemyAnim(e, step.animation);
      aimEnemyBow(e, ranged, playerPos, arrowGravityScale);
      e.bowDrawFraction.current = step.phase === "draw"
        ? THREE.MathUtils.clamp((elapsed / Math.max(1e-3, ranged.drawSeconds) - 0.56) / 0.44, 0, 1)
        : step.phase === "hold" ? 1 : 0;
      // The shaft appears when the hand comes back off the quiver, the
      // same point in the same clip the player's does — before that the
      // archer was holding an arrow that had not been drawn yet.
      e.nockVisible.current = step.phase === "hold"
        || (step.phase === "draw" && elapsed / ranged.drawSeconds >= NOCK_REVEAL_FRACTION);
      if (step.loosed) {
        e.bowRelease.current += 1;
        looseEnemyArrow(e, ranged, distance, Boolean(visualScenario));
      }
      if (step.phase === "done") {
        f.decisionTimer = 0;
        e.bowFacingDelay = 0;
        e.aimPitch.current = 0;
        setEnemyMode(e, "watching", weapon.animations.combatIdle);
      }
    }
  } else if (f.state === "withdraw") {
    // Backing away to re-open the range a bow needs. Also never implemented,
    // which is the other half of why the archer never moved: an archer
    // decides `shoot` or `withdraw` almost every time, and neither branch
    // existed, so nothing ever set its joystick.
    enemyMoveY = -1;
    setEnemyAnim(e, weapon.animations.bow
      ? bowLocomotionClip(weapon.animations.bow, "walkBack", e.bowDrawFraction.current > 0)
      : "BOW_WALK_BACK");
    // Stop as soon as the standoff the weapon itself asks for is restored,
    // rather than backing away for a fixed time regardless.
    const standoff = loadoutTactics(archetype.loadout).standoffRange;
    if (f.actionTime > archetype.stateDurations.strafe || (standoff !== null && distance > standoff)) {
      f.decisionTimer = 0;
      setEnemyMode(e, "watching", weapon.animations.combatIdle);
    }
  } else if (f.state === "attack") {
    const attack = f.attack ?? weapon.attacks.light1;
    const phase = phaseAt(f.actionTime, attack);
    const weaponActive = isWeaponHitboxActive(f.actionTime, attack);
    const transitionAt = comboTransitionTime(attack);
    e.hitboxActive.current = weaponActive && f.health > 0;
    if (phase === "windup" && f.actionTime <= delta * 1.5) combatAudio.play("swing");
    if (
      enemyHandle
      && footDrivenMotion
      && hasGroundTrack(attack.animation)
      // Only once it is already in range. An enemy's lunge is doing two
      // jobs at once: making the swing look like it travels, and closing
      // the last half-metre so the blade arrives. Foot-driven motion
      // replaces the first and cannot replace the second — a clip whose
      // sole stays planted moves the actor by almost nothing, which is
      // exactly the point for the player, who aims their own attacks, and
      // exactly wrong for an enemy that has to reach.
      //
      // So the threshold decides which job is being done, once, when the
      // swing starts (`attackFromFeet`). Beyond it the enemy is closing
      // and keeps the authored lunge; inside it, where nothing needs
      // closing and the look is all that is left, the feet drive.
      && e.attackFromFeet
    ) {
      // Runs for the whole action rather than only the wind-up, which is
      // the point of taking the movement from the feet.
      // The whole track, same rule as the player's swing above — except
      // that feet cannot walk through a body: once the capsules touch,
      // the forward part stops rather than pressing into the player.
      const step = footAnchoredVelocity(attack.animation, f.actionTime, delta);
      const forward = step.forward > 0 && distance <= ENEMY_CONTACT_STOP_DISTANCE ? 0 : step.forward;
      const motion = localMotionToWorld({ ...step, forward }, { x: dirX, z: dirZ });
      enemyHandle.body.setLinvel({ ...motion, y: enemyHandle.body.linvel().y }, true);
    } else if (phase === "windup" && !e.attackFromFeet && enemyHandle) {
      // The lunge closes to the threshold and stops there; carrying on
      // drove the capsules into contact.
      const closing = distance > archetype.lungeBeyondDistance;
      enemyHandle.body.setLinvel({
        x: closing ? dirX * attack.lunge : 0,
        y: enemyHandle.body.linvel().y,
        z: closing ? dirZ * attack.lunge : 0,
      }, true);
    }
    if (
      weaponActive
      // A swing has ONE outcome. Without this gate a blade that reached
      // the torso a frame before it reached the parry volume both dealt
      // its damage and then announced a successful clash — hit AND parried
      // from the same attack, which is the reported wrongness.
      && !f.attackHit
      && playerAction.current === "parry"
      && isParryActive(playerActionTime.current, playerGuardAnimations.parry)
      // Same Souls rule as the enemy's parry above: while the catch is
      // active, a blade that reaches the body is caught too.
      && (
        playerParryOverlaps.current.has(e.weaponName)
        || playerWeaponOverlaps.current.has(e.weaponName)
        || e.overlaps.current.has(PLAYER_HURTBOX_NAME)
      )
    ) {
      setEnemyMode(e, "parried", weapon.animations.guardBreak);
      if (enemyHandle) {
        enemyHandle.body.setLinvel(blockRecoilVelocity(
          e.position,
          playerPos,
          enemyHandle.body.linvel().y,
          PARRY_RECOIL_SPEED,
        ), true);
      }
      combatAudio.play("parry");
      announce(text(CATALOGUE, "text.combat.weapons-clashed"), 1.5);
      triggerShake("parry", { x: playerPos.x - e.position.x, z: playerPos.z - e.position.z });
    } else if (
      weaponActive
      && (
        (playerAction.current === "guard" && e.overlaps.current.has("player-weapon"))
        || e.overlaps.current.has(PLAYER_HURTBOX_NAME)
      )
    ) {
      // The one-outcome rule needs the parry to be able to WIN the race:
      // sensor contact order is a frame lottery, and a blade routinely
      // touches the torso one physics step before it reaches the parry
      // volume. While the catch is active a bare hit therefore waits a
      // short grace for the clash to register; if the blade never crosses
      // the guard, the hit lands as normal. This is a race-tiebreak, not
      // invulnerability.
      const parryCatchActive = playerAction.current === "parry"
        && isParryActive(playerActionTime.current, playerGuardAnimations.parry);
      if (parryCatchActive && e.parryContactGrace < PARRY_HIT_GRACE_SECONDS) {
        e.parryContactGrace += delta;
      } else {
        attemptEnemyHit(e);
      }
    } else {
      e.parryContactGrace = 0;
    }
    const nextCombo = f.comboRemaining === 2
      ? weapon.attacks.light2
      : f.comboRemaining === 1
        ? weapon.attacks.light3
        : null;
    if (nextCombo && f.actionTime >= transitionAt && f.stamina >= nextCombo.stamina && distance < archetype.comboFollowUpRange) {
      f.comboRemaining -= 1;
      f.stamina -= nextCombo.stamina;
      f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
      const successorStart = comboEntryTime(nextCombo) + comboSuccessorStartTime(f.actionTime, attack);
      f.attack = nextCombo;
      setEnemyMode(e, "attack", nextCombo.animation, successorStart);
      combatAudio.play("swing");
    } else if (phase === "none") {
      f.comboRemaining = 0;
      setEnemyMode(e, "recover", weapon.animations.combatIdle);
    }
  } else if (f.state === "guard") {
    e.hitboxActive.current = true;
    const holdingScenarioPrerequisite = visualScenario?.enemy.holdInitialState
      && f.state === visualScenario.enemy.state
      && !playerAttackHit.current;
    const guardStep = resolveEnemyGuardVisualStep({
      actionTime: f.actionTime,
      currentAnimation: e.animCommand.current.state,
      guardHitUntil: e.guardHitUntil,
      holdInitialState: Boolean(holdingScenarioPrerequisite),
      tacticalDuration: enemyGuardTacticalDuration(archetype.stateDurations.guard),
    });
    if (guardStep.shouldExit) {
      setEnemyMode(e, "watching", weapon.animations.combatIdle);
    } else if (guardStep.nextAnimation) {
      setEnemyAnim(e, guardStep.nextAnimation);
    }
  } else if (f.state === "parry") {
    const parryActive = isParryActive(f.actionTime, activeGuardAnimations(archetype.loadout).parry);
    e.hitboxActive.current = parryActive;
    e.parryActive.current = parryActive;
    const enemyParry = activeGuardAnimations(archetype.loadout).parry;
    if (f.actionTime >= (clipConfig(enemyParry.intro).sourceDuration ?? 0.83)) {
      setEnemyAnim(e, enemyParry.followThrough);
    }
    if (f.actionTime > parryActionDuration(enemyParry)) {
      setEnemyMode(e, "recover", weapon.animations.combatIdle);
    }
  } else if (f.state === "dodge" || f.state === "backstep") {
    const duration = f.state === "dodge" ? COMBAT_TUNING.rollDuration : 0.52;
    const initialSpeed = f.state === "dodge"
      ? archetype.dodgeSpeed.roll
      : archetype.dodgeSpeed.backstep * BACKSTEP_DISTANCE_MULTIPLIER;
    const progress = Math.min(1, f.actionTime / duration);
    if (enemyHandle) {
      const speed = initialSpeed * (1 - progress) ** 1.25;
      enemyHandle.body.setLinvel({
        x: e.dodgeDirection.x * speed,
        y: enemyHandle.body.linvel().y,
        z: e.dodgeDirection.z * speed,
      }, true);
    }
    if (f.actionTime >= duration) {
      if (f.state === "backstep" && e.backstepAttackQueued.current) {
        // Same exchange the player gets: give ground, then buy it back with
        // a committed swing. The wind-up lunge covers the agreed fraction
        // of the retreat.
        const dash = weapon.attacks.light1;
        e.backstepAttackQueued.current = false;
        f.attack = dash;
        f.comboRemaining = 0;
        f.stamina -= dash.stamina;
        f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
        setEnemyMode(e, "attack", dash.animation);
        combatAudio.play("swing");
      } else {
        e.backstepAttackQueued.current = false;
        setEnemyMode(e, "recover", weapon.animations.combatIdle);
      }
    }
  } else if (f.state === "heal") {
    if (f.actionTime > 0.82 && !f.healed) {
      f.healed = true;
      f.health = Math.min(f.maxHealth, f.health + COMBAT_TUNING.healAmount);
      combatAudio.play("heal");
    }
    if (f.actionTime > COMBAT_TUNING.healDuration) {
      setEnemyMode(e, "recover", weapon.animations.combatIdle);
    }
  } else if (f.state === "recover" && f.actionTime > archetype.stateDurations.recover) {
    f.decisionTimer = 0;
    // Recovery already entered the combat-idle clip. Changing only the
    // tactical state must not invisibly restart that same animation and
    // create a pose/time discontinuity in an otherwise continuous hold.
    f.state = "watching";
    f.actionTime = 0;
    f.attackHit = false;
    e.guardHitUntil = 0;
    setEnemyAnim(e, weapon.animations.combatIdle);
  } else if (f.state === "stagger" && f.actionTime > f.staggerDuration) {
    setEnemyMode(e, "recover", weapon.animations.combatIdle);
  } else if (f.state === "recoil" && f.actionTime > BLOCK_RECOIL_DURATION) {
    f.decisionTimer = 0.2;
    setEnemyMode(e, "watching", weapon.animations.combatIdle);
  } else if (f.state === "parried"
    && !(visualScenario?.enemy.holdInitialState && f.state === visualScenario.enemy.state)
    && f.actionTime > ENEMY_SHARED_DURATIONS.parried) {
    setEnemyMode(e, "recover", weapon.animations.combatIdle);
  } else if (f.state === "critical") {
    // The ATTACKER's profile, taken at initiation. The victim's own weapon
    // is only a fallback for a critical that predates the stored pair.
    const criticalAttack = e.criticalByAttack
      ?? (f.criticalType === "riposte" ? weapon.attacks.riposte : weapon.attacks.backstab);
    const criticalPair = e.criticalByPair
      ?? (f.criticalType === "riposte" ? weapon.animations.riposte : weapon.animations.backstab);
    const victimPlayback = criticalVictimPlaybackAt(playerActionTime.current, criticalAttack, criticalPair);
    const victimDeath = criticalVictimDeathPlayback(criticalPair);
    const victimRecovery = criticalVictimRecoveryPlayback(criticalPair);
    const outcomeTime = (criticalAttack.windup + criticalAttack.active + criticalAttack.recovery)
      * criticalPair.victimOutcomeProgress;
    if (victimPlayback.phase === "leadIn") {
      // Keep the exact parry pose at which the riposte took ownership. The
      // victim clock must not recover while the attacker winds up, and it
      // must not rewind to a canned frame merely because the FSM changed.
      f.actionTime = e.criticalLeadInTime;
    } else {
      // The attacker clock is authoritative for both roles until outcome
      // ownership transfers. The enemy loop increments earlier in this
      // frame, and a victim entered from the input half of the previous
      // frame would otherwise retain a free-frame lead: BACKSTABBED then
      // reached idle one sample before BACKSTAB ended. Re-synchronising
      // the reaction every paired frame also preserves exact HIT1 source
      // continuity through riposte hit-stop.
      f.actionTime = victimPlayback.startAt;
      if (e.animCommand.current.state !== victimPlayback.action) {
        setEnemyAnim(e, victimPlayback.action, victimPlayback.startAt, true);
      }
    }
    // The attacker's clock remains authoritative for the data-driven
    // outcome dispatch. A true paired clip may keep its victim recoil
    // after physical alignment releases at blade withdrawal.
    if (playerActionTime.current >= outcomeTime && playerAttackHit.current) {
      if (f.health <= 0) {
        clearLockIfTarget(e);
        setEnemyMode(e, "dead", victimDeath.action, victimDeath.startAt, victimDeath.crossFadeDuration);
        f.criticalType = null;
        e.criticalByPair = null;
        e.criticalByAttack = null;
        combatAudio.play("death");
        announce(text(CATALOGUE, "text.combat.enemy-felled"), ENEMY_FELLED_MESSAGE_DURATION);
      } else {
        // Transfer FSM ownership into one complete authored outcome. If
        // the reaction already is that outcome (both current nonlethal
        // criticals), preserve its source clock and active entry blend.
        if (e.animCommand.current.state === victimRecovery.action) {
          f.state = "criticalRecovery";
          f.attackHit = false;
          e.guardHitUntil = 0;
        } else {
          setEnemyMode(e, "criticalRecovery", victimRecovery.action, victimRecovery.startAt, victimRecovery.crossFadeDuration);
        }
      }
    }
  } else if (f.state === "criticalRecovery" && f.health > 0) {
    const criticalPair = e.criticalByPair
      ?? (f.criticalType === "riposte" ? weapon.animations.riposte : weapon.animations.backstab);
    const victimRecovery = criticalVictimRecoveryPlayback(criticalPair);
    if (f.actionTime >= victimRecovery.endAt) {
      f.criticalType = null;
      e.criticalByPair = null;
      e.criticalByAttack = null;
      if (executionVictim.current === e) executionVictim.current = null;
      setEnemyMode(e, "recover", weapon.animations.combatIdle);
    }
  }
  enemyHandle?.setMovement({ joystick: { x: enemyMoveX, y: enemyMoveY }, run: enemyRunning, jump: false });
  // A stride authored for one ground speed scrubs at any other, and an
  // enemy that changes gait mid-approach changes speed sharply. Following
  // the measured authored speed keeps the contact cadence honest.
  e.animationSpeed.current = locomotionSpeedMultiplier(
    e.animCommand.current.state,
    e.moveSpeed.current,
  );
  if (enemyHandle && (f.state === "critical" || f.state === "criticalRecovery" || f.state === "dead")) {
    enemyHandle.body.setLinvel({ x: 0, y: enemyHandle.body.linvel().y, z: 0 }, true);
  }
  e.actionTimeRef.current = f.actionTime;
  e.previousActionTime = f.actionTime;
}
