import { resolveMoveset, scaleMoveset, WEAPON_CLASSES } from "./weaponClasses";
import type { AttackSpec, WeaponClass } from "./types";

/**
 * Every melee class's effective attack timing, in seconds, as the class table
 * makes it (`scaleMoveset`: speedScale over the moveset's reference, and the
 * swing scale on the heavy two-handers). Read-only; the sandbox HUD shows it
 * so the owner can sign the speed table against the numbers that play
 * (`docs/research/combat-and-systems/skyrim-weapon-records-fit.md` §(c)).
 */
export type AttackPhaseSeconds = { windup: number; active: number; recovery: number };

export type ClassTimingRow = {
  classId: WeaponClass;
  label: string;
  light1: AttackPhaseSeconds;
  heavy: AttackPhaseSeconds;
};

function phases(spec: AttackSpec): AttackPhaseSeconds {
  return { windup: spec.windup, active: spec.active, recovery: spec.recovery };
}

/** One row per melee class (bows are drawn, not swung, and are left out), quickest light attack first. */
export function classTimingTable(): ClassTimingRow[] {
  return Object.values(WEAPON_CLASSES)
    .filter((profile) => !profile.ranged)
    .map((profile) => {
      const moveset = resolveMoveset(profile);
      const attacks = scaleMoveset(moveset.attacks, profile, moveset);
      return { classId: profile.id, label: profile.label, light1: phases(attacks.light1), heavy: phases(attacks.heavy) };
    })
    .sort((a, b) => total(a.light1) - total(b.light1));
}

function total(p: AttackPhaseSeconds) {
  return p.windup + p.active + p.recovery;
}
