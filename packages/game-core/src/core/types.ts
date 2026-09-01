import type { BowPhase } from "../combat/bowShot";

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

export type AnimationState =
  | "IDLE"
  | "WALK"
  | "WALK_BACK"
  | "STRAFE_LEFT"
  | "STRAFE_RIGHT"
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
  | "GREATAXE_RIPOSTE";

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

export type GameSnapshot = {
  playerHealth: number;
  playerStamina: number;
  enemyHealth: number;
  estus: number;
  equipped: boolean;
  lockedOn: boolean;
  lockedTarget: number;
  playerAction: CombatAction;
  enemyAction: string;
  message: string;
  started: boolean;
  gamepad: string;
  damagePulse: number;
  enemyEnabled: boolean;
  enemyAiEnabled: boolean;
  enemyCount: number;
  showHitboxes: boolean;
  /**
   * Weapon and parry volumes only, drawn by combat itself.
   *
   * Separate from `showHitboxes`, which switches on Rapier's debug renderer and
   * therefore draws every collider in the world — terrain, navigation capsules,
   * arrows, the lot. Watching a blade's contact window against that is
   * impossible, which is why this is its own switch and its own view.
   */
  showWeaponHitboxes: boolean;
  resetToken: number;
  /** A bow is raised: the view is first person and the crosshair is up. */
  aiming: boolean;
  /** Where in the shooting cycle the bow is, for the view to follow. */
  bowPhase: BowPhase;
  /** 0-1 of full draw, for the crosshair to open on. */
  drawFraction: number;
  /** Arrows of the equipped kind still in the quiver. */
  arrowsLeft: number;
  /** 0 = wide aim view, 1 = fully zoomed. Only meaningful while `aiming`. */
  aimZoom: number;
  /**
   * Poise left in the player's pool, and its size (module 76 §121.3).
   *
   * On the HUD because poise is the one combat number a player has to be able
   * to reason about and cannot infer: health and stamina have bars, and "why
   * did that hit not stop me" has no other answer. Provisional presentation,
   * like the numbers themselves.
   */
  playerPoise: number;
  playerMaxPoise: number;
  /**
   * Player pool sizes, overridable from the sandbox debug panel.
   *
   * Debug controls, not a game option: they exist so a rule that a starting
   * character cannot reach — a two-handed heavy chain costs more stamina than
   * the standard bar holds — can still be looked at before deciding whether to
   * change the rule. The HUD bars read these rather than a constant, so a
   * raised pool is visible rather than silently off the end of the bar.
   */
  playerMaxHealth: number;
  playerMaxStamina: number;
  /**
   * Poise enabled at all. A debug switch, not a game option: it exists so the
   * pool can be judged against the flinch-on-every-hit behaviour it replaced,
   * in one sitting, with everything else identical.
   */
  poiseEnabled: boolean;
};
