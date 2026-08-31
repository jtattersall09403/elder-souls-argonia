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
 * Its parry is the shield *bash* rather than a blade catch. That is a stronger
 * read of the same action and needs no gameplay change: the bash intro's
 * authored catch and the weapon parry's are timed alike in the pipeline
 * config, so the parry window is unaffected by which guard is raised.
 */
export const SHIELD_ANIMATIONS: GuardAnimationProfile = {
  enter: "SHIELD_GUARD_ENTER",
  loop: "SHIELD_GUARD",
  hitVariants: ["SHIELD_GUARD_HIT_A", "SHIELD_GUARD_HIT_B"],
  parry: {
    intro: "SHIELD_PARRY",
    followThrough: "SHIELD_PARRY_FOLLOW_THROUGH",
    // The shield face starts moving at the same 0.067 s, and a shield is the
    // forgiving way to parry: it is a braced surface rather than an edge, and
    // the same argument that puts shield stability above every weapon's puts
    // its catch window above theirs too.
    active: { start: 0.067, duration: 0.26 },
  },
};
