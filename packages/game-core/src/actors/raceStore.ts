import { create } from "zustand";
import { DEFAULT_RACE, RACE_IDS, type RaceId } from "./races";

/**
 * Which body the player is wearing.
 *
 * Its own store for the same reason the inventory has one: who you are is a
 * system the real game keeps, and it has no business living in the combat HUD
 * snapshot. Combat reads it in exactly one place — the actor that renders the
 * player — because everything else about a fighter is race-independent.
 */
type RaceStore = {
  playerRace: RaceId;
  setPlayerRace: (race: RaceId) => void;
};

export const useRaceStore = create<RaceStore>((set) => ({
  playerRace: DEFAULT_RACE,
  setPlayerRace: (playerRace) => {
    if (RACE_IDS.includes(playerRace)) set({ playerRace });
  },
}));

export function usePlayerRace(): RaceId {
  return useRaceStore((state) => state.playerRace);
}
