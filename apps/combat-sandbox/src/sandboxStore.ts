import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import { DEFAULT_ARROW_GRAVITY_SCALE } from "@elder-souls/game-core/combat/arrowFlight";
import { DEFAULT_BOW_VIEW } from "@elder-souls/game-core/camera/bowCamera";
import { create } from "zustand";
import type { AimView, CombatAction } from "@elder-souls/game-core/core/types";
import type { CombatHudState, CombatRuntimeSettings } from "@elder-souls/character";
import { DEFAULT_ENEMY_COUNT } from "@elder-souls/game-core/combat/tuning";
import { COMBAT_TUNING } from "@elder-souls/game-core/combat/weapon";
import { DEFAULT_ENEMY_ARCHETYPE } from "@elder-souls/game-core/actors/enemyArchetypes";
import { LOCKED_STRIDE_RATE } from "@elder-souls/game-core/locomotion/lockedStride";

/**
 * The sandbox's debug store: the combat runtime's settings (set by the debug
 * panel), the HUD numbers it publishes, and the sandbox-only switches. App
 * state, not game state: the runtime reads none of it directly (it takes
 * `settings` and `publish` from `CombatScene`).
 */
export type GameSnapshot = CombatHudState & CombatRuntimeSettings & {
  /** Rapier's debug renderer: every collider in the world. */
  showHitboxes: boolean;
};

type GameStore = GameSnapshot & {
  patch: (patch: Partial<GameSnapshot>) => void;
  reset: () => void;
};

export const initialSnapshot: GameSnapshot = {
  playerHealth: 100,
  playerStamina: 100,
  enemyHealth: 150,
  estus: 3,
  equipped: true,
  lockedOn: false,
  lockedTarget: -1,
  playerAction: "idle" as CombatAction,
  enemyAction: "watching",
  message: "",
  started: false,
  gamepad: "",
  damagePulse: 0,
  enemyEnabled: true,
  enemyAiEnabled: true,
  enemyCount: DEFAULT_ENEMY_COUNT,
  showHitboxes: false,
  showWeaponHitboxes: false,
  showBackstabZones: false,
  footDrivenMotion: true,
  lockedSpeedFollowsClip: true,
  lockedStrideRate: LOCKED_STRIDE_RATE,
  arrowGravityScale: DEFAULT_ARROW_GRAVITY_SCALE,
  skillsEnabled: false,
  marksmanSkill: 10,
  meleeSkill: 10,
  classEffectsEnabled: true,
  aimView: DEFAULT_BOW_VIEW as AimView,
  enemyArchetypeId: DEFAULT_ENEMY_ARCHETYPE.id,
  resetToken: 0,
  aiming: false,
  bowPhase: "lowered" as const,
  drawFraction: 0,
  arrowsLeft: 0,
  aimZoom: 0,
  /**
   * Angle between the crosshair ray and the line the shot actually leaves on,
   * degrees. Includes the deliberate thirty-degree launch elevation plus the
   * small parallax from camera/string-hand convergence. Debug panel only.
   */
  aimErrorDegrees: 0,
  playerMaxHealth: COMBAT_TUNING.maxHealth,
  playerMaxStamina: COMBAT_TUNING.maxStamina,
  playerPoise: 0,
  playerMaxPoise: 0,
  poiseEnabled: true,
  stealthStart: false,
  sneakSkill: 10,
  ambientLight: 1,
  detection: { level: 1, awareness: "engaged" as const },
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialSnapshot,
  patch: (patch) => set(patch),
  reset: () => set((state) => ({
    ...initialSnapshot,
    started: true,
    message: text(CATALOGUE, "text.combat.fight-restarted"),
    enemyEnabled: state.enemyEnabled,
    enemyAiEnabled: state.enemyAiEnabled,
    enemyCount: state.enemyCount,
    showHitboxes: state.showHitboxes,
    showWeaponHitboxes: state.showWeaponHitboxes,
    showBackstabZones: state.showBackstabZones,
    footDrivenMotion: state.footDrivenMotion,
    lockedSpeedFollowsClip: state.lockedSpeedFollowsClip,
    lockedStrideRate: state.lockedStrideRate,
    arrowGravityScale: state.arrowGravityScale,
    skillsEnabled: state.skillsEnabled,
    marksmanSkill: state.marksmanSkill,
    meleeSkill: state.meleeSkill,
    classEffectsEnabled: state.classEffectsEnabled,
    aimView: state.aimView,
    enemyArchetypeId: state.enemyArchetypeId,
    poiseEnabled: state.poiseEnabled,
    stealthStart: state.stealthStart,
    sneakSkill: state.sneakSkill,
    ambientLight: state.ambientLight,
    // Debug overrides survive a restart, or testing a rule that needs a raised
    // pool would mean re-setting them after every death.
    playerMaxHealth: state.playerMaxHealth,
    playerMaxStamina: state.playerMaxStamina,
    resetToken: state.resetToken + 1,
  })),
}));
