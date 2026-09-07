import { ARSENAL_BLUEPRINT_WEAPONS, ARSENAL_SHIELDS, type ArsenalWeapon } from "./arsenalBlueprints";
export { ARSENAL_SHIELDS } from "./arsenalBlueprints";
export type { ArsenalWeapon, ArsenalShield } from "./arsenalBlueprints";
import type { ArsenalShield } from "./arsenalBlueprints";
import { applyWeaponReach } from "./weaponReach";

export const ARSENAL_WEAPONS: Readonly<Record<string, ArsenalWeapon>> = Object.fromEntries(
  Object.entries(ARSENAL_BLUEPRINT_WEAPONS).map(([id, weapon]) => [id, applyWeaponReach(weapon)]),
);

function titleCase(value: string) {
  return value.replace(/(^|-)([a-z])/g, (_, sep: string, letter: string) =>
    (sep ? " " : "") + letter.toUpperCase());
}

export function weaponById(id: string): ArsenalWeapon {
  const weapon = ARSENAL_WEAPONS[id];
  if (!weapon) throw new RangeError(`unknown weapon: ${id}`);
  return weapon;
}

export function shieldById(id: string): ArsenalShield {
  const shield = ARSENAL_SHIELDS[id];
  if (!shield) throw new RangeError(`unknown shield: ${id}`);
  return shield;
}

/** The reference weapon and starting kit use the same measured arsenal as every item. */
export const STRAIGHT_SWORD = weaponById("steel-sword");

/** Display name for an item id without loading its whole definition. */
export function arsenalLabel(id: string) {
  return ARSENAL_WEAPONS[id]?.label ?? ARSENAL_SHIELDS[id]?.label ?? titleCase(id);
}
