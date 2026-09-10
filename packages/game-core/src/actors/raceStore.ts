import { create } from "zustand";
import {
  DEFAULT_RACE,
  DEFAULT_SEX,
  RACE_IDS,
  SEXES,
  resolveBuild,
  type CharacterBuild,
  type RaceId,
  type Sex,
} from "./races";

/**
 * Who the player is: a race and a sex, the two axes decision 0054 keeps apart.
 *
 * Its own store for the same reason the inventory has one: who you are is a
 * system the real game keeps, and it has no business living in the combat HUD
 * snapshot. Combat reads it in exactly one place — the actor that renders the
 * player — because everything else about a fighter is race-independent.
 */
type RaceStore = {
  playerRace: RaceId;
  playerSex: Sex;
  /**
   * A body to render instead of the one the race and sex resolve to.
   *
   * Only the dev portrait path sets it, and only for a build that is not in the
   * shipped roster: the contact-sheet alternates are a second donor per race,
   * built for comparison and never playable, so they have no race/sex pair of
   * their own to select. Null in the game.
   */
  playerBuildOverride: CharacterBuild | null;
  setPlayerRace: (race: RaceId) => void;
  setPlayerSex: (sex: Sex) => void;
  setPlayerBuildOverride: (build: CharacterBuild | null) => void;
};

export const useRaceStore = create<RaceStore>((set) => ({
  playerRace: DEFAULT_RACE,
  playerSex: DEFAULT_SEX,
  playerBuildOverride: null,
  setPlayerBuildOverride: (playerBuildOverride) => set({ playerBuildOverride }),
  setPlayerRace: (playerRace) => {
    if (RACE_IDS.includes(playerRace)) set({ playerRace });
  },
  setPlayerSex: (playerSex) => {
    if (SEXES.includes(playerSex)) set({ playerSex });
  },
}));

export function usePlayerRace(): RaceId {
  return useRaceStore((state) => state.playerRace);
}

export function usePlayerSex(): Sex {
  return useRaceStore((state) => state.playerSex);
}

/**
 * The built body for the current selection. `resolveBuild` falls back to a sex
 * this race *is* built for, so a roster that is mid-extension renders something
 * rather than throwing at the picker.
 */
export function usePlayerBuild(): CharacterBuild {
  const race = usePlayerRace();
  const sex = usePlayerSex();
  const override = useRaceStore((state) => state.playerBuildOverride);
  return override ?? resolveBuild(race, sex);
}
