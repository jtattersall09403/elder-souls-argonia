import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as s from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const MARSH_HAND = s.REFERENCE_ATTRIBUTES;

describe("the Marsh Hand reference (module 76 §116)", () => {
  it("lands on today's sandbox numbers", () => {
    expect(s.maxHealth(MARSH_HAND, 10)).toBe(100);
    expect(s.maxStamina(MARSH_HAND)).toBe(100);
    expect(s.carryCapacity(MARSH_HAND)).toBe(180);
    expect(s.mitigation(50, 24)).toBeCloseTo(0.25, 4);
    expect(s.breathSeconds(40, 50)).toBeCloseTo(51.5, 9);
  });
});

describe("the curve", () => {
  it("buys 36 / 67 / 88 % of a range at 25 / 50 / 75 (§116)", () => {
    expect(s.k(25)).toBeCloseTo(0.369, 3);
    expect(s.k(50)).toBeCloseTo(0.670, 3);
    expect(s.k(75)).toBeCloseTo(0.891, 3);
    expect(s.k(0)).toBe(0);
    expect(s.k(100)).toBe(1);
    expect(s.k(150)).toBe(1);
  });
  it("normalises the score so 100/100 reads 100 and Alchemy uses Int/10", () => {
    expect(s.effectiveSkill("longBlade", 100, MARSH_HAND.agility === 50 ? { agility: 100 } : {})).toBeCloseTo(100, 12);
    expect(s.effectiveSkill("alchemy", 100, { intelligence: 100 })).toBeCloseTo(100, 12);
    expect(s.effectiveSkill("heavyArmor", 45, MARSH_HAND)).toBe(45);
  });
});

describe("combat modifiers", () => {
  it("melee: P 0.40 → 1.00, stamina ×1.25 → ×0.80, Strength outside P", () => {
    const low = s.meleeModifiers("longBlade", 0, { ...MARSH_HAND, agility: 0 });
    const high = s.meleeModifiers("longBlade", 100, { ...MARSH_HAND, agility: 100, strength: 100 });
    expect(low.damagePosition).toBeCloseTo(0.4, 12);
    expect(low.staminaCost).toBeCloseTo(1.25, 12);
    expect(high.damagePosition).toBeCloseTo(1, 12);
    expect(high.staminaCost).toBeCloseTo(0.8, 12);
    expect(high.strength).toBeCloseTo(1.5, 12);
    expect(s.meleeModifiers("handToHand", 60).strength).toBe(1);
    expect(s.meleeModifiers("handToHand", 100, { ...MARSH_HAND, agility: 100 }).targetStaminaDamage).toBeCloseTo(2, 12);
  });
  it("marksman reaches the owner's mastery numbers (0074 §3) and has no Strength term", () => {
    const m = s.marksmanModifiers(100, { ...MARSH_HAND, agility: 100 });
    expect(m).toMatchObject({ drawStrength: 1 });
    expect(m.nockSpeed).toBeCloseTo(1.6, 12);
    expect(m.drawSpeed).toBeCloseTo(2, 12);
    expect(m.sway).toBeCloseTo(0.6, 12);
    expect(m.drawStaminaCost).toBeCloseTo(0.8, 12);
    expect(m.damage).toBeCloseTo(1, 12);
    expect(s.strengthApplies("marksman")).toBe(false);
  });
  it("every modifier moves monotonically the right way with skill", () => {
    let prevM = s.marksmanModifiers(0);
    let prevL = s.meleeModifiers("spear", 0);
    let prevB = s.blockModifiers(0);
    for (let skill = 5; skill <= 100; skill += 5) {
      const m = s.marksmanModifiers(skill);
      const l = s.meleeModifiers("spear", skill);
      const b = s.blockModifiers(skill);
      expect(m.nockSpeed).toBeGreaterThan(prevM.nockSpeed);
      expect(m.drawSpeed).toBeGreaterThan(prevM.drawSpeed);
      expect(m.damage).toBeGreaterThan(prevM.damage);
      expect(m.sway).toBeLessThan(prevM.sway);
      expect(l.staminaCost).toBeLessThan(prevL.staminaCost);
      expect(l.wear).toBeLessThan(prevL.wear);
      expect(b.stability).toBeGreaterThan(prevB.stability);
      expect(b.guardStamina).toBeLessThan(prevB.guardStamina);
      [prevM, prevL, prevB] = [m, l, b];
    }
    expect(s.capBlockStability(1.2)).toBe(0.95);
  });
});

describe("checks and movement (§117.1, §118, §122)", () => {
  it("locks, casting and enchanting compare canon's score", () => {
    expect(s.lockOpens(50, { agility: 50 }, 1, 60)).toBe(true);
    expect(s.lockOpens(50, { agility: 50 }, 1, 61)).toBe(false);
    expect(s.maxCastableCost(50, { willpower: 50 })).toBe(110);
    expect(s.enchantPointBudget(60, { intelligence: 60 })).toBeCloseTo(24, 12);
    expect(s.chargedUseCostMultiplier(100)).toBeCloseTo(0.1, 12);
    expect(s.persuasionScore(40, { personality: 50 }, 5)).toBe(55);
  });
  it("movement lands on §122's reference column", () => {
    expect(s.walkSpeed(MARSH_HAND)).toBeCloseTo(4.5, 12);
    expect(s.jumpApex(25)).toBeCloseTo(1.378, 12);
    expect(s.safeFallMetres(40)).toBeCloseTo(3.6, 12);
    expect(s.swimSpeed(50)).toBeCloseTo(1.6, 12);
  });
  it("the §122.1 climbing table's hour-one row", () => {
    const c = s.climb(10, { acrobatics: 15, attributes: MARSH_HAND, burdenTier: "mid", stamina: 100, staminaRegen: 24 });
    expect(c.speed).toBeCloseTo(1.0, 1);
    // §122.1's table prints 8.6; the design's own arithmetic (and the sim) gives 8.52.
    expect(c.drainPerSecond).toBeCloseTo(8.516, 3);
  });
  it("poise base is Agility/2 and temper grades gate at 25/55/80", () => {
    expect(s.basePoise({ agility: 60 })).toBe(30);
    expect(s.temperGrade(100, { strength: 100 })).toBe(3);
    expect(s.temperGrade(0, { strength: 0 })).toBe(0);
  });
});

describe("the data", () => {
  it("is frozen, versioned and holds the 27 skills and 7 attributes", () => {
    expect(Object.isFrozen(s.STATS_DATA.curves.skillCurve)).toBe(true);
    expect(s.STATS_DATA.skills.skills.map((x) => x.id)).toEqual([...s.SKILL_IDS]);
    expect(s.STATS_DATA.attributes.attributes.map((x) => x.id)).toEqual([...s.ATTRIBUTE_IDS]);
    for (const skill of s.STATS_DATA.skills.skills) {
      if (skill.score) expect(s.ATTRIBUTE_IDS).toContain(skill.score);
      expect(s.ATTRIBUTE_IDS).toContain(skill.gov);
    }
  });
  it("rejects a schemaVersion it does not read", () => {
    const raw = { curves: { ...s.STATS_DATA.curves, schemaVersion: 2 }, skills: s.STATS_DATA.skills, attributes: s.STATS_DATA.attributes };
    expect(() => s.statsData(raw)).toThrow(/schemaVersion/);
  });
  it("carries no prose: labels live in the text catalogue", () => {
    const walk = (n: unknown): string[] =>
      typeof n === "string" ? [n] : n && typeof n === "object" ? Object.values(n).flatMap(walk) : [];
    for (const f of readdirSync(join(here, "data"))) {
      const strings = walk(JSON.parse(readFileSync(join(here, "data", f), "utf8")));
      for (const str of strings) expect(str.split(" ").length, `${f}: ${str}`).toBeLessThan(6);
    }
  });
});

describe("the folder is pure", () => {
  it("imports nothing outside src/stats (no React, three, or other game-core modules)", () => {
    for (const f of readdirSync(here).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      const src = readFileSync(join(here, f), "utf8");
      for (const m of src.matchAll(/^(?:import|export)[^;]*?from\s+"([^"]+)"/gm)) expect(m[1], `${f} imports ${m[1]}`).toMatch(/^\.\//);
    }
  });
});

describe("the port of tooling/stats-sim/data", () => {
  // Every numeric value the sim's tables hold is ported unchanged except these,
  // each with its reason in docs/decisions (the stats-lab lane's port record).
  const DROPPED = new Set([
    "curves/movement/speedAttributeBase", "curves/movement/speedAttributeDivisor", // read by no formula; §122 walk uses 0.75 + Speed/200
    "skills/skills/athletics/bands/run", "skills/skills/athletics/bands/swim",                    // §122 formulas govern sprint and swim
    "skills/skills/acrobatics/bands/jump", "skills/skills/acrobatics/bands/safeFallMeters",       // §122 formulas govern jump apex and safe fall
    "skills/skills/sneak/bands/openerMultiplier", // null placeholder; the opener table is curves.sneakAttack
  ]);
  // Prose the sim keeps beside its numbers (labels, notes, formula sentences):
  // not data, so not ported (standard 4; names come from the text catalogue).
  const PROSE_KEYS = new Set(["label", "drives", "note", "formula", "climbing", "knockout", "sneakAttack"]);
  const CHANGED: Record<string, readonly number[]> = {
    "skills/skills/marksman/bands/drawSpeed": [1.0, 2.0], // owner 2026-09-18, decision 0074 §3 (module 76 §118 row)
  };
  const simDir = join(here, "../../../../tooling/stats-sim/data");
  const leaves = (n: unknown, p: string, out: Map<string, unknown>) => {
    if (Array.isArray(n) && n.every((x) => typeof x !== "object")) out.set(p, n);
    else if (Array.isArray(n)) n.forEach((v) => leaves(v, `${p}/${(v as { id?: string }).id ?? "?"}`, out));
    else if (n && typeof n === "object") {
      for (const [key, v] of Object.entries(n)) if (!key.startsWith("_") && key !== "schemaVersion" && key !== "designRef") leaves(v, `${p}/${key}`, out);
    } else out.set(p, n); // number, boolean, string or null
    return out;
  };
  for (const name of ["curves", "skills", "attributes"]) {
    it(`${name}.json: every sim value is here unchanged, bar the recorded differences`, () => {
      const sim = leaves(JSON.parse(readFileSync(join(simDir, `${name}.json`), "utf8")), name, new Map());
      const port = leaves(JSON.parse(readFileSync(join(here, "data", `${name}.json`), "utf8")), name, new Map());
      for (const [path, value] of sim) {
        const key = path.split("/").at(-1) ?? "";
        if (PROSE_KEYS.has(key) && (typeof value === "string" || key === "drives")) {
          expect(port.has(path), `${path} is prose and must not be ported`).toBe(false);
          continue;
        }
        if (DROPPED.has(path)) expect(port.has(path), path).toBe(false);
        else if (path in CHANGED) expect(port.get(path), path).toEqual(CHANGED[path]);
        else expect(port.get(path), path).toEqual(value);
      }
    });
  }
});
