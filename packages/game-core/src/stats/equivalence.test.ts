/**
 * The port against the design's reference implementation (tooling/stats-sim).
 * Expected answers were generated from the sim BEFORE the port was written
 * (`__fixtures__/generate-expected.mjs`), on a hand-written sample (a) and then
 * on a fresh seeded sample (b) the port had never been run against.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as stats from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "__fixtures__");
const read = (name: string) => JSON.parse(readFileSync(join(fixtures, name), "utf8"));

// Sim function name -> the port's. Signatures are the sim's by design.
const PORT: Record<string, (...args: never[]) => unknown> = {
  k: stats.k, effectiveSkill: stats.effectiveSkill, strengthDamage: stats.strengthDamage, band: stats.band,
  damagePosition: stats.damagePosition, maxHealth: stats.maxHealth, walkSpeed: stats.walkSpeed,
  sprintSpeed: stats.sprintSpeed, swimSpeed: stats.swimSpeed, maxStamina: stats.maxStamina,
  staminaRegen: stats.staminaRegen, maxMagicka: stats.maxMagicka, magickaRegen: stats.magickaRegen,
  carryCapacity: stats.carryCapacity, burdenTier: stats.burdenTier, mitigation: stats.mitigation,
  damageAfterArmour: stats.damageAfterArmour, incomingDamage: stats.incomingDamage,
  breathSeconds: stats.breathSeconds, unarmouredRating: stats.unarmouredRating,
  sneakMultiplier: stats.sneakMultiplier, climb: stats.climb, vasteiPerRank: stats.vasteiPerRank,
  attributeCost: stats.attributeCost, rankCost: stats.pointsToNextRank,
};

const decode = (v: unknown): unknown =>
  v && typeof v === "object"
    ? "$inf" in (v as object) ? Infinity
      : Array.isArray(v) ? v.map(decode) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]))
    : v;

function same(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === "number") {
    expect(typeof actual, path).toBe("number");
    const a = actual as number;
    if (!Number.isFinite(expected)) return void expect(a, path).toBe(expected);
    expect(Math.abs(a - expected), `${path}: ${a} vs ${expected}`).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));
  } else if (expected && typeof expected === "object") {
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, v] of Object.entries(expected)) same((actual as Record<string, unknown>)[key], v, `${path}.${key}`);
  } else {
    expect(actual, path).toBe(expected);
  }
}

const samples = readdirSync(fixtures).filter((f) => /^sample-\w+\.inputs\.json$/.test(f)).sort();

describe("port equals tooling/stats-sim", () => {
  it("has at least the written sample and one fresh sample", () => {
    expect(samples.length).toBeGreaterThanOrEqual(2);
  });
  for (const file of samples) {
    const input = read(file);
    const { expected } = read(file.replace(".inputs.", ".expected."));
    it(`sample ${input.sample}: ${input.cases.length} cases`, () => {
      expect(expected.length).toBe(input.cases.length);
      input.cases.forEach(([fn, args]: [string, unknown[]], i: number) => {
        const port = PORT[fn];
        expect(port, `no port for ${fn}`).toBeTypeOf("function");
        const got = port(...(args.map((a) => (a === null ? undefined : a)) as never[]));
        same(got, decode(expected[i]), `${input.sample}#${i} ${fn}(${JSON.stringify(args)})`);
      });
    });
  }
});
