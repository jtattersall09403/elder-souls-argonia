import { create } from "zustand";
import type { CombatAction, GameSnapshot } from "./types";
import { DEFAULT_ENEMY_COUNT } from "../combat/tuning";
import { COMBAT_TUNING } from "../combat/weapon";
import { DEFAULT_ENEMY_ARCHETYPE } from "../actors/enemyArchetypes";

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
  firstPersonBowRig: true,
  enemyArchetypeId: DEFAULT_ENEMY_ARCHETYPE.id,
  resetToken: 0,
  aiming: false,
  bowPhase: "lowered" as const,
  drawFraction: 0,
  arrowsLeft: 0,
  aimZoom: 0,
  playerMaxHealth: COMBAT_TUNING.maxHealth,
  playerMaxStamina: COMBAT_TUNING.maxStamina,
  playerPoise: 0,
  playerMaxPoise: 0,
  poiseEnabled: true,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialSnapshot,
  patch: (patch) => set(patch),
  reset: () => set((state) => ({
    ...initialSnapshot,
    started: true,
    message: "FIGHT RESTARTED",
    enemyEnabled: state.enemyEnabled,
    enemyAiEnabled: state.enemyAiEnabled,
    enemyCount: state.enemyCount,
    showHitboxes: state.showHitboxes,
    showWeaponHitboxes: state.showWeaponHitboxes,
    showBackstabZones: state.showBackstabZones,
    footDrivenMotion: state.footDrivenMotion,
    lockedSpeedFollowsClip: state.lockedSpeedFollowsClip,
    firstPersonBowRig: state.firstPersonBowRig,
    enemyArchetypeId: state.enemyArchetypeId,
    poiseEnabled: state.poiseEnabled,
    // Debug overrides survive a restart, or testing a rule that needs a raised
    // pool would mean re-setting them after every death.
    playerMaxHealth: state.playerMaxHealth,
    playerMaxStamina: state.playerMaxStamina,
    resetToken: state.resetToken + 1,
  })),
}));
