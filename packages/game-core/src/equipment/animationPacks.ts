import { resolveAnimationPacks } from "../anim/animationManifest";
import { WEAPON_CLASSES, resolveMoveset } from "./weaponClasses";
import type { Loadout, WeaponDefinition } from "./types";

/**
 * Which animation packs an actor has to have loaded to fight with what it is
 * holding.
 *
 * The rig ships as one GLB per weapon family (see `animationManifest`), so this
 * is the question every actor answers before it can be posed. It is deliberately
 * derived from the *loadout* rather than from a list of semantic states: an
 * actor must be able to play its whole moveset the instant combat starts, not
 * discover a missing clip on the frame it first swings.
 *
 * Dependencies (a warhammer also needing the greatsword's carriage) and the
 * always-loaded core pack are resolved here, so callers pass the result
 * straight to `SkyrimFighter`.
 */
export function weaponAnimationPacks(weapon: WeaponDefinition): readonly string[] {
  const profile = WEAPON_CLASSES[weapon.stats.class];
  return profile ? [resolveMoveset(profile).pack] : [];
}

export function loadoutAnimationPacks(loadout: Loadout): readonly string[] {
  return resolveAnimationPacks([
    ...weaponAnimationPacks(loadout.mainHand),
    // The off hand brings its own guard motion, so it brings its own pack.
    ...(loadout.offHand ? ["shield"] : []),
  ]);
}
