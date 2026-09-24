import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as s from "./index";

const here = dirname(fileURLToPath(import.meta.url));

describe("races (decision 0089)", () => {
  it("has exactly the body roster's race ids", () => {
    const roster = JSON.parse(readFileSync(join(here, "../actors/generated/races.json"), "utf8"));
    expect(s.STATS_DATA.races.races.map((r) => r.id).sort()).toEqual(Object.keys(roster.races).sort());
  });
  it("gives every race 45 points of skill bonuses and both sexes", () => {
    for (const r of s.STATS_DATA.races.races) {
      expect(Object.values(r.skillBonuses).reduce((a, b) => a + (b ?? 0), 0), r.id).toBe(45);
      expect(Object.keys(r.attributes).sort()).toEqual(["female", "male"]);
    }
  });
  it("Argonian is canon exact (module 76 §127)", () => {
    const a = s.raceStats("argonian");
    expect(a.attributes.male).toMatchObject({ strength: 40, intelligence: 40, willpower: 30, agility: 50, speed: 50, endurance: 30, personality: 30 });
    expect(a.attributes.female).toMatchObject({ intelligence: 50, willpower: 40, agility: 40, speed: 40 });
    expect(a.effects.map((e) => e.field)).toEqual(["resistPoison", "resistCommonDisease", "waterBreathing"]);
  });
});

describe("character creation (§119)", () => {
  it("an Argonian warrior starts where the design says", () => {
    const c = s.startingCharacter({ race: "argonian", sex: "male", classId: "warrior" });
    expect(c.attributes.strength).toBe(50); // 40 + favoured 10
    expect(c.skills.longBlade).toBe(5 + 25 + 5); // major + combat specialization
    expect(c.skills.athletics).toBe(5 + 15 + 25 + 5);
    expect(c.skills.alchemy).toBe(5 + 5);
    expect(Math.min(...Object.values(c.skills))).toBeGreaterThanOrEqual(5);
  });
  it("rejects unknown ids", () => {
    expect(() => s.startingCharacter({ race: "maormer", sex: "male", classId: "warrior" })).toThrow(/race/);
    expect(() => s.startingCharacter({ race: "nord", sex: "male", classId: "pirate" })).toThrow(/class/);
  });
});

describe("the ladder compiler (§128, 0019 fourth amendment)", () => {
  it("interpolates the band and clamps variants to ±25 % of its edges", () => {
    const mid = s.compileActor({ id: "x", band: "D2", position: 0.5 });
    expect(mid.health).toBe(135);
    const brute = s.compileActor({ id: "y", band: "D5", position: 1, variants: ["strong", "brute"] });
    const d5 = s.STATS_DATA.ladder.bands.find((b) => b.id === "D5")!;
    expect(brute.damage).toBeCloseTo(d5.damage[1] * s.STATS_DATA.ladder.variantClamp, 9);
    expect(() => s.compileActor({ id: "z", band: "D6", position: 0 })).toThrow(/band/);
  });
});

describe("rule sets", () => {
  it("resolves $from against curves and keeps sibling overrides", () => {
    const p = s.STATS_DATA.progression as { levelTrigger: { ranksPerLevel: number }; health: { retroactive: boolean; levelEnduranceDivisor: number } };
    expect(p.levelTrigger.ranksPerLevel).toBe(s.STATS_DATA.curves.levelUp.ranksPerLevel);
    expect(p.health.retroactive).toBe(true);
    expect(p.health.levelEnduranceDivisor).toBe(10);
    expect(() => s.resolveRuleSet({ x: { $from: "curves.nope" } }, s.STATS_DATA.curves)).toThrow(/no such path/);
  });
});

describe("statsData refuses malformed tables", () => {
  const src = s.STATS_SOURCE as unknown as Record<string, Record<string, unknown>>;
  const bad = (name: string, patch: (t: Record<string, unknown>) => void) => {
    const table = structuredClone(src[name]);
    patch(table);
    return () => s.statsData({ ...s.STATS_SOURCE, [name]: table });
  };
  it("a race table with one sex", () => expect(bad("races", (t) => { t.sexes = ["male"]; })).toThrow(/sexes/));
  it("a variant moving an unknown field", () =>
    expect(bad("ladder", (t) => { (t.variants as Record<string, unknown>).strong = { helth: 1.3 }; })).toThrow(/unknown field helth/));
  it("a band missing a field", () =>
    expect(bad("ladder", (t) => { delete (t.bands as Record<string, unknown>[])[2].lootValue; })).toThrow(/lootValue/));
  it("a class with a misspelt specialization or three favoured attributes", () => {
    expect(bad("classes", (t) => { (t.classes as Record<string, unknown>[])[0].specialization = "combatt"; })).toThrow(/specialization/);
    expect(bad("classes", (t) => { (t.classes as Record<string, unknown>[])[0].favouredAttributes = ["strength", "endurance", "speed"]; })).toThrow(/favour/);
  });
  it("a scalar $from with sibling keys", () =>
    expect(() => s.resolveRuleSet({ x: { $from: "curves.levelUp.ranksPerLevel", override: 8 } }, s.STATS_DATA.curves)).toThrow(/scalar/));
});

describe("services and crafting (§124)", () => {
  it("training: costPerRank × rank^exponent, summed over a range", () => {
    expect(s.trainingCost(30)).toBe(240);
    expect(s.trainingCostRange(30, 50)).toBe(6320); // the harness's "30→50 6320g"
  });
  it("brewing reads canon's Alchemy + Int/10 score and the apparatus", () => {
    // the harness's brewed healing: novice 21, competent 77, master 198
    expect(Math.round(s.brewMagnitude(25, 35, "mortar", "restoreHealth"))).toBe(21);
    expect(Math.round(s.brewMagnitude(60, 40, "journeyman", "restoreHealth"))).toBe(77);
    expect(Math.round(s.brewMagnitude(100, 100, "master", "restoreHealth"))).toBe(198);
    expect(() => s.brewMagnitude(50, 50, "cauldron", "restoreHealth")).toThrow(/apparatus/);
  });
});
