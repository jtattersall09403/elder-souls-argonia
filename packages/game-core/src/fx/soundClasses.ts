import type { DrawClass, Footwear, GuardClass, ImpactTarget, ImpactWeapon, SwingClass } from "@elder-souls/audio";
import type { ArmourDefinition } from "../equipment/armour";
import type { BowPhase } from "../combat/bowShot";
import { materialWeightClass } from "../equipment/materials";
import type { Loadout, WeaponClass } from "../equipment/types";

/**
 * What the game's equipment sounds like: the vanilla sound families the audio
 * manifest ships (decisions 0094, 0095), read from the weapon class, the
 * off-hand item and the worn armour. Pure lookups; the runtime that fires the
 * events (combat-sandbox lane round 7) calls them at the moment of the sound.
 * The tables are the sound lane's handoff (docs/phases/lanes/sound-prep-lane.md
 * § Handoffs), one entry per weapon class so a new class fails to compile
 * until it is given a sound.
 */

/** Skyrim `WPNSwing*`: blades whistle, an axe chops, a mace thuds, two-handers sweep. */
export const SWING_CLASS: Readonly<Record<WeaponClass, SwingClass>> = {
  dagger: "blade",
  shortSword: "blade",
  straightSword: "blade",
  scimitar: "blade",
  rapier: "blade",
  katana: "blade",
  claw: "blade",
  axe: "blade-axe",
  mace: "blunt-1h",
  greatsword: "2h",
  greataxe: "2h",
  warhammer: "2h",
  spear: "2h",
  pike: "2h",
  halberd: "2h",
  staff: "2h",
  // A bow is never swung; its string is `bow.release`.
  shortbow: "2h",
  longbow: "2h",
  warbow: "2h",
};

/** Skyrim `WPNImpact<weapon>Vs*`: the striking family. */
export const IMPACT_WEAPON: Readonly<Record<WeaponClass, ImpactWeapon>> = {
  dagger: "blade",
  shortSword: "blade",
  straightSword: "blade",
  scimitar: "blade",
  rapier: "blade",
  claw: "blade",
  katana: "blade-2h",
  greatsword: "blade-2h",
  spear: "blade-2h",
  pike: "blade-2h",
  axe: "axe",
  greataxe: "axe-large",
  halberd: "axe-large",
  mace: "blunt",
  warhammer: "blunt-2h",
  staff: "blunt-2h",
  shortbow: "arrow",
  longbow: "arrow",
  warbow: "arrow",
};

/** Skyrim `WPN*Draw` / `*Sheathe`. */
export const DRAW_CLASS: Readonly<Record<WeaponClass, DrawClass>> = {
  dagger: "blade-small",
  shortSword: "blade-small",
  straightSword: "blade-1h",
  scimitar: "blade-1h",
  rapier: "blade-1h",
  katana: "blade-1h",
  claw: "blade-1h",
  greatsword: "blade-2h",
  axe: "axe-1h",
  greataxe: "axe-2h",
  halberd: "axe-2h",
  mace: "mace-1h",
  warhammer: "blunt-2h",
  staff: "blunt-2h",
  spear: "blunt-2h",
  pike: "blunt-2h",
  shortbow: "bow",
  longbow: "bow",
  warbow: "bow",
};

/** Skyrim `WPNBlock*` for a blow taken on the weapon itself. */
export const WEAPON_GUARD_CLASS: Readonly<Record<WeaponClass, GuardClass>> = {
  dagger: "blade-1h",
  shortSword: "blade-1h",
  straightSword: "blade-1h",
  scimitar: "blade-1h",
  rapier: "blade-1h",
  katana: "blade-1h",
  claw: "blade-1h",
  greatsword: "blade-2h",
  spear: "blade-2h",
  pike: "blade-2h",
  axe: "axe",
  greataxe: "axe",
  halberd: "axe",
  mace: "blunt-1h",
  warhammer: "blunt-2h",
  staff: "blunt-2h",
  shortbow: "bow",
  longbow: "bow",
  warbow: "bow",
};

/**
 * What takes a blocked blow: the off-hand shield by its material's weight
 * class, a torch as the light (wooden) shield family (vanilla has no torch
 * block sound), otherwise the main weapon. The same split as
 * `activeGuardProfile`: the off hand guards when it holds a guard.
 */
export function guardSoundClass(loadout: Loadout): GuardClass {
  const off = loadout.offHand;
  if (off?.kind === "shield") return materialWeightClass(off.materialId) === "heavy" ? "shield-heavy" : "shield-light";
  if (off?.kind === "torch") return "shield-light";
  return WEAPON_GUARD_CLASS[loadout.mainHand.stats.class];
}

/**
 * What a blow on a body strikes: the cuirass by its material's weight class
 * (heavy plate rings as metal, light armour as armour), bare flesh without one.
 */
export function bodyImpactTarget(worn: readonly ArmourDefinition[]): ImpactTarget {
  const cuirass = worn.find((piece) => piece.armourSlot === "cuirass");
  if (!cuirass) return "flesh";
  return materialWeightClass(cuirass.materialId) === "heavy" ? "metal" : "armor";
}

/** Footstep family: no boots are bare feet, boots by their material's weight class. */
export function footwearFor(worn: readonly ArmourDefinition[]): Footwear {
  const boots = worn.find((piece) => piece.armourSlot === "boots");
  if (!boots) return "barefoot";
  return materialWeightClass(boots.materialId) === "heavy" ? "heavy" : "light";
}

/**
 * The string's sounds across one step of the bow cycle (decision 0090):
 * `bow.nock` as an arrow goes to the string, `bow.pull` as the draw starts,
 * `bow.release` on the loose.
 */
export function bowCycleSounds(
  before: BowPhase,
  after: BowPhase,
  shot: boolean,
): ("bow.nock" | "bow.pull" | "bow.release")[] {
  const out: ("bow.nock" | "bow.pull" | "bow.release")[] = [];
  if (after === "nocking" && before !== "nocking") out.push("bow.nock");
  if (after === "drawing" && before !== "drawing") out.push("bow.pull");
  if (shot) out.push("bow.release");
  return out;
}
