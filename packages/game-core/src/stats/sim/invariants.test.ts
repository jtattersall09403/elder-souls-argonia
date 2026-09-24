/**
 * The standing tests (module 76 §104): every design invariant must hold on the
 * CANONICAL data (`SIM_DATA` = `STATS_DATA` + `sim/data`). A red here is a
 * design decision for the stats lead, never a threshold to loosen.
 */
import { describe, expect, it } from "vitest";

import { runSim } from "./run";
import { SIM_DATA } from "./simData";

const { results: male, invariants } = runSim(SIM_DATA);

describe("design invariants on the canonical data", () => {
  it("runs all nineteen", () => expect(invariants).toHaveLength(19));
  for (const inv of invariants) {
    it(`${inv.id}: ${inv.description}`, () => expect(inv.pass, inv.detail).toBe(true));
  }
});

// Every sweep that plays a character from race baselines (campaign, main
// quest, progression, deferral), again as women (decision 0089: every race has
// female baselines). The Morrowind known-answer run stays male by design.
describe("design invariants with female characters (standing test)", () => {
  const female = runSim(SIM_DATA, { sex: "female" });
  it("plays female characters", () => {
    // Female baselines differ for five of the six races played, so the runs must differ.
    expect(JSON.stringify(female.results.campaign.map((r) => r.timeline))).not.toBe(JSON.stringify(male.campaign.map((r) => r.timeline)));
    expect(JSON.stringify(female.results.deferral)).not.toBe(JSON.stringify(male.deferral));
  });
  it("runs all nineteen", () => expect(female.invariants).toHaveLength(19));
  for (const inv of female.invariants) {
    it(`${inv.id} (female)`, () => expect(inv.pass, inv.detail).toBe(true));
  }
});
