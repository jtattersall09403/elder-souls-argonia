import type { BowPhysics } from "../combat/ballistics";
import type { AnimationState } from "../core/types";

/**
 * Equipment vocabulary. Deliberately separate from `core/types` (session/HUD
 * shapes) and from `combat/*` (the rules that consume it), because a full game
 * needs thousands of items and one archive of item *data* that no rule file
 * has to know about.
 */

/**
 * Where a thing can be worn or held. One item per slot. Lives here rather than
 * with the inventory because equipment defines the slots and the inventory only
 * fills them.
 */
export type EquipSlot =
  | "mainHand"
  | "offHand"
  | "ammo"
  | "head"
  | "chest"
  | "hands"
  | "feet"
  | "amulet"
  | "ring";

export const EQUIP_SLOTS: readonly EquipSlot[] = [
  "mainHand", "offHand", "ammo", "head", "chest", "hands", "feet", "amulet", "ring",
];

export type DamageType = "physical" | "fire" | "frost" | "shock" | "magic" | "poison";

/** Character attributes items scale with or require. Morrowind/Souls hybrid. */
export type AttributeId =
  | "strength"
  | "endurance"
  | "agility"
  | "intelligence"
  | "willpower";

/**
 * Broad behavioural family. Drives moveset selection, animation set, and the
 * stat bands a generator or balance pass works in — never a code branch.
 */
export type WeaponClass =
  | "dagger"
  | "shortSword"
  | "straightSword"
  | "scimitar"
  | "greatsword"
  | "axe"
  | "greataxe"
  | "mace"
  | "warhammer"
  | "spear"
  | "halberd"
  | "shortbow"
  | "longbow"
  | "warbow"
  | "staff";

/** Bow classes, split out because they carry a `ranged` profile and no moveset. */
export const BOW_CLASSES: readonly WeaponClass[] = ["shortbow", "longbow", "warbow"];

export function isBowClass(id: WeaponClass) {
  return BOW_CLASSES.includes(id);
}

export type ShieldClass = "buckler" | "roundShield" | "kiteShield" | "towerShield";

/** Fractional absorption per damage type. Absent types absorb nothing. */
export type Absorption = Partial<Record<DamageType, number>>;

/**
 * What an item contributes while it is the actor's *active guard*.
 *
 * `stability` is the Souls stat the owner asked for: the share of an incoming
 * hit's stamina load the guard soaks, so a high-stability guard survives more
 * hits before the guard breaks. A weapon parries with an edge rather than a
 * braced face, so weapon stability sits well below shield stability — see
 * `SHIELD_STABILITY_BAND`.
 */
export type GuardProfile = {
  /** 0-1. Higher absorbs more of the stamina cost of blocking. */
  stability: number;
  /** 0-1 per damage type, applied to health damage while the guard holds. */
  absorption: Absorption;
};

/** Requirement/scaling maps. Absent attributes neither gate nor scale. */
export type AttributeMap = Partial<Record<AttributeId, number>>;

export type WeaponStats = {
  class: WeaponClass;
  /**
   * Present only on bows. Everything a shot needs is in here, measured rather
   * than balanced — see `src/game/combat/ballistics.ts`.
   */
  ranged?: RangedStats;
  /** Encumbrance in kilograms; also the natural input to future poise/speed. */
  weightKg: number;
  /** Base damage per type, before an attack's motion value and scaling. */
  baseDamage: Partial<Record<DamageType, number>>;
  /** Multiplier a riposte/backstab applies to base damage. */
  criticalMultiplier: number;
  /** Attribute minimums to wield without penalty. */
  requirements: AttributeMap;
  /** Per-attribute damage scaling coefficient, 0-1. */
  scaling: AttributeMap;
  /** Two-handed weapons occupy the off hand and forbid a shield. */
  occupiesOffHand: boolean;
  /** What this weapon offers when it is the thing being guarded with. */
  guard: GuardProfile;
};

/**
 * A bow's shooting profile: the physics, plus the handful of timings that turn
 * physics into a cadence a player feels.
 */
export type RangedStats = BowPhysics & {
  /** Seconds from string at rest to full draw, before player stats. */
  drawSeconds: number;
  /** Seconds spent nocking the next arrow before a draw can begin. */
  nockSeconds: number;
  /** Seconds of follow-through after a release. */
  releaseRecoverySeconds: number;
  /** Stamina per second while drawing and while holding at draw. */
  drawStaminaPerSecond: number;
  /**
   * Fraction of full draw below which the string will not release at all.
   * Physically it would; a bow that fires on the lightest tap is unusable.
   */
  minimumReleaseFraction: number;
};

/** Nock-to-nock seconds for one aimed shot at full draw, excluding aiming. */
export function shotCycleSeconds(ranged: RangedStats) {
  return ranged.nockSeconds + ranged.drawSeconds + ranged.releaseRecoverySeconds;
}

export type ShieldStats = {
  class: ShieldClass;
  weightKg: number;
  requirements: AttributeMap;
  guard: GuardProfile;
};

/**
 * The motion of holding *something* between you and a blow.
 *
 * Split out of `WeaponAnimationProfile` because the thing being guarded with is
 * not always the weapon. A shield is a braced face carried on the off arm and a
 * sword is an angled edge; playing the sword's block while a shield is equipped
 * is the defect this type exists to make impossible. `activeGuardProfile`
 * already picks the shield's *numbers* when one is worn — this is the matching
 * pick for its *motion*, resolved by `activeGuardAnimations`.
 */
export type GuardAnimationProfile = {
  enter: AnimationState;
  loop: AnimationState;
  hitVariants: readonly AnimationState[];
  parry: ParryProfile;
};

/**
 * How a family parries.
 *
 * A parry is authored as two clips: `intro` raises the guard, `followThrough`
 * is the catch. **The catch window is the whole of the follow-through, and
 * nothing else** (owner ruling, round 4) — so it is not a number on this type
 * at all. It is derived from the two clips by `parryCatchWindow`, which means
 * it cannot drift out of step with them and a new family needs no tuning pass.
 *
 * That ruling replaced three rounds of hand-measured windows. Those were an
 * attempt to find the catching *part* of the pair, and every attempt got at
 * least one family wrong: first a single constant shared by shields and
 * greatswords alike, then per-family numbers measured inside the raise clip
 * (so shield, greatsword and battleaxe all caught while the guard was still
 * coming up), then a sweep-based measurement that gave the battleaxe a window
 * in time but almost none in space. The clip boundary is the honest answer:
 * the animation itself says where the raise ends and the catch begins.
 */
export type ParryProfile = {
  intro: AnimationState;
  followThrough: AnimationState;
};

/**
 * One entry in a weapon's moveset. `motionValue` is a multiplier on the
 * weapon's `baseDamage` (Souls' "motion value"), so re-statting a weapon or
 * adding a new one of the same class never restates the whole chain.
 */
export type AttackSpec = {
  id: AttackId;
  animation: AnimationState;
  motionValue: number;
  stamina: number;
  windup: number;
  active: number;
  recovery: number;
  range: number;
  arc: number;
  lunge: number;
  hitStop: number;
  /**
   * Fraction of the total action at which a queued successor takes over.
   * Omitted means "as soon as the contact window closes", which is right for a
   * heavy that recovers into its own follow-up. A chain whose successor must
   * grow out of the current follow-through sets this later than `active` ends,
   * which is why the branch point is not simply `windup + active`.
   */
  comboBranchProgress?: number;
  /**
   * Fraction of the action at which the *input* for the next swing starts being
   * accepted. Omitted means "once the contact window's wind-up is over".
   *
   * That default is fine while the wind-up is an early third of the animation,
   * which it is on the one-handed set. It is not fine on a two-hander: those
   * clips connect well over half way through, so tying the input buffer to the
   * contact wind-up made a greatsword ignore a press made during the visible
   * swing and only accept one made after the blade had already landed. The
   * player commits to a chain when they see the swing start, not when it hits.
   */
  comboQueueOpenProgress?: number;
  /**
   * How fast this attack's *clip* must play for the animation to still agree
   * with the timing above. Set by `scaleAttack`; 1 on an unscaled spec.
   *
   * `windup`/`active`/`recovery` are the authored clip's own seconds multiplied
   * by the weapon class's `speedScale`. The contact window inside them is a
   * *fraction of the clip*, so unless the clip plays at the same multiplier the
   * hitbox drifts away from the visible blade — by the whole of that
   * multiplier's error, which is 28% early on a dagger and 12% late on a mace.
   * That is precisely how a dagger came to cut during its wind-up and a mace's
   * second heavy during its recovery.
   *
   * Playback rate is therefore `1 / timeScale`: a dagger (`speedScale` 0.72)
   * finishes the same motion in 72% of the time, so its clip runs 1.39x. The
   * clip is the action, at every weapon speed.
   */
  timeScale?: number;
};

export type AttackId =
  | "light1"
  | "light2"
  | "light3"
  | "heavy"
  | "heavy2"
  | "riposte"
  | "backstab";

/** An `AttackSpec` with its motion value resolved into concrete damage. */
export type AttackDefinition = Omit<AttackSpec, "motionValue"> & {
  damage: number;
  motionValue: number;
};

export type WeaponSocketTransform = {
  socket: string;
  localPosition: readonly [number, number, number];
  /**
   * Quaternion XYZW *relative to the rig's socket convention*, not to raw bone
   * space. The convention offset itself lives once in the character manifest
   * (`rig.socketRotation`) because it belongs to the skeleton, not the item, so
   * an ordinary weapon leaves this identity.
   */
  localRotation: readonly [number, number, number, number];
  localScale: number;
};

export type WeaponVisualProfile = {
  asset: string;
  held: WeaponSocketTransform;
  sheathed: WeaponSocketTransform;
  /**
   * The built mesh's own extents in metres, as measured by the pipeline.
   *
   * Carried through from the item manifest rather than left in it, because this
   * is what combat sizes its sensor volumes from (`combat/hitVolume`). A hitbox
   * that does not come from here is a hitbox that has to be guessed per weapon,
   * which is exactly how one sword-sized capsule ended up swinging on the end
   * of a warhammer.
   */
  sizeMeters: readonly [number, number, number];
  /**
   * The rigged build of a bow: skinned to the vanilla seven-bone bow skeleton
   * with the bow's own draw, drawn and release clips baked in, so a drawn bow
   * bends and its string comes back to the hand. Bows only; when present the
   * actor mounts this asset instead of `asset`.
   */
  rig?: BowRigProfile;
};

export type BowRigProfile = {
  asset: string;
  /** Applied to the mounted rig to bring it to the class length in metres. */
  scale: number;
  /** The clip the archer's draw fraction scrubs, and where its pull begins. */
  drawClip: "BOW_RIG_DRAW" | "BOW_RIG_DRAW_HEAVY";
  drawOnsetSeconds: number;
  drawDurationSeconds: number;
  releaseDurationSeconds: number;
};

export type PairedCriticalProfile = {
  attackerAction: AnimationState;
  victimAction: AnimationState;
  /**
   * Short production-time blend used both to ease the actors onto their
   * authored paired anchor and to blend into the opening poses. Instant body
   * warps are especially visible when a backstab begins near, but not exactly
   * on, the source pair separation.
   */
  entryBlendDuration: number;
  /**
   * Attacker-clock progress at which the victim reaction begins. A true paired
   * clip uses 0; an event-driven execution can hold a vulnerable pose until the
   * authored impact event and then start its independent reaction clock.
  */
  victimActionStartProgress: number;
  /** Source time at which the selected victim action begins. */
  victimActionStartAt: number;
  victimLeadIn?: {
    action: AnimationState;
    /** Gameplay-clock seconds at which to freeze the vulnerable lead-in pose. */
    holdTime: number;
  };
  /**
   * Self-timed victim outcome entered after the profile's authored handoff.
   * The action owns the complete reaction-to-ready motion; `startAt` is
   * explicit per critical. If the contact/paired reaction is already playing
   * this same action, the FSM changes ownership without restarting it.
   */
  victimRecovery: {
    action: AnimationState;
    /** Gameplay-clock seconds within `action` at the outcome handoff. */
    startAt: number;
    /** Transition-specific blend; omitted to use the action manifest default. */
    crossFadeDuration?: number;
  };
  /** Prone-ending variant used when critical damage is lethal. */
  victimDeath: {
    action: AnimationState;
    /** Gameplay-clock seconds within `action` at the outcome handoff. */
    startAt: number;
    /** Transition-specific blend; omitted to use the action manifest default. */
    crossFadeDuration?: number;
  };
  /**
   * Attacker-clock progress at which the victim leaves its paired/reaction
   * action for the configured recovery or death outcome. This is distinct
   * from `releaseProgress`: controller alignment can end at blade withdrawal
   * while the victim finishes the authored paired recoil before falling.
   */
  victimOutcomeProgress: number;
  startingSeparation: number;
  /** Victim-relative attacker yaw: 0 behind/same-facing, PI in front/opposed. */
  relativeFacing: number;
  alignmentAnchor: "victim";
  damageProgress: number;
  releaseProgress: number;
  rootMotionPolicy: "controller-aligned-strip-horizontal";
};

/**
 * The shooting half of a bow's animation contract.
 *
 * Separate from the melee states because a bow has no moveset: the states here
 * are a *cycle* (raise, draw, hold, loose) rather than a chain of attacks, and
 * the draw is stretched to the bow's own draw time rather than played at rate.
 */
export type BowAnimationProfile = {
  /** Bow in hand, string at rest. */
  idle: AnimationState;
  /** Nock through to full draw. Retimed to the bow's `drawSeconds`. */
  draw: AnimationState;
  /** Held at full draw. */
  drawn: AnimationState;
  /** Loose and follow-through. */
  release: AnimationState;
  /** Carrying a bow, out of aim. */
  locomotion: {
    walk: AnimationState;
    walkBack: AnimationState;
    strafeLeft: AnimationState;
    strafeRight: AnimationState;
    run: AnimationState;
  };
};

export type WeaponAnimationProfile = {
  combatIdle: AnimationState;
  /** Present only on bows; its presence is what makes a weapon shootable. */
  bow?: BowAnimationProfile;
  sprintOverride?: AnimationState;
  /**
   * Crouched carriage with this weapon drawn. Absent falls back to the
   * weapon-neutral `CROUCH_IDLE` in the core pack, which is right for anything
   * whose sneak pose Skyrim never authored separately.
   */
  crouchIdle?: AnimationState;
  /**
   * Free-roam locomotion overrides for weapons carried differently. A
   * greatsword is held across the body at a run; a sword is not. Absent members
   * fall back to the shared core clips.
   */
  locomotion?: Partial<{
    walk: AnimationState;
    walkBack: AnimationState;
    strafeLeft: AnimationState;
    strafeRight: AnimationState;
    run: AnimationState;
  }>;
  guard: {
    enter: AnimationState;
    loop: AnimationState;
    hitVariants: readonly AnimationState[];
  };
  parry: ParryProfile;
  lightAttacks: readonly [AnimationState, AnimationState, AnimationState];
  heavyAttacks: readonly [AnimationState, AnimationState];
  guardBreak: AnimationState;
  riposte: PairedCriticalProfile;
  backstab: PairedCriticalProfile;
  equip: AnimationState;
  unequip: AnimationState;
};

export type WeaponDefinition = {
  id: string;
  label: string;
  stats: WeaponStats;
  attacks: Record<AttackId, AttackDefinition>;
  animations: WeaponAnimationProfile;
  visual: WeaponVisualProfile;
};

export type ShieldDefinition = {
  id: string;
  label: string;
  stats: ShieldStats;
  /** How this shield is guarded and bashed with; overrides the weapon's. */
  animations: GuardAnimationProfile;
  visual: WeaponVisualProfile;
};

/** What an actor currently has in hand. The off hand is the shield slot. */
export type Loadout = {
  mainHand: WeaponDefinition;
  offHand: ShieldDefinition | null;
};
