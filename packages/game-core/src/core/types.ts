
export type Vec2 = { x: number; y: number };

export type CombatAction =
  | "idle"
  /** Bow raised, first person, string at rest. */
  | "aim"
  /** Pulling to full draw. */
  | "draw"
  /** Held at draw, bleeding stamina. */
  | "drawn"
  /** Loosed; the follow-through before the bow can be drawn again. */
  | "loose"
  | "light1"
  | "light2"
  | "light3"
  | "heavy"
  | "heavy2"
  | "roll"
  | "backstep"
  | "guard"
  | "parry"
  | "riposte"
  | "backstab"
  | "heal"
  | "equip"
  | "unequip"
  | "hit"
  | "hitHeavy"
  | "recoil"
  | "guardBreak"
  | "dead";

export type AimView = "eye" | "firstPerson" | "shoulder";

export type AnimationState =
  | "IDLE"
  | "WALK"
  | "WALK_BACK"
  | "STRAFE_LEFT"
  | "STRAFE_RIGHT"
  | "RUN_BACK"
  | "BOW_RUN_BACK"
  | "GREATSWORD_RUN_BACK"
  | "RUN"
  | "SPRINT"
  | "JUMP_START"
  | "JUMP_IDLE"
  | "JUMP_LAND"
  | "JUMP_LAND_LEFT"
  | "JUMP_LAND_RIGHT"
  | "SWORD_IDLE"
  | "LIGHT_1"
  | "LIGHT_2"
  | "LIGHT_3"
  | "HEAVY"
  | "HEAVY_2"
  | "ROLL"
  | "BACKSTEP"
  | "GUARD"
  | "GUARD_ENTER"
  | "GUARD_HIT_A"
  | "GUARD_HIT_B"
  | "PARRY"
  | "PARRY_FOLLOW_THROUGH"
  | "RIPOSTE"
  | "RIPOSTE_STAB"
  | "RIPOSTED_HIT1"
  | "CRITICAL_KNOCKDOWN"
  | "CRITICAL_DEATH"
  | "BACKSTAB"
  | "BACKSTABBED"
  | "HEAL"
  | "EQUIP"
  | "UNEQUIP"
  | "HIT"
  | "HIT_HEAVY"
  | "RECOIL"
  | "GUARD_BREAK"
  | "DEATH"
  | "BOW_IDLE"
  | "BOW_WALK"
  | "BOW_WALK_BACK"
  | "BOW_STRAFE_LEFT"
  | "BOW_STRAFE_RIGHT"
  | "BOW_RUN"
  // Moving with the string at full draw (vanilla `bowdrawn_*`). Walk speeds
  // only: vanilla authors no drawn run, and neither does a real archer.
  | "BOW_DRAWN_WALK"
  | "BOW_DRAWN_WALK_BACK"
  | "BOW_DRAWN_STRAFE_LEFT"
  | "BOW_DRAWN_STRAFE_RIGHT"
  | "BOW_DRAW"
  | "BOW_DRAWN"
  | "BOW_RELEASE"
  | "BOW_EQUIP"
  | "BOW_UNEQUIP"
  // Crouched locomotion. Its own set rather than a slowed walk: Skyrim authors
  // sneaking as a complete stance, and the crouched top speed is read off
  // CROUCH_WALK's measured stride rather than guessed as a fraction of a walk.
  | "CROUCH_IDLE"
  | "CROUCH_WALK"
  | "CROUCH_WALK_BACK"
  | "CROUCH_STRAFE_LEFT"
  | "CROUCH_STRAFE_RIGHT"
  /** Crouched with a one-handed weapon drawn — the blade stays on guard. */
  | "SWORD_CROUCH_IDLE"
  // Guarding behind a shield. A shield is a braced face rather than an edge, so
  // it has its own guard and its own bash-as-parry; which set an actor plays is
  // decided by the off hand, not by the weapon (see `activeGuardAnimations`).
  | "SHIELD_GUARD"
  | "SHIELD_GUARD_ENTER"
  | "SHIELD_GUARD_HIT_A"
  | "SHIELD_GUARD_HIT_B"
  | "SHIELD_PARRY"
  | "SHIELD_PARRY_FOLLOW_THROUGH"
  // Two-handed blade moveset.
  | "GREATSWORD_IDLE"
  | "GREATSWORD_WALK"
  | "GREATSWORD_WALK_BACK"
  | "GREATSWORD_STRAFE_LEFT"
  | "GREATSWORD_STRAFE_RIGHT"
  | "GREATSWORD_RUN"
  | "GREATSWORD_SPRINT"
  | "GREATSWORD_LIGHT_1"
  | "GREATSWORD_LIGHT_2"
  | "GREATSWORD_LIGHT_3"
  | "GREATSWORD_HEAVY"
  | "GREATSWORD_HEAVY_2"
  | "GREATSWORD_GUARD"
  | "GREATSWORD_GUARD_ENTER"
  | "GREATSWORD_GUARD_HIT_A"
  | "GREATSWORD_GUARD_HIT_B"
  | "GREATSWORD_PARRY"
  | "GREATSWORD_PARRY_FOLLOW_THROUGH"
  | "GREATSWORD_EQUIP"
  | "GREATSWORD_UNEQUIP"
  // Two-handed haft moveset: only the swings differ from the blade set, so the
  // carriage, locomotion, guard and draw above are shared rather than doubled.
  | "GREATAXE_IDLE"
  | "GREATAXE_SPRINT"
  | "GREATAXE_LIGHT_1"
  | "GREATAXE_LIGHT_2"
  | "GREATAXE_LIGHT_3"
  | "GREATAXE_HEAVY"
  | "GREATAXE_HEAVY_2"
  | "GREATAXE_PARRY"
  | "GREATAXE_PARRY_FOLLOW_THROUGH"
  | "GREATSWORD_RIPOSTE"
  | "GREATAXE_RIPOSTE"
  // Pike: a two-handed thrusting polearm. Its own carriage, locomotion, guard
  // and draw; run, parry and the criticals stay the two-handed blade set's.
  | "PIKE_IDLE"
  | "PIKE_WALK"
  | "PIKE_WALK_BACK"
  | "PIKE_STRAFE_LEFT"
  | "PIKE_STRAFE_RIGHT"
  | "PIKE_SPRINT"
  | "PIKE_LIGHT_1"
  | "PIKE_LIGHT_2"
  | "PIKE_LIGHT_3"
  | "PIKE_HEAVY"
  | "PIKE_HEAVY_2"
  | "PIKE_GUARD"
  | "PIKE_GUARD_ENTER"
  | "PIKE_GUARD_HIT_A"
  | "PIKE_GUARD_HIT_B"
  | "PIKE_EQUIP"
  | "PIKE_UNEQUIP"
  // Halberd: a two-handed haft weapon swung from a long shaft. Locomotion,
  // parry and criticals stay the haft set's.
  | "HALBERD_IDLE"
  | "HALBERD_SPRINT"
  | "HALBERD_LIGHT_1"
  | "HALBERD_LIGHT_2"
  | "HALBERD_LIGHT_3"
  | "HALBERD_HEAVY"
  | "HALBERD_HEAVY_2"
  | "HALBERD_GUARD"
  | "HALBERD_GUARD_ENTER"
  | "HALBERD_GUARD_HIT_A"
  | "HALBERD_GUARD_HIT_B"
  | "HALBERD_EQUIP"
  | "HALBERD_UNEQUIP"
  // Quarterstaff: the same thirteen-clip shape as the halberd, struck with a
  // shaft rather than a head.
  | "QUARTERSTAFF_IDLE"
  | "QUARTERSTAFF_SPRINT"
  | "QUARTERSTAFF_LIGHT_1"
  | "QUARTERSTAFF_LIGHT_2"
  | "QUARTERSTAFF_LIGHT_3"
  | "QUARTERSTAFF_HEAVY"
  | "QUARTERSTAFF_HEAVY_2"
  | "QUARTERSTAFF_GUARD"
  | "QUARTERSTAFF_GUARD_ENTER"
  | "QUARTERSTAFF_GUARD_HIT_A"
  | "QUARTERSTAFF_GUARD_HIT_B"
  | "QUARTERSTAFF_EQUIP"
  | "QUARTERSTAFF_UNEQUIP"
  // Rapier: a one-handed thrusting set. Only the carriage, the five attacks and
  // the draw are its own; guard, parry and the criticals are the one-handed set's.
  | "RAPIER_IDLE"
  | "RAPIER_LIGHT_1"
  | "RAPIER_LIGHT_2"
  | "RAPIER_LIGHT_3"
  | "RAPIER_HEAVY"
  | "RAPIER_HEAVY_2"
  | "RAPIER_EQUIP"
  | "RAPIER_UNEQUIP"
  // Claw: a one-handed set worn on the hand. Its own carriage, attacks and
  // guard hold; guard entry, parry, draw and the criticals are inherited.
  | "CLAW_IDLE"
  | "CLAW_LIGHT_1"
  | "CLAW_LIGHT_2"
  | "CLAW_LIGHT_3"
  | "CLAW_HEAVY"
  | "CLAW_HEAVY_2"
  | "CLAW_GUARD"
  | "CLAW_GUARD_HIT_A"
  | "CLAW_GUARD_HIT_B"
  // Katana: a one-handed set with its own carriage, sprint, guard and draw;
  // parry, riposte and the criticals are the one-handed set's.
  | "KATANA_IDLE"
  | "KATANA_LIGHT_1"
  | "KATANA_LIGHT_2"
  | "KATANA_LIGHT_3"
  | "KATANA_HEAVY"
  | "KATANA_HEAVY_2"
  | "KATANA_GUARD_ENTER"
  | "KATANA_GUARD"
  | "KATANA_GUARD_HIT_A"
  | "KATANA_GUARD_HIT_B"
  | "KATANA_EQUIP"
  | "KATANA_SPRINT"
  | "DW_IDLE"
  | "DW_ATTACK_LEFT"
  | "DW_POWER_LEFT"
  | "DW_POWER_DUAL"
  | "TORCH_POSE"
  | "TORCH_GUARD_ENTER"
  | "TORCH_GUARD"
  | "TORCH_GUARD_HIT"
  | "SWIM_IDLE"
  | "SWIM_FORWARD"
  | "SWIM_BACK"
  | "SWIM_LEFT"
  | "SWIM_RIGHT"
  | "BACKSTABBED_FORWARD";

export type CombatPhase = "windup" | "active" | "recovery" | "none";

// Equipment (weapons, shields, movesets, sockets) lives in
// `src/game/equipment/`: item data is its own archive, not part of the core
// session vocabulary. Re-exported here only for the few consumers that still
// speak in terms of a single equipped weapon.
export type {
  AttackDefinition,
  AttackId,
  Loadout,
  PairedCriticalProfile,
  WeaponAnimationProfile,
  WeaponDefinition,
  WeaponSocketTransform,
  WeaponVisualProfile,
} from "../equipment/types";
