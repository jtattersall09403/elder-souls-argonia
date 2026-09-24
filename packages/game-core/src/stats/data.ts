import curvesJson from "./data/curves.json";
import skillsJson from "./data/skills.json";
import attributesJson from "./data/attributes.json";
import { ATTRIBUTE_IDS, SKILL_IDS, type AttributesTable, type Curves, type SkillDef, type SkillId, type SkillsTable, type StatsData } from "./types";

/** The data shape this code reads. Bump with the JSON when a shape changes incompatibly. */
export const STATS_SCHEMA_VERSION = 1;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Assemble and validate a data set. Pure: returns a new frozen object and
 * never touches the canonical copy. Throws on a schemaVersion this code does
 * not read, skills or attributes that are not exactly the canonical ids, or
 * an unknown attribute named by a skill.
 */
export function statsData(raw: { curves: unknown; skills: unknown; attributes: unknown }): StatsData {
  const curves = raw.curves as Curves;
  const skills = raw.skills as SkillsTable;
  const attributes = raw.attributes as AttributesTable;
  for (const [name, table] of [["curves", curves], ["skills", skills], ["attributes", attributes]] as const) {
    if (table?.schemaVersion !== STATS_SCHEMA_VERSION) {
      throw new RangeError(`stats ${name}: schemaVersion ${String(table?.schemaVersion)}, expected ${STATS_SCHEMA_VERSION}`);
    }
  }
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(skills.skills.map((s) => s.id), SKILL_IDS)) throw new RangeError("stats skills: not the 27 skills in SKILL_IDS order");
  if (!same(attributes.attributes.map((a) => a.id), ATTRIBUTE_IDS)) throw new RangeError("stats attributes: not the 7 in ATTRIBUTE_IDS order");
  const attrIds: readonly string[] = ATTRIBUTE_IDS;
  for (const s of skills.skills) {
    if (!attrIds.includes(s.gov) || (s.score !== undefined && !attrIds.includes(s.score))) {
      throw new RangeError(`stats skills: ${s.id} names an unknown attribute`);
    }
  }
  if (!ATTRIBUTE_IDS.every((a) => typeof attributes.reference?.[a] === "number")) {
    throw new RangeError("stats attributes: reference is not a full attribute set");
  }
  const skillById = Object.fromEntries(skills.skills.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
  return deepFreeze(structuredClone({ curves, skills, attributes, skillById }));
}

/** The canonical data (module 76 §129), frozen. The default for every function's `data` argument. */
export const STATS_DATA: StatsData = statsData({ curves: curvesJson, skills: skillsJson, attributes: attributesJson });
