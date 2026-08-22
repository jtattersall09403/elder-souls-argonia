import type { BowAnimationProfile, WeaponAnimationProfile } from "../types";
import { ONE_HANDED_ANIMATIONS } from "./oneHanded";

/**
 * What a bow looks like being used.
 *
 * The shooting cycle is its own contract (`bow`), because it is a cycle rather
 * than a moveset: raise, draw, hold, loose. The melee half is borrowed from the
 * one-handed set so that a bow is still a describable object in a fight — a
 * player who swings a longbow at someone gets a clumsy sword swing rather than
 * a missing animation. Replacing that with a real bash set is one entry here.
 */

export const BOW_SHOOTING: BowAnimationProfile = {
  idle: "BOW_IDLE",
  draw: "BOW_DRAW",
  drawn: "BOW_DRAWN",
  release: "BOW_RELEASE",
  locomotion: {
    walk: "BOW_WALK",
    walkBack: "BOW_WALK_BACK",
    strafeLeft: "BOW_STRAFE_LEFT",
    strafeRight: "BOW_STRAFE_RIGHT",
    run: "BOW_RUN",
  },
};

export const BOW_ANIMATIONS: WeaponAnimationProfile = {
  ...ONE_HANDED_ANIMATIONS,
  combatIdle: "BOW_IDLE",
  equip: "BOW_EQUIP",
  unequip: "BOW_UNEQUIP",
  bow: BOW_SHOOTING,
};
