import { STATS_CATALOGUE } from "@elder-souls/text-catalogue/stats";

/** Catalogue lookup (standard 4). A missing id shows the id, which the lab test catches. */
export const t = (id: string): string => STATS_CATALOGUE.get(id)?.text ?? id;
const kebab = (id: string) => id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export const ui = (key: string) => t(`text.stats-lab.${key}`);
export const skillName = (id: string) => t(`text.stat.skill.${kebab(id)}`);
export const attributeName = (id: string) => t(`text.stat.attribute.${id}`);
export const raceName = (id: string) => t(`text.stat.race.${id}`);
export const className = (id: string) => t(`text.stat.class.${id}`);
export const bandName = (band: string) => t(`text.stats-lab.band-${band.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
export const invariantName = (id: string) => t(`text.stats-lab.invariant.${id}`);
