/**
 * The balance harness in one call (port of tooling/stats-sim/run.mjs --json):
 * every sweep, then the invariants over them. `JSON.stringify(runSim(d))` has
 * run.mjs --json's shape (campaign runs also carry `levelAt`/`hourAtLevel`
 * functions, which JSON drops).
 */
import { runInvariants, type Invariant } from "./invariants";
import { SIM_DATA, type SimData } from "./simData";
import { SIM_SEX } from "./model";
import type { Sex } from "../types";
import {
  argoniaMainQuestOnly, argoniaPacing, breathSweep, buildParity, burdenSweep, campaignSweep, climbSweep, deferralCheck,
  economySweep, godCheck, loopHunt, matchupMatrix, morrowindKnownAnswer, namedArchetypeTable, progressionSweep,
  referenceCheck, sneakSweep, softRequirementCheck,
} from "./sweeps";

export type SimOptions = {
  matrix?: boolean;
  /**
   * Body sex for every sweep that plays a character from race baselines
   * (campaign, main quest, progression, deferral). The Morrowind known-answer
   * run stays male: it reproduces Morrowind's documented pace, not ours.
   */
  sex?: Sex;
};

export function simResults(data: SimData = SIM_DATA, { matrix = false, sex = SIM_SEX }: SimOptions = {}) {
  const campaign = campaignSweep(data, sex);
  const results = {
    reference: referenceCheck(data),
    named: namedArchetypeTable(data),
    parity: buildParity(data),
    god: godCheck(data),
    burden: burdenSweep(data),
    breath: breathSweep(data),
    climb: climbSweep(data),
    sneak: sneakSweep(data),
    progression: progressionSweep(data, sex),
    campaign,
    pacing: argoniaPacing(campaign),
    mainQuestOnly: argoniaMainQuestOnly(data, sex),
    knownAnswer: morrowindKnownAnswer(data),
    deferral: deferralCheck(data, sex),
    economy: economySweep(data),
    loops: loopHunt(data),
    softRequirements: softRequirementCheck(data),
  };
  return matrix ? { ...results, matrix: matchupMatrix(data) } : results;
}

export type SimResults = ReturnType<typeof simResults>;

/** Every sweep and every invariant over `data`. The harness passes when every invariant does. */
export function runSim(
  data: SimData = SIM_DATA, opts: SimOptions = {},
): { results: SimResults; invariants: Invariant[] } {
  const results = simResults(data, opts);
  return { results, invariants: runInvariants(results, data) };
}
