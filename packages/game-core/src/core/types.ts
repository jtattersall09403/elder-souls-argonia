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
  | "BOW_UNEQUIP";

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
  resetToken: number;
  /** A bow is raised: the view is first person and the crosshair is up. */
  aiming: boolean;
  /** Where in the shooting cycle the bow is, for the view to follow. */
  bowPhase: BowPhase;
  /** 0-1 of full draw, for the crosshair to open on. */
  drawFraction: number;
  /** Arrows of the equipped kind still in the quiver. */
  arrowsLeft: number;
};
