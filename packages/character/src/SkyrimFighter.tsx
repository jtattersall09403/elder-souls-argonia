import { assetUrl } from "./assetBase";
import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { animationMixerDelta, type AnimationCommand } from "@elder-souls/game-core/anim/animationCommand";
import {
  crossFadeSoleClearance,
  nextSupportCorrection,
  nextUpwardGroundCorrection,
  requiredSupportCorrection,
  resolveSupportCorrection,
  sampleSoleMarkerClearance,
  sampleSoleMarkerClearanceById,
  sampleSoleMarkerPointById,
  sampleSupportEnvelope,
  supportModeAt,
  supportModeDuringCrossFade,
  usesCrossFadeSoleProxy,
} from "@elder-souls/game-core/anim/grounding";
import {
  animationPackFiles,
  resolveAnimationPacks,
  HURTBOX_SEGMENTS,
  sanitizeBoneName,
  CHARACTER_SCALE,
  AIRBORNE_IMPACT_PROXIMITY_METERS,
  CROSS_FADE_SOLE_SAFETY_MARGIN_METERS,
  LOCOMOTION_STATES,
  RIG_SOCKETS,
  RIG_SOCKET_ROTATION,
  clipConfig,
  transitionCrossFadeDuration,
} from "@elder-souls/game-core/anim/animationManifest";
import { CHARACTER_BODY_CENTER_HEIGHT, CHARACTER_MODEL_OFFSET } from "@elder-souls/game-core/physics/characterPhysics";
import type { AnimationState, WeaponSocketTransform, WeaponVisualProfile } from "@elder-souls/game-core/core/types";
import { VISUAL_PROBE_BONES, type ActorVisualProbe } from "@elder-souls/game-core/validation/actorVisualMetrics";
import { VISUAL_FRAME_PHASE_PRIORITY } from "@elder-souls/game-core/validation/visualFrameMarker";
import { applyAppearance, clearAppearance } from "@elder-souls/game-core/actors/appearance";
import { headMeshes } from "@elder-souls/game-core/actors/headMeshes";
import { releaseMeshHiding, setMeshHidden } from "@elder-souls/game-core/actors/meshVisibility";
import { DEFAULT_RACE, raceById, type RaceDefinition, type RaceId } from "@elder-souls/game-core/actors/races";
import type { ArmourDefinition } from "@elder-souls/game-core/equipment/armour";
import type { MountedArmour } from "@elder-souls/game-core/actors/armourMounting";
import { ArmourAttachments } from "./ArmourAttachments";
import { NockedArrow } from "./NockedArrow";
import { OffHandItem, type BowDrawRefs } from "./OffHandItem";
import { createRiggedBow } from "./riggedBow";
import type { HurtboxBone, HurtboxRigRef } from "./SkeletalHurtbox";

/**
 * The rig carries the skeleton and the semantic clips; a race GLB carries only
 * that race's skin. They are separate downloads because the animations are
 * identical for every race and would otherwise be duplicated per body.
 *
 * Nothing has to be re-bound to join them: both are built from the same
 * skeleton, so the clips' bone names resolve against whichever race model is
 * mounted, and `useAnimations` binds by name.
 *
 * The rig is itself several downloads — one *animation pack* per weapon family
 * plus an always-loaded core (see `animationManifest`). Every pack repeats the
 * same skeleton and adds only its own clips, so joining them is concatenating
 * clip lists; nothing knows or cares which file a clip arrived in.
 */
function packUrls(packs: readonly string[]) {
  return animationPackFiles(packs).map(({ asset, revision }) => assetUrl(`${asset}?v=${revision}`));
}

const CORE_PACK_URLS = packUrls(resolveAnimationPacks([]));

const NO_ARMOUR: readonly ArmourDefinition[] = [];



/**
 * How the aim angle is spread up the spine.
 *
 * The two spine shares sum to *one* on purpose, and the head's is extra. Bones
 * compose down the chain, and the arms hang off Spine2 — so what the bow
 * receives is Spine1 + Spine2 and nothing else. Counting the head into the
 * total leaves the hands short of the aim line by exactly the head's share,
 * which reads as the bow lagging behind the crosshair.
 */
type AimBone = { share: number; object: THREE.Object3D; authored: THREE.Quaternion | null };

/** Time constant for easing the lean toward where the player is looking. */
const AIM_PITCH_SMOOTHING_SECONDS = 0.09;

/**
 * Authored clip seconds per second of the clock driving this action.
 *
 * The manifest's `playbackRate` is a property of the *clip* — how the pipeline
 * retimed the source. The command's `timeScale` is a property of this
 * *performance* — how much slower a heavy weapon does the same motion. They
 * compose, and both have to be here rather than only on the first, because an
 * externally timed action is paused and driven by hand: `action.timeScale`
 * would never be read.
 */
function clipRate(config: { playbackRate: number }, command: { timeScale?: number }) {
  return config.playbackRate / (command.timeScale || 1);
}

const AIM_PITCH_BONES: readonly { bone: string; share: number }[] = [
  { bone: "NPC Spine1 [Spn1]", share: 0.35 },
  { bone: "NPC Spine2 [Spn2]", share: 0.65 },
  { bone: "NPC Head [Head]", share: 0.15 },
];

function raceUrl(race: RaceDefinition) {
  return assetUrl(`${race.asset}?v=${race.revision}`);
}

// Progress (0-1) through EQUIP/UNEQUIP at which the sword switches sockets,
// matching roughly when the drawing/sheathing hand reaches the hip in the
// source clips.
const EQUIP_GRAB_PROGRESS = 0.45;
const UNEQUIP_STOW_PROGRESS = 0.5;

// Sole markers used only for an upward residual penetration guard. They are
// bone origins, not a promise that every authored action keeps a foot planted.
// Names are GLTFLoader's sanitized form of the rig's "NPC Foot [ft ].L" etc.
// bone names (three.js strips spaces/brackets/dots from Object3D names on load).
const SOLE_MARKERS = [
  { id: "footL", boneName: "NPC_Foot_ft_L" },
  { id: "footR", boneName: "NPC_Foot_ft_R" },
  { id: "toeL", boneName: "NPC_Toe0_ToeL" },
  { id: "toeR", boneName: "NPC_Toe0_ToeR" },
] as const;
const TARGET_ANCHOR_BONE_NAME = "NPC_Spine2_Spn2";

/**
 * Small code-native Estus stand-in mounted to the animated weapon hand.
 *
 * The Skyrim potion animation assumes a held object, but the source character
 * GLB deliberately contains no consumable prop. Rendering the bare animation
 * makes the character appear to scratch his head. Keep the prop independent
 * from the character asset so another game can replace its geometry/material
 * without changing the animation or combat controller.
 */
function createHealingFlask() {
  const flask = new THREE.Group();
  flask.name = "HealingFlask";
  flask.visible = false;

  const glass = new THREE.MeshStandardMaterial({
    color: 0xb86a24,
    emissive: 0x6a2408,
    emissiveIntensity: 0.8,
    roughness: 0.34,
    metalness: 0.08,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0xc8a663,
    roughness: 0.42,
    metalness: 0.65,
  });
  const cork = new THREE.MeshStandardMaterial({
    color: 0x5b351f,
    roughness: 0.95,
  });

  // Geometry is authored in real metres. The mount below counter-scales the
  // imported Skyrim rig so this remains a palm-sized 18 cm flask.
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), glass);
  body.scale.set(0.82, 0.82, 1.08);
  body.position.z = 0.082;
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.048, 0.05, 12), glass);
  shoulder.rotation.x = Math.PI / 2;
  shoulder.position.z = 0.145;
  const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.034, 10), cork);
  stopper.rotation.x = Math.PI / 2;
  stopper.position.z = 0.182;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 8, 16), metal);
  collar.position.z = 0.16;

  for (const part of [body, shoulder, stopper, collar]) {
    part.castShadow = true;
    part.receiveShadow = true;
    flask.add(part);
  }
  return flask;
}

/**
 * Skyrim-derived character actor. Loads the pipeline-built GLB whose actions are
 * already named with SEMANTIC game states (IDLE, ROLL, LIGHT_1, ...), plays them
 * from an {@link AnimationCommand}, and mounts the sword on the native rig
 * socket. It carries none of the old mannequin coupling — no DEF-* bone lookups,
 * procedural posing, foot markers, weapon IK or runtime root-motion stripping
 * (root motion is already resolved in the asset pipeline).
 */
/**
 * A Skyrim actor.
 *
 * Keyed by race, deliberately. The animation mixer resolves each clip's target
 * bones *once*, by name, against whatever was mounted when the action was first
 * played. Swapping the race body underneath it leaves every one of those
 * bindings pointing at the previous skeleton, and the new one stands in its
 * bind pose for the rest of the session. Rebuilding the mixer is the only
 * honest fix, and remounting is how a React component rebuilds.
 */
export function SkyrimFighter({ animationPacks, ...props }: SkyrimFighterProps) {
  // Resolved here, not inside, so the key and the loaded files come from one
  // answer. `requires` closure included, `core` always present.
  const packs = useMemo(
    () => resolveAnimationPacks(animationPacks ?? []),
    [animationPacks],
  );
  // Keyed by pack set as well as race, for the same reason: the mixer resolves
  // each clip's bones once, against whatever was mounted when the action was
  // first played. Changing the clip list under a live mixer leaves its existing
  // bindings pointing at the old data; rebuilding it is the only honest fix,
  // and remounting is how a React component rebuilds. Weapon swaps happen
  // through the (world-paused) inventory, so the remount is not visible.
  return (
    <PosedActor
      key={`${props.raceId ?? DEFAULT_RACE}|${packs.join(",")}`}
      packs={packs}
      {...props}
    />
  );
}

type SkyrimFighterProps = Omit<Parameters<typeof PosedActor>[0], "packs"> & {
  /**
   * Animation packs this actor must be able to play, usually
   * `loadoutAnimationPacks(loadout)`. Dependencies and the core pack are added
   * for you; an empty list is a body that only ever does core motion.
   */
  animationPacks?: readonly string[];
};

function PosedActor({
  packs,
  animationCommandRef,
  equipped,
  equippedRef,
  enemy = false,
  weaponRef,
  targetAnchorRef,
  hurtboxRef,
  headBoneRef,
  aimPitchRef,
  animationTimeRef,
  speedMultiplierRef,
  weaponProfile,
  offHandProfile = null,
  bowDraw,
  offHandRef,
  armour = NO_ARMOUR,
  nockedArrow = null,
  firstPerson = false,
  hidden = false,
  raceId = DEFAULT_RACE,
  modelOffsetY = CHARACTER_MODEL_OFFSET,
  validationTint,
  visualProbe,
  visualSupportY = 0,
  visualSupportYRef,
}: {
  /** Already-resolved pack ids; the wrapper above owns the resolution. */
  packs: readonly string[];
  animationCommandRef: MutableRefObject<AnimationCommand>;
  equipped: boolean;
  equippedRef?: MutableRefObject<boolean>;
  enemy?: boolean;
  weaponRef?: MutableRefObject<THREE.Object3D | null>;
  /** Receives the mounted off-hand item, so a parry can use its own volume. */
  offHandRef?: MutableRefObject<THREE.Object3D | null>;
  /** Animated upper-body anchor for lock-on UI or other actor-following effects. */
  targetAnchorRef?: MutableRefObject<THREE.Object3D | null>;
  /** Receives this actor's live skeleton-fitted combat capsules. */
  hurtboxRef?: HurtboxRigRef;
  /**
   * Receives the live head bone, for a first-person camera to sit on.
   *
   * Anchoring the eye to the skeleton rather than to a measured height is what
   * makes the view track the pose: an archer's head comes to the string, and a
   * camera pinned at a constant height would not.
   */
  headBoneRef?: MutableRefObject<THREE.Object3D | null>;
  /**
   * Radians the upper body should lean to look where the actor is aiming.
   * Positive is upward. Zero, or absent, leaves the authored pose alone.
   */
  aimPitchRef?: MutableRefObject<number>;
  animationTimeRef?: MutableRefObject<number>;
  /** Extra multiplier on top of the manifest playbackRate for self-timed (locomotion) clips. */
  speedMultiplierRef?: MutableRefObject<number>;
  weaponProfile: WeaponVisualProfile;
  /** Shield or other off-hand item, or null for an empty hand. */
  offHandProfile?: WeaponVisualProfile | null;
  /** The archer's draw, for a rigged bow in the off hand. */
  bowDraw?: BowDrawRefs;
  /** Worn armour. Each piece is skinned to the shared rig and hides what it covers. */
  armour?: readonly ArmourDefinition[];
  /**
   * Arrow to show on the string, or null for none. Mounted on the drawing hand
   * so the authored draw carries it from the quiver to the anchor.
   */
  nockedArrow?: {
    asset: string;
    visible: boolean;
    /** Per-frame visibility for simulation-driven actors (an enemy's draw). */
    visibleRef?: MutableRefObject<boolean>;
    /** Unit world direction of the shot, so the shaft lies along it. */
    aimDirection: MutableRefObject<THREE.Vector3>;
    /** Receives the nock's world position each frame; the shot leaves from it. */
    nockWorld?: MutableRefObject<THREE.Vector3>;
  } | null;
  /**
   * The aim camera is looking down this actor's own shot axis.
   *
   * Collapses the head bone rather than hiding meshes: eyes, mouth, hair and a
   * helmet are all weighted to it, so scaling the bone away takes every one of
   * them with it and nothing has to know which mesh is a face on which race.
   * Everything below the neck stays visible on purpose: the arms and the bow
   * are what the shot is made of.
   */
  firstPerson?: boolean;
  /**
   * The whole body is hidden: the first-person arms rig is drawing the player
   * instead. Bones and mixer keep running, so hurtboxes and sockets stay live.
   */
  hidden?: boolean;
  /** Which body to mount on the shared rig. */
  raceId?: RaceId;
  modelOffsetY?: number;
  /** High-contrast actor identity used only by production-path visual scenarios. */
  validationTint?: THREE.ColorRepresentation;
  /** Optional read-only render-pose probe used by production visual validation. */
  visualProbe?: ActorVisualProbe;
  /** Known world-space support plane used by the upward-only penetration guard and validation. */
  visualSupportY?: number;
  /**
   * Live world-space support height, read every frame — for actors standing on
   * varying terrain (the world studio). Takes precedence over the static
   * `visualSupportY`; feeding the wrong plane makes floor-contact clip phases
   * snap the model to it (a character 170 m up vanishes underground).
   */
  visualSupportYRef?: MutableRefObject<number>;
}) {
  const race = raceById(raceId);
  // The pack list is fixed for this component's lifetime (the wrapper keys on
  // it), so this array-form load has a stable length even though its contents
  // are computed.
  const rigUrls = useMemo(() => packUrls(packs), [packs]);
  const rigs = useGLTF(rigUrls) as unknown as { animations: THREE.AnimationClip[] }[];
  const rigClips = useMemo(() => rigs.flatMap((pack) => pack.animations), [rigs]);
  const gltf = useGLTF(raceUrl(race));
  // A bow with a rigged build is mounted rigged, string and all; the archer's
  // draw drives it (`riggedBow`). Every other weapon is its static build.
  const weaponRig = weaponProfile.rig ?? null;
  const weaponUrl = assetUrl(weaponRig?.asset ?? weaponProfile.asset);
  const weaponGltf = useGLTF(weaponUrl);
  const model = useMemo(() => {
    const instance = clone(gltf.scene);
    // SkeletonUtils intentionally shares materials. Give each fighter its own
    // instances so the enemy/validation tint cannot leak onto the player.
    instance.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
    });
    return instance;
  }, [gltf.scene]);
  const root = useRef<THREE.Group>(null);
  const riggedWeapon = useMemo(
    () => (weaponRig ? createRiggedBow(weaponGltf, weaponRig) : null),
    [weaponGltf, weaponRig],
  );
  const sword = useMemo(() => {
    if (riggedWeapon) {
      // The rig is in its skeleton's units; its measured scale brings it to
      // the class length the static build is already at.
      riggedWeapon.object.scale.setScalar(weaponRig?.scale ?? 1);
      return riggedWeapon.object;
    }
    const weapon = clone(weaponGltf.scene);
    weapon.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return weapon;
  }, [riggedWeapon, weaponGltf.scene, weaponRig]);
  const weaponMount = useMemo(() => new THREE.Group(), []);
  // The hand that is *not* holding the item. With a bow in the left hand, this
  // is the one that nocks and draws. The HAND bone, not the `Weapon` node:
  // Skyrim's bow clips animate that node a metre and a half out in front of
  // the archer (it is where the game parks a bow's grip), which is where the
  // nocked shaft was "hovering in front of the bow" (owner, rounds 6-8).
  const drawHandSocket = useMemo(
    () => model.getObjectByName(sanitizeBoneName(RIG_SOCKETS.rightHand))
      ?? model.getObjectByName(RIG_SOCKETS.weaponFallback)
      ?? null,
    [model],
  );
  const healingFlask = useMemo(() => createHealingFlask(), []);

  const headBone = useMemo(
    () => (RIG_SOCKETS.head ? model.getObjectByName(sanitizeBoneName(RIG_SOCKETS.head)) ?? null : null),
    [model],
  );
  /**
   * The head, hidden outright in first person.
   *
   * This used to shrink the head *bone* to a thousandth instead. That worked,
   * but it is a skinning trick with two costs: the neck verts are weighted to
   * both head and spine, so collapsing one end of that blend distorts the
   * collar, and it only ever hides what the head bone happens to skin. Hiding
   * the meshes is exact, reversible in one frame, and — the reason the owner
   * asked for it — it makes the camera position safe: with nothing rendered
   * there at all, the eye can sit where an eye actually is without any risk of
   * ending up inside geometry.
   *
   * `headMeshes` identifies them by skinning rather than by name or biped slot,
   * so it holds for every race and for races not authored yet.
   */
  const faceMeshes = useMemo(() => headMeshes(model, headBone), [model, headBone]);
  // Restored on the way out, so the actor is left exactly as it was found.
  useLayoutEffect(() => {
    if (!firstPerson) return undefined;
    // Claimed under this component's own reason rather than assigned, because
    // the head is also a *body* mesh as far as the race roster is concerned and
    // `mountArmour` has its own opinion about those. Two owners of one boolean
    // is decided by effect ordering, which is to say by nothing.
    for (const mesh of faceMeshes) setMeshHidden(mesh, "firstPerson", true);
    return () => releaseMeshHiding(faceMeshes, "firstPerson");
  }, [firstPerson, faceMeshes]);

  useLayoutEffect(() => {
    if (!headBoneRef) return;
    headBoneRef.current = headBone;
    return () => {
      if (headBoneRef.current === headBone) headBoneRef.current = null;
    };
  }, [headBone, headBoneRef]);

  /**
   * Lean the upper body to where the actor is aiming.
   *
   * An authored clip aims dead level, so without this the bow, the arrow and
   * both arms stay pinned to the horizon however far the player looks up or
   * down — which in first person reads as the controls not working. Spreading
   * the angle down the spine is the cheap stand-in for the aim-offset layer a
   * blended rig would have: no clip has to be re-authored, and the head comes
   * with it, so the first-person eye leans in too.
   */
  const aimBones = useMemo(() => AIM_PITCH_BONES.map(({ bone, share }) => ({
    share,
    object: model.getObjectByName(sanitizeBoneName(bone)) ?? null,
    /** Last frame's clip-authored rotation, restored before the next update. */
    authored: null as THREE.Quaternion | null,
  })).filter((entry): entry is AimBone => Boolean(entry.object)),
  [model]);
  const aimTmp = useRef({
    parentWorld: new THREE.Quaternion(),
    parentInverse: new THREE.Quaternion(),
    delta: new THREE.Quaternion(),
    local: new THREE.Quaternion(),
    actorWorld: new THREE.Quaternion(),
    right: new THREE.Vector3(),
  });
  /**
   * Put the spine back the way the clip left it.
   *
   * Must run *before* the mixer, every frame. The lean is applied by
   * premultiplying each bone's local rotation, which is only safe if something
   * rewrites that rotation from the clip in between — and an externally timed
   * action is *paused*, so on those frames nothing does. Without this the
   * delta compounds, and the symptom is an actor whose arms accelerate
   * smoothly away from its body over a couple of seconds.
   */
  const releaseAimPitch = useCallback(() => {
    for (const entry of aimBones) {
      if (entry.authored) entry.object.quaternion.copy(entry.authored);
    }
  }, [aimBones]);

  const applyAimPitch = useCallback((pitch: number) => {
    if (Math.abs(pitch) < 1e-4 || aimBones.length === 0) return;
    const tmp = aimTmp.current;
    for (const entry of aimBones) {
      const { object, share } = entry;
      entry.authored = (entry.authored ?? new THREE.Quaternion()).copy(object.quaternion);
      const parent = object.parent;
      if (!parent) continue;
      parent.updateWorldMatrix(true, false);
      parent.getWorldQuaternion(tmp.parentWorld);
      tmp.parentInverse.copy(tmp.parentWorld).invert();
      // Pitch about the *actor's* right axis, in world space, then expressed in
      // the bone's parent frame. Bones on this rig do not share an axis
      // convention, so rotating a local axis would twist as often as it tilts.
      if (!root.current) continue;
      root.current.getWorldQuaternion(tmp.actorWorld);
      tmp.right.set(1, 0, 0).applyQuaternion(tmp.actorWorld).setY(0);
      if (tmp.right.lengthSq() < 1e-6) continue;
      tmp.right.normalize();
      // Negated: the actor's right axis points the way it does, and a positive
      // aim pitch means *up*, which about that axis is a negative rotation.
      tmp.delta.setFromAxisAngle(tmp.right, -pitch * share);
      tmp.local.copy(tmp.parentInverse).multiply(tmp.delta).multiply(tmp.parentWorld);
      object.quaternion.premultiply(tmp.local);
      object.updateWorldMatrix(false, true);
    }
  }, [aimBones]);

  const appliedAimPitch = useRef(0);

  const previousAction = useRef<THREE.AnimationAction | null>(null);
  const fadingFromAction = useRef<THREE.AnimationAction | null>(null);
  const currentState = useRef<AnimationState>(animationCommandRef.current.state);
  const consumedSerial = useRef(-1);
  const elapsed = useRef(0);
  const externalClockOrigin = useRef(0);
  const groundCorrection = useRef(0);
  const soleTmp = useRef(new THREE.Vector3());
  const bodyTmp = useRef(new THREE.Vector3());
  const rootQuaternionTmp = useRef(new THREE.Quaternion());
  const boneWorldQuaternionTmp = useRef(new THREE.Quaternion());
  const boundsTmp = useRef(new THREE.Box3());
  const meshBoundsTmp = useRef(new THREE.Box3());
  const weaponGripTmp = useRef(new THREE.Vector3());
  const socketConvention = useRef(new THREE.Quaternion());
  const itemOffset = useRef(new THREE.Quaternion());
  const weaponTipTmp = useRef(new THREE.Vector3());

  // Clips come from the rig, the skeleton they drive comes from the race body.
  const { actions, mixer } = useAnimations(rigClips, root);

  // drei's useAnimations normally advances its mixer from raw render-wall
  // delta. Combat and the deterministic visual scenarios deliberately cap
  // their simulation step, so a slow SwiftShader frame could otherwise skip
  // several authored poses while gameplay advanced only 1/30s. Keep drei's
  // automatic callback inert and advance the mixer once, below, from the same
  // capped clock used by this actor.
  useLayoutEffect(() => {
    mixer.timeScale = 0;
    return () => {
      mixer.timeScale = 1;
    };
  }, [mixer]);

  // Colour the body. Before the enemy tint below, which is a *validation*
  // overlay on top of whatever the character actually looks like.
  useLayoutEffect(() => {
    const touched = applyAppearance(model, race.appearance);
    return () => clearAppearance(touched);
  }, [model, race.appearance]);

  // Every mesh casts/receives shadows regardless of side. This must not be
  // folded into the enemy-tint effect below (that one is enemy-only), or the
  // player silently never gets shadow flags set.
  useLayoutEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }, [model]);

  // Enemy tint: recolour the skin/underwear so friend and foe read apart. A
  // stronger per-actor tint makes recorded validation roles unambiguous even
  // during dense paired-action or collision overlap.
  useLayoutEffect(() => {
    if (!enemy && validationTint === undefined) return;
    const tint = new THREE.Color(validationTint ?? 0x7a241d);
    const strength = validationTint === undefined ? 0.45 : 0.72;
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of mats) {
        const standard = material as THREE.MeshStandardMaterial;
        if (!standard.color) continue;
        standard.color.lerp(tint, strength);
      }
    });
  }, [enemy, model, validationTint]);

  // The two sockets the sword can rigidly mount on: the hand (drawn) and the
  // hip sheath (stowed). Each keeps its own counter-scale + corrective
  // rotation; only one holds the weaponMount at a time (see useFrame below).
  const handSocket = useMemo(
    () => model.getObjectByName(weaponProfile.held.socket) ?? model.getObjectByName(RIG_SOCKETS.weaponFallback) ?? null,
    [model, weaponProfile.held.socket],
  );
  const sheathSocket = useMemo(
    () => model.getObjectByName(weaponProfile.sheathed.socket) ?? null,
    [model, weaponProfile.sheathed.socket],
  );
  const currentSocket = useRef<THREE.Object3D | null>(null);
  const soleBones = useMemo(
    () => SOLE_MARKERS.flatMap(({ id, boneName }) => {
      const bone = model.getObjectByName(boneName);
      return bone ? [{ id, bone }] : [];
    }),
    [model],
  );
  const targetAnchor = useMemo(() => model.getObjectByName(TARGET_ANCHOR_BONE_NAME) ?? null, [model]);
  // Resolve the pipeline-fitted combat capsules onto this instance's bones.
  // Endpoints stay in unscaled bone space; the actor's scale arrives through
  // the bone's own world matrix, exactly as the baked sole markers do.
  const hurtboxBones = useMemo<HurtboxBone[]>(
    () => HURTBOX_SEGMENTS.flatMap((segment) => {
      const bone = model.getObjectByName(sanitizeBoneName(segment.bone));
      return bone
        ? [{
          bone,
          from: new THREE.Vector3().fromArray(segment.from),
          to: new THREE.Vector3().fromArray(segment.to),
          radius: segment.radius,
          halfLength: segment.halfLength,
        }]
        : [];
    }),
    [model],
  );
  const probeBones = useMemo(
    () => Object.entries(VISUAL_PROBE_BONES).map(([id, name]) => [id, model.getObjectByName(name) ?? null] as const),
    [model],
  );
  // Armour arrives after the body (its GLBs suspend separately), so re-collect
  // when it does: this list is what drives the per-frame skeleton refresh and
  // the actor's mesh bounds, and a cuirass left out of it would not deform.
  const [armourRevision, setArmourRevision] = useState(0);
  // Worn footwear stands the actor on its soles instead of its bare feet. The
  // grounding solve aims at sole markers measured on a bare foot, so this is a
  // constant lift on top of it rather than anything the solve has to know about.
  // Worn meshes are excluded from the actor's measured surface. Every support
  // envelope, sole marker and penetration allowance in this file was fitted to
  // the *body*; armour has no envelope of its own and legitimately reaches a
  // few millimetres past bare skin, so folding it into the same measurement
  // would compare a bare-body calibration against a shod silhouette.
  const armourMeshes = useRef<ReadonlySet<THREE.SkinnedMesh>>(new Set());
  const onArmourChange = useCallback((mounted: MountedArmour | null) => {
    armourMeshes.current = new Set(mounted?.meshes ?? []);
    setArmourRevision((n) => n + 1);
  }, []);
  const skinnedMeshes = useMemo(() => {
    const meshes: THREE.SkinnedMesh[] = [];
    model.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) meshes.push(object);
    });
    return meshes;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- armourRevision marks a mutation of `model`.
  }, [model, armourRevision]);

  useLayoutEffect(() => {
    if (!visualProbe) return;
    visualProbe.missingBones = probeBones.filter(([, bone]) => !bone).map(([id]) => id);
    return () => {
      visualProbe.current = null;
      visualProbe.missingBones = [];
    };
  }, [probeBones, visualProbe]);

  useLayoutEffect(() => {
    if (!hurtboxRef) return;
    hurtboxRef.current = hurtboxBones;
    return () => {
      if (hurtboxRef.current === hurtboxBones) hurtboxRef.current = null;
    };
  }, [hurtboxBones, hurtboxRef]);

  useLayoutEffect(() => {
    if (targetAnchorRef) targetAnchorRef.current = targetAnchor;
    return () => {
      if (targetAnchorRef?.current === targetAnchor) targetAnchorRef.current = null;
    };
  }, [targetAnchor, targetAnchorRef]);

  const mountOnSocket = (socket: THREE.Object3D, transform: WeaponSocketTransform) => {
    if (currentSocket.current === socket) return;
    currentSocket.current?.remove(weaponMount);
    model.updateWorldMatrix(true, true);
    const worldScale = socket.getWorldScale(new THREE.Vector3()).x || 1;
    weaponMount.scale.setScalar(transform.localScale / worldScale);
    weaponMount.position.fromArray(transform.localPosition);
    socketConvention.current.fromArray(RIG_SOCKET_ROTATION as unknown as number[]).normalize();
    // Rig convention first, then whatever offset the item itself declares. The
    // convention is a property of the skeleton (weapon assets keep their native
    // attach-node axes, the armature stores bones in Blender's), so it is
    // applied once here for every socket and every weapon instead of being
    // baked by hand into each weapon definition.
    weaponMount.quaternion
      .copy(socketConvention.current)
      .multiply(itemOffset.current.fromArray(transform.localRotation).normalize())
      .normalize();
    socket.add(weaponMount);
    currentSocket.current = socket;
  };

  useLayoutEffect(() => {
    sword.position.set(0, 0, 0);
    sword.quaternion.identity();
    if (!riggedWeapon) sword.scale.setScalar(1);
    weaponMount.add(sword);
    if (weaponRef) weaponRef.current = weaponMount;
    if (handSocket) mountOnSocket(handSocket, weaponProfile.held);
    return () => {
      if (weaponRef?.current === weaponMount) weaponRef.current = null;
      currentSocket.current?.remove(weaponMount);
      currentSocket.current = null;
      weaponMount.remove(sword);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handSocket, sheathSocket, sword, weaponMount, weaponProfile, weaponRef]);

  useLayoutEffect(() => {
    if (!handSocket) return;
    model.updateWorldMatrix(true, true);
    const worldScale = handSocket.getWorldScale(new THREE.Vector3()).x || 1;
    healingFlask.scale.setScalar(1 / worldScale);
    healingFlask.position.fromArray(weaponProfile.held.localPosition);
    healingFlask.quaternion
      .fromArray(RIG_SOCKET_ROTATION as unknown as number[])
      .normalize()
      .multiply(new THREE.Quaternion().fromArray(weaponProfile.held.localRotation).normalize())
      .normalize();
    handSocket.add(healingFlask);
    return () => {
      handSocket.remove(healingFlask);
    };
  }, [handSocket, healingFlask, model, weaponProfile.held.localPosition, weaponProfile.held.localRotation]);

  useFrame((_, delta) => {
    const command = animationCommandRef.current;

    // Consume a new command: cross-fade into the semantic action.
    if (consumedSerial.current !== command.serial) {
      const state = command.state;
      const outgoingState = currentState.current;
      const config = clipConfig(state);
      const action = actions[state];
      currentState.current = state;
      elapsed.current = command.startAt;
      externalClockOrigin.current = animationTimeRef?.current ?? 0;
      if (action) {
        const externallyTimed = Boolean(animationTimeRef) && !LOCOMOTION_STATES.has(state);
        const playbackStartTime = config.playbackStartTime ?? 0;
        action.reset();
        action.enabled = true;
        action.paused = externallyTimed;
        action.timeScale = config.playbackRate * (externallyTimed ? 1 : speedMultiplierRef?.current ?? 1);
        action.clampWhenFinished = !config.looping;
        action.setLoop(config.looping ? THREE.LoopRepeat : THREE.LoopOnce, config.looping ? Infinity : 1);
        action.time = Math.min(
          action.getClip().duration,
          playbackStartTime + command.startAt * clipRate(config, command),
        );
        action.paused = externallyTimed;
        if (previousAction.current && previousAction.current !== action) {
          fadingFromAction.current = previousAction.current;
          const outgoingEnd = clipConfig(outgoingState).playbackEndTime;
          if (outgoingEnd != null) {
            // An authored out-point is a real pose boundary, not only a speed
            // hint. Freeze that pose while its weight fades so the rejected
            // tail cannot leak back into the transition.
            previousAction.current.time = Math.min(previousAction.current.time, outgoingEnd);
            previousAction.current.paused = true;
          }
          // Duration warping makes the same incoming pose play at a different
          // speed depending on the outgoing clip (for example RUN made the
          // already-compressed jump launch start ~2.65x faster than SWORD_IDLE).
          // These are pose blends, not synchronized cycle blends, so preserve
          // each action's configured time scale.
          action.crossFadeFrom(
            previousAction.current,
            transitionCrossFadeDuration(state, outgoingState, command.crossFadeDuration),
            false,
          );
        }
        action.play();
        previousAction.current = action;
      }
      consumedSerial.current = command.serial;
    }

    const state = currentState.current;
    const config = clipConfig(state);
    const externallyTimed = Boolean(animationTimeRef) && !LOCOMOTION_STATES.has(state);
    const action = previousAction.current;
    const elapsedBeforeUpdate = elapsed.current;
    const renderMixerDelta = animationMixerDelta(delta);

    if (externallyTimed && action) {
      // Combat owns timing: drive clip time from the gameplay action clock so
      // the visual never runs ahead of the combat state machine.
      elapsed.current = Math.max(0, animationTimeRef!.current - externalClockOrigin.current) + command.startAt;
      const clip = action.getClip();
      action.time = Math.min(
        clip.duration,
        (config.playbackStartTime ?? 0) + elapsed.current * clipRate(config, command),
      );
    } else {
      elapsed.current += renderMixerDelta;
      // Locomotion clips are self-timed by the mixer; the speed multiplier can
      // change every frame (e.g. lock-on strafing), unlike at consume-time.
      if (action) action.timeScale = config.playbackRate * (speedMultiplierRef?.current ?? 1);
    }

    const mixerDelta = animationMixerDelta(
      delta,
      externallyTimed ? elapsedBeforeUpdate : null,
      externallyTimed ? elapsed.current : null,
    );

    // Advance blend weights and self-timed clips from their authoritative
    // clock. Externally timed actions are paused, so this updates their fades
    // without moving them away from the combat action clock above.
    releaseAimPitch();
    mixer.timeScale = 1;
    mixer.update(mixerDelta);
    mixer.timeScale = 0;
    if (riggedWeapon) {
      const stowed = !(equippedRef?.current ?? equipped);
      riggedWeapon.update(stowed ? 0 : (bowDraw?.fraction.current ?? 0), bowDraw?.release.current ?? 0, delta);
    }
    if ((fadingFromAction.current?.getEffectiveWeight() ?? 0) <= 1e-5) fadingFromAction.current = null;
    // Eased, not applied raw. The lean moves the whole upper body, so a stick
    // flicked from level to full elevation would teleport both hands most of a
    // metre in one frame — which is both a visible snap and a real hazard for
    // anything watching bone travel.
    appliedAimPitch.current += (
      (aimPitchRef?.current ?? 0) - appliedAimPitch.current
    ) * (1 - Math.exp(-mixerDelta / AIM_PITCH_SMOOTHING_SECONDS));
    applyAimPitch(appliedAimPitch.current);
    if (action && config.playbackEndTime != null && action.time > config.playbackEndTime) {
      // Clamp the currently playing action as soon as it reaches its authored
      // out-point. Waiting until the next state consumes a command allowed the
      // rejected tail of JUMP_START to render during low-FPS frames.
      action.time = config.playbackEndTime;
      action.paused = true;
      mixer.timeScale = 1;
      mixer.update(0);
      mixer.timeScale = 0;
    }

    // The sword rides the hand socket while drawn and the hip sheath while
    // stowed. During EQUIP/UNEQUIP it switches partway through the clip, when
    // the animated hand reaches the hip, instead of snapping at the state
    // boundary. Skyrim's potion clip uses the sword hand to drink, so HEAL
    // temporarily sheathes the blade rather than visibly driving it through
    // the actor's head.
    if (handSocket && sheathSocket) {
      const progress = config.sourceDuration ? Math.min(1, elapsed.current / config.sourceDuration) : 1;
      const wantHand = state === "EQUIP"
        ? progress >= EQUIP_GRAB_PROGRESS
        : state === "UNEQUIP"
          ? progress < UNEQUIP_STOW_PROGRESS
          : state !== "HEAL" && (equippedRef?.current ?? equipped);
      mountOnSocket(wantHand ? handSocket : sheathSocket, wantHand ? weaponProfile.held : weaponProfile.sheathed);
    }
    healingFlask.visible = state === "HEAL";

    // Correct actual sole penetration, but never pull the actor down merely
    // because an authored action lifts both feet. The old bidirectional solve
    // treated foot-bone origins as mandatory contacts; during a tuck roll it
    // dragged the entire mesh more than a metre through the arena.
    const parent = root.current?.parent;
    const sourceClipTime = action?.time ?? 0;
    const resolvedSupportMode = supportModeAt(
      config.supportMode ?? "penetration",
      config.supportPhases,
      sourceClipTime,
    );
    let surfaceMinY = config.supportEnvelope
      ? sampleSupportEnvelope(config.supportEnvelope, sourceClipTime)
      : null;
    let soleMarkerClearance = config.supportEnvelope
      ? sampleSoleMarkerClearance(config.supportEnvelope, sourceClipTime)
      : null;
    const soleMarkerClearanceById = Object.fromEntries(
      SOLE_MARKERS.map(({ id }) => [
        id,
        config.supportEnvelope
          ? sampleSoleMarkerClearanceById(config.supportEnvelope, id, sourceClipTime)
          : null,
      ]),
    ) as Record<(typeof SOLE_MARKERS)[number]["id"], number | null>;
    const soleMarkerPointById = Object.fromEntries(
      SOLE_MARKERS.map(({ id }) => [
        id,
        config.supportEnvelope
          ? sampleSoleMarkerPointById(config.supportEnvelope, id, sourceClipTime)
          : null,
      ]),
    ) as Record<(typeof SOLE_MARKERS)[number]["id"], [number, number, number] | null>;
    const outgoingSoleMarkerPointById = Object.fromEntries(
      SOLE_MARKERS.map(({ id }) => [id, null]),
    ) as Record<(typeof SOLE_MARKERS)[number]["id"], [number, number, number] | null>;
    // A cross-faded skeleton is a new pose: sampling only the incoming clip's
    // support curve misses the outgoing root/leg contribution. Blend both
    // baked endpoint estimates, then use the actual blended sole markers below
    // to catch nonlinear foot arcs introduced by quaternion-chain blending.
    const outgoingAction = fadingFromAction.current;
    const incomingWeight = Math.max(0, action?.getEffectiveWeight() ?? 0);
    const outgoingWeight = Math.max(0, outgoingAction?.getEffectiveWeight() ?? 0);
    let outgoingSupportMode: ReturnType<typeof supportModeAt> | null = null;
    if (outgoingAction) {
      const outgoingConfig = clipConfig(outgoingAction.getClip().name as AnimationState);
      outgoingSupportMode = supportModeAt(
        outgoingConfig.supportMode ?? "penetration",
        outgoingConfig.supportPhases,
        outgoingAction.time,
      );
    }
    const activeSupportMode = supportModeDuringCrossFade(
      resolvedSupportMode,
      outgoingSupportMode,
      incomingWeight,
      outgoingWeight,
    );
    let probedSupportMode = activeSupportMode;
    let probedUncorrectedSurfaceY: number | null = null;
    let probedRequiredGroundCorrectionY: number | null = null;
    if (activeSupportMode !== "airborne" && action && outgoingAction) {
      const outgoingConfig = clipConfig(outgoingAction.getClip().name as AnimationState);
      const outgoingEnvelope = outgoingConfig.supportEnvelope;
      const outgoingSurface = outgoingEnvelope
        ? sampleSupportEnvelope(outgoingEnvelope, outgoingAction.time)
        : null;
      const outgoingClearance = outgoingEnvelope
        ? sampleSoleMarkerClearance(outgoingEnvelope, outgoingAction.time)
        : null;
      const totalWeight = incomingWeight + outgoingWeight;
      if (surfaceMinY != null && outgoingSurface != null && totalWeight > 1e-6) {
        surfaceMinY = (
          surfaceMinY * incomingWeight + outgoingSurface * outgoingWeight
        ) / totalWeight;
      }
      if (soleMarkerClearance != null && outgoingClearance != null && totalWeight > 1e-6) {
        soleMarkerClearance = (
          soleMarkerClearance * incomingWeight + outgoingClearance * outgoingWeight
        ) / totalWeight;
      }
      for (const { id } of SOLE_MARKERS) {
        const incomingMarkerClearance = soleMarkerClearanceById[id];
        const outgoingMarkerClearance = outgoingEnvelope
          ? sampleSoleMarkerClearanceById(outgoingEnvelope, id, outgoingAction.time)
          : null;
        if (incomingMarkerClearance != null && outgoingMarkerClearance != null && totalWeight > 1e-6) {
          soleMarkerClearanceById[id] = (
            incomingMarkerClearance * incomingWeight
            + outgoingMarkerClearance * outgoingWeight
          ) / totalWeight;
        }
        const outgoingPoint = outgoingEnvelope
          ? sampleSoleMarkerPointById(outgoingEnvelope, id, outgoingAction.time)
          : null;
        outgoingSoleMarkerPointById[id] = outgoingPoint;
      }
    }
    const hasIdentityPreservingMarkers = Object.values(soleMarkerClearanceById)
      .every((clearance) => clearance != null);
    const useSoleProxy = usesCrossFadeSoleProxy(
      resolvedSupportMode,
      outgoingSupportMode,
      incomingWeight,
      outgoingWeight,
    );
    // Older manifests only have min(marker), which loses marker identity in a
    // blend. Retain their conservative calibrated fallback. Production assets
    // use the four identity-preserving curves, so no blind 25mm lift is added.
    if (useSoleProxy && !hasIdentityPreservingMarkers) {
      soleMarkerClearance = crossFadeSoleClearance(
        soleMarkerClearance,
        CROSS_FADE_SOLE_SAFETY_MARGIN_METERS,
        resolvedSupportMode,
        outgoingSupportMode,
        incomingWeight,
        outgoingWeight,
      );
    }
    if (root.current && surfaceMinY != null) {
      root.current.getWorldPosition(bodyTmp.current);
      const baseRootWorldY = bodyTmp.current.y - groundCorrection.current;
      const actorBaseY = parent
        ? parent.getWorldPosition(soleTmp.current).y - CHARACTER_BODY_CENTER_HEIGHT
        : Number.POSITIVE_INFINITY;
      probedUncorrectedSurfaceY = baseRootWorldY + surfaceMinY;
      const supportTarget = resolveSupportCorrection(
        activeSupportMode,
        visualSupportYRef?.current ?? visualSupportY,
        actorBaseY,
        baseRootWorldY + surfaceMinY,
        AIRBORNE_IMPACT_PROXIMITY_METERS,
      );
      let required = supportTarget.correction;
      const supportSolveMode = supportTarget.mode;
      probedSupportMode = supportSolveMode;
      if (useSoleProxy && soleBones.length > 0) {
        for (const { id, bone } of soleBones) {
          const markerPoint = soleMarkerPointById[id];
          let uncorrectedMarkerSurfaceY: number;
          if (markerPoint) {
            soleTmp.current.fromArray(markerPoint);
            bone.localToWorld(soleTmp.current);
            uncorrectedMarkerSurfaceY = soleTmp.current.y - groundCorrection.current;
            const outgoingMarkerPoint = outgoingSoleMarkerPointById[id];
            if (outgoingMarkerPoint) {
              // The lowest vertex can change between clips. Interpolating two
              // unrelated heel points invents a third point inside the shoe;
              // instead transform both endpoint candidates through the actual
              // blended bone and retain whichever visible point is lower.
              soleTmp.current.fromArray(outgoingMarkerPoint);
              bone.localToWorld(soleTmp.current);
              uncorrectedMarkerSurfaceY = Math.min(
                uncorrectedMarkerSurfaceY,
                soleTmp.current.y - groundCorrection.current,
              );
            }
          } else {
            bone.getWorldPosition(soleTmp.current);
            const markerClearance = soleMarkerClearanceById[id] ?? soleMarkerClearance ?? 0;
            uncorrectedMarkerSurfaceY = soleTmp.current.y
              - groundCorrection.current
              - markerClearance;
          }
          required = Math.max(required, requiredSupportCorrection(
            activeSupportMode,
            visualSupportYRef?.current ?? visualSupportY,
            uncorrectedMarkerSurfaceY,
          ));
        }
      }
      probedRequiredGroundCorrectionY = required;
      groundCorrection.current = nextSupportCorrection(
        groundCorrection.current,
        required,
        supportSolveMode,
        mixerDelta,
      );
      root.current.position.y = modelOffsetY + groundCorrection.current;
    } else if (parent && soleBones.length > 0) {
      let soleY = Infinity;
      for (const { bone } of soleBones) {
        bone.getWorldPosition(soleTmp.current);
        if (soleTmp.current.y < soleY) soleY = soleTmp.current.y;
      }
      groundCorrection.current = nextUpwardGroundCorrection(
        groundCorrection.current,
        visualSupportYRef?.current ?? visualSupportY,
        soleY,
        mixerDelta,
      );
      if (root.current) root.current.position.y = modelOffsetY + groundCorrection.current;
    }

    // Validation samples the final deformed production actor, rather than a
    // duplicate viewer or the intended animation state. The full skinned-mesh
    // bound is intentionally validation-only: it is exact enough to catch a
    // tucked roll or foot actually passing through the arena, but too costly
    // to make part of ordinary gameplay.
    if (visualProbe && root.current) {
      root.current.updateWorldMatrix(true, true);
      root.current.getWorldPosition(bodyTmp.current);
      const rootWorldY = bodyTmp.current.y;
      root.current.getWorldQuaternion(rootQuaternionTmp.current);
      const actorBaseY = parent
        ? (parent.getWorldPosition(bodyTmp.current).y - CHARACTER_BODY_CENTER_HEIGHT)
        : 0;
      const groundY = visualSupportYRef?.current ?? visualSupportY;
      let soleY = Infinity;
      for (const { bone } of soleBones) {
        bone.getWorldPosition(soleTmp.current);
        soleY = Math.min(soleY, soleTmp.current.y);
      }
      boundsTmp.current.makeEmpty();
      const meshBounds: NonNullable<ActorVisualProbe["current"]>["meshBounds"] = {};
      for (const mesh of skinnedMeshes) {
        // computeBoundingBox() skins vertices from skeleton.boneMatrices.
        // Attached skinned meshes also refresh bindMatrixInverse only through
        // their updateMatrixWorld() override. Calling only updateWorldMatrix()
        // above left that inverse one render behind a moving Ecctrl parent,
        // producing phantom surface penetration in validation even though the
        // renderer used the current transform later in the same frame.
        mesh.updateMatrixWorld(true);
        mesh.skeleton.update();
        mesh.computeBoundingBox();
        if (!mesh.boundingBox) continue;
        meshBoundsTmp.current.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld);
        if (!armourMeshes.current.has(mesh)) boundsTmp.current.union(meshBoundsTmp.current);
        meshBounds[mesh.name || mesh.uuid] = {
          min: meshBoundsTmp.current.min.toArray(),
          max: meshBoundsTmp.current.max.toArray(),
        };
      }
      const bones: NonNullable<ActorVisualProbe["current"]>["bones"] = {};
      for (const [id, bone] of probeBones) {
        if (!bone) continue;
        bone.getWorldPosition(soleTmp.current);
        const worldQuaternion = id === "pelvis"
          ? bone.getWorldQuaternion(boneWorldQuaternionTmp.current).toArray()
          : undefined;
        bones[id] = {
          position: soleTmp.current.toArray(),
          quaternion: bone.quaternion.toArray(),
          ...(worldQuaternion ? { worldQuaternion } : {}),
        };
      }
      weaponMount.getWorldPosition(weaponGripTmp.current);
      weaponTipTmp.current.set(0, 0, 0.92).applyMatrix4(weaponMount.matrixWorld);
      visualProbe.current = {
        animation: state,
        commandSerial: command.serial,
        clip: action?.getClip().name ?? null,
        clipTime: action?.time ?? 0,
        actionWeight: action?.getEffectiveWeight() ?? 0,
        outgoingClip: fadingFromAction.current?.getClip().name ?? null,
        outgoingActionWeight: fadingFromAction.current?.getEffectiveWeight() ?? 0,
        rootOffsetY: root.current.position.y,
        rootWorldY,
        rootWorldQuaternion: rootQuaternionTmp.current.toArray(),
        groundCorrectionY: groundCorrection.current,
        uncorrectedSurfaceY: probedUncorrectedSurfaceY,
        requiredGroundCorrectionY: probedRequiredGroundCorrectionY,
        supportMode: probedSupportMode,
        blendedSupportProxy: useSoleProxy && soleBones.length > 0,
        actorBaseY,
        groundY,
        soleGap: Number.isFinite(soleY) ? soleY - groundY : null,
        meshGap: boundsTmp.current.isEmpty() ? null : boundsTmp.current.min.y - groundY,
        meshTop: boundsTmp.current.isEmpty() ? null : boundsTmp.current.max.y - groundY,
        meshBounds,
        bones,
        weaponGrip: handSocket ? weaponGripTmp.current.toArray() : null,
        weaponTip: handSocket ? weaponTipTmp.current.toArray() : null,
      };
    }
  }, visualProbe ? VISUAL_FRAME_PHASE_PRIORITY.actorPoseAndProbe : 0);

  return (
    <group ref={root} position={[0, modelOffsetY, 0]} scale={CHARACTER_SCALE} dispose={null} visible={!hidden}>
      <primitive object={model} />
      {offHandProfile && (
        <Suspense fallback={null}>
          <OffHandItem model={model} profile={offHandProfile} sheathed={!equipped} objectRef={offHandRef} bowDraw={bowDraw} />
        </Suspense>
      )}
      {nockedArrow && (
        <Suspense fallback={null}>
          <NockedArrow
            socket={drawHandSocket}
            parent={model}
            asset={nockedArrow.asset}
            visible={nockedArrow.visible}
            visibleRef={nockedArrow.visibleRef}
            aimDirection={nockedArrow.aimDirection}
            nockWorld={nockedArrow.nockWorld}
          />
        </Suspense>
      )}
      {armour.length > 0 && (
        <Suspense fallback={null}>
          <ArmourAttachments
            model={model}
            armour={armour}
            bodyMeshSlots={race.meshBipedSlots}
            // Worn armour stays on in the aim view. It used to be hidden
            // because the camera was inside the chest; now that the aim camera
            // sits back on the shot axis, the cuirass and gauntlets are part of
            // what the player is looking at — a mailed forearm drawing a
            // string is the shot, and a bare one under worn armour is a bug.
            hideTorso={false}
            hideHands={false}
            onMountedChange={onArmourChange}
          />
        </Suspense>
      )}
    </group>
  );
}

// Warm the core pack: every actor needs it, and it is the one download that
// is never conditional on what anybody is holding.
for (const url of CORE_PACK_URLS) useGLTF.preload(url);
