/**
 * The studio's `WorldStateReader` (16e deliverable 7).
 *
 * `packages/game-core/src/travel/travelServices.ts` evaluates a service's
 * gates against an injected view of the world; nothing in the contract reads
 * a store. This is the studio's view, kept in one small file so the game app
 * can drop in its own without touching the sockets component.
 *
 * Two vocabularies have to meet here:
 *  - the record says `seasonIs: "wet"`, the world clock names five monsoon
 *    seasons, so the wet/dry split is taken from the clock's own season
 *    scalar (−1 dry … +1 wet, packages/world-time/src/season.ts): s >= 0 is
 *    the wet half of the year;
 *  - the record says `weatherIs: "storm"`, the weather machine names ten
 *    states, so the three states that are a storm to a boatman (squall,
 *    downpour, thunderstorm) report as "storm" and every other state
 *    reports its own name.
 */
import type { WorldStateReader } from "@elder-souls/game-core/travel/travelServices";
import { lastWeatherSample } from "../weather/weatherState";
import { worldClock } from "../sky/timeState";

const STORM_STATES = new Set(["squall", "downpour", "thunderstorm"]);

export function createStudioWorldState(): WorldStateReader {
  return {
    weather() {
      const sample = lastWeatherSample();
      if (!sample) return "clear";
      return STORM_STATES.has(sample.state) ? "storm" : sample.state;
    },
    season() {
      return worldClock.season().s >= 0 ? "wet" : "dry";
    },
    // The studio has no faction state and the player carries nothing: a
    // stance gate reads neutral and a value gate reads zero.
    placeStance() {
      return "neutral";
    },
    carriedValue() {
      return 0;
    },
    // No Owing ledger exists yet (the crime-as-Owing runtime is build-out
    // work, decision 0039): nothing is owed anywhere.
    owing() {
      return 0;
    },
  };
}
