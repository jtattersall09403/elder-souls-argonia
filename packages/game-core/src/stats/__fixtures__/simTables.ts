/**
 * Test helper: the sim's own tables (`sim-data/`, a verbatim copy of
 * tooling/stats-sim/data) as a `SimData`, so the harness port can be run
 * against exactly the numbers the sim ran on. It adds only what the port reads
 * that the sim kept as literals in code, each with the sim's value:
 *
 * - `schemaVersion: 1` on every table;
 * - `curves.movement` walk/sprint/swim/jump/fall constants (model.mjs literals),
 *   `curves.score.scale` 100 and `missingAttribute` 50 (model.mjs `k`, `effectiveSkill`);
 * - `curves.poise`, `curves.block`, `curves.checks` and `attributes.reference`
 *   from the canonical tables (the sim has no such blocks; only `checks.castSkillMultiplier`
 *   is read by the harness, and it equals the sim's literal 2);
 * - `races.sexes` and each race's attributes as `{male: a, female: a}`;
 * - `gear.bows.<id>.weightKg` (model.mjs BOW_WEIGHTS) and `gear.bowMaterialDamage`
 *   (the literal 0.7 + 0.3 × damageScale in model.mjs attackProfile).
 *
 * Ids, labels and the marksman drawSpeed band stay the sim's.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import canonicalAttributes from "../data/attributes.json";
import canonicalCurves from "../data/curves.json";
import { statsData } from "../data";
import { simData, type SimData } from "../sim/simData";

type Json = Record<string, unknown>;

/** The literals the sim wrote in code, as the port reads them from data. */
export const SIM_CODE_CONSTANTS = {
  movement: {
    speedFactorBase: 0.75, speedFactorDivisor: 200, loadSpeedPenalty: 0.3, sprintAthleticsDivisor: 250,
    swimAthleticsBase: 0.5, swimAthleticsDivisor: 100, jumpAcrobaticsBase: 0.8, jumpAcrobaticsDivisor: 125,
    safeFallBaseMetres: 2, safeFallAcrobaticsDivisor: 25, overloadedWalkFraction: 0.4,
  },
  score: { scale: 100, missingAttribute: 50 },
  bowWeightKg: { shortbow: 1.4, longbow: 1.9, warbow: 2.3 } as Record<string, number>,
  bowMaterialDamage: { base: 0.7, damageScaleShare: 0.3 },
} as const;

/** model.mjs literals for casting (1.2 s base cast, cheapest working spell 6), now magic.json `castability`. */
function withCastConstants(magic: Json): Json {
  const castability = { ...(magic.castability as Json), baseCastSeconds: 1.2, minWorkingCost: 6 };
  return { ...magic, castability };
}

export function fromSimTables(dir: string): SimData {
  const read = (name: string): Json => ({ schemaVersion: 1, ...JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) });
  const curves = read("curves") as Json & { movement: Json; score: Json };
  curves.movement = { ...curves.movement, ...SIM_CODE_CONSTANTS.movement };
  curves.score = { ...curves.score, ...SIM_CODE_CONSTANTS.score };
  curves.poise = canonicalCurves.poise;
  curves.block = canonicalCurves.block;
  curves.checks = canonicalCurves.checks;

  const attributes = { ...read("attributes"), reference: canonicalAttributes.reference };
  const races = read("races") as Json & { races: Json[] };
  races.sexes = ["male", "female"];
  races.races = races.races.map((r) => ({ ...r, attributes: { male: r.attributes, female: r.attributes } }));

  const gear = read("gear") as Json & { bows: Record<string, Json> };
  gear.bows = Object.fromEntries(
    Object.entries(gear.bows).map(([id, bow]) => [id, { ...bow, weightKg: SIM_CODE_CONSTANTS.bowWeightKg[id] }]),
  );
  gear.bowMaterialDamage = SIM_CODE_CONSTANTS.bowMaterialDamage;

  // The sim's variants carry a prose `note` beside their factors; its compiler skipped non-numbers.
  const ladder = read("ladder") as Json & { variants: Record<string, Json> };
  ladder.variants = Object.fromEntries(Object.entries(ladder.variants)
    .filter(([id]) => !id.startsWith("_"))
    .map(([id, v]) => [id, Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "number"))]));

  const stats = statsData({
    curves, skills: read("skills"), attributes, races, classes: read("classes"), ladder,
    magic: withCastConstants(read("magic")), economy: read("economy"), progression: read("rules-argonia"),
  });
  return simData(stats, {
    gear, builds: read("builds"), enemies: read("enemies"),
    content: { argonia: read("content-argonia"), vvardenfell: read("content-vvardenfell") },
    rules: { morrowind: read("rules-morrowind") },
  });
}
