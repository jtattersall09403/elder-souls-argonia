import type { AnimationState } from "../core/types";
import type { AttackId, AttackSpec, RangedStats, WeaponClass } from "./types";

/**
 * What it is like to fight with a *kind* of weapon.
 *
 * A weapon's feel belongs to its class and its numbers belong to its material,
 * so an arsenal of any size is (classes x materials) rather than a hand-written
 * block per item. Everything here is relative: reach and timing are absolute
 * because they must agree with an authored clip, while damage is a motion value
 * the material scales.
 */

/**
 * Which set of authored clips a class fights with.
 *
 * Only `oneHanded` is built today. A class that names a set the character asset
 * does not contain falls back to it — the weapon is usable and correctly
 * statted, but it swings with borrowed motion until that set is built. See
 * `docs/assets/animation-source-audit.md`.
 */
export type MovesetId = "oneHanded" | "twoHanded" | "bow";

export type WeaponClassProfile = {
  id: WeaponClass;
  label: string;
  moveset: MovesetId;
  /** Occupies the off hand, so no shield. */
  twoHanded: boolean;
  /** Metres the pipeline builds this class's meshes to. */
  lengthMeters: number;
  /** Base encumbrance before the material's density multiplier. */
  weightKg: number;
  /**
   * Scales every attack's authored windup/active/recovery. Above 1 is slower
   * and more committed; the contact window scales with it, so a heavy class
   * stays honest against its own animation rather than gaining free frames.
   */
  speedScale: number;
  /** Added to each attack's authored reach, in metres. */
  reachBonus: number;
  /** Multiplies every attack's motion value. */
  powerScale: number;
  /** Multiplies every attack's stamina cost. */
  staminaScale: number;
  /** What this class contributes when guarded with. */
  stability: number;
  /** Fraction of physical damage absorbed while guarding with it. */
  physicalAbsorption: number;
  /** Sheath socket on the rig; the pipeline records the same value per item. */
  sheathSocket: string;
  /**
   * Attach node this class is *held* on, when it is not the right hand.
   *
   * A bow is drawn with the right hand and held in the left, which on this
   * skeleton is the node Bethesda calls `Shield`. Which hand holds a thing is a
   * property of the kind of thing it is, so it belongs to the class.
   */
  heldSocket?: string;
  /** Class-specific held-socket offset, on top of the rig convention. */
  heldRotation?: readonly [number, number, number, number];
  /**
   * Shooting profile, before the material scales it. Present on bows only, and
   * the thing that makes a class a bow.
   */
  ranged?: RangedStats;
};

/**
 * A short, light class is quick and weak; a long, heavy one is slow and strong.
 * Guard values follow the same logic: you can put a greatsword between you and
 * a blow, but a dagger barely.
 */
export const WEAPON_CLASSES: Readonly<Record<WeaponClass, WeaponClassProfile>> = {
  dagger: {
    id: "dagger", label: "Dagger", moveset: "oneHanded", twoHanded: false,
    lengthMeters: 0.42, weightKg: 1.2, speedScale: 0.72, reachBonus: -0.5,
    powerScale: 0.55, staminaScale: 0.6, stability: 0.3, physicalAbsorption: 0.55,
    sheathSocket: "WeaponDagger",
  },
  shortSword: {
    id: "shortSword", label: "Short Sword", moveset: "oneHanded", twoHanded: false,
    lengthMeters: 0.72, weightKg: 2.2, speedScale: 0.88, reachBonus: -0.2,
    powerScale: 0.82, staminaScale: 0.85, stability: 0.5, physicalAbsorption: 0.82,
    sheathSocket: "WeaponSword",
  },
  straightSword: {
    id: "straightSword", label: "Sword", moveset: "oneHanded", twoHanded: false,
    lengthMeters: 0.98, weightKg: 3.2, speedScale: 1, reachBonus: 0,
    powerScale: 1, staminaScale: 1, stability: 0.58, physicalAbsorption: 0.92,
    sheathSocket: "WeaponSword",
  },
  scimitar: {
    id: "scimitar", label: "Scimitar", moveset: "oneHanded", twoHanded: false,
    lengthMeters: 0.95, weightKg: 3, speedScale: 0.92, reachBonus: -0.05,
    powerScale: 0.95, staminaScale: 0.94, stability: 0.52, physicalAbsorption: 0.88,
    sheathSocket: "WeaponSword",
  },
  greatsword: {
    id: "greatsword", label: "Greatsword", moveset: "twoHanded", twoHanded: true,
    lengthMeters: 1.42, weightKg: 7.5, speedScale: 1.34, reachBonus: 0.55,
    powerScale: 1.62, staminaScale: 1.4, stability: 0.62, physicalAbsorption: 0.95,
    sheathSocket: "WeaponBack",
  },
  axe: {
    id: "axe", label: "War Axe", moveset: "oneHanded", twoHanded: false,
    lengthMeters: 0.78, weightKg: 4, speedScale: 1.06, reachBonus: -0.15,
    powerScale: 1.12, staminaScale: 1.08, stability: 0.44, physicalAbsorption: 0.8,
    sheathSocket: "WeaponAxe",
  },
  greataxe: {
    id: "greataxe", label: "Battleaxe", moveset: "twoHanded", twoHanded: true,
    lengthMeters: 1.35, weightKg: 9, speedScale: 1.42, reachBonus: 0.45,
    powerScale: 1.78, staminaScale: 1.5, stability: 0.55, physicalAbsorption: 0.92,
    sheathSocket: "WeaponBack",
  },
  mace: {
    id: "mace", label: "Mace", moveset: "oneHanded", twoHanded: false,
    lengthMeters: 0.8, weightKg: 5, speedScale: 1.12, reachBonus: -0.2,
    powerScale: 1.2, staminaScale: 1.15, stability: 0.48, physicalAbsorption: 0.86,
    sheathSocket: "WeaponMace",
  },
  warhammer: {
    id: "warhammer", label: "Warhammer", moveset: "twoHanded", twoHanded: true,
    lengthMeters: 1.3, weightKg: 11, speedScale: 1.55, reachBonus: 0.35,
    powerScale: 2.05, staminaScale: 1.62, stability: 0.5, physicalAbsorption: 0.9,
    sheathSocket: "WeaponBack",
  },
  spear: {
    id: "spear", label: "Spear", moveset: "twoHanded", twoHanded: true,
    lengthMeters: 2.1, weightKg: 5, speedScale: 1.15, reachBonus: 1.1,
    powerScale: 1.15, staminaScale: 1.05, stability: 0.4, physicalAbsorption: 0.78,
    sheathSocket: "WeaponBack",
  },
  halberd: {
    id: "halberd", label: "Halberd", moveset: "twoHanded", twoHanded: true,
    lengthMeters: 2.2, weightKg: 8, speedScale: 1.4, reachBonus: 1.2,
    powerScale: 1.6, staminaScale: 1.45, stability: 0.45, physicalAbsorption: 0.85,
    sheathSocket: "WeaponBack",
  },
  // Bows do not fight, they shoot: their melee numbers exist only so that a bow
  // in hand is still a describable object. What a bow *does* is in `ranged`.
  shortbow: {
    id: "shortbow", label: "Hunting Bow", moveset: "bow", twoHanded: true,
    lengthMeters: 1.25, weightKg: 1.4, speedScale: 1.2, reachBonus: 0,
    powerScale: 0.35, staminaScale: 0.8, stability: 0.18, physicalAbsorption: 0.25,
    sheathSocket: "WeaponBow",
    heldSocket: "Shield",
    ranged: {
      // ~65 lbf. A bow a hunter carries all day and can draw from a crouch.
      peakDrawForceN: 289, powerStrokeMeters: 0.52, drawCurve: "recurve",
      peakEfficiency: 0.94, virtualMassKg: 0.022,
      drawSeconds: 1.5, nockSeconds: 1.2, releaseRecoverySeconds: 0.5,
      drawStaminaPerSecond: 9, minimumReleaseFraction: 0.18,
    },
  },
  longbow: {
    id: "longbow", label: "Longbow", moveset: "bow", twoHanded: true,
    lengthMeters: 1.75, weightKg: 1.9, speedScale: 1.2, reachBonus: 0,
    powerScale: 0.4, staminaScale: 0.85, stability: 0.2, physicalAbsorption: 0.3,
    sheathSocket: "WeaponBow",
    heldSocket: "Shield",
    ranged: {
      // ~105 lbf, the middle of the surviving Mary Rose range.
      peakDrawForceN: 467, powerStrokeMeters: 0.58, drawCurve: "linear",
      peakEfficiency: 0.95, virtualMassKg: 0.031,
      drawSeconds: 2.4, nockSeconds: 1.7, releaseRecoverySeconds: 0.7,
      drawStaminaPerSecond: 14, minimumReleaseFraction: 0.2,
    },
  },
  warbow: {
    id: "warbow", label: "War Bow", moveset: "bow", twoHanded: true,
    lengthMeters: 1.9, weightKg: 2.3, speedScale: 1.25, reachBonus: 0,
    powerScale: 0.45, staminaScale: 0.95, stability: 0.22, physicalAbsorption: 0.32,
    sheathSocket: "WeaponBow",
    heldSocket: "Shield",
    ranged: {
      // 150 lbf over a 0.60 m power stroke: the anchor the whole model is
      // calibrated against. With a 96 g war shaft it throws 53 m/s.
      peakDrawForceN: 667, powerStrokeMeters: 0.6, drawCurve: "linear",
      peakEfficiency: 0.95, virtualMassKg: 0.0391,
      drawSeconds: 3.4, nockSeconds: 2.2, releaseRecoverySeconds: 0.9,
      drawStaminaPerSecond: 21, minimumReleaseFraction: 0.22,
    },
  },
  staff: {
    id: "staff", label: "Staff", moveset: "twoHanded", twoHanded: true,
    lengthMeters: 1.6, weightKg: 4, speedScale: 1.25, reachBonus: 0.4,
    powerScale: 0.7, staminaScale: 0.9, stability: 0.35, physicalAbsorption: 0.5,
    sheathSocket: "WeaponBack",
  },
};

/** Movesets the character asset actually ships. */
export const BUILT_MOVESETS: ReadonlySet<MovesetId> = new Set<MovesetId>(["oneHanded"]);

export function resolveMoveset(profile: WeaponClassProfile): MovesetId {
  return BUILT_MOVESETS.has(profile.moveset) ? profile.moveset : "oneHanded";
}

/** Apply a class profile to one authored attack. */
export function scaleAttack(spec: AttackSpec, profile: WeaponClassProfile): AttackSpec {
  return {
    ...spec,
    windup: spec.windup * profile.speedScale,
    active: spec.active * profile.speedScale,
    recovery: spec.recovery * profile.speedScale,
    motionValue: spec.motionValue * profile.powerScale,
    stamina: Math.round(spec.stamina * profile.staminaScale),
    range: Math.max(0.6, spec.range + profile.reachBonus),
  };
}

export function scaleMoveset(
  moveset: Record<AttackId, AttackSpec>,
  profile: WeaponClassProfile,
): Record<AttackId, AttackSpec> {
  return Object.fromEntries(
    (Object.entries(moveset) as [AttackId, AttackSpec][])
      .map(([id, spec]) => [id, scaleAttack(spec, profile)]),
  ) as Record<AttackId, AttackSpec>;
}

/** Animation set a class fights with, once fallbacks are resolved. */
export function movesetAnimations(_moveset: MovesetId): Partial<Record<string, AnimationState>> {
  // The animation profile itself lives on the weapon definition; this hook
  // exists so a future set can override individual semantic states without
  // every weapon restating the whole profile.
  return {};
}
