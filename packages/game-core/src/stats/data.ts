import attributesJson from "./data/attributes.json";
import classesJson from "./data/classes.json";
import curvesJson from "./data/curves.json";
import economyJson from "./data/economy.json";
import ladderJson from "./data/ladder.json";
import magicJson from "./data/magic.json";
import racesJson from "./data/races.json";
import progressionJson from "./data/rules-argonia.json";
import skillsJson from "./data/skills.json";
import { resolveRuleSet } from "./rules";
import {
  ATTRIBUTE_IDS, LADDER_FIELDS, SEXES, SKILL_IDS, SPECIALIZATIONS,
  type AttributesTable, type ClassesTable, type Curves, type LadderTable, type OpaqueTable,
  type RacesTable, type SkillDef, type SkillId, type SkillsTable, type StatsData,
} from "./types";

/** The data shape this code reads. Bump with the JSON when a shape changes incompatibly. */
export const STATS_SCHEMA_VERSION = 1;

/** The tables as authored, before validation and `$from` resolution. */
export type StatsDataSource = {
  curves: unknown; skills: unknown; attributes: unknown; races: unknown; classes: unknown;
  ladder: unknown; magic: unknown; economy: unknown; progression: unknown;
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
function fail(message: string): never {
  throw new RangeError(`stats data: ${message}`);
}

/**
 * Assemble and validate a data set. Pure: returns a new frozen object and
 * never touches its input. Throws on a schemaVersion this code does not read,
 * skill or attribute ids that are not exactly the canonical lists, a skill,
 * class or race naming an unknown attribute or skill, a race missing a sex, a
 * class that is not 5 + 5 with two favoured attributes and a known
 * specialization, or a ladder band or variant with an unknown or malformed field.
 */
export function statsData(raw: StatsDataSource): StatsData {
  const src = structuredClone(raw) as Record<keyof StatsDataSource, { schemaVersion?: number }>;
  for (const [name, table] of Object.entries(src)) {
    if (table?.schemaVersion !== STATS_SCHEMA_VERSION) {
      fail(`${name} schemaVersion ${String(table?.schemaVersion)}, expected ${STATS_SCHEMA_VERSION}`);
    }
  }
  const curves = src.curves as Curves;
  const skills = src.skills as SkillsTable;
  const attributes = src.attributes as AttributesTable;
  const races = src.races as RacesTable;
  const classes = src.classes as ClassesTable;
  const ladder = src.ladder as LadderTable;
  const attrIds: readonly string[] = ATTRIBUTE_IDS;
  const skillIds: readonly string[] = SKILL_IDS;

  if (!same(skills.skills.map((s) => s.id), SKILL_IDS)) fail("skills are not the 27 in SKILL_IDS order");
  if (!same(attributes.attributes.map((a) => a.id), ATTRIBUTE_IDS)) fail("attributes are not the 7 in ATTRIBUTE_IDS order");
  const fullAttributes = (a: unknown) => ATTRIBUTE_IDS.every((id) => typeof (a as Record<string, unknown>)?.[id] === "number");
  for (const s of skills.skills) {
    if (!attrIds.includes(s.gov) || (s.score !== undefined && !attrIds.includes(s.score))) fail(`skill ${s.id} names an unknown attribute`);
  }
  if (!fullAttributes(attributes.reference)) fail("attributes.reference is not a full attribute set");
  if (!same([...races.sexes], SEXES)) fail("races.sexes is not exactly the two sexes (decision 0054)");
  const raceIds = new Set<string>();
  for (const r of races.races) {
    if (raceIds.has(r.id)) fail(`duplicate race ${r.id}`);
    raceIds.add(r.id);
    for (const sex of races.sexes) if (!fullAttributes(r.attributes?.[sex])) fail(`race ${r.id} has no full ${sex} attributes`);
    for (const id of Object.keys(r.skillBonuses)) if (!skillIds.includes(id)) fail(`race ${r.id} bonus to unknown skill ${id}`);
  }
  const classIds = new Set<string>();
  for (const c of classes.classes) {
    if (classIds.has(c.id)) fail(`duplicate class ${c.id}`);
    classIds.add(c.id);
    const listed = [...c.majors, ...c.minors];
    if (c.majors.length !== 5 || c.minors.length !== 5 || new Set(listed).size !== 10) fail(`class ${c.id} is not 5 majors + 5 minors, all different`);
    if (!listed.every((id) => skillIds.includes(id))) fail(`class ${c.id} names an unknown skill`);
    if (c.favouredAttributes.length !== 2 || !c.favouredAttributes.every((id) => attrIds.includes(id))) fail(`class ${c.id} does not favour two known attributes`);
    if (!(SPECIALIZATIONS as readonly string[]).includes(c.specialization)) fail(`class ${c.id} has unknown specialization ${c.specialization}`);
  }
  if (new Set(ladder.bands.map((b) => b.id)).size !== ladder.bands.length) fail("duplicate ladder band");
  const isBand = (b: unknown) => Array.isArray(b) && b.length === 2 && b.every((x) => typeof x === "number");
  for (const b of ladder.bands) {
    for (const f of LADDER_FIELDS) if (!isBand(b[f])) fail(`ladder band ${b.id} has no [lo, hi] ${f}`);
  }
  for (const [id, mods] of Object.entries(ladder.variants)) {
    for (const [f, m] of Object.entries(mods)) {
      if (!(LADDER_FIELDS as readonly string[]).includes(f) || typeof m !== "number") fail(`ladder variant ${id} moves unknown field ${f}`);
    }
  }

  const skillById = Object.fromEntries(skills.skills.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
  const progression = resolveRuleSet(src.progression as Record<string, unknown>, curves);
  return deepFreeze({
    curves, skills, attributes, races, classes, ladder,
    magic: src.magic as OpaqueTable, economy: src.economy as OpaqueTable, progression, skillById,
  });
}

/** The canonical tables as authored (module 76 §129). */
export const STATS_SOURCE: StatsDataSource = deepFreeze({
  curves: curvesJson, skills: skillsJson, attributes: attributesJson, races: racesJson, classes: classesJson,
  ladder: ladderJson, magic: magicJson, economy: economyJson, progression: progressionJson,
});

/** The canonical data, validated and frozen. The default for every function's `data` argument. */
export const STATS_DATA: StatsData = statsData(STATS_SOURCE);
