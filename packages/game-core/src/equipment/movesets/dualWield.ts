import { clipConfig } from "../../anim/animationManifest";
import type { AnimationState } from "../../core/types";
import { totalBaseDamage } from "../defineWeapon";
import type { AttackDefinition, AttackSpec, DualWieldAttackId, Loadout, OffHandWeapon, WeaponDefinition, WeaponSocketTransform } from "../types";
import { OFF_HAND_NODE_HALF_TURN, WEAPON_CLASSES, scaleAttack } from "../weaponClasses";
import { MOVESETS } from "./index";
import { CONTACT_MARGIN_FRACTION, REFERENCE_MOVESET } from "./oneHanded";

/**
 * Dual wield: a one-handed weapon in each hand (combat-sandbox lane round 3,
 * decision 0091). Skyrim's control scheme on our buttons: the guard control
 * attacks with the off hand (tap light, hold power), the main hand keeps its
 * own light chain, and the main hand's heavy becomes the both-blades power
 * attack. There is no block or parry with two blades.
 *
 * Numbers are the one-handed set's: the off hand's light is `light1`'s motion
 * value and stamina, both power attacks are `heavy`'s. Only the contact
 * windows are this set's own, measured from the clips.
 */

/**
 * Contact windows, as fractions of each clip's source duration.
 *
 * Measured with `apps/combat-sandbox/scripts/measure-contact-windows.mjs
 * --hand off` (the blade on the `Shield` node, the reference 0.92 m blade),
 * seconds divided by the manifest's source duration:
 *   DW_ATTACK_LEFT  0.408..0.567 s of 1.2667 s (peak tip 37.2 m/s)
 *   DW_POWER_LEFT   0.767..0.958 s of 1.5 s    (27.9 m/s)
 *   DW_POWER_DUAL   off 0.650..0.800 s, main (`--hand main`) 0.525..0.717 s
 *                   of 1.5 s; the window spans both, since both blades cut.
 * With a 0.42 m dagger blade the off-hand windows open on the same frame and
 * close within 0.02 s (DW_POWER_LEFT 0.942 s), so one window serves both.
 */
const CONTACT = {
  DW_ATTACK_LEFT: { start: 0.408 / 1.2667, end: 0.567 / 1.2667 },
  DW_POWER_LEFT: { start: 0.767 / 1.5, end: 0.958 / 1.5 },
  DW_POWER_DUAL: { start: 0.525 / 1.5, end: 0.8 / 1.5 },
} as const;

type DualWieldClip = keyof typeof CONTACT;

/** Split a clip's whole length around its measured contact, as `oneHanded` does. */
function contactTiming(animation: DualWieldClip) {
  const clip = clipConfig(animation as AnimationState).sourceDuration ?? 1.3;
  const { start, end } = CONTACT[animation];
  const windup = clip * Math.max(0, start - CONTACT_MARGIN_FRACTION);
  const active = clip * (end - start + CONTACT_MARGIN_FRACTION * 2);
  return { windup, active, recovery: Math.max(0, clip - windup - active) };
}

function dualWieldAttack(
  id: DualWieldAttackId,
  animation: DualWieldClip,
  from: AttackSpec,
  hand: NonNullable<AttackSpec["hand"]>,
): AttackSpec {
  return {
    id,
    hand,
    animation,
    motionValue: from.motionValue,
    stamina: from.stamina,
    ...contactTiming(animation),
    range: from.range,
    arc: from.arc,
    lunge: from.lunge,
    hitStop: from.hitStop,
  };
}

export const DUAL_WIELD_ATTACKS: Readonly<Record<DualWieldAttackId, AttackSpec>> = {
  offLight: dualWieldAttack("offLight", "DW_ATTACK_LEFT", REFERENCE_MOVESET.light1, "off"),
  offPower: dualWieldAttack("offPower", "DW_POWER_LEFT", REFERENCE_MOVESET.heavy, "off"),
  dualPower: dualWieldAttack("dualPower", "DW_POWER_DUAL", REFERENCE_MOVESET.heavy, "both"),
};

/** The combat idle while a weapon is in each hand. */
export const DUAL_WIELD_IDLE: AnimationState = "DW_IDLE";

export type DualWieldAttacks = Readonly<Record<DualWieldAttackId, AttackDefinition>> & {
  /**
   * What the off-hand blade deals when it lands during the both-blades power
   * attack: each hand resolves its own contact with its own weapon's damage,
   * while the attack's timing is the main hand's.
   */
  dualPowerOffHandDamage: number;
};

/** One dual-wield attack as `weapon`'s class and base damage make it. */
function resolveFor(spec: AttackSpec, weapon: WeaponDefinition): AttackDefinition {
  const scaled = scaleAttack(spec, WEAPON_CLASSES[weapon.stats.class], MOVESETS.oneHanded);
  return { ...scaled, damage: Math.round(totalBaseDamage(weapon.stats) * scaled.motionValue) };
}

/**
 * The dual-wield attacks for a loadout, or null when the off hand holds no
 * weapon. The off hand's attacks are its own weapon's (class timing, damage);
 * the both-blades power attack is paced and weighted by the main hand's.
 */
export function resolveDualWield(loadout: Loadout): DualWieldAttacks | null {
  const off = loadout.offHand;
  if (off?.kind !== "weapon") return null;
  return {
    offLight: resolveFor(DUAL_WIELD_ATTACKS.offLight, off),
    offPower: resolveFor(DUAL_WIELD_ATTACKS.offPower, off),
    dualPower: resolveFor(DUAL_WIELD_ATTACKS.dualPower, loadout.mainHand),
    dualPowerOffHandDamage: resolveFor(DUAL_WIELD_ATTACKS.dualPower, off).damage,
  };
}

/** The combat idle a loadout stands in: dual wield's own, else the main hand's. */
export function loadoutCombatIdle(loadout: Loadout): AnimationState {
  return loadout.offHand?.kind === "weapon" ? DUAL_WIELD_IDLE : loadout.mainHand.animations.combatIdle;
}

/**
 * Where a weapon in the left hand rides: the `Shield` node, where Skyrim hangs
 * one, with the half turn every item on that node takes (a shield, a bow, a
 * torch; `OFF_HAND_NODE_HALF_TURN`). Measured, not chosen by eye
 * (`scripts/probe-off-hand-mount.mjs`, round 3 §7): the grip sits at
 * (0.000, -0.037, 0.110) m in the left hand bone's frame against the main
 * grip's (0.003, -0.036, 0.089..0.110) in the right, and mid-swing in
 * DW_ATTACK_LEFT the blade points 0.95 forward; the other two half turns
 * point it backward. The rig has no left hip node (its sheath nodes are
 * WeaponDagger, WeaponSword, WeaponAxe, WeaponMace, WeaponBack, WeaponBow,
 * Quiver), so a stowed off-hand weapon stays on the same node.
 */
const OFF_HAND_WEAPON_MOUNT: WeaponSocketTransform = {
  socket: "Shield",
  localPosition: [0, 0, 0],
  localRotation: OFF_HAND_NODE_HALF_TURN,
  localScale: 1,
};

/** A one-handed weapon as the off hand holds it. */
export function offHandWeapon(weapon: WeaponDefinition): OffHandWeapon {
  return {
    ...weapon,
    kind: "weapon",
    visual: { ...weapon.visual, held: OFF_HAND_WEAPON_MOUNT, sheathed: OFF_HAND_WEAPON_MOUNT },
  };
}
