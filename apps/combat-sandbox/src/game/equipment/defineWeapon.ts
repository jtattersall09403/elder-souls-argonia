import type {
  AttackDefinition,
  AttackId,
  AttackSpec,
  WeaponAnimationProfile,
  WeaponDefinition,
  WeaponStats,
  WeaponVisualProfile,
} from "./types";

export type WeaponBlueprint = {
  id: string;
  label: string;
  stats: WeaponStats;
  /** Motion values, timings and reach. Damage is resolved from `stats`. */
  moveset: Record<AttackId, AttackSpec>;
  animations: WeaponAnimationProfile;
  visual: WeaponVisualProfile;
};

/** Total base damage across every type this weapon deals. */
export function totalBaseDamage(stats: WeaponStats) {
  return Object.values(stats.baseDamage).reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/**
 * Resolve one blueprint into a runtime weapon.
 *
 * The only thing this computes is damage: an attack carries a motion value and
 * the weapon carries base damage, so re-statting a weapon — or adding the next
 * hundred of the same class — never restates a whole moveset by hand.
 */
export function defineWeapon(blueprint: WeaponBlueprint): WeaponDefinition {
  const base = totalBaseDamage(blueprint.stats);
  const attacks = Object.fromEntries(
    (Object.entries(blueprint.moveset) as [AttackId, AttackSpec][]).map(([id, spec]) => [
      id,
      { ...spec, damage: Math.round(base * spec.motionValue) } satisfies AttackDefinition,
    ]),
  ) as Record<AttackId, AttackDefinition>;
  return {
    id: blueprint.id,
    label: blueprint.label,
    stats: blueprint.stats,
    attacks,
    animations: blueprint.animations,
    visual: blueprint.visual,
  };
}

/** Motion value a critical uses, so both criticals stay tied to one stat. */
export function criticalMotionValue(stats: WeaponStats) {
  return stats.criticalMultiplier;
}
