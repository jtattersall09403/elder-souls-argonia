import type { EcctrlHandle } from "ecctrl";
import type { MutableRefObject, RefObject } from "react";
import { createAnimationCommand, type AnimationCommand } from "@elder-souls/game-core/anim/animationCommand";
import { forwardFromYaw, guardCovers } from "@elder-souls/game-core/combat/blockReaction";
import { createFighter, type Fighter } from "@elder-souls/game-core/combat/fighter";
import { MAX_ENEMIES } from "@elder-souls/game-core/combat/tuning";
import { DEFAULT_ENEMY_ARCHETYPE, type EnemyArchetype } from "@elder-souls/game-core/actors/enemyArchetypes";
import { CHARACTER_BODY_CENTER_HEIGHT } from "@elder-souls/game-core/physics/characterPhysics";
import type { AttackDefinition, PairedCriticalProfile } from "@elder-souls/game-core/equipment/types";
import { createActorVisualProbe, type ActorVisualProbe } from "@elder-souls/game-core/validation/actorVisualMetrics";
import { OverlapCounter } from "@elder-souls/game-core/combat/overlaps";
import { initialAwareness, type AwarenessState } from "@elder-souls/game-core/perception/detection";
import { bodyImpactTarget, footwearFor, guardSoundClass } from "@elder-souls/game-core/fx/soundClasses";
import { wornArmourFor } from "@elder-souls/game-core/inventory/store";
import type { Footwear, GuardClass, ImpactTarget } from "@elder-souls/audio";
import type { HurtboxBone } from "../SkeletalHurtbox";
import type { SoleBoneRefs } from "../SkyrimFighter";
import { createFootstepState, type FootstepState } from "./soundStep";
import * as THREE from "three";

/**
 * Whether a shot came from somewhere the defender's guard is covering.
 *
 * A shield covers the front. An arrow arriving from behind meets a back, and a
 * defender who is fully protected from every direction at once is a defender no
 * archer can ever flank. `guardCovers` for an enemy, whose facing and position
 * live in two places.
 */
export function enemyGuardCovers(victim: EnemyRuntime, threat: { x: number; z: number }) {
  return guardCovers(forwardFromYaw(victim.fighter.yaw), victim.position, threat);
}

export const DEFAULT_ENEMY_SPAWNS = [
  new THREE.Vector3(-3.4, CHARACTER_BODY_CENTER_HEIGHT, -4.5),
  new THREE.Vector3(0, CHARACTER_BODY_CENTER_HEIGHT, -6),
  new THREE.Vector3(3.4, CHARACTER_BODY_CENTER_HEIGHT, -4.5),
].slice(0, MAX_ENEMIES);

export function parryObjectRef(
  offHand: RefObject<THREE.Object3D | null>,
  weapon: RefObject<THREE.Object3D | null>,
): RefObject<THREE.Object3D | null> {
  return { get current() { return offHand.current ?? weapon.current; } } as RefObject<THREE.Object3D | null>;
}

// One enemy's full runtime: its Fighter combat model plus the view/physics
// handles the simulation drives. Plain ref objects let the parent build an
// array of these without per-item hooks.
export type EnemyRuntime = {
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
  /**
   * The ATTACKER's paired profile and attack, held for the duration of a
   * critical taking this enemy as victim. The victim's choreography and its
   * outcome timing are the attacker's — resolving them from the victim's own
   * weapon (as this used to) drove a battleaxe backstab's victim on the
   * sword's paired clip, whose outcome moment the axe's swing never reaches.
   */
  criticalByPair: PairedCriticalProfile | null;
  criticalByAttack: AttackDefinition | null;
  /**
   * Seconds a blade-on-body contact has been deferred while a parry catch is
   * active, in either direction. Sensor contact order is a frame lottery, so
   * a parry gets this long to register its clash before the hit lands.
   */
  parryContactGrace: number;
  /**
   * An archer's bow, as the simulation sees it: the direction the nocked
   * shaft lies along (facing plus solved elevation), the pitch the upper body
   * leans to, whether a shaft is on the string, and where the nock is in the
   * world — which is where the loosed arrow leaves from.
   */
  aimDirection: MutableRefObject<THREE.Vector3>;
  aimPitch: MutableRefObject<number>;
  /** Bearing from the nock to the target, radians; the shot's own line. */
  aimYaw: MutableRefObject<number>;
  /** The rigged bow's draw: 0-1 pull, and a counter bumped on every loose. */
  bowDrawFraction: MutableRefObject<number>;
  bowRelease: MutableRefObject<number>;
  nockVisible: MutableRefObject<boolean>;
  nockWorld: MutableRefObject<THREE.Vector3>;
  /**
   * Seconds the archer has held at full draw waiting to face its target
   * before loosing. A bow shoots where it points, so the shot waits for the
   * turn rather than leaving sideways out of an archer still turning.
   */
  bowFacingDelay: number;
  /**
   * Whether the swing in progress takes its movement from its own feet
   * (started in range) or from the authored lunge (started beyond it).
   * Decided once, when the attack starts: switching to the feet mid-lunge as
   * the range closed let HEAVY_2's authored back-step walk the enemy straight
   * back out of the reach its lunge had just bought.
   */
  attackFromFeet: boolean;
  position: THREE.Vector3;
  /**
   * This enemy's awareness of the player (decision 0092): unaware and
   * suspicious enemies select no intent (`enemyStep`), and a player blow on
   * one that is not engaged takes the sneak-attack table. Advanced by
   * `stealthStep` before the enemy's own step.
   */
  awareness: AwarenessState;
  /** Where the player was last seen or heard; a suspicious enemy turns toward it. */
  lastKnownPlayer: THREE.Vector3 | null;
  dodgeDirection: THREE.Vector3;
  bodyName: string;
  hurtboxName: string;
  weaponName: string;
  /**
   * What this enemy sounds like (decision 0095), fixed by its archetype: the
   * id its sounds are attributed to, its footsteps, what a blow on its body
   * strikes and what takes a blow it blocks.
   */
  sound: { source: string; footwear: Footwear; body: ImpactTarget; guard: GuardClass };
  /** The swing in progress has sounded (reset as each action starts). */
  swingSounded: boolean;
  /** Live foot bones, for its footsteps. */
  soleBones: MutableRefObject<SoleBoneRefs | null>;
  footsteps: FootstepState;
};

/** Awareness for an enemy that is already fighting: every enemy while stealth is off. */
export function engagedAwareness(): AwarenessState {
  return { ...initialAwareness(), awareness: "engaged", suspicion: 1 };
}

export function createEnemyRuntime(
  id: number,
  start: THREE.Vector3,
  startYaw = 0,
  archetype: EnemyArchetype = DEFAULT_ENEMY_ARCHETYPE,
): EnemyRuntime {
  const fighter = createFighter(`enemy-${id}`, "enemy", archetype);
  const worn = wornArmourFor(archetype.armour);
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
    criticalByPair: null,
    criticalByAttack: null,
    parryContactGrace: 0,
    aimDirection: { current: new THREE.Vector3(0, 0, 1) },
    aimPitch: { current: 0 },
    aimYaw: { current: 0 },
    bowDrawFraction: { current: 0 },
    bowRelease: { current: 0 },
    nockVisible: { current: false },
    nockWorld: { current: new THREE.Vector3() },
    bowFacingDelay: 0,
    attackFromFeet: false,
    position: start.clone(),
    awareness: engagedAwareness(),
    lastKnownPlayer: null,
    dodgeDirection: new THREE.Vector3(),
    bodyName: `enemy-${id}`,
    hurtboxName: `enemy-${id}-hurtbox`,
    weaponName: `enemy-weapon-${id}`,
    sound: {
      source: fighter.id,
      footwear: footwearFor(worn),
      body: bodyImpactTarget(worn),
      guard: guardSoundClass(archetype.loadout),
    },
    swingSounded: false,
    soleBones: { current: null },
    footsteps: createFootstepState(),
  };
}
