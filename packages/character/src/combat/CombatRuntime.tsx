import { bowSight } from "@elder-souls/game-core/combat/bowSight";
import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import { bowShoulderPosition } from "@elder-souls/game-core/camera/bowCamera";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { EcctrlHandle } from "ecctrl";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAnimationCommand, updateAnimationCommand } from "@elder-souls/game-core/anim/animationCommand";
import { clipAuthoredGroundSpeed, clipConfig, clipPlaybackDuration, clipPlaybackSourceSpan } from "@elder-souls/game-core/anim/animationManifest";
import { landingAnimationSpeed, selectLandingAnimation } from "@elder-souls/game-core/anim/landing";
import { combatAudio } from "@elder-souls/game-core/fx/audio";
import { PARRY_RECOIL_SPEED, blockRecoilVelocity, guardCovers, resolveGuardImpact } from "@elder-souls/game-core/combat/blockReaction";
import { createHitShake, sampleHitShake, type HitShakeImpulse, type HitShakeKind } from "@elder-souls/game-core/fx/cameraShake";
import { isHeavyAttack, resolveHit } from "@elder-souls/game-core/combat/resolveHit";
import { resetFighter, type EnemyMode } from "@elder-souls/game-core/combat/fighter";
import { CombatEventBus } from "@elder-souls/game-core/combat/events";
import { ACTION_DURATIONS, BACKSTEP_ATTACK_DASH_FRACTION, PLAYER_DODGE_SPEED, RIPOSTE_WINDOW } from "@elder-souls/game-core/combat/tuning";
import { useEquippedArrow, useEquippedLoadout, useInventoryStore, useWornArmour, wornArmourFor } from "@elder-souls/game-core/inventory/store";
import { IDLE_BOW_CYCLE, advanceBowCycle, aimBlend, bowPose, bowTravelFor, isAiming, nockedArrowVisible, type BowCycle } from "@elder-souls/game-core/combat/bowShot";
import { AIM_CONVERGENCE_FAR_METERS, aimAngles, aimConvergencePoint, angleBetweenDegrees, directionTo } from "@elder-souls/game-core/combat/aimConvergence";
import { NEUTRAL_RANGED_MODIFIERS, launchSpeed, resolveArrowImpact } from "@elder-souls/game-core/combat/ballistics";
import { REFERENCE_ATTRIBUTES, marksmanModifiers, meleeModifiers } from "@elder-souls/game-core/stats/modifiers";
import { meleeSkillFor } from "@elder-souls/game-core/equipment/weaponSkill";
import type { WeaponClass } from "@elder-souls/game-core/equipment/types";
import { NEUTRAL_MELEE_MODIFIERS, applyMeleeModifiers } from "@elder-souls/game-core/combat/modifiers";
import { applyStatusEffects, tickStatusEffects, type ActiveStatusEffect } from "@elder-souls/game-core/combat/statusEffects";
import { WEAPON_CLASSES } from "@elder-souls/game-core/equipment/weaponClasses";
import { hitZoneForBone } from "@elder-souls/game-core/combat/hitZones";
import { isActorCapsuleName, nearestHurtboxBone, stickArrow } from "@elder-souls/game-core/combat/stuckArrows";
import { traceArrowSurface } from "@elder-souls/game-core/combat/arrowSurface";
import { Arrows, type ArrowHit, type ArrowTrace } from "../Arrows";
import { totalArmourRating } from "@elder-souls/game-core/equipment/armour";
import { clearArrows, fireArrow, useArrowStore } from "@elder-souls/game-core/combat/arrowStore";
import { usePlayerBuild } from "@elder-souls/game-core/actors/raceStore";
import { enemyArchetypeById } from "@elder-souls/game-core/actors/enemyArchetypes";
import { activeGuardAnimations, activeGuardProfile } from "@elder-souls/game-core/equipment/guard";
import { loadoutAnimationPacks } from "@elder-souls/game-core/equipment/animationPacks";
import { resolveAnimationPacks } from "@elder-souls/game-core/anim/animationManifest";
import { SWIM_FEET_REACH, SWIM_REFERENCE_SPEED, SWIM_SAMPLE_ABOVE_BODY_CENTRE, swimClipFor, swimSprint, swimStateFor, swimStrokeRate, swimVelocity } from "@elder-souls/game-core/locomotion/swim";
import { submergedAt } from "@elder-souls/game-core/physics/waterSampler";
import { CROUCH_SPEED, crouchLocomotionAnimation, nextStance, type Stance } from "@elder-souls/game-core/locomotion/stance";
import { ARROW_POISE_DAMAGE, advancePoise, applyPoiseDamage, attackPoiseDamage, createPoise, refreshPoise, resetPoise, type PoiseState } from "@elder-souls/game-core/combat/poise";
import { MIN_AUTHORED_GROUND_SPEED, locomotionSpeedMultiplier } from "@elder-souls/game-core/anim/locomotionCadence";
import { BASE_FIELD_OF_VIEW, CHARACTER_BODY_CENTER_HEIGHT, CHARACTER_CHEST_ABOVE_BODY_CENTRE, CHARACTER_MODEL_OFFSET, JUMP_LAUNCH_ANIMATION_DURATION } from "@elder-souls/game-core/physics/characterPhysics";
import { PLAYER_LOCK_ON_WALK_SPEED, PLAYER_WALK_SPEED, analogueMoveSpeed, cameraRelativeDirection, input, resolveAttackDirection } from "@elder-souls/game-core/io/input";
import { inputToIntent, swimmingIntent } from "@elder-souls/game-core/combat/intent";
import { loadoutCombatIdle, resolveDualWield } from "@elder-souls/game-core/equipment/movesets/dualWield";
import { carriedLightIntensity, igniteCarriedLight, tickCarriedLight, type CarriedLightState } from "@elder-souls/game-core/fx/carriedLight";
import { CarriedLight } from "../CarriedLight";
import { lockOnOrientationWarp, lockOnSprintAllowed, lockOnYaws } from "@elder-souls/game-core/anim/lockOn";
import type { CombatRuntimeHost } from "./host";
import { attackClipTiming, UNIT_CLIP_TIMING, type ClipTiming } from "@elder-souls/game-core/anim/clipTiming";
import "./visualTelemetry";
import type { AnimationState, CombatAction } from "@elder-souls/game-core/core/types";
import type { AttackDefinition, WeaponDefinition } from "@elder-souls/game-core/equipment/types";
import { COMBAT_TUNING, attackDuration, comboCrossFadeDuration, comboEntryTime, comboQueueOpen, comboSuccessorStartTime, comboTransitionTime, criticalVictimPlaybackAt, getComboSuccessor, hitReactionForAttack, isBackstabPosition, isParryActive, isRollInvulnerable, isWeaponHitboxActive, parryActionDuration, phaseAt } from "@elder-souls/game-core/combat/weapon";
import { PARRY_VOLUME_MARGIN_METERS } from "@elder-souls/game-core/combat/hitVolume";
import { footAnchoredLoopVelocity, footAnchoredSourceVelocity, footAnchoredVelocity, hasGroundTrack, localMotionToWorld } from "@elder-souls/game-core/locomotion/footAnchoredMotion";
import { lockedStrideClip, lockedStrideRateFor, strideRateForMagnitude } from "@elder-souls/game-core/locomotion/lockedStride";
import { executionAnchor, executionBladeIntersectsVictim, executionFacingYaw } from "@elder-souls/game-core/anim/weaponMotion";
import { VisualScenarioDriver, type VisualScenario } from "@elder-souls/game-core/validation/visualScenarios";
import { VISUAL_FRAME_PHASE_PRIORITY, publishVisualFrameMarker, visualFrameMarkerIndex } from "@elder-souls/game-core/validation/visualFrameMarker";
import { createActorVisualProbe } from "@elder-souls/game-core/validation/actorVisualMetrics";
import { OverlapCounter } from "@elder-souls/game-core/combat/overlaps";
import { canBackstabState } from "@elder-souls/game-core/combat/backstab";
import { FirstPersonBow, type FirstPersonBowState } from "../FirstPersonBow";
import { SkeletalHurtbox, hasSkeletalHurtbox, type HurtboxBone } from "../SkeletalHurtbox";
import { PlayerBody } from "../PlayerBody";
import { EcctrlAdapter } from "../EcctrlAdapter";
import { SkyrimFighter, type SoleBoneRefs } from "../SkyrimFighter";
import { useStanceCapsule } from "../useStanceCapsule";
import * as THREE from "three";
import { AIM_EYE_AHEAD_METERS, AIM_EYE_RIGHT_METERS, AIM_FIELD_OF_VIEW, AIM_LOOK_DISTANCE_METERS, AIM_MOVE_SPEED, AIM_MOVE_SPEED_CEILING, AIM_NEAR_CLIP_METERS, AIM_PITCH_LIMIT, AIM_ZOOM_PER_WHEEL_NOTCH, AIM_ZOOM_SECONDS, ARROW_SPAWN_AHEAD_METERS, BASE_NEAR_CLIP_METERS, PLAYER_EYE_OFFSET_Y, aimDirectionInto, aimFieldOfView } from "./aimRig";
import { STRIDE_RUN_ABOVE_MAGNITUDE, STRIDE_WALK_ABOVE_MAGNITUDE, TRACK_LATERAL_SIGN, lockedWeaponClip, rotateBodyAroundSole } from "./locomotionHelpers";
import { DEFAULT_ENEMY_SPAWNS, type EnemyRuntime, createEnemyRuntime, enemyGuardCovers, parryObjectRef } from "./enemyRuntime";
import { ARCHER_AIM_ABOVE_CENTRE, COMMITTED_BOW_FOOTWORK } from "./enemyBow";
import { AnalogueSpeedLimiter } from "./AnalogueSpeedLimiter";
import { CapsuleHurtbox, HeldObjectHitbox } from "./HeldObjectHitbox";
import { BackstabZoneIndicator } from "./BackstabZoneIndicator";
import { EnemyActor } from "./EnemyActor";
import { useCarriedAssetWarmup } from "./useCarriedAssetWarmup";
import { stepEnemy, type EnemyStepContext } from "./enemyStep";
import { detectionReadout, locomotionNoise, louder, resetAwareness, sneakAttackMultiplier, stepStealth, strikeAwareness } from "./stealthStep";
import { ViewConeIndicator } from "./ViewConeIndicator";
import { NOISE_LOUDNESS } from "@elder-souls/game-core/perception/noise";
import { ENEMY_FELLED_MESSAGE_DURATION, PARRY_HIT_GRACE_SECONDS, PLAYER_HURTBOX_NAME } from "./combatConstants";

/** The off-hand blade's sensor name (dual wield). */
const PLAYER_OFF_HAND_WEAPON = "player-offhand-weapon";

/** World up, for yaw rotations. Module-private and never written. */
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The skill curves are a switch, not a default. Off, every modifier is neutral
 * — the calibrated feel the visual scenarios were tuned against; on, the two
 * sliders drive the stats model's curves (`stats/modifiers`, module 76 §118)
 * at the reference attributes. Pure reads, no state.
 */
function playerRangedModifiers(skillsEnabled: boolean, marksmanSkill: number) {
  return skillsEnabled ? marksmanModifiers(marksmanSkill) : NEUTRAL_RANGED_MODIFIERS;
}

function playerMeleeModifiers(skillsEnabled: boolean, meleeSkill: number, weaponClass: WeaponClass) {
  if (!skillsEnabled) return NEUTRAL_MELEE_MODIFIERS;
  const mods = meleeModifiers(meleeSkillFor(weaponClass), meleeSkill);
  return { damagePosition: mods.damagePosition, staminaCost: mods.staminaCost, strength: mods.strength };
}

/** Nothing worn. Frozen and shared so it never changes the actor's identity. */
const NO_WORN_ARMOUR = Object.freeze([]) as readonly never[];

/**
 * How long a riposte pressed during the parry stays queued.
 *
 * Long enough to cover the rest of the parry clip and the opening of the
 * reward window; short enough that it cannot resurface as a swing the player
 * has stopped wanting.
 */
const RIPOSTE_QUEUE_WINDOW = 0.7;
/**
 * How far under a swimmer the floor is looked for, metres: deep enough to find
 * a pool floor or a riverbed, so the model's support plane is the real bottom.
 */
const SWIM_FLOOR_SEARCH_METERS = 12;
/**
 * After a swim, how long the floor ray stands in for ecctrl's ground report,
 * seconds: ecctrl is switched back on through a React render, and until its
 * first frame its report is the one it froze with on entry.
 */
const SWIM_EXIT_GRACE_SECONDS = 0.15;


const INITIAL_RENDERED_STATE = {
  lockedOn: false,
  lockedTarget: -1,
  playerAction: "idle" as CombatAction,
  aiming: false,
};

/** The sandbox arena's layout: the player south of centre, enemies to the north. */
const DEFAULT_ENCOUNTER_LAYOUT: EncounterLayout = {
  playerStart: [0, CHARACTER_BODY_CENTER_HEIGHT, 5.5],
  playerYaw: Math.PI,
  enemySpawns: DEFAULT_ENEMY_SPAWNS.map((spawn) => [spawn.x, spawn.y, spawn.z] as const),
};

/**
 * Where the encounter stands, in the host's world. Body-centre heights: a
 * spawn is the capsule centre (`CHARACTER_BODY_CENTER_HEIGHT` above the floor).
 */
export type EncounterLayout = {
  playerStart: readonly [number, number, number];
  /** Radians; π faces the player north (toward -Z). */
  playerYaw: number;
  /** One per enemy slot; `settings.enemyCount` takes the leading ones. */
  enemySpawns: readonly (readonly [number, number, number])[];
};

export type CombatRuntimeProps = CombatRuntimeHost & {
  /** A scripted validation scene, or null for free play. */
  visualScenario?: VisualScenario | null;
  /** Spawn points; the sandbox arena's when omitted. A scenario overrides both. */
  layout?: EncounterLayout;
};

/**
 * The combat encounter: the player's rig, stance, camera, lock-on and bow, the
 * enemies and their AI, and hit resolution, advanced by one frame loop. Mount
 * inside a Rapier `<Physics>` world beside the host's ground; see README.md.
 */
export function CombatRuntime({
  settings,
  publish,
  onArrowSample,
  lightEnvironment,
  water,
  visualScenario = null,
  layout = DEFAULT_ENCOUNTER_LAYOUT,
}: CombatRuntimeProps) {
  // Frame-loop reads go through the ref: the loop is created once per render,
  // and a slider must reach it without restarting anything.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  /** The player's Sneak skill: a stealth scene's own, else the host's (decision 0092). */
  const sneakSkillFor = useCallback(
    () => visualScenario?.stealth?.sneakSkill ?? settingsRef.current.sneakSkill,
    [visualScenario],
  );
  const inventoryOpen = useInventoryStore((state) => state.open) && !visualScenario;
  // The player's equipped kit. Every moveset, animation and socket the player
  // uses comes from here, so equipping something in the inventory swaps all of
  // them — including what a raised guard is made of.
  const playerBuild = usePlayerBuild();
  // Evidence-only staging: a fixed camera and a stripped body, so a contact
  // sheet re-shot after an appearance change is a real pixel diff.
  const portrait = visualScenario?.portrait ?? null;
  const playerLoadout = useEquippedLoadout();
  const playerArmour = useWornArmour();
  // A portrait wears nothing unless the shot asked for one piece by id — a seam
  // sheet judges how a single cuirass meets the body, and the inventory the
  // sandbox happens to start with would put four unasked-for pieces in frame.
  const portraitArmour = useMemo(
    () => {
      if (!portrait?.armourItemId) return NO_WORN_ARMOUR;
      const worn = wornArmourFor([portrait.armourItemId]);
      // Silence here would ship a sheet of bare necks that looked like a pass.
      if (!worn.length) throw new Error(`Portrait: "${portrait.armourItemId}" is not wearable armour`);
      return worn;
    },
    [portrait?.armourItemId],
  );
  const playerQuiver = useEquippedArrow();
  // The physics world, for the crosshair ray: where the sight line lands is
  // what the shot is aimed at.
  const { rapier, world, rigidBodyStates } = useRapier();
  // Validation runs a fixed, deterministic scene; background fetches would only
  // add noise to it.
  useCarriedAssetWarmup(!visualScenario, playerBuild.sex);
  const meleeSkill = settings.meleeSkill;
  const skillsEnabled = settings.skillsEnabled;
  /**
   * The player's weapon as their skill wields it: the moveset re-costed in
   * stamina (`applyMeleeModifiers`). Damage is *not* baked in here — it is
   * applied once at resolve time, through `HitContext.attacker`.
   */
  const playerWeapon = useMemo(() => {
    const base = playerLoadout.mainHand;
    return {
      ...base,
      attacks: applyMeleeModifiers(base.attacks, playerMeleeModifiers(skillsEnabled, meleeSkill, base.stats.class)),
      // Two blades stand in their own idle (DW_IDLE); everything else is the main hand's.
      animations: { ...base.animations, combatIdle: loadoutCombatIdle(playerLoadout) },
    };
  }, [playerLoadout, meleeSkill, skillsEnabled]);
  /**
   * Dual wield (decision 0091): the weapon in the left hand and the attacks a
   * weapon in each hand adds, re-costed for skill as the main hand's are. Null
   * with a shield, a torch or an empty off hand.
   */
  const playerOffWeapon: WeaponDefinition | null = playerLoadout.offHand?.kind === "weapon" ? playerLoadout.offHand : null;
  const playerDualWield = useMemo(() => {
    const attacks = resolveDualWield(playerLoadout);
    if (!attacks || !playerOffWeapon) return null;
    const offMods = playerMeleeModifiers(skillsEnabled, meleeSkill, playerOffWeapon.stats.class);
    const mainMods = playerMeleeModifiers(skillsEnabled, meleeSkill, playerLoadout.mainHand.stats.class);
    const off = applyMeleeModifiers({ offLight: attacks.offLight, offPower: attacks.offPower }, offMods);
    const both = applyMeleeModifiers({ dualPower: attacks.dualPower }, mainMods);
    return { offLight: off.offLight, offPower: off.offPower, dualPower: both.dualPower, dualPowerOffHandDamage: attacks.dualPowerOffHandDamage };
  }, [playerLoadout, playerOffWeapon, meleeSkill, skillsEnabled]);
  /** A torch in the off hand, for its light, its pose and its burn. */
  const playerTorch = playerLoadout.offHand?.kind === "torch" ? playerLoadout.offHand : null;
  /** Bleeds and the like the player is carrying. The player has no Fighter. */
  const playerStatus = useRef<ActiveStatusEffect[]>([]);
  const consumeArrow = useInventoryStore((state) => state.remove);
  const liveArrows = useArrowStore((state) => state.arrows);
  const retireArrow = useArrowStore((state) => state.retire);
  const playerGuard = useMemo(() => activeGuardProfile(playerLoadout), [playerLoadout]);
  // What a raised guard is *made of* and what it *looks like* come from the
  // same place: the off hand if there is one, the weapon otherwise. Deriving
  // both from the loadout is what stops a shielded player angling a sword edge.
  const playerGuardAnimations = useMemo(() => activeGuardAnimations(playerLoadout), [playerLoadout]);
  // Which slices of the rig this actor must have downloaded to fight with what
  // it is holding. Changing it remounts the actor (see SkyrimFighter), which is
  // why it is memoised on the loadout rather than recomputed per frame.
  // A world with water also loads the swim strokes (decision 0093).
  const playerAnimationPacks = useMemo(
    () => water ? resolveAnimationPacks([...loadoutAnimationPacks(playerLoadout), "swim"]) : loadoutAnimationPacks(playerLoadout),
    [playerLoadout, water],
  );
  const playerStart = useMemo(
    () => new THREE.Vector3(...(visualScenario ? visualScenario.player.position : layout.playerStart)),
    [visualScenario, layout],
  );
  const playerStartYaw = visualScenario?.player.yaw ?? layout.playerYaw;
  const player = useRef<EcctrlHandle>(null);
  /**
   * The player's body behind the movement boundary, for swimming (decision
   * 0093). The rest of this runtime still reads the ecctrl handle directly
   * (PlayerBody's declared migration debt).
   */
  const playerController = useMemo(() => new EcctrlAdapter(player), []);
  /** Seconds the head has been under water without a break (HUD, for breath). */
  const submergedSeconds = useRef(0);
  /** Seconds left in which the floor ray, not ecctrl, says whether a swimmer who just left the water stands. */
  const swimExitGrace = useRef(0);
  /** Swimming with no ground under the feet (telemetry). */
  const swimFloating = useRef(false);
  /** The plane the player's model stands on: the controller's ground, or the floor under a swimmer. */
  const playerSupportY = useRef(0);
  const swimScratch = useRef({ centre: new THREE.Vector3(), chest: new THREE.Vector3(), eye: new THREE.Vector3() });
  const playerWeaponObject = useRef<THREE.Object3D>(null);
  const playerOffHandObject = useRef<THREE.Object3D | null>(null);
  const showWeaponHitboxes = settings.showWeaponHitboxes;
  const showBackstabZones = settings.showBackstabZones;
  const playerParryObject = useMemo(
    () => parryObjectRef(playerOffHandObject, playerWeaponObject),
    [],
  );
  const playerHurtbox = useRef<readonly HurtboxBone[] | null>(null);
  const playerWeaponOverlaps = useRef(new OverlapCounter());
  const playerParryOverlaps = useRef(new OverlapCounter());
  const playerHitboxActive = useRef(false);
  /** The off-hand blade's sensor (dual wield), armed by the attack's `hand`. */
  const playerOffWeaponOverlaps = useRef(new OverlapCounter());
  const playerOffHitboxActive = useRef(false);
  /** Which hands have already landed this attack: each resolves its contact once. */
  const playerHandHit = useRef({ main: false, off: false });
  /**
   * The carried light's burn (decision 0091) and its 0-1 level this frame.
   * The level is the one number the flame, the point light and (round 4)
   * stealth read.
   */
  const carriedLight = useRef<CarriedLightState | null>(null);
  const carriedLightLevel = useRef(0);
  const carriedLightClock = useRef(0);
  /**
   * Stealth (decision 0092): the loudest one-off noise the player made since
   * the last stealth step (a landing, a blocked blow; `perception/noise`).
   * Continuous noises (footsteps, a roll, a swing) are read at the step.
   */
  const pendingNoise = useRef(0);
  const stealthScratch = useRef({ eye: new THREE.Vector3(), chest: new THREE.Vector3(), toChest: new THREE.Vector3() });
  // Parry checks a wide shield zone in front of the player rather than the
  // weapon's own thin volume (see ParryShield) — landing a parry shouldn't
  // require exact blade-to-blade contact.
  const playerParryActive = useRef(false);
  const playerAnimationCommand = useRef(createAnimationCommand(playerWeapon.animations.combatIdle));
  const playerAction = useRef<CombatAction>("idle");
  const playerActionTime = useRef(0);
  const playerAttack = useRef<AttackDefinition | null>(null);
  const playerAttackHit = useRef(false);
  const playerAttackDirection = useRef(new THREE.Vector3(0, 0, 1));
  const comboQueued = useRef<"light" | "heavy" | null>(null);
  const rollAttackQueued = useRef<"light" | "heavy" | null>(null);
  const backstepAttackQueued = useRef(false);
  const backstepOrigin = useRef(new THREE.Vector3());
  /**
   * Metres the current attack's wind-up must cover. Zero means the attack uses
   * its own authored lunge. The dash-in attack sets the ground it has to make
   * back up, so the surge is derived from the retreat that actually happened
   * rather than from a second hand-tuned speed.
   */
  const attackDashDistance = useRef(0);
  const healedThisAction = useRef(false);
  const playerHealth = useRef<number>(COMBAT_TUNING.maxHealth);
  const playerStamina = useRef<number>(COMBAT_TUNING.maxStamina);
  const staminaCooldown = useRef(0);
  const estus = useRef(3);
  const equipped = useRef(true);
  const lockedOn = useRef(false);
  const dodgeHold = useRef(0);
  const dodgeDirection = useRef(new THREE.Vector3(0, 0, -1));
  const moveMagnitudeRef = useRef(0);
  const sprintingRef = useRef(false);
  /** A sprint-swim that ran stamina out stays off until the sprint input is let go. */
  const swimSprintExhausted = useRef(false);
  const movementAllowedRef = useRef(true);
  const playerLocomotionReversing = useRef(false);
  // Lock-on strafe/walk clips are authored for free-roam pace; nudging the
  // clip faster and the actual travel speed slightly slower brings the visual
  // stride cadence and the physical ground speed back into rough agreement.
  const playerAnimationSpeed = useRef(1);
  // A portrait holds the idle clip at its first frame. The mixer starts the
  // moment the GLB finishes decoding, which is a variable number of frames
  // before the scenario driver arms, so a *running* idle reaches a different
  // point in its cycle on every run and two sheets could not be diffed.
  const portraitFrozenSpeed = useRef(0);
  const playerMoveSpeed = useRef(0);
  const playerVisualProbe = useRef(createActorVisualProbe());
  const landingArmed = useRef(false);
  const maximumDownwardSpeed = useRef(0);
  const landingTimer = useRef(0);
  const landingDuration = useRef(0.42);
  const landingAnimation = useRef<Extract<AnimationState, "JUMP_LAND" | "JUMP_LAND_LEFT" | "JUMP_LAND_RIGHT">>("JUMP_LAND");
  const jumpStartTimer = useRef(0);
  const guardHitUntil = useRef(0);
  const nextGuardHitVariant = useRef(0);
  /**
   * Standing or crouching. A stance, not a speed: the crouched clips are their
   * own authored locomotion set. Stealth reads this field when it arrives
   * (module 76 §121.5).
   *
   * What crouching already does to volumes, because this was reported wrongly
   * once and it is worth being exact about. The actor's *combat* volume is the
   * skeleton-fitted hurtbox, whose capsules ride the live bones — so crouching
   * genuinely lowers what can be hit, with no code here, and ducking a high
   * swing works today. The actor's *navigation* capsule is Ecctrl's, and that
   * one is a fixed size: crouching does not let you pass under low world
   * geometry. Two different volumes, and only the second is still to do.
   */
  const playerStance = useRef<Stance>("standing");
  // Crouching lowers the navigation capsule as well as the pose, so a crouched
  // actor can pass under what a standing one cannot. The fitted hurtbox already
  // ducked on its own — these are two separate volumes, and this is the one the
  // world stops rather than the one combat hits.
  useStanceCapsule(player, playerStance);
  const footDrivenMotion = settings.footDrivenMotion;
  const lockedSpeedFollowsClip = settings.lockedSpeedFollowsClip;
  const lockedStrideRate = settings.lockedStrideRate;
  /**
   * Clip-driven locomotion (locked-on and crouched): the stride playing, how
   * far into it we are — kept here rather than read back from the mixer, at
   * playback rate 1 the two agree — and, for a crouch, the way the body is
   * being turned to face.
   */
  const clipDrivenState = useRef<AnimationState | null>(null);
  const clipDrivenTime = useRef(0);
  const bowFootAnchorState = useRef<AnimationState | null>(null);
  const bowFootAnchorSourceTime = useRef(0);
  const crouchFacing = useRef<THREE.Vector3 | null>(null);
  const crouchFacingVector = useRef(new THREE.Vector3());
  /**
   * The player's poise pool (module 76 §121.3). While it holds, a hit costs
   * health and nothing else; when it empties the blow interrupts. Enemies carry
   * the same structure on their Fighter.
   */
  const playerPoise = useRef<PoiseState>(createPoise(playerArmour));
  // Which enemy to fight. Rebuilding the runtimes when it changes is the point:
  // an archetype decides the loadout, which decides the animation packs, the
  // hurtbox and every tactical distance the AI works in.
  const enemyArchetypeId = settings.enemyArchetypeId;
  /** Seconds a light press made during a parry stays live as a riposte. */
  const riposteQueued = useRef(0);

  // The enemy actor list. Combat logic reads and writes these Fighter structs;
  // each has its own physics body and weapon rendered by <EnemyActor>.
  const enemies = useMemo(() => {
    if (visualScenario) {
      return [createEnemyRuntime(
        0,
        new THREE.Vector3(...visualScenario.enemy.position),
        visualScenario.enemy.yaw,
        visualScenario.enemy.archetypeId ? enemyArchetypeById(visualScenario.enemy.archetypeId) : undefined,
      )];
    }
    return layout.enemySpawns.map((start, index) =>
      createEnemyRuntime(index, new THREE.Vector3(...start), 0, enemyArchetypeById(enemyArchetypeId)));
  }, [visualScenario, enemyArchetypeId, layout]);
  const visualDriver = useRef(visualScenario ? new VisualScenarioDriver(visualScenario) : null);
  const visualObserved = useRef({
    playerActions: new Set<string>(),
    playerAnimations: new Set<string>(),
    enemyActions: new Set<string>(),
    enemyAnimations: new Set<string>(),
    lastEvent: "",
  });
  const lockTargetIndex = useRef(-1);
  const executionVictim = useRef<EnemyRuntime | null>(null);
  const executionAlignmentStart = useRef<{
    position: THREE.Vector3;
    yaw: number;
  } | null>(null);
  const executionCameraSide = useRef<1 | -1>(1);
  const bus = useMemo(() => new CombatEventBus(), []);
  const cameraYaw = useRef(0);
  const cameraPitch = useRef(0.34);
  // Aiming has its own pitch because it means something different: the
  // third-person pitch orbits the camera above the player, while this one is
  // where the archer is actually looking.
  const bowCycle = useRef<BowCycle>(IDLE_BOW_CYCLE);
  const aimPitch = useRef(0);
  /** Locked target last used to initialise bow aim; null means centre again. */
  const bowAimCentredTarget = useRef<number | null>(null);
  /** False until the player deliberately moves off the centred lock target. */
  const bowAimDetachedFromTarget = useRef(false);
  const bowAimSnapTarget = useRef<number | null>(null);
  /** 0 = wide, 1 = fully zoomed. Reset whenever the bow comes down. */
  const aimZoom = useRef(0);
  /** Last frame's aim-camera position: the crosshair ray starts here. */
  const aimCameraOrigin = useRef(new THREE.Vector3());
  /** Reused crosshair ray; allocating one per frame in a hot loop is waste. */
  const aimRay = useRef(new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }));
  /** Yaw the body is turned to while aiming: the converged shot's, not the camera's. */
  const playerAimBodyYaw = useRef(0);
  /** Lean the spine takes while aiming, radians; positive is up. */
  const playerAimSpinePitch = useRef(0);
  /** Angle between the crosshair ray and the shot, degrees. Telemetry only. */
  const playerAimErrorDegrees = useRef(0);
  /** How fast the drawn stride currently showing carries the body, m/s. */
  const aimMoveSpeed = useRef(AIM_MOVE_SPEED);
  const aimBlendAmount = useRef(0);
  const playerHeadBone = useRef<THREE.Object3D | null>(null);
  const playerSoleBones = useRef<SoleBoneRefs | null>(null);
  const bowPivotAnimation = useRef<AnimationState | null>(null);
  const bowPivotSide = useRef<"footL" | "footR">("footL");
  /** Where the shot is going, shared with anything that has to point along it. */
  const playerAimDirection = useRef(new THREE.Vector3(0, 0, -1));
  /** Where the nocked shaft's tail is, world space; the shot leaves from it. */
  const playerNockWorld = useRef(new THREE.Vector3());
  /** The rigged bow's draw: 0-1 pull, and a counter bumped on every loose. */
  const playerBowDrawFraction = useRef(0);
  const playerBowPoseTime = useRef<number | null>(null);
  const playerBowRelease = useRef(0);
  const playerBowDraw = useMemo(
    () => ({ fraction: playerBowDrawFraction, release: playerBowRelease }),
    [],
  );
  /**
   * The first-person bow rig (Skyrim's own arms), when the switch is on and
   * the held bow has a rigged build. Its state is fed every frame the bow is
   * up; it writes back where its camera bone is.
   */
  const aimViewSetting = settings.aimView;
  const aimView = visualScenario?.player.aimView ?? aimViewSetting;
  const firstPersonState = useRef<FirstPersonBowState>({
    rootPosition: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    drawFraction: 0,
    drawing: false,
    move: { x: 0, y: 0 },
    moveMagnitude: 0,
  });
  const firstPersonCamera = useRef(new THREE.Vector3());
  const playerNockVisible = useRef(false);
  const cameraPosition = useRef(new THREE.Vector3(0, 3.4, 10));
  const cameraLook = useRef(new THREE.Vector3());
  const tmp = useRef({
    aimDirection: new THREE.Vector3(),
    aimLook: new THREE.Vector3(),
    aimRayFallback: new THREE.Vector3(),
    arrowOrigin: new THREE.Vector3(),
    toEnemy: new THREE.Vector3(),
    flat: new THREE.Vector3(),
    movement: new THREE.Vector3(),
    desiredCamera: new THREE.Vector3(),
    desiredLook: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    cameraRight: new THREE.Vector3(),
    soleL: new THREE.Vector3(),
    soleR: new THREE.Vector3(),
    soleWorld: new THREE.Vector3(),
    lightWorld: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  });
  /**
   * An enemy's line of sight to the player (decision 0092): the crosshair's
   * reused Rapier ray from the eye to the chest, blocked by anything solid
   * except actors (their capsules) and sensors (hurtboxes, weapon volumes).
   */
  const lineOfSight = useCallback((from: THREE.Vector3, to: THREE.Vector3) => {
    const direction = stealthScratch.current.toChest.subVectors(to, from);
    const length = direction.length();
    if (length < 1e-4) return true;
    direction.divideScalar(length);
    aimRay.current.origin = from;
    aimRay.current.dir = direction;
    const blocker = world.castRay(
      aimRay.current, length, true, undefined, undefined, undefined, undefined,
      (collider) => !collider.isSensor()
        && !isActorCapsuleName(rigidBodyStates.get(collider.parent()?.handle ?? -1)?.object.name),
    );
    return blocker === null;
  }, [rigidBodyStates, world]);
  const floorRay = useRef(new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }));
  /** World Y of the first solid surface straight under a point within `reach` metres, or null. */
  const floorBelow = useCallback((from: THREE.Vector3, reach: number) => {
    floorRay.current.origin = from;
    const hit = world.castRay(
      floorRay.current, reach, true, undefined, undefined, undefined, undefined,
      (collider) => !collider.isSensor()
        && !isActorCapsuleName(rigidBodyStates.get(collider.parent()?.handle ?? -1)?.object.name),
    );
    return hit ? from.y - hit.timeOfImpact : null;
  }, [rigidBodyStates, world]);
  const { camera } = useThree();
  const started = settings.started;
  const enemyEnabled = settings.enemyEnabled;
  const enemyAiEnabled = settings.enemyAiEnabled;
  const enemyCount = settings.enemyCount;
  // A visual scenario may isolate the pre-poise reaction rule (see the scenario
  // type's `poise` field); everything else follows the debug switch.
  // Debug-panel overrides for the player's pools. Read as live values rather
  // than captured once, so raising the bar mid-fight takes effect immediately.
  const playerMaxHealth = settings.playerMaxHealth;
  const playerMaxStamina = settings.playerMaxStamina;
  const poiseEnabled = settings.poiseEnabled
    && (visualScenario?.player.poise ?? true);
  // The few frame values the scene graph renders from (the lock reticle, the
  // first-person bow), latched at the HUD tick so they cost a render only when
  // they change.
  const [rendered, setRendered] = useState(INITIAL_RENDERED_STATE);
  const renderedRef = useRef(rendered);
  const lockedOnSnapshot = rendered.lockedOn;
  const lockedTargetSnapshot = rendered.lockedTarget;
  const playerActionSnapshot = rendered.playerAction;
  // Rendered state, not frame state: the actor is a React component and the
  // head has to be collapsed through a prop rather than from the frame loop.
  const aimingSnapshot = rendered.aiming;
  const firstPersonActive = aimingSnapshot && aimView === "firstPerson" && Boolean(playerWeapon.visual.rig);
  const shoulderAim = aimView === "shoulder";
  /**
   * The shaft on the string. Present whenever the bow is up and an arrow is
   * nocked, and gone the instant it is loosed — which is the moment the real
   * one appears in the world.
   */
  const playerNockedArrow = useMemo(() => {
    if (!aimingSnapshot || !playerQuiver) return null;
    // Present whenever the bow is up; *shown* by the frame ref, which follows
    // the draw clip (`nockedArrowVisible`). A bow held ready has an empty
    // string — the shaft comes out of the quiver as the hand goes back for it.
    return {
      asset: playerQuiver.arrow.asset,
      visible: true,
      visibleRef: playerNockVisible,
      aimDirection: playerAimDirection,
      nockWorld: playerNockWorld,
    };
  }, [aimingSnapshot, playerQuiver]);
  /** The quiver on the player's back: whatever arrows are equipped, worn. */
  const playerQuiverMount = useMemo(() => {
    const worn = playerQuiver?.arrow.quiver;
    if (!worn) return null;
    return { asset: worn.asset, socket: worn.socket, visible: !firstPersonActive };
  }, [firstPersonActive, playerQuiver]);
  const resetToken = settings.resetToken;
    const hudTimer = useRef(0);
  const messageTimer = useRef(0);
  const message = useRef("");
  const hitStop = useRef(0);
  const shake = useRef<HitShakeImpulse | null>(null);
  const shakeSeed = useRef(0);
  const damagePulse = useRef(0);

  const setAnim = useCallback((animation: AnimationState, startAt = 0, restart = false, crossFadeDuration: number | null = null, timing: ClipTiming = UNIT_CLIP_TIMING) => {
    updateAnimationCommand(playerAnimationCommand.current, animation, startAt, restart, crossFadeDuration, timing);
  }, []);

  const setEnemyAnim = useCallback((e: EnemyRuntime, animation: AnimationState, startAt = 0, restart = false, crossFadeDuration: number | null = null, timing: ClipTiming = UNIT_CLIP_TIMING) => {
    updateAnimationCommand(e.animCommand.current, animation, startAt, restart, crossFadeDuration, timing);
  }, []);

  const announce = useCallback((text: string, duration = 1.2) => {
    bus.message(text, duration);
  }, [bus]);

  const triggerShake = useCallback((kind: HitShakeKind, worldDirection?: { x: number; z: number }) => {
    bus.shake(kind, worldDirection);
  }, [bus]);

  const triggerDamageVignette = useCallback(() => {
    bus.vignette();
  }, [bus]);

  const setEnemyMode = useCallback((e: EnemyRuntime, mode: EnemyMode, animation: AnimationState, startAt = 0, crossFadeDuration: number | null = null) => {
    e.fighter.state = mode;
    e.fighter.actionTime = startAt;
    e.fighter.attackHit = false;
    e.guardHitUntil = 0;
    if (mode === "attack") {
      const target = player.current?.currPos;
      const distance = target ? Math.hypot(target.x - e.position.x, target.z - e.position.z) : Infinity;
      e.attackFromFeet = distance <= e.archetype.lungeBeyondDistance;
    }
    // Same rule as the player: an attack's clip runs at the rate its own
    // windup/active/recovery were scaled to, so the hitbox stays on the blade
    // whatever the enemy is carrying. `fighter.attack` is always assigned
    // before the mode is entered.
    setEnemyAnim(e, animation, startAt, true, crossFadeDuration, mode === "attack" && e.fighter.attack ? attackClipTiming(e.fighter.attack) : UNIT_CLIP_TIMING);
  }, [setEnemyAnim]);

  // When the locked target dies, retarget the nearest survivor or release lock.
  const clearLockIfTarget = useCallback((e: EnemyRuntime) => {
    if (lockTargetIndex.current !== e.id) return;
    const handle = player.current;
    let best = -1;
    let bestDist = Infinity;
    if (handle) {
      for (const other of enemies) {
        if (other.id === e.id || other.fighter.health <= 0) continue;
        const distance = (other.position.x - handle.currPos.x) ** 2 + (other.position.z - handle.currPos.z) ** 2;
        if (distance < bestDist) { bestDist = distance; best = other.id; }
      }
    }
    lockTargetIndex.current = best;
    lockedOn.current = best >= 0;
  }, [enemies]);

  // Cycle the lock among living enemies by their bearing from the player, so
  // left/right steps to the next foe on that side of the current target.
  const switchTarget = useCallback((dir: 1 | -1, fromX: number, fromZ: number) => {
    const alive = enemies.filter((e) => e.fighter.health > 0);
    if (alive.length <= 1) return;
    const angleOf = (e: EnemyRuntime) => Math.atan2(e.position.x - fromX, e.position.z - fromZ);
    const currentIndex = lockTargetIndex.current;
    const currentEnemy = currentIndex >= 0 ? enemies[currentIndex] : undefined;
    const currentAngle = currentEnemy ? angleOf(currentEnemy) : 0;
    let best: EnemyRuntime | null = null;
    let bestDelta = Infinity;
    for (const e of alive) {
      if (e.id === currentIndex) continue;
      const wrapped = Math.atan2(Math.sin(angleOf(e) - currentAngle), Math.cos(angleOf(e) - currentAngle));
      const directional = dir === 1 ? wrapped : -wrapped;
      const magnitude = directional > 0 ? directional : directional + Math.PI * 2;
      if (magnitude < bestDelta) { bestDelta = magnitude; best = e; }
    }
    if (best) lockTargetIndex.current = best.id;
  }, [enemies]);

  const spendStamina = useCallback((amount: number) => {
    if (playerStamina.current < amount) return false;
    playerStamina.current -= amount;
    staminaCooldown.current = COMBAT_TUNING.staminaRegenDelay;
    return true;
  }, []);

  const startPlayerAction = useCallback((
    action: CombatAction,
    animation: AnimationState,
    startAt = 0,
    direction?: THREE.Vector3,
    crossFadeDuration: number | null = null,
    /**
     * Restart the clip even if it is the one already playing.
     *
     * Almost always right: swinging twice must replay the swing. Raising a bow
     * that is already in the hand is the exception — the state changes, the
     * pose does not, and restarting it puts a visible hitch in a clip the
     * player never saw stop.
     */
    restartAnimation = true,
    /**
     * The attack this action performs, when it is not the weapon's own attack
     * of the same name: dual wield's (decision 0091), and a queued heavy that
     * is the both-blades power attack.
     */
    attackOverride: AttackDefinition | null = null,
  ) => {
    playerAction.current = action;
    playerActionTime.current = startAt;
    playerAttack.current = attackOverride ?? (action === "light1" || action === "light2" || action === "light3" || action === "heavy" || action === "heavy2" || action === "riposte" || action === "backstab"
      ? playerWeapon.attacks[action]
      : null);
    if (playerAttack.current) {
      const axis = direction ?? player.current?.bodyZAxis;
      if (axis) {
        playerAttackDirection.current.copy(axis).setY(0).normalize();
        const handle = player.current;
        if (handle) {
          handle.setForwardDir(playerAttackDirection.current);
          handle.setLockForward(true);
          handle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          tmp.current.quaternion.setFromAxisAngle(UP, Math.atan2(playerAttackDirection.current.x, playerAttackDirection.current.z));
          handle.body.setRotation(tmp.current.quaternion, true);
        }
      }
    }
    playerAttackHit.current = false;
    playerHandHit.current.main = false;
    playerHandHit.current.off = false;
    comboQueued.current = null;
    if (action !== "roll") rollAttackQueued.current = null;
    if (action !== "backstep") backstepAttackQueued.current = false;
    attackDashDistance.current = 0;
    healedThisAction.current = false;
    if (action === "guard") guardHitUntil.current = 0;
    // An attack's clip plays at the rate its own timing was scaled to. Anything
    // that is not an attack has no class scaling applied to it and plays at 1.
    setAnim(animation, startAt, restartAnimation, crossFadeDuration, playerAttack.current ? attackClipTiming(playerAttack.current) : UNIT_CLIP_TIMING);
  }, [playerWeapon, setAnim]);

  const finishPlayerAction = useCallback(() => {
    const abandonedVictim = executionVictim.current;
    if (abandonedVictim?.fighter.state === "critical") {
      // A configured critical should always make its audited contact. If
      // geometry or future interruption rules prevent that, fail safe by
      // releasing the victim instead of leaving its FSM and pose frozen
      // forever after the attacker returns to idle.
      abandonedVictim.fighter.criticalType = null;
      abandonedVictim.criticalByPair = null;
      abandonedVictim.criticalByAttack = null;
      setEnemyMode(
        abandonedVictim,
        "recover",
        // The VICTIM's idle. This read the player's weapon profile, which put
        // a battleaxe idle on a sword-armed enemy.
        abandonedVictim.archetype.loadout.mainHand.animations.combatIdle,
      );
    }
    playerAction.current = "idle";
    playerActionTime.current = 0;
    playerAttack.current = null;
    executionVictim.current = null;
    executionAlignmentStart.current = null;
    if (!lockedOn.current) player.current?.setLockForward(false);
    setAnim(equipped.current ? playerWeapon.animations.combatIdle : "IDLE");
  }, [playerWeapon, setAnim, setEnemyMode]);

  const damageEnemy = useCallback((
    e: EnemyRuntime,
    execution: "riposte" | "backstab" | null = null,
    /** Which blade landed: its class, skill and damage decide the blow. */
    hand: "main" | "off" = "main",
  ) => {
    const current = playerAttack.current;
    if (!current) return false;
    const handWeapon = hand === "off" && playerOffWeapon ? playerOffWeapon : playerWeapon;
    // The off blade in the both-blades power attack hits with its own weapon's damage.
    const attack = hand === "off" && current.hand === "both" && playerDualWield
      ? { ...current, damage: playerDualWield.dualPowerOffHandDamage }
      : current;
    const f = e.fighter;
    const enemyWeapon = f.archetype.loadout.mainHand;
    // A blow on an enemy that had not engaged takes the sneak table (decision
    // 0092 §5); an unseen backstab swings the main weapon's light1 under that
    // table instead of its own critical damage, as the two never stack.
    const unseen = e.awareness.awareness !== "engaged";
    const sneak = unseen ? sneakAttackMultiplier(handWeapon.stats.class, sneakSkillFor()) : 1;
    const struck = execution === "backstab" && unseen
      ? { ...attack, damage: playerWeapon.attacks.light1.damage }
      : attack;
    const result = resolveHit(f.health, f.stamina, {
      attack: struck,
      sneakMultiplier: sneak,
      // What the class itself does on a hit (bleed, armour pierce), and how well
      // the player swings it. Both read at the moment of contact.
      effects: settingsRef.current.classEffectsEnabled ? WEAPON_CLASSES[handWeapon.stats.class].effects : [],
      attacker: playerMeleeModifiers(settingsRef.current.skillsEnabled, settingsRef.current.meleeSkill, handWeapon.stats.class),
      critRoll: visualScenario ? 1 : Math.random(),
      // A guard only covers what the defender is facing. Without this a
      // shield stopped a sword swung into the back of its owner's head.
      guard: f.state === "guard" && !execution && player.current && enemyGuardCovers(e, player.current.currPos)
        ? activeGuardProfile(f.archetype.loadout)
        : null,
      iframe: f.state === "dodge" && isRollInvulnerable(f.actionTime),
      execution,
      armourRating: totalArmourRating(wornArmourFor(f.archetype.armour)),
    });
    if (result.kind === "iframe") return false;
    if (player.current) strikeAwareness(e, player.current.currPos);
    const telemetry = visualScenario ? window.__COMBAT_VISUAL_SCENARIO__ : undefined;
    telemetry?.playerHits?.push({
      time: Number((visualDriver.current?.elapsed ?? 0).toFixed(3)),
      attack: attack.id,
      hand,
      damage: Number((f.health - result.health).toFixed(2)),
      enemyHealthAfter: Number(result.health.toFixed(2)),
    });
    const reaction = hitReactionForAttack(attack);
    if (result.kind === "blocked") {
      f.health = result.health;
      f.stamina = result.stamina;
      f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
      playerHitboxActive.current = false;
      playerOffHitboxActive.current = false;
      comboQueued.current = null;
      hitStop.current = Math.max(hitStop.current, result.hitStop);
      const attacker = player.current;
      if (attacker) {
        attacker.body.setLinvel(blockRecoilVelocity(
          attacker.currPos,
          e.position,
          attacker.body.linvel().y,
        ), true);
      }
      startPlayerAction("recoil", "RECOIL");
      const enemyGuardAnimations = activeGuardAnimations(f.archetype.loadout);
      const guardHit = enemyGuardAnimations.hitVariants[nextGuardHitVariant.current % enemyGuardAnimations.hitVariants.length];
      nextGuardHitVariant.current += 1;
      e.guardHitUntil = f.actionTime + (clipPlaybackDuration(guardHit) ?? 0.8333);
      setEnemyAnim(e, guardHit, 0, true);
      combatAudio.play("guard");
      triggerShake("block");
      announce(text(CATALOGUE, "text.combat.enemy-blocked"), 0.6);
      if (f.health <= 0) {
        clearLockIfTarget(e);
        setEnemyMode(e, "dead", "DEATH");
        combatAudio.play("death");
        announce(text(CATALOGUE, "text.combat.enemy-felled"), ENEMY_FELLED_MESSAGE_DURATION);
      }
      return true;
    }
    if (result.kind === "guardBroken") {
      f.health = result.health;
      f.stamina = result.stamina;
      setEnemyMode(e, "parried", enemyWeapon.animations.guardBreak);
      announce(text(CATALOGUE, "text.combat.enemy-guard-broken"), 1.1);
      return true;
    }
    f.health = result.health;
    if (result.kind === "hit" || result.kind === "execution") {
      f.status = applyStatusEffects(f.status, result.status);
    }
    if (result.kind === "hit" && result.critical && !result.killed) {
      announce(text(CATALOGUE, "text.combat.critical-hit"), 0.7);
    }
    if (sneak > 1 && (result.kind === "hit" || result.kind === "execution")) {
      announce(text(CATALOGUE, "text.combat.sneak-attack").replace("{multiplier}", String(sneak)), 1.1);
    }
    hitStop.current = result.hitStop;
    const handle = player.current;
    triggerShake(result.kind === "execution" ? "execution" : isHeavyAttack(attack) ? "enemyHeavyHit" : "enemyHit", handle ? {
      x: e.position.x - handle.currPos.x,
      z: e.position.z - handle.currPos.z,
    } : undefined);
    combatAudio.play(result.killed && result.kind !== "execution" ? "death" : "hit");
    if (result.killed) {
      if (result.kind !== "execution") {
        clearLockIfTarget(e);
        setEnemyMode(e, "dead", "DEATH");
        announce(text(CATALOGUE, "text.combat.enemy-felled"), ENEMY_FELLED_MESSAGE_DURATION);
      }
    } else if (result.kind === "execution") {
      // The critical victim timeline was started before contact. Let its
      // profile continue through blade withdrawal and the selected recovery.
    } else {
      // Poise decides whether the blow interrupts (module 76 §121.3). While the
      // pool holds, the hit lands and the enemy keeps doing what it was doing —
      // which is what makes weapon class tactical: a dagger interrupts nothing
      // large, a warhammer staggers through almost anything.
      const broke = !poiseEnabled || applyPoiseDamage(
        f.poise,
        attackPoiseDamage(handWeapon.stats.class, attack.id),
      ).staggered;
      if (broke) {
        f.staggerDuration = f.archetype.stateDurations.staggerLight;
        setEnemyMode(e, "stagger", reaction.animation);
      }
    }
    return true;
  }, [announce, clearLockIfTarget, playerDualWield, playerOffWeapon, playerWeapon, poiseEnabled, setEnemyAnim, setEnemyMode, sneakSkillFor, startPlayerAction, triggerShake, visualScenario]);

  /**
   * An arrow arriving somewhere.
   *
   * Nothing here decides how much it hurts: the arrow's own speed at the moment
   * of contact, the angle it struck at and what the target is wearing go into
   * `resolveArrowImpact` and the answer comes back out. That is why there is no
   * range falloff — a shot across the arena and a shot from the far wall differ
   * because the arrow is slower, and for no other reason.
   */
  const traceActorArrow = useCallback<ArrowTrace>((origin, direction, distance, shooter) => {
    let closest: ReturnType<ArrowTrace> = null;
    const candidates = [{ name: PLAYER_HURTBOX_NAME, rig: playerHurtbox.current },
      ...enemies.map(enemy => ({ name: enemy.hurtboxName, rig: enemy.hurtbox.current }))];
    for (const candidate of candidates) {
      if (candidate.name === shooter) continue;
      const hit = traceArrowSurface(candidate.rig, origin, direction, closest?.distance ?? distance);
      if (hit) closest = { ...hit, target: candidate.name };
    }
    return closest;
  }, [enemies]);

  const handleArrowHit = useCallback((hit: ArrowHit) => {
    if (!hit.target) return;
    if (hit.target === PLAYER_HURTBOX_NAME) {
      // The player half of this handler. It simply did not exist: enemy
      // arrows resolved against the enemy list only, so an archer could not
      // hurt the player at all.
      const handle = player.current;
      if (!handle || playerHealth.current <= 0) return;
      const invulnerable =
        ((playerAction.current === "roll" || playerAction.current === "backstep") && isRollInvulnerable(playerActionTime.current))
        || playerAction.current === "backstab"
        || playerAction.current === "riposte";
      if (invulnerable) return;
      const struck = nearestHurtboxBone(playerHurtbox.current, hit.point);
      // Where the shaft ends up is a separate question from what it counts as
      // hitting: the sensor reports a step late, so the arrow's own position
      // can be clear of the body and a shaft left there stands in mid-air.
      const plant = { segment: { bone: hit.bone }, point: hit.point };
      const zone = hitZoneForBone(struck?.bone.name ?? null);
      // The shooter here is an enemy archer, and only the player has a skill
      // slider, so the archer's own multiplier is a flat 1; the hit zone is the
      // whole of it.
      const impact = resolveArrowImpact(hit.arrow.physics, hit.speed, {
        armourRating: totalArmourRating(playerArmour),
        obliquityRad: hit.obliquityRad,
      }, zone.damageMultiplier);
      const damage = impact.damage;
      if (damage <= 0) return;
      // A raised guard stops arrows from the front, exactly as it does a
      // blade. The "attacker" direction is where the shaft flew in from.
      const flightForward = new THREE.Vector3(0, 0, 1).applyQuaternion(hit.quaternion);
      const from = handle.currPos.clone().sub(flightForward);
      if (playerAction.current === "guard" && equipped.current
        && guardCovers(handle.bodyZAxis, handle.currPos, from)) {
        const guarded = resolveGuardImpact({
          health: playerHealth.current,
          stamina: playerStamina.current,
          incomingDamage: damage,
          guard: playerGuard,
          guardBreakDamage: 18,
        });
        playerHealth.current = guarded.health;
        playerStamina.current = guarded.stamina;
        staminaCooldown.current = 1;
        combatAudio.play("guard");
        announce(guarded.blocked ? text(CATALOGUE, "text.combat.arrow-blocked") : text(CATALOGUE, "text.combat.guard-broken"), 0.7);
        if (playerHealth.current <= 0) {
          startPlayerAction("dead", "DEATH");
          announce(text(CATALOGUE, "text.combat.you-died"), 8);
        } else if (!guarded.blocked) {
          startPlayerAction("guardBreak", playerWeapon.animations.guardBreak);
        }
        return;
      }
      // Planted where the flight line meets the body, not where the sensor
      // reported: the overlap arrives a step late, and a shaft left at that
      // position stands in the air beside the target.
      if (plant && hit.object) stickArrow(plant.segment.bone, hit.object, plant.point, hit.quaternion);
      playerHealth.current = Math.max(0, playerHealth.current - damage);
      triggerDamageVignette();
      triggerShake(zone.heavyReaction ? "playerHeavyHit" : "playerHit", { x: flightForward.x, z: flightForward.z });
      combatAudio.play(playerHealth.current <= 0 ? "death" : "hit");
      if (playerHealth.current <= 0) {
        startPlayerAction("dead", "DEATH");
        announce(text(CATALOGUE, "text.combat.you-died"), 8);
        return;
      }
      const arrowPoise = applyPoiseDamage(
        playerPoise.current,
        impact.penetrated ? ARROW_POISE_DAMAGE : 0,
        { ignoresPoise: zone.heavyReaction },
      );
      if (zone.heavyReaction) {
        startPlayerAction("hitHeavy", "HIT_HEAVY");
      } else if (!poiseEnabled || arrowPoise.staggered) {
        startPlayerAction("hit", "HIT");
      }
      return;
    }
    const victim = enemies.find((candidate) => candidate.hurtboxName === hit.target);
    if (!victim || victim.fighter.health <= 0) return;
    const f = victim.fighter;

    // Which part of the body it found: the damage and the reaction.
    const struck = nearestHurtboxBone(victim.hurtbox.current, hit.point);
    // And where on the body the shaft is left standing — the flight line's
    // first crossing of a capsule surface, not the late sensor's report.
    // Identical call for the player above and every enemy here.
    const plant = { segment: { bone: hit.bone }, point: hit.point };
    const zone = hitZoneForBone(struck?.bone.name ?? null);
    // A shaft into an enemy that had not engaged takes the sneak table for
    // the bow in hand (decision 0092 §5), beside the skill and the hit zone.
    const unseen = victim.awareness.awareness !== "engaged";
    const sneak = unseen ? sneakAttackMultiplier(playerWeapon.stats.class, sneakSkillFor()) : 1;
    // The player loosed this one: their Marksman skill and the hit zone, both
    // applied once, inside the resolve.
    const impact = resolveArrowImpact(hit.arrow.physics, hit.speed, {
      armourRating: totalArmourRating(wornArmourFor(f.archetype.armour)),
      obliquityRad: hit.obliquityRad,
    }, playerRangedModifiers(settingsRef.current.skillsEnabled, settingsRef.current.marksmanSkill).damage * zone.damageMultiplier * sneak);
    const damage = impact.damage;
    if (damage <= 0) return;
    if (player.current) strikeAwareness(victim, player.current.currPos);
    if (sneak > 1) announce(text(CATALOGUE, "text.combat.sneak-attack").replace("{multiplier}", String(sneak)), 1.1);

    // A raised guard stops arrows too. Same rules a sword blow meets — the
    // guard's stability decides the stamina it costs and its absorption decides
    // what still gets through — because a shield does not care what hit it.
    // Only from the front: an arrow into the back finds no shield there.
    if (f.state === "guard" && enemyGuardCovers(victim, hit.point)) {
      const guarded = resolveGuardImpact({
        health: f.health,
        stamina: f.stamina,
        incomingDamage: damage,
        guard: activeGuardProfile(f.archetype.loadout),
      });
      f.health = guarded.health;
      f.stamina = guarded.stamina;
      f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
      combatAudio.play("guard");
      announce(guarded.blocked ? text(CATALOGUE, "text.combat.arrow-blocked") : text(CATALOGUE, "text.combat.guard-broken"), 0.7);
      if (!guarded.blocked) {
        setEnemyMode(victim, "parried", f.archetype.loadout.mainHand.animations.guardBreak);
      }
      if (f.health <= 0) {
        clearLockIfTarget(victim);
        setEnemyMode(victim, "dead", "DEATH");
        combatAudio.play("death");
        announce(text(CATALOGUE, "text.combat.enemy-felled"), ENEMY_FELLED_MESSAGE_DURATION);
      }
      return;
    }

    if (plant && hit.object) stickArrow(plant.segment.bone, hit.object, plant.point, hit.quaternion);
    f.health = Math.max(0, f.health - damage);
    triggerShake(zone.heavyReaction ? "enemyHeavyHit" : "enemyHit", {
      x: victim.position.x,
      z: victim.position.z,
    });
    if (f.health <= 0) {
      clearLockIfTarget(victim);
      setEnemyMode(victim, "dead", "DEATH");
      combatAudio.play("death");
      announce(text(CATALOGUE, "text.combat.enemy-felled"), ENEMY_FELLED_MESSAGE_DURATION);
      return;
    }
    combatAudio.play("hit");
    // A head hit ignores poise outright, as it does in Dark Souls; a shaft
    // turned by mail spends none at all. Everything between goes through the
    // pool like any other blow.
    const arrowPoise = applyPoiseDamage(
      f.poise,
      impact.penetrated ? ARROW_POISE_DAMAGE : 0,
      { ignoresPoise: zone.heavyReaction },
    );
    if (zone.heavyReaction) {
      f.staggerDuration = f.archetype.stateDurations.staggerDefault;
      setEnemyMode(victim, "stagger", "HIT_HEAVY");
      announce(text(CATALOGUE, "text.combat.headshot"), 0.8);
    } else if (!poiseEnabled || arrowPoise.staggered) {
      f.staggerDuration = f.archetype.stateDurations.staggerLight;
      setEnemyMode(victim, "stagger", "HIT");
    }
  }, [announce, clearLockIfTarget, enemies, playerArmour, playerGuard, playerWeapon, poiseEnabled, setEnemyMode, sneakSkillFor, startPlayerAction, triggerDamageVignette, triggerShake]);

  const attemptEnemyHit = useCallback((e: EnemyRuntime) => {
    const f = e.fighter;
    const enemyWeapon = f.archetype.loadout.mainHand;
    if (f.attackHit || playerHealth.current <= 0) return;
    const handle = player.current;
    if (!handle) return;
    f.attackHit = true;
    const attack = f.attack;
    if (!attack) return;

    // Executions grant Dark Souls-style invulnerability so a second enemy
    // cannot punish the animation.
    const playerInvulnerable =
      ((playerAction.current === "roll" || playerAction.current === "backstep") && isRollInvulnerable(playerActionTime.current))
      || playerAction.current === "backstab"
      || playerAction.current === "riposte";
    const result = resolveHit(playerHealth.current, playerStamina.current, {
      attack,
      // The enemy's class effects apply; their skill does not exist yet, so
      // `attacker` stays neutral (only the player has a skill slider).
      effects: settingsRef.current.classEffectsEnabled ? WEAPON_CLASSES[enemyWeapon.stats.class].effects : [],
      critRoll: visualScenario ? 1 : Math.random(),
      // Facing, not just guarding: you cannot get a shield between yourself
      // and something behind you.
      guard: playerAction.current === "guard" && equipped.current
        && guardCovers(handle.bodyZAxis, handle.currPos, e.position)
        ? playerGuard
        : null,
      iframe: playerInvulnerable,
      execution: null,
      guardBreakDamage: 18,
      armourRating: totalArmourRating(playerArmour),
    });
    if (result.kind === "iframe") return;

    if (result.kind === "blocked") {
      playerHealth.current = result.health;
      playerStamina.current = result.stamina;
      staminaCooldown.current = 1;
      f.comboRemaining = 0;
      e.hitboxActive.current = false;
      e.guardHitUntil = 0;
      e.criticalLeadInTime = 0;
      hitStop.current = Math.max(hitStop.current, result.hitStop);
      const attacker = e.handle.current;
      if (attacker) {
        attacker.body.setLinvel(blockRecoilVelocity(
          attacker.currPos,
          handle.currPos,
          attacker.body.linvel().y,
        ), true);
      }
      setEnemyMode(e, "recoil", "RECOIL");
      pendingNoise.current = Math.max(pendingNoise.current, NOISE_LOUDNESS.blockHit);
      const guardHit = playerGuardAnimations.hitVariants[nextGuardHitVariant.current % playerGuardAnimations.hitVariants.length];
      nextGuardHitVariant.current += 1;
      guardHitUntil.current = playerActionTime.current + (clipConfig(guardHit).sourceDuration ?? 0.83);
      setAnim(guardHit, 0, true);
      combatAudio.play("guard");
      triggerShake("block", { x: handle.currPos.x - e.position.x, z: handle.currPos.z - e.position.z });
      announce(text(CATALOGUE, "text.combat.blocked"));
      if (playerHealth.current <= 0) {
        startPlayerAction("dead", "DEATH");
        combatAudio.play("death");
        announce(text(CATALOGUE, "text.combat.you-died"), 8);
      }
      return;
    }

    if (result.kind === "guardBroken") {
      playerHealth.current = result.health;
      playerStamina.current = result.stamina;
      startPlayerAction(result.killed ? "dead" : "guardBreak", result.killed ? "DEATH" : playerWeapon.animations.guardBreak);
      combatAudio.play("hit");
      triggerDamageVignette();
      triggerShake("playerHit", { x: handle.currPos.x - e.position.x, z: handle.currPos.z - e.position.z });
      announce(result.killed ? text(CATALOGUE, "text.combat.you-died") : text(CATALOGUE, "text.combat.guard-broken"), result.killed ? 8 : 1.2);
      return;
    }

    playerHealth.current = result.health;
    if (result.kind === "hit" || result.kind === "execution") {
      playerStatus.current = applyStatusEffects(playerStatus.current, result.status);
    }
    triggerDamageVignette();
    const reaction = hitReactionForAttack(attack);
    triggerShake(result.kind === "hit" && result.heavy ? "playerHeavyHit" : "playerHit", {
      x: handle.currPos.x - e.position.x,
      z: handle.currPos.z - e.position.z,
    });
    combatAudio.play(result.killed ? "death" : "hit");
    if (result.killed) {
      startPlayerAction("dead", "DEATH");
      announce(text(CATALOGUE, "text.combat.you-died"), 8);
    } else if (!poiseEnabled || applyPoiseDamage(
      playerPoise.current,
      attackPoiseDamage(enemyWeapon.stats.class, attack.id),
    ).staggered) {
      // Same rule for the player. Shrugging off a light hit mid-swing is the
      // whole reward for wearing armour, and being stopped dead by a heavy is
      // the whole reason not to over-commit.
      startPlayerAction(reaction.action, reaction.animation);
    }
  }, [announce, playerGuard, playerWeapon, poiseEnabled, setAnim, setEnemyMode, startPlayerAction, triggerDamageVignette, triggerShake]);

  // The debug panel can grow/shrink the fight without a full reset. Only the
  // leading `enemyCount` enemies are simulated and rendered.
  const activeEnemies = useMemo(
    () => enemies.slice(0, Math.max(1, Math.min(enemyCount, enemies.length))),
    [enemies, enemyCount],
  );
  const previousActiveCount = useRef(activeEnemies.length);
  useEffect(() => {
    const previous = previousActiveCount.current;
    const current = activeEnemies.length;
    if (current > previous) {
      // Newly added enemies start fresh rather than resuming a prior fight.
      for (let i = previous; i < current; i += 1) {
        const e = enemies[i];
        resetFighter(e.fighter);
        e.fighter.attack = e.archetype.loadout.mainHand.attacks.light1;
        e.position.copy(e.start);
        e.overlaps.current.clear();
        e.hitboxActive.current = false;
        e.parryOverlaps.current.clear();
        e.parryActive.current = false;
        e.backstepAttackQueued.current = false;
        e.running.current = false;
        setEnemyAnim(e, e.archetype.loadout.mainHand.animations.combatIdle, 0, true);
      }
    } else if (current < previous) {
      for (let i = current; i < previous; i += 1) {
        const e = enemies[i];
        e.overlaps.current.clear();
        e.hitboxActive.current = false;
        e.parryOverlaps.current.clear();
        e.parryActive.current = false;
        e.backstepAttackQueued.current = false;
        e.running.current = false;
        if (lockTargetIndex.current === e.id) {
          lockedOn.current = false;
          lockTargetIndex.current = -1;
        }
      }
    }
    previousActiveCount.current = current;
  }, [activeEnemies.length, enemies, setEnemyAnim]);

  useEffect(() => {
    refreshPoise(playerPoise.current, playerArmour);
  }, [playerArmour]);

  // Debug pools. Raising one fills to it — the point is to try a rule you
  // otherwise cannot reach, not to then have to wait for regen — and lowering
  // one clamps into it so the bar cannot read over full.
  const previousPools = useRef({ health: playerMaxHealth, stamina: playerMaxStamina });
  useEffect(() => {
    const previous = previousPools.current;
    if (playerMaxHealth !== previous.health) {
      playerHealth.current = playerHealth.current > 0
        ? Math.min(playerMaxHealth, Math.max(playerHealth.current, playerMaxHealth))
        : 0;
    }
    if (playerMaxStamina !== previous.stamina) {
      playerStamina.current = Math.min(playerMaxStamina, Math.max(playerStamina.current, playerMaxStamina));
    }
    previousPools.current = { health: playerMaxHealth, stamina: playerMaxStamina };
  }, [playerMaxHealth, playerMaxStamina]);

  useEffect(() => input.attach(), []);
  useEffect(() => bus.on((event) => {
    if (event.type === "sound") combatAudio.play(event.sound);
    else if (event.type === "message") {
      message.current = event.text;
      messageTimer.current = event.duration;
    } else if (event.type === "vignette") {
      damagePulse.current += 1;
      publish({ damagePulse: damagePulse.current });
    } else if (event.type === "shake") {
      let side = 0;
      if (event.direction) {
        const length = Math.hypot(event.direction.x, event.direction.z);
        if (length > 0.001) {
          const right = tmp.current.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
          side = right.x * (event.direction.x / length) + right.z * (event.direction.z / length);
        }
      }
      shakeSeed.current += 1;
      shake.current = createHitShake(event.kind, shakeSeed.current, side);
    }
  }), [bus, camera, publish]);
  useEffect(() => {
    const blockMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", blockMenu);
    return () => window.removeEventListener("contextmenu", blockMenu);
  }, []);
  useEffect(() => {
    if (!started) return;
    const handle = player.current;
    if (handle) {
      handle.body.setTranslation(playerStart, true);
      handle.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      handle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      handle.body.setRotation({ x: 0, y: Math.sin(playerStartYaw / 2), z: 0, w: Math.cos(playerStartYaw / 2) }, true);
      handle.setForwardDir(new THREE.Vector3(Math.sin(playerStartYaw), 0, Math.cos(playerStartYaw)));
      handle.setLockForward(false);
      handle.setMovement({ joystick: { x: 0, y: 0 }, run: false, jump: false });
    }
    playerController.setMovementMode("grounded");
    submergedSeconds.current = 0;
    swimExitGrace.current = 0;
    playerSupportY.current = 0;
    bowCycle.current = IDLE_BOW_CYCLE;
    aimBlendAmount.current = 0;
    aimPitch.current = 0;
    aimZoom.current = 0;
    clearArrows();
    // Read at reset time rather than closed over: this effect deliberately does
    // not re-run when the debug pools change, or moving a slider would restart
    // the fight you are using it to test.
    const pools = settingsRef.current;
    playerHealth.current = visualScenario?.player.health ?? pools.playerMaxHealth;
    playerStamina.current = pools.playerMaxStamina;
    previousPools.current = { health: pools.playerMaxHealth, stamina: pools.playerMaxStamina };
    resetPoise(playerPoise.current);
    playerStance.current = visualScenario?.player.stance ?? "standing";
    pendingNoise.current = 0;
    estus.current = 3;
    equipped.current = visualScenario?.player.equipped ?? true;
    lockedOn.current = false;
    lockTargetIndex.current = -1;
    executionVictim.current = null;
    playerAction.current = "idle";
    playerActionTime.current = 0;
    playerAttack.current = null;
    playerAttackHit.current = false;
    playerHandHit.current.main = false;
    playerHandHit.current.off = false;
    playerWeaponOverlaps.current.clear();
    playerOffWeaponOverlaps.current.clear();
    playerParryOverlaps.current.clear();
    playerHitboxActive.current = false;
    playerOffHitboxActive.current = false;
    playerParryActive.current = false;
    comboQueued.current = null;
    rollAttackQueued.current = null;
    backstepAttackQueued.current = false;
    attackDashDistance.current = 0;
    for (const e of enemies) {
      resetFighter(e.fighter);
      e.fighter.attack = e.archetype.loadout.mainHand.attacks[visualScenario?.enemy.attack ?? "light1"];
      e.fighter.yaw = visualScenario?.enemy.yaw ?? e.startYaw;
      if (visualScenario?.enemy.health !== undefined) e.fighter.health = visualScenario.enemy.health;
      if (visualScenario?.enemy.stamina !== undefined) e.fighter.stamina = visualScenario.enemy.stamina;
      if (visualScenario) e.fighter.state = visualScenario.enemy.state;
      e.position.copy(e.start);
      e.overlaps.current.clear();
      e.hitboxActive.current = false;
      e.parryOverlaps.current.clear();
      e.parryActive.current = false;
      e.backstepAttackQueued.current = false;
      e.running.current = false;
      e.guardHitUntil = 0;
      e.criticalLeadInTime = 0;
      e.criticalByPair = null;
      e.criticalByAttack = null;
      e.moveSpeed.current = 0;
      e.actionTimeRef.current = 0;
      // Stealth off: every enemy starts engaged, today's fight (decision 0092).
      resetAwareness(e, visualScenario ? visualScenario.stealth?.startUnaware ?? false : pools.stealthStart);
      const enemyHandle = e.handle.current;
      if (enemyHandle) {
        enemyHandle.body.setTranslation(e.start, true);
        enemyHandle.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        enemyHandle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        enemyHandle.body.setRotation({
          x: 0,
          y: Math.sin(e.fighter.yaw / 2),
          z: 0,
          w: Math.cos(e.fighter.yaw / 2),
        }, true);
        enemyHandle.setMovement({ joystick: { x: 0, y: 0 }, run: false, jump: false });
      }
      setEnemyAnim(e, visualScenario?.enemy.animation ?? e.archetype.loadout.mainHand.animations.combatIdle, 0, true);
    }
    playerLocomotionReversing.current = false;
    playerMoveSpeed.current = 0;
    landingArmed.current = false;
    maximumDownwardSpeed.current = 0;
    landingTimer.current = 0;
    jumpStartTimer.current = 0;
    executionAlignmentStart.current = null;
    damagePulse.current = 0;
    hitStop.current = 0;
    shake.current = null;
    // Start behind the authored player facing. A fixed yaw of zero happened to
    // be correct for the usual south-facing spawn, but put the camera in front
    // of north-facing backstab scenes; lock-on then swung it through 180° at
    // the exact frame the paired action began.
    cameraYaw.current = playerStartYaw + Math.PI;
    cameraPitch.current = 0.34;
    if (visualScenario) {
      const initialDistance = 5.8;
      const initialHorizontal = Math.cos(cameraPitch.current) * initialDistance;
      cameraPosition.current.set(
        playerStart.x + Math.sin(cameraYaw.current) * initialHorizontal,
        playerStart.y + 1.15 + Math.sin(cameraPitch.current) * initialDistance,
        playerStart.z + Math.cos(cameraYaw.current) * initialHorizontal,
      );
      cameraLook.current.set(playerStart.x, playerStart.y + 0.55, playerStart.z);
    } else {
      cameraPosition.current.set(0, 3.4, 10);
      cameraLook.current.set(0, playerStart.y + 0.55, playerStart.z);
    }
    camera.position.copy(cameraPosition.current);
    camera.lookAt(cameraLook.current);
    message.current = visualScenario?.label ?? (resetToken > 0 ? text(CATALOGUE, "text.combat.fight-restarted") : text(CATALOGUE, "text.sandbox.combat-ready"));
    messageTimer.current = 1.2;
    setAnim(equipped.current ? playerWeapon.animations.combatIdle : "IDLE", 0, true);
    visualDriver.current?.reset();
    visualObserved.current.playerActions.clear();
    visualObserved.current.playerAnimations.clear();
    visualObserved.current.enemyActions.clear();
    visualObserved.current.enemyAnimations.clear();
    visualObserved.current.lastEvent = "";
    if (visualScenario) {
      window.__COMBAT_VISUAL_SCENARIO__ = {
        scenario: visualScenario.id,
        label: visualScenario.label,
        elapsed: 0,
        ready: false,
        done: false,
        playerAction: "idle",
        playerAnimation: equipped.current ? playerWeapon.animations.combatIdle : "IDLE",
        enemyAction: visualScenario.enemy.state,
        enemyAnimation: visualScenario.enemy.animation,
        playerHealth: playerHealth.current,
        enemyHealth: enemies[0]?.fighter.health ?? enemies[0]?.archetype.maxHealth ?? 0,
        actorDistance: null,
        observedPlayerActions: [],
        observedPlayerAnimations: [],
        observedEnemyActions: [],
        observedEnemyAnimations: [],
        events: [],
        playerHits: [],
        // The state each scene starts in, before the first step can change it.
        awarenessEvents: enemies[0]
          ? [{ time: 0, awareness: enemies[0].awareness.awareness, suspicion: enemies[0].awareness.suspicion }]
          : [],
        swimSamples: water ? [] : undefined,
        visualFrames: [],
      };
    }
    previousActiveCount.current = activeEnemies.length;
  }, [activeEnemies.length, camera, enemies, playerController, playerStart, playerStartYaw, resetToken, setAnim, setEnemyAnim, started, visualScenario, water]);

  // A scene about a weapon has to be holding it. Equipped through the ordinary
  // inventory rather than by assigning a loadout, so validation stays on the
  // production path — and in its own effect, because writing to a store the
  // component subscribes to re-renders it, and doing that inside the per-reset
  // effect made that effect run again mid-scene.
  useEffect(() => {
    const staged = visualScenario?.player;
    if (!staged) return;
    const { equip, unequip } = useInventoryStore.getState();
    // Off hand first: a two-handed weapon takes the slot with it, so clearing
    // afterwards would fight the equip rule rather than express the scene.
    if (staged.emptyOffHand) unequip("offHand");
    if (staged.weaponId) equip(staged.weaponId);
    // "offHand": a weapon named here is the second blade (dual wield); a
    // shield or a torch goes to the off hand either way.
    if (staged.offHandId) equip(staged.offHandId, "offHand");
    if (staged.ammoId) equip(staged.ammoId);
  }, [visualScenario]);

  // A torch lights as it is taken in hand, and goes dark when it leaves it.
  useEffect(() => {
    carriedLight.current = playerTorch ? igniteCarriedLight(playerTorch.light) : null;
    carriedLightLevel.current = 0;
  }, [playerTorch]);

  useEffect(() => {
    if (enemyEnabled) return;
    lockedOn.current = false;
    lockTargetIndex.current = -1;
    playerWeaponOverlaps.current.clear();
    playerOffWeaponOverlaps.current.clear();
    playerParryOverlaps.current.clear();
    playerHitboxActive.current = false;
    playerOffHitboxActive.current = false;
    playerParryActive.current = false;
    for (const e of enemies) {
      e.overlaps.current.clear();
      e.hitboxActive.current = false;
      e.parryOverlaps.current.clear();
      e.parryActive.current = false;
    }
  }, [enemies, enemyEnabled]);

  useFrame((_, rawDelta) => {
    if (!started) return;
    // The input reader keeps tracking the device behind the inventory, and only
    // the *game* stops.
    //
    // It used to stop too, which manufactured a phantom press: closing the
    // inventory with B left B physically down, and the next frame compared a
    // live "B is down" against an edge state frozen from before the screen
    // opened — so the FSM read a fresh press and the player backstepped out of
    // their own menu. `clearHeld` cannot fix this, because it can forget
    // keyboard and mouse state (which it owns) but not a gamepad button, which
    // the pad re-reports as held every frame regardless.
    //
    // Tracking continuously means a button held across the close produces no
    // edge until it is released and pressed again, which is the behaviour the
    // modal wanted in the first place.
    // Nothing else advances behind the inventory: not the clock, not the
    // enemies. A modal screen that leaves the fight running is a screen a
    // player cannot safely open.
    if (inventoryOpen) {
      input.setDesktopMeleeInput(!playerWeapon.stats.ranged);
      input.update();
      // Anything pressed while the screen is up (including the B that closes
      // it) must not produce a press OR release edge after the game resumes.
      input.suppressHeld();
      return;
    }
    const frameDelta = Math.min(rawDelta, 1 / 30);
    // Scripted scenarios push virtual input, so they run before the sample.
    // A controller can exist while its skinned actor is still streaming.
    // Begin warm-up only after the renderer has published each required pose.
    const visualActorsReady = playerVisualProbe.current.current !== null
      && (!visualScenario?.enemy.enabled || activeEnemies.every(e => e.visualProbe.current !== null));
    visualDriver.current?.apply(visualActorsReady ? frameDelta : 0, input);
    input.setDesktopMeleeInput(!playerWeapon.stats.ranged);
    input.update();
    let intent = inputToIntent(input);
    const dualWield = playerDualWield;
    let delta = frameDelta;
    if (hitStop.current > 0) {
      hitStop.current -= delta;
      delta *= 0.08;
    }
    const handle = player.current;
    if (!handle) return;
    const body = handle.body;
    const playerPos = handle.currPos;
    // Sync each enemy's cached position/speed from its physics body.
    for (const e of activeEnemies) {
      const enemyHandle = e.handle.current;
      if (enemyHandle) {
        e.position.copy(enemyHandle.currPos);
        e.moveSpeed.current = enemyHandle.moveSpeed;
      } else {
        e.moveSpeed.current = 0;
      }
    }
    // Visual scenarios get an input-free physics warm-up so controllers can
    // settle onto the floor. Do not advance combat states, targeting/facing,
    // landing detection, or action clocks until the scripted scene is armed.
    if (visualScenario && visualDriver.current && !visualDriver.current.ready) {
      handle.setMovement({ joystick: { x: 0, y: 0 }, run: false, jump: false });
      for (const e of activeEnemies) {
        e.handle.current?.setMovement({ joystick: { x: 0, y: 0 }, run: false, jump: false });
      }
      if (window.__COMBAT_VISUAL_SCENARIO__) {
        window.__COMBAT_VISUAL_SCENARIO__.elapsed = 0;
        window.__COMBAT_VISUAL_SCENARIO__.ready = false;
      }
      publishVisualFrameMarker(0);
      return;
    }
    // Swimming (decision 0093). Immersion over the body column (sampled at its
    // top, `SWIM_SAMPLE_ABOVE_BODY_CENTRE`) decides the mode, with hysteresis
    // (`swimStateFor`); the controller floats and strokes the body
    // while it swims. The weapon is put away on entry, as Skyrim's swim state
    // forces, and combat, jump and lock-on are refused while in the water.
    let swimSurface = 0;
    let swimGround: number | null = null;
    let swimFloor: number | null = null;
    if (water) {
      const centre = body.translation();
      const columnTop = swimScratch.current.chest.set(centre.x, centre.y + SWIM_SAMPLE_ABOVE_BODY_CENTRE, centre.z);
      const sample = water.sample(columnTop, 0);
      swimSurface = sample.surfaceHeight;
      const wasSwimming = playerController.movementMode === "swim";
      if (playerController.swimDriving || sample.waterBodyId !== null) {
        swimFloor = floorBelow(swimScratch.current.centre.set(centre.x, centre.y, centre.z), SWIM_FLOOR_SEARCH_METERS);
        if (swimFloor !== null && centre.y - swimFloor <= CHARACTER_BODY_CENTER_HEIGHT + SWIM_FEET_REACH) swimGround = swimFloor;
      }
      const mode = swimStateFor({
        immersion: sample.immersion,
        grounded: wasSwimming ? swimGround !== null : handle.isOnGround,
        current: playerController.movementMode,
      });
      if (mode !== playerController.movementMode) {
        playerController.setMovementMode(mode);
        if (mode === "swim") {
          equipped.current = false;
          if (playerAction.current !== "idle" && playerAction.current !== "dead") finishPlayerAction();
          lockedOn.current = false;
          lockTargetIndex.current = -1;
          playerStance.current = "standing";
          landingArmed.current = false;
          maximumDownwardSpeed.current = 0;
          landingTimer.current = 0;
          jumpStartTimer.current = 0;
        } else {
          swimExitGrace.current = SWIM_EXIT_GRACE_SECONDS;
        }
      }
      const eye = swimScratch.current.eye.set(centre.x, centre.y + PLAYER_EYE_OFFSET_Y, centre.z);
      submergedSeconds.current = submergedAt(water, eye) ? submergedSeconds.current + delta : 0;
    }
    const swimming = playerController.movementMode === "swim";
    swimFloating.current = swimming && swimGround === null;
    if (swimming) intent = swimmingIntent(intent);
    // ecctrl's ground report is stale until it has run again after a swim, so
    // for a moment after leaving the water the floor ray answers instead.
    swimExitGrace.current = Math.max(0, swimExitGrace.current - frameDelta);
    const playerGrounded = swimming
      ? false
      : swimExitGrace.current > 0 ? swimGround !== null : handle.isOnGround;
    // The model stands on the controller's ground; off it, over water, on the
    // floor under the body (a swimmer's feet hang over the pool floor, not over
    // the plane it last stood on).
    if (playerGrounded && swimExitGrace.current <= 0) playerSupportY.current = handle.standPoint.y;
    else if (swimFloor !== null) playerSupportY.current = swimFloor;
    const aliveEnemies = activeEnemies.filter((e) => e.fighter.health > 0);
    playerActionTime.current += delta;
    staminaCooldown.current -= delta;
    // The carried light burns on the game clock. The host says whether the
    // flame is under water (`lightEnvironment`, fed by the water sampler in
    // lane round 5); a spent torch is used up, taken out of the hand and out
    // of the pack.
    if (playerTorch && carriedLight.current) {
      carriedLightClock.current += delta;
      const flame = playerOffHandObject.current?.getWorldPosition(tmp.current.lightWorld) ?? playerPos;
      const environment = lightEnvironment?.({ x: flame.x, y: flame.y, z: flame.z })
        ?? { submerged: water ? submergedAt(water, flame) : false };
      const next = tickCarriedLight(carriedLight.current, playerTorch.light, delta, environment);
      carriedLight.current = next;
      carriedLightLevel.current = carriedLightIntensity(next, playerTorch.light, carriedLightClock.current);
      if (next.burntOut) {
        carriedLight.current = null;
        const store = useInventoryStore.getState();
        store.unequip("offHand");
        store.remove(playerTorch.id, 1);
        announce(text(CATALOGUE, "text.combat.torch-burnt-out"), 1.2);
      }
    } else {
      carriedLightLevel.current = 0;
    }
    const playerStatusTick = tickStatusEffects(playerStatus.current, delta);
    playerStatus.current = playerStatusTick.active;
    if (playerStatusTick.damage > 0 && playerHealth.current > 0) {
      playerHealth.current = Math.max(0, playerHealth.current - playerStatusTick.damage);
      if (playerHealth.current <= 0) {
        startPlayerAction("dead", "DEATH");
        combatAudio.play("death");
        announce(text(CATALOGUE, "text.combat.you-died"), 8);
      }
    }
    // Poise does not trickle back: it sits where the last hit left it and snaps
    // to full after a quiet interval (DS1). That is what makes it a breakpoint
    // stat rather than a second stamina bar.
    advancePoise(playerPoise.current, delta);
    messageTimer.current -= delta;
    landingTimer.current = Math.max(0, landingTimer.current - delta);
    jumpStartTimer.current = Math.max(0, jumpStartTimer.current - delta);
    if (messageTimer.current <= 0) message.current = "";

    const moveMagnitude = Math.min(1, Math.hypot(intent.move.x, intent.move.y));
    moveMagnitudeRef.current = moveMagnitude;
    // Landing is reported by the controller's own grounding, not visual soles
    // (the Skyrim actor carries no foot-contact solve).
    // A swimmer neither falls nor lands; ecctrl's grounding is off meanwhile.
    const playerHasVisualContact = playerGrounded;
    if (!swimming && !playerGrounded) landingArmed.current = true;
    if (!swimming && (landingArmed.current || !playerGrounded)) {
      maximumDownwardSpeed.current = Math.max(maximumDownwardSpeed.current, -handle.verticalSpeed);
    }
    if (landingArmed.current && playerHasVisualContact) {
      const touchdownVelocity = body.linvel();
      const landing = selectLandingAnimation({
        velocity: touchdownVelocity,
        impactSpeed: maximumDownwardSpeed.current,
      });
      landingAnimation.current = landing.animation;
      landingDuration.current = landing.duration;
      landingTimer.current = landing.duration;
      if (landing.impactSpeed > 2.5) triggerShake("landing");
      pendingNoise.current = Math.max(pendingNoise.current, NOISE_LOUDNESS.jumpLanding);
      maximumDownwardSpeed.current = 0;
      landingArmed.current = false;
    }
    if (intent.dodgePressed) dodgeHold.current = 0;
    if (intent.dodgeHeld) dodgeHold.current += delta;
    const jumpStarted = intent.jumpPressed && playerGrounded && playerStance.current !== "crouching"
      && playerAction.current === "idle" && spendStamina(COMBAT_TUNING.jumpCost);
    if (jumpStarted) {
      jumpStartTimer.current = JUMP_LAUNCH_ANIMATION_DURATION;
      landingTimer.current = 0;
      maximumDownwardSpeed.current = 0;
    }

    if (intent.lockOnPressed && enemyEnabled) {
      if (lockedOn.current) {
        lockedOn.current = false;
        lockTargetIndex.current = -1;
        announce(text(CATALOGUE, "text.combat.target-released"), 0.75);
      } else {
        let best = -1;
        let bestDist = Infinity;
        for (const e of aliveEnemies) {
          const d = (e.position.x - playerPos.x) ** 2 + (e.position.z - playerPos.z) ** 2;
          if (d < bestDist) { bestDist = d; best = e.id; }
        }
        if (best >= 0) {
          lockedOn.current = true;
          lockTargetIndex.current = best;
          announce(text(CATALOGUE, "text.combat.target-locked"), 0.75);
        }
      }
    }
    if (lockedOn.current && (intent.targetLeftPressed || intent.targetRightPressed) && aliveEnemies.length > 1) {
      switchTarget(intent.targetRightPressed ? 1 : -1, playerPos.x, playerPos.z);
    }
    if (lockedOn.current) {
      const current = lockTargetIndex.current >= 0 ? enemies[lockTargetIndex.current] : undefined;
      if (!current || current.fighter.health <= 0) {
        let best = -1;
        let bestDist = Infinity;
        for (const e of aliveEnemies) {
          const d = (e.position.x - playerPos.x) ** 2 + (e.position.z - playerPos.z) ** 2;
          if (d < bestDist) { bestDist = d; best = e.id; }
        }
        lockTargetIndex.current = best;
        lockedOn.current = best >= 0;
      }
    }
    const lockTarget = lockedOn.current && lockTargetIndex.current >= 0 ? enemies[lockTargetIndex.current] : null;
    const sprintInput = lockOnSprintAllowed(lockedOn.current)
      && intent.dodgeHeld
      && dodgeHold.current > 0.22
      && moveMagnitude > 0.15
      && playerAction.current === "idle";
    // In the water the same input is the sprint-swim, while stamina lasts.
    const swimSprintState = swimming
      ? swimSprint({ sprintInput, stamina: playerStamina.current, exhausted: swimSprintExhausted.current })
      : null;
    swimSprintExhausted.current = swimSprintState?.exhausted ?? false;
    const sprinting = swimSprintState ? swimSprintState.sprinting : sprintInput;
    sprintingRef.current = sprinting;
    // Crouch is a toggle resolved after sprint, because breaking into a run
    // stands you up — and it is refused mid-action, so you cannot duck out of
    // a swing. Leaving the ground clears it on its own.
    playerStance.current = nextStance(playerStance.current, {
      toggled: intent.crouchPressed,
      grounded: playerGrounded,
      acting: playerAction.current !== "idle",
      sprinting,
    });
    const crouching = playerStance.current === "crouching";
    playerMoveSpeed.current = Math.min(
      handle.moveSpeed,
      analogueMoveSpeed(moveMagnitude, sprinting, crouching ? CROUCH_SPEED : undefined),
    );

    if (playerAction.current === "roll" && equipped.current) {
      if (intent.lightPressed) rollAttackQueued.current = "light";
      if (intent.heavyPressed) rollAttackQueued.current = "heavy";
    }
    // With a blade in each hand the main hand's heavy is the both-blades
    // power attack (decision 0091).
    const mainHeavy = dualWield ? dualWield.dualPower : playerWeapon.attacks.heavy;
    // A riposte pressed *during* the parry is kept.
    //
    // The whole point of a parry is that you commit to it before you know it
    // worked, and the reward window opens while the parry clip is still
    // finishing. Requiring the follow-up press to land in the gap between the
    // two asks the player to wait out an animation they are already reading as
    // the opening — which is the wrong instinct to train.
    if (playerAction.current === "parry" && equipped.current && intent.lightPressed) {
      riposteQueued.current = RIPOSTE_QUEUE_WINDOW;
    } else if (playerAction.current !== "parry") {
      // The clock only runs once the parry is over. A press made early in a
      // long parry clip should not expire before the animation it was made
      // during has even finished.
      riposteQueued.current = Math.max(0, riposteQueued.current - delta);
    }
    // Tapping light during a backstep buys the dash-in attack: the retreat
    // completes, then the actor closes most of the ground it just gave up and
    // swings. Queued here rather than on release so the input is read during
    // the animation, exactly as the roll attack is.
    if (playerAction.current === "backstep" && equipped.current && intent.lightPressed) {
      backstepAttackQueued.current = true;
    }

    // --- The bow -----------------------------------------------------------
    // A bow is a cycle rather than a moveset, so it runs before the melee state
    // machine and takes the action for as long as it is raised. `advanceBowCycle`
    // owns every rule about it; everything here is the parts a reducer cannot
    // do — where the camera looks, which arrow leaves the string, and what the
    // quiver loses.
    playerBowPoseTime.current = null;
    const ranged = playerWeapon.stats.ranged;
    const bowAnimations = playerWeapon.animations.bow;
    // Death outranks the aim. The cycle is not part of the melee action FSM, so
    // a killing blow landing mid-aim used to set the action to "dead" and then
    // have this block overwrite it with "aim" on the very next frame — the
    // player stayed up, kept moving and kept shooting, and could not die.
    const playerDead = playerAction.current === "dead" || playerHealth.current <= 0;
    if (ranged && bowAnimations && equipped.current) {
      // Everything the bow does in the player's hands comes from one skill.
      const skillState = settingsRef.current;
      const rangedModifiers = playerRangedModifiers(skillState.skillsEnabled, skillState.marksmanSkill);
      const raised = isAiming(bowCycle.current);
      const bowStep = advanceBowCycle(
        bowCycle.current,
        {
          aimPressed: intent.lightPressed && (raised || playerAction.current === "idle"),
          aimHeld: intent.lightHeld,
          // An empty quiver lowers the bow: there is nothing to nock, and
          // standing in a first-person aim with no arrow is a dead end.
          exitPressed: intent.aimExitPressed || !playerQuiver,
          interrupted: playerDead,
        },
        ranged,
        playerStamina.current,
        delta,
        rangedModifiers,
      );
      bowCycle.current = bowStep.cycle;
      if (bowStep.staminaSpent > 0) {
        playerStamina.current = Math.max(0, playerStamina.current - bowStep.staminaSpent);
        staminaCooldown.current = COMBAT_TUNING.staminaRegenDelay;
      }
      if (bowStep.entered) {
        aimPitch.current = 0;
        aimZoom.current = 0;
        startPlayerAction("aim", bowAnimations.idle, 0, undefined, null, false);
      }
      // Kept current every frame the bow is up: the nocked shaft points along
      // it, and the shot leaves along it.
      //
      // The line is solved, not copied from the camera. The crosshair is a ray
      // out of the camera; the shot starts at the nock, which is off to one
      // side of it and lower — so a shot fired *parallel* to the camera runs
      // beside the sight line forever, low and to the left by exactly that
      // offset. Both are now aimed at the point the ray hits, and the body and
      // `bowSight` then applies the shared configured launch attitude. Body, spine,
      // nocked shaft and released arrow all consume that same direction.
      if (isAiming(bowStep.cycle)) {
        camera.getWorldDirection(tmp.current.aimLook);
        const rayOrigin = camera.position;
        aimRay.current.origin = rayOrigin;
        aimRay.current.dir = tmp.current.aimLook;
        const crosshairHit = world.castRay(
          aimRay.current,
          AIM_CONVERGENCE_FAR_METERS,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          // Sensors are hurtboxes, parry volumes and arrow probes; the
          // crosshair lands on solid geometry, not on the measuring kit. The
          // archer's own body is skipped for the same reason.
          (collider) => !collider.isSensor() && collider.parent()?.handle !== body.handle
            && !isActorCapsuleName(rigidBodyStates.get(collider.parent()?.handle ?? -1)?.object.name),
        );
        let point = aimConvergencePoint(
          rayOrigin,
          tmp.current.aimLook,
          crosshairHit ? crosshairHit.timeOfImpact : null,
        );
        const skin = traceActorArrow(rayOrigin, tmp.current.aimLook,
          crosshairHit?.timeOfImpact ?? AIM_CONVERGENCE_FAR_METERS, PLAYER_HURTBOX_NAME);
        if (skin) point = skin.point;
        const nockOrigin = playerNockWorld.current.lengthSq() > 1e-8
          ? playerNockWorld.current
          : tmp.current.aimRayFallback.set(playerPos.x, playerPos.y + PLAYER_EYE_OFFSET_Y, playerPos.z);
        const sight = bowSight({ nock: nockOrigin, point, actor: playerPos,
          cameraYaw: cameraYaw.current });
        const converged = sight.direction;
        playerAimDirection.current.set(converged.x, converged.y, converged.z);
        tmp.current.aimDirection.copy(playerAimDirection.current);
        playerAimBodyYaw.current = sight.yaw;
        playerAimSpinePitch.current = sight.pitch;
        playerAimErrorDegrees.current = angleBetweenDegrees(converged, {
          x: tmp.current.aimLook.x, y: tmp.current.aimLook.y, z: tmp.current.aimLook.z,
        });
      }
      playerBowDrawFraction.current = bowStep.cycle.phase === "drawing" ? Math.max(1e-6, bowStep.cycle.drawFraction)
        : 0;
      if (bowStep.shot) playerBowRelease.current += 1;
      playerNockVisible.current = nockedArrowVisible(
        bowStep.cycle,
        rangedModifiers.nockSpeed,
      );
      {
        const view = firstPersonState.current;
        view.rootPosition.set(playerPos.x, playerPos.y - CHARACTER_BODY_CENTER_HEIGHT, playerPos.z);
        view.yaw = cameraYaw.current + Math.PI;
        // Camera/crosshair pitch stays direct; the arms follow the elevated
        // launch vector shared by the visible shaft and the released arrow.
        view.pitch = playerAimSpinePitch.current;
        view.drawFraction = bowStep.cycle.phase === "drawing" ? bowStep.cycle.drawFraction : 0;
        view.drawing = bowStep.cycle.phase === "drawing";
        view.move.x = intent.move.x;
        view.move.y = intent.move.y;
        view.moveMagnitude = moveMagnitude;
      }
      if (bowStep.shot && playerQuiver) {
        const arrow = playerQuiver.arrow;
        const speed = launchSpeed(ranged, arrow.physics, bowStep.shot.drawFraction);
        // From the string, along the shot. It used to leave from a point
        // ahead of the *eye*, visibly beside the drawn arrow.
        tmp.current.arrowOrigin
          .copy(playerNockWorld.current)
          .addScaledVector(tmp.current.aimDirection, ARROW_SPAWN_AHEAD_METERS);
        fireArrow({
          arrow,
          shooter: PLAYER_HURTBOX_NAME,
          origin: [tmp.current.arrowOrigin.x, tmp.current.arrowOrigin.y, tmp.current.arrowOrigin.z],
          velocity: [
            tmp.current.aimDirection.x * speed,
            tmp.current.aimDirection.y * speed,
            tmp.current.aimDirection.z * speed,
          ],
        });
        consumeArrow(arrow.id, 1);
        combatAudio.play("swing");
      }
      if (bowStep.exited) {
        aimPitch.current = 0;
        aimZoom.current = 0;
        playerAimSpinePitch.current = 0;
        playerNockVisible.current = false;
        // Not when the archer died holding it: the death action owns the actor
        // from the moment it is set, and finishing "aim" would put it back on
        // its feet — which is precisely the bug this closes.
        if (playerAction.current === "aim") finishPlayerAction();
      } else if (isAiming(bowStep.cycle)) {
        const pose = bowPose(
          bowStep.cycle,
          bowAnimations,
          bowTravelFor(intent.move, moveMagnitude),
          rangedModifiers.nockSpeed,
        );
        if (pose.animation !== playerAnimationCommand.current.state) {
          startPlayerAction("aim", pose.animation);
        }
        // A bow stride is timed by the ground it covers, like any other — and
        // the aim's own move speed comes from that same measurement, so the
        // drawn stride plays at rate 1 with its feet planted instead of being
        // scrubbed to chase a hand-set number.
        const authored = clipAuthoredGroundSpeed(pose.animation);
        aimMoveSpeed.current = authored && authored >= MIN_AUTHORED_GROUND_SPEED
          ? Math.min(authored, AIM_MOVE_SPEED_CEILING)
          : AIM_MOVE_SPEED;
        playerAnimationSpeed.current = locomotionSpeedMultiplier(
          pose.animation,
          playerMoveSpeed.current,
        );
        // The draw's clip time *is* its draw fraction: the pose is the state.
        playerBowPoseTime.current = pose.clipTime;
      }
      aimBlendAmount.current = aimBlend(bowCycle.current);
    } else if (isAiming(bowCycle.current)) {
      // The bow was unequipped, swapped or dropped mid-aim — or the archer
      // died holding it. Either way the aim closes and the camera comes back.
      bowCycle.current = IDLE_BOW_CYCLE;
      aimBlendAmount.current = 0;
      aimPitch.current = 0;
      aimZoom.current = 0;
      playerAimSpinePitch.current = 0;
      playerNockVisible.current = false;
      if (playerAction.current === "aim") finishPlayerAction();
    }
    if (!isAiming(bowCycle.current)) {
      bowAimCentredTarget.current = null;
      bowAimDetachedFromTarget.current = false;
      bowAimSnapTarget.current = null;
    }

    const canStartAction = playerAction.current === "idle" || playerAction.current === "guard";
    if (canStartAction && intent.equipPressed) {
      equipped.current = !equipped.current;
      startPlayerAction(equipped.current ? "equip" : "unequip", equipped.current ? playerWeapon.animations.equip : playerWeapon.animations.unequip);
      announce(equipped.current ? playerWeapon.label : text(CATALOGUE, "text.combat.weapon-stowed"));
    } else if (canStartAction && intent.healPressed && estus.current > 0 && playerHealth.current < playerMaxHealth) {
      estus.current -= 1;
      startPlayerAction("heal", "HEAL");
      combatAudio.play("heal");
    } else if (canStartAction && dualWield && intent.offHeavyPressed && equipped.current && spendStamina(dualWield.offPower.stamina)) {
      // Dual wield: the guard control is the off hand's attack. No block, no parry.
      startPlayerAction(dualWield.offPower.id, dualWield.offPower.animation, 0, undefined, null, true, dualWield.offPower);
      combatAudio.play("swing");
    } else if (canStartAction && dualWield && intent.offLightPressed && equipped.current && spendStamina(dualWield.offLight.stamina)) {
      startPlayerAction(dualWield.offLight.id, dualWield.offLight.animation, 0, undefined, null, true, dualWield.offLight);
      combatAudio.play("swing");
    } else if (canStartAction && !dualWield && intent.parryPressed && equipped.current && spendStamina(COMBAT_TUNING.parryCost)) {
      startPlayerAction("parry", playerGuardAnimations.parry.intro);
      announce(text(CATALOGUE, "text.combat.parry"), 0.55);
    } else if (canStartAction && intent.heavyPressed && equipped.current && spendStamina(mainHeavy.stamina)) {
      // The weapon's own heavy, not the reference sword's. Hard-coding the
      // semantic here was invisible while there was one moveset and became a
      // greatsword opening with a one-handed swing the moment there were three.
      startPlayerAction(mainHeavy.id, mainHeavy.animation, 0, undefined, null, true, mainHeavy);
      combatAudio.play("swing");
    } else if (canStartAction && (intent.lightPressed || riposteQueued.current > 0) && equipped.current) {
      // Riposte the nearest enemy we just parried; otherwise backstab the
      // nearest enemy we are standing behind; otherwise a normal light attack.
      let riposteVictim: EnemyRuntime | null = null;
      let backstabVictim: EnemyRuntime | null = null;
      let bestRiposte = Infinity;
      let bestBackstab = Infinity;
      for (const e of activeEnemies) {
        if (e.fighter.health <= 0) continue;
        const dist = Math.hypot(e.position.x - playerPos.x, e.position.z - playerPos.z);
        if (e.fighter.state === "parried" && e.fighter.actionTime < RIPOSTE_WINDOW && dist < 2 && dist < bestRiposte) {
          bestRiposte = dist;
          riposteVictim = e;
        }
        const behind = canBackstabState(e.fighter.state)
          && isBackstabPosition(
            { x: Math.sin(e.fighter.yaw), z: Math.cos(e.fighter.yaw) },
            { x: playerPos.x - e.position.x, z: playerPos.z - e.position.z },
            dist,
          );
        if (behind && dist < bestBackstab) {
          bestBackstab = dist;
          backstabVictim = e;
        }
      }
      // A queued press only buys the execution it was queued for. Without this
      // it would also fire an ordinary swing a beat after the parry, which is
      // not what the player asked for and eats their stamina.
      //
      // It must *wait*, though, rather than give up. This used to zero the queue
      // the first frame the player was free, which is normally the frame the
      // parry clip ends — before the stagger has settled into a riposteable
      // pose, or while the victim is still being pushed inside range. The queued
      // press then bought nothing at all, which is the reported symptom. Leaving
      // the timer to run means the press is honoured any time in its window and
      // simply lapses if the opening never comes.
      if (!intent.lightPressed && !riposteVictim) {
        // Waiting, not cancelled: `riposteQueued` decays on its own clock.
      } else {
      const victim = riposteVictim ?? backstabVictim;
      const attack = riposteVictim
        ? playerWeapon.attacks.riposte
        : backstabVictim
          ? playerWeapon.attacks.backstab
          : playerWeapon.attacks.light1;
      const criticalPair = attack.id === "riposte"
        ? playerWeapon.animations.riposte
        : attack.id === "backstab"
          ? playerWeapon.animations.backstab
          : null;
      if (spendStamina(attack.stamina)) {
        startPlayerAction(attack.id, attack.animation, 0, undefined, criticalPair?.entryBlendDuration ?? null, true, attack);
        if (criticalPair && victim && (attack.id === "backstab" || attack.id === "riposte")) {
          const priorVictimAnimation = victim.animCommand.current.state;
          const priorVictimTime = victim.fighter.actionTime;
          executionVictim.current = victim;
          executionAlignmentStart.current = {
            position: playerPos.clone(),
            yaw: Math.atan2(handle.bodyZAxis.x, handle.bodyZAxis.z),
          };
          victim.fighter.criticalType = attack.id;
          victim.fighter.criticalVictimYaw = victim.fighter.yaw;
          // Where the victim stands for the whole execution. Recorded now and
          // held, because the attacker is about to be placed at the profile's
          // measured separation from it and a dynamic victim would simply be
          // pushed away by the arriving capsule.
          victim.fighter.criticalVictimAnchor = { x: victim.position.x, z: victim.position.z };
          // The attacker's choreography drives the victim for the duration.
          victim.criticalByPair = criticalPair;
          victim.criticalByAttack = attack;
          const type = attack.id;
          const pair = criticalPair;
          const forward = tmp.current.forward.set(Math.sin(victim.fighter.criticalVictimYaw), 0, Math.cos(victim.fighter.criticalVictimYaw));
          tmp.current.cameraRight.set(forward.z, 0, -forward.x);
          tmp.current.toEnemy.copy(cameraPosition.current).sub(victim.position);
          executionCameraSide.current = tmp.current.toEnemy.dot(tmp.current.cameraRight) < 0 ? -1 : 1;
          body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
          const attackerYaw = executionFacingYaw(victim.fighter.criticalVictimYaw, type, pair.relativeFacing);
          playerAttackDirection.current.set(Math.sin(attackerYaw), 0, Math.cos(attackerYaw));
          handle.setForwardDir(playerAttackDirection.current);
          handle.setLockForward(true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          const victimHandle = victim.handle.current;
          if (victimHandle) {
            victimHandle.setForwardDir(forward);
            victimHandle.setLockForward(true);
            victimHandle.body.setLinvel({ x: 0, y: victimHandle.body.linvel().y, z: 0 }, true);
            victimHandle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          }
          // A true paired HKX starts both roles together. Event-driven Rim
          // executions instead hold the parried victim vulnerable until an
          // attacker annotation dispatches the independent hit reaction.
          const victimPlayback = criticalVictimPlaybackAt(0, attack, pair);
          const continueExistingLeadIn = victimPlayback.phase === "leadIn"
            && priorVictimAnimation === victimPlayback.action;
          if (continueExistingLeadIn) {
            // The parry already owns the exact rendered GUARD_BREAK pose. Only
            // transfer FSM ownership and freeze that clock; restarting the
            // same semantic at a canned time caused an obvious arms-out pop.
            victim.criticalLeadInTime = priorVictimTime;
            victim.fighter.state = "critical";
            victim.fighter.attackHit = false;
            victim.guardHitUntil = 0;
          } else {
            victim.criticalLeadInTime = victimPlayback.startAt;
            setEnemyMode(
              victim,
              "critical",
              victimPlayback.action,
              victimPlayback.startAt,
              pair.entryBlendDuration,
            );
          }
          lockedOn.current = true;
          lockTargetIndex.current = victim.id;
          announce(type === "backstab" ? text(CATALOGUE, "text.combat.backstab") : text(CATALOGUE, "text.combat.riposte"), 1.4);
        }
        combatAudio.play("swing");
        riposteQueued.current = 0;
      }
      }
    } else if (playerAction.current === "idle" && intent.guardHeld && equipped.current && !ranged && !dualWield) {
      startPlayerAction("guard", playerGuardAnimations.enter);
      announce(text(CATALOGUE, "text.combat.guarding"), 0.55);
    } else if (
      playerAction.current === "guard"
      && !intent.guardHeld
      && playerActionTime.current >= guardHitUntil.current
    ) {
      // Button-up cannot cancel an authored block-stun reaction. The input is
      // already released; exit when GUARD_HIT reaches its boundary below.
      finishPlayerAction();
    }

    if (intent.dodgeReleased && dodgeHold.current <= 0.28 && canStartAction && spendStamina(moveMagnitude > 0.15 ? COMBAT_TUNING.rollCost : COMBAT_TUNING.backstepCost)) {
      const action = moveMagnitude > 0.15 ? "roll" : "backstep";
      startPlayerAction(action, action === "roll" ? "ROLL" : "BACKSTEP");
      combatAudio.play("roll");
      if (moveMagnitude > 0.15) {
        const direction = cameraRelativeDirection(intent.move, cameraYaw.current);
        dodgeDirection.current.set(direction.x, direction.y, direction.z).normalize();
      } else {
        dodgeDirection.current.copy(handle.bodyZAxis).multiplyScalar(-1).setY(0).normalize();
      }
      const initialSpeed = action === "roll" ? PLAYER_DODGE_SPEED.roll : PLAYER_DODGE_SPEED.backstep;
      backstepOrigin.current.copy(playerPos);
      body.setLinvel({
        x: dodgeDirection.current.x * initialSpeed,
        // BACKSTEP's corrected source preserves its authored vertical COM hop.
        // Adding a second capsule launch here made the actor rise and drop
        // twice, forcing a visible grounding counter-jump and body bob.
        y: body.linvel().y,
        z: dodgeDirection.current.z * initialSpeed,
      }, true);
    }

    const attack = playerAttack.current;
    if (attack) {
      const phase = phaseAt(playerActionTime.current, attack);
      const weaponActive = isWeaponHitboxActive(playerActionTime.current, attack);
      const transitionAt = comboTransitionTime(attack);
      const execution = attack.id === "riposte" ? "riposte" : attack.id === "backstab" ? "backstab" : null;
      const criticalPair = execution
        ? execution === "riposte" ? playerWeapon.animations.riposte : playerWeapon.animations.backstab
        : null;
      const executionProgress = playerActionTime.current / attackDuration(attack);
      const victim = executionVictim.current;
      // One sensor per hand, armed by the attack's `hand` (dual wield).
      const hand = attack.hand ?? "main";
      const armed = weaponActive && equipped.current && enemyEnabled && aliveEnemies.length > 0;
      playerHitboxActive.current = armed && hand !== "off";
      playerOffHitboxActive.current = armed && hand !== "main" && Boolean(playerOffWeapon);
      if (
        execution
        && criticalPair
        && victim
        && executionProgress < criticalPair.releaseProgress
        && (victim.fighter.state === "critical"
          || victim.fighter.state === "criticalRecovery"
          || victim.fighter.state === "dead")
      ) {
        const victimForward = tmp.current.forward.set(Math.sin(victim.fighter.criticalVictimYaw), 0, Math.cos(victim.fighter.criticalVictimYaw));
        const anchor = executionAnchor(victim.position, victimForward, execution, criticalPair.startingSeparation);
        const alignmentStart = executionAlignmentStart.current;
        const rawAlignmentProgress = criticalPair.entryBlendDuration <= 0
          ? 1
          : Math.min(1, playerActionTime.current / criticalPair.entryBlendDuration);
        const alignmentProgress = rawAlignmentProgress * rawAlignmentProgress * (3 - 2 * rawAlignmentProgress);
        body.setTranslation({
          x: THREE.MathUtils.lerp(alignmentStart?.position.x ?? anchor.x, anchor.x, alignmentProgress),
          y: playerPos.y,
          z: THREE.MathUtils.lerp(alignmentStart?.position.z ?? anchor.z, anchor.z, alignmentProgress),
        }, true);
        body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
        const targetYaw = executionFacingYaw(victim.fighter.criticalVictimYaw, execution, criticalPair.relativeFacing);
        const startYaw = alignmentStart?.yaw ?? targetYaw;
        const yawDelta = Math.atan2(Math.sin(targetYaw - startYaw), Math.cos(targetYaw - startYaw));
        tmp.current.quaternion.setFromAxisAngle(UP, startYaw + yawDelta * alignmentProgress);
        body.setRotation(tmp.current.quaternion, true);
      } else if (footDrivenMotion && attackDashDistance.current <= 0 && hasGroundTrack(attack.animation)) {
        // Movement from the clip's own feet, for the whole action rather than
        // just the wind-up. `footAnchoredVelocity` is the derivative of the
        // distance the planted sole actually covered, so a swing that plants
        // and stays planted moves the body by nothing at all — which is most of
        // what the authored lunge was getting wrong.
        // Capped by the lunge it replaces, so this can only ever move the
        // actor less than today's behaviour — see `footAnchoredMotion`.
        // The whole measured track, uncapped: forward *and* lateral. A
        // pivoting clip (the one-handed HEAVY, the greatsword HEAVY_2) turns
        // the body round its planted foot and carries it metres sideways, and
        // that is where the body goes — the attack does not track its target
        // (owner ruling 2026-09-04: the player positions for the swing they
        // committed to, as they would learn any moveset). Round 5 applied the
        // forward part only, capped by the authored lunge, which kept the
        // attack on target by letting the planted foot skate.
        const step = footAnchoredVelocity(attack.animation, playerActionTime.current, delta);
        const motion = localMotionToWorld(step, playerAttackDirection.current);
        body.setLinvel({ ...motion, y: body.linvel().y }, true);
      } else if (phase === "windup" && (attack.lunge > 0 || attackDashDistance.current > 0)) {
        const dashSpeed = attackDashDistance.current > 0 && attack.windup > 0
          ? attackDashDistance.current / attack.windup
          : attack.lunge;
        body.setLinvel({
          x: playerAttackDirection.current.x * dashSpeed,
          y: body.linvel().y,
          z: playerAttackDirection.current.z * dashSpeed,
        }, true);
      } else if (phase === "recovery") {
        body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
      }
      if (phase !== "windup") attackDashDistance.current = 0;
      const comboInputOpen = comboQueueOpen(playerActionTime.current, playerActionTime.current - delta, attack);
      if (comboInputOpen) {
        if (intent.lightPressed && (attack.id === "light1" || attack.id === "light2")) comboQueued.current = "light";
        if (intent.heavyPressed && attack.id === "heavy") comboQueued.current = "heavy";
      }
      if (weaponActive && enemyEnabled) {
        // A parrying enemy whose weapon clashes with an ordinary attack breaks
        // it. Critical executions already own a paired victim and grant the
        // attacker invulnerability; allowing a third actor to parry that
        // locked choreography abandoned the victim in `critical` while the
        // player switched to GUARD_BREAK.
        let parriedBy: EnemyRuntime | null = null;
        // Same one-outcome rule as the player's parry: a swing that already
        // landed cannot then also be parried.
        if (!execution && !playerAttackHit.current) {
          for (const e of activeEnemies) {
            // The Souls rule (owner 2026-09-05): a parry catches by TIMING.
            // Anything the blade reaches — the catch volume, the weapon, or
            // the body itself — while the catch is active is parried.
            if (
              e.fighter.state === "parry"
              && isParryActive(e.fighter.actionTime, activeGuardAnimations(e.archetype.loadout).parry)
              && (
                (playerHitboxActive.current && (
                  e.parryOverlaps.current.has("player-weapon")
                  || e.overlaps.current.has("player-weapon")
                  || playerWeaponOverlaps.current.has(e.hurtboxName)))
                || (playerOffHitboxActive.current && (
                  e.parryOverlaps.current.has(PLAYER_OFF_HAND_WEAPON)
                  || e.overlaps.current.has(PLAYER_OFF_HAND_WEAPON)
                  || playerOffWeaponOverlaps.current.has(e.hurtboxName)))
              )
            ) {
              parriedBy = e;
              break;
            }
          }
        }
        if (parriedBy) {
          playerAttackHit.current = true;
          playerHandHit.current.main = true;
          playerHandHit.current.off = true;
          startPlayerAction("guardBreak", playerWeapon.animations.guardBreak);
          body.setLinvel(blockRecoilVelocity(
            playerPos,
            parriedBy.position,
            body.linvel().y,
            PARRY_RECOIL_SPEED,
          ), true);
          // Keep the successful defender in its authored parry and follow-
          // through. Cutting directly to idle here made the enemy pop upright
          // in the exact interaction where its motion should read most clearly.
          parriedBy.hitboxActive.current = false;
          combatAudio.play("parry");
          triggerShake("parry");
          announce(text(CATALOGUE, "text.combat.attack-parried"), 1.1);
        } else if (!playerAttackHit.current && execution && criticalPair && victim && victim.fighter.state === "critical") {
          const pairedContact = executionProgress >= criticalPair.damageProgress
            && executionProgress < criticalPair.releaseProgress
            && executionBladeIntersectsVictim(executionProgress, criticalPair.startingSeparation)
            && Math.abs(Math.hypot(victim.position.x - playerPos.x, victim.position.z - playerPos.z) - criticalPair.startingSeparation) < 0.28;
          if (pairedContact) {
            playerAttackHit.current = damageEnemy(victim, execution);
            playerHandHit.current.main = playerAttackHit.current;
          }
        } else {
          // Normal swing: each armed hand strikes the nearest living enemy its
          // blade overlaps, once per attack (dual wield lands one blow per hand).
          const blades = [
            { hand: "main" as const, armed: playerHitboxActive.current, overlaps: playerWeaponOverlaps.current },
            { hand: "off" as const, armed: playerOffHitboxActive.current, overlaps: playerOffWeaponOverlaps.current },
          ];
          for (const blade of blades) {
            if (!blade.armed || playerHandHit.current[blade.hand]) continue;
            let hitEnemy: EnemyRuntime | null = null;
            let hitDist = Infinity;
            for (const e of activeEnemies) {
              if (e.fighter.health <= 0) continue;
              const overlapsBody = blade.overlaps.has(e.hurtboxName);
              const guardClash = e.fighter.state === "guard" && blade.overlaps.has(e.weaponName);
              if (!overlapsBody && !guardClash) continue;
              const d = (e.position.x - playerPos.x) ** 2 + (e.position.z - playerPos.z) ** 2;
              if (d < hitDist) { hitDist = d; hitEnemy = e; }
            }
            if (!hitEnemy) continue;
            // Mirror of the player's parry grace: give a defending enemy's
            // active catch a few frames to claim this swing before the damage
            // forecloses it (the parry check above requires !playerAttackHit).
            const enemyCatchActive = hitEnemy.fighter.state === "parry"
              && isParryActive(hitEnemy.fighter.actionTime, activeGuardAnimations(hitEnemy.archetype.loadout).parry);
            if (enemyCatchActive && hitEnemy.parryContactGrace < PARRY_HIT_GRACE_SECONDS) {
              hitEnemy.parryContactGrace += delta;
            } else {
              hitEnemy.parryContactGrace = 0;
              playerHandHit.current[blade.hand] = damageEnemy(hitEnemy, null, blade.hand);
              playerAttackHit.current = playerHandHit.current.main || playerHandHit.current.off;
            }
            // A blocked blow recoils the attacker out of the swing: the other hand is done too.
            if (playerAttack.current !== attack) break;
          }
        }
      }
      const nextAttack = getComboSuccessor(attack, comboQueued.current, playerWeapon);
      if (nextAttack && playerActionTime.current >= transitionAt) {
        if (nextAttack && spendStamina(nextAttack.stamina)) {
          const successorStart = comboEntryTime(nextAttack) + comboSuccessorStartTime(playerActionTime.current, attack);
          startPlayerAction(
            nextAttack.id,
            nextAttack.animation,
            successorStart,
            playerAttackDirection.current,
            comboCrossFadeDuration(attack, nextAttack),
            true,
            nextAttack,
          );
          combatAudio.play("swing");
        } else {
          comboQueued.current = null;
        }
      } else if (phase === "none") {
        finishPlayerAction();
      }
    } else {
      playerOffHitboxActive.current = false;
      playerHitboxActive.current = playerAction.current === "guard"
        || (playerAction.current === "parry" && isParryActive(playerActionTime.current, playerGuardAnimations.parry));
      playerParryActive.current = playerAction.current === "parry"
        && isParryActive(playerActionTime.current, playerGuardAnimations.parry);
      if (playerAction.current === "guard"
        && playerActionTime.current >= Math.max(
          clipConfig(playerGuardAnimations.enter).sourceDuration ?? 0.83,
          guardHitUntil.current,
        )) {
        if (intent.guardHeld) setAnim(playerGuardAnimations.loop);
        else finishPlayerAction();
      }
      if (playerAction.current === "parry"
        && playerActionTime.current >= (clipConfig(playerGuardAnimations.parry.intro).sourceDuration ?? 0.83)) {
        setAnim(playerGuardAnimations.parry.followThrough);
      }
      // A parry's length is its own clip pair's, not one shared constant: the
      // catch runs to the end of the follow-through, and the two-handed pairs
      // are longer than the 1.1 s the constant assumed.
      const duration = playerAction.current === "parry"
        ? parryActionDuration(playerGuardAnimations.parry)
        : ACTION_DURATIONS[playerAction.current];
      if (playerAction.current === "heal" && playerActionTime.current > 0.82 && !healedThisAction.current) {
        healedThisAction.current = true;
        playerHealth.current = Math.min(playerMaxHealth, playerHealth.current + COMBAT_TUNING.healAmount);
      }
      if (duration && playerActionTime.current >= duration) {
        if (playerAction.current === "roll" && rollAttackQueued.current) {
          const queued = rollAttackQueued.current;
          const queuedAttack = queued === "heavy" ? mainHeavy : playerWeapon.attacks.light1;
          const direction = resolveAttackDirection(intent.move, cameraYaw.current, handle.bodyZAxis);
          tmp.current.movement.set(direction.x, 0, direction.z).normalize();
          if (spendStamina(queuedAttack.stamina)) {
            tmp.current.quaternion.setFromAxisAngle(UP, Math.atan2(tmp.current.movement.x, tmp.current.movement.z));
            handle.setForwardDir(tmp.current.movement);
            handle.setLockForward(true);
            body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            body.setRotation(tmp.current.quaternion, true);
            body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
            startPlayerAction(queuedAttack.id, queuedAttack.animation, 0, tmp.current.movement, null, true, queuedAttack);
            combatAudio.play("swing");
          } else {
            rollAttackQueued.current = null;
            finishPlayerAction();
          }
        } else if (playerAction.current === "backstep" && backstepAttackQueued.current) {
          // The retreat is over; close most of the ground it made and swing.
          // The dash is measured from the distance actually travelled rather
          // than assumed, so it stays correct if the backstep is retuned or
          // gets cut short by a wall.
          const queuedAttack = playerWeapon.attacks.light1;
          const travelled = Math.hypot(
            playerPos.x - backstepOrigin.current.x,
            playerPos.z - backstepOrigin.current.z,
          );
          backstepAttackQueued.current = false;
          if (spendStamina(queuedAttack.stamina)) {
            tmp.current.movement
              .copy(dodgeDirection.current)
              .multiplyScalar(-1)
              .setY(0)
              .normalize();
            tmp.current.quaternion.setFromAxisAngle(UP, Math.atan2(tmp.current.movement.x, tmp.current.movement.z));
            handle.setForwardDir(tmp.current.movement);
            handle.setLockForward(true);
            body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            body.setRotation(tmp.current.quaternion, true);
            startPlayerAction(queuedAttack.id, queuedAttack.animation, 0, tmp.current.movement, null, true, queuedAttack);
            attackDashDistance.current = travelled * BACKSTEP_ATTACK_DASH_FRACTION;
            combatAudio.play("swing");
          } else {
            finishPlayerAction();
          }
        } else {
          finishPlayerAction();
        }
      }
    }

    // Guarding is a planted stance: raising the weapon commits the feet, and
    // the guard clips are authored standing still, so any residual travel
    // would drag a stationary pose across the floor.
    const guarding = playerAction.current === "guard";
    const aiming = playerAction.current === "aim";
    const bowFootworkState = playerAnimationCommand.current.state;
    const bowFootworkCommitted = COMMITTED_BOW_FOOTWORK.has(bowFootworkState);
    // Draw, release and bow handling are authored as planted one-shots. Let
    // their measured feet move the actor just as melee attacks do; full-draw
    // locomotion remains steerable through its dedicated loop clips.
    // A swimmer's body is the controller's swim drive's, below.
    const movementAllowed = !swimming && (playerAction.current === "idle" || aiming) && !bowFootworkCommitted;
    movementAllowedRef.current = movementAllowed;
    // Locked-on movement plays WALK_BACK / the strafes, and by default moves
    // at the speed those clips were authored for — the same rule as the
    // crouch: the speed follows the animation, so the planted foot is the
    // anchor and nothing scrubs. The fixed locked-on walk (with the clip's
    // cadence scaled to chase it) is kept behind the debug switch.
    // Forward is deliberately *not* one of these (owner round 8): pushing
    // towards the target falls through to the ordinary locomotion selection
    // and the ordinary free-roam speed, so a locked-on advance is the normal
    // run. `lockedStrideClip` returns null there.
    const lockedClip = lockedOn.current && moveMagnitude > 0.08 && playerAction.current === "idle"
      ? lockedStrideClip(intent.move, moveMagnitude, playerLocomotionReversing.current)
      : null;
    const crouchMoving = crouching && moveMagnitude > 0.08 && playerAction.current === "idle";
    // Foot-anchored locomotion: locked-on strides and the crouch play their
    // clip at rate 1 and the body's velocity comes from the clip's own planted
    // foot (`footAnchoredLoopVelocity`), so the controller's joystick is left
    // alone and the facing is driven directly. Off (debug switch): the fixed
    // locked-on / crouch speeds with the clip's cadence scaled to follow.
    // A single sourced stride can own pure forward/back/lateral travel. With
    // two keyboard axes held, keep the complete input vector in the movement
    // controller rather than replacing it with the dominant clip's one-axis
    // ground track.
    const diagonalMovement = Math.abs(intent.move.x) > 0.08 && Math.abs(intent.move.y) > 0.08;
    const clipDriven = lockedSpeedFollowsClip && !diagonalMovement && movementAllowed && playerGrounded
      && (lockedClip !== null || crouchMoving || (aiming && moveMagnitude > 0.12));
    const lockOnMoveScale = clipDriven ? 0 : aiming
      // The drawn stride's own measured ground speed, not a hand-set number:
      // the clip plays at rate 1 and the body keeps up with its feet.
      ? aimMoveSpeed.current / PLAYER_WALK_SPEED
      : clipDriven
        ? 0
        : crouching
          // The crouched cap comes from the authored sneak stride, so the stance
          // moves at the speed its clips were timed for instead of scrubbing.
          ? CROUCH_SPEED / PLAYER_WALK_SPEED
          : lockedClip ? PLAYER_LOCK_ON_WALK_SPEED / PLAYER_WALK_SPEED : 1;
    // A crouch faces the way it is going; the clip is the forward stride, the
    // body turns. Only a locked-on crouch strafes.
    if (clipDriven && crouchMoving && !lockedOn.current) {
      const towards = cameraRelativeDirection(intent.move, cameraYaw.current);
      crouchFacing.current = crouchFacingVector.current.set(towards.x, 0, towards.z).normalize();
    } else {
      crouchFacing.current = null;
    }
    // The controller retains horizontal authority through touchdown. Moving
    // landings use a short directional compression and crossfade quickly into
    // locomotion, so there is no planted stationary pose to skate across the
    // floor and no artificial mid-air/landing speed brake.
    handle.setMovement(movementAllowed
      ? {
        joystick: { x: intent.move.x * lockOnMoveScale, y: intent.move.y * lockOnMoveScale },
        run: sprinting && !aiming,
        jump: intent.jumpHeld && !crouching && playerStamina.current >= COMBAT_TUNING.jumpCost,
      }
      : { joystick: { x: 0, y: 0 }, run: false, jump: false });
    // Ecctrl decelerates released input asymptotically, which leaves a brief
    // residual slide in the direction of travel. Snap planar velocity to zero
    // once there is no input at all, instead of waiting the friction out.
    if ((guarding || (movementAllowed && moveMagnitude <= 0.01)) && playerGrounded && !clipDriven) {
      const settled = body.linvel();
      if (settled.x !== 0 || settled.z !== 0) body.setLinvel({ x: 0, y: settled.y, z: 0 }, true);
    }

    if (sprinting) {
      playerStamina.current = Math.max(0, playerStamina.current - COMBAT_TUNING.sprintDrainPerSecond * delta);
      staminaCooldown.current = COMBAT_TUNING.staminaRegenDelay;
    } else if (staminaCooldown.current <= 0 && playerAction.current !== "guard") {
      playerStamina.current = Math.min(playerMaxStamina, playerStamina.current + COMBAT_TUNING.staminaRegenPerSecond * delta);
    }

    if (playerAction.current === "roll") {
      const speed = Math.max(1.8, PLAYER_DODGE_SPEED.roll * (1 - playerActionTime.current / COMBAT_TUNING.rollDuration));
      body.setLinvel({ x: dodgeDirection.current.x * speed, y: body.linvel().y, z: dodgeDirection.current.z * speed }, true);
    } else if (playerAction.current === "backstep") {
      const progress = Math.min(1, playerActionTime.current / (ACTION_DURATIONS.backstep ?? 0.52));
      const speed = PLAYER_DODGE_SPEED.backstep * (1 - progress) ** 1.35;
      body.setLinvel({ x: dodgeDirection.current.x * speed, y: body.linvel().y, z: dodgeDirection.current.z * speed }, true);
    }

    if (swimming) {
      // The stroke: camera-relative, at the stats model's reference swim speed
      // or the sprint-swim's (`swimSprint`, stamina drained with the ground
      // sprint's above), the body turning toward where it goes. The forward
      // stroke's cadence follows the stick; the others play at their authored rate.
      const velocity = playerAction.current === "idle"
        ? swimVelocity(intent.move, cameraYaw.current, swimSprintState?.speed ?? SWIM_REFERENCE_SPEED)
        : { x: 0, z: 0 };
      const moving = velocity.x !== 0 || velocity.z !== 0;
      playerController.swim({
        velocity,
        surfaceHeight: swimSurface,
        groundHeight: swimGround,
        facing: moving ? velocity : null,
        dt: frameDelta,
      });
      if (playerAction.current === "idle") {
        const stroke = swimClipFor(velocity, handle.bodyZAxis, moveMagnitude);
        playerAnimationSpeed.current = stroke === "SWIM_FORWARD" ? swimStrokeRate(moveMagnitude) : 1;
        setAnim(stroke);
      }
      clipDrivenState.current = null;
    } else if (bowFootworkCommitted && playerGrounded && footDrivenMotion && hasGroundTrack(bowFootworkState)) {
      // Equip/unequip use the ordinary action clock; ensure they never inherit
      // a locomotion or bow-draw playback multiplier from the preceding state.
      playerAnimationSpeed.current = 1;
      // Draw is scrubbed directly by nock/draw progress. Release and handling
      // clips run normally on the action clock.
      const sourceTime = bowFootworkState === "BOW_DRAW"
        ? (playerBowPoseTime.current ?? 0)
        : playerActionTime.current;
      if (bowFootAnchorState.current !== bowFootworkState) {
        bowFootAnchorState.current = bowFootworkState;
        bowFootAnchorSourceTime.current = 0;
      }
      const fromSourceTime = sourceTime >= bowFootAnchorSourceTime.current
        ? bowFootAnchorSourceTime.current
        : 0;
      const step = footAnchoredSourceVelocity(
        bowFootworkState,
        fromSourceTime,
        sourceTime,
        delta,
      );
      bowFootAnchorSourceTime.current = sourceTime;
      const motion = localMotionToWorld(step, handle.bodyZAxis);
      body.setLinvel({ ...motion, y: body.linvel().y }, true);
      clipDrivenState.current = null;
    } else if (playerAction.current === "idle") {
      const lockWarp = lockedOn.current
        ? lockOnOrientationWarp(intent.move, playerLocomotionReversing.current)
        : null;
      playerLocomotionReversing.current = lockWarp?.reversing ?? false;
      const lockedStandard = lockWarp
        ? lockedStrideClip(intent.move, moveMagnitude, lockWarp.reversing)
        : null;
      // The lock-on selector answers in core clips; a weapon that overrides its
      // locomotion answers for the same directions in its own.
      const lockedLocomotion = lockedStandard
        ? lockedWeaponClip(playerWeapon.animations.locomotion, lockedStandard)
        : null;
      const locomotion = jumpStartTimer.current > 0
        ? "JUMP_START"
        : landingTimer.current > 0
          ? landingAnimation.current
          : !playerGrounded
            ? "JUMP_IDLE"
            : crouching
              ? (crouchMoving && !lockedOn.current
                // Facing the way it goes, so always the forward stride.
                ? crouchLocomotionAnimation({ x: 0, y: 1 }, moveMagnitude, equipped.current ? playerWeapon.animations : undefined)
                : crouchLocomotionAnimation(
                  intent.move,
                  moveMagnitude,
                  equipped.current ? playerWeapon.animations : undefined,
                ))
            : sprinting
              ? playerWeapon.animations.sprintOverride ?? "SPRINT"
              : lockedLocomotion
                ? lockedLocomotion
              // A weapon carried differently moves differently: a greatsword
              // is held across the body at a run and the arms genuinely do not
              // swing. Absent overrides fall back to the shared core clips, so
              // most weapons need no entry at all.
              : moveMagnitude > STRIDE_RUN_ABOVE_MAGNITUDE
                ? playerWeapon.animations.locomotion?.run ?? "RUN"
                : moveMagnitude > STRIDE_WALK_ABOVE_MAGNITUDE
                  ? playerWeapon.animations.locomotion?.walk ?? "WALK"
                  : equipped.current
                    ? playerWeapon.animations.combatIdle
                    : "IDLE";
      // Playback rate follows the actor, not a hand-picked constant: a stride
      // authored for one ground speed skates at any other. Jump/landing keep
      // their own authored fits. Locked-on strafes used a flat 1.4, which is
      // why strafing and back-walking scrubbed underfoot: the strafe clips are
      // authored at ~0.8 m/s and the locked walk moves at up to 3, so their
      // cadence has to follow the real speed like every other stride's.
      const drivenByFeet = clipDriven && hasGroundTrack(locomotion);
      playerAnimationSpeed.current = jumpStartTimer.current > 0
        ? (clipPlaybackSourceSpan("JUMP_START") ?? JUMP_LAUNCH_ANIMATION_DURATION) / JUMP_LAUNCH_ANIMATION_DURATION
        : landingTimer.current > 0
          ? landingAnimationSpeed(landingDuration.current, landingAnimation.current)
          : drivenByFeet
            ? 1
            : locomotionSpeedMultiplier(locomotion, playerMoveSpeed.current);
      setAnim(locomotion);
      if (drivenByFeet) {
        // The stride's own feet move the body. The clock restarts with the
        // clip (a new command starts its action at 0). Locked strafes and the
        // back-walk run quick (the debug `lockedStrideRate`, default 1.35×1.5
        // — owner round 8); the crouch stays at its authored pace. The rate is
        // analogue: it follows how far the stick is pushed, floored so a light
        // push steps rather than crawls. Clock, clip and measured track all
        // advance at that same rate, so the feet stay the anchor and the body
        // simply covers ground faster or slower.
        const rate = lockedClip
          ? lockedStrideRateFor(lockedClip, moveMagnitude, lockedStrideRate)
          : strideRateForMagnitude(moveMagnitude, 1);
        playerAnimationSpeed.current = rate;
        if (clipDrivenState.current !== locomotion) {
          clipDrivenState.current = locomotion;
          clipDrivenTime.current = 0;
        }
        clipDrivenTime.current += delta * rate;
        const step = footAnchoredLoopVelocity(locomotion, clipDrivenTime.current, delta * rate);
        step.forward *= rate;
        step.lateral *= rate;
        const facing = handle.bodyZAxis;
        const fx = facing.x;
        const fz = facing.z;
        body.setLinvel({
          x: fx * step.forward + fz * TRACK_LATERAL_SIGN * step.lateral,
          y: body.linvel().y,
          z: fz * step.forward - fx * TRACK_LATERAL_SIGN * step.lateral,
        }, true);
      } else {
        clipDrivenState.current = null;
      }
    } else if (aiming && clipDriven && hasGroundTrack(playerAnimationCommand.current.state)) {
      const locomotion = playerAnimationCommand.current.state;
      const rate = strideRateForMagnitude(moveMagnitude, 1);
      playerAnimationSpeed.current = rate;
      if (clipDrivenState.current !== locomotion) {
        clipDrivenState.current = locomotion;
        clipDrivenTime.current = 0;
      }
      clipDrivenTime.current += delta * rate;
      const step = footAnchoredLoopVelocity(locomotion, clipDrivenTime.current, delta * rate);
      const facing = handle.bodyZAxis;
      body.setLinvel({
        x: (facing.x * step.forward + facing.z * TRACK_LATERAL_SIGN * step.lateral) * rate,
        y: body.linvel().y,
        z: (facing.z * step.forward - facing.x * TRACK_LATERAL_SIGN * step.lateral) * rate,
      }, true);
    } else {
      playerLocomotionReversing.current = false;
      playerAnimationSpeed.current = 1;
      clipDrivenState.current = null;
      bowFootAnchorState.current = null;
      bowFootAnchorSourceTime.current = 0;
    }

    // Just out of the water: until ecctrl is running again the controller still
    // stands the body, overriding any velocity set above (decision 0093).
    if (!swimming && playerController.swimDriving) {
      playerController.swim({
        velocity: { x: 0, z: 0 },
        surfaceHeight: swimSurface,
        groundHeight: swimGround,
        facing: null,
        dt: frameDelta,
      });
    }

    // Every enemy runs its own step against the shared player (`enemyStep`).
    const enemyStep: EnemyStepContext = {
      delta,
      playerPos,
      enemyEnabled,
      enemyAiEnabled,
      footDrivenMotion,
      arrowGravityScale: settingsRef.current.arrowGravityScale,
      visualScenario,
      visualDriver,
      tmp,
      playerAction,
      playerActionTime,
      playerAttack,
      playerAttackHit,
      playerWeapon,
      playerGuardAnimations,
      playerParryOverlaps,
      playerWeaponOverlaps,
      executionVictim,
      setEnemyMode,
      setEnemyAnim,
      clearLockIfTarget,
      announce,
      triggerShake,
      attemptEnemyHit,
    };
    // Stealth first: what each enemy sees and hears decides whether its own
    // step fights at all (`stealthStep`, decision 0092).
    {
      const bootWeightKg = playerArmour.find((piece) => piece.slot === "feet")?.weightKg ?? 0;
      const attack = playerAttack.current;
      let loudness = louder(pendingNoise.current, locomotionNoise({
        moveMagnitude,
        grounded: playerGrounded,
        sprinting,
        crouching,
      }));
      if (playerAction.current === "roll") loudness = louder(loudness, "roll");
      if (attack && phaseAt(playerActionTime.current, attack) === "active") loudness = louder(loudness, "attackSwing");
      pendingNoise.current = 0;
      stepStealth({
        delta,
        player: {
          position: playerPos,
          sneakSkill: sneakSkillFor(),
          agility: REFERENCE_ATTRIBUTES.agility,
          bootWeightKg,
          sneaking: crouching,
          // A lit carried light floods the player with light (decision 0091).
          lightLevel: carriedLight.current?.lit ? 1 : settingsRef.current.ambientLight,
          loudness,
        },
        lineOfSight,
        scratch: stealthScratch.current,
      }, activeEnemies);
    }
    for (const e of activeEnemies) stepEnemy(enemyStep, e);

    const lockTargetActive = lockTarget !== null && (lockTarget.fighter.health > 0 || lockTarget.fighter.state === "critical");
    // A stationary archer turns about a planted sole. Rotating the capsule
    // about its centre makes both feet trace broad circles across the floor;
    // preserving the lower foot lets the other step around it like a real
    // stance. Keep the choice for the current clip so tiny height noise cannot
    // alternate the pivot every frame.
    let bowAimPivot: THREE.Object3D | null = null;
    if (isAiming(bowCycle.current) && moveMagnitude <= 0.12 && playerGrounded) {
      const soles = playerSoleBones.current;
      const animation = playerAnimationCommand.current.state;
      if (soles?.footL && soles.footR) {
        if (bowPivotAnimation.current !== animation) {
          soles.footL.getWorldPosition(tmp.current.soleL);
          soles.footR.getWorldPosition(tmp.current.soleR);
          bowPivotSide.current = tmp.current.soleL.y <= tmp.current.soleR.y ? "footL" : "footR";
          bowPivotAnimation.current = animation;
        }
        bowAimPivot = soles[bowPivotSide.current] ?? null;
      }
    } else {
      bowPivotAnimation.current = null;
    }
    // Zoom belongs to the bow, not to the camera mode. It used to live inside
    // the free-aim branch below, which is skipped entirely while a target is
    // locked, so a locked-on archer had no zoom at all. Nothing about lock-on
    // makes magnification meaningless — if anything that is when you want it.
    if (isAiming(bowCycle.current)) {
      // Held triggers sweep it and a wheel notch steps it, so the same control
      // exists on a pad, a mouse and a trackpad without a fourth binding:
      // neither heavy nor parry does anything with a bow raised.
      aimZoom.current = THREE.MathUtils.clamp(
        aimZoom.current
        + (Number(intent.zoomInHeld) - Number(intent.zoomOutHeld)) * (delta / AIM_ZOOM_SECONDS)
        + intent.zoomWheel * AIM_ZOOM_PER_WHEEL_NOTCH,
        0,
        1,
      );
    }
    if (playerAttack.current) {
      handle.setForwardDir(playerAttackDirection.current);
      handle.setLockForward(true);
    }
    if (lockTargetActive && lockTarget) {
      const yaws = lockOnYaws(playerPos, lockTarget.position);
      if (isAiming(bowCycle.current)) {
        // Lock-on initialises bow aim, then leaves the crosshair under direct
        // camera control. Keep it centred through the shoulder-camera
        // transition; the first deliberate mouse movement detaches it.
        const newlyAcquired = bowAimCentredTarget.current !== lockTarget.id;
        if (newlyAcquired) {
          bowAimCentredTarget.current = lockTarget.id;
          bowAimDetachedFromTarget.current = false;
        }
        const hasCameraInput = Math.abs(intent.camera.x) > 1e-6
          || Math.abs(intent.camera.y) > 1e-6;
        if (!bowAimDetachedFromTarget.current && (!hasCameraInput || newlyAcquired)) {
          // Solve from the actual sight camera. The old player-centre solve was
          // visibly off in first-person/shoulder view because both cameras are
          // displaced from the capsule. Repeating this while the player has
          // not moved the mouse also absorbs the camera's transition itself.
          const targetPoint = tmp.current.aimRayFallback.set(
            lockTarget.position.x,
            lockTarget.position.y + ARCHER_AIM_ABOVE_CENTRE,
            lockTarget.position.z,
          );
          const centred = aimAngles(directionTo(camera.position, targetPoint));
          cameraYaw.current = centred.yaw;
          aimPitch.current = THREE.MathUtils.clamp(
            centred.pitch,
            -AIM_PITCH_LIMIT,
            AIM_PITCH_LIMIT,
          );
          bowAimSnapTarget.current = lockTarget.id;
        } else {
          if (!bowAimDetachedFromTarget.current) {
            // Begin from the exact direction currently on screen so detaching
            // cannot introduce a one-frame jump after the camera moved.
            const currentView = aimAngles(camera.getWorldDirection(tmp.current.aimLook));
            cameraYaw.current = currentView.yaw;
            aimPitch.current = currentView.pitch;
            bowAimDetachedFromTarget.current = true;
          }
          const zoomedTurn = aimFieldOfView(aimZoom.current) / AIM_FIELD_OF_VIEW;
          cameraYaw.current -= intent.camera.x * delta * 2.35 * zoomedTurn;
          aimPitch.current = THREE.MathUtils.clamp(
            aimPitch.current - intent.camera.y * delta * 1.7 * zoomedTurn,
            -AIM_PITCH_LIMIT,
            AIM_PITCH_LIMIT,
          );
        }
      } else {
        cameraYaw.current = yaws.cameraYaw;
        bowAimCentredTarget.current = null;
        bowAimDetachedFromTarget.current = false;
        bowAimSnapTarget.current = null;
      }
      tmp.current.quaternion.setFromAxisAngle(UP, yaws.playerFacingYaw);
      if (!playerAttack.current && playerAction.current !== "roll" && playerAction.current !== "backstep") {
        tmp.current.forward.set(
          lockTarget.position.x - playerPos.x,
          0,
          lockTarget.position.z - playerPos.z,
        ).normalize();
        handle.setForwardDir(tmp.current.forward);
        handle.setLockForward(true);
      }
      if (playerAction.current === "aim") {
        tmp.current.quaternion.setFromAxisAngle(UP, playerAimBodyYaw.current + Math.PI);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (playerAction.current === "aim") {
        rotateBodyAroundSole(body, tmp.current.quaternion, bowAimPivot, tmp.current.soleWorld);
      } else if (playerAction.current === "idle" || playerAction.current === "guard") {
        body.setRotation(tmp.current.quaternion, true);
      }
    } else if (isAiming(bowCycle.current)) {
      // Unlocking while the bow stays raised must arm the next acquisition;
      // otherwise locking the same target again inherits its old mouse offset.
      bowAimCentredTarget.current = null;
      bowAimDetachedFromTarget.current = false;
      bowAimSnapTarget.current = null;
      // Aiming looks where the archer looks: the same stick, a wider arc, and
      // no orbit. Inverted relative to the third-person pitch because that one
      // raises the camera while this one raises the bow.
      //
      // Turn rate falls with the field of view. A magnified view moves the same
      // number of on-screen degrees for far less stick, and leaving the rate
      // alone makes a zoomed shot impossible to hold on a target.
      const zoomedTurn = aimFieldOfView(aimZoom.current) / AIM_FIELD_OF_VIEW;
      cameraYaw.current -= intent.camera.x * delta * 2.35 * zoomedTurn;
      aimPitch.current = THREE.MathUtils.clamp(
        aimPitch.current - intent.camera.y * delta * 1.7 * zoomedTurn,
        -AIM_PITCH_LIMIT,
        AIM_PITCH_LIMIT,
      );
      if (!playerAttack.current) {
        // The body turns WITH the camera, standing still or not. Without the
        // lock the controller only turns the body when there is movement
        // input, so an archer standing still could swing the crosshair round
        // while the bow kept pointing where it was, and the shot left along
        // the crosshair anyway — the reported "bow arm does not follow the
        // camera". Locked, the controller drives the facing to the camera yaw
        // every step and movement becomes strafing about the aim, which is
        // what a drawn bow wants.
        handle.setLockForward(true);
        const freeForward = cameraRelativeDirection({ x: 0, y: 1 }, cameraYaw.current);
        tmp.current.forward.set(freeForward.x, 0, freeForward.z).normalize();
        handle.setForwardDir(tmp.current.forward);
        // And pinned outright, as the lock-on does: the controller's turning
        // torque proved not to move a standing archer at all (measured in the
        // bow-aim-turn scene: the camera swung 2.2 rad, the body 0).
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        // Onto the *shot's* yaw, not the camera's. In the over-the-shoulder
        // view the camera is off to the right of the body, so facing the
        // camera's yaw pointed the bow parallel to the sight line instead of
        // at what the crosshair was on.
        tmp.current.quaternion.setFromAxisAngle(UP, playerAimBodyYaw.current + Math.PI);
        rotateBodyAroundSole(body, tmp.current.quaternion, bowAimPivot, tmp.current.soleWorld);
      }
    } else {
      cameraYaw.current -= intent.camera.x * delta * 2.35;
      // Negative pitch = sky look-up (owner 2026-08-25: shared behaviour —
      // keep in step with game-core's FollowCamera, which is the extracted
      // copy of this path).
      cameraPitch.current = THREE.MathUtils.clamp(cameraPitch.current + intent.camera.y * delta * 1.7, -1.15, 0.78);
      if (!playerAttack.current && crouchFacing.current) {
        // A clip-driven crouch gives the controller no joystick, so it would
        // never turn on its own: the facing is driven, as a lock-on's is.
        handle.setLockForward(true);
        handle.setForwardDir(crouchFacing.current);
      } else if (!playerAttack.current) {
        handle.setLockForward(false);
        const freeForward = cameraRelativeDirection({ x: 0, y: 1 }, cameraYaw.current);
        tmp.current.forward.set(freeForward.x, 0, freeForward.z).normalize();
        handle.setForwardDir(tmp.current.forward);
      }
    }

    const criticalCameraVictim = executionVictim.current;
    const criticalCameraActive = criticalCameraVictim !== null
      && (playerAction.current === "backstab" || playerAction.current === "riposte");
    if (criticalCameraActive) {
      // A normal behind-the-player camera puts two synchronized actors on the
      // same silhouette, making the victim reticle and even the attacker role
      // appear attached to the wrong body. Use a smooth side-on critical view
      // of the same production scene, choosing the side nearest the incoming
      // camera once at action start so it cannot flip mid-animation.
      tmp.current.forward.set(
        Math.sin(criticalCameraVictim.fighter.criticalVictimYaw),
        0,
        Math.cos(criticalCameraVictim.fighter.criticalVictimYaw),
      );
      tmp.current.cameraRight
        .set(tmp.current.forward.z, 0, -tmp.current.forward.x)
        .multiplyScalar(executionCameraSide.current);
      tmp.current.flat.copy(playerPos).add(criticalCameraVictim.position).multiplyScalar(0.5);
      const sideDistance = playerAction.current === "backstab" ? 5.1 : 5.5;
      tmp.current.desiredCamera
        .copy(tmp.current.flat)
        .addScaledVector(tmp.current.cameraRight, sideDistance)
        .addScaledVector(tmp.current.forward, -0.65)
        .setY(playerPos.y + 2.65);
      tmp.current.desiredLook.copy(tmp.current.flat).setY(playerPos.y + 0.72);
    } else if (aimBlendAmount.current > 0) {
      // First person, blended in over the raise. Both ends of the blend are
      // ordinary camera/look targets, so the existing smoothing does the zoom
      // and there is no second camera path to keep in sync.
      aimDirectionInto(tmp.current.aimDirection, cameraYaw.current, aimPitch.current);
      const blend = aimBlendAmount.current;
      const camDistance = 5.8;
      const horizontal = Math.cos(cameraPitch.current) * camDistance;
      tmp.current.desiredCamera.set(
        playerPos.x + Math.sin(cameraYaw.current) * horizontal,
        playerPos.y + 1.15 + Math.sin(cameraPitch.current) * camDistance,
        playerPos.z + Math.cos(cameraYaw.current) * horizontal,
      );
      // A fixed eye, not the head bone.
      //
      // Riding the skeleton sounds right and is not: the draw pose moves the
      // head, the upper body leans to follow the aim, and a camera chasing both
      // ends up inside the bow it is supposed to be looking past. With a
      // third-person body the stable eye is the one that reads — nudged a little
      // way *forward* along the shot axis, which clears the collapsed head and
      // the torso while leaving the bow arm ahead of the camera.
      tmp.current.flat.set(playerPos.x, playerPos.y + PLAYER_EYE_OFFSET_Y, playerPos.z)
        .addScaledVector(tmp.current.aimDirection, AIM_EYE_AHEAD_METERS);
      // A cheekbone eye, not a bridge-of-the-nose one: the draw anchors the
      // string hand at the face, so a dead-centre camera has the near plane
      // slicing that hand into a ring over the crosshair. Sitting just to its
      // right moves hand and string off-centre the way an aimed bow reads.
      tmp.current.flat.x += -tmp.current.aimDirection.z * AIM_EYE_RIGHT_METERS;
      tmp.current.flat.z += tmp.current.aimDirection.x * AIM_EYE_RIGHT_METERS;
      // With the first-person arms up, the camera is the rig's own camera bone:
      // the arms, bow and arrow are framed exactly as their clips frame them.
      if (firstPersonActive && firstPersonCamera.current.lengthSq() > 0) tmp.current.flat.copy(firstPersonCamera.current);
      if (shoulderAim) {
        // Over the shoulder, the Tears of the Kingdom way: the camera stays
        // third person, pulled in behind the archer's right shoulder and a
        // little above the eye, sighting along the aim; the body turns with
        // the view and its rigged bow, string and nocked arrow stay in shot.
        const shoulder = bowShoulderPosition({ x: playerPos.x, y: playerPos.y + PLAYER_EYE_OFFSET_Y, z: playerPos.z }, tmp.current.aimDirection);
        tmp.current.flat.set(shoulder.x, shoulder.y, shoulder.z);
      }
      // The direct crosshair ray starts here. `bowSight` converges from the
      // nock to its point, then applies the shared visible/physical launch axis.
      aimCameraOrigin.current.copy(tmp.current.flat);
      tmp.current.desiredCamera.lerp(tmp.current.flat, blend);
      // Sighted from the camera, not from the eye, so screen centre is the shot
      // direction exactly rather than approximately.
      tmp.current.desiredLook
        .copy(tmp.current.flat)
        .addScaledVector(tmp.current.aimDirection, AIM_LOOK_DISTANCE_METERS);
      if (lockTarget && bowAimSnapTarget.current === lockTarget.id) {
        // Make the acquisition frame exact on screen. From the next frame the
        // camera ray owns the crosshair again, so moving the mouse remains
        // fully persistent while lock-on continues to own movement/facing.
        tmp.current.desiredLook.set(
          lockTarget.position.x,
          lockTarget.position.y + ARCHER_AIM_ABOVE_CENTRE,
          lockTarget.position.z,
        );
      }
      // Target acquisition already centred yaw and pitch once. Keeping this
      // on the camera ray makes subsequent locked-on mouse motion persistent.
    } else {
      const camDistance = lockedOn.current ? 6.7 : 5.8;
      // Sky look-up: below posPitch the camera BODY stays at shoulder height
      // (diving underground fights terrain clamps) and the LOOK target rises
      // instead. Identical maths to game-core FollowCamera.computeDesired.
      const posPitch = Math.max(cameraPitch.current, 0.06);
      const horizontal = Math.cos(posPitch) * camDistance;
      tmp.current.desiredCamera.set(
        playerPos.x + Math.sin(cameraYaw.current) * horizontal,
        playerPos.y + 1.15 + Math.sin(posPitch) * camDistance,
        playerPos.z + Math.cos(cameraYaw.current) * horizontal,
      );
      const skyPitch = Math.max(0, posPitch - cameraPitch.current);
      const lookRise = Math.tan(Math.min(skyPitch, 1.35)) * camDistance * 1.5;
      tmp.current.desiredLook.set(playerPos.x, playerPos.y + 0.55 + lookRise, playerPos.z);
      if (lockTargetActive && lockTarget) tmp.current.desiredLook.lerp(lockTarget.position, 0.62).setY(playerPos.y + 0.55);
    }
    // An aimed camera has to answer the stick immediately: the smoothing that
    // makes a third-person follow feel weighty makes a crosshair feel broken.
    const aimed = aimBlendAmount.current >= 1;
    const acquiringLockedBowTarget = lockTarget !== null
      && bowAimSnapTarget.current === lockTarget.id;
    cameraPosition.current.lerp(
      tmp.current.desiredCamera,
      aimed ? 1 : 1 - Math.exp(-delta * (criticalCameraActive ? 7 : 9)),
    );
    cameraLook.current.lerp(
      tmp.current.desiredLook,
      aimed || acquiringLockedBowTarget ? 1 : 1 - Math.exp(-delta * 12),
    );
    camera.position.copy(cameraPosition.current);
    camera.lookAt(cameraLook.current);
    bowAimSnapTarget.current = null;
    if (portrait) {
      // Overwrite the follow solve rather than skipping it: the follow camera
      // owns state the rest of the frame reads, and a portrait is only ever
      // the last word on where the lens ends up.
      camera.position.set(...portrait.camera);
      camera.lookAt(portrait.lookAt[0], portrait.lookAt[1], portrait.lookAt[2]);
      if (camera instanceof THREE.PerspectiveCamera && camera.fov !== portrait.fieldOfView) {
        camera.fov = portrait.fieldOfView;
        camera.near = 0.05;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const wanted = THREE.MathUtils.lerp(
        BASE_FIELD_OF_VIEW,
        aimFieldOfView(aimZoom.current),
        aimBlendAmount.current,
      );
      // The near plane rides the same blend: fully aimed clips the actor's
      // own near geometry (see AIM_NEAR_CLIP_METERS); anything less keeps the
      // third-person default so nothing pops during the raise.
      // The arms rig is authored to be seen from its camera bone, so it wants
      // an ordinary near plane; the third-person body's eye view needs the
      // near clip to cut the skull's neighbourhood away.
      const wantedNear = aimBlendAmount.current >= 1 && !firstPersonActive && !shoulderAim ? AIM_NEAR_CLIP_METERS : BASE_NEAR_CLIP_METERS;
      if (Math.abs(camera.fov - wanted) > 0.01 || camera.near !== wantedNear) {
        camera.fov = wanted;
        camera.near = wantedNear;
        camera.updateProjectionMatrix();
      }
    }
    if (shake.current) {
      shake.current.elapsed += frameDelta;
      const sample = sampleHitShake(shake.current);
      camera.translateX(sample.x);
      camera.translateY(sample.y);
      camera.translateZ(sample.z);
      camera.rotateX(sample.pitch);
      camera.rotateY(sample.yaw);
      camera.rotateZ(sample.roll);
      if (shake.current.elapsed >= shake.current.profile.duration) shake.current = null;
    }

    hudTimer.current -= delta;
    if (hudTimer.current <= 0) {
      hudTimer.current = 0.05;
      const hudEnemy = lockTarget ?? aliveEnemies[0] ?? enemies[0];
      const hud = {
        playerHealth: playerHealth.current,
        playerStamina: playerStamina.current,
        enemyHealth: hudEnemy ? hudEnemy.fighter.health : 0,
        estus: estus.current,
        equipped: equipped.current,
        lockedOn: lockedOn.current,
        lockedTarget: lockedOn.current ? lockTargetIndex.current : -1,
        playerAction: playerAction.current,
        enemyAction: hudEnemy ? hudEnemy.fighter.state : "dead",
        message: message.current,
        gamepad: input.gamepadName,
        aiming: isAiming(bowCycle.current),
        bowPhase: bowCycle.current.phase,
        drawFraction: bowCycle.current.drawFraction,
        arrowsLeft: playerQuiver?.count ?? 0,
        aimZoom: aimZoom.current,
        aimErrorDegrees: Number(playerAimErrorDegrees.current.toFixed(2)),
        playerPoise: playerPoise.current.current,
        playerMaxPoise: playerPoise.current.max,
        detection: detectionReadout(activeEnemies),
        swimming: playerController.movementMode === "swim",
        submergedSeconds: submergedSeconds.current,
      };
      publish(hud);
      const shown = renderedRef.current;
      if (shown.lockedOn !== hud.lockedOn || shown.lockedTarget !== hud.lockedTarget
        || shown.playerAction !== hud.playerAction || shown.aiming !== hud.aiming) {
        renderedRef.current = {
          lockedOn: hud.lockedOn,
          lockedTarget: hud.lockedTarget,
          playerAction: hud.playerAction,
          aiming: hud.aiming,
        };
        setRendered(renderedRef.current);
      }
    }
  }, visualScenario ? VISUAL_FRAME_PHASE_PRIORITY.combat : 0);

  // Fixed ordering for validation: the combat/controller update above runs at
  // -2, probed Skyrim actors consume commands and deform at -1, then this
  // collector publishes telemetry plus the compositor marker at -0.5. R3F's
  // ordinary render remains at priority 0, so the code and WebGL pose belong
  // to the same advance() tick instead of the probe being one child-frame old.
  useFrame(() => {
    if (!visualScenario || !visualDriver.current || !window.__COMBAT_VISUAL_SCENARIO__) return;
    const handle = player.current;
    if (!handle || !visualDriver.current.ready) return;
    const telemetry = window.__COMBAT_VISUAL_SCENARIO__;
    const playerPos = handle.currPos;
    const enemy = activeEnemies[0];
    const enemyAction = enemy?.fighter.state ?? "absent";
    const enemyAnimation = enemy?.animCommand.current.state ?? "absent";
    const playerAnimation = playerAnimationCommand.current.state;
    const actorDistance = enemy
      ? Math.hypot(enemy.position.x - playerPos.x, enemy.position.z - playerPos.z)
      : null;
    const visualLockTarget = lockedOn.current
      ? activeEnemies.find((candidate) => candidate.id === lockTargetIndex.current) ?? null
      : null;
    const lockTargetAimErrorDegrees = visualLockTarget
      ? angleBetweenDegrees(
          camera.getWorldDirection(tmp.current.aimLook),
          directionTo(camera.position, {
            x: visualLockTarget.position.x,
            y: visualLockTarget.position.y + ARCHER_AIM_ABOVE_CENTRE,
            z: visualLockTarget.position.z,
          }),
        )
      : null;
    visualObserved.current.playerActions.add(playerAction.current);
    visualObserved.current.playerAnimations.add(playerAnimation);
    visualObserved.current.enemyActions.add(enemyAction);
    visualObserved.current.enemyAnimations.add(enemyAnimation);
    const eventKey = [playerAction.current, playerAnimation, enemyAction, enemyAnimation, enemy?.fighter.health].join("|");
    if (eventKey !== visualObserved.current.lastEvent) {
      visualObserved.current.lastEvent = eventKey;
      telemetry.events.push({
        time: Number(visualDriver.current.elapsed.toFixed(3)),
        playerAction: playerAction.current,
        playerAnimation,
        enemyAction,
        enemyAnimation,
        enemyHealth: enemy?.fighter.health ?? 0,
        actorDistance: actorDistance === null ? null : Number(actorDistance.toFixed(3)),
      });
    }
    // Stealth: every change of the enemy's awareness, with its time (decision 0092).
    if (enemy && telemetry.awarenessEvents
      && telemetry.awarenessEvents.at(-1)?.awareness !== enemy.awareness.awareness) {
      telemetry.awarenessEvents.push({
        time: Number(visualDriver.current.elapsed.toFixed(3)),
        awareness: enemy.awareness.awareness,
        suspicion: Number(enemy.awareness.suspicion.toFixed(3)),
      });
    }
    if (water && telemetry.swimSamples) {
      const chest = swimScratch.current.chest.set(playerPos.x, playerPos.y + CHARACTER_CHEST_ABOVE_BODY_CENTRE, playerPos.z);
      const sample = water.sample(chest, 0);
      telemetry.swimSamples.push({
        time: Number(visualDriver.current.elapsed.toFixed(3)),
        swimming: playerController.movementMode === "swim",
        floating: swimFloating.current,
        chestY: Number(chest.y.toFixed(4)),
        surfaceY: Number(sample.surfaceHeight.toFixed(4)),
        inWater: sample.waterBodyId !== null,
        equipped: equipped.current,
        grounded: playerController.movementMode !== "swim" && handle.isOnGround,
      });
    }
    Object.assign(telemetry, {
      enemyAwareness: enemy?.awareness.awareness,
      elapsed: Number(visualDriver.current.elapsed.toFixed(3)),
      ready: true,
      done: visualDriver.current.elapsed >= visualScenario.duration,
      playerAction: playerAction.current,
      playerAnimation,
      enemyAction,
      enemyAnimation,
      playerHealth: playerHealth.current,
      playerYaw: Number(Math.atan2(handle.bodyZAxis.x, handle.bodyZAxis.z).toFixed(3)),
      cameraYaw: Number(cameraYaw.current.toFixed(3)),
      enemyYaw: enemy ? Number(enemy.fighter.yaw.toFixed(3)) : undefined,
      enemyBodyYaw: enemy?.handle.current
        ? Number(Math.atan2(enemy.handle.current.bodyZAxis.x, enemy.handle.current.bodyZAxis.z).toFixed(3))
        : undefined,
      enemyBearingToPlayer: enemy
        ? Number(Math.atan2(playerPos.x - enemy.position.x, playerPos.z - enemy.position.z).toFixed(3))
        : undefined,
      enemyHealth: enemy?.fighter.health ?? 0,
      actorDistance: actorDistance === null ? null : Number(actorDistance.toFixed(3)),
      // Ranged diagnostics: the last shot's origin and velocity, and where the
      // archer's nock was, so a miss can be read off the numbers.
      lastArrow: (() => {
        const arrows = useArrowStore.getState().arrows;
        const last = arrows[arrows.length - 1];
        return last ? { origin: last.origin.map((v: number) => Number(v.toFixed(3))), velocity: last.velocity.map((v: number) => Number(v.toFixed(2))), shooter: last.shooter } : null;
      })(),
      enemyNock: enemy ? enemy.nockWorld.current.toArray().map((v) => Number(v.toFixed(3))) : undefined,
      enemyHandR: enemy?.hurtbox.current?.find((bone) => bone.bone.name.includes("HndR"))
        ?.bone.getWorldPosition(new THREE.Vector3()).toArray().map((v) => Number(v.toFixed(3))),
      enemyPosition: enemy ? enemy.position.toArray().map((v) => Number(v.toFixed(3))) : undefined,
      playerPosition: [Number(playerPos.x.toFixed(3)), Number(playerPos.y.toFixed(3)), Number(playerPos.z.toFixed(3))],
      observedPlayerActions: [...visualObserved.current.playerActions],
      observedPlayerAnimations: [...visualObserved.current.playerAnimations],
      observedEnemyActions: [...visualObserved.current.enemyActions],
      observedEnemyAnimations: [...visualObserved.current.enemyAnimations],
    });
    const lastVisualFrame = telemetry.visualFrames.at(-1);
    const sampleTime = Number(visualDriver.current.elapsed.toFixed(3));
    const simulationFrame = visualFrameMarkerIndex(visualDriver.current.elapsed);
    if (sampleTime > (lastVisualFrame?.time ?? -1)) {
      telemetry.visualFrames.push({
        time: sampleTime,
        simulationFrame,
        captureWallTimeMs: performance.timeOrigin + performance.now(),
        actorDistance: actorDistance === null ? null : Number(actorDistance.toFixed(3)),
        lockedOn: lockedOn.current,
        aiming: isAiming(bowCycle.current),
        lockTargetAimErrorDegrees: lockTargetAimErrorDegrees === null
          ? null
          : Number(lockTargetAimErrorDegrees.toFixed(3)),
        player: playerVisualProbe.current.current,
        enemy: enemy?.visualProbe.current ?? null,
      });
    }
    publishVisualFrameMarker(simulationFrame);
  }, VISUAL_FRAME_PHASE_PRIORITY.telemetryAndMarker);

  return (
    <>
      <PlayerBody
        handleRef={player}
        position={playerStart}
        rotationY={playerStartYaw}
        movementModes={water ? playerController : undefined}
      >
        <Suspense fallback={null}>
        <SkyrimFighter
          animationCommandRef={playerAnimationCommand}
          animationTimeRef={playerActionTime}
          animationPoseTimeRef={playerBowPoseTime}
          weaponProfile={playerWeapon.visual}
          offHandProfile={portrait ? null : playerLoadout.offHand?.visual ?? null}
          animationPacks={playerAnimationPacks}
          armour={portrait ? portraitArmour : playerArmour}
          quiver={portrait ? null : playerQuiverMount}
          nockedArrow={portrait ? null : playerNockedArrow}
          carriedHidden={Boolean(portrait)}
          bowDraw={playerBowDraw}
          firstPerson={aimingSnapshot && aimView === "eye"}
          hidden={firstPersonActive}
          buildId={playerBuild.id}
          // The store's build, not a re-lookup of its id: a portrait sheet's
          // alternate donor is not in the shipped roster.
          build={playerBuild}
          speedMultiplierRef={portrait ? portraitFrozenSpeed : playerAnimationSpeed}
          modelOffsetY={CHARACTER_MODEL_OFFSET}
          equipped={equipped.current}
          equippedRef={equipped}
          weaponRef={playerWeaponObject}
          offHandRef={playerOffHandObject}
          offHandGlowRef={carriedLightLevel}
          // A carried torch holds the left arm in Skyrim's torch pose, except
          // while that arm is needed: a guard, an attack, any full-body action.
          leftArmOverlay={playerTorch && !portrait && playerActionSnapshot === "idle" ? playerTorch.poseOverlay : null}
          hurtboxRef={playerHurtbox}
          headBoneRef={playerHeadBone}
          soleBoneRefs={playerSoleBones}
          // The lean follows the *shot*, not the camera: the converged aim's
          // own pitch, so the bow points along the line the arrow leaves on.
          aimPitchRef={playerAimSpinePitch}
          visualProbe={visualScenario ? playerVisualProbe.current : undefined}
          visualSupportYRef={playerSupportY}
        />
        </Suspense>
      </PlayerBody>
      {hasSkeletalHurtbox(playerBuild.sex)
        ? <SkeletalHurtbox rig={playerHurtbox} name={PLAYER_HURTBOX_NAME} sex={playerBuild.sex} probe={Boolean(visualScenario)} />
        : <CapsuleHurtbox controller={player} name={PLAYER_HURTBOX_NAME} />}
      <HeldObjectHitbox
        object={playerWeaponObject}
        margin={0}
        measureKey={playerWeapon.id}
        overlaps={playerWeaponOverlaps}
        name="player-weapon"
        active={playerHitboxActive}
        outline={showWeaponHitboxes}
        outlineColor="#ffd24d"
      />
      {playerOffWeapon && (
        <HeldObjectHitbox
          object={playerOffHandObject}
          margin={0}
          measureKey={playerOffWeapon.id}
          overlaps={playerOffWeaponOverlaps}
          name={PLAYER_OFF_HAND_WEAPON}
          active={playerOffHitboxActive}
          outline={showWeaponHitboxes}
          outlineColor="#ffb04d"
        />
      )}
      {playerTorch && !portrait && (
        <CarriedLight item={playerOffHandObject} spec={playerTorch.light} level={carriedLightLevel} time={carriedLightClock} />
      )}
      <Suspense fallback={null}>
        <Arrows
          arrows={liveArrows}
          retire={retireArrow}
          onHit={handleArrowHit}
          traceActor={traceActorArrow}
          gravityScale={settings.arrowGravityScale}
          onSample={onArrowSample}
        />
      </Suspense>
      <HeldObjectHitbox
        object={playerParryObject}
        margin={PARRY_VOLUME_MARGIN_METERS}
        measureKey={`${playerWeapon.id}/${playerLoadout.offHand?.id ?? ""}`}
        overlaps={playerParryOverlaps}
        name="player-parry-shield"
        active={playerParryActive}
        outline={showWeaponHitboxes}
        outlineColor="#4dd2ff"
      />
      {firstPersonActive && playerWeapon.visual.rig && (
        <Suspense fallback={null}>
          <FirstPersonBow
            bow={playerWeapon.visual}
            buildId={playerBuild.id}
            state={firstPersonState}
            bowDraw={playerBowDraw}
            nockedArrow={playerQuiver
              ? { asset: playerQuiver.arrow.asset, visibleRef: playerNockVisible, aimDirection: playerAimDirection, nockWorld: playerNockWorld }
              : null}
            cameraOut={firstPersonCamera}
            visible
          />
        </Suspense>
      )}
      <AnalogueSpeedLimiter
        controller={player}
        magnitude={moveMagnitudeRef}
        sprinting={sprintingRef}
        enabled={movementAllowedRef}
      />
      {enemyEnabled && activeEnemies.map((runtime) => (
        <EnemyActor
          key={runtime.id}
          runtime={runtime}
          showWeaponHitboxes={showWeaponHitboxes}
          reticleVisible={lockedOnSnapshot
            && lockedTargetSnapshot === runtime.id
            && playerActionSnapshot !== "backstab"
            && playerActionSnapshot !== "riposte"}
          validation={Boolean(visualScenario)}
        />
      ))}
      {enemyEnabled && showBackstabZones && activeEnemies.map((runtime) => (
        <BackstabZoneIndicator key={`backstab-zone-${runtime.id}`} runtime={runtime} player={player} />
      ))}
      {enemyEnabled && showWeaponHitboxes && activeEnemies.map((runtime) => (
        <ViewConeIndicator key={`view-cone-${runtime.id}`} runtime={runtime} />
      ))}
    </>
  );
}
