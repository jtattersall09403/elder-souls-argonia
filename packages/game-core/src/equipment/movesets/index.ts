import type { AttackId, AttackSpec, WeaponAnimationProfile, WeaponClass } from "../types";
import { BOW_ANIMATIONS } from "./bow";
import { CLAW_ANIMATIONS, CLAW_MOVESET, RAPIER_ANIMATIONS, RAPIER_MOVESET } from "./blades";
import {
  HALBERD_ANIMATIONS,
  HALBERD_MOVESET,
  PIKE_ANIMATIONS,
  PIKE_MOVESET,
  QUARTERSTAFF_ANIMATIONS,
  QUARTERSTAFF_MOVESET,
} from "./polearms";
import { ONE_HANDED_ANIMATIONS, REFERENCE_MOVESET } from "./oneHanded";
import {
  GREATAXE_ANIMATIONS,
  GREATAXE_MOVESET,
  GREATSWORD_ANIMATIONS,
  GREATSWORD_MOVESET,
} from "./twoHanded";

/**
 * The moveset registry: what it is like to fight with a *family* of weapons.
 *
 * One entry per authored animation set. Adding a family — spears, dual wield,
 * a modded katana set — is an entry here plus its clips in the pipeline's
 * animation config under a new pack; nothing in the combat state machine, the
 * loader or the actor changes. That is the whole point of the split, and the
 * reason `MovesetId` is not a union of hard-coded branches anywhere.
 */
export type MovesetDefinition = {
  id: MovesetId;
  label: string;
  animations: WeaponAnimationProfile;
  attacks: Record<AttackId, AttackSpec>;
  /**
   * Which downloadable animation pack carries this set. Dependencies are
   * declared in the pipeline config and resolved by `resolveAnimationPacks`,
   * so a haft weapon names only `greataxe` and gets the greatsword's shared
   * carriage automatically.
   */
  pack: string;
  /**
   * The weapon class this set's authored timings already embody.
   *
   * A two-handed clip is authored slow; the class table separately says a
   * warhammer is slower than a greatsword. Without this, applying the class's
   * `speedScale` to a moveset that is already two-handed-paced counts the same
   * heaviness twice and a warhammer swings for three seconds. Attack scaling
   * divides by this reference, so `speedScale` keeps one global meaning across
   * the whole arsenal.
   */
  speedReference: WeaponClass;
};

export type MovesetId =
  | "oneHanded"
  | "greatsword"
  | "greataxe"
  | "bow"
  | "pike"
  | "halberd"
  | "quarterstaff"
  | "rapier"
  | "claw";

export const MOVESETS: Readonly<Record<MovesetId, MovesetDefinition>> = {
  oneHanded: {
    id: "oneHanded",
    label: "One-handed",
    animations: ONE_HANDED_ANIMATIONS,
    attacks: REFERENCE_MOVESET,
    pack: "oneHanded",
    speedReference: "straightSword",
  },
  greatsword: {
    id: "greatsword",
    label: "Two-handed blade",
    animations: GREATSWORD_ANIMATIONS,
    attacks: GREATSWORD_MOVESET,
    pack: "greatsword",
    speedReference: "greatsword",
  },
  greataxe: {
    id: "greataxe",
    label: "Two-handed haft",
    animations: GREATAXE_ANIMATIONS,
    attacks: GREATAXE_MOVESET,
    pack: "greataxe",
    speedReference: "greataxe",
  },
  pike: {
    id: "pike",
    label: "Polearm thrust",
    animations: PIKE_ANIMATIONS,
    attacks: PIKE_MOVESET,
    pack: "pike",
    speedReference: "greatsword",
  },
  halberd: {
    id: "halberd",
    label: "Polearm swing",
    animations: HALBERD_ANIMATIONS,
    attacks: HALBERD_MOVESET,
    pack: "halberd",
    speedReference: "greataxe",
  },
  quarterstaff: {
    id: "quarterstaff",
    label: "Quarterstaff",
    animations: QUARTERSTAFF_ANIMATIONS,
    attacks: QUARTERSTAFF_MOVESET,
    pack: "quarterstaff",
    speedReference: "greataxe",
  },
  rapier: {
    id: "rapier",
    label: "Thrusting blade",
    animations: RAPIER_ANIMATIONS,
    attacks: RAPIER_MOVESET,
    pack: "rapier",
    speedReference: "straightSword",
  },
  claw: {
    id: "claw",
    label: "Claw",
    animations: CLAW_ANIMATIONS,
    attacks: CLAW_MOVESET,
    pack: "claw",
    speedReference: "straightSword",
  },
  bow: {
    id: "bow",
    label: "Bow",
    // A bow has no moveset: it has a shooting cycle, which is the whole of what
    // a bow does. The melee entries exist only so a bow in hand is a
    // describable object, and they borrow the reference swings for a bash.
    animations: BOW_ANIMATIONS,
    attacks: REFERENCE_MOVESET,
    pack: "bow",
    speedReference: "straightSword",
  },
};

/** Movesets whose clips the built character actually ships. */
export const BUILT_MOVESETS: ReadonlySet<MovesetId> = new Set(
  (Object.keys(MOVESETS) as MovesetId[]),
);
