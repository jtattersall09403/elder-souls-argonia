import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, CuboidCollider, Physics, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import { useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import { createAnimationCommand, updateAnimationCommand, type AnimationCommand } from "@elder-souls/game-core/anim/animationCommand";
import {
  CHARACTER_TARGET_HEIGHT,
  clipConfig,
  clipPlaybackDuration,
  clipPlaybackSourceSpan,
} from "@elder-souls/game-core/anim/animationManifest";
import { landingAnimationSpeed, selectLandingAnimation } from "@elder-souls/game-core/anim/landing";
import { combatAudio } from "@elder-souls/game-core/fx/audio";
import {
  BLOCK_RECOIL_DURATION,
  PARRY_RECOIL_SPEED,
  blockRecoilVelocity,
  resolveGuardImpact,
} from "@elder-souls/game-core/combat/blockReaction";
import { enemyGuardTacticalDuration, resolveEnemyGuardVisualStep } from "@elder-souls/game-core/combat/enemyGuard";
import { createHitShake, sampleHitShake, type HitShakeImpulse, type HitShakeKind } from "@elder-souls/game-core/fx/cameraShake";
import { isHeavyAttack, resolveHit } from "@elder-souls/game-core/combat/resolveHit";
import { createFighter, resetFighter, type EnemyMode, type Fighter } from "@elder-souls/game-core/combat/fighter";
import { CombatEventBus } from "@elder-souls/game-core/combat/events";
import {
  ACTION_DURATIONS,
  BACKSTEP_ATTACK_DASH_FRACTION,
  BACKSTEP_DISTANCE_MULTIPLIER,
  ENEMY_SHARED_DURATIONS,
  MAX_ENEMIES,
  PLAYER_DODGE_SPEED,
  RIPOSTE_WINDOW,
} from "@elder-souls/game-core/combat/tuning";
import { itemAsset } from "@elder-souls/game-core/inventory/registry";
import {
  useEquippedArrow,
  useEquippedLoadout,
  useInventoryStore,
  useWornArmour,
  wornArmourFor,
} from "@elder-souls/game-core/inventory/store";
import {
  IDLE_BOW_CYCLE,
  advanceBowCycle,
  aimBlend,
  bowPose,
  bowTravelFor,
  isAiming,
  type BowCycle,
} from "@elder-souls/game-core/combat/bowShot";
import { launchSpeed, resolveArrowImpact } from "@elder-souls/game-core/combat/ballistics";
import { hitZoneForBone } from "@elder-souls/game-core/combat/hitZones";
import { nearestHurtboxBone, stickArrow } from "@elder-souls/game-core/combat/stuckArrows";
import { totalArmourRating } from "@elder-souls/game-core/equipment/armour";
import { clearArrows, fireArrow } from "@elder-souls/game-core/combat/arrowStore";
import { ActorHealthBar } from "./ActorHealthBar";
import { Arrows, type ArrowHit } from "./Arrows";
import { usePlayerRace } from "@elder-souls/game-core/actors/raceStore";
import {
  DEFAULT_ENEMY_ARCHETYPE,
  type EnemyArchetype,
  enemyArchetypeById,
} from "@elder-souls/game-core/actors/enemyArchetypes";
import { activeGuardAnimations, activeGuardProfile } from "@elder-souls/game-core/equipment/guard";
import { loadoutAnimationPacks } from "@elder-souls/game-core/equipment/animationPacks";
import {
  CROUCH_SPEED,
  crouchLocomotionAnimation,
  nextStance,
  type Stance,
} from "@elder-souls/game-core/locomotion/stance";
import {
  ARROW_POISE_DAMAGE,
  advancePoise,
  applyPoiseDamage,
  attackPoiseDamage,
  createPoise,
  refreshPoise,
  resetPoise,
  type PoiseState,
} from "@elder-souls/game-core/combat/poise";
import { locomotionSpeedMultiplier } from "@elder-souls/game-core/anim/locomotionCadence";
import {
  CHARACTER_CAPSULE_HALF_HEIGHT,
  CHARACTER_CAPSULE_RADIUS,
  CHARACTER_COMBAT_HURTBOX_RADIUS,
  CHARACTER_BODY_CENTER_HEIGHT,
  CHARACTER_DAMPING_C,
  CHARACTER_FLOAT_HEIGHT,
  CHARACTER_MODEL_OFFSET,
  CHARACTER_RAY_HIT_FORGIVENESS,
  CHARACTER_RAY_RADIUS,
  CHARACTER_SPRING_K,
  FALLING_GRAVITY_SCALE,
  JUMP_IMPULSE_DURATION,
  BASE_FIELD_OF_VIEW,
  JUMP_GRAVITY_SCALE,
  JUMP_LAUNCH_ANIMATION_DURATION,
  JUMP_VELOCITY,
  combatHurtboxCenterOffset,
  combatHurtboxHalfHeight,
} from "@elder-souls/game-core/physics/characterPhysics";
import { selectEnemyIntent, type EnemyIntent } from "@elder-souls/game-core/ai/enemyAi";
import { loadoutTactics } from "@elder-souls/game-core/ai/weaponTactics";
import { advanceEnemyBow, aimElevation, bowAimSpread } from "@elder-souls/game-core/ai/enemyBow";
import { DEFAULT_ARROW } from "@elder-souls/game-core/equipment/arrows";
import type { RangedStats } from "@elder-souls/game-core/equipment/types";
import { analogueMoveSpeed, cameraRelativeDirection, input, PLAYER_LOCK_ON_WALK_SPEED, PLAYER_SPRINT_SPEED, PLAYER_WALK_SPEED, resolveAttackDirection } from "@elder-souls/game-core/io/input";
import { inputToIntent } from "@elder-souls/game-core/combat/intent";
import { lockOnLocomotionAnimation, lockOnOrientationWarp, lockOnSprintAllowed, lockOnYaws } from "@elder-souls/game-core/anim/lockOn";
import { useGameStore } from "@elder-souls/game-core/core/store";
import type { AnimationState, CombatAction } from "@elder-souls/game-core/core/types";
import type { AttackDefinition } from "@elder-souls/game-core/equipment/types";
import {
  COMBAT_TUNING,
  attackDuration,
  comboCrossFadeDuration,
  comboEntryTime,
  comboQueueOpen,
  comboSuccessorStartTime,
  comboTransitionTime,
  criticalVictimDeathPlayback,
  criticalVictimPlaybackAt,
  criticalVictimRecoveryPlayback,
  getComboSuccessor,
  hitReactionForAttack,
  isBackstabPosition,
  isParryActive,
  isRollInvulnerable,
  isWeaponHitboxActive,
  phaseAt,
} from "@elder-souls/game-core/combat/weapon";
import {
  PARRY_VOLUME_MARGIN_METERS,
  hitCapsuleFor,
  measureHeldObject,
  type HitCapsule,
} from "@elder-souls/game-core/combat/hitVolume";
import { footAnchoredVelocity, hasGroundTrack } from "@elder-souls/game-core/locomotion/footAnchoredMotion";
import {
  executionAnchor,
  executionBladeIntersectsVictim,
  executionFacingYaw,
} from "@elder-souls/game-core/anim/weaponMotion";
import { VisualScenarioDriver, type VisualScenario } from "@elder-souls/game-core/validation/visualScenarios";
import {
  publishVisualFrameMarker,
  VISUAL_FRAME_PHASE_PRIORITY,
  visualFrameMarkerIndex,
} from "@elder-souls/game-core/validation/visualFrameMarker";
import { createActorVisualProbe, type ActorVisualProbe } from "@elder-souls/game-core/validation/actorVisualMetrics";
import { OverlapCounter } from "@elder-souls/game-core/combat/overlaps";
import { HAS_SKELETAL_HURTBOX, PlayerBody, SkeletalHurtbox, SkyrimFighter, useStanceCapsule, type HurtboxBone } from "@elder-souls/character";
import { Arena } from "./Arena";

const UP = new THREE.Vector3(0, 1, 0);
const ENEMY_FELLED_MESSAGE_DURATION = 1.8;
const PLAYER_HURTBOX_NAME = "player-hurtbox";

/**
 * Where the archer's eye is, relative to the physics body's centre.
 *
 * The actor is built to 1.85 m and the capsule centre sits `CHARACTER_BODY_
 * CENTER_HEIGHT` off the floor, so this is the difference between that and eye
 * level on a standing figure.
 */
const PLAYER_EYE_OFFSET_Y = 1.68 - CHARACTER_BODY_CENTER_HEIGHT;
/**
 * How far in front of the eye an arrow appears.
 *
 * Far enough that the *tail* of a 0.75 m shaft is clear of the archer's own
 * navigation capsule: an arrow that starts half inside its owner is deflected
 * by them on its first physics step.
 */
const ARROW_SPAWN_AHEAD_METERS = 0.85;
/**
 * How fast an archer can reposition with the bow up, m/s.
 *
 * Slower than a free walk. A raised bow is a commitment, and a player who can
 * circle-strafe at full pace while drawing has no reason to ever lower it.
 */
const AIM_MOVE_SPEED = 2.1;
/**
 * How long a riposte pressed during the parry stays queued.
 *
 * Long enough to cover the rest of the parry clip and the opening of the
 * reward window; short enough that it cannot resurface as a swing the player
 * has stopped wanting.
 */
const RIPOSTE_QUEUE_WINDOW = 0.7;
/** Distance out along the aim axis the first-person camera looks. */
const AIM_LOOK_DISTANCE_METERS = 40;
/**
 * How far *ahead* of the eye the aim camera sits, along the shot axis, in metres.
 *
 * This number has been wrong in both directions and the reason is worth keeping.
 * A camera exactly on the eye of a third-person rig used to end up inside the
 * skull. The pass before this one answered that by pulling the camera 0.55 m
 * *back* along the axis — which put the archer's own shoulders and back squarely
 * between the camera and the target: a first-person view of your own spine.
 *
 * The head is now hidden outright while aiming rather than shrunk (see
 * `headMeshes`), so "inside the head" is no longer a state that can exist and
 * this offset no longer has to defend against it. It is kept small and forward
 * only to stay clear of the collar and shoulders, which are still there — and
 * that is now the *only* job it has, which is why it can be this small.
 *
 * Deliberately on the axis and not over a shoulder: a lateral offset would put
 * the crosshair ray and the arrow's line a fixed distance apart at every range,
 * which reads as the bow shooting slightly wide of the aim the further out you
 * shoot.
 */
const AIM_EYE_AHEAD_METERS = 0.05;
/**
 * Field of view while aiming, at each end of the zoom.
 *
 * The wide end is the default: wide enough to hold both arms and the bow limbs
 * at the camera's set-back distance, which is also how an archer actually looks
 * at a target with both eyes open. The narrow end is roughly a 2.7x
 * magnification, which is about what picking a target out at fifty metres asks
 * for without turning the view into a scope the rest of the game does not have.
 */
const AIM_FIELD_OF_VIEW = 75;
const AIM_FIELD_OF_VIEW_ZOOMED = 28;
/** Full sweep of the zoom, in seconds, on a held button. */
const AIM_ZOOM_SECONDS = 0.9;
/** How much of the zoom one wheel notch covers. */
const AIM_ZOOM_PER_WHEEL_NOTCH = 0.12;
/** How far above and below level the bow can be aimed, radians. */
const AIM_PITCH_LIMIT = 1.15;

/**
 * The direction the archer is looking, from camera yaw and aim pitch.
 *
 * Matches `cameraRelativeDirection`'s convention — the camera sits at
 * `(+sin yaw, +cos yaw)` behind the player and looks the other way — so the
 * arrow leaves along exactly the axis the crosshair is on.
 */
/**
 * Whether a shot came from somewhere the defender's guard is covering.
 *
 * A shield covers the front. An arrow arriving from behind meets a back, and a
 * defender who is fully protected from every direction at once is a defender no
 * archer can ever flank.
 */
function facingTheShot(victim: EnemyRuntime, impactPoint: THREE.Vector3) {
  const forwardX = Math.sin(victim.fighter.yaw);
  const forwardZ = Math.cos(victim.fighter.yaw);
  const toShot = new THREE.Vector2(
    impactPoint.x - victim.position.x,
    impactPoint.z - victim.position.z,
  );
  if (toShot.lengthSq() < 1e-6) return true;
  toShot.normalize();
  return forwardX * toShot.x + forwardZ * toShot.y > GUARD_FACING_COSINE;
}

/** How far off dead-ahead a guard still covers. About 70 degrees either side. */
const GUARD_FACING_COSINE = 0.34;

/** Field of view at a zoom fraction. Linear in FOV, which reads as even. */
function aimFieldOfView(zoom: number) {
  return THREE.MathUtils.lerp(AIM_FIELD_OF_VIEW, AIM_FIELD_OF_VIEW_ZOOMED, zoom);
}

function aimDirectionInto(target: THREE.Vector3, yaw: number, pitch: number) {
  const horizontal = Math.cos(pitch);
  return target.set(
    -Math.sin(yaw) * horizontal,
    Math.sin(pitch),
    -Math.cos(yaw) * horizontal,
  ).normalize();
}
const DEFAULT_PLAYER_START = new THREE.Vector3(0, CHARACTER_BODY_CENTER_HEIGHT, 5.5);
const DEFAULT_ENEMY_SPAWNS = [
  new THREE.Vector3(-3.4, CHARACTER_BODY_CENTER_HEIGHT, -4.5),
  new THREE.Vector3(0, CHARACTER_BODY_CENTER_HEIGHT, -6),
  new THREE.Vector3(3.4, CHARACTER_BODY_CENTER_HEIGHT, -4.5),
].slice(0, MAX_ENEMIES);

function AnalogueSpeedLimiter({
  controller,
  magnitude,
  sprinting,
  enabled,
}: {
  controller: RefObject<EcctrlHandle | null>;
  magnitude: RefObject<number>;
  sprinting: RefObject<boolean>;
  enabled: RefObject<boolean>;
}) {
  // Ecctrl deliberately normalises joystick input. This extension runs after
  // the controller frame and restores analogue magnitude to planar speed.
  useFrame(() => {
    const handle = controller.current;
    if (!handle || !enabled.current || magnitude.current <= 0.01) return;
    const velocity = handle.body.linvel();
    const planarSpeed = Math.hypot(velocity.x, velocity.z);
    const maximum = analogueMoveSpeed(magnitude.current, sprinting.current);
    if (planarSpeed <= maximum || planarSpeed <= 0.001) return;
    const scale = maximum / planarSpeed;
    handle.body.setLinvel({ x: velocity.x * scale, y: velocity.y, z: velocity.z * scale }, true);
  });
  return null;
}

function LockOnReticle({
  visible,
  anchor,
}: {
  visible: boolean;
  anchor: RefObject<THREE.Object3D | null>;
}) {
  const marker = useRef<THREE.Group>(null);
  const parentWorld = useMemo(() => new THREE.Quaternion(), []);
  const anchorWorld = useMemo(() => new THREE.Vector3(), []);
  const towardCamera = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!marker.current) return;
    if (anchor.current && marker.current.parent) {
      anchor.current.getWorldPosition(anchorWorld);
      towardCamera.copy(camera.position).sub(anchorWorld).normalize();
      anchorWorld.addScaledVector(towardCamera, 0.22);
      marker.current.parent.worldToLocal(anchorWorld);
      marker.current.position.copy(anchorWorld);
    }
    marker.current.parent?.getWorldQuaternion(parentWorld);
    marker.current.quaternion.copy(parentWorld.invert()).multiply(camera.quaternion);
  });
  return (
    <group ref={marker} visible={visible} position={[0, 0.3, 0]} renderOrder={20}>
      <group rotation={[0, 0, Math.PI / 4]}>
        <mesh>
          <ringGeometry args={[0.14, 0.19, 4]} />
          <meshBasicMaterial color="#d8c79c" transparent opacity={0.92} depthTest />
        </mesh>
        <mesh scale={0.48}>
          <ringGeometry args={[0.14, 0.19, 4]} />
          <meshBasicMaterial color="#b99a62" transparent opacity={0.95} depthTest />
        </mesh>
      </group>
    </group>
  );
}

/**
 * A sensor shaped like, and riding on, a held object.
 *
 * Used for both jobs a held object does in combat: the volume a swing cuts
 * with, and the volume a parry catches with. Both are the same question — where
 * is this thing right now, and how big is it — and answering it once means a
 * greatsword's hitbox is a greatsword and a dagger's is a dagger, from the
 * pipeline's own measurement of the mesh rather than from a constant.
 *
 * The optional `outline` is what the debug panel's weapon-hitbox switch draws.
 * It is deliberately its own view rather than Rapier's global collider debug,
 * because that one renders *every* collider in the world and the whole point of
 * the switch is to watch the blade with everything else turned off.
 */
function HeldObjectHitbox({
  object,
  margin,
  overlaps,
  name,
  active,
  outline,
  outlineColor,
}: {
  object: RefObject<THREE.Object3D | null>;
  /** Grown by this much all round. Zero for a swing, wider for a parry. */
  margin: number;
  overlaps: MutableRefObject<OverlapCounter>;
  name: string;
  active: RefObject<boolean>;
  outline: boolean;
  outlineColor: string;
}) {
  const body = useRef<RapierRigidBody>(null);
  const marker = useRef<THREE.Group>(null);
  const { rapier } = useRapier();
  const center = useMemo(() => new THREE.Vector3(), []);
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  // Measured from the mesh actually mounted, not from the item manifest.
  //
  // The manifest reports extents, and extents are not enough: a weapon's origin
  // is its grip, so its box starts at zero, but a shield's origin is its boss
  // and its box straddles it. Sizing from extents alone parks a shield's volume
  // a third of a metre off the shield. The mounted object knows the truth, and
  // asking it costs one traversal per equip.
  const measured = useRef<THREE.Object3D | null>(null);
  const [capsule, setCapsule] = useState<HitCapsule>(() => hitCapsuleFor(
    { width: 0.1, height: 0.1, length: 0.9, minZ: 0 },
    margin,
  ));

  useFrame(() => {
    if (!body.current || !object.current || !active.current) {
      overlaps.current.clear();
      body.current?.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
      if (marker.current) marker.current.visible = false;
      return;
    }
    object.current.updateWorldMatrix(true, false);
    if (measured.current !== object.current) {
      measured.current = object.current;
      setCapsule(hitCapsuleFor(measureHeldObject(object.current), margin));
    }
    // The object runs along its own frame's +Z from the grip at the origin.
    center.set(0, 0, capsule.centerOffset).applyMatrix4(object.current.matrixWorld);
    object.current.getWorldQuaternion(rotation);
    body.current.setNextKinematicTranslation(center);
    body.current.setNextKinematicRotation(rotation);
    if (marker.current) {
      marker.current.visible = outline;
      marker.current.position.copy(center);
      marker.current.quaternion.copy(rotation);
    }
  });

  const updateOverlap = (isActive: boolean, target?: string) => {
    if (!target) return;
    if (isActive) overlaps.current.add(target);
    else overlaps.current.delete(target);
  };

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -100, 0]} name={name}>
        <CapsuleCollider
          args={[capsule.halfLength, capsule.radius]}
          rotation={[Math.PI / 2, 0, 0]}
          sensor
          activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
          onIntersectionEnter={({ other }) => updateOverlap(true, other.rigidBodyObject?.name)}
          onIntersectionExit={({ other }) => updateOverlap(false, other.rigidBodyObject?.name)}
        />
      </RigidBody>
      {/* Drawn in world space, not parented to the sensor body, so it is not
          subject to the physics interpolation the collider is. */}
      <group ref={marker} visible={false}>
        {/* THREE builds a capsule along +Y; the collider is turned onto +Z to
            lie down the object, and this has to make the same turn. */}
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={999}>
          <capsuleGeometry args={[capsule.radius, capsule.halfLength * 2, 4, 12]} />
          <meshBasicMaterial color={outlineColor} wireframe transparent opacity={0.85} depthTest={false} />
        </mesh>
      </group>
    </>
  );
}

/**
 * Fallback combat volume for a character with no pipeline-fitted hurtbox: one
 * sensor capsule covering the actor's full height. The Ecctrl capsule remains
 * a navigation/suspension shape; tying sword contact to that shorter capsule
 * makes visibly intersecting shoulder and upper-torso attacks miss.
 */
function CapsuleHurtbox({
  controller,
  name,
}: {
  controller: RefObject<EcctrlHandle | null>;
  name: string;
}) {
  const body = useRef<RapierRigidBody>(null);
  const { rapier } = useRapier();
  const center = useMemo(() => new THREE.Vector3(), []);
  const centerOffset = combatHurtboxCenterOffset(CHARACTER_TARGET_HEIGHT);
  const halfHeight = combatHurtboxHalfHeight(CHARACTER_TARGET_HEIGHT);

  useFrame(() => {
    const handle = controller.current;
    if (!body.current || !handle) {
      body.current?.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
      return;
    }
    center.copy(handle.currPos);
    center.y += centerOffset;
    body.current.setNextKinematicTranslation(center);
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -100, 0]} name={name}>
      <CapsuleCollider
        args={[halfHeight, CHARACTER_COMBAT_HURTBOX_RADIUS]}
        sensor
        activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
      />
    </RigidBody>
  );
}

/**
 * The volume a parry catches with.
 *
 * This used to be a fixed 1.24 x 1.10 x 0.64 m box parked 0.55 m in front of
 * the chest, active on a hard-coded window and identical whether the actor was
 * holding a dagger or a tower shield. It caught things nothing on screen was
 * anywhere near, and it never moved with the parry it was supposed to belong to.
 *
 * It is now the parrying object itself — the shield if there is one in the off
 * hand, otherwise the weapon — grown by `PARRY_VOLUME_MARGIN_METERS` so a
 * correctly *timed* parry is not also a positioning test. Same component as the
 * weapon hitbox, because it is the same question.
 */
/**
 * An archer looses at the player.
 *
 * The elevation is solved against the same drag model the arrow will fly
 * under, so a shot at twenty-five metres arrives rather than falling short —
 * and the spread is applied to the *aim* rather than to the arrow, so a miss is
 * still a real trajectory the player can watch go past.
 */
function looseEnemyArrow(
  runtime: EnemyRuntime,
  ranged: RangedStats,
  target: THREE.Vector3,
  distance: number,
) {
  // What every archer in the sandbox shoots. A per-archetype quiver is a
  // Phase 13 loot question, not a combat one.
  const arrow = DEFAULT_ARROW;
  const origin = runtime.position.clone().setY(runtime.position.y + PLAYER_EYE_OFFSET_Y);
  const flat = Math.hypot(target.x - origin.x, target.z - origin.z);
  const speed = launchSpeed(ranged, arrow.physics, 1);
  const elevation = aimElevation(speed, arrow.physics, flat, (target.y + 0.9) - origin.y);
  if (elevation === null) return;
  const spread = bowAimSpread(runtime.fighter.personality, distance);
  // Deterministic per-shot rather than per-frame: one wobble, applied to the
  // whole shot, so the arrow flies straight along a slightly wrong line.
  const yawError = (Math.random() - 0.5) * 2 * spread;
  const pitchError = (Math.random() - 0.5) * 2 * spread;
  const yaw = Math.atan2(target.x - origin.x, target.z - origin.z) + yawError;
  const pitch = elevation + pitchError;
  const horizontal = Math.cos(pitch) * speed;
  fireArrow({
    arrow,
    shooter: runtime.bodyName,
    origin: [
      origin.x + Math.sin(yaw) * ARROW_SPAWN_AHEAD_METERS,
      origin.y,
      origin.z + Math.cos(yaw) * ARROW_SPAWN_AHEAD_METERS,
    ],
    velocity: [Math.sin(yaw) * horizontal, Math.sin(pitch) * speed, Math.cos(yaw) * horizontal],
  });
  combatAudio.play("swing");
}

function parryObjectRef(
  offHand: RefObject<THREE.Object3D | null>,
  weapon: RefObject<THREE.Object3D | null>,
): RefObject<THREE.Object3D | null> {
  return { get current() { return offHand.current ?? weapon.current; } } as RefObject<THREE.Object3D | null>;
}

// One enemy's full runtime: its Fighter combat model plus the view/physics
// handles the simulation drives. Plain ref objects let the parent build an
// array of these without per-item hooks.
type EnemyRuntime = {
  id: number;
  fighter: Fighter;
  /** Every speed, timing and stat this enemy uses. See `actors/enemyArchetypes`. */
  archetype: EnemyArchetype;
  start: THREE.Vector3;
  startYaw: number;
  handle: RefObject<EcctrlHandle | null>;
  weapon: MutableRefObject<THREE.Object3D | null>;
  /** The mounted shield, when there is one. A parry rides this in preference. */
  offHand: MutableRefObject<THREE.Object3D | null>;
  /** Whichever of the two is doing the parrying, resolved live. */
  parryObject: RefObject<THREE.Object3D | null>;
  targetAnchor: MutableRefObject<THREE.Object3D | null>;
  hurtbox: MutableRefObject<readonly HurtboxBone[] | null>;
  overlaps: MutableRefObject<OverlapCounter>;
  hitboxActive: MutableRefObject<boolean>;
  parryOverlaps: MutableRefObject<OverlapCounter>;
  parryActive: MutableRefObject<boolean>;
  visualProbe: ActorVisualProbe;
  animCommand: MutableRefObject<AnimationCommand>;
  actionTimeRef: MutableRefObject<number>;
  moveSpeed: MutableRefObject<number>;
  animationSpeed: MutableRefObject<number>;
  /** Latched gait, so the run/walk switch has hysteresis rather than a knife edge. */
  running: MutableRefObject<boolean>;
  /** Set when a backstep should chain into the dash-in attack on completion. */
  backstepAttackQueued: MutableRefObject<boolean>;
  /** Action clock at the previous step, so a bow looses exactly once. */
  previousActionTime: number;
  /** Absolute enemy action time through which a guard-hit clip must play. */
  guardHitUntil: number;
  /** Exact vulnerable pose retained when a riposte takes ownership. */
  criticalLeadInTime: number;
  position: THREE.Vector3;
  dodgeDirection: THREE.Vector3;
  bodyName: string;
  hurtboxName: string;
  weaponName: string;
};

function createEnemyRuntime(
  id: number,
  start: THREE.Vector3,
  startYaw = 0,
  archetype: EnemyArchetype = DEFAULT_ENEMY_ARCHETYPE,
): EnemyRuntime {
  const fighter = createFighter(`enemy-${id}`, "enemy", archetype);
  fighter.attack = archetype.loadout.mainHand.attacks.light1;
  const weapon: MutableRefObject<THREE.Object3D | null> = { current: null };
  const offHand: MutableRefObject<THREE.Object3D | null> = { current: null };
  return {
    id,
    fighter,
    archetype,
    start: start.clone(),
    startYaw,
    handle: { current: null },
    weapon,
    offHand,
    parryObject: parryObjectRef(offHand, weapon),
    targetAnchor: { current: null },
    hurtbox: { current: null },
    overlaps: { current: new OverlapCounter() },
    hitboxActive: { current: false },
    parryOverlaps: { current: new OverlapCounter() },
    parryActive: { current: false },
    visualProbe: createActorVisualProbe(),
    animCommand: { current: createAnimationCommand(archetype.loadout.mainHand.animations.combatIdle) },
    actionTimeRef: { current: 0 },
    moveSpeed: { current: 0 },
    animationSpeed: { current: 1 },
    running: { current: false },
    backstepAttackQueued: { current: false },
    previousActionTime: 0,
    guardHitUntil: 0,
    criticalLeadInTime: 0,
    position: start.clone(),
    dodgeDirection: new THREE.Vector3(),
    bodyName: `enemy-${id}`,
    hurtboxName: `enemy-${id}-hurtbox`,
    weaponName: `enemy-weapon-${id}`,
  };
}

function EnemyActor({ runtime, reticleVisible, validation }: { runtime: EnemyRuntime; reticleVisible: boolean; validation: boolean }) {
  const showWeaponHitboxes = useGameStore((state) => state.showWeaponHitboxes);
  const enemyArmour = useMemo(
    () => wornArmourFor(runtime.archetype.armour),
    [runtime.archetype.armour],
  );
  const enemyAnimationPacks = useMemo(
    () => loadoutAnimationPacks(runtime.archetype.loadout),
    [runtime.archetype.loadout],
  );
  // Read from the live fighter each frame rather than through props: health
  // changes inside the combat update, and routing it through React would cost a
  // render per hit for a number that is already sitting in a ref.
  const readEnemyHealth = useCallback(() => ({
    current: runtime.fighter.health,
    max: runtime.fighter.maxHealth,
    // Up while the thing is alive and hostile, down the moment it is not. A
    // corpse does not need a health bar, and neither does an encounter that has
    // not started.
    visible: runtime.fighter.health > 0 && runtime.fighter.state !== "dead",
  }), [runtime]);
  return (
    <>
      <Ecctrl
        ref={runtime.handle}
        position={runtime.start}
        rotation={[0, runtime.startYaw, 0]}
        maxWalkVel={runtime.archetype.locomotion.walkSpeed}
        maxRunVel={runtime.archetype.locomotion.runSpeed}
        accDeltaTime={runtime.archetype.locomotion.accelerationSeconds}
        decDeltaTime={runtime.archetype.locomotion.decelerationSeconds}
        rejectVelFactor={0.92}
        airDragFactor={0.06}
        useCustomForward
        lockForward
        autoBalance={false}
        enabledRotations={[false, true, false]}
        enableToggleRun={false}
        capsuleHalfHeight={CHARACTER_CAPSULE_HALF_HEIGHT}
        capsuleRadius={CHARACTER_CAPSULE_RADIUS}
        floatHeight={CHARACTER_FLOAT_HEIGHT}
        rayRadius={CHARACTER_RAY_RADIUS}
        rayHitForgiveness={CHARACTER_RAY_HIT_FORGIVENESS}
        springK={CHARACTER_SPRING_K}
        dampingC={CHARACTER_DAMPING_C}
        colliders={false}
        name={runtime.bodyName}
      >
        <Suspense fallback={null}>
        <SkyrimFighter
          animationCommandRef={runtime.animCommand}
          animationTimeRef={runtime.actionTimeRef}
          weaponProfile={runtime.archetype.loadout.mainHand.visual}
          offHandProfile={runtime.archetype.loadout.offHand?.visual ?? null}
          animationPacks={enemyAnimationPacks}
          armour={enemyArmour}
          raceId={runtime.archetype.race}
          speedMultiplierRef={runtime.animationSpeed}
          modelOffsetY={CHARACTER_MODEL_OFFSET}
          equipped
          enemy
          weaponRef={runtime.weapon}
          offHandRef={runtime.offHand}
          targetAnchorRef={runtime.targetAnchor}
          hurtboxRef={runtime.hurtbox}
          visualProbe={validation ? runtime.visualProbe : undefined}
          visualSupportY={0}
        />
        </Suspense>
        <LockOnReticle visible={reticleVisible} anchor={runtime.targetAnchor} />
        <ActorHealthBar anchor={runtime.targetAnchor} read={readEnemyHealth} />
      </Ecctrl>
      {HAS_SKELETAL_HURTBOX
        ? <SkeletalHurtbox rig={runtime.hurtbox} name={runtime.hurtboxName} probe={validation} />
        : <CapsuleHurtbox controller={runtime.handle} name={runtime.hurtboxName} />}
      <HeldObjectHitbox
        object={runtime.weapon}
        margin={0}
        overlaps={runtime.overlaps}
        name={runtime.weaponName}
        active={runtime.hitboxActive}
        outline={showWeaponHitboxes}
        outlineColor="#ff9d4d"
      />
      <HeldObjectHitbox
        object={runtime.parryObject}
        margin={PARRY_VOLUME_MARGIN_METERS}
        overlaps={runtime.parryOverlaps}
        name={`enemy-parry-shield-${runtime.id}`}
        active={runtime.parryActive}
        outline={showWeaponHitboxes}
        outlineColor="#4dd2ff"
      />
    </>
  );
}

/**
 * Warm the item cache while the player is busy.
 *
 * Every actor suspends when it is handed a mesh the browser has not fetched, so
 * the first time a weapon is equipped it blinks. Fetching what the player is
 * already carrying, slowly, in the background, costs nothing anyone notices and
 * removes that entirely. Deliberately paced: firing fifty requests at once
 * would compete with whatever the scene still needs.
 */
function useCarriedAssetWarmup(enabled: boolean) {
  const stacks = useInventoryStore((state) => state.inventory.stacks);
  useEffect(() => {
    if (!enabled) return undefined;
    const urls = [...new Set(stacks.map((stack) => itemAsset(stack.itemId)).filter(Boolean))]
      .map((asset) => `${import.meta.env.BASE_URL}${asset}`);
    let index = 0;
    let timer = 0;
    const step = () => {
      if (index >= urls.length) return;
      useGLTF.preload(urls[index]);
      index += 1;
      timer = window.setTimeout(step, WARMUP_INTERVAL_MS);
    };
    timer = window.setTimeout(step, WARMUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, stacks]);
}

const WARMUP_DELAY_MS = 2500;
const WARMUP_INTERVAL_MS = 140;

function Battle({ visualScenario }: { visualScenario: VisualScenario | null }) {
  const inventoryOpen = useInventoryStore((state) => state.open) && !visualScenario;
  // The player's equipped kit. Every moveset, animation and socket the player
  // uses comes from here, so equipping something in the inventory swaps all of
  // them — including what a raised guard is made of.
  const playerRace = usePlayerRace();
  const playerLoadout = useEquippedLoadout();
  const playerArmour = useWornArmour();
  const playerQuiver = useEquippedArrow();
  // Validation runs a fixed, deterministic scene; background fetches would only
  // add noise to it.
  useCarriedAssetWarmup(!visualScenario);
  const playerWeapon = playerLoadout.mainHand;
  const consumeArrow = useInventoryStore((state) => state.remove);
  const playerGuard = useMemo(() => activeGuardProfile(playerLoadout), [playerLoadout]);
  // What a raised guard is *made of* and what it *looks like* come from the
  // same place: the off hand if there is one, the weapon otherwise. Deriving
  // both from the loadout is what stops a shielded player angling a sword edge.
  const playerGuardAnimations = useMemo(() => activeGuardAnimations(playerLoadout), [playerLoadout]);
  // Which slices of the rig this actor must have downloaded to fight with what
  // it is holding. Changing it remounts the actor (see SkyrimFighter), which is
  // why it is memoised on the loadout rather than recomputed per frame.
  const playerAnimationPacks = useMemo(() => loadoutAnimationPacks(playerLoadout), [playerLoadout]);
  const playerStart = useMemo(
    () => visualScenario ? new THREE.Vector3(...visualScenario.player.position) : DEFAULT_PLAYER_START.clone(),
    [visualScenario],
  );
  const playerStartYaw = visualScenario?.player.yaw ?? Math.PI;
  const player = useRef<EcctrlHandle>(null);
  const playerWeaponObject = useRef<THREE.Object3D>(null);
  const playerOffHandObject = useRef<THREE.Object3D | null>(null);
  const showWeaponHitboxes = useGameStore((state) => state.showWeaponHitboxes);
  const playerParryObject = useMemo(
    () => parryObjectRef(playerOffHandObject, playerWeaponObject),
    [],
  );
  const playerHurtbox = useRef<readonly HurtboxBone[] | null>(null);
  const playerWeaponOverlaps = useRef(new OverlapCounter());
  const playerParryOverlaps = useRef(new OverlapCounter());
  const playerHitboxActive = useRef(false);
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
  const movementAllowedRef = useRef(true);
  const playerLocomotionReversing = useRef(false);
  // Lock-on strafe/walk clips are authored for free-roam pace; nudging the
  // clip faster and the actual travel speed slightly slower brings the visual
  // stride cadence and the physical ground speed back into rough agreement.
  const playerAnimationSpeed = useRef(1);
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
  const footDrivenMotion = useGameStore((state) => state.footDrivenMotion);
  /**
   * The player's poise pool (module 76 §121.3). While it holds, a hit costs
   * health and nothing else; when it empties the blow interrupts. Enemies carry
   * the same structure on their Fighter.
   */
  const playerPoise = useRef<PoiseState>(createPoise(playerArmour));
  // Which enemy to fight. Rebuilding the runtimes when it changes is the point:
  // an archetype decides the loadout, which decides the animation packs, the
  // hurtbox and every tactical distance the AI works in.
  const enemyArchetypeId = useGameStore((state) => state.enemyArchetypeId);
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
      )];
    }
    return DEFAULT_ENEMY_SPAWNS.map((start, index) =>
      createEnemyRuntime(index, start, 0, enemyArchetypeById(enemyArchetypeId)));
  }, [visualScenario, enemyArchetypeId]);
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
  /** 0 = wide, 1 = fully zoomed. Reset whenever the bow comes down. */
  const aimZoom = useRef(0);
  const aimBlendAmount = useRef(0);
  const playerHeadBone = useRef<THREE.Object3D | null>(null);
  /** Where the shot is going, shared with anything that has to point along it. */
  const playerAimDirection = useRef(new THREE.Vector3(0, 0, -1));
  const cameraPosition = useRef(new THREE.Vector3(0, 3.4, 10));
  const cameraLook = useRef(new THREE.Vector3());
  const tmp = useRef({
    aimDirection: new THREE.Vector3(),
    arrowOrigin: new THREE.Vector3(),
    toEnemy: new THREE.Vector3(),
    flat: new THREE.Vector3(),
    movement: new THREE.Vector3(),
    desiredCamera: new THREE.Vector3(),
    desiredLook: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    cameraRight: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  });
  const { camera } = useThree();
  const started = useGameStore((state) => state.started);
  const enemyEnabled = useGameStore((state) => state.enemyEnabled);
  const enemyAiEnabled = useGameStore((state) => state.enemyAiEnabled);
  const enemyCount = useGameStore((state) => state.enemyCount);
  // A visual scenario may isolate the pre-poise reaction rule (see the scenario
  // type's `poise` field); everything else follows the debug switch.
  // Debug-panel overrides for the player's pools. Read as live values rather
  // than captured once, so raising the bar mid-fight takes effect immediately.
  const playerMaxHealth = useGameStore((state) => state.playerMaxHealth);
  const playerMaxStamina = useGameStore((state) => state.playerMaxStamina);
  const poiseEnabled = useGameStore((state) => state.poiseEnabled)
    && (visualScenario?.player.poise ?? true);
  const lockedOnSnapshot = useGameStore((state) => state.lockedOn);
  const lockedTargetSnapshot = useGameStore((state) => state.lockedTarget);
  const playerActionSnapshot = useGameStore((state) => state.playerAction);
  // Rendered state, not frame state: the actor is a React component and the
  // head has to be collapsed through a prop rather than from the frame loop.
  const aimingSnapshot = useGameStore((state) => state.aiming);
  const bowPhaseSnapshot = useGameStore((state) => state.bowPhase);
  /**
   * The shaft on the string. Present whenever the bow is up and an arrow is
   * nocked, and gone the instant it is loosed — which is the moment the real
   * one appears in the world.
   */
  const playerNockedArrow = useMemo(() => {
    if (!aimingSnapshot || !playerQuiver) return null;
    const nocked = bowPhaseSnapshot === "ready" || bowPhaseSnapshot === "drawing";
    return { asset: playerQuiver.arrow.asset, visible: nocked, aimDirection: playerAimDirection };
  }, [aimingSnapshot, bowPhaseSnapshot, playerQuiver]);
  const resetToken = useGameStore((state) => state.resetToken);
  const patch = useGameStore((state) => state.patch);
  const hudTimer = useRef(0);
  const messageTimer = useRef(0);
  const message = useRef("");
  const hitStop = useRef(0);
  const shake = useRef<HitShakeImpulse | null>(null);
  const shakeSeed = useRef(0);
  const damagePulse = useRef(0);

  const setAnim = useCallback((animation: AnimationState, startAt = 0, restart = false, crossFadeDuration: number | null = null, timeScale = 1) => {
    updateAnimationCommand(playerAnimationCommand.current, animation, startAt, restart, crossFadeDuration, timeScale);
  }, []);

  const setEnemyAnim = useCallback((e: EnemyRuntime, animation: AnimationState, startAt = 0, restart = false, crossFadeDuration: number | null = null, timeScale = 1) => {
    updateAnimationCommand(e.animCommand.current, animation, startAt, restart, crossFadeDuration, timeScale);
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
    // Same rule as the player: an attack's clip runs at the rate its own
    // windup/active/recovery were scaled to, so the hitbox stays on the blade
    // whatever the enemy is carrying. `fighter.attack` is always assigned
    // before the mode is entered.
    setEnemyAnim(e, animation, startAt, true, crossFadeDuration, mode === "attack" ? e.fighter.attack?.timeScale ?? 1 : 1);
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
  ) => {
    playerAction.current = action;
    playerActionTime.current = startAt;
    playerAttack.current = action === "light1" || action === "light2" || action === "light3" || action === "heavy" || action === "heavy2" || action === "riposte" || action === "backstab"
      ? playerWeapon.attacks[action]
      : null;
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
    comboQueued.current = null;
    if (action !== "roll") rollAttackQueued.current = null;
    if (action !== "backstep") backstepAttackQueued.current = false;
    attackDashDistance.current = 0;
    healedThisAction.current = false;
    if (action === "guard") guardHitUntil.current = 0;
    // An attack's clip plays at the rate its own timing was scaled to. Anything
    // that is not an attack has no class scaling applied to it and plays at 1.
    setAnim(animation, startAt, restartAnimation, crossFadeDuration, playerAttack.current?.timeScale ?? 1);
  }, [playerWeapon, setAnim]);

  const finishPlayerAction = useCallback(() => {
    const abandonedVictim = executionVictim.current;
    if (abandonedVictim?.fighter.state === "critical") {
      // A configured critical should always make its audited contact. If
      // geometry or future interruption rules prevent that, fail safe by
      // releasing the victim instead of leaving its FSM and pose frozen
      // forever after the attacker returns to idle.
      abandonedVictim.fighter.criticalType = null;
      setEnemyMode(
        abandonedVictim,
        "recover",
        playerWeapon.animations.combatIdle,
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

  const damageEnemy = useCallback((e: EnemyRuntime, execution: "riposte" | "backstab" | null = null) => {
    const attack = playerAttack.current;
    if (!attack) return false;
    const f = e.fighter;
    const enemyWeapon = f.archetype.loadout.mainHand;
    const result = resolveHit(f.health, f.stamina, {
      attack,
      guard: f.state === "guard" && !execution ? activeGuardProfile(f.archetype.loadout) : null,
      iframe: f.state === "dodge" && isRollInvulnerable(f.actionTime),
      execution,
      armourRating: totalArmourRating(wornArmourFor(f.archetype.armour)),
    });
    if (result.kind === "iframe") return false;
    const reaction = hitReactionForAttack(attack);
    if (result.kind === "blocked") {
      f.health = result.health;
      f.stamina = result.stamina;
      f.staminaCooldown = COMBAT_TUNING.staminaRegenDelay;
      playerHitboxActive.current = false;
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
      announce("ENEMY BLOCKED", 0.6);
      if (f.health <= 0) {
        clearLockIfTarget(e);
        setEnemyMode(e, "dead", "DEATH");
        combatAudio.play("death");
        announce("ENEMY FELLED", ENEMY_FELLED_MESSAGE_DURATION);
      }
      return true;
    }
    if (result.kind === "guardBroken") {
      f.health = result.health;
      f.stamina = result.stamina;
      setEnemyMode(e, "parried", enemyWeapon.animations.guardBreak);
      announce("ENEMY GUARD BROKEN", 1.1);
      return true;
    }
    f.health = result.health;
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
        announce("ENEMY FELLED", ENEMY_FELLED_MESSAGE_DURATION);
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
        attackPoiseDamage(playerWeapon.stats.class, attack.id),
      ).staggered;
      if (broke) {
        f.staggerDuration = f.archetype.stateDurations.staggerLight;
        setEnemyMode(e, "stagger", reaction.animation);
      }
    }
    return true;
  }, [announce, clearLockIfTarget, playerWeapon, poiseEnabled, setEnemyAnim, setEnemyMode, startPlayerAction, triggerShake]);

  /**
   * An arrow arriving somewhere.
   *
   * Nothing here decides how much it hurts: the arrow's own speed at the moment
   * of contact, the angle it struck at and what the target is wearing go into
   * `resolveArrowImpact` and the answer comes back out. That is why there is no
   * range falloff — a shot across the arena and a shot from the far wall differ
   * because the arrow is slower, and for no other reason.
   */
  const handleArrowHit = useCallback((hit: ArrowHit) => {
    if (!hit.target) return;
    const victim = enemies.find((candidate) => candidate.hurtboxName === hit.target);
    if (!victim || victim.fighter.health <= 0) return;
    const f = victim.fighter;

    // Which part of the body it found. The same answer serves the damage, the
    // reaction, and where the shaft is left standing.
    const struck = nearestHurtboxBone(victim.hurtbox.current, hit.point);
    const zone = hitZoneForBone(struck?.bone.name ?? null);
    const impact = resolveArrowImpact(hit.arrow.physics, hit.speed, {
      armourRating: totalArmourRating(wornArmourFor(f.archetype.armour)),
      obliquityRad: hit.obliquityRad,
    });
    const damage = impact.damage * zone.damageMultiplier;
    if (damage <= 0) return;

    // A raised guard stops arrows too. Same rules a sword blow meets — the
    // guard's stability decides the stamina it costs and its absorption decides
    // what still gets through — because a shield does not care what hit it.
    // Only from the front: an arrow into the back finds no shield there.
    if (f.state === "guard" && facingTheShot(victim, hit.point)) {
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
      announce(guarded.blocked ? "ARROW BLOCKED" : "GUARD BROKEN", 0.7);
      if (!guarded.blocked) {
        setEnemyMode(victim, "parried", f.archetype.loadout.mainHand.animations.guardBreak);
      }
      if (f.health <= 0) {
        clearLockIfTarget(victim);
        setEnemyMode(victim, "dead", "DEATH");
        combatAudio.play("death");
        announce("ENEMY FELLED", ENEMY_FELLED_MESSAGE_DURATION);
      }
      return;
    }

    if (struck && hit.object) stickArrow(struck.bone, hit.object, hit.point, hit.quaternion);
    f.health = Math.max(0, f.health - damage);
    triggerShake(zone.heavyReaction ? "enemyHeavyHit" : "enemyHit", {
      x: victim.position.x,
      z: victim.position.z,
    });
    if (f.health <= 0) {
      clearLockIfTarget(victim);
      setEnemyMode(victim, "dead", "DEATH");
      combatAudio.play("death");
      announce("ENEMY FELLED", ENEMY_FELLED_MESSAGE_DURATION);
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
      announce("HEADSHOT", 0.8);
    } else if (!poiseEnabled || arrowPoise.staggered) {
      f.staggerDuration = f.archetype.stateDurations.staggerLight;
      setEnemyMode(victim, "stagger", "HIT");
    }
  }, [announce, clearLockIfTarget, enemies, poiseEnabled, setEnemyMode, triggerShake]);

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
      guard: playerAction.current === "guard" && equipped.current ? playerGuard : null,
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
      const guardHit = playerGuardAnimations.hitVariants[nextGuardHitVariant.current % playerGuardAnimations.hitVariants.length];
      nextGuardHitVariant.current += 1;
      guardHitUntil.current = playerActionTime.current + (clipConfig(guardHit).sourceDuration ?? 0.83);
      setAnim(guardHit, 0, true);
      combatAudio.play("guard");
      triggerShake("block", { x: handle.currPos.x - e.position.x, z: handle.currPos.z - e.position.z });
      announce("BLOCKED");
      if (playerHealth.current <= 0) {
        startPlayerAction("dead", "DEATH");
        combatAudio.play("death");
        announce("YOU DIED", 8);
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
      announce(result.killed ? "YOU DIED" : "GUARD BROKEN", result.killed ? 8 : 1.2);
      return;
    }

    playerHealth.current = result.health;
    triggerDamageVignette();
    const reaction = hitReactionForAttack(attack);
    triggerShake(result.kind === "hit" && result.heavy ? "playerHeavyHit" : "playerHit", {
      x: handle.currPos.x - e.position.x,
      z: handle.currPos.z - e.position.z,
    });
    combatAudio.play(result.killed ? "death" : "hit");
    if (result.killed) {
      startPlayerAction("dead", "DEATH");
      announce("YOU DIED", 8);
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
      patch({ damagePulse: damagePulse.current });
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
  }), [bus, camera, patch]);
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
    bowCycle.current = IDLE_BOW_CYCLE;
    aimBlendAmount.current = 0;
    aimPitch.current = 0;
    aimZoom.current = 0;
    clearArrows();
    // Read at reset time rather than closed over: this effect deliberately does
    // not re-run when the debug pools change, or moving a slider would restart
    // the fight you are using it to test.
    const pools = useGameStore.getState();
    playerHealth.current = visualScenario?.player.health ?? pools.playerMaxHealth;
    playerStamina.current = pools.playerMaxStamina;
    previousPools.current = { health: pools.playerMaxHealth, stamina: pools.playerMaxStamina };
    resetPoise(playerPoise.current);
    playerStance.current = "standing";
    estus.current = 3;
    equipped.current = visualScenario?.player.equipped ?? true;
    lockedOn.current = false;
    lockTargetIndex.current = -1;
    executionVictim.current = null;
    playerAction.current = "idle";
    playerActionTime.current = 0;
    playerAttack.current = null;
    playerAttackHit.current = false;
    playerWeaponOverlaps.current.clear();
    playerParryOverlaps.current.clear();
    playerHitboxActive.current = false;
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
      e.moveSpeed.current = 0;
      e.actionTimeRef.current = 0;
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
    message.current = visualScenario?.label ?? (resetToken > 0 ? "FIGHT RESTARTED" : "THE HOLLOW WARDEN");
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
        visualFrames: [],
      };
    }
    previousActiveCount.current = activeEnemies.length;
  }, [activeEnemies.length, camera, enemies, playerStart, playerStartYaw, resetToken, setAnim, setEnemyAnim, started, visualScenario]);

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
    if (staged.offHandId) equip(staged.offHandId);
    if (staged.ammoId) equip(staged.ammoId);
  }, [visualScenario]);

  useEffect(() => {
    if (enemyEnabled) return;
    lockedOn.current = false;
    lockTargetIndex.current = -1;
    playerWeaponOverlaps.current.clear();
    playerParryOverlaps.current.clear();
    playerHitboxActive.current = false;
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
    // Nothing advances behind the inventory: not the clock, not the input edges
    // the FSM reads, not the enemies. A modal screen that leaves the fight
    // running is a screen a player cannot safely open.
    if (inventoryOpen) return;
    const frameDelta = Math.min(rawDelta, 1 / 30);
    visualDriver.current?.apply(frameDelta, input);
    input.update();
    const intent = inputToIntent(input);
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
    const aliveEnemies = activeEnemies.filter((e) => e.fighter.health > 0);
    playerActionTime.current += delta;
    staminaCooldown.current -= delta;
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
    const playerHasVisualContact = handle.isOnGround;
    if (!handle.isOnGround) landingArmed.current = true;
    if (landingArmed.current || !handle.isOnGround) {
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
      maximumDownwardSpeed.current = 0;
      landingArmed.current = false;
    }
    if (intent.dodgePressed) dodgeHold.current = 0;
    if (intent.dodgeHeld) dodgeHold.current += delta;
    const jumpStarted = intent.jumpPressed && handle.isOnGround && playerStance.current !== "crouching"
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
        announce("TARGET RELEASED", 0.75);
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
          announce("TARGET LOCKED", 0.75);
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
    const sprinting = lockOnSprintAllowed(lockedOn.current)
      && intent.dodgeHeld
      && dodgeHold.current > 0.22
      && moveMagnitude > 0.15
      && playerAction.current === "idle";
    sprintingRef.current = sprinting;
    // Crouch is a toggle resolved after sprint, because breaking into a run
    // stands you up — and it is refused mid-action, so you cannot duck out of
    // a swing. Leaving the ground clears it on its own.
    playerStance.current = nextStance(playerStance.current, {
      toggled: intent.crouchPressed,
      grounded: handle.isOnGround,
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
    const ranged = playerWeapon.stats.ranged;
    const bowAnimations = playerWeapon.animations.bow;
    if (ranged && bowAnimations && equipped.current) {
      const raised = isAiming(bowCycle.current);
      const bowStep = advanceBowCycle(
        bowCycle.current,
        {
          aimPressed: intent.lightPressed && (raised || playerAction.current === "idle"),
          aimHeld: intent.lightHeld,
          // An empty quiver lowers the bow: there is nothing to nock, and
          // standing in a first-person aim with no arrow is a dead end.
          exitPressed: intent.aimExitPressed || !playerQuiver,
        },
        ranged,
        playerStamina.current,
        delta,
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
      if (isAiming(bowStep.cycle)) {
        aimDirectionInto(playerAimDirection.current, cameraYaw.current, aimPitch.current);
        tmp.current.aimDirection.copy(playerAimDirection.current);
      }
      if (bowStep.shot && playerQuiver) {
        const arrow = playerQuiver.arrow;
        const speed = launchSpeed(ranged, arrow.physics, bowStep.shot.drawFraction);
        tmp.current.arrowOrigin
          .set(playerPos.x, playerPos.y + PLAYER_EYE_OFFSET_Y, playerPos.z)
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
        finishPlayerAction();
      } else if (isAiming(bowStep.cycle)) {
        const pose = bowPose(bowStep.cycle, bowAnimations, bowTravelFor(intent.move, moveMagnitude));
        if (pose.animation !== playerAnimationCommand.current.state) {
          startPlayerAction("aim", pose.animation);
        }
        // A bow-carry stride is timed by the ground it covers, like any other.
        playerAnimationSpeed.current = locomotionSpeedMultiplier(
          pose.animation,
          playerMoveSpeed.current,
        );
        // The draw's clip time *is* its draw fraction: the pose is the state.
        if (pose.clipTime !== null) playerActionTime.current = pose.clipTime;
      }
      aimBlendAmount.current = aimBlend(bowCycle.current);
    } else if (isAiming(bowCycle.current)) {
      // The bow was unequipped, swapped or dropped mid-aim.
      bowCycle.current = IDLE_BOW_CYCLE;
      aimBlendAmount.current = 0;
      aimPitch.current = 0;
      aimZoom.current = 0;
      if (playerAction.current === "aim") finishPlayerAction();
    }

    const canStartAction = playerAction.current === "idle" || playerAction.current === "guard";
    if (canStartAction && intent.equipPressed) {
      equipped.current = !equipped.current;
      startPlayerAction(equipped.current ? "equip" : "unequip", equipped.current ? playerWeapon.animations.equip : playerWeapon.animations.unequip);
      announce(equipped.current ? playerWeapon.label.toUpperCase() : "WEAPON STOWED");
    } else if (canStartAction && intent.healPressed && estus.current > 0 && playerHealth.current < playerMaxHealth) {
      estus.current -= 1;
      startPlayerAction("heal", "HEAL");
      combatAudio.play("heal");
    } else if (canStartAction && intent.parryPressed && equipped.current && spendStamina(COMBAT_TUNING.parryCost)) {
      startPlayerAction("parry", playerGuardAnimations.parry.intro);
      announce("SWORD PARRY", 0.55);
    } else if (canStartAction && intent.heavyPressed && equipped.current && spendStamina(playerWeapon.attacks.heavy.stamina)) {
      // The weapon's own heavy, not the reference sword's. Hard-coding the
      // semantic here was invisible while there was one moveset and became a
      // greatsword opening with a one-handed swing the moment there were three.
      startPlayerAction("heavy", playerWeapon.attacks.heavy.animation);
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
        const behind = (e.fighter.state === "watching" || e.fighter.state === "approach" || e.fighter.state === "strafe" || e.fighter.state === "recover" || e.fighter.state === "heal")
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
        startPlayerAction(attack.id, attack.animation, 0, undefined, criticalPair?.entryBlendDuration ?? null);
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
          announce(type === "backstab" ? "BACKSTAB" : "RIPOSTE", 1.4);
        }
        combatAudio.play("swing");
        riposteQueued.current = 0;
      }
      }
    } else if (playerAction.current === "idle" && intent.guardHeld && equipped.current && !ranged) {
      startPlayerAction("guard", playerGuardAnimations.enter);
      announce("GUARDING", 0.55);
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
      playerHitboxActive.current = weaponActive && equipped.current && enemyEnabled && aliveEnemies.length > 0;
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
        const step = footAnchoredVelocity(
          attack.animation,
          playerActionTime.current,
          delta,
          Math.max(attack.lunge, 0),
        );
        // Along the attack direction only. The measurement's sideways component
        // is where its one blind spot lives — a pivoting clip's planted foot
        // traces the same arc as a travelling one, and the one-handed heavy
        // spins — while an attack is a thing you aim, so its own facing is the
        // axis that means anything. Cheap and total: the artefact is entirely
        // lateral, and dropping that axis drops all of it.
        const forward = playerAttackDirection.current;
        body.setLinvel({
          x: forward.x * step.forward,
          y: body.linvel().y,
          z: forward.z * step.forward,
        }, true);
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
        if (!execution) {
          for (const e of activeEnemies) {
            if (
              e.fighter.state === "parry"
              && isParryActive(e.fighter.actionTime, activeGuardAnimations(e.archetype.loadout).parry)
              && (e.parryOverlaps.current.has("player-weapon") || e.overlaps.current.has("player-weapon"))
            ) {
              parriedBy = e;
              break;
            }
          }
        }
        if (parriedBy) {
          playerAttackHit.current = true;
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
          announce("YOUR ATTACK WAS PARRIED", 1.1);
        } else if (!playerAttackHit.current && execution && criticalPair && victim && victim.fighter.state === "critical") {
          const pairedContact = executionProgress >= criticalPair.damageProgress
            && executionProgress < criticalPair.releaseProgress
            && executionBladeIntersectsVictim(executionProgress, criticalPair.startingSeparation)
            && Math.abs(Math.hypot(victim.position.x - playerPos.x, victim.position.z - playerPos.z) - criticalPair.startingSeparation) < 0.28;
          if (pairedContact) {
            playerAttackHit.current = damageEnemy(victim, execution);
          }
        } else if (!playerAttackHit.current) {
          // Normal swing: strike the nearest overlapped living enemy.
          let hitEnemy: EnemyRuntime | null = null;
          let hitDist = Infinity;
          for (const e of activeEnemies) {
            if (e.fighter.health <= 0) continue;
            const overlapsBody = playerWeaponOverlaps.current.has(e.hurtboxName);
            const guardClash = e.fighter.state === "guard" && playerWeaponOverlaps.current.has(e.weaponName);
            if (!overlapsBody && !guardClash) continue;
            const d = (e.position.x - playerPos.x) ** 2 + (e.position.z - playerPos.z) ** 2;
            if (d < hitDist) { hitDist = d; hitEnemy = e; }
          }
          if (hitEnemy) playerAttackHit.current = damageEnemy(hitEnemy, null);
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
          );
          combatAudio.play("swing");
        } else {
          comboQueued.current = null;
        }
      } else if (phase === "none") {
        finishPlayerAction();
      }
    } else {
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
      const duration = ACTION_DURATIONS[playerAction.current];
      if (playerAction.current === "heal" && playerActionTime.current > 0.82 && !healedThisAction.current) {
        healedThisAction.current = true;
        playerHealth.current = Math.min(playerMaxHealth, playerHealth.current + COMBAT_TUNING.healAmount);
      }
      if (duration && playerActionTime.current >= duration) {
        if (playerAction.current === "roll" && rollAttackQueued.current) {
          const queued = rollAttackQueued.current;
          const queuedAttack = queued === "heavy" ? playerWeapon.attacks.heavy : playerWeapon.attacks.light1;
          const direction = resolveAttackDirection(intent.move, cameraYaw.current, handle.bodyZAxis);
          tmp.current.movement.set(direction.x, 0, direction.z).normalize();
          if (spendStamina(queuedAttack.stamina)) {
            tmp.current.quaternion.setFromAxisAngle(UP, Math.atan2(tmp.current.movement.x, tmp.current.movement.z));
            handle.setForwardDir(tmp.current.movement);
            handle.setLockForward(true);
            body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            body.setRotation(tmp.current.quaternion, true);
            body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
            startPlayerAction(queuedAttack.id, queuedAttack.animation, 0, tmp.current.movement);
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
            startPlayerAction(queuedAttack.id, queuedAttack.animation, 0, tmp.current.movement);
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
    const movementAllowed = playerAction.current === "idle" || aiming;
    movementAllowedRef.current = movementAllowed;
    const lockOnMoveScale = aiming
      ? AIM_MOVE_SPEED / PLAYER_WALK_SPEED
      : crouching
        // The crouched cap comes from the authored sneak stride, so the stance
        // moves at the speed its clips were timed for instead of scrubbing.
        ? CROUCH_SPEED / PLAYER_WALK_SPEED
        : lockedOn.current && moveMagnitude > 0.08 ? PLAYER_LOCK_ON_WALK_SPEED / PLAYER_WALK_SPEED : 1;
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
    if ((guarding || (movementAllowed && moveMagnitude <= 0.01)) && handle.isOnGround) {
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

    if (playerAction.current === "idle") {
      const lockWarp = lockedOn.current
        ? lockOnOrientationWarp(intent.move, playerLocomotionReversing.current)
        : null;
      playerLocomotionReversing.current = lockWarp?.reversing ?? false;
      const lockedStandard = lockWarp
        ? lockOnLocomotionAnimation(intent.move, moveMagnitude, lockWarp.reversing)
        : null;
      // The lock-on selector answers in core clips; a weapon that overrides its
      // locomotion answers for the same directions in its own.
      const weaponLocomotion = playerWeapon.animations.locomotion;
      const lockedLocomotion = lockedStandard && weaponLocomotion
        ? ({
          WALK: weaponLocomotion.walk,
          WALK_BACK: weaponLocomotion.walkBack,
          STRAFE_LEFT: weaponLocomotion.strafeLeft,
          STRAFE_RIGHT: weaponLocomotion.strafeRight,
          RUN: weaponLocomotion.run,
        } as Partial<Record<string, AnimationState>>)[lockedStandard] ?? lockedStandard
        : lockedStandard;
      const locomotion = jumpStartTimer.current > 0
        ? "JUMP_START"
        : landingTimer.current > 0
          ? landingAnimation.current
          : !handle.isOnGround
            ? "JUMP_IDLE"
            : crouching
              ? crouchLocomotionAnimation(
                intent.move,
                moveMagnitude,
                equipped.current ? playerWeapon.animations : undefined,
              )
            : sprinting
              ? playerWeapon.animations.sprintOverride ?? "SPRINT"
              : lockedLocomotion
                ? lockedLocomotion
              // A weapon carried differently moves differently: a greatsword
              // is held across the body at a run and the arms genuinely do not
              // swing. Absent overrides fall back to the shared core clips, so
              // most weapons need no entry at all.
              : moveMagnitude > 0.72
                ? playerWeapon.animations.locomotion?.run ?? "RUN"
                : moveMagnitude > 0.08
                  ? playerWeapon.animations.locomotion?.walk ?? "WALK"
                  : equipped.current
                    ? playerWeapon.animations.combatIdle
                    : "IDLE";
      // Playback rate follows the actor, not a hand-picked constant: a stride
      // authored for one ground speed skates at any other. Jump/landing and
      // lock-on strafing keep their own authored fits.
      playerAnimationSpeed.current = jumpStartTimer.current > 0
        ? (clipPlaybackSourceSpan("JUMP_START") ?? JUMP_LAUNCH_ANIMATION_DURATION) / JUMP_LAUNCH_ANIMATION_DURATION
        : landingTimer.current > 0
          ? landingAnimationSpeed(landingDuration.current, landingAnimation.current)
          : lockedLocomotion
            ? 1.4
            : locomotionSpeedMultiplier(locomotion, playerMoveSpeed.current);
      setAnim(locomotion);
    } else {
      playerLocomotionReversing.current = false;
      playerAnimationSpeed.current = 1;
    }

    // Utility selection chooses a tactical intent; the state machine below owns
    // readable telegraphs, commitment, collision windows, and recovery. Every
    // enemy runs this independently against the shared player.
    for (const e of activeEnemies) {
      const f = e.fighter;
      const archetype = f.archetype;
      const weapon = archetype.loadout.mainHand;
      f.actionTime += delta;
      f.decisionTimer -= delta;
      f.staminaCooldown -= delta;
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
        const turnRate = f.state === "approach"
          ? turnRates.approach
          : f.state === "strafe"
            ? turnRates.strafe
            : f.state === "watching"
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
        } else {
          tmp.current.forward.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
          enemyHandle.setForwardDir(tmp.current.forward);
          enemyHandle.setLockForward(true);
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
        setEnemyAnim(e, f.strafeSide < 0
          ? archetype.locomotion.strafeAnimations.left
          : archetype.locomotion.strafeAnimations.right);
        if (f.actionTime > archetype.stateDurations.strafe) {
          setEnemyMode(e, "watching", weapon.animations.combatIdle);
        }
      } else if (f.state === "attack") {
        const attack = f.attack ?? weapon.attacks.light1;
        const phase = phaseAt(f.actionTime, attack);
        const weaponActive = isWeaponHitboxActive(f.actionTime, attack);
        const transitionAt = comboTransitionTime(attack);
        e.hitboxActive.current = weaponActive && f.health > 0;
        if (phase === "windup" && f.actionTime <= delta * 1.5) combatAudio.play("swing");
        if (phase === "windup" && distance > archetype.lungeBeyondDistance && enemyHandle) {
          enemyHandle.body.setLinvel({
            x: dirX * attack.lunge,
            y: enemyHandle.body.linvel().y,
            z: dirZ * attack.lunge,
          }, true);
        }
        if (
          weaponActive
          && playerAction.current === "parry"
          && isParryActive(playerActionTime.current, playerGuardAnimations.parry)
          && (
            playerParryOverlaps.current.has(e.weaponName)
            || playerWeaponOverlaps.current.has(e.weaponName)
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
          announce("WEAPONS CLASHED — LIGHT ATTACK TO RIPOSTE", 1.5);
          triggerShake("parry", { x: playerPos.x - e.position.x, z: playerPos.z - e.position.z });
        } else if (
          weaponActive
          && (
            (playerAction.current === "guard" && e.overlaps.current.has("player-weapon"))
            || e.overlaps.current.has(PLAYER_HURTBOX_NAME)
          )
        ) {
          attemptEnemyHit(e);
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
        if (f.actionTime > ENEMY_SHARED_DURATIONS.parry) {
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
        const criticalAttack = f.criticalType === "riposte" ? weapon.attacks.riposte : weapon.attacks.backstab;
        const criticalPair = f.criticalType === "riposte" ? weapon.animations.riposte : weapon.animations.backstab;
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
            combatAudio.play("death");
            announce("ENEMY FELLED", ENEMY_FELLED_MESSAGE_DURATION);
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
        const criticalPair = f.criticalType === "riposte"
          ? weapon.animations.riposte
          : weapon.animations.backstab;
        const victimRecovery = criticalVictimRecoveryPlayback(criticalPair);
        if (f.actionTime >= victimRecovery.endAt) {
          f.criticalType = null;
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

    const lockTargetActive = lockTarget !== null && (lockTarget.fighter.health > 0 || lockTarget.fighter.state === "critical");
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
      cameraYaw.current = yaws.cameraYaw;
      if (isAiming(bowCycle.current)) {
        // Lock-on drives the yaw; without this the pitch stays wherever free aim
        // left it, so the first-person view swung onto the target and then looked
        // over or under them. Elevate onto the target's chest instead.
        const flatRange = Math.hypot(
          lockTarget.position.x - playerPos.x,
          lockTarget.position.z - playerPos.z,
        );
        aimPitch.current = THREE.MathUtils.clamp(
          Math.atan2(lockTarget.position.y - (playerPos.y + PLAYER_EYE_OFFSET_Y), Math.max(flatRange, 0.001)),
          -AIM_PITCH_LIMIT,
          AIM_PITCH_LIMIT,
        );
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
      if (playerAction.current === "idle" || playerAction.current === "guard") body.setRotation(tmp.current.quaternion, true);
    } else if (isAiming(bowCycle.current)) {
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
        handle.setLockForward(false);
        const freeForward = cameraRelativeDirection({ x: 0, y: 1 }, cameraYaw.current);
        tmp.current.forward.set(freeForward.x, 0, freeForward.z).normalize();
        handle.setForwardDir(tmp.current.forward);
      }
    } else {
      cameraYaw.current -= intent.camera.x * delta * 2.35;
      // Negative pitch = sky look-up (owner 2026-08-25: shared behaviour —
      // keep in step with game-core's FollowCamera, which is the extracted
      // copy of this path).
      cameraPitch.current = THREE.MathUtils.clamp(cameraPitch.current + intent.camera.y * delta * 1.7, -1.15, 0.78);
      if (!playerAttack.current) {
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
      tmp.current.desiredCamera.lerp(tmp.current.flat, blend);
      // Sighted from the camera, not from the eye, so screen centre is the shot
      // direction exactly rather than approximately.
      tmp.current.desiredLook
        .copy(tmp.current.flat)
        .addScaledVector(tmp.current.aimDirection, AIM_LOOK_DISTANCE_METERS);
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
    cameraPosition.current.lerp(
      tmp.current.desiredCamera,
      aimed ? 1 : 1 - Math.exp(-delta * (criticalCameraActive ? 7 : 9)),
    );
    cameraLook.current.lerp(tmp.current.desiredLook, aimed ? 1 : 1 - Math.exp(-delta * 12));
    camera.position.copy(cameraPosition.current);
    camera.lookAt(cameraLook.current);
    if (camera instanceof THREE.PerspectiveCamera) {
      const wanted = THREE.MathUtils.lerp(
        BASE_FIELD_OF_VIEW,
        aimFieldOfView(aimZoom.current),
        aimBlendAmount.current,
      );
      if (Math.abs(camera.fov - wanted) > 0.01) {
        camera.fov = wanted;
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
      patch({
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
        playerPoise: playerPoise.current.current,
        playerMaxPoise: playerPoise.current.max,
      });
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
    Object.assign(telemetry, {
      elapsed: Number(visualDriver.current.elapsed.toFixed(3)),
      ready: true,
      done: visualDriver.current.elapsed >= visualScenario.duration,
      playerAction: playerAction.current,
      playerAnimation,
      enemyAction,
      enemyAnimation,
      playerHealth: playerHealth.current,
      enemyHealth: enemy?.fighter.health ?? 0,
      actorDistance: actorDistance === null ? null : Number(actorDistance.toFixed(3)),
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
        player: playerVisualProbe.current.current,
        enemy: enemy?.visualProbe.current ?? null,
      });
    }
    publishVisualFrameMarker(simulationFrame);
  }, VISUAL_FRAME_PHASE_PRIORITY.telemetryAndMarker);

  return (
    <>
      <PlayerBody handleRef={player} position={playerStart} rotationY={playerStartYaw}>
        <Suspense fallback={null}>
        <SkyrimFighter
          animationCommandRef={playerAnimationCommand}
          animationTimeRef={playerActionTime}
          weaponProfile={playerWeapon.visual}
          offHandProfile={playerLoadout.offHand?.visual ?? null}
          animationPacks={playerAnimationPacks}
          armour={playerArmour}
          nockedArrow={playerNockedArrow}
          firstPerson={aimingSnapshot}
          raceId={playerRace}
          speedMultiplierRef={playerAnimationSpeed}
          modelOffsetY={CHARACTER_MODEL_OFFSET}
          equipped={equipped.current}
          equippedRef={equipped}
          weaponRef={playerWeaponObject}
          offHandRef={playerOffHandObject}
          hurtboxRef={playerHurtbox}
          headBoneRef={playerHeadBone}
          aimPitchRef={aimPitch}
          visualProbe={visualScenario ? playerVisualProbe.current : undefined}
          visualSupportY={0}
        />
        </Suspense>
      </PlayerBody>
      {HAS_SKELETAL_HURTBOX
        ? <SkeletalHurtbox rig={playerHurtbox} name={PLAYER_HURTBOX_NAME} probe={Boolean(visualScenario)} />
        : <CapsuleHurtbox controller={player} name={PLAYER_HURTBOX_NAME} />}
      <HeldObjectHitbox
        object={playerWeaponObject}
        margin={0}
        overlaps={playerWeaponOverlaps}
        name="player-weapon"
        active={playerHitboxActive}
        outline={showWeaponHitboxes}
        outlineColor="#ffd24d"
      />
      <Suspense fallback={null}>
        <Arrows onHit={handleArrowHit} />
      </Suspense>
      <HeldObjectHitbox
        object={playerParryObject}
        margin={PARRY_VOLUME_MARGIN_METERS}
        overlaps={playerParryOverlaps}
        name="player-parry-shield"
        active={playerParryActive}
        outline={showWeaponHitboxes}
        outlineColor="#4dd2ff"
      />
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
          reticleVisible={lockedOnSnapshot
            && lockedTargetSnapshot === runtime.id
            && playerActionSnapshot !== "backstab"
            && playerActionSnapshot !== "riposte"}
          validation={Boolean(visualScenario)}
        />
      ))}
    </>
  );
}

export function CombatScene({ visualScenario = null }: { visualScenario?: VisualScenario | null }) {
  const showHitboxes = useGameStore((state) => state.showHitboxes);
  // The inventory is a modal screen: the world stops while it is up. Pausing
  // the solver rather than only the combat update is what keeps an actor from
  // sliding to a halt, or an arrow from landing, behind the panel.
  const paused = useInventoryStore((state) => state.open) && !visualScenario;
  return (
    <>
      <color attach="background" args={["#dceff4"]} />
      <fog attach="fog" args={["#dceff4", 20, 46]} />
      <ambientLight intensity={0.9} color="#ffffff" />
      <hemisphereLight intensity={1.25} color="#f8fdff" groundColor="#b8c5c2" />
      <directionalLight
        castShadow
        position={[7, 12, 6]}
        intensity={2.8}
        color="#fff8e8"
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} interpolate paused={paused} debug={showHitboxes}>
        <Arena />
        <Battle visualScenario={visualScenario} />
      </Physics>
    </>
  );
}
