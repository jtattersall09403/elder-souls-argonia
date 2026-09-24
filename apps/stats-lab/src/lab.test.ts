import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as s from "@elder-souls/game-core/stats/index";
import { CATALOGUE } from "@elder-souls/text-catalogue";
import { LAB_SKILLS, climbRows, combatRows, curvePoints, derivedRows, ladderRows, referenceState, stateFromCreation } from "./model";
import { attributeName, bandName, className, raceName, skillName, ui } from "./text";

const here = dirname(fileURLToPath(import.meta.url));

describe("the lab shows the game's numbers", () => {
  it("the reference preset reads the Marsh Hand's (§116)", () => {
    const rows = Object.fromEntries(derivedRows(referenceState()).map((r) => [r.key, r.value]));
    expect(rows.health).toBe(100);
    expect(rows.stamina).toBe(100);
    expect(rows["carry-capacity"]).toBe(180);
    expect(rows.burden).toBe("tier-mid");
    const d2 = ladderRows(referenceState()).find((r) => r.band === "D2")!;
    expect(d2.health).toBe(135);
  });
  it("breath follows the race record's water breathing", () => {
    const breath = (race: string) => derivedRows(stateFromCreation(race, "male", "warrior")).find((r) => r.key === "breath")!.value;
    expect(breath("argonian")).toBe(Infinity);
    expect(Number.isFinite(breath("nord"))).toBe(true);
  });
  it("every race × sex × class builds and every panel computes finite numbers", () => {
    for (const r of s.STATS_DATA.races.races) for (const sex of ["male", "female"] as const) for (const c of s.STATS_DATA.classes.classes) {
      const st = stateFromCreation(r.id, sex, c.id);
      for (const row of [...derivedRows(st), ...combatRows(st)]) if (typeof row.value === "number") expect(Number.isNaN(row.value)).toBe(false);
      expect(climbRows(st)).toHaveLength(3);
    }
  });
});

describe("every string the lab shows comes from the text catalogue", () => {
  const missing = (text: string, id: string) => expect(text, id).not.toMatch(/^text\./);
  it("names", () => {
    for (const id of s.SKILL_IDS) missing(skillName(id), id);
    for (const id of s.ATTRIBUTE_IDS) missing(attributeName(id), id);
    for (const r of s.STATS_DATA.races.races) missing(raceName(r.id), r.id);
    for (const c of s.STATS_DATA.classes.classes) missing(className(c.id), c.id);
    for (const k of LAB_SKILLS) for (const c of curvePoints(k, s.REFERENCE_ATTRIBUTES)) missing(bandName(c.band), c.band);
  });
  it("every ui(...) key used in the source", () => {
    const src = ["App.tsx", "model.ts"].map((f) => readFileSync(join(here, f), "utf8")).join("\n");
    const keys = new Set([...src.matchAll(/ui\("([a-z0-9-]+)"\)/g)].map((m) => m[1]));
    for (const row of [...derivedRows(referenceState()), ...combatRows(referenceState())]) {
      keys.add(row.key);
      if (typeof row.value === "string") keys.add(row.value);
    }
    for (const tier of ["fast", "mid", "fat", "overloaded"]) keys.add(`tier-${tier}`);
    for (const k of ["male", "female", "pass", "fail", "yes", "no"]) keys.add(k);
    expect(keys.size).toBeGreaterThan(30);
    for (const k of keys) missing(ui(k), k);
    // and the reverse: no catalogue entry for the lab that nothing shows
    for (const k of LAB_SKILLS) for (const c of curvePoints(k, s.REFERENCE_ATTRIBUTES)) keys.add(`band-${c.band.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`)}`);
    const unused = [...CATALOGUE.keys()].filter((id) => id.startsWith("text.stats-lab.") && !keys.has(id.slice("text.stats-lab.".length)));
    expect(unused).toEqual([]);
  });
});
