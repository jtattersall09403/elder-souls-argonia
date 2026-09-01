import type { GuardAnimationProfile } from "../types";

/**
 * Guarding behind a shield.
 *
 * Not a weapon moveset — a shield does not attack — so this is only the guard
 * half of the animation contract, selected by `activeGuardAnimations` whenever
 * something is in the off hand. Skyrim authors the shield block as its own
 * `shd_*` set for a real reason: a shield is a braced face carried across the
 * body on the off arm, while `1hm_blockidle` angles the sword's edge and leaves
 * the shield arm doing nothing. Playing the weapon set with a shield equipped
 * is the exact defect this file removes.
 *
 * Its parry is the shield *bash* rather than a blade catch — a stronger read of
 * the same action, and now on the parry mod's own SHD clips rather than the
 * vanilla ones. The catch window is the bash clip itself, derived by
 * `parryCatchWindow` rather than written down here.
 */
export const SHIELD_ANIMATIONS: GuardAnimationProfile = {
  enter: "SHIELD_GUARD_ENTER",
  loop: "SHIELD_GUARD",
  hitVariants: ["SHIELD_GUARD_HIT_A", "SHIELD_GUARD_HIT_B"],
  parry: {
    intro: "SHIELD_PARRY",
    followThrough: "SHIELD_PARRY_FOLLOW_THROUGH",
  },
};
