import type { SneakWeaponKind } from "../stats/types";
import { WEAPON_CLASSES } from "./weaponClasses";
import { isBowClass, type WeaponClass } from "./types";

/**
 * Which of the sneak-attack table's weapon kinds (module 76 §121.5, Skyrim's
 * sneak multipliers) a weapon class falls under; the stats model's
 * `sneakMultiplier(kind, sneakSkill)` takes it. The dagger has its own row;
 * the short blades share one; every other one-handed melee class is
 * "oneHanded", every two-handed one "twoHanded" (read off the class's own
 * `twoHanded`), and bows are "bow". Decision 0092 §5.
 */
export function sneakWeaponKindFor(classId: WeaponClass): SneakWeaponKind {
  if (classId === "dagger") return "dagger";
  if (classId === "shortSword" || classId === "claw") return "shortBlade";
  if (isBowClass(classId)) return "bow";
  return WEAPON_CLASSES[classId].twoHanded ? "twoHanded" : "oneHanded";
}
