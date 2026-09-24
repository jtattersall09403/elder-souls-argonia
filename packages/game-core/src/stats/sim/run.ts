/**
 * The balance harness in one call (port of tooling/stats-sim/run.mjs --json):
 * every sweep, then the invariants over them. `JSON.stringify(runSim(d))` has
 * run.mjs --json's shape (campaign runs also carry `levelAt`/`hourAtLevel`
 * functions, which JSON drops).
 */
import { runInvariants, type Invariant } from "./invariants";
import { SIM_DATA, type SimData } from "./simData";
import {
  argoniaMainQuestOnly, argoniaPacing, breathSweep, buildParity, burdenSweep, campaignSweep, climbSweep, deferralCheck,
  economySweep, godCheck, loopHunt, matchupMatrix, morrowindKnownAnswer, namedArchetypeTable, progressionSweep,
  referenceCheck, sneakSweep, softRequirementCheck,
} from "./sweeps";

export function simResults(data: SimData = SIM_DATA, { matrix = false }: { matrix?: boolean } = {}) {
  const campaign = campaignSweep(data);
  const results = {
    reference: referenceCheck(data),
    named: namedArchetypeTable(data),
    parity: buildParity(data),
    god: godCheck(data),
    burden: burdenSweep(data),
    breath: breathSweep(data),
    climb: climbSweep(data),
    sneak: sneakSweep(data),
    progression: progressionSweep(data),
    campaign,
    pacing: argoniaPacing(campaign),
    mainQuestOnly: argoniaMainQuestOnly(data),
    knownAnswer: morrowindKnownAnswer(data),
    deferral: deferralCheck(data),
    economy: economySweep(data),
    loops: loopHunt(data),
    softRequirements: softRequirementCheck(data),
  };
  return matrix ? { ...results, matrix: matchupMatrix(data) } : results;
}

export type SimResults = ReturnType<typeof simResults>;

/** Every sweep and every invariant over `data`. The harness passes when every invariant does. */
export function runSim(
  data: SimData = SIM_DATA, opts: { matrix?: boolean } = {},
): { results: SimResults; invariants: Invariant[] } {
  const results = simResults(data, opts);
  return { results, invariants: runInvariants(results, data) };
}
