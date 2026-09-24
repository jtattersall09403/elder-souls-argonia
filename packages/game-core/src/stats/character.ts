/**
 * Character creation (module 76 §119, §127): race + sex + class → the starting
 * attributes and skills. Pure; the caller owns the live character.
 */
import { STATS_DATA } from "./data";
import { SKILL_IDS, type AttributeId, type Attributes, type ClassDef, type RaceStats, type Sex, type SkillId, type StatsData } from "./types";

export function raceStats(raceId: string, data: StatsData = STATS_DATA): RaceStats {
  const race = data.races.races.find((r) => r.id === raceId);
  if (!race) throw new RangeError(`unknown race: ${raceId}`);
  return race;
}

export function classDef(classId: string, data: StatsData = STATS_DATA): ClassDef {
  const cls = data.classes.classes.find((c) => c.id === classId);
  if (!cls) throw new RangeError(`unknown class: ${classId}`);
  return cls;
}

export type SkillClassOf = "major" | "minor" | "misc";
export function skillClassOf(cls: ClassDef, skillId: SkillId): SkillClassOf {
  if (cls.majors.includes(skillId)) return "major";
  if (cls.minors.includes(skillId)) return "minor";
  return "misc";
}

export type StartingCharacter = {
  readonly race: string;
  readonly sex: Sex;
  readonly classId: string;
  readonly attributes: Attributes;
  readonly skills: Readonly<Record<SkillId, number>>;
};

/**
 * Race baselines for the sex, +10 to the class's two favoured attributes;
 * every skill starts at 5 + race bonus, +25 major / +10 minor, +5 in the
 * class's specialization (§119).
 */
export function startingCharacter(
  { race, sex, classId }: { race: string; sex: Sex; classId: string },
  data: StatsData = STATS_DATA,
): StartingCharacter {
  const r = raceStats(race, data);
  const cls = classDef(classId, data);
  const c = data.classes;
  const attributes = { ...r.attributes[sex] } as Record<AttributeId, number>;
  for (const a of cls.favouredAttributes) attributes[a] += c.favouredAttributeBonus;
  const skills = {} as Record<SkillId, number>;
  for (const id of SKILL_IDS) {
    const klass = skillClassOf(cls, id);
    skills[id] = c.startingSkill + (r.skillBonuses[id] ?? 0)
      + (klass === "major" ? c.majorBonus : klass === "minor" ? c.minorBonus : 0)
      + (data.skillById[id].spec === cls.specialization ? c.specializationBonus : 0);
  }
  return { race, sex, classId, attributes, skills };
}
