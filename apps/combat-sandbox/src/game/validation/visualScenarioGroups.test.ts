import { describe, expect, it } from "vitest";
import groups from "./visualScenarioGroups.json";
import { VISUAL_SCENARIOS } from "./visualScenarios";

const scenarioIds = Object.keys(VISUAL_SCENARIOS);
const grouped = Object.values(groups as Record<string, string[]>).flat();

describe("visual scenario groups", () => {
  it("only names scenarios that exist", () => {
    expect(grouped.filter((id) => !scenarioIds.includes(id))).toEqual([]);
  });

  it("gives every scenario a group so a focused recording can always be requested", () => {
    expect(scenarioIds.filter((id) => !grouped.includes(id))).toEqual([]);
  });

  it("does not collide with a scenario id", () => {
    expect(Object.keys(groups).filter((name) => scenarioIds.includes(name))).toEqual([]);
  });
});
