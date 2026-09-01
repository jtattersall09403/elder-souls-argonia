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
 * vanilla ones. It carries its own catch window: braced surfaces are the
 * forgiving way to parry, and pretending every guard catches over the same
 * slice of quite different animations was the defect `ParryProfile.active`
 * exists to remove.
 */
export const SHIELD_ANIMATIONS: GuardAnimationProfile = {
  enter: "SHIELD_GUARD_ENTER",
  loop: "SHIELD_GUARD",
  hitVariants: ["SHIELD_GUARD_HIT_A", "SHIELD_GUARD_HIT_B"],
  parry: {
    intro: "SHIELD_PARRY",
    followThrough: "SHIELD_PARRY_FOLLOW_THROUGH",
    // Measured across the *pair* (`--parry --socket Shield --reach 0.34`),
    // which is the only way this can be measured: the raise and the bash are
    // two clips on one gameplay clock, and `SHIELD_PARRY` is 0.133 s of raise.
    // The old 0.067 s start was taken from inside that raise, so the whole
    // window expired before the bash clip had begun — the shield caught while
    // it was still coming up and was inert while it actually crossed the body.
    //
    // The bash drives the shield boss from 0.39 m to 0.69 m ahead of the chest
    // between 0.308 s and 0.417 s. Opening slightly before it and holding the
    // shield's own generous 0.2 s covers the travel and the punch-through.
    active: { start: 0.29, duration: 0.2 },
  },
};
