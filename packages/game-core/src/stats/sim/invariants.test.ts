/**
 * The standing tests (module 76 §104): every design invariant must hold on the
 * CANONICAL data (`SIM_DATA` = `STATS_DATA` + `sim/data`). A red here is a
 * design decision for the stats lead, never a threshold to loosen.
 */
import { describe, expect, it } from "vitest";

import { runSim } from "./run";
import { SIM_DATA } from "./simData";

const { invariants } = runSim(SIM_DATA);

describe("design invariants on the canonical data", () => {
  it("runs all nineteen", () => expect(invariants).toHaveLength(19));
  for (const inv of invariants) {
    it(`${inv.id}: ${inv.description}`, () => expect(inv.pass, inv.detail).toBe(true));
  }
});
