import { create } from "zustand";
import type { CombatAction, GameSnapshot } from "./types";
import { DEFAULT_ENEMY_COUNT } from "../combat/tuning";

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
  resetToken: 0,
  aiming: false,
  bowPhase: "lowered" as const,
  drawFraction: 0,
  arrowsLeft: 0,
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
    resetToken: state.resetToken + 1,
  })),
}));
